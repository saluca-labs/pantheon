"""
Quarantine Engine — Automated Incident Response for SoulAuth.
When anomaly detection fires, this engine evaluates severity-based policies
and executes quarantine actions (suspend key, kill sessions, rate limit, etc.).
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.analytics.detector import Anomaly, AnomalyType, SEVERITY_HIGH, SEVERITY_CRITICAL
from src.audit.logger import log_auth_event
from src.auth.soulkey import suspend_soulkey, revoke_soulkey, reinstate_soulkey
from src.database.models import Soulkey

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums & data-classes
# ---------------------------------------------------------------------------

class QuarantineAction(str, Enum):
    """Actions that can be taken when quarantining an agent."""
    SUSPEND_KEY = "suspend_key"
    REVOKE_KEY = "revoke_key"
    KILL_SESSION = "kill_session"
    FORCE_REAUTH = "force_reauth"
    RATE_LIMIT = "rate_limit"
    ISOLATE = "isolate"
    RESET_CONTEXT = "reset_context"


class QuarantineStatus(str, Enum):
    ACTIVE = "active"
    RELEASED = "released"
    EXPIRED = "expired"
    PENDING_APPROVAL = "pending_approval"


SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


@dataclass
class QuarantinePolicy:
    """Describes when and how to quarantine in response to an anomaly type."""
    trigger: AnomalyType
    severity_threshold: str  # "low", "medium", "high", "critical"
    actions: list[QuarantineAction]
    auto_release_after: Optional[int] = None  # minutes; None = manual only
    requires_approval: bool = False
    notification_priority: str = "high"


@dataclass
class QuarantineRecord:
    """Tracks one quarantine event for an agent."""
    id: uuid.UUID
    soulkey_id: uuid.UUID
    tenant_id: uuid.UUID
    persona_id: str
    triggered_by_type: str  # anomaly type value
    triggered_by_id: Optional[str] = None  # anomaly / alert id
    actions_taken: list[QuarantineAction] = field(default_factory=list)
    status: QuarantineStatus = QuarantineStatus.ACTIVE
    quarantined_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    released_at: Optional[datetime] = None
    auto_release_at: Optional[datetime] = None
    released_by: Optional[str] = None  # human username or "auto"
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "soulkey_id": str(self.soulkey_id),
            "tenant_id": str(self.tenant_id),
            "persona_id": self.persona_id,
            "triggered_by_type": self.triggered_by_type,
            "triggered_by_id": self.triggered_by_id,
            "actions_taken": [a.value for a in self.actions_taken],
            "status": self.status.value,
            "quarantined_at": self.quarantined_at.isoformat(),
            "released_at": self.released_at.isoformat() if self.released_at else None,
            "auto_release_at": self.auto_release_at.isoformat() if self.auto_release_at else None,
            "released_by": self.released_by,
            "reason": self.reason,
        }


@dataclass
class QuarantineResult:
    """Outcome of an evaluate_and_respond call."""
    triggered: bool
    record: Optional[QuarantineRecord] = None
    policies_matched: list[QuarantinePolicy] = field(default_factory=list)
    pending_approval: bool = False
    message: str = ""


# ---------------------------------------------------------------------------
# In-memory stores (production would back these with a DB table)
# ---------------------------------------------------------------------------

# Active quarantine records: quarantine_id -> QuarantineRecord
_quarantine_store: dict[uuid.UUID, QuarantineRecord] = {}

# Rate-limit state: soulkey_id -> (requests_per_minute, window_start, count)
_rate_limits: dict[uuid.UUID, tuple[int, datetime, int]] = {}

# Force-reauth flags: soulkey_id -> True
_force_reauth_flags: set[uuid.UUID] = set()

# Isolation flags: soulkey_id -> True
_isolation_flags: set[uuid.UUID] = set()

# Reset-context signals: soulkey_id -> True
_reset_context_signals: set[uuid.UUID] = set()

# Killed sessions: soulkey_id -> set of killed session timestamps
_killed_sessions: set[uuid.UUID] = set()


def _clear_stores():
    """Reset all in-memory stores (for testing)."""
    _quarantine_store.clear()
    _rate_limits.clear()
    _force_reauth_flags.clear()
    _isolation_flags.clear()
    _reset_context_signals.clear()
    _killed_sessions.clear()


# ---------------------------------------------------------------------------
# Default policies
# ---------------------------------------------------------------------------

DEFAULT_QUARANTINE_POLICIES: list[QuarantinePolicy] = [
    QuarantinePolicy(
        trigger=AnomalyType.CREDENTIAL_STUFFING,
        severity_threshold="high",
        actions=[QuarantineAction.SUSPEND_KEY, QuarantineAction.KILL_SESSION],
        auto_release_after=60,
        notification_priority="critical",
    ),
    QuarantinePolicy(
        trigger=AnomalyType.SCOPE_ESCALATION,
        severity_threshold="high",
        actions=[QuarantineAction.RATE_LIMIT, QuarantineAction.FORCE_REAUTH],
        auto_release_after=30,
        notification_priority="high",
    ),
    QuarantinePolicy(
        trigger=AnomalyType.RATE_SPIKE,
        severity_threshold="critical",
        actions=[
            QuarantineAction.SUSPEND_KEY,
            QuarantineAction.KILL_SESSION,
            QuarantineAction.RESET_CONTEXT,
        ],
        auto_release_after=None,
        notification_priority="critical",
    ),
    # Catch-all: any anomaly at critical severity
    QuarantinePolicy(
        trigger=None,  # type: ignore[arg-type] — None means "any"
        severity_threshold="critical",
        actions=[QuarantineAction.SUSPEND_KEY, QuarantineAction.KILL_SESSION],
        auto_release_after=None,
        notification_priority="critical",
    ),
]


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class QuarantineEngine:
    """
    Evaluates anomalies against quarantine policies and executes
    automated incident response actions.
    """

    def __init__(
        self,
        policies: Optional[list[QuarantinePolicy]] = None,
        default_rate_limit: int = 5,  # requests/minute when RATE_LIMIT is applied
    ):
        self._policies = policies if policies is not None else list(DEFAULT_QUARANTINE_POLICIES)
        self._default_rate_limit = default_rate_limit

    # -- public properties --------------------------------------------------

    @property
    def policies(self) -> list[QuarantinePolicy]:
        return list(self._policies)

    # -- core methods -------------------------------------------------------

    async def evaluate_and_respond(
        self,
        db: AsyncSession,
        anomaly: Anomaly,
    ) -> QuarantineResult:
        """
        Given a detected anomaly, find matching quarantine policies,
        merge their actions, and execute.
        """
        matched: list[QuarantinePolicy] = []

        for policy in self._policies:
            # Trigger match: exact type or catch-all (None)
            if policy.trigger is not None and policy.trigger != anomaly.type:
                continue

            # Severity threshold
            if SEVERITY_ORDER.get(anomaly.severity, 0) < SEVERITY_ORDER.get(policy.severity_threshold, 0):
                continue

            matched.append(policy)

        if not matched:
            return QuarantineResult(
                triggered=False,
                message=f"No quarantine policy matched anomaly {anomaly.type.value}/{anomaly.severity}",
            )

        # Merge actions from all matched policies (deduplicate, order preserved)
        merged_actions: list[QuarantineAction] = []
        seen_actions: set[QuarantineAction] = set()
        requires_approval = False
        auto_release_minutes: Optional[int] = None

        for p in matched:
            if p.requires_approval:
                requires_approval = True
            for a in p.actions:
                if a not in seen_actions:
                    merged_actions.append(a)
                    seen_actions.add(a)
            # Use the longest auto-release (or None trumps)
            if p.auto_release_after is None:
                auto_release_minutes = None
            elif auto_release_minutes is not None:
                auto_release_minutes = max(auto_release_minutes, p.auto_release_after)
            else:
                # Already None from another policy — keep None
                pass

        # If first matched had a value but later one was None, auto_release stays None
        # Re-scan: if *any* matched policy has auto_release_after set and none is None, use max
        all_auto = [p.auto_release_after for p in matched]
        if None in all_auto:
            auto_release_minutes = None
        else:
            auto_release_minutes = max(all_auto)  # type: ignore[arg-type]

        if requires_approval:
            record = QuarantineRecord(
                id=uuid.uuid4(),
                soulkey_id=anomaly.soulkey_id,
                tenant_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
                persona_id="",
                triggered_by_type=anomaly.type.value,
                actions_taken=merged_actions,
                status=QuarantineStatus.PENDING_APPROVAL,
                reason=anomaly.description,
            )
            _quarantine_store[record.id] = record
            return QuarantineResult(
                triggered=True,
                record=record,
                policies_matched=matched,
                pending_approval=True,
                message="Quarantine queued for human approval",
            )

        # Resolve soulkey to get tenant_id and persona_id
        result = await db.execute(
            select(Soulkey).where(Soulkey.id == anomaly.soulkey_id)
        )
        sk = result.scalar_one_or_none()
        tenant_id = sk.tenant_id if sk else uuid.UUID("00000000-0000-0000-0000-000000000000")
        persona_id = sk.persona_id if sk else ""

        record = await self.execute_quarantine(
            db=db,
            soulkey_id=anomaly.soulkey_id,
            tenant_id=tenant_id,
            persona_id=persona_id,
            actions=merged_actions,
            reason=anomaly.description,
            triggered_by_type=anomaly.type.value,
            auto_release_after=auto_release_minutes,
        )

        return QuarantineResult(
            triggered=True,
            record=record,
            policies_matched=matched,
            message=f"Quarantine executed: {[a.value for a in merged_actions]}",
        )

    async def execute_quarantine(
        self,
        db: AsyncSession,
        soulkey_id: uuid.UUID,
        tenant_id: uuid.UUID,
        persona_id: str,
        actions: list[QuarantineAction],
        reason: str,
        triggered_by_type: str = "manual",
        triggered_by_id: Optional[str] = None,
        auto_release_after: Optional[int] = None,
    ) -> QuarantineRecord:
        """Execute a set of quarantine actions against an agent."""
        now = datetime.now(timezone.utc)
        auto_release_at = (
            now + timedelta(minutes=auto_release_after) if auto_release_after else None
        )

        record = QuarantineRecord(
            id=uuid.uuid4(),
            soulkey_id=soulkey_id,
            tenant_id=tenant_id,
            persona_id=persona_id,
            triggered_by_type=triggered_by_type,
            triggered_by_id=triggered_by_id,
            actions_taken=list(actions),
            status=QuarantineStatus.ACTIVE,
            quarantined_at=now,
            auto_release_at=auto_release_at,
            reason=reason,
        )

        # Execute each action
        for action in actions:
            try:
                await self._execute_action(db, soulkey_id, action, reason)
            except Exception as exc:
                logger.error(
                    "quarantine.action_failed",
                    action=action.value,
                    soulkey_id=str(soulkey_id),
                    error=str(exc),
                )

        # Persist record
        _quarantine_store[record.id] = record

        # Audit
        await log_auth_event(
            db,
            tenant_id=tenant_id,
            event_type="quarantine_activated",
            soulkey_id=soulkey_id,
            persona_id=persona_id,
            decision="quarantine",
            reason=reason,
            context={
                "quarantine_id": str(record.id),
                "actions": [a.value for a in actions],
                "triggered_by": triggered_by_type,
                "auto_release_at": auto_release_at.isoformat() if auto_release_at else None,
            },
        )

        logger.warning(
            "quarantine.activated",
            quarantine_id=str(record.id),
            soulkey_id=str(soulkey_id),
            actions=[a.value for a in actions],
            reason=reason,
        )

        return record

    async def release_quarantine(
        self,
        db: AsyncSession,
        quarantine_id: uuid.UUID,
        released_by: str = "auto",
    ) -> bool:
        """Release an agent from quarantine."""
        record = _quarantine_store.get(quarantine_id)
        if not record or record.status not in (
            QuarantineStatus.ACTIVE,
            QuarantineStatus.PENDING_APPROVAL,
        ):
            return False

        now = datetime.now(timezone.utc)
        record.status = QuarantineStatus.RELEASED
        record.released_at = now
        record.released_by = released_by

        # Reverse reversible actions
        for action in record.actions_taken:
            try:
                await self._reverse_action(db, record.soulkey_id, action)
            except Exception as exc:
                logger.error(
                    "quarantine.reverse_failed",
                    action=action.value,
                    soulkey_id=str(record.soulkey_id),
                    error=str(exc),
                )

        await log_auth_event(
            db,
            tenant_id=record.tenant_id,
            event_type="quarantine_released",
            soulkey_id=record.soulkey_id,
            persona_id=record.persona_id,
            decision="release",
            reason=f"Released by {released_by}",
            context={"quarantine_id": str(quarantine_id)},
        )

        logger.info(
            "quarantine.released",
            quarantine_id=str(quarantine_id),
            released_by=released_by,
        )
        return True

    async def list_quarantined(
        self,
        tenant_id: Optional[uuid.UUID] = None,
    ) -> list[QuarantineRecord]:
        """List quarantine records, optionally filtered by tenant."""
        records = list(_quarantine_store.values())
        if tenant_id:
            records = [r for r in records if r.tenant_id == tenant_id]
        return records

    async def auto_release_check(self, db: AsyncSession) -> list[uuid.UUID]:
        """
        Background task: release quarantines whose auto_release_at has passed.
        Returns list of released quarantine IDs.
        """
        now = datetime.now(timezone.utc)
        released_ids: list[uuid.UUID] = []

        for qid, record in list(_quarantine_store.items()):
            if (
                record.status == QuarantineStatus.ACTIVE
                and record.auto_release_at
                and record.auto_release_at <= now
            ):
                ok = await self.release_quarantine(db, qid, released_by="auto")
                if ok:
                    record.status = QuarantineStatus.EXPIRED
                    released_ids.append(qid)

        return released_ids

    # -- helper: check quarantine state for PDP integration ------------------

    def is_quarantined(self, soulkey_id: uuid.UUID) -> bool:
        """Check if a soulkey currently has any active quarantine."""
        for r in _quarantine_store.values():
            if r.soulkey_id == soulkey_id and r.status == QuarantineStatus.ACTIVE:
                return True
        return False

    def needs_reauth(self, soulkey_id: uuid.UUID) -> bool:
        return soulkey_id in _force_reauth_flags

    def is_isolated(self, soulkey_id: uuid.UUID) -> bool:
        return soulkey_id in _isolation_flags

    def should_reset_context(self, soulkey_id: uuid.UUID) -> bool:
        return soulkey_id in _reset_context_signals

    def is_rate_limited(self, soulkey_id: uuid.UUID) -> Optional[int]:
        """Returns requests/minute limit if rate-limited, else None."""
        if soulkey_id in _rate_limits:
            rpm, _, _ = _rate_limits[soulkey_id]
            return rpm
        return None

    def is_session_killed(self, soulkey_id: uuid.UUID) -> bool:
        return soulkey_id in _killed_sessions

    # -- internal action execution ------------------------------------------

    async def _execute_action(
        self,
        db: AsyncSession,
        soulkey_id: uuid.UUID,
        action: QuarantineAction,
        reason: str,
    ):
        if action == QuarantineAction.SUSPEND_KEY:
            await suspend_soulkey(db, soulkey_id, "quarantine_engine", reason)
        elif action == QuarantineAction.REVOKE_KEY:
            await revoke_soulkey(db, soulkey_id, "quarantine_engine", reason)
        elif action == QuarantineAction.KILL_SESSION:
            _killed_sessions.add(soulkey_id)
        elif action == QuarantineAction.FORCE_REAUTH:
            _force_reauth_flags.add(soulkey_id)
        elif action == QuarantineAction.RATE_LIMIT:
            _rate_limits[soulkey_id] = (
                self._default_rate_limit,
                datetime.now(timezone.utc),
                0,
            )
        elif action == QuarantineAction.ISOLATE:
            _isolation_flags.add(soulkey_id)
        elif action == QuarantineAction.RESET_CONTEXT:
            _reset_context_signals.add(soulkey_id)

    async def _reverse_action(
        self,
        db: AsyncSession,
        soulkey_id: uuid.UUID,
        action: QuarantineAction,
    ):
        """Reverse a quarantine action where possible."""
        if action == QuarantineAction.SUSPEND_KEY:
            await reinstate_soulkey(db, soulkey_id)
        elif action == QuarantineAction.KILL_SESSION:
            _killed_sessions.discard(soulkey_id)
        elif action == QuarantineAction.FORCE_REAUTH:
            _force_reauth_flags.discard(soulkey_id)
        elif action == QuarantineAction.RATE_LIMIT:
            _rate_limits.pop(soulkey_id, None)
        elif action == QuarantineAction.ISOLATE:
            _isolation_flags.discard(soulkey_id)
        elif action == QuarantineAction.RESET_CONTEXT:
            _reset_context_signals.discard(soulkey_id)
        # REVOKE_KEY is terminal — cannot be reversed
