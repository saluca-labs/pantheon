"""
Tenant context middleware.
Implements SPEC.md section 8 — multi-tenant namespace isolation.
Extracts tenant context from request headers or soulkey identity,
and injects TenantContext into request.state.
"""

import uuid
from typing import Optional

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulTenant
from src.tier import DEFAULT_TIER

logger = structlog.get_logger(__name__)


class TenantContext:
    """Tenant context injected into request.state by middleware.

    Uses a lazy resolution pattern: the middleware only populates tenant_id
    and status from the X-Tenant-ID header. The remaining fields (slug,
    name, tier) are left empty and resolved on demand by calling
    resolve_tenant() when a specific endpoint needs them. This avoids a
    DB round-trip on every request. TenantContextMiddleware is the
    middleware that performs initial injection.
    """

    def __init__(
        self,
        tenant_id: uuid.UUID,
        tenant_slug: str,
        tenant_name: str,
        tier: str,
        status: str,
    ):
        self.tenant_id = tenant_id
        self.tenant_slug = tenant_slug
        self.tenant_name = tenant_name
        self.tier = tier
        self.status = status


# Paths that bypass tenant context entirely
TENANT_EXEMPT_PATHS = [
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/",
    "/v1/trial/register",
    "/v1/trial/verify",
    "/v1/waitlist/join",
]


def _is_tenant_exempt(path: str) -> bool:
    """Check if a path is exempt from tenant context."""
    for exempt in TENANT_EXEMPT_PATHS:
        if path == exempt or path.rstrip("/") == exempt:
            return True
    return False


