"""Tests for src.platform.health_router (aggregated readiness probe).

We patch the DB and memory dependencies to exercise the matrix of
ready/not-ready outcomes without booting the real soulauth stack.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

import src.platform.health_router as health_module


class _FakeResp:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


class _FakeHttp:
    def __init__(self, status_code: int = 200, raise_exc: Exception | None = None) -> None:
        self._status_code = status_code
        self._raise_exc = raise_exc

    async def get(self, path: str) -> _FakeResp:
        if self._raise_exc is not None:
            raise self._raise_exc
        return _FakeResp(self._status_code)


class _FakeMemoryClient:
    def __init__(self, status_code: int = 200, raise_exc: Exception | None = None) -> None:
        self._http_obj = _FakeHttp(status_code=status_code, raise_exc=raise_exc)

    async def _http(self) -> _FakeHttp:
        return self._http_obj


def _app_with(memory: _FakeMemoryClient | None) -> FastAPI:
    app = FastAPI()
    app.include_router(health_module.router)
    if memory is not None:
        app.state.memory = memory
    return app


def test_full_health_all_ready(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    async def _ok_db() -> dict:
        return {"status": "ready", "latency_ms": 1.0}

    monkeypatch.setattr(health_module, "_check_db", _ok_db)
    app = _app_with(_FakeMemoryClient(status_code=200))

    response = TestClient(app).get("/v1/health/full")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["components"]["database"]["status"] == "ready"
    assert body["components"]["memory_service"]["status"] == "ready"


def test_full_health_db_down(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    async def _bad_db() -> dict:
        return {"status": "not_ready", "latency_ms": 2.0, "error": "db unreachable"}

    monkeypatch.setattr(health_module, "_check_db", _bad_db)
    app = _app_with(_FakeMemoryClient(status_code=200))

    response = TestClient(app).get("/v1/health/full")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["components"]["database"]["error"] == "db unreachable"
    assert body["components"]["memory_service"]["status"] == "ready"


def test_full_health_memory_down_http_500(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    async def _ok_db() -> dict:
        return {"status": "ready", "latency_ms": 1.0}

    monkeypatch.setattr(health_module, "_check_db", _ok_db)
    app = _app_with(_FakeMemoryClient(status_code=500))

    response = TestClient(app).get("/v1/health/full")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["components"]["memory_service"]["status"] == "not_ready"
    assert "HTTP 500" in body["components"]["memory_service"]["error"]


def test_full_health_memory_uninitialised(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    async def _ok_db() -> dict:
        return {"status": "ready", "latency_ms": 1.0}

    monkeypatch.setattr(health_module, "_check_db", _ok_db)
    app = _app_with(None)

    response = TestClient(app).get("/v1/health/full")
    assert response.status_code == 503
    body = response.json()
    assert body["components"]["memory_service"]["error"] == (
        "memory-service client not initialised"
    )


def test_full_health_memory_raises(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    async def _ok_db() -> dict:
        return {"status": "ready", "latency_ms": 1.0}

    import httpx

    monkeypatch.setattr(health_module, "_check_db", _ok_db)
    app = _app_with(
        _FakeMemoryClient(raise_exc=httpx.ConnectError("connection refused"))
    )

    response = TestClient(app).get("/v1/health/full")
    assert response.status_code == 503
    body = response.json()
    assert body["components"]["memory_service"]["status"] == "not_ready"
    assert "ConnectError" in body["components"]["memory_service"]["error"]
