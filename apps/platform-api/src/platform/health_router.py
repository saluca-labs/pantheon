"""Aggregated readiness probe for platform-api dependencies.

Exposes ``GET /v1/health/full`` which fans out to:

  * the database (via the existing soulauth health checker)
  * the memory-service sidecar (``GET /health/ready``)

Each component reports ``{status, latency_ms, error?}``; the overall
status is ``ready`` only if every component is ready.

Returns 200 with ``{"status": "ready", ...}`` on success and 503 with
``{"status": "not_ready", ...}`` if any component fails. Never raises.
"""

from __future__ import annotations

import time
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from platform_memory_client import MemoryClient

router = APIRouter(prefix="/v1/health", tags=["Health"])


async def _check_db() -> dict[str, Any]:
    """Reuse the existing soulauth health checker for the DB check."""
    started = time.perf_counter()
    try:
        from src.monitoring.health import run_health_checks  # local import; heavy module

        result = await run_health_checks(detail=True)
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        components = result.get("components") or {}
        db = components.get("database") or {}
        if db.get("status") == "healthy":
            return {"status": "ready", "latency_ms": latency_ms}
        return {
            "status": "not_ready",
            "latency_ms": latency_ms,
            "error": db.get("error", "database unhealthy"),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "not_ready",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": f"{type(exc).__name__}: {exc}",
        }


async def _check_memory(client: Optional[MemoryClient]) -> dict[str, Any]:
    started = time.perf_counter()
    if client is None:
        return {
            "status": "not_ready",
            "latency_ms": 0.0,
            "error": "memory-service client not initialised",
        }
    try:
        http = await client._http()  # noqa: SLF001
        resp = await http.get("/health/ready")
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        if resp.status_code == 200:
            return {"status": "ready", "latency_ms": latency_ms}
        return {
            "status": "not_ready",
            "latency_ms": latency_ms,
            "error": f"HTTP {resp.status_code}",
        }
    except httpx.HTTPError as exc:
        return {
            "status": "not_ready",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": f"{type(exc).__name__}: {exc}",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "not_ready",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": f"{type(exc).__name__}: {exc}",
        }


@router.get(
    "/full",
    summary="Aggregated readiness probe",
    description=(
        "Fan-out readiness check covering the database and the "
        "memory-service sidecar. Returns 503 if any component is unhealthy."
    ),
)
async def health_full(request: Request) -> JSONResponse:
    memory: Optional[MemoryClient] = getattr(request.app.state, "memory", None)
    db_check = await _check_db()
    memory_check = await _check_memory(memory)

    overall = (
        "ready"
        if db_check["status"] == "ready" and memory_check["status"] == "ready"
        else "not_ready"
    )
    body = {
        "status": overall,
        "components": {
            "database": db_check,
            "memory_service": memory_check,
        },
    }
    code = 200 if overall == "ready" else 503
    return JSONResponse(content=body, status_code=code)
