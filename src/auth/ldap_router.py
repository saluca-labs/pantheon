"""
LDAP/Active Directory authentication router.
Authenticates users against an LDAP directory (e.g., Samba AD, Active Directory).
"""

import json
import uuid

import structlog
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SoulUser, SoulTenant
from src.auth.oidc_session import create_session
from src.auth.rbac import require_permission
from src.auth.rate_limit import login_rate_limiter
from config.settings import get_settings

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/v1/auth/ldap", tags=["ldap-auth"])
settings = get_settings()


class LDAPLoginRequest(BaseModel):
    username: str = Field(..., description="LDAP username (sAMAccountName)")
    password: str = Field(..., min_length=1, description="LDAP password")
    tenant_id: str | None = Field(None, description="Tenant ID (optional)")


class LDAPLoginResponse(BaseModel):
    session_token: str
    user_id: str
    tenant_id: str
    email: str | None
    display_name: str | None
    admin_role: str
    expires_in: int
    groups: list[str]


def _parse_group_role_map() -> dict[str, str]:
    """Parse the JSON group-to-role mapping from settings."""
    if not settings.ldap_group_role_map:
        return {}
    try:
        return json.loads(settings.ldap_group_role_map)
    except (json.JSONDecodeError, TypeError):
        logger.warning("ldap_auth.invalid_group_role_map")
        return {}


def _resolve_role_from_groups(groups: list[str], group_role_map: dict[str, str]) -> str:
    """Map LDAP group memberships to the highest SoulAuth role."""
    role_rank = {"viewer": 0, "operator": 1, "admin": 2, "owner": 3}
    best_role = "viewer"
    best_rank = 0

    for group_dn in groups:
        # Match by full DN or by CN
        cn = group_dn.split(",")[0].replace("CN=", "").replace("cn=", "") if "," in group_dn else group_dn
        for pattern, role in group_role_map.items():
            if pattern.lower() in group_dn.lower() or pattern.lower() == cn.lower():
                rank = role_rank.get(role, 0)
                if rank > best_rank:
                    best_role = role
                    best_rank = rank

    return best_role


async def _ldap_authenticate(username: str, password: str) -> dict | None:
    """
    Authenticate against LDAP.
    Returns user info dict or None if auth fails.
    """
    try:
        from ldap3 import Server, Connection, ALL, SUBTREE, Tls
        import ssl
    except ImportError:
        logger.error("ldap_auth.ldap3_not_installed")
        raise HTTPException(status_code=500, detail="LDAP support not available (ldap3 not installed)")

    if not settings.ldap_url:
        raise HTTPException(status_code=500, detail="LDAP not configured (SOULAUTH_LDAP_URL not set)")

    tls_config = Tls(validate=ssl.CERT_NONE) if settings.ldap_url.startswith("ldaps") else None
    use_ssl = settings.ldap_url.startswith("ldaps")
    server = Server(settings.ldap_url, get_info=ALL, use_ssl=use_ssl, tls=tls_config)

    # Step 1: Bind as service account to search for the user
    try:
        svc_conn = Connection(
            server,
            user=settings.ldap_bind_dn,
            password=settings.ldap_bind_password,
            auto_bind=True,
            read_only=True,
        )
    except Exception as e:
        logger.error("ldap_auth.service_bind_failed", error=str(e))
        raise HTTPException(status_code=500, detail="LDAP service account bind failed")

    # Step 2: Search for the user
    search_filter = settings.ldap_user_filter.format(username=username)
    search_base = settings.ldap_search_base or ""

    svc_conn.search(
        search_base=search_base,
        search_filter=search_filter,
        search_scope=SUBTREE,
        attributes=["dn", "cn", "mail", "displayName", "sAMAccountName",
                     "employeeID", "department", "title", settings.ldap_group_attribute],
    )

    if not svc_conn.entries:
        svc_conn.unbind()
        return None

    user_entry = svc_conn.entries[0]
    user_dn = str(user_entry.entry_dn)
    svc_conn.unbind()

    # Step 3: Re-bind as the user to verify password
    try:
        user_conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        user_conn.unbind()
    except Exception:
        return None  # Bad password

    # Step 4: Extract user attributes
    groups = []
    group_attr = getattr(user_entry, settings.ldap_group_attribute, None)
    if group_attr:
        groups = list(group_attr.values) if hasattr(group_attr, 'values') else [str(group_attr)]

    return {
        "dn": user_dn,
        "username": str(getattr(user_entry, "sAMAccountName", username)),
        "email": str(getattr(user_entry, "mail", "")) or None,
        "display_name": str(getattr(user_entry, "displayName", "")) or str(getattr(user_entry, "cn", username)),
        "employee_id": str(getattr(user_entry, "employeeID", "")) or None,
        "department": str(getattr(user_entry, "department", "")) or None,
        "title": str(getattr(user_entry, "title", "")) or None,
        "groups": groups,
    }


