"""Background retention task — soft-deletes old audit records."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app_proxy.storage.schema import AppProxyAuditLog

logger = structlog.stdlib.get_logger("app_proxy.retention")

# How often the sweep runs (seconds).
_SWEEP_INTERVAL_SECONDS: int = 3600  # 1 hour


async def _run_sweep(
    session_factory: async_sessionmaker,
    retention_days: int,
) -> int:
    """Soft-delete audit rows older than *retention_days*.

    Returns the number of rows marked as deleted.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    async with session_factory() as session:
        result = await session.execute(
            update(AppProxyAuditLog)
            .where(
                AppProxyAuditLog.created_at < cutoff,
                AppProxyAuditLog.deleted_at.is_(None),
            )
            .values(deleted_at=datetime.now(timezone.utc))
        )
        await session.commit()
        count: int = result.rowcount  # type: ignore[assignment]
    return count


async def start_retention_loop(
    engine: AsyncEngine,
    retention_days: int,
    interval_seconds: int = _SWEEP_INTERVAL_SECONDS,
) -> None:
    """Run the retention sweep on a recurring interval.

    Designed to be launched as a background :func:`asyncio.create_task`.
    Runs indefinitely until the task is cancelled.
    """
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    logger.info(
        "retention.loop.started",
        retention_days=retention_days,
        interval_seconds=interval_seconds,
    )

    while True:
        try:
            deleted = await _run_sweep(session_factory, retention_days)
            if deleted:
                logger.info("retention.sweep.complete", soft_deleted=deleted)
            else:
                logger.debug("retention.sweep.noop")
        except asyncio.CancelledError:
            logger.info("retention.loop.cancelled")
            raise
        except Exception:
            logger.exception("retention.sweep.error")

        await asyncio.sleep(interval_seconds)
