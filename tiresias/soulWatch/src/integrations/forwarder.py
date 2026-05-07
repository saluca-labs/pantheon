"""
Event forwarding orchestrator for SoulWatch.
Buffers audit events and forwards them to configured SIEM destinations.

Dead-letter queue persistence:
  Failed events are written to the _soulwatch_dlq PostgreSQL table so they
  survive process restarts.  On each flush cycle the forwarder also reads
  DLQ rows (up to DLQ_RETRY_BATCH rows at a time, only those whose
  retry_count < max_retries) and retries them.  Rows that succeed are
  deleted; rows that fail again have retry_count and last_retry_at updated.
  Rows that have exhausted max_retries stay in the table for manual inspection
  via GET /watch/v1/integrations/dlq.
"""

import asyncio
import time
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.integrations.cef import AuditEvent
from soulWatch.src.integrations.config import SIEMDestinationConfig

logger = structlog.get_logger(__name__)

# Max rows pulled from the DB DLQ per flush cycle.
DLQ_RETRY_BATCH = 50


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


def _make_session() -> AsyncSession:
    """Return a new async DB session (lazy import to avoid circular deps at module load)."""
    from soulWatch.src.database.connection import async_session_factory
    return async_session_factory()


def _event_from_row(row) -> AuditEvent:
    """Reconstruct an AuditEvent from a SoulWatchDLQ row's event_data JSON."""
    data = row.event_data
    # to_dict() stores the field as "event_id"; from_dict() expects "id".
    # Support both so we can round-trip through the DB.
    if "event_id" in data and "id" not in data:
        data = dict(data, id=data["event_id"])
    return AuditEvent.from_dict(data)


