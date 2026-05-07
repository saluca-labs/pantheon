"""
OIDC Provider loader — loads IdP configs from DB and manages JWKS cache.
"""

import time
import structlog
from typing import Optional
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulIdPConfig

logger = structlog.get_logger(__name__)


# In-memory JWKS cache: key = issuer URL, value = (jwks_dict, fetched_at_epoch)
_jwks_cache: dict[str, tuple[dict, float]] = {}


async def load_idp_config(
    db: AsyncSession,
    tenant_id: UUID,
    provider_type: Optional[str] = None,
    idp_config_id: Optional[UUID] = None,
) -> Optional[SoulIdPConfig]:
    """Load a single IdP config for a tenant, by provider type or ID."""
    query = select(SoulIdPConfig).where(
        SoulIdPConfig.tenant_id == tenant_id,
        SoulIdPConfig.status == "active",
    )
    if idp_config_id:
        query = query.where(SoulIdPConfig.id == idp_config_id)
    elif provider_type:
        query = query.where(SoulIdPConfig.provider_type == provider_type)
    else:
        # Default: pick the is_default config
        query = query.where(SoulIdPConfig.is_default.is_(True))

    result = await db.execute(query)
    return result.scalar_one_or_none()


async def load_idp_config_by_domain(
    db: AsyncSession,
    domain: str,
) -> Optional[SoulIdPConfig]:
    """Load IdP config by email domain hint (used in domain resolution)."""
    result = await db.execute(
        select(SoulIdPConfig).where(
            SoulIdPConfig.domain_hint == domain,
            SoulIdPConfig.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def fetch_discovery_document(discovery_url: str) -> dict:
    """Fetch the OIDC discovery document from the given URL."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(discovery_url)
        resp.raise_for_status()
        return resp.json()


async def get_jwks(
    jwks_uri: str,
    cache_ttl: int = 3600,
) -> dict:
    """
    Fetch and cache JWKS from the given URI.
    Returns raw JWKS dict ({"keys": [...]}).
    """
    now = time.monotonic()
    cached = _jwks_cache.get(jwks_uri)
    if cached:
        jwks, fetched_at = cached
        if now - fetched_at < cache_ttl:
            return jwks

    logger.info("oidc_provider.fetching_jwks", jwks_uri=jwks_uri)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(jwks_uri)
        resp.raise_for_status()
        jwks = resp.json()

    _jwks_cache[jwks_uri] = (jwks, now)
    return jwks


def invalidate_jwks_cache(jwks_uri: Optional[str] = None) -> None:
    """Invalidate JWKS cache for a specific URI, or entirely."""
    if jwks_uri:
        _jwks_cache.pop(jwks_uri, None)
    else:
        _jwks_cache.clear()
