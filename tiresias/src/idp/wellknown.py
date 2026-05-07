"""
OIDC well-known discovery document fetcher and cache.
"""
import time
import structlog
from typing import Optional

import httpx

logger = structlog.get_logger(__name__)

# Cache: url -> (doc, fetched_at)
_discovery_cache: dict[str, tuple[dict, float]] = {}
_DEFAULT_CACHE_TTL = 3600  # 1 hour


async def fetch_and_cache_discovery(url: str, ttl: int = _DEFAULT_CACHE_TTL) -> dict:
    """Fetch and cache an OIDC discovery document."""
    now = time.monotonic()
    cached = _discovery_cache.get(url)
    if cached:
        doc, fetched_at = cached
        if now - fetched_at < ttl:
            return doc

    logger.info("wellknown.fetching", url=url)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        doc = resp.json()

    _discovery_cache[url] = (doc, now)
    return doc


def invalidate_discovery_cache(url: Optional[str] = None) -> None:
    """Invalidate cache for a URL or all entries."""
    if url:
        _discovery_cache.pop(url, None)
    else:
        _discovery_cache.clear()


async def test_idp_connection(discovery_url: str, client_id: str) -> dict:
    """
    Test an IdP connection by fetching its discovery doc and verifying
    the client_id is acceptable (MVP: just checks doc fetches OK).
    Returns a status dict.
    """
    try:
        doc = await fetch_and_cache_discovery(discovery_url, ttl=0)  # force refresh
        return {
            "status": "ok",
            "issuer": doc.get("issuer"),
            "authorization_endpoint": doc.get("authorization_endpoint"),
            "token_endpoint": doc.get("token_endpoint"),
            "jwks_uri": doc.get("jwks_uri"),
            "client_id_provided": client_id,
        }
    except httpx.HTTPError as e:
        return {"status": "error", "error": str(e)}
    except Exception as e:
        return {"status": "error", "error": f"Unexpected: {e}"}
