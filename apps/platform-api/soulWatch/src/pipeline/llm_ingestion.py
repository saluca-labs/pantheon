"""
LLM Call ingestion for SoulWatch.

Polls the tiresias_audit_log table (shared PostgreSQL database) for new LLM
call records and writes summary detections to _soulwatch_detections.

This poller mirrors the AuditTablePoller pattern from ingestion.py but targets
Tiresias Proxy telemetry rather than SoulAuth auth events.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.models import SoulWatchDetection

logger = structlog.get_logger(__name__)


class LLMCallPoller:
    """
    Polls tiresias_audit_log for new LLM call records.
    Tracks checkpoint via (created_at, id) composite cursor.
    Each new row is persisted as a detection record with event_type=llm_call.
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
        self._last_processed_id: Optional[str] = None
        self._last_processed_ts: Optional[datetime] = None
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._events_processed = 0

    async def _find_starting_point(self, db: AsyncSession) -> None:
        """Find the most recent audit log entry to start polling from."""
        result = await db.execute(
            text(
                "SELECT id, created_at FROM tiresias_audit_log "
                "ORDER BY created_at DESC, id DESC LIMIT 1"
            )
        )
        row = result.fetchone()
        if row:
            self._last_processed_id = row[0]
            self._last_processed_ts = row[1]
            logger.info(
                "llm_poller.starting_point",
                last_id=str(self._last_processed_id),
                last_ts=str(self._last_processed_ts),
            )

    async def _poll_once(self) -> int:
        """Poll for new LLM call records and persist them. Returns count processed."""
        async with self._session_factory() as db:
            try:
                if self._last_processed_ts is None:
                    await self._find_starting_point(db)
                    await db.commit()
                    return 0

                # Query for rows newer than our checkpoint
                result = await db.execute(
                    text(
                        "SELECT id, tenant_id, model, provider, token_count, "
                        "cost_usd, session_id, request_hash, response_hash, created_at "
                        "FROM tiresias_audit_log "
                        "WHERE (created_at, id) > (:last_ts, :last_id) "
                        "ORDER BY created_at ASC, id ASC "
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
                        "model": row[2],
                        "provider": row[3],
                        "token_count": row[4],
                        "cost_usd": float(row[5]) if row[5] is not None else None,
                        "session_id": row[6],
                        "request_hash": row[7],
                        "response_hash": row[8],
                        "created_at": row[9].isoformat() if row[9] else None,
                        "event_type": "llm_call",
                    }

                    try:
                        # Persist as a SoulWatch detection record
                        detection = SoulWatchDetection(
                            rule_id="tiresias.llm_call",
                            rule_title="LLM Call Logged",
                            level="informational",
                            tenant_id=uuid.UUID(event["tenant_id"]) if event.get("tenant_id") else None,
                            matched_fields={
                                "model": event["model"],
                                "provider": event["provider"],
                                "token_count": event["token_count"],
                                "cost_usd": event["cost_usd"],
                            },
                            event_data=event,
                        )
                        db.add(detection)
                        count += 1
                    except Exception as e:
                        logger.error(
                            "llm_poller.event_processing_failed",
                            event_id=event["id"],
                            error=str(e),
                        )

                    # Advance checkpoint
                    self._last_processed_id = row[0]
                    self._last_processed_ts = row[9]

                await db.commit()
                self._events_processed += count

                if count > 0:
                    logger.debug("llm_poller.batch_processed", count=count)

                return count

            except Exception as e:
                logger.error("llm_poller.poll_failed", error=str(e))
                try:
                    await db.rollback()
                except Exception:
                    pass
                return 0

    async def _poll_loop(self) -> None:
        """Background polling loop."""
        logger.info(
            "llm_poller.started",
            interval=self._poll_interval,
            batch_size=self._batch_size,
        )

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
                logger.error("llm_poller.loop_error", error=str(e))
                await asyncio.sleep(self._poll_interval)

    def start(self) -> None:
        """Start the background polling loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("llm_poller.started")

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
        logger.info("llm_poller.stopped", events_processed=self._events_processed)

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
