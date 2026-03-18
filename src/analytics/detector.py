"""
Anomaly detection engine for SoulAuth.
Checks auth events against agent baselines to detect
suspicious behavior patterns.
"""

import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.analytics.baseline import AgentBaseline, BaselineEngine
from src.database.models import AuditLog

logger = structlog.get_logger(__name__)


class AnomalyType(str, Enum):
    """Categories of behavioral anomalies."""

    RATE_SPIKE = "rate_spike"
    OFF_HOURS = "off_hours"
    NEW_RESOURCE = "new_resource"
    SCOPE_ESCALATION = "scope_escalation"
    DENIAL_SPIKE = "denial_spike"
    BURST = "burst"
    IMPOSSIBLE_TRAVEL = "impossible_travel"
    CREDENTIAL_STUFFING = "credential_stuffing"


# Severity levels for anomalies
SEVERITY_LOW = "low"
SEVERITY_MEDIUM = "medium"
SEVERITY_HIGH = "high"
SEVERITY_CRITICAL = "critical"


@dataclass
class Anomaly:
    """A detected behavioral anomaly."""

    type: AnomalyType
    severity: str
    soulkey_id: uuid.UUID
    description: str
    evidence: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    baseline_value: Any = None
    observed_value: Any = None

    def to_dict(self) -> dict:
        """Serialize for API responses."""
        return {
            "type": self.type.value,
            "severity": self.severity,
            "soulkey_id": str(self.soulkey_id),
            "description": self.description,
            "evidence": self.evidence,
            "timestamp": self.timestamp.isoformat(),
            "baseline_value": _serialize_value(self.baseline_value),
            "observed_value": _serialize_value(self.observed_value),
        }


def _serialize_value(val: Any) -> Any:
    """Convert sets and other non-JSON types for serialization."""
    if isinstance(val, set):
        return sorted(val)
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, uuid.UUID):
        return str(val)
    return val


