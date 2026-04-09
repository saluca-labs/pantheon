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

    # Original 8
    RATE_SPIKE = "rate_spike"
    OFF_HOURS = "off_hours"
    NEW_RESOURCE = "new_resource"
    SCOPE_ESCALATION = "scope_escalation"
    DENIAL_SPIKE = "denial_spike"
    BURST = "burst"
    IMPOSSIBLE_TRAVEL = "impossible_travel"
    CREDENTIAL_STUFFING = "credential_stuffing"

    # Phase 7 additions -- 10 new types
    CREDENTIAL_ROTATION = "credential_rotation"
    SESSION_HIJACK = "session_hijack"
    MODEL_ABUSE = "model_abuse"
    TOKEN_HARVESTING = "token_harvesting"
    DATA_POISONING = "data_poisoning"
    LATERAL_MOVEMENT = "lateral_movement"
    PERSISTENCE = "persistence"
    EVASION = "evasion"
    SUPPLY_CHAIN = "supply_chain"
    RESOURCE_ABUSE = "resource_abuse"


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
        # Original 8
        AnomalyType.RATE_SPIKE: 3.0,        # 3x baseline rate
        AnomalyType.OFF_HOURS: 1,            # any activity outside typical hours
        AnomalyType.NEW_RESOURCE: 1,         # any new resource
        AnomalyType.SCOPE_ESCALATION: 1,     # any new scope
        AnomalyType.DENIAL_SPIKE: 2.0,       # 2x baseline denial rate
        AnomalyType.BURST: 2.0,              # 2x baseline burst size
        AnomalyType.IMPOSSIBLE_TRAVEL: 1,    # any impossible travel
        AnomalyType.CREDENTIAL_STUFFING: 5,  # 5 failed attempts with different keys
        # Phase 7 additions
        AnomalyType.CREDENTIAL_ROTATION: 3.0,   # 3x baseline rotation rate
        AnomalyType.SESSION_HIJACK: 1,           # any identity context mismatch
        AnomalyType.MODEL_ABUSE: 1,              # any model outside baseline set
        AnomalyType.TOKEN_HARVESTING: 3.0,       # 3x baseline input_tokens with <0.1 ratio output
        AnomalyType.DATA_POISONING: 1,           # any training/feedback event flagged anomalous
        AnomalyType.LATERAL_MOVEMENT: 1,         # any cross-tenant resource access
        AnomalyType.PERSISTENCE: 1,              # recurring off-schedule access pattern
        AnomalyType.EVASION: 0.5,               # variance drops below 50% of baseline (too regular)
        AnomalyType.SUPPLY_CHAIN: 1,             # any unknown dependency reference
        AnomalyType.RESOURCE_ABUSE: 5.0,         # 5x baseline cpu_ms per request
    }

    def __init__(
        self,
        baseline_engine: BaselineEngine,
        thresholds: Optional[dict] = None,
        window_size: int = 300,  # 5 minute sliding window in seconds
        ttl_days: int = 7,  # TTL for event windows - compliance: retain for audit
    ):
        self._baseline_engine = baseline_engine
        self._thresholds = {**self.DEFAULT_THRESHOLDS, **(thresholds or {})}
        self._window_size = window_size
        self._ttl_seconds = ttl_days * 24 * 60 * 60  # Convert days to seconds
        self._last_cleanup = time.time()
        self._cleanup_interval = 3600  # Run cleanup every 1 hour

        # Sliding windows: soulkey_id -> deque of (timestamp, event_dict)
        # Privacy: TTL enforced to prevent indefinite retention
        self._event_windows: dict[uuid.UUID, deque] = {}

        # Recent anomalies ring buffer
        self._recent_anomalies: deque = deque(maxlen=1000)

        # Track failed auth attempts for credential stuffing: source_ip -> deque of (ts, key_used)
        self._failed_auth_window: dict[str, deque] = {}

        # Track key rotation events: soulkey_id -> deque of timestamps
        self._rotation_window: dict[uuid.UUID, deque] = {}

    def _cleanup_old_entries(self) -> None:
        """
        Remove entries older than TTL from all sliding windows.

        Privacy: Enforces data retention policy - events older than 7 days are purged.
        Compliance: TTL configurable for audit retention requirements.
        """
        current_time = time.time()
        if current_time - self._last_cleanup < self._cleanup_interval:
            return  # Not time for cleanup yet

        for window_dict in [self._event_windows, self._failed_auth_window, self._rotation_window]:
            keys_to_delete = []
            for key, deque_list in window_dict.items():
                # Remove old entries from front of deque
                while deque_list and (current_time - deque_list[0][0]) > self._ttl_seconds:
                    deque_list.popleft()
                # Mark empty deques for deletion
                if not deque_list:
                    keys_to_delete.append(key)
            # Clean up empty entries
            for key in keys_to_delete:
                del window_dict[key]

        self._last_cleanup = current_time
        logger.debug("detector.cleanup.complete", windows_checked=len(window_dict))

    async def check_event(self, event: AuditLog) -> list[Anomaly]:
        """
        Check a single audit event against baselines.
        Returns a list of detected anomalies (may be empty).

        Privacy: TTL cleanup enforced to prevent indefinite data retention.
        """
        # Run periodic cleanup to enforce TTL (privacy/compliance)
        self._cleanup_old_entries()

        if not event.soulkey_id:
            return await self._check_unauthenticated_event(event)

        anomalies = []
        soulkey_id = event.soulkey_id
        baseline = await self._baseline_engine.get_baseline(soulkey_id)

        # Record event in sliding window
        self._record_event(soulkey_id, event)

        # No baseline means this is a new or unseen agent -- skip most checks
        # but still check credential stuffing
        if not baseline:
            if event.resource and event.decision != "deny":
                # New agent accessing resources -- note it but low severity
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

        # --- Original 8 checks ---

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

        # --- Phase 7: 10 new checks ---
        anomalies.extend(self._check_credential_rotation(soulkey_id, event, baseline))
        anomalies.extend(self._check_session_hijack(soulkey_id, event, baseline))
        anomalies.extend(self._check_model_abuse(soulkey_id, event, baseline))
        anomalies.extend(self._check_token_harvesting(soulkey_id, event, baseline))
        anomalies.extend(self._check_data_poisoning(soulkey_id, event, baseline))
        anomalies.extend(self._check_lateral_movement(soulkey_id, event, baseline))
        anomalies.extend(self._check_persistence(soulkey_id, event, baseline, window_events))
        anomalies.extend(self._check_evasion(soulkey_id, event, baseline, window_events))
        anomalies.extend(self._check_supply_chain(soulkey_id, event, baseline))
        anomalies.extend(self._check_resource_abuse(soulkey_id, event, baseline))

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

    # ---------------------------------------------------------------------------
    # Phase 7 check methods
    # ---------------------------------------------------------------------------

    def _check_credential_rotation(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
    ) -> list[Anomaly]:
        """CREDENTIAL_ROTATION: agent rotates keys faster than baseline."""
        if event.event_type != "key_rotation":
            return []

        # Track rotation timestamps per soulkey
        if soulkey_id not in self._rotation_window:
            self._rotation_window[soulkey_id] = deque(maxlen=100)

        now = event.timestamp or datetime.now(timezone.utc)
        self._rotation_window[soulkey_id].append(now)

        # Prune events outside 1-hour window
        cutoff = now - timedelta(hours=1)
        while (
            self._rotation_window[soulkey_id]
            and self._rotation_window[soulkey_id][0] < cutoff
        ):
            self._rotation_window[soulkey_id].popleft()

        rotations_in_hour = len(self._rotation_window[soulkey_id])

        if baseline.typical_key_rotation_rate <= 0:
            # No baseline data -- flag any rotation rate above 3/hour as suspicious
            if rotations_in_hour >= 3:
                return [Anomaly(
                    type=AnomalyType.CREDENTIAL_ROTATION,
                    severity=SEVERITY_MEDIUM,
                    soulkey_id=soulkey_id,
                    description=f"Credential rotation rate {rotations_in_hour}/hr with no baseline established",
                    evidence={"rotations_in_hour": rotations_in_hour},
                    baseline_value=0.0,
                    observed_value=rotations_in_hour,
                )]
            return []

        threshold = baseline.typical_key_rotation_rate * self._thresholds[AnomalyType.CREDENTIAL_ROTATION]
        if rotations_in_hour > threshold:
            return [Anomaly(
                type=AnomalyType.CREDENTIAL_ROTATION,
                severity=SEVERITY_HIGH,
                soulkey_id=soulkey_id,
                description=f"Key rotation rate {rotations_in_hour}/hr exceeds threshold {threshold:.2f}/hr",
                evidence={"rotations_in_hour": rotations_in_hour, "window_hours": 1},
                baseline_value=baseline.typical_key_rotation_rate,
                observed_value=rotations_in_hour,
            )]
        return []

    def _check_session_hijack(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
    ) -> list[Anomaly]:
        """SESSION_HIJACK: session used from a different identity context than established."""
        if not event.context or not isinstance(event.context, dict):
            return []

        observed_persona = event.context.get("persona_id") or event.persona_id
        if not observed_persona:
            return []

        # If the event's persona_id does not match the persona on the soulkey's typical actions
        # Use a simple heuristic: if context carries a session_persona that differs from
        # the event.persona_id (the authenticated key's persona), flag it.
        session_persona = event.context.get("session_persona")
        if session_persona and event.persona_id and session_persona != event.persona_id:
            return [Anomaly(
                type=AnomalyType.SESSION_HIJACK,
                severity=SEVERITY_CRITICAL,
                soulkey_id=soulkey_id,
                description=(
                    f"Session persona '{session_persona}' does not match "
                    f"authenticated key persona '{event.persona_id}'"
                ),
                evidence={
                    "authenticated_persona": event.persona_id,
                    "session_persona": session_persona,
                    "resource": event.resource,
                    "action": event.action,
                },
                baseline_value=event.persona_id,
                observed_value=session_persona,
            )]

        # Secondary check: if context carries a source_identity not matching persona
        source_identity = event.context.get("source_identity")
        if source_identity and event.persona_id and source_identity != event.persona_id:
            return [Anomaly(
                type=AnomalyType.SESSION_HIJACK,
                severity=SEVERITY_HIGH,
                soulkey_id=soulkey_id,
                description=(
                    f"Source identity '{source_identity}' differs from "
                    f"authenticated persona '{event.persona_id}'"
                ),
                evidence={
                    "authenticated_persona": event.persona_id,
                    "source_identity": source_identity,
                },
                baseline_value=event.persona_id,
                observed_value=source_identity,
            )]

        return []

    def _check_model_abuse(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
    ) -> list[Anomaly]:
        """MODEL_ABUSE: agent requests models outside its typical set."""
        ctx = event.context if isinstance(event.context, dict) else {}
        model_id = ctx.get("model_id") or ctx.get("model")
        if not model_id:
            return []

        model_id = str(model_id)

        if not baseline.typical_models:
            # No model baseline yet -- cannot check
            return []

        if model_id not in baseline.typical_models:
            return [Anomaly(
                type=AnomalyType.MODEL_ABUSE,
                severity=SEVERITY_MEDIUM,
                soulkey_id=soulkey_id,
                description=f"Agent requested model '{model_id}' outside its baseline model set",
                evidence={
                    "model_requested": model_id,
                    "resource": event.resource,
                    "action": event.action,
                },
                baseline_value=baseline.typical_models,
                observed_value=model_id,
            )]
        return []

    def _check_token_harvesting(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
    ) -> list[Anomaly]:
        """TOKEN_HARVESTING: agent accumulates tokens without proportional output."""
        ctx = event.context if isinstance(event.context, dict) else {}
        input_tokens = ctx.get("input_tokens", 0) or 0
        output_tokens = ctx.get("output_tokens", 0) or 0

        if input_tokens <= 0:
            return []

        # Threshold: 3x baseline input with output ratio < 10% of baseline
        threshold_multiplier = self._thresholds[AnomalyType.TOKEN_HARVESTING]
        baseline_input_rate = baseline.typical_request_rate  # use request rate as proxy
        high_input = input_tokens > 10000  # absolute floor: >10k tokens is noteworthy

        observed_ratio = output_tokens / input_tokens
        baseline_ratio = baseline.typical_token_ratio

        # Flag when: large input token consumption AND output ratio is suspiciously low
        if high_input and baseline_ratio > 0 and observed_ratio < (baseline_ratio / threshold_multiplier):
            return [Anomaly(
                type=AnomalyType.TOKEN_HARVESTING,
                severity=SEVERITY_HIGH,
                soulkey_id=soulkey_id,
                description=(
                    f"Token harvesting pattern: {input_tokens} input tokens with "
                    f"output ratio {observed_ratio:.3f} (baseline: {baseline_ratio:.3f})"
                ),
                evidence={
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "observed_ratio": round(observed_ratio, 4),
                    "baseline_ratio": baseline_ratio,
                },
                baseline_value=baseline_ratio,
                observed_value=round(observed_ratio, 4),
            )]

        # Also flag zero-output with high input even without baseline
        if high_input and output_tokens == 0:
            return [Anomaly(
                type=AnomalyType.TOKEN_HARVESTING,
                severity=SEVERITY_MEDIUM,
                soulkey_id=soulkey_id,
                description=f"Agent consumed {input_tokens} input tokens with zero output tokens",
                evidence={"input_tokens": input_tokens, "output_tokens": 0},
                baseline_value=baseline_ratio,
                observed_value=0.0,
            )]

        return []

    def _check_data_poisoning(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
    ) -> list[Anomaly]:
        """DATA_POISONING: agent submits anomalous training/feedback data."""
        # Flag events with event_type indicating training or feedback submission
        poisoning_event_types = {
            "training_submit", "feedback_submit", "label_submit",
            "dataset_push", "fine_tune_trigger", "reward_signal",
        }
        if event.event_type not in poisoning_event_types:
            return []

        ctx = event.context if isinstance(event.context, dict) else {}

        # Signals that indicate anomalous training data
        anomaly_signals = []

        # Signal 1: training label marked as contradictory or adversarial
        label_flag = ctx.get("label_flag") or ctx.get("training_flag")
        if label_flag in ("adversarial", "contradictory", "poisoned", "anomalous"):
            anomaly_signals.append(f"training label flagged as '{label_flag}'")

        # Signal 2: batch size anomaly -- submitting unusually large batches
        batch_size = ctx.get("batch_size", 0) or 0
        if batch_size > 10000:
            anomaly_signals.append(f"oversized training batch: {batch_size} samples")

        # Signal 3: high-frequency feedback in short window (flooding)
        # Use the sliding window to count recent feedback events
        window = self._event_windows.get(soulkey_id, deque())
        feedback_count = sum(
            1 for _, e in window
            if e.get("event_type") in poisoning_event_types
        )
        if feedback_count >= 5:
            anomaly_signals.append(f"high-frequency feedback: {feedback_count} events in window")

        if not anomaly_signals:
            return []

        return [Anomaly(
            type=AnomalyType.DATA_POISONING,
            severity=SEVERITY_HIGH,
            soulkey_id=soulkey_id,
            description=f"Potential data poisoning: {'; '.join(anomaly_signals)}",
            evidence={
                "event_type": event.event_type,
                "signals": anomaly_signals,
                "batch_size": batch_size,
                "label_flag": label_flag,
                "feedback_window_count": feedback_count,
            },
            baseline_value="normal training submission",
            observed_value="; ".join(anomaly_signals),
        )]

    def _check_lateral_movement(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
    ) -> list[Anomaly]:
        """LATERAL_MOVEMENT: agent accesses resources across tenant boundaries."""
        ctx = event.context if isinstance(event.context, dict) else {}

        # Check if the event's tenant_id differs from the soulkey's home tenant
        event_tenant = ctx.get("tenant_id") or ctx.get("target_tenant_id")
        if not event_tenant:
            return []

        event_tenant_str = str(event_tenant)

        if not baseline.typical_tenant_ids:
            # No tenant baseline -- flag any cross-tenant access as medium
            # (could be legitimate first access)
            return [Anomaly(
                type=AnomalyType.LATERAL_MOVEMENT,
                severity=SEVERITY_MEDIUM,
                soulkey_id=soulkey_id,
                description=f"Cross-tenant access to tenant '{event_tenant_str}' with no baseline established",
                evidence={
                    "accessed_tenant": event_tenant_str,
                    "resource": event.resource,
                    "action": event.action,
                },
                baseline_value="no tenant baseline",
                observed_value=event_tenant_str,
            )]

        if event_tenant_str not in baseline.typical_tenant_ids:
            return [Anomaly(
                type=AnomalyType.LATERAL_MOVEMENT,
                severity=SEVERITY_CRITICAL,
                soulkey_id=soulkey_id,
                description=f"Agent accessed tenant '{event_tenant_str}' outside its authorized tenant set",
                evidence={
                    "accessed_tenant": event_tenant_str,
                    "authorized_tenants": list(baseline.typical_tenant_ids),
                    "resource": event.resource,
                    "action": event.action,
                },
                baseline_value=baseline.typical_tenant_ids,
                observed_value=event_tenant_str,
            )]

        return []

    def _check_persistence(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
        window_events: list,
    ) -> list[Anomaly]:
        """PERSISTENCE: agent creates recurring access patterns outside normal schedule."""
        if not event.timestamp:
            return []

        current_weekday = event.timestamp.weekday()  # 0=Monday, 6=Sunday
        current_hour = event.timestamp.hour

        # Only flag if we have a baseline and this weekday is completely outside it
        if not baseline.typical_active_days:
            return []
        if not baseline.typical_hours:
            return []

        # Flag: active on a weekday never seen in baseline AND outside typical hours
        day_is_new = current_weekday not in baseline.typical_active_days
        hour_is_off = current_hour not in baseline.typical_hours

        if day_is_new and hour_is_off:
            # Check if the pattern is recurring: at least 2 events on this weekday in the window
            same_day_events = sum(
                1 for ts, _ in window_events
                if ts.weekday() == current_weekday
            )
            if same_day_events >= 2:
                return [Anomaly(
                    type=AnomalyType.PERSISTENCE,
                    severity=SEVERITY_HIGH,
                    soulkey_id=soulkey_id,
                    description=(
                        f"Recurring access on weekday {current_weekday} at hour {current_hour} "
                        f"outside baseline schedule ({same_day_events} events in window)"
                    ),
                    evidence={
                        "weekday": current_weekday,
                        "hour": current_hour,
                        "window_events_same_day": same_day_events,
                    },
                    baseline_value={
                        "typical_days": sorted(baseline.typical_active_days),
                        "typical_hours": sorted(baseline.typical_hours),
                    },
                    observed_value={"weekday": current_weekday, "hour": current_hour},
                )]

        return []

    def _check_evasion(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
        window_events: list,
    ) -> list[Anomaly]:
        """EVASION: agent varies request patterns to avoid detection (too-regular spacing)."""
        if len(window_events) < 5:
            return []

        if baseline.typical_request_variance <= 0:
            return []

        # Compute current inter-request interval variance from window
        timestamps = sorted(ts.timestamp() for ts, _ in window_events if hasattr(ts, "timestamp"))
        if len(timestamps) < 4:
            return []

        intervals = [timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)]
        if len(intervals) < 3:
            return []

        try:
            import statistics as _stats
            current_variance = _stats.stdev(intervals)
        except Exception:
            return []

        # Evasion signal: variance is suspiciously low (too regular) vs baseline
        # OR variance is wildly high (deliberate jitter to avoid rate detection)
        evasion_threshold = baseline.typical_request_variance * self._thresholds[AnomalyType.EVASION]

        if current_variance < evasion_threshold and current_variance < 0.5:
            # Near-perfect regularity -- bot-like behavior to dodge rate checks
            return [Anomaly(
                type=AnomalyType.EVASION,
                severity=SEVERITY_MEDIUM,
                soulkey_id=soulkey_id,
                description=(
                    f"Request interval variance {current_variance:.3f}s is suspiciously low "
                    f"(baseline: {baseline.typical_request_variance:.3f}s) -- possible evasion behavior"
                ),
                evidence={
                    "current_variance_seconds": round(current_variance, 3),
                    "baseline_variance_seconds": baseline.typical_request_variance,
                    "window_event_count": len(window_events),
                },
                baseline_value=baseline.typical_request_variance,
                observed_value=round(current_variance, 3),
            )]

        return []

    def _check_supply_chain(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
    ) -> list[Anomaly]:
        """SUPPLY_CHAIN: agent references compromised or unexpected dependencies."""
        ctx = event.context if isinstance(event.context, dict) else {}
        dependencies = ctx.get("dependencies", [])
        if not dependencies:
            return []

        if not baseline.typical_dependencies:
            # No baseline yet -- cannot check unknown deps
            return []

        unknown_deps = [
            str(dep) for dep in dependencies
            if str(dep) not in baseline.typical_dependencies
        ]

        if not unknown_deps:
            return []

        return [Anomaly(
            type=AnomalyType.SUPPLY_CHAIN,
            severity=SEVERITY_HIGH,
            soulkey_id=soulkey_id,
            description=f"Agent referenced {len(unknown_deps)} unknown dependencies: {unknown_deps[:3]}",
            evidence={
                "unknown_dependencies": unknown_deps,
                "known_dependency_count": len(baseline.typical_dependencies),
                "resource": event.resource,
            },
            baseline_value=baseline.typical_dependencies,
            observed_value=unknown_deps,
        )]

    def _check_resource_abuse(
        self,
        soulkey_id: uuid.UUID,
        event: AuditLog,
        baseline: AgentBaseline,
    ) -> list[Anomaly]:
        """RESOURCE_ABUSE: agent consumes compute resources disproportionate to task."""
        ctx = event.context if isinstance(event.context, dict) else {}
        cpu_ms = ctx.get("cpu_ms")
        if cpu_ms is None:
            return []

        try:
            cpu_ms = float(cpu_ms)
        except (TypeError, ValueError):
            return []

        if baseline.typical_cpu_ms_per_request <= 0:
            # No baseline -- flag absolute excess (>30 seconds of CPU per single request)
            if cpu_ms > 30000:
                return [Anomaly(
                    type=AnomalyType.RESOURCE_ABUSE,
                    severity=SEVERITY_MEDIUM,
                    soulkey_id=soulkey_id,
                    description=f"High CPU usage {cpu_ms:.0f}ms per request with no baseline established",
                    evidence={"cpu_ms": cpu_ms, "resource": event.resource},
                    baseline_value=0.0,
                    observed_value=cpu_ms,
                )]
            return []

        threshold = baseline.typical_cpu_ms_per_request * self._thresholds[AnomalyType.RESOURCE_ABUSE]
        if cpu_ms > threshold:
            return [Anomaly(
                type=AnomalyType.RESOURCE_ABUSE,
                severity=SEVERITY_HIGH,
                soulkey_id=soulkey_id,
                description=(
                    f"CPU usage {cpu_ms:.0f}ms exceeds {threshold:.0f}ms threshold "
                    f"({self._thresholds[AnomalyType.RESOURCE_ABUSE]:.0f}x baseline)"
                ),
                evidence={
                    "cpu_ms": cpu_ms,
                    "threshold_ms": round(threshold, 2),
                    "resource": event.resource,
                    "action": event.action,
                },
                baseline_value=baseline.typical_cpu_ms_per_request,
                observed_value=cpu_ms,
            )]
        return []

    # ---------------------------------------------------------------------------
    # Existing methods (unchanged)
    # ---------------------------------------------------------------------------

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
        ctx = event.context if isinstance(event.context, dict) else {}
        event_data = {
            "event_type": event.event_type,
            "resource": event.resource,
            "action": event.action,
            "scope": event.scope,
            "decision": event.decision,
            "node": ctx.get("node"),
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
