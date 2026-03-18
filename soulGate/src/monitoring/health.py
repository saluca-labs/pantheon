"""
Component health checks for SoulGate.
"""

import httpx
import structlog
from sqlalchemy import text

from soulGate.config.settings import get_settings
from soulGate.src.database.connection import async_session_factory
from soulGate.src.proxy.upstream import list_upstreams
from soulGate.src.circuit.breaker import list_breakers
from soulGate.src.audit.logger import get_queue_size

logger = structlog.get_logger(__name__)
settings = get_settings()


async def run_health_checks() -> dict:
    """Run all component health checks and return aggregated status."""
    checks = {}

    # Database check
    try:
        async with async_session_factory() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = {"status": "healthy"}
    except Exception as e:
        checks["database"] = {"status": "unhealthy", "error": str(e)}

    # SoulAuth connectivity
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.soulauth_base_url}/health")
            if resp.status_code == 200:
                checks["soulauth"] = {"status": "healthy"}
            else:
                checks["soulauth"] = {"status": "degraded", "status_code": resp.status_code}
    except Exception as e:
        checks["soulauth"] = {"status": "unhealthy", "error": str(e)}

    # SoulWatch connectivity
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.soulwatch_base_url}/health")
            if resp.status_code == 200:
                checks["soulwatch"] = {"status": "healthy"}
            else:
                checks["soulwatch"] = {"status": "degraded", "status_code": resp.status_code}
    except Exception as e:
        checks["soulwatch"] = {"status": "unhealthy", "error": str(e)}

    # Upstream health
    upstreams = list_upstreams()
    upstream_health = {}
    for upstream in upstreams:
        if upstream.health_endpoint:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    url = f"{upstream.base_url.rstrip('/')}{upstream.health_endpoint}"
                    resp = await client.get(url)
                    upstream_health[upstream.name] = {
                        "status": "healthy" if resp.status_code == 200 else "degraded",
                    }
            except Exception:
                upstream_health[upstream.name] = {"status": "unhealthy"}
        else:
            upstream_health[upstream.name] = {"status": "unknown"}

    checks["upstreams"] = upstream_health

    # Circuit breaker summary
    breakers = list_breakers()
    open_circuits = [b.upstream_id for b in breakers if b.state == "open"]
    checks["circuit_breakers"] = {
        "total": len(breakers),
        "open": len(open_circuits),
        "open_upstreams": open_circuits,
    }

    # Audit queue
    queue_size = get_queue_size()
    checks["audit_queue"] = {
        "size": queue_size,
        "status": "healthy" if queue_size < settings.audit_batch_size * 10 else "degraded",
    }

    # Overall status
    unhealthy = any(
        v.get("status") == "unhealthy"
        for k, v in checks.items()
        if isinstance(v, dict) and "status" in v
    )
    overall = "unhealthy" if unhealthy else "healthy"

    return {
        "status": overall,
        "service": "soulgate",
        "version": settings.app_version,
        "mode": settings.mode,
        "checks": checks,
    }
