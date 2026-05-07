"""
License Tier Integrity Watchdog.
Periodically verifies that:
1. The running license tier matches what's in the DB
2. Env vars (TIRESIAS_LICENSE_KEY, TIRESIAS_TIER) haven't changed since startup
3. Tenant tiers in DB haven't been modified outside billing flow

Fires audit events on violations for SoulWatch Sigma rule detection.
"""

import os
import hashlib
import asyncio
import structlog
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

_watchdog_task: Optional[asyncio.Task] = None


async def check_env_integrity(app) -> list[dict]:
    """Check if license-related env vars have changed since startup."""
    violations = []

    startup_hash = getattr(app.state, "license_env_hash", None)
    if startup_hash is None:
        return violations

    current_hash = hashlib.sha256(
        (os.environ.get("TIRESIAS_LICENSE_KEY", "") + os.environ.get("TIRESIAS_TIER", "")).encode()
    ).hexdigest()

    if current_hash != startup_hash:
        violations.append({
            "type": "env_var_changed",
            "detail": "TIRESIAS_LICENSE_KEY or TIRESIAS_TIER env var modified since startup",
            "startup_hash": startup_hash[:16],
            "current_hash": current_hash[:16],
        })

    return violations


async def check_license_tier_match(app) -> list[dict]:
    """Check if running license tier matches DB state."""
    violations = []

    startup_tier = getattr(app.state, "license_tier_at_startup", None)
    license_token = getattr(app.state, "license", None)

    if startup_tier is None or license_token is None:
        return violations

    current_tier = license_token.tier if license_token.is_valid else None

    if current_tier and current_tier != startup_tier:
        violations.append({
            "type": "runtime_tier_drift",
            "detail": f"Running tier '{current_tier}' differs from startup tier '{startup_tier}'",
            "startup_tier": startup_tier,
            "current_tier": current_tier,
        })

    return violations


async def check_db_tier_integrity(app) -> list[dict]:
    """
    Check for tenants whose DB tier doesn't match their active license.
    This catches direct DB modifications bypassing the billing flow.
    """
    violations = []

    try:
        from src.database.connection import async_session_factory

        async with async_session_factory() as db:
            # Find tenants with an active license whose DB tier doesn't match the license tier
            result = await db.execute(text("""
                SELECT t.id, t.name, t.tier AS db_tier, l.tier AS license_tier
                FROM _soul_tenants t
                JOIN _soul_licenses l ON l.tenant_id = t.id AND l.status = 'active'
                WHERE t.tier != l.tier
                ORDER BY t.updated_at DESC
                LIMIT 50
            """))
            rows = result.fetchall()

            for row in rows:
                violations.append({
                    "type": "db_tier_mismatch",
                    "detail": f"Tenant {row[1]} DB tier '{row[2]}' doesn't match license tier '{row[3]}'",
                    "tenant_id": str(row[0]),
                    "tenant_name": row[1],
                    "db_tier": row[2],
                    "license_tier": row[3],
                })
    except Exception as e:
        logger.warning("watchdog.db_check_failed", error=str(e))

    return violations


async def _emit_violation(violation: dict):
    """Emit a violation as an audit event for SoulWatch to pick up."""
    try:
        import uuid as _uuid
        from src.database.connection import async_session_factory
        from src.audit.logger import log_auth_event

        raw_tenant = violation.get("tenant_id")
        tenant_id = _uuid.UUID(raw_tenant) if raw_tenant else None

        async with async_session_factory() as db:
            await log_auth_event(
                db=db,
                tenant_id=tenant_id,
                event_type="license_integrity_violation",
                soulkey_id=None,
                persona_id="system",
                resource="license",
                action="integrity_check",
                scope="system",
                decision="alert",
                reason=violation["detail"],
                context={
                    "violation_type": violation["type"],
                    **{k: v for k, v in violation.items() if k not in ("type", "detail")},
                },
            )
    except Exception as e:
        logger.error("watchdog.emit_failed", error=str(e), violation=violation)


async def run_integrity_check(app) -> int:
    """
    Run all integrity checks and emit violations.
    Returns the number of violations found.
    """
    all_violations = []
    all_violations.extend(await check_env_integrity(app))
    all_violations.extend(await check_license_tier_match(app))
    all_violations.extend(await check_db_tier_integrity(app))

    for violation in all_violations:
        logger.warning(
            "watchdog.violation_detected",
            violation_type=violation["type"],
            detail=violation["detail"],
        )
        await _emit_violation(violation)

    if all_violations:
        logger.critical(
            "watchdog.integrity_violations",
            count=len(all_violations),
            types=[v["type"] for v in all_violations],
        )

    return len(all_violations)


async def _watchdog_loop(app, interval_seconds: int = 300):
    """Background loop that runs integrity checks periodically."""
    logger.info("watchdog.started", interval_seconds=interval_seconds)
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            count = await run_integrity_check(app)
            if count == 0:
                logger.debug("watchdog.check_clean")
        except asyncio.CancelledError:
            logger.info("watchdog.stopped")
            break
        except Exception as e:
            logger.error("watchdog.loop_error", error=str(e))


def start_watchdog(app, interval_seconds: int = 300):
    """Start the background watchdog task."""
    global _watchdog_task
    if _watchdog_task is not None:
        return
    _watchdog_task = asyncio.create_task(_watchdog_loop(app, interval_seconds))
    logger.info("watchdog.scheduled", interval_seconds=interval_seconds)


def stop_watchdog():
    """Stop the background watchdog task."""
    global _watchdog_task
    if _watchdog_task:
        _watchdog_task.cancel()
        _watchdog_task = None
        logger.info("watchdog.cancelled")
