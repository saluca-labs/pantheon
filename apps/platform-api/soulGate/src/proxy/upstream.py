"""
Upstream service registry.
Loads and caches upstream service definitions from the database.
"""

import uuid
from typing import Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.src.database.models import SoulGateUpstream

logger = structlog.get_logger(__name__)

# In-memory upstream cache: name -> SoulGateUpstream.
# Invalidation strategy: the cache is fully rebuilt on each call to
# load_upstreams() (triggered at startup and on admin CRUD operations).
# Individual entries are updated inline by register_upstream() and
# removed by remove_upstream(). There is no TTL -- the cache lives for
# the lifetime of the process and is authoritative after the last load.
_upstream_cache: dict[str, SoulGateUpstream] = {}


async def load_upstreams(db: AsyncSession) -> int:
    """Load all active upstreams from DB into cache. Returns count loaded."""
    global _upstream_cache
    result = await db.execute(
        select(SoulGateUpstream).where(SoulGateUpstream.status == "active")
    )
    upstreams = result.scalars().all()
    _upstream_cache = {u.name: u for u in upstreams}
    logger.info("upstream.loaded", count=len(_upstream_cache))
    return len(_upstream_cache)


def get_upstream(name: str) -> Optional[SoulGateUpstream]:
    """Get upstream by name from cache."""
    return _upstream_cache.get(name)


def list_upstreams() -> list[SoulGateUpstream]:
    """List all cached upstreams."""
    return list(_upstream_cache.values())


async def register_upstream(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    name: str,
    base_url: str,
    health_endpoint: str = "/health",
    timeout_ms: int = 30000,
    retries: int = 1,
    strip_prefix: bool = True,
    circuit_breaker_enabled: bool = True,
) -> SoulGateUpstream:
    """Register a new upstream service."""
    upstream = SoulGateUpstream(
        tenant_id=tenant_id,
        name=name,
        base_url=base_url,
        health_endpoint=health_endpoint,
        timeout_ms=timeout_ms,
        retries=retries,
        strip_prefix=strip_prefix,
        circuit_breaker_enabled=circuit_breaker_enabled,
    )
    db.add(upstream)
    await db.flush()
    await db.refresh(upstream)

    # Update cache
    _upstream_cache[name] = upstream
    logger.info("upstream.registered", name=name, base_url=base_url)
    return upstream


async def remove_upstream(db: AsyncSession, name: str) -> bool:
    """Mark upstream as disabled and remove from cache."""
    upstream = _upstream_cache.get(name)
    if not upstream:
        return False
    upstream.status = "disabled"
    db.add(upstream)
    _upstream_cache.pop(name, None)
    logger.info("upstream.removed", name=name)
    return True
