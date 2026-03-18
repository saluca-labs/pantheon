"""
Circuit breaker status and manual control endpoints.
Manual trip/reset/lock operations require admin authentication via X-Internal-Key.
"""

import structlog
from fastapi import APIRouter, Header, HTTPException

from soulGate.config.settings import get_settings
from soulGate.src.circuit.breaker import get_breaker, list_breakers

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/gate/v1/circuits", tags=["circuit-breakers"])


def _require_admin(x_internal_key: str | None) -> None:
    """Verify admin authentication for circuit breaker control operations."""
    settings = get_settings()
    expected_key = settings.internal_api_key
    if not expected_key or x_internal_key != expected_key:
        raise HTTPException(
            status_code=401,
            detail="Admin authentication required for circuit breaker control",
        )


@router.get("")
async def list_circuit_states():
    """List all circuit breaker states."""
    breakers = list_breakers()
    return {
        "circuits": [b.to_dict() for b in breakers],
        "total": len(breakers),
    }


@router.get("/{upstream_id}")
async def get_circuit_state(upstream_id: str):
    """Get circuit breaker state for a specific upstream."""
    breaker = get_breaker(upstream_id)
    return breaker.to_dict()


@router.post("/{upstream_id}/reset")
async def reset_circuit(
    upstream_id: str,
    x_internal_key: str = Header(None, alias="X-Internal-Key"),
):
    """Manually reset a circuit breaker to closed state (admin only)."""
    _require_admin(x_internal_key)
    breaker = get_breaker(upstream_id)
    breaker.manual_reset()
    logger.info("circuit.manual_reset_api", upstream=upstream_id)
    return {"status": "reset", "circuit": breaker.to_dict()}


@router.post("/{upstream_id}/trip")
async def trip_circuit(
    upstream_id: str,
    x_internal_key: str = Header(None, alias="X-Internal-Key"),
):
    """Manually trip a circuit breaker to open state (admin only)."""
    _require_admin(x_internal_key)
    breaker = get_breaker(upstream_id)
    breaker.manual_trip()
    logger.info("circuit.manual_trip_api", upstream=upstream_id)
    return {"status": "tripped", "circuit": breaker.to_dict()}


@router.post("/{upstream_id}/lock")
async def lock_circuit(
    upstream_id: str,
    x_internal_key: str = Header(None, alias="X-Internal-Key"),
):
    """Lock a circuit breaker in its current state, blocking automatic transitions (admin only)."""
    _require_admin(x_internal_key)
    breaker = get_breaker(upstream_id)
    breaker.admin_lock()
    logger.info("circuit.lock_api", upstream=upstream_id)
    return {"status": "locked", "circuit": breaker.to_dict()}


@router.post("/{upstream_id}/unlock")
async def unlock_circuit(
    upstream_id: str,
    x_internal_key: str = Header(None, alias="X-Internal-Key"),
):
    """Unlock a circuit breaker, allowing automatic transitions again (admin only)."""
    _require_admin(x_internal_key)
    breaker = get_breaker(upstream_id)
    breaker.admin_unlock()
    logger.info("circuit.unlock_api", upstream=upstream_id)
    return {"status": "unlocked", "circuit": breaker.to_dict()}
