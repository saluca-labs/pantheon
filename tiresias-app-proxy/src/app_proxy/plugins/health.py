"""Background health polling for MCP plugins."""

from __future__ import annotations

import asyncio

import structlog

from app_proxy.plugins.registry import PluginRegistry

logger = structlog.stdlib.get_logger("app_proxy.plugins.health")


async def run_health_poller(
    registry: PluginRegistry,
    interval_seconds: int = 60,
) -> None:
    """Background task: poll plugin health every *interval_seconds*.

    Designed to be launched via ``asyncio.create_task`` and cancelled on
    shutdown.  Swallows ``CancelledError`` cleanly.
    """
    logger.info("health_poller.started", interval=interval_seconds)
    try:
        while True:
            try:
                results = await registry.health_check()
                logger.debug(
                    "health_poller.cycle",
                    healthy=sum(1 for v in results.values() if v),
                    total=len(results),
                )
            except Exception:
                logger.exception("health_poller.cycle.error")
            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        logger.info("health_poller.cancelled")
