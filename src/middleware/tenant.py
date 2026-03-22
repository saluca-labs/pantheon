"""
Tenant context middleware.
Implements SPEC.md section 8 — multi-tenant namespace isolation.
Extracts tenant context from request headers or soulkey identity,
and injects TenantContext into request.state.
"""

import uuid
from typing import Optional

import structlog
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulTenant

logger = structlog.get_logger(__name__)


class TenantContext:
    """Tenant context injected into request.state by middleware."""

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
    "/v1/auth/oidc/",
]


def _is_tenant_exempt(path: str) -> bool:
    """Check if a path is exempt from tenant context."""
    for exempt in TENANT_EXEMPT_PATHS:
        if exempt.endswith("/"):
            if path.startswith(exempt) or path.startswith(exempt.rstrip("/")):
                return True
        elif path == exempt or path.rstrip("/") == exempt:
            return True
    return False


class TenantContextMiddleware(BaseHTTPMiddleware):
    """
    Extracts tenant context from X-Tenant-ID header or soulkey resolution.
    Injects TenantContext into request.state for downstream handlers.

    For admin endpoints, X-Tenant-ID header is used.
    For auth endpoints, tenant is resolved from the soulkey.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        # Skip tenant resolution for exempt paths
        if _is_tenant_exempt(path):
            return await call_next(request)

        # Extract tenant ID from header if present
        tenant_id_header = request.headers.get("X-Tenant-ID")
        if tenant_id_header:
            try:
                tenant_id = uuid.UUID(tenant_id_header)
            except ValueError:
                raise HTTPException(
                    status_code=400, detail="Invalid X-Tenant-ID format"
                )

            # For now, create a lightweight context from the header
            # Full resolution happens when needed by specific endpoints
            request.state.tenant_context = TenantContext(
                tenant_id=tenant_id,
                tenant_slug="",  # Resolved lazily
                tenant_name="",
                tier="",
                status="active",
            )

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


async def create_tenant(
    db: AsyncSession,
    name: str,
    slug: str,
    tier: str = "free",
    metadata: Optional[dict] = None,
) -> SoulTenant:
    """Create a new tenant."""
    tenant = SoulTenant(
        name=name,
        slug=slug,
        tier=tier,
        status="active",
        metadata_=metadata or {},
    )
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)
    return tenant


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