class EventForwarder:
    """
    Orchestrates forwarding of audit events to multiple SIEM destinations.
    Non-blocking buffer with background flush loop and persistent dead letter queue.
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
        self._forwarders: list = []
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()
        self.metrics = ForwarderMetrics()

        if destinations:
            for cfg in destinations:
                self._forwarders.append(self._create_forwarder(cfg))

    def _create_forwarder(self, config):
        """Create a forwarder instance from config."""
        logger.info("forwarder.destination_added", type=getattr(config, "type", "unknown"))
        return config

    def forward(self, event: AuditEvent) -> None:
        """Non-blocking: enqueue an event for forwarding."""
        self._buffer.append(event)
        self.metrics.buffer_size = len(self._buffer)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _persist_failed(
        self,
        session: AsyncSession,
        event: AuditEvent,
        destination: str,
        error: str,
    ) -> None:
        """Insert a new DLQ row for a failed event."""
        from soulWatch.src.database.models import SoulWatchDLQ
        row = SoulWatchDLQ(
            id=uuid.uuid4(),
            event_data=event.to_dict(),
            destination=destination,
            error_message=error[:1000] if error else None,
            retry_count=0,
            max_retries=5,
            created_at=datetime.now(timezone.utc),
        )
        session.add(row)

    async def _forward_batch_all_destinations(
        self,
        session: AsyncSession,
        batch: list[AuditEvent],
        destination_label: str = "all",
    ) -> list[tuple[AuditEvent, str]]:
        """
        Forward *batch* to every configured destination.
        Returns list of (event, error_message) pairs for events that failed
        on ALL destinations.  Events that succeed on at least one destination
        are considered delivered.
        """
        if not self._forwarders:
            # No forwarders — park everything in the DLQ for later.
            return [(e, "no_destinations_configured") for e in batch]

        failed_events: list[tuple[AuditEvent, str]] = []

        for dest in self._forwarders:
            dest_name = getattr(dest, "type", type(dest).__name__)
            try:
                if hasattr(dest, "url"):
                    import httpx
                    async with httpx.AsyncClient(timeout=10) as client:
                        payload = [e.to_dict() for e in batch]
                        headers = getattr(dest, "headers", None) or {}
                        resp = await client.post(dest.url, json=payload, headers=headers)
                        if resp.status_code < 300:
                            self.metrics.events_forwarded += len(batch)
                        else:
                            error = f"HTTP {resp.status_code}"
                            self.metrics.events_failed += len(batch)
                            for e in batch:
                                failed_events.append((e, error))
                elif hasattr(dest, "forward_batch"):
                    ok = await dest.forward_batch(batch)
                    if ok:
                        self.metrics.events_forwarded += len(batch)
                    else:
                        self.metrics.events_failed += len(batch)
                        for e in batch:
                            failed_events.append((e, f"forwarder_{dest_name}_returned_false"))
                else:
                    # Passthrough / unknown — count as forwarded.
                    self.metrics.events_forwarded += len(batch)
            except Exception as exc:
                error = str(exc)[:500]
                logger.error("forwarder.flush_failed", dest=dest_name, error=error)
                self.metrics.events_failed += len(batch)
                for e in batch:
                    failed_events.append((e, error))

        # Also forward via syslog transport if active.
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

        return failed_events

    # ------------------------------------------------------------------
    # Main flush
    # ------------------------------------------------------------------

    async def flush(self) -> None:
        """Flush the current in-memory buffer and retry eligible DLQ rows."""
        async with self._lock:
            # --- 1. Drain in-memory buffer ---
            batch: list[AuditEvent] = []
            while self._buffer:
                batch.append(self._buffer.popleft())
            self.metrics.buffer_size = len(self._buffer)

            # --- 2. Retry eligible rows from DB DLQ ---
            db_retry_events: list[tuple] = []  # (row_id, AuditEvent)
            try:
                async with _make_session() as session:
                    from soulWatch.src.database.models import SoulWatchDLQ
                    result = await session.execute(
                        select(SoulWatchDLQ)
                        .where(SoulWatchDLQ.retry_count < SoulWatchDLQ.max_retries)
                        .order_by(SoulWatchDLQ.created_at.asc())
                        .limit(DLQ_RETRY_BATCH)
                    )
                    rows = result.scalars().all()
                    for row in rows:
                        try:
                            db_retry_events.append((row.id, _event_from_row(row)))
                        except Exception as exc:
                            logger.warning(
                                "forwarder.dlq_row_corrupt",
                                row_id=str(row.id),
                                error=str(exc),
                            )
            except Exception as exc:
                logger.error("forwarder.dlq_read_failed", error=str(exc))

            # --- 3. Forward the in-memory batch ---
            if batch:
                try:
                    async with _make_session() as session:
                        failed = await self._forward_batch_all_destinations(session, batch)
                        # Deduplicate by event_id before persisting.
                        seen: set[str] = set()
                        for event, error in failed:
                            if event.event_id not in seen:
                                seen.add(event.event_id)
                                await self._persist_failed(session, event, "all", error)
                        if seen:
                            self.metrics.dead_letter_size += len(seen)
                        await session.commit()
                except Exception as exc:
                    logger.error("forwarder.flush_batch_failed", error=str(exc))

            # --- 4. Retry DB DLQ rows ---
            if db_retry_events:
                retry_batch = [e for _, e in db_retry_events]
                try:
                    async with _make_session() as session:
                        from soulWatch.src.database.models import SoulWatchDLQ
                        failed = await self._forward_batch_all_destinations(
                            session, retry_batch, destination_label="dlq_retry"
                        )
                        failed_event_ids = {e.event_id for e, _ in failed}
                        failed_errors: dict[str, str] = {e.event_id: err for e, err in failed}

                        now = datetime.now(timezone.utc)
                        for row_id, event in db_retry_events:
                            if event.event_id in failed_event_ids:
                                # Increment retry_count.
                                result = await session.execute(
                                    select(SoulWatchDLQ).where(SoulWatchDLQ.id == row_id)
                                )
                                row = result.scalar_one_or_none()
                                if row:
                                    row.retry_count += 1
                                    row.last_retry_at = now
                                    row.error_message = (
                                        failed_errors.get(event.event_id, row.error_message)
                                    )
                            else:
                                # Success — delete the row.
                                await session.execute(
                                    delete(SoulWatchDLQ).where(SoulWatchDLQ.id == row_id)
                                )
                        await session.commit()

                        # Update DLQ size gauge.
                        count_result = await session.execute(
                            select(func.count()).select_from(SoulWatchDLQ)
                        )
                        self.metrics.dead_letter_size = count_result.scalar() or 0
                except Exception as exc:
                    logger.error("forwarder.dlq_retry_failed", error=str(exc))

            # Update DLQ gauge if no retry was attempted (still want a fresh count).
            elif not batch:
                try:
                    async with _make_session() as session:
                        from soulWatch.src.database.models import SoulWatchDLQ
                        count_result = await session.execute(
                            select(func.count()).select_from(SoulWatchDLQ)
                        )
                        self.metrics.dead_letter_size = count_result.scalar() or 0
                except Exception:
                    pass

            self.metrics.last_forward_time = time.time()

            # Keep Prometheus gauge in sync.
            try:
                from soulWatch.src.monitoring.metrics import SIEM_DLQ_SIZE
                SIEM_DLQ_SIZE.set(self.metrics.dead_letter_size)
            except Exception:
                pass

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
            dlq=self.metrics.dead_letter_size,
        )

    async def health_check(self) -> dict:
        try:
            async with _make_session() as session:
                from soulWatch.src.database.models import SoulWatchDLQ
                count_result = await session.execute(
                    select(func.count()).select_from(SoulWatchDLQ)
                )
                dlq_size = count_result.scalar() or 0
        except Exception:
            dlq_size = self.metrics.dead_letter_size

        return {
            "destinations": len(self._forwarders),
            "buffer_size": len(self._buffer),
            "dead_letter_size": dlq_size,
            "running": self._running,
        }


_event_forwarder: Optional[EventForwarder] = None


def get_event_forwarder() -> Optional[EventForwarder]:
    return _event_forwarder


def set_event_forwarder(forwarder: Optional[EventForwarder]) -> None:
    global _event_forwarder
    _event_forwarder = forwarder
