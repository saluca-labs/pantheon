"""
Event ingestion for SoulWatch.

Two modes:
- Sidecar: polls _soulauth_audit table on interval, tracks last_processed_id
- Standalone: receives events via POST /watch/v1/events (see router in main.py)
"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.pipeline.processor import process_event

logger = structlog.get_logger(__name__)


class AuditTablePoller:
    """
    Sidecar mode: polls SoulAuth's _soulauth_audit table for new events.
    Tracks the last processed event ID to avoid reprocessing.
    """

    def __init__(
        self,
        session_factory,
        poll_interval: int = 5,
        batch_size: int = 100,
    ):
        self._session_factory = session_factory
        self._poll_interval = poll_interval
        self._batch_size = batch_size
        self._last_processed_id: Optional[uuid.UUID] = None
        self._last_processed_ts: Optional[datetime] = None
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._events_processed = 0

    async def _find_starting_point(self, db: AsyncSession) -> None:
        """Find the most recent audit event to start polling from."""
        result = await db.execute(
            text(
                "SELECT id, timestamp FROM _soulauth_audit "
                "ORDER BY timestamp DESC, id DESC LIMIT 1"
            )
        )
        row = result.fetchone()
        if row:
            self._last_processed_id = row[0]
            self._last_processed_ts = row[1]
            logger.info(
                "poller.starting_point",
                last_id=str(self._last_processed_id),
                last_ts=str(self._last_processed_ts),
            )

    async def _poll_once(self) -> int:
        """Poll for new events and process them. Returns count of events processed."""
        async with self._session_factory() as db:
            try:
                if self._last_processed_ts is None:
                    await self._find_starting_point(db)
                    await db.commit()
                    return 0

                # Query for events newer than our last checkpoint
                result = await db.execute(
                    text(
                        "SELECT id, tenant_id, timestamp, event_type, soulkey_id, "
                        "persona_id, resource, action, scope, decision, reason, "
                        "capability_id, context "
                        "FROM _soulauth_audit "
                        "WHERE (timestamp, id) > (:last_ts, :last_id) "
                        "ORDER BY timestamp ASC, id ASC "
                        "LIMIT :batch_size"
                    ),
                    {
                        "last_ts": self._last_processed_ts,
                        "last_id": str(self._last_processed_id),
                        "batch_size": self._batch_size,
                    },
                )
                rows = result.fetchall()

                if not rows:
                    return 0

                count = 0
                for row in rows:
                    event = {
                        "id": str(row[0]),
                        "tenant_id": str(row[1]) if row[1] else None,
                        "timestamp": row[2].isoformat() if row[2] else None,
                        "event_type": row[3],
                        "soulkey_id": str(row[4]) if row[4] else None,
                        "persona_id": row[5],
                        "resource": row[6],
                        "action": row[7],
                        "scope": row[8],
                        "decision": row[9],
                        "reason": row[10],
                        "capability_id": str(row[11]) if row[11] else None,
                        "context": row[12] or {},
                    }

                    try:
                        await process_event(event, db)
                        count += 1
                    except Exception as e:
                        logger.error("poller.event_processing_failed", event_id=event["id"], error=str(e))

                    self._last_processed_id = row[0]
                    self._last_processed_ts = row[2]

                await db.commit()
                self._events_processed += count

                if count > 0:
                    logger.debug("poller.batch_processed", count=count)

                return count

            except Exception as e:
                logger.error("poller.poll_failed", error=str(e))
                try:
                    await db.rollback()
                except Exception:
                    pass
                return 0

    async def _poll_loop(self) -> None:
        """Background polling loop."""
        logger.info("poller.started", interval=self._poll_interval, batch_size=self._batch_size)

        while self._running:
            try:
                count = await self._poll_once()
                # If we got a full batch, poll again immediately
                if count >= self._batch_size:
                    continue
                await asyncio.sleep(self._poll_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("poller.loop_error", error=str(e))
                await asyncio.sleep(self._poll_interval)

    def start(self) -> None:
        """Start the background polling loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("poller.started")

    async def stop(self) -> None:
        """Stop the polling loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("poller.stopped", events_processed=self._events_processed)

    def get_status(self) -> dict:
        """Return current poller status."""
        return {
            "running": self._running,
            "events_processed": self._events_processed,
            "last_processed_id": str(self._last_processed_id) if self._last_processed_id else None,
            "last_processed_ts": self._last_processed_ts.isoformat() if self._last_processed_ts else None,
            "poll_interval": self._poll_interval,
            "batch_size": self._batch_size,
        }