class AnomalyDetector:
    """
    Real-time anomaly detection engine.
    Uses sliding windows and baselines to detect suspicious agent behavior.
    """

    # Default thresholds (multipliers or absolute values)
    DEFAULT_THRESHOLDS = {
        AnomalyType.RATE_SPIKE: 3.0,        # 3x baseline rate
        AnomalyType.OFF_HOURS: 1,            # any activity outside typical hours
        AnomalyType.NEW_RESOURCE: 1,         # any new resource
        AnomalyType.SCOPE_ESCALATION: 1,     # any new scope
        AnomalyType.DENIAL_SPIKE: 2.0,       # 2x baseline denial rate
        AnomalyType.BURST: 2.0,              # 2x baseline burst size
        AnomalyType.IMPOSSIBLE_TRAVEL: 1,    # any impossible travel
        AnomalyType.CREDENTIAL_STUFFING: 5,  # 5 failed attempts with different keys
    }

    def __init__(
        self,
        baseline_engine: BaselineEngine,
        thresholds: Optional[dict] = None,
        window_size: int = 300,  # 5 minute sliding window in seconds
    ):
        self._baseline_engine = baseline_engine
        self._thresholds = {**self.DEFAULT_THRESHOLDS, **(thresholds or {})}
        self._window_size = window_size

        # Sliding windows: soulkey_id -> deque of (timestamp, event_dict)
        self._event_windows: dict[uuid.UUID, deque] = {}

        # Recent anomalies ring buffer
        self._recent_anomalies: deque = deque(maxlen=1000)

        # Track failed auth attempts for credential stuffing: source_ip -> deque of (ts, key_used)
        self._failed_auth_window: dict[str, deque] = {}

    async def check_event(self, event: AuditLog) -> list[Anomaly]:
        """
        Check a single audit event against baselines.
        Returns a list of detected anomalies (may be empty).
        """
        if not event.soulkey_id:
            return await self._check_unauthenticated_event(event)

        anomalies = []
        soulkey_id = event.soulkey_id
        baseline = await self._baseline_engine.get_baseline(soulkey_id)

        # Record event in sliding window
        self._record_event(soulkey_id, event)

        # No baseline means this is a new or unseen agent — skip most checks
        # but still check credential stuffing
        if not baseline:
            if event.resource and event.decision != "deny":
                # New agent accessing resources — note it but low severity
                anomalies.append(Anomaly(
                    type=AnomalyType.NEW_RESOURCE,
                    severity=SEVERITY_LOW,
                    soulkey_id=soulkey_id,
                    description=f"No baseline exists for agent; accessing resource '{event.resource}'",
                    evidence={"resource": event.resource, "action": event.action},
                    baseline_value=None,
                    observed_value=event.resource,
                ))
            return anomalies

        # Off-hours check
        if event.timestamp and baseline.typical_hours:
            current_hour = event.timestamp.hour
            if current_hour not in baseline.typical_hours:
                anomalies.append(Anomaly(
                    type=AnomalyType.OFF_HOURS,
                    severity=SEVERITY_MEDIUM,
                    soulkey_id=soulkey_id,
                    description=f"Activity at hour {current_hour} UTC outside typical hours",
                    evidence={"event_type": event.event_type, "hour": current_hour},
                    baseline_value=baseline.typical_hours,
                    observed_value=current_hour,
                ))

        # New resource check
        if event.resource and baseline.typical_resources:
            if event.resource not in baseline.typical_resources:
                anomalies.append(Anomaly(
                    type=AnomalyType.NEW_RESOURCE,
                    severity=SEVERITY_MEDIUM,
                    soulkey_id=soulkey_id,
                    description=f"Accessing new resource '{event.resource}' not in baseline",
                    evidence={"resource": event.resource, "action": event.action},
                    baseline_value=baseline.typical_resources,
                    observed_value=event.resource,
                ))

        # Scope escalation check
        if event.scope and baseline.typical_scopes:
            if event.scope not in baseline.typical_scopes:
                anomalies.append(Anomaly(
                    type=AnomalyType.SCOPE_ESCALATION,
                    severity=SEVERITY_HIGH,
                    soulkey_id=soulkey_id,
                    description=f"Requesting scope '{event.scope}' not in baseline",
                    evidence={"scope": event.scope, "resource": event.resource},
                    baseline_value=baseline.typical_scopes,
                    observed_value=event.scope,
                ))

        # Rate spike + burst check (from sliding window)
        window = self._event_windows.get(soulkey_id, deque())
        window_events = list(window)

        if window_events and baseline.typical_request_rate > 0:
            # Calculate current rate (requests in window extrapolated to per-hour)
            window_seconds = self._window_size
            current_rate = (len(window_events) / window_seconds) * 3600
            threshold = baseline.typical_request_rate * self._thresholds[AnomalyType.RATE_SPIKE]
            if current_rate > threshold:
                anomalies.append(Anomaly(
                    type=AnomalyType.RATE_SPIKE,
                    severity=SEVERITY_HIGH,
                    soulkey_id=soulkey_id,
                    description=f"Request rate {current_rate:.1f}/hr exceeds {threshold:.1f}/hr threshold",
                    evidence={"window_events": len(window_events), "window_seconds": window_seconds},
                    baseline_value=baseline.typical_request_rate,
                    observed_value=round(current_rate, 2),
                ))

        # Burst check: count events in the last 60 seconds
        if baseline.typical_burst_size > 0:
            now = datetime.now(timezone.utc)
            one_min_ago = now - timedelta(seconds=60)
            recent_burst = sum(
                1 for ts, _ in window_events
                if ts >= one_min_ago
            )
            burst_threshold = int(baseline.typical_burst_size * self._thresholds[AnomalyType.BURST])
            if recent_burst > burst_threshold:
                anomalies.append(Anomaly(
                    type=AnomalyType.BURST,
                    severity=SEVERITY_HIGH,
                    soulkey_id=soulkey_id,
                    description=f"Burst of {recent_burst} requests in 60s exceeds threshold {burst_threshold}",
                    evidence={"burst_count": recent_burst, "window_seconds": 60},
                    baseline_value=baseline.typical_burst_size,
                    observed_value=recent_burst,
                ))

        # Denial spike check (from sliding window)
        if window_events:
            deny_count = sum(1 for _, e in window_events if e.get("decision") == "deny")
            window_denial_rate = deny_count / len(window_events) if window_events else 0
            if baseline.typical_denial_rate > 0:
                denial_threshold = baseline.typical_denial_rate * self._thresholds[AnomalyType.DENIAL_SPIKE]
                if window_denial_rate > denial_threshold and deny_count >= 3:
                    anomalies.append(Anomaly(
                        type=AnomalyType.DENIAL_SPIKE,
                        severity=SEVERITY_HIGH,
                        soulkey_id=soulkey_id,
                        description=f"Denial rate {window_denial_rate:.1%} exceeds threshold {denial_threshold:.1%}",
                        evidence={"deny_count": deny_count, "total_count": len(window_events)},
                        baseline_value=baseline.typical_denial_rate,
                        observed_value=round(window_denial_rate, 4),
                    ))

        # Impossible travel check (if node context available)
        if event.context and isinstance(event.context, dict):
            node = event.context.get("node")
            if node and len(window_events) >= 2:
                prev_ts, prev_event = window_events[-2]
                prev_node = prev_event.get("node")
                if prev_node and prev_node != node:
                    time_diff = (event.timestamp - prev_ts).total_seconds() if event.timestamp else 999
                    # If two different nodes within 2 seconds, flag as impossible
                    if time_diff < 2:
                        anomalies.append(Anomaly(
                            type=AnomalyType.IMPOSSIBLE_TRAVEL,
                            severity=SEVERITY_CRITICAL,
                            soulkey_id=soulkey_id,
                            description=f"Requests from nodes '{prev_node}' and '{node}' within {time_diff:.1f}s",
                            evidence={"node_a": prev_node, "node_b": node, "time_diff_seconds": time_diff},
                            baseline_value="same node or >2s between nodes",
                            observed_value=f"{prev_node} -> {node} in {time_diff:.1f}s",
                        ))

        # Store detected anomalies
        for anomaly in anomalies:
            self._recent_anomalies.append(anomaly)

        if anomalies:
            logger.warning(
                "anomaly.detected",
                soulkey_id=str(soulkey_id),
                count=len(anomalies),
                types=[a.type.value for a in anomalies],
            )

        return anomalies

    async def _check_unauthenticated_event(self, event: AuditLog) -> list[Anomaly]:
        """Check for credential stuffing on unauthenticated/failed events."""
        anomalies = []

        if event.decision == "deny" and event.event_type == "auth_deny":
            source = "unknown"
            if event.context and isinstance(event.context, dict):
                source = event.context.get("source_ip", event.context.get("node", "unknown"))

            if source not in self._failed_auth_window:
                self._failed_auth_window[source] = deque(maxlen=100)

            now = datetime.now(timezone.utc)
            self._failed_auth_window[source].append((now, event.reason or ""))

            # Clean old entries
            cutoff = now - timedelta(minutes=5)
            while self._failed_auth_window[source] and self._failed_auth_window[source][0][0] < cutoff:
                self._failed_auth_window[source].popleft()

            recent_failures = len(self._failed_auth_window[source])
            threshold = self._thresholds[AnomalyType.CREDENTIAL_STUFFING]

            if recent_failures >= threshold:
                anomaly = Anomaly(
                    type=AnomalyType.CREDENTIAL_STUFFING,
                    severity=SEVERITY_CRITICAL,
                    soulkey_id=event.soulkey_id or uuid.UUID("00000000-0000-0000-0000-000000000000"),
                    description=f"Credential stuffing detected: {recent_failures} failed attempts from '{source}' in 5 minutes",
                    evidence={"source": source, "failure_count": recent_failures},
                    baseline_value=threshold,
                    observed_value=recent_failures,
                )
                anomalies.append(anomaly)
                self._recent_anomalies.append(anomaly)

        return anomalies

    async def check_window(
        self,
        db: AsyncSession,
        soulkey_id: uuid.UUID,
        window_minutes: int = 5,
    ) -> list[Anomaly]:
        """
        Check the recent window of events from the database for anomaly patterns.
        Useful for periodic batch checks.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)

        result = await db.execute(
            select(AuditLog)
            .where(
                AuditLog.soulkey_id == soulkey_id,
                AuditLog.timestamp >= cutoff,
            )
            .order_by(AuditLog.timestamp.asc())
        )
        events = list(result.scalars().all())

        all_anomalies = []
        for event in events:
            anomalies = await self.check_event(event)
            all_anomalies.extend(anomalies)

        return all_anomalies

    async def get_recent_anomalies(
        self,
        limit: int = 50,
        anomaly_type: Optional[AnomalyType] = None,
        severity: Optional[str] = None,
        soulkey_id: Optional[uuid.UUID] = None,
    ) -> list[Anomaly]:
        """Retrieve recent detections with optional filters."""
        anomalies = list(self._recent_anomalies)
        anomalies.reverse()  # Most recent first

        if anomaly_type:
            anomalies = [a for a in anomalies if a.type == anomaly_type]
        if severity:
            anomalies = [a for a in anomalies if a.severity == severity]
        if soulkey_id:
            anomalies = [a for a in anomalies if a.soulkey_id == soulkey_id]

        return anomalies[:limit]

    def _record_event(self, soulkey_id: uuid.UUID, event: AuditLog):
        """Add event to the sliding window for this agent."""
        if soulkey_id not in self._event_windows:
            self._event_windows[soulkey_id] = deque(maxlen=500)

        now = event.timestamp or datetime.now(timezone.utc)
        event_data = {
            "event_type": event.event_type,
            "resource": event.resource,
            "action": event.action,
            "scope": event.scope,
            "decision": event.decision,
            "node": event.context.get("node") if event.context and isinstance(event.context, dict) else None,
        }
        self._event_windows[soulkey_id].append((now, event_data))

        # Prune old entries beyond window
        cutoff = now - timedelta(seconds=self._window_size)
        while self._event_windows[soulkey_id] and self._event_windows[soulkey_id][0][0] < cutoff:
            self._event_windows[soulkey_id].popleft()

    def get_dashboard_stats(self, hours: int = 24) -> dict:
        """
        Generate summary stats for the analytics dashboard.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        recent = [a for a in self._recent_anomalies if a.timestamp >= cutoff]

        # Count by type
        by_type = {}
        for a in recent:
            by_type[a.type.value] = by_type.get(a.type.value, 0) + 1

        # Count by severity
        by_severity = {}
        for a in recent:
            by_severity[a.severity] = by_severity.get(a.severity, 0) + 1

        # Most anomalous agents
        agent_counts: dict[str, int] = {}
        for a in recent:
            key = str(a.soulkey_id)
            agent_counts[key] = agent_counts.get(key, 0) + 1

        top_agents = sorted(agent_counts.items(), key=lambda x: x[1], reverse=True)[:10]

        return {
            "period_hours": hours,
            "total_anomalies": len(recent),
            "by_type": by_type,
            "by_severity": by_severity,
            "top_anomalous_agents": [
                {"soulkey_id": sk, "anomaly_count": c} for sk, c in top_agents
            ],
            "tracked_baselines": self._baseline_engine.tracked_agents_count,
        }
