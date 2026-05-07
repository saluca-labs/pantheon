"""Background sweeper that expires stale approval-queue entries."""

from __future__ import annotations

import asyncio

import structlog

from app_proxy.approval.service import ApprovalService

logger = structlog.stdlib.get_logger("app_proxy.approval.sweeper")


async def run_approval_sweeper(
    service: ApprovalService, interval_seconds: int = 300
) -> None:
    """Background loop: every 5 min, expire stale approvals.

    Designed to run as ``asyncio.create_task`` inside the app lifespan.
    Handles ``CancelledError`` for clean shutdown.
    """
    logger.info(
        "approval.sweeper.started",
        interval_seconds=interval_seconds,
    )
    try:
        while True:
            try:
                expired = await service.expire_stale()
                if expired > 0:
                    logger.info("approval.sweeper.cycle", expired=expired)
            except Exception as exc:
                logger.error("approval.sweeper.error", error=str(exc))

            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        logger.info("approval.sweeper.stopped")
        raise
