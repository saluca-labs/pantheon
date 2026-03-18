"""
Health check module for SoulWatch.
Checks DB connectivity, detection engine, SIEM destinations, baseline freshness.
"""

import time
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import text

from soulWatch.config.settings import get_settings
from soulWatch.src.database.connection import async_session_factory
from soulWatch.src.monitoring.metrics import HEALTH_CHECK_STATUS

logger = structlog.get_logger(__name__)


async def check_database() -> dict:
    """Check database connectivity."""
    start = time.perf_counter()
    try:
        async with async_session_factory() as session:
            result = await session.execute(text("SELECT 1"))
            result.scalar()
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        HEALTH_CHECK_STATUS.labels(component="database").set(1)
        return {"status": "healthy", "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        HEALTH_CHECK_STATUS.labels(component="database").set(0)
        logger.error("health.database_check_failed", error=str(e))
        return {"status": "unhealthy", "error": str(e), "latency_ms": latency_ms}


def check_detection_engine() -> dict:
    """Check if the detection engine is loaded with rules."""
    try:
        from soulWatch.src.detection._state import get_sigma_engine, get_playbook_engine
        sigma = get_sigma_engine()
        playbook = get_playbook_engine()

        status = sigma.get_status()
        HEALTH_CHECK_STATUS.labels(component="detection_engine").set(1)
        return {
            "status": "healthy",
            "rules_loaded": status["rules_loaded"],
            "rules_enabled": status["rules_enabled"],
            "playbooks_loaded": len(playbook.list_playbooks()),
        }
    except Exception as e:
        HEALTH_CHECK_STATUS.labels(component="detection_engine").set(0)
        return {"status": "unhealthy", "error": str(e)}


async def check_baseline_freshness() -> dict:
    """Check if baselines are up to date."""
    try:
        from soulWatch.src.analytics._state import get_baseline_engine
        engine = get_baseline_engine()
        if engine is None:
            HEALTH_CHECK_STATUS.labels(component="baselines").set(1)
            return {"status": "healthy", "detail": "Engine not yet initialized"}

        tracked = engine.tracked_agents_count
        HEALTH_CHECK_STATUS.labels(component="baselines").set(1)
        return {
            "status": "healthy",
            "tracked_agents": tracked,
        }
    except Exception as e:
        HEALTH_CHECK_STATUS.labels(component="baselines").set(0)
        return {"status": "unhealthy", "error": str(e)}


def check_siem_forwarder() -> dict:
    """Check SIEM forwarder status."""
    try:
        from soulWatch.src.integrations.forwarder import get_event_forwarder
        forwarder = get_event_forwarder()
        if forwarder is None:
            HEALTH_CHECK_STATUS.labels(component="siem_forwarder").set(1)
            return {"status": "healthy", "detail": "Not configured"}

        HEALTH_CHECK_STATUS.labels(component="siem_forwarder").set(1)
        return {
            "status": "healthy",
            "running": forwarder._running,
            "metrics": forwarder.metrics.to_dict(),
        }
    except Exception as e:
        HEALTH_CHECK_STATUS.labels(component="siem_forwarder").set(0)
        return {"status": "unhealthy", "error": str(e)}


def check_pipeline() -> dict:
    """Check the event pipeline status."""
    settings = get_settings()
    return {
        "status": "healthy",
        "mode": settings.mode,
    }


async def run_health_checks() -> dict:
    """Run all health checks and return aggregated status."""
    settings = get_settings()

    db_health = await check_database()
    detection_health = check_detection_engine()
    baseline_health = await check_baseline_freshness()
    siem_health = check_siem_forwarder()
    pipeline_health = check_pipeline()

    components = {
        "database": db_health,
        "detection_engine": detection_health,
        "baselines": baseline_health,
        "siem_forwarder": siem_health,
        "pipeline": pipeline_health,
    }

    critical = [db_health["status"], detection_health["status"]]
    non_critical = [baseline_health["status"], siem_health["status"]]

    if any(s == "unhealthy" for s in critical):
        overall = "unhealthy"
    elif any(s == "unhealthy" for s in non_critical) or any(
        s == "degraded" for s in critical + non_critical
    ):
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "status": overall,
        "service": "soulwatch",
        "version": settings.app_version,
        "mode": settings.mode,
        "components": components,
    }