class TenantContextMiddleware(BaseHTTPMiddleware):
    """
    Extracts tenant context from X-Tenant-ID header or soulkey resolution.
    Injects TenantContext into request.state for downstream handlers.

    For admin endpoints, X-Tenant-ID header is used.
    For auth endpoints (e.g. portal-session-fronted /v1/prh, /v1/mssp), the
    tenant is resolved from the SoulKey carried in X-SoulKey or
    Authorization: Bearer when no explicit X-Tenant-ID is present.

    Sets BOTH ``request.state.tenant_context`` and ``request.state.tenant``;
    different consumers historically read one or the other (PRH router and
    PRHMiddleware look up ``request.state.tenant``), so we publish under both
    names to avoid 401s on SoulKey-authenticated requests that omit the
    explicit X-Tenant-ID header.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        # Skip tenant resolution for exempt paths
        if _is_tenant_exempt(path):
            return await call_next(request)

        tenant_ctx: Optional[TenantContext] = None

        # Extract tenant ID from header if present
        tenant_id_header = request.headers.get("X-Tenant-ID")
        if tenant_id_header:
            try:
                tenant_id = uuid.UUID(tenant_id_header)
            except ValueError:
                return JSONResponse(
                    status_code=400, content={"detail": "Invalid X-Tenant-ID format"}
                )

            # For now, create a lightweight context from the header
            # Full resolution happens when needed by specific endpoints
            tenant_ctx = TenantContext(
                tenant_id=tenant_id,
                tenant_slug="",  # Resolved lazily
                tenant_name="",
                tier="",
                status="active",
            )
        else:
            # No explicit X-Tenant-ID — fall back to resolving the tenant from
            # the SoulKey. Portal sessions (cookie -> proxy -> X-SoulKey on the
            # backend) don't carry the tenant header, so without this fallback
            # endpoints like /v1/prh/* and /v1/mssp/* would 401/403 even for
            # the seeded admin. Best-effort: silently skip on any DB / lookup
            # failure so we never make this middleware itself a hard dependency
            # for endpoints that don't actually need tenant context.
            soulkey_header = request.headers.get(
                "X-SoulKey"
            ) or request.headers.get("X-Soulkey")
            authz = request.headers.get("Authorization", "")
            if not soulkey_header and authz.startswith("Bearer "):
                soulkey_header = authz[len("Bearer ") :]

            if soulkey_header:
                try:
                    from src.database.connection import async_session_factory
                    from src.auth.oidc_session import validate_session
                    from src.auth.soulkey import resolve_identity

                    resolved_tenant_id: Optional[uuid.UUID] = None
                    async with async_session_factory() as session:
                        # Portal sessions (most callers) verify via SoulOIDCSession.
                        sess_result = await validate_session(session, soulkey_header)
                        if sess_result is not None:
                            _sess, user = sess_result
                            resolved_tenant_id = user.tenant_id
                        else:
                            # Agent SoulKeys verify via _soulkeys.
                            soulkey = await resolve_identity(session, soulkey_header)
                            if soulkey is not None:
                                resolved_tenant_id = soulkey.tenant_id

                    if resolved_tenant_id is not None:
                        tenant_ctx = TenantContext(
                            tenant_id=resolved_tenant_id,
                            tenant_slug="",
                            tenant_name="",
                            tier="",
                            status="active",
                        )
                except Exception as exc:  # pragma: no cover - defensive
                    logger.debug(
                        "tenant_middleware.bearer_lookup_failed",
                        error=str(exc),
                        path=path,
                    )

        if tenant_ctx is not None:
            request.state.tenant_context = tenant_ctx
            # PRH router and PRHMiddleware read request.state.tenant; alias it.
            request.state.tenant = tenant_ctx

        response = await call_next(request)
        return response


async def resolve_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Optional[SoulTenant]:
    """Resolve a tenant by ID."""
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    return result.scalar_one_or_none()


async def resolve_tenant_by_slug(db: AsyncSession, slug: str) -> Optional[SoulTenant]:
    """Resolve a tenant by slug."""
    result = await db.execute(select(SoulTenant).where(SoulTenant.slug == slug))
    return result.scalar_one_or_none()


# create_tenant() and update_tenant_status() live in this middleware module
# (rather than a separate service layer) for convenience co-location with
# TenantContext and the resolve_* helpers. All tenant CRUD shares the same
# import surface, keeping the call-sites simple.
async def create_tenant(
    db: AsyncSession,
    name: str,
    slug: str,
    tier: str = DEFAULT_TIER,
    metadata: Optional[dict] = None,
    parent_tenant_id: Optional[uuid.UUID] = None,
    hierarchy_depth: int = 0,
) -> SoulTenant:
    """Create a new tenant, optionally as a child of parent_tenant_id."""
    tenant = SoulTenant(
        name=name,
        slug=slug,
        tier=tier,
        status="active",
        parent_tenant_id=parent_tenant_id,
        hierarchy_depth=hierarchy_depth,
        metadata_=metadata or {},
    )
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)
    return tenant


async def provision_tenant_encryption(
    db: AsyncSession,
    tenant_id: str,
    tier: str = DEFAULT_TIER,
) -> None:
    """
    Eagerly create tiresias_licenses row and generate wrapped DEK for a new tenant.
    Called after create_tenant() to ensure encryption is ready before first proxy request.
    """
    try:
        from src.tiresias.encryption.providers import resolve_kek_provider
        from src.tiresias.encryption.envelope import EnvelopeEncryption
        from src.tiresias.config import TiresiasSettings

        t_settings = TiresiasSettings()
        provider = resolve_kek_provider(t_settings)
        envelope = EnvelopeEncryption(provider)
        await envelope.create_dek_for_tenant(tenant_id, db)
        logger.info("tenant.dek_provisioned", tenant_id=tenant_id)
    except Exception as e:
        # Non-fatal: DEK will be created lazily on first proxy request
        logger.warning("tenant.dek_provision_failed", tenant_id=tenant_id, error=str(e))


async def update_tenant_status(
    db: AsyncSession, tenant_id: uuid.UUID, status: str
) -> Optional[SoulTenant]:
    """Update tenant status (active, suspended, deactivated)."""
    from sqlalchemy import update
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return None

    await db.execute(
        update(SoulTenant).where(SoulTenant.id == tenant_id).values(status=status)
    )
    tenant.status = status
    return tenant


async def list_tenants(
    db: AsyncSession,
    status: Optional[str] = None,
    tier: Optional[str] = None,
) -> list[SoulTenant]:
    """List tenants with optional filters."""
    query = select(SoulTenant)
    if status:
        query = query.where(SoulTenant.status == status)
    if tier:
        query = query.where(SoulTenant.tier == tier)
    query = query.order_by(SoulTenant.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())
