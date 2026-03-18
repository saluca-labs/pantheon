"""
Agent behavior baseline engine.
Builds and maintains behavioral profiles from audit trail data
to power anomaly detection.
"""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import AuditLog

logger = structlog.get_logger(__name__)


@dataclass
class AgentBaseline:
    """Behavioral profile for an agent identity."""

    soulkey_id: uuid.UUID
    typical_request_rate: float = 0.0  # requests per hour
    typical_resources: set = field(default_factory=set)
    typical_actions: set = field(default_factory=set)
    typical_scopes: set = field(default_factory=set)
    typical_hours: set = field(default_factory=set)  # hours of day when active (UTC)
    typical_denial_rate: float = 0.0  # fraction 0.0-1.0
    typical_burst_size: int = 0  # max requests in 1 minute
    last_updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        """Serialize baseline for API responses."""
        return {
            "soulkey_id": str(self.soulkey_id),
            "typical_request_rate": self.typical_request_rate,
            "typical_resources": sorted(self.typical_resources),
            "typical_actions": sorted(self.typical_actions),
            "typical_scopes": sorted(self.typical_scopes),
            "typical_hours": sorted(self.typical_hours),
            "typical_denial_rate": self.typical_denial_rate,
            "typical_burst_size": self.typical_burst_size,
            "last_updated": self.last_updated.isoformat(),
        }


class BaselineEngine:
    """
    Builds, caches, and maintains agent behavioral baselines
    from audit trail data.
    """

    def __init__(self, rebuild_interval_hours: int = 6):
        self._baselines: dict[uuid.UUID, AgentBaseline] = {}
        self._rebuild_interval = rebuild_interval_hours
        self._background_task: Optional[asyncio.Task] = None

    @property
    def baselines(self) -> dict[uuid.UUID, AgentBaseline]:
        return self._baselines

    async def build_baseline(
        self,
        db: AsyncSession,
        soulkey_id: uuid.UUID,
        lookback_hours: int = 168,
    ) -> AgentBaseline:
        """
        Analyze the last `lookback_hours` (default 7 days) of audit data
        to build a behavioral baseline for an agent.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)

        # Fetch all events for this soulkey in the window
        result = await db.execute(
            select(AuditLog)
            .where(
                AuditLog.soulkey_id == soulkey_id,
                AuditLog.timestamp >= cutoff,
            )
            .order_by(AuditLog.timestamp.asc())
        )
        events = list(result.scalars().all())

        if not events:
            baseline = AgentBaseline(soulkey_id=soulkey_id)
            self._baselines[soulkey_id] = baseline
            return baseline

        # Compute metrics
        resources = set()
        actions = set()
        scopes = set()
        hours = set()
        deny_count = 0
        total_count = len(events)

        # For burst calculation: group events by minute
        minute_buckets: dict[str, int] = {}

        for event in events:
            if event.resource:
                resources.add(event.resource)
            if event.action:
                actions.add(event.action)
            if event.scope:
                scopes.add(event.scope)
            if event.timestamp:
                hours.add(event.timestamp.hour)
                minute_key = event.timestamp.strftime("%Y-%m-%d-%H-%M")
                minute_buckets[minute_key] = minute_buckets.get(minute_key, 0) + 1

            if event.decision == "deny":
                deny_count += 1

        # Request rate: total events / lookback hours
        hours_elapsed = max(lookback_hours, 1)
        request_rate = total_count / hours_elapsed

        # Denial rate
        denial_rate = deny_count / total_count if total_count > 0 else 0.0

        # Burst size: max events in any 1-minute bucket
        burst_size = max(minute_buckets.values()) if minute_buckets else 0

        baseline = AgentBaseline(
            soulkey_id=soulkey_id,
            typical_request_rate=round(request_rate, 2),
            typical_resources=resources,
            typical_actions=actions,
            typical_scopes=scopes,
            typical_hours=hours,
            typical_denial_rate=round(denial_rate, 4),
            typical_burst_size=burst_size,
            last_updated=datetime.now(timezone.utc),
        )

        self._baselines[soulkey_id] = baseline
        logger.info(
            "baseline.built",
            soulkey_id=str(soulkey_id),
            events_analyzed=total_count,
            request_rate=baseline.typical_request_rate,
        )
        return baseline

    async def update_baseline(
        self,
        db: AsyncSession,
        soulkey_id: uuid.UUID,
    ) -> AgentBaseline:
        """Incremental baseline update — rebuilds from last 7 days."""
        return await self.build_baseline(db, soulkey_id)

    async def get_baseline(self, soulkey_id: uuid.UUID) -> Optional[AgentBaseline]:
        """Retrieve cached baseline for a soulkey."""
        return self._baselines.get(soulkey_id)

    async def rebuild_all(self, db: AsyncSession) -> int:
        """
        Rebuild baselines for all active soulkeys found in recent audit data.
        Returns the number of baselines rebuilt.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=168)

        result = await db.execute(
            select(AuditLog.soulkey_id)
            .where(
                AuditLog.soulkey_id.isnot(None),
                AuditLog.timestamp >= cutoff,
            )
            .distinct()
        )
        soulkey_ids = [row[0] for row in result.fetchall()]

        count = 0
        for sk_id in soulkey_ids:
            try:
                await self.build_baseline(db, sk_id)
                count += 1
            except Exception as e:
                logger.warning("baseline.rebuild_failed", soulkey_id=str(sk_id), error=str(e))

        logger.info("baseline.rebuild_all_complete", count=count)
        return count

    def start_background_rebuild(self, session_factory):
        """Start periodic background baseline rebuilds."""
        if self._background_task and not self._background_task.done():
            return

        async def _rebuild_loop():
            while True:
                try:
                    await asyncio.sleep(self._rebuild_interval * 3600)
                    async with session_factory() as db:
                        await self.rebuild_all(db)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.warning("baseline.background_rebuild_failed", error=str(e))

        self._background_task = asyncio.create_task(_rebuild_loop())
        logger.info("baseline.background_rebuild_started", interval_hours=self._rebuild_interval)

    def stop_background_rebuild(self):
        """Stop the background rebuild task."""
        if self._background_task and not self._background_task.done():
            self._background_task.cancel()
            self._background_task = None
            logger.info("baseline.background_rebuild_stopped")

    @property
    def tracked_agents_count(self) -> int:
        return len(self._baselines)
