"""
Deep health check module for SoulAuth.
Checks database connectivity, JWT key availability, and policy sync status.
"""

import time
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import text

from config.settings import get_settings
from src.database.connection import async_session_factory
from src.monitoring.metrics import HEALTH_CHECK_STATUS

logger = structlog.get_logger(__name__)


async def check_database() -> dict:
    """Check database connectivity with a simple query."""
    start = time.perf_counter()
    try:
        async with async_session_factory() as session:
            result = await session.execute(text("SELECT 1"))
            result.scalar()
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        HEALTH_CHECK_STATUS.labels(component="database").set(1)
        return {
            "status": "healthy",
            "latency_ms": latency_ms,
        }
    except Exception as e:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        HEALTH_CHECK_STATUS.labels(component="database").set(0)
        logger.error("health.database_check_failed", error=str(e))
        return {
            "status": "unhealthy",
            "error": str(e),
            "latency_ms": latency_ms,
        }


def check_jwt_keys() -> dict:
    """Check if JWT signing keys are available."""
    settings = get_settings()
    try:
        has_private = bool(settings.jwt_private_key or settings.jwt_private_key_path)
        has_public = bool(settings.jwt_public_key or settings.jwt_public_key_path)

        # If neither is explicitly configured, the system uses ephemeral keys (dev mode)
        if not has_private and not has_public:
            HEALTH_CHECK_STATUS.labels(component="jwt_keys").set(1)
            return {
                "status": "healthy",
                "mode": "ephemeral",
                "detail": "Using auto-generated ephemeral keys (development mode)",
            }

        # Verify the keys can actually be loaded
        from src.tokens.capability import get_private_key, get_public_key
        get_private_key()
        get_public_key()

        HEALTH_CHECK_STATUS.labels(component="jwt_keys").set(1)
        return {
            "status": "healthy",
            "mode": "configured",
            "algorithm": settings.jwt_algorithm,
            "private_key_source": "file" if settings.jwt_private_key_path else "env",
            "public_key_source": "file" if settings.jwt_public_key_path else "env",
        }
    except Exception as e:
        HEALTH_CHECK_STATUS.labels(component="jwt_keys").set(0)
        logger.error("health.jwt_key_check_failed", error=str(e))
        return {
            "status": "unhealthy",
            "error": str(e),
        }


def check_policy_sync() -> dict:
    """Check policy repo sync status."""
    settings = get_settings()

    if not settings.policy_repo_path:
        HEALTH_CHECK_STATUS.labels(component="policy_sync").set(1)
        return {
            "status": "healthy",
            "mode": "database_only",
            "detail": "No git policy repo configured; using database cache",
        }

    try:
        from src.policy.git_sync import async_sync_manager

        if async_sync_manager is None:
            HEALTH_CHECK_STATUS.labels(component="policy_sync").set(1)
            return {
                "status": "healthy",
                "mode": "not_started",
                "detail": "Async sync manager not initialized yet",
            }

        status = async_sync_manager.get_sync_status()
        last_sync = status.get("last_sync_time")
        last_status = status.get("last_sync_status", "unknown")

        if last_status == "success":
            HEALTH_CHECK_STATUS.labels(component="policy_sync").set(1)
            return {
                "status": "healthy",
                "last_sync_time": last_sync.isoformat() if last_sync else None,
                "last_sync_status": last_status,
                "commit": status.get("last_commit_hash"),
            }
        elif last_status == "failed":
            HEALTH_CHECK_STATUS.labels(component="policy_sync").set(0)
            return {
                "status": "degraded",
                "last_sync_time": last_sync.isoformat() if last_sync else None,
                "last_sync_status": last_status,
                "last_error": status.get("last_error"),
            }
        else:
            HEALTH_CHECK_STATUS.labels(component="policy_sync").set(1)
            return {
                "status": "healthy",
                "last_sync_status": "pending",
                "detail": "Sync has not completed yet",
            }
    except Exception as e:
        HEALTH_CHECK_STATUS.labels(component="policy_sync").set(0)
        logger.error("health.policy_sync_check_failed", error=str(e))
        return {
            "status": "unhealthy",
            "error": str(e),
        }


async def run_health_checks(active_tier: str = "community", enabled_features: list[str] | None = None) -> dict:
    """
    Run all health checks and return aggregated status.

    Returns dict with:
      - status: "healthy" | "degraded" | "unhealthy"
      - components: dict of individual check results
      - service, version metadata
    """
    settings = get_settings()

    db_health = await check_database()
    jwt_health = check_jwt_keys()
    policy_health = check_policy_sync()

    components = {
        "database": db_health,
        "jwt_keys": jwt_health,
        "policy_sync": policy_health,
    }

    # Critical components — if any are unhealthy, the service is unhealthy
    critical_statuses = [db_health["status"], jwt_health["status"]]
    # Non-critical — degraded if these fail
    non_critical_statuses = [policy_health["status"]]

    if any(s == "unhealthy" for s in critical_statuses):
        overall = "unhealthy"
    elif any(s == "unhealthy" for s in non_critical_statuses) or any(
        s == "degraded" for s in critical_statuses + non_critical_statuses
    ):
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "status": overall,
        "service": "soulauth",
        "version": settings.app_version,
        "active_tier": active_tier,
        "enabled_features": enabled_features or [],
        "components": components,
    }
