"""
Anomaly detection engine for SoulWatch.
Checks auth events against agent baselines to detect suspicious behavior patterns.
Writes anomalies to _soulwatch_anomalies table instead of in-memory deque.
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

from soulWatch.src.analytics.baseline import AgentBaseline, BaselineEngine
from soulWatch.src.database.models import SoulWatchAnomaly

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

    # Phase 7 — advanced threat detection
    SESSION_HIJACK = "session_hijack"
    MODEL_ABUSE = "model_abuse"
    TOKEN_HARVESTING = "token_harvesting"
    DATA_POISONING = "data_poisoning"
    LATERAL_MOVEMENT = "lateral_movement"
    PERSISTENCE = "persistence"
    EVASION = "evasion"
    SUPPLY_CHAIN = "supply_chain"
    RESOURCE_ABUSE = "resource_abuse"
    CREDENTIAL_ROTATION = "credential_rotation"


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
    tenant_id: Optional[uuid.UUID] = None
    source_event_id: Optional[uuid.UUID] = None

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
            "tenant_id": str(self.tenant_id) if self.tenant_id else None,
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
    Persists detected anomalies to the database.
    """

    # Default thresholds (multipliers or absolute values)
    DEFAULT_THRESHOLDS = {
        AnomalyType.RATE_SPIKE: 3.0,
        AnomalyType.OFF_HOURS: 1,
        AnomalyType.NEW_RESOURCE: 1,
        AnomalyType.SCOPE_ESCALATION: 1,
        AnomalyType.DENIAL_SPIKE: 2.0,
        AnomalyType.BURST: 2.0,
        AnomalyType.IMPOSSIBLE_TRAVEL: 1,
        AnomalyType.CREDENTIAL_STUFFING: 5,
        AnomalyType.SESSION_HIJACK: 1,
        AnomalyType.MODEL_ABUSE: 1,
        AnomalyType.TOKEN_HARVESTING: 3.0,
        AnomalyType.DATA_POISONING: 1,
        AnomalyType.LATERAL_MOVEMENT: 1,
        AnomalyType.PERSISTENCE: 1,
        AnomalyType.EVASION: 2.0,
        AnomalyType.SUPPLY_CHAIN: 1,
        AnomalyType.RESOURCE_ABUSE: 5.0,
        AnomalyType.CREDENTIAL_ROTATION: 3,
    }

    def __init__(
        self,
        baseline_engine: BaselineEngine,
        thresholds: Optional[dict] = None,
        window_size: int = 300,
    ):
        self._baseline_engine = baseline_engine
        self._thresholds = {**self.DEFAULT_THRESHOLDS, **(thresholds or {})}
        self._window_size = window_size

        # Sliding windows: soulkey_id -> deque of (timestamp, event_dict)
        self._event_windows: dict[uuid.UUID, deque] = {}

        # Track failed auth attempts for credential stuffing: source -> deque of (ts, key_used)
        self._failed_auth_window: dict[str, deque] = {}

    async def check_event(
        self, event: dict, db: AsyncSession,
    ) -> list[Anomaly]:
        """
        Check a single audit event against baselines.
        Returns a list of detected anomalies (may be empty).
        Persists anomalies to the database.
        """
        soulkey_id_str = event.get("soulkey_id")
        if not soulkey_id_str:
            return await self._check_unauthenticated_event(event, db)

        try:
            soulkey_id = uuid.UUID(str(soulkey_id_str))
        except (ValueError, TypeError):
            return []

        anomalies = []
        baseline = await self._baseline_engine.get_baseline(soulkey_id)

        # Record event in sliding window
        self._record_event(soulkey_id, event)

        tenant_id = None
        if event.get("tenant_id"):
            try:
                tenant_id = uuid.UUID(str(event["tenant_id"]))
            except (ValueError, TypeError):
                pass

        event_id = None
        if event.get("id"):
            try:
                event_id = uuid.UUID(str(event["id"]))
            except (ValueError, TypeError):
                pass

        # No baseline means this is a new or unseen agent
        if not baseline:
            resource = event.get("resource")
            if resource and event.get("decision") != "deny":
                anomalies.append(Anomaly(
                    type=AnomalyType.NEW_RESOURCE,
                    severity=SEVERITY_LOW,
                    soulkey_id=soulkey_id,
                    description=f"No baseline exists for agent; accessing resource '{resource}'",
                    evidence={"resource": resource, "action": event.get("action")},
                    baseline_value=None,
                    observed_value=resource,
                    tenant_id=tenant_id,
                    source_event_id=event_id,
                ))
            if anomalies:
                await self._persist_anomalies(anomalies, db)
            return anomalies

        # Off-hours check
        event_ts = event.get("timestamp")
        if event_ts and baseline.typical_hours:
            if isinstance(event_ts, str):
                try:
                    event_ts = datetime.fromisoformat(event_ts)
                except (ValueError, TypeError):
                    event_ts = None

            if event_ts:
                current_hour = event_ts.hour
                if current_hour not in baseline.typical_hours:
                    anomalies.append(Anomaly(
                        type=AnomalyType.OFF_HOURS,
                        severity=SEVERITY_MEDIUM,
                        soulkey_id=soulkey_id,
                        description=f"Activity at hour {current_hour} UTC outside typical hours",
                        evidence={"event_type": event.get("event_type"), "hour": current_hour},
                        baseline_value=sorted(baseline.typical_hours),
                        observed_value=current_hour,
                        tenant_id=tenant_id,
                        source_event_id=event_id,
                    ))

        # New resource check
        resource = event.get("resource")
        if resource and baseline.typical_resources:
            if resource not in baseline.typical_resources:
                anomalies.append(Anomaly(
                    type=AnomalyType.NEW_RESOURCE,
                    severity=SEVERITY_MEDIUM,
                    soulkey_id=soulkey_id,
                    description=f"Accessing new resource '{resource}' not in baseline",
                    evidence={"resource": resource, "action": event.get("action")},
                    baseline_value=sorted(baseline.typical_resources),
                    observed_value=resource,
                    tenant_id=tenant_id,
                    source_event_id=event_id,
                ))

        # Scope escalation check
        scope = event.get("scope")
        if scope and baseline.typical_scopes:
            if scope not in baseline.typical_scopes:
                anomalies.append(Anomaly(
                    type=AnomalyType.SCOPE_ESCALATION,
                    severity=SEVERITY_HIGH,
                    soulkey_id=soulkey_id,
                    description=f"Requesting scope '{scope}' not in baseline",
                    evidence={"scope": scope, "resource": resource},
                    baseline_value=sorted(baseline.typical_scopes),
                    observed_value=scope,
                    tenant_id=tenant_id,
                    source_event_id=event_id,
                ))

        # Rate spike + burst check (from sliding window)
        window = self._event_windows.get(soulkey_id, deque())
        window_events = list(window)

        if window_events and baseline.typical_request_rate > 0:
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
                    tenant_id=tenant_id,
                    source_event_id=event_id,
                ))

        # Burst check: count events in the last 60 seconds
        if baseline.typical_burst_size > 0:
            now = datetime.now(timezone.utc)
            one_min_ago = now - timedelta(seconds=60)
            recent_burst = sum(1 for ts, _ in window_events if ts >= one_min_ago)
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
                    tenant_id=tenant_id,
                    source_event_id=event_id,
                ))

        # Denial spike check
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
                        tenant_id=tenant_id,
                        source_event_id=event_id,
                    ))

        # Impossible travel check
        context = event.get("context") or {}
        if isinstance(context, dict):
            node = context.get("node")
            if node and len(window_events) >= 2:
                prev_ts, prev_event = window_events[-2]
                prev_node = prev_event.get("node")
                if prev_node and prev_node != node:
                    event_timestamp = event.get("timestamp")
                    if isinstance(event_timestamp, str):
                        try:
                            event_timestamp = datetime.fromisoformat(event_timestamp)
                        except (ValueError, TypeError):
                            event_timestamp = None
                    time_diff = (event_timestamp - prev_ts).total_seconds() if event_timestamp else 999
                    if time_diff < 2:
                        anomalies.append(Anomaly(
                            type=AnomalyType.IMPOSSIBLE_TRAVEL,
                            severity=SEVERITY_CRITICAL,
                            soulkey_id=soulkey_id,
                            description=f"Requests from nodes '{prev_node}' and '{node}' within {time_diff:.1f}s",
                            evidence={"node_a": prev_node, "node_b": node, "time_diff_seconds": time_diff},
                            baseline_value="same node or >2s between nodes",
                            observed_value=f"{prev_node} -> {node} in {time_diff:.1f}s",
                            tenant_id=tenant_id,
                            source_event_id=event_id,
                        ))

        # Phase 7 advanced detectors
        anomalies.extend(await self._check_session_hijack(soulkey_id, event, baseline, tenant_id, event_id))
        anomalies.extend(await self._check_model_abuse(soulkey_id, event, baseline, tenant_id, event_id))
        anomalies.extend(await self._check_token_harvesting(soulkey_id, event, baseline, tenant_id, event_id))
        anomalies.extend(await self._check_lateral_movement(soulkey_id, event, baseline, tenant_id, event_id))
        anomalies.extend(await self._check_resource_abuse(soulkey_id, event, baseline, tenant_id, event_id))
        anomalies.extend(await self._check_credential_rotation(soulkey_id, event, baseline, tenant_id, event_id))

        # Persist all anomalies to database
        if anomalies:
            await self._persist_anomalies(anomalies, db)
            logger.warning(
                "anomaly.detected",
                soulkey_id=str(soulkey_id),
                count=len(anomalies),
                types=[a.type.value for a in anomalies],
            )

        return anomalies

    async def _check_unauthenticated_event(
        self, event: dict, db: AsyncSession,
    ) -> list[Anomaly]:
        """Check for credential stuffing on unauthenticated/failed events."""
        anomalies = []

        if event.get("decision") == "deny" and event.get("event_type") == "auth_deny":
            context = event.get("context") or {}
            source = "unknown"
            if isinstance(context, dict):
                source = context.get("source_ip", context.get("node", "unknown"))

            if source not in self._failed_auth_window:
                self._failed_auth_window[source] = deque(maxlen=100)

            now = datetime.now(timezone.utc)
            self._failed_auth_window[source].append((now, event.get("reason", "")))

            # Clean old entries
            cutoff = now - timedelta(minutes=5)
            while self._failed_auth_window[source] and self._failed_auth_window[source][0][0] < cutoff:
                self._failed_auth_window[source].popleft()

            recent_failures = len(self._failed_auth_window[source])
            threshold = self._thresholds[AnomalyType.CREDENTIAL_STUFFING]

            if recent_failures >= threshold:
                soulkey_id = uuid.UUID("00000000-0000-0000-0000-000000000000")
                if event.get("soulkey_id"):
                    try:
                        soulkey_id = uuid.UUID(str(event["soulkey_id"]))
                    except (ValueError, TypeError):
                        pass

                # Extract tenant_id from event; log a warning when missing so
                # we can track how often unauthenticated events carry no tenant.
                tenant_id: Optional[uuid.UUID] = None
                if event.get("tenant_id"):
                    try:
                        tenant_id = uuid.UUID(str(event["tenant_id"]))
                    except (ValueError, TypeError):
                        pass
                if tenant_id is None:
                    logger.warning(
                        "detector.unauthenticated_event_missing_tenant",
                        source=source,
                        event_type=event.get("event_type"),
                    )

                anomaly = Anomaly(
                    type=AnomalyType.CREDENTIAL_STUFFING,
                    severity=SEVERITY_CRITICAL,
                    soulkey_id=soulkey_id,
                    description=f"Credential stuffing detected: {recent_failures} failed attempts from '{source}' in 5 minutes",
                    evidence={"source": source, "failure_count": recent_failures},
                    baseline_value=threshold,
                    observed_value=recent_failures,
                    tenant_id=tenant_id,
                )
                anomalies.append(anomaly)
                await self._persist_anomalies(anomalies, db)

        return anomalies

    async def _persist_anomalies(
        self, anomalies: list[Anomaly], db: AsyncSession,
    ) -> None:
        """Write anomalies to the _soulwatch_anomalies table."""
        for anomaly in anomalies:
            record = SoulWatchAnomaly(
                soulkey_id=anomaly.soulkey_id,
                tenant_id=anomaly.tenant_id,
                anomaly_type=anomaly.type.value,
                severity=anomaly.severity,
                description=anomaly.description,
                evidence=anomaly.evidence,
                baseline_value=str(_serialize_value(anomaly.baseline_value)) if anomaly.baseline_value is not None else None,
                observed_value=str(_serialize_value(anomaly.observed_value)) if anomaly.observed_value is not None else None,
                status="open",
                source_event_id=anomaly.source_event_id,
                created_at=anomaly.timestamp,
            )
            db.add(record)

        try:
            await db.flush()
        except Exception as e:
            logger.error("anomaly.persist_failed", error=str(e))

    def _record_event(self, soulkey_id: uuid.UUID, event: dict):
        """Add event to the sliding window for this agent."""
        if soulkey_id not in self._event_windows:
            self._event_windows[soulkey_id] = deque(maxlen=500)

        event_ts = event.get("timestamp")
        if isinstance(event_ts, str):
            try:
                now = datetime.fromisoformat(event_ts)
            except (ValueError, TypeError):
                now = datetime.now(timezone.utc)
        elif isinstance(event_ts, datetime):
            now = event_ts
        else:
            now = datetime.now(timezone.utc)

        event_data = {
            "event_type": event.get("event_type"),
            "resource": event.get("resource"),
            "action": event.get("action"),
            "scope": event.get("scope"),
            "decision": event.get("decision"),
            "node": (event.get("context") or {}).get("node") if isinstance(event.get("context"), dict) else None,
            "context": event.get("context") if isinstance(event.get("context"), dict) else {},
            "tenant_id": event.get("tenant_id"),
        }
        self._event_windows[soulkey_id].append((now, event_data))

        # Prune old entries beyond window
        cutoff = now - timedelta(seconds=self._window_size)
        while self._event_windows[soulkey_id] and self._event_windows[soulkey_id][0][0] < cutoff:
            self._event_windows[soulkey_id].popleft()

    # ── Phase 7 advanced threat detectors ──────────────────────────────

    async def _check_session_hijack(
        self, soulkey_id: uuid.UUID, event: dict, baseline: AgentBaseline,
        tenant_id: Optional[uuid.UUID], event_id: Optional[uuid.UUID],
    ) -> list[Anomaly]:
        """SESSION_HIJACK: session used from a different node/IP than established."""
        anomalies = []
        session_id = event.get("context", {}).get("session_id") if isinstance(event.get("context"), dict) else None
        source_node = event.get("context", {}).get("node_id") if isinstance(event.get("context"), dict) else None

        if not session_id or not source_node:
            return anomalies

        window = self._event_windows.get(soulkey_id, deque())
        session_nodes = set()
        for ts, ev in window:
            ctx = ev.get("context", {}) if isinstance(ev.get("context"), dict) else {}
            if ctx.get("session_id") == session_id:
                node = ctx.get("node_id")
                if node:
                    session_nodes.add(node)

        if len(session_nodes) > 1 and source_node not in session_nodes:
            anomalies.append(Anomaly(
                type=AnomalyType.SESSION_HIJACK,
                severity=SEVERITY_CRITICAL,
                soulkey_id=soulkey_id,
                description=f"Session {session_id[:8]} used from unexpected node {source_node}",
                evidence={"session_id": session_id, "expected_nodes": sorted(session_nodes), "actual_node": source_node},
                tenant_id=tenant_id,
                source_event_id=event_id,
            ))
        return anomalies

    async def _check_model_abuse(
        self, soulkey_id: uuid.UUID, event: dict, baseline: AgentBaseline,
        tenant_id: Optional[uuid.UUID], event_id: Optional[uuid.UUID],
    ) -> list[Anomaly]:
        """MODEL_ABUSE: agent requests models outside its typical set."""
        anomalies = []
        model = event.get("context", {}).get("model") if isinstance(event.get("context"), dict) else None
        if not model:
            return anomalies

        typical_models = getattr(baseline, "typical_models", set())
        if typical_models and model not in typical_models:
            anomalies.append(Anomaly(
                type=AnomalyType.MODEL_ABUSE,
                severity=SEVERITY_HIGH,
                soulkey_id=soulkey_id,
                description=f"Agent requested model '{model}' outside typical set",
                evidence={"model": model, "typical_models": sorted(typical_models)},
                baseline_value=sorted(typical_models),
                observed_value=model,
                tenant_id=tenant_id,
                source_event_id=event_id,
            ))
        return anomalies

    async def _check_token_harvesting(
        self, soulkey_id: uuid.UUID, event: dict, baseline: AgentBaseline,
        tenant_id: Optional[uuid.UUID], event_id: Optional[uuid.UUID],
    ) -> list[Anomaly]:
        """TOKEN_HARVESTING: accumulates input tokens without proportional output."""
        anomalies = []
        ctx = event.get("context", {}) if isinstance(event.get("context"), dict) else {}
        input_tokens = ctx.get("prompt_tokens", 0)
        output_tokens = ctx.get("completion_tokens", 0)

        if input_tokens > 0 and output_tokens > 0:
            ratio = output_tokens / input_tokens
            if ratio < 0.1 and input_tokens > 1000:
                anomalies.append(Anomaly(
                    type=AnomalyType.TOKEN_HARVESTING,
                    severity=SEVERITY_HIGH,
                    soulkey_id=soulkey_id,
                    description=f"Low output/input token ratio ({ratio:.3f}) with {input_tokens} input tokens",
                    evidence={"input_tokens": input_tokens, "output_tokens": output_tokens, "ratio": ratio},
                    tenant_id=tenant_id,
                    source_event_id=event_id,
                ))
        return anomalies

    async def _check_lateral_movement(
        self, soulkey_id: uuid.UUID, event: dict, baseline: AgentBaseline,
        tenant_id: Optional[uuid.UUID], event_id: Optional[uuid.UUID],
    ) -> list[Anomaly]:
        """LATERAL_MOVEMENT: agent accesses resources across tenant boundaries."""
        anomalies = []
        event_tenant = event.get("tenant_id")
        resource_tenant = event.get("context", {}).get("target_tenant_id") if isinstance(event.get("context"), dict) else None

        if resource_tenant and event_tenant and str(resource_tenant) != str(event_tenant):
            anomalies.append(Anomaly(
                type=AnomalyType.LATERAL_MOVEMENT,
                severity=SEVERITY_CRITICAL,
                soulkey_id=soulkey_id,
                description=f"Cross-tenant resource access: source {str(event_tenant)[:8]} → target {str(resource_tenant)[:8]}",
                evidence={"source_tenant": str(event_tenant), "target_tenant": str(resource_tenant)},
                tenant_id=tenant_id,
                source_event_id=event_id,
            ))
        return anomalies

    async def _check_resource_abuse(
        self, soulkey_id: uuid.UUID, event: dict, baseline: AgentBaseline,
        tenant_id: Optional[uuid.UUID], event_id: Optional[uuid.UUID],
    ) -> list[Anomaly]:
        """RESOURCE_ABUSE: excessive cost or token consumption vs baseline."""
        anomalies = []
        ctx = event.get("context", {}) if isinstance(event.get("context"), dict) else {}
        cost = ctx.get("cost_usd", 0)

        typical_cost = getattr(baseline, "typical_cost_per_request", 0)
        threshold = self._thresholds.get(AnomalyType.RESOURCE_ABUSE, 5.0)

        if typical_cost > 0 and cost > typical_cost * threshold:
            anomalies.append(Anomaly(
                type=AnomalyType.RESOURCE_ABUSE,
                severity=SEVERITY_HIGH,
                soulkey_id=soulkey_id,
                description=f"Request cost ${cost:.4f} is {cost/typical_cost:.1f}x typical (${typical_cost:.4f})",
                evidence={"cost_usd": cost, "typical_cost": typical_cost, "multiplier": cost / typical_cost},
                baseline_value=typical_cost,
                observed_value=cost,
                tenant_id=tenant_id,
                source_event_id=event_id,
            ))
        return anomalies

    async def _check_credential_rotation(
        self, soulkey_id: uuid.UUID, event: dict, baseline: AgentBaseline,
        tenant_id: Optional[uuid.UUID], event_id: Optional[uuid.UUID],
    ) -> list[Anomaly]:
        """CREDENTIAL_ROTATION: rapid key issuance/revocation cycles."""
        anomalies = []
        event_type = event.get("event_type", "")

        if event_type not in ("key_issued", "key_revoked", "key_suspended"):
            return anomalies

        window = self._event_windows.get(soulkey_id, deque())
        key_events = [ev for ts, ev in window if ev.get("event_type") in ("key_issued", "key_revoked", "key_suspended")]

        threshold = int(self._thresholds.get(AnomalyType.CREDENTIAL_ROTATION, 3))
        if len(key_events) >= threshold:
            anomalies.append(Anomaly(
                type=AnomalyType.CREDENTIAL_ROTATION,
                severity=SEVERITY_HIGH,
                soulkey_id=soulkey_id,
                description=f"{len(key_events)} credential lifecycle events in detection window",
                evidence={"count": len(key_events), "threshold": threshold, "events": [e.get("event_type") for e in key_events[-5:]]},
                tenant_id=tenant_id,
                source_event_id=event_id,
            ))
        return anomalies