@router.post("/login", response_model=LDAPLoginResponse)
async def ldap_login(request: LDAPLoginRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    """
    Authenticate with LDAP username and password.
    JIT provisions the user in SoulAuth on first login.
    """
    if "ldap" not in settings.auth_mode.split(","):
        raise HTTPException(status_code=404, detail="LDAP auth is not enabled")

    # Rate limit check
    allowed, retry_after = login_rate_limiter.check(request.username)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    # LDAP authenticate
    ldap_user = await _ldap_authenticate(request.username, request.password)
    if not ldap_user:
        login_rate_limiter.record_failure(request.username)
        logger.warning("ldap_auth.login_failed", username=request.username)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    login_rate_limiter.record_success(request.username)

    # Resolve role from groups
    group_role_map = _parse_group_role_map()
    role = _resolve_role_from_groups(ldap_user["groups"], group_role_map)

    # Resolve tenant
    tenant_id = request.tenant_id
    if not tenant_id:
        # Default to first MSSP tenant or first available
        result = await db.execute(select(SoulTenant).where(SoulTenant.tier == "mssp").limit(1))
        tenant = result.scalar_one_or_none()
        if not tenant:
            result = await db.execute(select(SoulTenant).limit(1))
            tenant = result.scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=500, detail="No tenants configured")
        tenant_id = str(tenant.id)

    # JIT provision or update user
    result = await db.execute(
        select(SoulUser).where(
            SoulUser.idp_provider == "ldap",
            SoulUser.idp_sub == ldap_user["dn"],
            SoulUser.tenant_id == tenant_id,
        )
    )
    user = result.scalar_one_or_none()

    if user:
        # Update on login
        user.last_login = datetime.now(timezone.utc)
        user.admin_role = role
        if ldap_user["display_name"]:
            user.display_name = ldap_user["display_name"]
        if ldap_user["email"]:
            user.email = ldap_user["email"]
        if user.status != "active":
            raise HTTPException(status_code=403, detail="Account is suspended or deactivated")
    else:
        # Create new user (JIT provisioning)
        user = SoulUser(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            email=ldap_user["email"],
            display_name=ldap_user["display_name"],
            auth_provider="ldap",
            admin_role=role,
            status="active",
            idp_provider="ldap",
            idp_sub=ldap_user["dn"],
            last_login=datetime.now(timezone.utc),
            metadata_=json.dumps({
                "employee_id": ldap_user.get("employee_id"),
                "department": ldap_user.get("department"),
                "title": ldap_user.get("title"),
                "ldap_groups": ldap_user["groups"],
            }),
        )
        db.add(user)
        logger.info("ldap_auth.user_provisioned", username=request.username, dn=ldap_user["dn"], role=role)

    await db.commit()

    # Create session
    ip = http_request.client.host if http_request.client else None
    ua = http_request.headers.get("user-agent", "")
    raw_token, session = await create_session(db, user, ip, ua)
    await db.commit()

    logger.info("ldap_auth.login_success", username=request.username, role=role, groups_count=len(ldap_user["groups"]))

    return LDAPLoginResponse(
        session_token=raw_token,
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        email=user.email,
        display_name=user.display_name,
        admin_role=role,
        expires_in=settings.oidc_session_ttl,
        groups=ldap_user["groups"],
    )


@router.get("/groups")
async def list_ldap_groups(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("keys:read")),
):
    """List available LDAP groups for role mapping configuration. Requires operator+ role."""
    try:
        from ldap3 import Server, Connection, ALL, SUBTREE
    except ImportError:
        raise HTTPException(status_code=500, detail="ldap3 not installed")

    tls_config = Tls(validate=ssl.CERT_NONE) if settings.ldap_url.startswith("ldaps") else None
    use_ssl = settings.ldap_url.startswith("ldaps")
    server = Server(settings.ldap_url, get_info=ALL, use_ssl=use_ssl, tls=tls_config)
    conn = Connection(server, user=settings.ldap_bind_dn, password=settings.ldap_bind_password, auto_bind=True, read_only=True)

    conn.search(
        search_base=settings.ldap_search_base or "",
        search_filter="(objectClass=group)",
        search_scope=SUBTREE,
        attributes=["cn", "description", "member"],
    )

    groups = []
    for entry in conn.entries:
        members = getattr(entry, "member", [])
        member_count = len(members.values) if hasattr(members, 'values') else 0
        groups.append({
            "dn": str(entry.entry_dn),
            "cn": str(entry.cn),
            "description": str(getattr(entry, "description", "")),
            "member_count": member_count,
        })

    conn.unbind()
    return {"groups": groups, "total": len(groups)}
