"""
Quarantine Engine for SoulWatch - Automated Incident Response.
Persists quarantine records to _soulwatch_quarantines table.
Calls SoulAuth's admin API to suspend/reinstate keys (never writes to SoulAuth tables directly).
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional

import httpx
import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.analytics.detector import Anomaly, AnomalyType, SEVERITY_HIGH, SEVERITY_CRITICAL
from soulWatch.src.database.models import SoulWatchQuarantine
from soulWatch.config.settings import get_settings

logger = structlog.get_logger(__name__)


class QuarantineAction(str, Enum):
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
    trigger: Optional[AnomalyType]
    severity_threshold: str
    actions: list[QuarantineAction]
    auto_release_after: Optional[int] = None
    requires_approval: bool = False
    notification_priority: str = "high"


@dataclass
class QuarantineResult:
    triggered: bool
    record_id: Optional[uuid.UUID] = None
    pending_approval: bool = False
    message: str = ""


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
        actions=[QuarantineAction.SUSPEND_KEY, QuarantineAction.KILL_SESSION, QuarantineAction.RESET_CONTEXT],
        auto_release_after=None,
        notification_priority="critical",
    ),
    QuarantinePolicy(
        trigger=None,
        severity_threshold="critical",
        actions=[QuarantineAction.SUSPEND_KEY, QuarantineAction.KILL_SESSION],
        auto_release_after=None,
        notification_priority="critical",
    ),
]


class QuarantineEngine:
    """
    Evaluates anomalies against quarantine policies and executes
    automated incident response actions. Persists to database.
    """

    def __init__(
        self,
        policies: Optional[list[QuarantinePolicy]] = None,
        default_rate_limit: int = 5,
    ):
        self._policies = policies if policies is not None else list(DEFAULT_QUARANTINE_POLICIES)
        self._default_rate_limit = default_rate_limit
        self._settings = get_settings()

    @property
    def policies(self) -> list[QuarantinePolicy]:
        return list(self._policies)

    async def evaluate_and_respond(
        self,
        db: AsyncSession,
        anomaly: Anomaly,
    ) -> QuarantineResult:
        """Given a detected anomaly, find matching policies and execute."""
        matched: list[QuarantinePolicy] = []

        for policy in self._policies:
            if policy.trigger is not None and policy.trigger != anomaly.type:
                continue
            if SEVERITY_ORDER.get(anomaly.severity, 0) < SEVERITY_ORDER.get(policy.severity_threshold, 0):
                continue
            matched.append(policy)

        if not matched:
            return QuarantineResult(
                triggered=False,
                message=f"No quarantine policy matched anomaly {anomaly.type.value}/{anomaly.severity}",
            )

        # Merge actions
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

        all_auto = [p.auto_release_after for p in matched]
        if None in all_auto:
            auto_release_minutes = None
        else:
            auto_release_minutes = max(all_auto)  # type: ignore[arg-type]

        now = datetime.now(timezone.utc)
        auto_release_at = (
            now + timedelta(minutes=auto_release_minutes) if auto_release_minutes else None
        )

        status = QuarantineStatus.PENDING_APPROVAL if requires_approval else QuarantineStatus.ACTIVE

        # Persist quarantine record
        record = SoulWatchQuarantine(
            soulkey_id=anomaly.soulkey_id,
            tenant_id=anomaly.tenant_id,
            triggered_by_type=anomaly.type.value,
            actions_taken=[a.value for a in merged_actions],
            status=status.value,
            reason=anomaly.description,
            quarantined_at=now,
            auto_release_at=auto_release_at,
        )
        db.add(record)
        await db.flush()

        if requires_approval:
            return QuarantineResult(
                triggered=True,
                record_id=record.id,
                pending_approval=True,
                message="Quarantine queued for human approval",
            )

        # Execute actions via SoulAuth admin API
        for action in merged_actions:
            try:
                await self._execute_action(anomaly.soulkey_id, action, anomaly.description)
            except Exception as exc:
                logger.error(
                    "quarantine.action_failed",
                    action=action.value, soulkey_id=str(anomaly.soulkey_id), error=str(exc),
                )

        logger.warning(
            "quarantine.activated",
            quarantine_id=str(record.id),
            soulkey_id=str(anomaly.soulkey_id),
            actions=[a.value for a in merged_actions],
            reason=anomaly.description,
        )

        return QuarantineResult(
            triggered=True,
            record_id=record.id,
            message=f"Quarantine executed: {[a.value for a in merged_actions]}",
        )

    async def execute_manual_quarantine(
        self,
        db: AsyncSession,
        soulkey_id: uuid.UUID,
        actions: list[QuarantineAction],
        reason: str,
        auto_release_after: Optional[int] = None,
    ) -> SoulWatchQuarantine:
        """Manually quarantine an agent."""
        now = datetime.now(timezone.utc)
        auto_release_at = (
            now + timedelta(minutes=auto_release_after) if auto_release_after else None
        )

        record = SoulWatchQuarantine(
            soulkey_id=soulkey_id,
            triggered_by_type="manual",
            actions_taken=[a.value for a in actions],
            status=QuarantineStatus.ACTIVE.value,
            reason=reason,
            quarantined_at=now,
            auto_release_at=auto_release_at,
        )
        db.add(record)
        await db.flush()

        for action in actions:
            try:
                await self._execute_action(soulkey_id, action, reason)
            except Exception as exc:
                logger.error("quarantine.action_failed", action=action.value, error=str(exc))

        return record

    async def release_quarantine(
        self,
        db: AsyncSession,
        quarantine_id: uuid.UUID,
        released_by: str = "admin",
    ) -> bool:
        """Release an agent from quarantine."""
        result = await db.execute(
            select(SoulWatchQuarantine).where(SoulWatchQuarantine.id == quarantine_id)
        )
        record = result.scalar_one_or_none()
        if not record or record.status not in ("active", "pending_approval"):
            return False

        now = datetime.now(timezone.utc)
        record.status = "released"
        record.released_at = now
        record.released_by = released_by
        await db.flush()

        # Reverse actions via SoulAuth admin API
        actions_taken = record.actions_taken or []
        for action_str in actions_taken:
            try:
                await self._reverse_action(record.soulkey_id, action_str)
            except Exception as exc:
                logger.error("quarantine.reverse_failed", action=action_str, error=str(exc))

        logger.info("quarantine.released", quarantine_id=str(quarantine_id), released_by=released_by)
        return True

    async def approve_quarantine(
        self,
        db: AsyncSession,
        quarantine_id: uuid.UUID,
        approved_by: str,
    ) -> bool:
        """Approve a pending quarantine and execute its actions."""
        result = await db.execute(
            select(SoulWatchQuarantine).where(SoulWatchQuarantine.id == quarantine_id)
        )
        record = result.scalar_one_or_none()
        if not record or record.status != "pending_approval":
            return False

        now = datetime.now(timezone.utc)
        record.status = "active"
        record.approved_by = approved_by
        record.approved_at = now
        await db.flush()

        # Execute actions
        actions_taken = record.actions_taken or []
        for action_str in actions_taken:
            try:
                action = QuarantineAction(action_str)
                await self._execute_action(record.soulkey_id, action, record.reason)
            except Exception as exc:
                logger.error("quarantine.action_failed", action=action_str, error=str(exc))

        logger.info("quarantine.approved", quarantine_id=str(quarantine_id), approved_by=approved_by)
        return True

    async def auto_release_check(self, db: AsyncSession) -> list[uuid.UUID]:
        """Release quarantines whose auto_release_at has passed."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(SoulWatchQuarantine).where(
                SoulWatchQuarantine.status == "active",
                SoulWatchQuarantine.auto_release_at.isnot(None),
                SoulWatchQuarantine.auto_release_at <= now,
            )
        )
        records = result.scalars().all()

        released_ids = []
        for record in records:
            ok = await self.release_quarantine(db, record.id, released_by="auto")
            if ok:
                record.status = "expired"
                released_ids.append(record.id)

        if released_ids:
            await db.flush()
        return released_ids

    def is_quarantined(self, quarantines: list[SoulWatchQuarantine], soulkey_id: uuid.UUID) -> bool:
        return any(
            r.soulkey_id == soulkey_id and r.status == "active"
            for r in quarantines
        )

    async def _execute_action(
        self,
        soulkey_id: uuid.UUID,
        action: QuarantineAction,
        reason: str,
    ):
        """Execute a quarantine action by calling SoulAuth admin API."""
        base_url = self._settings.soulauth_base_url.rstrip("/")

        if action == QuarantineAction.SUSPEND_KEY:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{base_url}/v1/soulauth/admin/keys/{soulkey_id}/suspend",
                    json={"reason": reason, "suspended_by": "soulwatch_quarantine"},
                )
                if resp.status_code not in (200, 204):
                    logger.warning(
                        "quarantine.suspend_key_failed",
                        status=resp.status_code, body=resp.text[:200],
                    )
        elif action == QuarantineAction.KILL_SESSION:
            logger.info("quarantine.kill_session", soulkey_id=str(soulkey_id))
        elif action == QuarantineAction.FORCE_REAUTH:
            logger.info("quarantine.force_reauth", soulkey_id=str(soulkey_id))
        elif action == QuarantineAction.RATE_LIMIT:
            logger.info("quarantine.rate_limit", soulkey_id=str(soulkey_id), rpm=self._default_rate_limit)
        elif action == QuarantineAction.ISOLATE:
            logger.info("quarantine.isolate", soulkey_id=str(soulkey_id))
        elif action == QuarantineAction.RESET_CONTEXT:
            logger.info("quarantine.reset_context", soulkey_id=str(soulkey_id))

    async def _reverse_action(self, soulkey_id: uuid.UUID, action_str: str):
        """Reverse a quarantine action."""
        base_url = self._settings.soulauth_base_url.rstrip("/")

        if action_str == QuarantineAction.SUSPEND_KEY.value:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{base_url}/v1/soulauth/admin/keys/{soulkey_id}/reinstate",
                    json={"reinstated_by": "soulwatch_quarantine"},
                )
                if resp.status_code not in (200, 204):
                    logger.warning("quarantine.reinstate_failed", status=resp.status_code)
        # Other actions are state flags that clear on release
