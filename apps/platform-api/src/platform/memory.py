"""Shared MemoryClient wiring for platform-api.

The memory-service runs as a Fastify HTTP sidecar (apps/memory-service)
that wraps @platform/memory. Backend services consume it via the
async ``platform_memory_client.MemoryClient``.

This module exposes the client as a FastAPI dependency, sharing one
``httpx.AsyncClient`` connection pool per process and reading config
from environment via ``MemoryClient.from_env()``.

Lifecycle is driven by ``init_memory_client``/``shutdown_memory_client``
helpers which the FastAPI lifespan should call. The dependency
``get_memory_client`` reads the live instance from ``app.state.memory``;
endpoints requesting it without an initialised client get HTTP 503.
"""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, Request, status

from platform_memory_client import MemoryClient


async def init_memory_client(app) -> MemoryClient:
    """Construct + warm the shared MemoryClient and attach to app.state.

    Returns the live client so the caller can include it in any local
    bookkeeping. Idempotent — calling twice returns the existing client.
    """
    existing: Optional[MemoryClient] = getattr(app.state, "memory", None)
    if existing is not None:
        return existing

    client = MemoryClient.from_env()
    # Warm the underlying httpx pool so first-request latency is bounded.
    await client._http()  # noqa: SLF001 — internal API, but stable.
    app.state.memory = client
    return client


async def shutdown_memory_client(app) -> None:
    """Close the shared MemoryClient if one was attached to app.state."""
    client: Optional[MemoryClient] = getattr(app.state, "memory", None)
    if client is None:
        return
    try:
        await client.aclose()
    finally:
        app.state.memory = None


async def get_memory_client(request: Request) -> MemoryClient:
    """FastAPI dependency returning the shared MemoryClient.

    Raises 503 if the lifespan never called ``init_memory_client`` —
    this is a configuration error, not a request-level failure.
    """
    client: Optional[MemoryClient] = getattr(request.app.state, "memory", None)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="memory-service client not initialised",
        )
    return client
