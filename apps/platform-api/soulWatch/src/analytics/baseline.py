"""
Agent behavior baseline engine for SoulWatch.
Builds, persists, and maintains behavioral profiles from audit trail data.
Baselines are persisted to _soulwatch_baselines table and loaded on startup.
"""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func, text, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.models import SoulWatchBaseline

logger = structlog.get_logger(__name__)


@dataclass
class AgentBaseline:
    """Behavioral profile for an agent identity."""

    soulkey_id: uuid.UUID
    typical_request_rate: float = 0.0
    typical_resources: set = field(default_factory=set)
    typical_actions: set = field(default_factory=set)
    typical_scopes: set = field(default_factory=set)
    typical_hours: set = field(default_factory=set)
    typical_denial_rate: float = 0.0
    typical_burst_size: int = 0
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
    from audit trail data. Persists to _soulwatch_baselines table.
    """

    def __init__(self, rebuild_interval_hours: int = 6, lookback_hours: int = 168):
        self._baselines: dict[uuid.UUID, AgentBaseline] = {}
        self._rebuild_interval = rebuild_interval_hours
        self._lookback_hours = lookback_hours
        self._background_task: Optional[asyncio.Task] = None

    @property
    def baselines(self) -> dict[uuid.UUID, AgentBaseline]:
        return self._baselines

    @property
    def tracked_agents_count(self) -> int:
        return len(self._baselines)

    async def load_from_db(self, db: AsyncSession) -> int:
        """Load persisted baselines from database on startup."""
        result = await db.execute(select(SoulWatchBaseline))
        records = list(result.scalars().all())

        count = 0
        for rec in records:
            baseline = AgentBaseline(
                soulkey_id=rec.soulkey_id,
                typical_request_rate=rec.typical_request_rate,
                typical_resources=set(rec.typical_resources or []),
                typical_actions=set(rec.typical_actions or []),
                typical_scopes=set(rec.typical_scopes or []),
                typical_hours=set(rec.typical_hours or []),
                typical_denial_rate=rec.typical_denial_rate,
                typical_burst_size=rec.typical_burst_size,
                last_updated=rec.updated_at or datetime.now(timezone.utc),
            )
            self._baselines[rec.soulkey_id] = baseline
            count += 1

        logger.info("baseline.loaded_from_db", count=count)
        return count

    async def build_baseline(
        self,
        db: AsyncSession,
        soulkey_id: uuid.UUID,
        lookback_hours: Optional[int] = None,
    ) -> AgentBaseline:
        """
        Analyze the last `lookback_hours` of audit data from _soulauth_audit
        to build a behavioral baseline for an agent.
        """
        hours = lookback_hours or self._lookback_hours
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

        # Read from SoulAuth's audit table (read-only)
        result = await db.execute(
            text(
                "SELECT event_type, resource, action, scope, decision, timestamp "
                "FROM _soulauth_audit "
                "WHERE soulkey_id = :sk_id AND timestamp >= :cutoff "
                "ORDER BY timestamp ASC"
            ),
            {"sk_id": str(soulkey_id), "cutoff": cutoff},
        )
        events = result.fetchall()

        if not events:
            baseline = AgentBaseline(soulkey_id=soulkey_id)
            self._baselines[soulkey_id] = baseline
            await self._persist_baseline(db, baseline, events_analyzed=0, lookback_hours=hours)
            return baseline

        resources = set()
        actions = set()
        scopes = set()
        active_hours = set()
        deny_count = 0
        total_count = len(events)
        minute_buckets: dict[str, int] = {}

        for row in events:
            event_type, resource, action, scope, decision, ts = row
            if resource:
                resources.add(resource)
            if action:
                actions.add(action)
            if scope:
                scopes.add(scope)
            if ts:
                active_hours.add(ts.hour)
                minute_key = ts.strftime("%Y-%m-%d-%H-%M")
                minute_buckets[minute_key] = minute_buckets.get(minute_key, 0) + 1
            if decision == "deny":
                deny_count += 1

        hours_elapsed = max(hours, 1)
        request_rate = total_count / hours_elapsed
        denial_rate = deny_count / total_count if total_count > 0 else 0.0
        burst_size = max(minute_buckets.values()) if minute_buckets else 0

        baseline = AgentBaseline(
            soulkey_id=soulkey_id,
            typical_request_rate=round(request_rate, 2),
            typical_resources=resources,
            typical_actions=actions,
            typical_scopes=scopes,
            typical_hours=active_hours,
            typical_denial_rate=round(denial_rate, 4),
            typical_burst_size=burst_size,
            last_updated=datetime.now(timezone.utc),
        )

        self._baselines[soulkey_id] = baseline
        await self._persist_baseline(db, baseline, events_analyzed=total_count, lookback_hours=hours)

        logger.info(
            "baseline.built",
            soulkey_id=str(soulkey_id),
            events_analyzed=total_count,
            request_rate=baseline.typical_request_rate,
        )
        return baseline

    async def _persist_baseline(
        self,
        db: AsyncSession,
        baseline: AgentBaseline,
        events_analyzed: int = 0,
        lookback_hours: int = 168,
    ) -> None:
        """Write or update baseline in the _soulwatch_baselines table."""
        existing = await db.execute(
            select(SoulWatchBaseline).where(
                SoulWatchBaseline.soulkey_id == baseline.soulkey_id
            )
        )
        record = existing.scalar_one_or_none()

        if record:
            record.typical_request_rate = baseline.typical_request_rate
            record.typical_resources = sorted(baseline.typical_resources)
            record.typical_actions = sorted(baseline.typical_actions)
            record.typical_scopes = sorted(baseline.typical_scopes)
            record.typical_hours = sorted(baseline.typical_hours)
            record.typical_denial_rate = baseline.typical_denial_rate
            record.typical_burst_size = baseline.typical_burst_size
            record.events_analyzed = events_analyzed
            record.lookback_hours = lookback_hours
            record.updated_at = datetime.now(timezone.utc)
        else:
            record = SoulWatchBaseline(
                soulkey_id=baseline.soulkey_id,
                typical_request_rate=baseline.typical_request_rate,
                typical_resources=sorted(baseline.typical_resources),
                typical_actions=sorted(baseline.typical_actions),
                typical_scopes=sorted(baseline.typical_scopes),
                typical_hours=sorted(baseline.typical_hours),
                typical_denial_rate=baseline.typical_denial_rate,
                typical_burst_size=baseline.typical_burst_size,
                events_analyzed=events_analyzed,
                lookback_hours=lookback_hours,
            )
            db.add(record)

        try:
            await db.flush()
        except Exception as e:
            logger.error("baseline.persist_failed", soulkey_id=str(baseline.soulkey_id), error=str(e))

    async def get_baseline(self, soulkey_id: uuid.UUID) -> Optional[AgentBaseline]:
        """Retrieve cached baseline for a soulkey."""
        return self._baselines.get(soulkey_id)

    async def rebuild_all(self, db: AsyncSession) -> int:
        """Rebuild baselines for all active soulkeys found in recent audit data."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=self._lookback_hours)

        result = await db.execute(
            text(
                "SELECT DISTINCT soulkey_id FROM _soulauth_audit "
                "WHERE soulkey_id IS NOT NULL AND timestamp >= :cutoff"
            ),
            {"cutoff": cutoff},
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
                        await db.commit()
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
