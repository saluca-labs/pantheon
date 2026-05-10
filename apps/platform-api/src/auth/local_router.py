"""
Local username/password authentication router.
Provides login, registration, and password change endpoints.
"""

import uuid

import bcrypt
import structlog
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SoulUser, SoulTenant
from src.auth.oidc_session import create_session, validate_session
from src.auth.rbac import require_permission
from config.settings import get_settings
from src.auth.rate_limit import login_rate_limiter

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/v1/auth/local", tags=["local-auth"])
settings = get_settings()


class LoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=1, description="User password")
    tenant_id: str | None = Field(None, description="Tenant ID (optional, resolved from email if not provided)")


class LoginResponse(BaseModel):
    session_token: str
    user_id: str
    tenant_id: str
    email: str
    display_name: str | None
    admin_role: str
    expires_in: int
    # Tenant tier + display name fetched from the DB at login so the portal's
    # /api/auth/login route can write a fresh session cookie with current tier
    # data, fixing the defect-4 stale-cookie tenant flip after a tier upgrade.
    tier: str | None = None
    tenant_name: str | None = None


class RegisterRequest(BaseModel):
    email: str = Field(..., description="User email")
    password: str = Field(..., min_length=8, description="Password (min 8 chars)")
    display_name: str | None = None
    tenant_id: str
    admin_role: str = Field(default="viewer", description="Role: viewer, operator, admin, owner")


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


def _hash_password(password: str) -> str:
    """Hash password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify password against bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


@router.get("/session/verify")
async def verify_session(http_request: Request, db: AsyncSession = Depends(get_db)):
    """Verify a session token (works for both local and OIDC sessions)."""
    auth_header = http_request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return {"valid": False, "reason": "No session token"}
    raw_token = auth_header[7:]
    result = await validate_session(db, raw_token)
    if not result:
        return {"valid": False, "reason": "Invalid or expired session"}
    _s, user = result
    return {
        "valid": True,
        "user_id": str(user.id),
        "tenant_id": str(user.tenant_id),
        "email": user.email,
        "admin_role": user.admin_role,
    }


@router.post("/login", response_model=LoginResponse)
async def local_login(request: LoginRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    """
    Authenticate with email and password.
    Returns a session token (same format as OIDC sessions).
    """
    if "local" not in settings.auth_mode.split(","):
        raise HTTPException(status_code=404, detail="Local auth is not enabled")

    # Rate limit check
    allowed, retry_after = login_rate_limiter.check(request.email)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    # Find user by email
    query = select(SoulUser).where(
        SoulUser.email == request.email,
        SoulUser.auth_provider.contains('local'),
        SoulUser.status == "active",
    )
    if request.tenant_id:
        query = query.where(SoulUser.tenant_id == request.tenant_id)

    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        login_rate_limiter.record_failure(request.email)
        logger.warning("local_auth.login_failed", email=request.email, reason="user_not_found")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not _verify_password(request.password, user.password_hash):
        login_rate_limiter.record_failure(request.email)
        logger.warning("local_auth.login_failed", email=request.email, reason="bad_password")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    login_rate_limiter.record_success(request.email)

    # Create session (reuse OIDC session infrastructure)
    ip = http_request.client.host if http_request.client else None
    ua = http_request.headers.get("user-agent", "")
    raw_token, session = await create_session(db, user, ip, ua)
    await db.commit()

    # Resolve tenant tier + name so the portal cookie can be primed with
    # current values at login time (see LoginResponse.tier comment).
    tenant_result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == user.tenant_id)
    )
    tenant_row = tenant_result.scalar_one_or_none()

    logger.info("local_auth.login_success", email=request.email, user_id=str(user.id))

    return LoginResponse(
        session_token=raw_token,
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        email=user.email,
        display_name=user.display_name,
        admin_role=user.admin_role or "viewer",
        expires_in=settings.oidc_session_ttl,
        tier=tenant_row.tier if tenant_row else None,
        tenant_name=tenant_row.name if tenant_row else None,
    )


@router.post("/register", response_model=dict)
async def register_user(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("keys:create")),
):
    """
    Register a new local user. Requires admin permission.
    """
    if "local" not in settings.auth_mode.split(","):
        raise HTTPException(status_code=404, detail="Local auth is not enabled")

    # Check tenant exists
    tenant = await db.execute(select(SoulTenant).where(SoulTenant.id == request.tenant_id))
    if not tenant.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Check user doesn't already exist
    existing = await db.execute(
        select(SoulUser).where(
            SoulUser.email == request.email,
            SoulUser.tenant_id == request.tenant_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User already exists")

    # Create user
    user = SoulUser(
        id=uuid.uuid4(),
        tenant_id=request.tenant_id,
        email=request.email,
        display_name=request.display_name or request.email.split("@")[0],
        password_hash=_hash_password(request.password),
        auth_provider="local",
        admin_role=request.admin_role,
        status="active",
        idp_provider="local",
        idp_sub=request.email,
    )
    db.add(user)
    await db.commit()

    logger.info("local_auth.user_registered", email=request.email, tenant_id=request.tenant_id)

    return {"status": "created", "user_id": str(user.id), "email": request.email}


@router.put("/password")
async def change_password(
    request: ChangePasswordRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Change password for the authenticated user.
    Requires a valid session token in Authorization header.
    """
    auth_header = http_request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Session token required")

    raw_token = auth_header[7:]
    result = await validate_session(db, raw_token)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid session")

    session, user = result

    if not user.password_hash:
        raise HTTPException(status_code=400, detail="User does not use local auth")

    if not _verify_password(request.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    user.password_hash = _hash_password(request.new_password)
    await db.commit()

    logger.info("local_auth.password_changed", user_id=str(user.id))
    return {"status": "password_changed"}
