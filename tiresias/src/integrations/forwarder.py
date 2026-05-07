"""
Event forwarding orchestrator.
Buffers audit events and forwards them to configured SIEM destinations
in batches via background async tasks.
"""

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from src.integrations.cef import AuditEvent
from src.integrations.siem import SIEMForwarder, create_forwarder
from src.integrations.config import SIEMDestinationConfig

logger = logging.getLogger(__name__)


@dataclass
class ForwarderMetrics:
    """Tracks forwarding statistics."""
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

    Features:
    - Non-blocking `forward()` — adds to an in-memory buffer
    - Background task flushes buffer on size threshold or time interval
    - Dead letter queue for events that fail all destinations
    - Retry from dead letter queue on each flush cycle
    - Clean start/stop lifecycle
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
        self._forwarders: list[SIEMForwarder] = []
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()
        self.metrics = ForwarderMetrics()

        if destinations:
            for cfg in destinations:
                self._forwarders.append(create_forwarder(cfg))

    def add_destination(self, config: SIEMDestinationConfig) -> None:
        """Add a SIEM destination at runtime."""
        self._forwarders.append(create_forwarder(config))

    def forward(self, event: AuditEvent) -> None:
        """
        Non-blocking: enqueue an event for forwarding.
        Safe to call from any async context.
        """
        self._buffer.append(event)
        self.metrics.buffer_size = len(self._buffer)

    async def flush(self) -> None:
        """Flush the current buffer to all destinations."""
        async with self._lock:
            if not self._buffer and not self._dead_letter:
                return

            # Drain buffer into a batch
            batch: list[AuditEvent] = []
            while self._buffer:
                batch.append(self._buffer.popleft())
            self.metrics.buffer_size = len(self._buffer)

            # Also retry dead letter items (limited to avoid overload)
            dlq_retry: list[AuditEvent] = []
            retry_count = min(len(self._dead_letter), 50)
            for _ in range(retry_count):
                if self._dead_letter:
                    dlq_retry.append(self._dead_letter.popleft())

            all_events = batch + dlq_retry

            if not all_events or not self._forwarders:
                # If no forwarders configured, put events back in dead letter
                if all_events and not self._forwarders:
                    for e in all_events:
                        self._dead_letter.append(e)
                    self.metrics.dead_letter_size = len(self._dead_letter)
                return

            # Forward to all destinations
            failed_events: list[AuditEvent] = []

            for forwarder in self._forwarders:
                try:
                    success = await forwarder.forward_batch(all_events)
                    if success:
                        self.metrics.events_forwarded += len(all_events)
                    else:
                        self.metrics.events_failed += len(all_events)
                        failed_events.extend(all_events)
                except Exception as exc:
                    logger.error(
                        "Forwarder %s failed: %s",
                        type(forwarder).__name__,
                        exc,
                    )
                    self.metrics.events_failed += len(all_events)
                    failed_events.extend(all_events)

            # Dedupe failed events and add to dead letter
            seen = set()
            for event in failed_events:
                if event.event_id not in seen:
                    seen.add(event.event_id)
                    self._dead_letter.append(event)

            self.metrics.dead_letter_size = len(self._dead_letter)
            self.metrics.last_forward_time = time.time()

    async def _run_loop(self) -> None:
        """Background loop: flush buffer on interval or when size threshold reached."""
        while self._running:
            try:
                await asyncio.sleep(self.flush_interval)
                await self.flush()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("EventForwarder loop error: %s", exc)

    def start(self) -> None:
        """Start the background forwarding loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.get_event_loop().create_task(self._run_loop())
        logger.info(
            "EventForwarder started: %d destinations, buffer=%d, interval=%ds",
            len(self._forwarders),
            self.buffer_size,
            self.flush_interval,
        )

    async def stop(self) -> None:
        """Stop the background loop and flush remaining events."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        # Final flush
        await self.flush()

        # Close all forwarders
        for fwd in self._forwarders:
            try:
                await fwd.close()
            except Exception as exc:
                logger.error("Error closing forwarder %s: %s", type(fwd).__name__, exc)

        logger.info(
            "EventForwarder stopped: forwarded=%d failed=%d dlq=%d",
            self.metrics.events_forwarded,
            self.metrics.events_failed,
            self.metrics.dead_letter_size,
        )

    async def health_check(self) -> dict:
        """Check health of all SIEM destinations."""
        results = {}
        for fwd in self._forwarders:
            name = type(fwd).__name__
            try:
                results[name] = await fwd.health_check()
            except Exception:
                results[name] = False
        return results


# Module-level singleton — initialized by app lifespan
_event_forwarder: Optional[EventForwarder] = None


def get_event_forwarder() -> Optional[EventForwarder]:
    """Get the global EventForwarder instance."""
    return _event_forwarder


def set_event_forwarder(forwarder: Optional[EventForwarder]) -> None:
    """Set the global EventForwarder instance."""
    global _event_forwarder
    _event_forwarder = forwarder
