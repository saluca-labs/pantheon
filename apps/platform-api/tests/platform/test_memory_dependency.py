"""Tests for src.platform.memory dependency wiring.

We don't speak to a live memory-service here; we only verify the
dependency contract:

  * 503 when no client is on app.state
  * returns the client when one is present
  * shutdown clears app.state and closes the client

A real httpx round-trip is exercised in the integration smoke tests.
"""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from src.platform.memory import (
    get_memory_client,
    shutdown_memory_client,
)


class _StubMemoryClient:
    """Minimal stand-in matching the surface the dependency touches."""

    def __init__(self) -> None:
        self.closed = False

    async def aclose(self) -> None:
        self.closed = True


def test_get_memory_client_returns_503_when_uninitialised() -> None:
    app = FastAPI()

    @app.get("/probe")
    async def probe(client=Depends(get_memory_client)) -> dict:  # type: ignore[no-untyped-def]
        return {"ok": True}

    response = TestClient(app).get("/probe")
    assert response.status_code == 503
    assert response.json()["detail"] == "memory-service client not initialised"


def test_get_memory_client_returns_attached_client() -> None:
    app = FastAPI()
    stub = _StubMemoryClient()
    app.state.memory = stub

    @app.get("/probe")
    async def probe(client=Depends(get_memory_client)) -> dict:  # type: ignore[no-untyped-def]
        return {"id": id(client)}

    response = TestClient(app).get("/probe")
    assert response.status_code == 200
    assert response.json()["id"] == id(stub)


@pytest.mark.asyncio
async def test_shutdown_memory_client_clears_state_and_closes() -> None:
    app = FastAPI()
    stub = _StubMemoryClient()
    app.state.memory = stub

    await shutdown_memory_client(app)

    assert stub.closed is True
    assert app.state.memory is None


@pytest.mark.asyncio
async def test_shutdown_memory_client_is_noop_when_unset() -> None:
    app = FastAPI()
    # No app.state.memory set
    await shutdown_memory_client(app)  # must not raise
    assert getattr(app.state, "memory", None) is None
