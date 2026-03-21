"""
Agent behavior baseline engine.
Builds and maintains behavioral profiles from audit trail data
to power anomaly detection.
"""

import asyncio
import statistics
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

    # --- New fields for expanded anomaly types (Phase 7) ---
    typical_key_rotation_rate: float = 0.0       # key rotations per hour (CREDENTIAL_ROTATION)
    typical_models: set = field(default_factory=set)  # model IDs agent normally uses (MODEL_ABUSE)
    typical_token_ratio: float = 0.0             # output_tokens / input_tokens ratio (TOKEN_HARVESTING)
    typical_tenant_ids: set = field(default_factory=set)  # tenant IDs agent normally touches (LATERAL_MOVEMENT)
    typical_active_days: set = field(default_factory=set)  # set of weekday ints 0-6 (PERSISTENCE)
    typical_request_variance: float = 0.0        # std dev of inter-request intervals seconds (EVASION)
    typical_dependencies: set = field(default_factory=set)  # known-good dependency refs (SUPPLY_CHAIN)
    typical_cpu_ms_per_request: float = 0.0      # avg cpu milliseconds per request (RESOURCE_ABUSE)
    # SESSION_HIJACK uses typical_actions/context persona comparison
    # DATA_POISONING uses event_type frequency from context

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
            # Phase 7 additions
            "typical_key_rotation_rate": self.typical_key_rotation_rate,
            "typical_models": sorted(self.typical_models),
            "typical_token_ratio": self.typical_token_ratio,
            "typical_tenant_ids": [str(t) for t in self.typical_tenant_ids],
            "typical_active_days": sorted(self.typical_active_days),
            "typical_request_variance": self.typical_request_variance,
            "typical_dependencies": sorted(self.typical_dependencies),
            "typical_cpu_ms_per_request": self.typical_cpu_ms_per_request,
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
        Analyze the last lookback_hours (default 7 days) of audit data
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

        # Compute existing metrics
        resources = set()
        actions = set()
        scopes = set()
        hours = set()
        deny_count = 0
        total_count = len(events)

        # For burst calculation: group events by minute
        minute_buckets: dict[str, int] = {}

        # Phase 7 baseline accumulators
        key_rotation_count = 0
        models: set = set()
        token_ratios: list[float] = []
        tenant_ids: set = set()
        active_days: set = set()
        request_timestamps: list[float] = []
        dependencies: set = set()
        cpu_ms_values: list[float] = []

        for event in events:
            if event.resource:
                resources.add(event.resource)
            if event.action:
                actions.add(event.action)
            if event.scope:
                scopes.add(event.scope)
            if event.timestamp:
                hours.add(event.timestamp.hour)
                active_days.add(event.timestamp.weekday())
                minute_key = event.timestamp.strftime("%Y-%m-%d-%H-%M")
                minute_buckets[minute_key] = minute_buckets.get(minute_key, 0) + 1
                request_timestamps.append(event.timestamp.timestamp())

            if event.decision == "deny":
                deny_count += 1

            # Phase 7 context-based accumulators
            ctx = event.context if isinstance(event.context, dict) else {}

            if event.event_type == "key_rotation":
                key_rotation_count += 1

            model_id = ctx.get("model_id") or ctx.get("model")
            if model_id:
                models.add(str(model_id))

            input_tokens = ctx.get("input_tokens", 0) or 0
            output_tokens = ctx.get("output_tokens", 0) or 0
            if input_tokens > 0:
                token_ratios.append(output_tokens / input_tokens)

            tid = ctx.get("tenant_id")
            if tid:
                try:
                    tenant_ids.add(str(tid))
                except Exception:
                    pass

            for dep in ctx.get("dependencies", []):
                dependencies.add(str(dep))

            cpu_ms = ctx.get("cpu_ms")
            if cpu_ms is not None:
                try:
                    cpu_ms_values.append(float(cpu_ms))
                except (TypeError, ValueError):
                    pass

        # Request rate: total events / lookback hours
        hours_elapsed = max(lookback_hours, 1)
        request_rate = total_count / hours_elapsed

        # Denial rate
        denial_rate = deny_count / total_count if total_count > 0 else 0.0

        # Burst size: max events in any 1-minute bucket
        burst_size = max(minute_buckets.values()) if minute_buckets else 0

        # Key rotation rate (rotations per hour)
        key_rotation_rate = key_rotation_count / hours_elapsed

        # Avg token ratio
        avg_token_ratio = (sum(token_ratios) / len(token_ratios)) if token_ratios else 0.0

        # Request interval variance (std dev in seconds)
        if len(request_timestamps) >= 2:
            request_timestamps.sort()
            intervals = [
                request_timestamps[i + 1] - request_timestamps[i]
                for i in range(len(request_timestamps) - 1)
            ]
            try:
                request_variance = statistics.stdev(intervals) if len(intervals) >= 2 else 0.0
            except statistics.StatisticsError:
                request_variance = 0.0
        else:
            request_variance = 0.0

        # Avg CPU ms per request
        avg_cpu_ms = (sum(cpu_ms_values) / len(cpu_ms_values)) if cpu_ms_values else 0.0

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
            # Phase 7 fields
            typical_key_rotation_rate=round(key_rotation_rate, 4),
            typical_models=models,
            typical_token_ratio=round(avg_token_ratio, 4),
            typical_tenant_ids=tenant_ids,
            typical_active_days=active_days,
            typical_request_variance=round(request_variance, 2),
            typical_dependencies=dependencies,
            typical_cpu_ms_per_request=round(avg_cpu_ms, 2),
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
        """Incremental baseline update -- rebuilds from last 7 days."""
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
