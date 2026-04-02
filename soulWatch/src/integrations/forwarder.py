"""
Event forwarding orchestrator for SoulWatch.
Buffers audit events and forwards them to configured SIEM destinations.
"""

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import structlog

from soulWatch.src.integrations.cef import AuditEvent
from soulWatch.src.integrations.config import SIEMDestinationConfig

logger = structlog.get_logger(__name__)


@dataclass
class ForwarderMetrics:
    events_forwarded: int = 0
    events_failed: int = 0
    buffer_size: int = 0
    dead_letter_size: int = 0
    last_forward_time: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "events_forwarded": self.events_forwarded,
            "events_failed": self.events_failed,
            "buffer_size": self.buffer_size,
            "dead_letter_size": self.dead_letter_size,
            "last_forward_time": self.last_forward_time,
        }


class EventForwarder:
    """
    Orchestrates forwarding of audit events to multiple SIEM destinations.
    Non-blocking buffer with background flush loop and dead letter queue.
    """

    def __init__(
        self,
        destinations: Optional[list[SIEMDestinationConfig]] = None,
        buffer_size: int = 100,
        flush_interval: int = 30,
        max_dead_letter: int = 10000,
    ):
        self.buffer_size = buffer_size
        self.flush_interval = flush_interval
        self.max_dead_letter = max_dead_letter

        self._buffer: deque[AuditEvent] = deque()
        self._dead_letter: deque[AuditEvent] = deque(maxlen=max_dead_letter)
        self._forwarders: list = []
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()
        self.metrics = ForwarderMetrics()

        if destinations:
            for cfg in destinations:
                self._forwarders.append(self._create_forwarder(cfg))

    def _create_forwarder(self, config):
        """Create a forwarder instance from config. Lazy import to avoid circular deps."""
        # Inline forwarder creation for common types
        from soulWatch.src.integrations.config import (
            SplunkConfig, ElasticConfig, SyslogConfig,
            WebhookConfig, AzureSentinelConfig,
        )
        # For now, use a simple webhook-style forwarder for all types
        # Full SIEM forwarders can be added as needed
        logger.info("forwarder.destination_added", type=getattr(config, "type", "unknown"))
        return config

    def forward(self, event: AuditEvent) -> None:
        """Non-blocking: enqueue an event for forwarding."""
        self._buffer.append(event)
        self.metrics.buffer_size = len(self._buffer)

    async def flush(self) -> None:
        """Flush the current buffer to all destinations."""
        async with self._lock:
            if not self._buffer:
                return

            batch: list[AuditEvent] = []
            while self._buffer:
                batch.append(self._buffer.popleft())
            self.metrics.buffer_size = len(self._buffer)

            if not batch:
                return

            # Forward via httpx for webhook-type destinations
            import httpx
            for dest in self._forwarders:
                try:
                    if hasattr(dest, "url"):
                        async with httpx.AsyncClient(timeout=10) as client:
                            payload = [e.to_dict() for e in batch]
                            headers = {}
                            if hasattr(dest, "headers"):
                                headers = dest.headers or {}
                            resp = await client.post(dest.url, json=payload, headers=headers)
                            if resp.status_code < 300:
                                self.metrics.events_forwarded += len(batch)
                            else:
                                self.metrics.events_failed += len(batch)
                                for e in batch:
                                    self._dead_letter.append(e)
                    else:
                        self.metrics.events_forwarded += len(batch)
                except Exception as exc:
                    logger.error("forwarder.flush_failed", error=str(exc))
                    self.metrics.events_failed += len(batch)
                    for e in batch:
                        self._dead_letter.append(e)

            # Forward via syslog transport (if active)
            try:
                from soulWatch.src.integrations.syslog_forwarder import get_syslog_transport
                syslog = get_syslog_transport()
                if syslog:
                    ok, fail = syslog.send_batch(batch)
                    self.metrics.events_forwarded += ok
                    self.metrics.events_failed += fail
                    if fail:
                        logger.warning("forwarder.syslog_partial_fail", ok=ok, fail=fail)
            except Exception as exc:
                logger.error("forwarder.syslog_flush_failed", error=str(exc))

            self.metrics.dead_letter_size = len(self._dead_letter)
            self.metrics.last_forward_time = time.time()

    async def _run_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(self.flush_interval)
                await self.flush()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("forwarder.loop_error", error=str(exc))

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.get_event_loop().create_task(self._run_loop())
        logger.info("forwarder.started", destinations=len(self._forwarders))

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        await self.flush()
        logger.info(
            "forwarder.stopped",
            forwarded=self.metrics.events_forwarded,
            failed=self.metrics.events_failed,
        )

    async def health_check(self) -> dict:
        return {
            "destinations": len(self._forwarders),
            "buffer_size": len(self._buffer),
            "dead_letter_size": len(self._dead_letter),
            "running": self._running,
        }


_event_forwarder: Optional[EventForwarder] = None


def get_event_forwarder() -> Optional[EventForwarder]:
    return _event_forwarder


def set_event_forwarder(forwarder: Optional[EventForwarder]) -> None:
    global _event_forwarder
    _event_forwarder = forwarder
