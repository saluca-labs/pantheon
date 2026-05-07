"""SchedulerEngine — manages recurring tool calls via APScheduler 3.x."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from sqlalchemy.future import select

from app_proxy.audit.logger import AuditLogger
from app_proxy.mcp.client import MCPClient, MCPResult
from app_proxy.plugins.registry import PluginRegistry
from app_proxy.policy.engine import CedarDecision, CedarPolicyEngine
from app_proxy.scheduler.models import ScheduledCallRecord

logger = structlog.stdlib.get_logger("app_proxy.scheduler")


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------
@dataclass
class ScheduledCall:
    """In-memory representation of a scheduled tool call."""

    id: str
    agent_id: str
    tenant_id: str
    plugin_name: str
    tool_name: str
    arguments: dict[str, Any] = field(default_factory=dict)
    cron_expr: Optional[str] = None
    interval_seconds: Optional[int] = None
    enabled: bool = True
    created_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    last_result: Optional[dict[str, Any]] = None
    run_count: int = 0
    error_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "tenant_id": self.tenant_id,
            "plugin_name": self.plugin_name,
            "tool_name": self.tool_name,
            "arguments": self.arguments,
            "cron_expr": self.cron_expr,
            "interval_seconds": self.interval_seconds,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "last_result": self.last_result,
            "run_count": self.run_count,
            "error_count": self.error_count,
        }


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
class SchedulerEngine:
    """Manages scheduled tool calls backed by APScheduler + SQLAlchemy persistence."""

    def __init__(
        self,
        db_engine: AsyncEngine,
        cedar_engine: CedarPolicyEngine,
        plugin_registry: PluginRegistry,
        audit_logger: AuditLogger,
        mcp_client: MCPClient | None = None,
    ) -> None:
        self._db_engine = db_engine
        self._session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
        self._cedar = cedar_engine
        self._registry = plugin_registry
        self._audit = audit_logger
        self._mcp = mcp_client or MCPClient()

        self._scheduler = AsyncIOScheduler()
        self._schedules: dict[str, ScheduledCall] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self) -> None:
        """Load persisted schedules from DB and start the APScheduler."""
        await self._load_from_db()
        self._scheduler.start()
        logger.info(
            "scheduler.started",
            schedule_count=len(self._schedules),
        )

    async def shutdown(self) -> None:
        """Gracefully shut down the APScheduler."""
        self._scheduler.shutdown(wait=False)
        logger.info("scheduler.shutdown")

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------
    async def create_schedule(
        self,
        schedule_id: str | None = None,
        *,
        agent_id: str,
        tenant_id: str,
        plugin_name: str,
        tool_name: str,
        arguments: dict[str, Any] | None = None,
        cron_expr: str | None = None,
        interval_seconds: int | None = None,
        enabled: bool = True,
    ) -> ScheduledCall:
        """Create and persist a new scheduled tool call."""
        if not cron_expr and not interval_seconds:
            raise ValueError("Either cron_expr or interval_seconds must be provided")

        sid = schedule_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        args = arguments or {}

        sc = ScheduledCall(
            id=sid,
            agent_id=agent_id,
            tenant_id=tenant_id,
            plugin_name=plugin_name,
            tool_name=tool_name,
            arguments=args,
            cron_expr=cron_expr,
            interval_seconds=interval_seconds,
            enabled=enabled,
            created_at=now,
        )

        # Persist
        record = ScheduledCallRecord(
            id=sid,
            agent_id=agent_id,
            tenant_id=tenant_id,
            plugin_name=plugin_name,
            tool_name=tool_name,
            arguments_json=json.dumps(args),
            cron_expr=cron_expr,
            interval_seconds=interval_seconds,
            enabled=enabled,
            created_at=now,
            updated_at=now,
        )
        async with self._session_factory() as session:
            session.add(record)
            await session.commit()

        self._schedules[sid] = sc

        # Register with APScheduler
        if enabled:
            self._add_apscheduler_job(sc)

        logger.info(
            "scheduler.schedule_created",
            schedule_id=sid,
            tool=tool_name,
            cron=cron_expr,
            interval_s=interval_seconds,
        )
        return sc

    async def delete_schedule(self, schedule_id: str) -> None:
        """Remove a schedule from APScheduler and the database."""
        if schedule_id not in self._schedules:
            raise KeyError(f"Schedule {schedule_id!r} not found")

        # Remove APScheduler job
        self._remove_apscheduler_job(schedule_id)

        # Delete from DB
        async with self._session_factory() as session:
            row = await session.get(ScheduledCallRecord, schedule_id)
            if row:
                await session.delete(row)
                await session.commit()

        del self._schedules[schedule_id]
        logger.info("scheduler.schedule_deleted", schedule_id=schedule_id)

    def list_schedules(self) -> list[ScheduledCall]:
        """Return all known schedules."""
        return list(self._schedules.values())

    def get_schedule(self, schedule_id: str) -> ScheduledCall:
        """Return a single schedule by ID."""
        sc = self._schedules.get(schedule_id)
        if sc is None:
            raise KeyError(f"Schedule {schedule_id!r} not found")
        return sc

    async def pause_schedule(self, schedule_id: str) -> None:
        """Pause a schedule (stop triggering but keep definition)."""
        sc = self._schedules.get(schedule_id)
        if sc is None:
            raise KeyError(f"Schedule {schedule_id!r} not found")

        sc.enabled = False
        self._remove_apscheduler_job(schedule_id)
        await self._update_enabled(schedule_id, False)
        logger.info("scheduler.schedule_paused", schedule_id=schedule_id)

    async def resume_schedule(self, schedule_id: str) -> None:
        """Resume a paused schedule."""
        sc = self._schedules.get(schedule_id)
        if sc is None:
            raise KeyError(f"Schedule {schedule_id!r} not found")

        sc.enabled = True
        self._add_apscheduler_job(sc)
        await self._update_enabled(schedule_id, True)
        logger.info("scheduler.schedule_resumed", schedule_id=schedule_id)

    # ------------------------------------------------------------------
    # Job execution (called by APScheduler on each trigger)
    # ------------------------------------------------------------------
    async def _execute_scheduled_call(self, schedule_id: str) -> None:
        """Execute a single scheduled tool call with Cedar eval + MCP dispatch."""
        sc = self._schedules.get(schedule_id)
        if sc is None:
            logger.warning("scheduler.execute.missing", schedule_id=schedule_id)
            return

        call_id = str(uuid.uuid4())
        log = logger.bind(schedule_id=schedule_id, call_id=call_id, tool=sc.tool_name)

        # 1. Cedar policy evaluation (synchronous, thread-safe)
        decision = self._evaluate_cedar(sc)

        if not decision.allowed:
            # Record denial in audit
            audit_ref = await self._audit.record_call(
                tenant_id=sc.tenant_id,
                agent_id=sc.agent_id,
                plugin_name=sc.plugin_name,
                tool_name=sc.tool_name,
                call_id=call_id,
                arguments=sc.arguments,
                policy_decision="deny",
                policy_reason="; ".join(decision.reasons) or "Denied by policy",
                session_id=f"scheduled:{schedule_id}",
            )
            await self._audit.record_result(
                audit_ref,
                status="denied",
                error_message="; ".join(decision.reasons) or "Denied by policy",
            )
            sc.error_count += 1
            sc.last_run_at = datetime.now(timezone.utc)
            sc.last_result = {"status": "denied", "reasons": decision.reasons}
            await self._update_run_stats(sc)
            log.warning("scheduler.execute.denied", reasons=decision.reasons)
            return

        # 2. Dispatch via MCP
        audit_ref = await self._audit.record_call(
            tenant_id=sc.tenant_id,
            agent_id=sc.agent_id,
            plugin_name=sc.plugin_name,
            tool_name=sc.tool_name,
            call_id=call_id,
            arguments=sc.arguments,
            policy_decision="allow",
            policy_reason="",
            session_id=f"scheduled:{schedule_id}",
        )

        try:
            plugin_config = self._registry.get_plugin_config(sc.plugin_name)
            if plugin_config is None:
                raise RuntimeError(f"No config for plugin {sc.plugin_name!r}")

            result: MCPResult = await self._mcp.dispatch_tool_call(
                plugin_config, sc.tool_name, sc.arguments
            )
        except Exception as exc:
            await self._audit.record_result(
                audit_ref, status="error", error_message=str(exc)
            )
            sc.error_count += 1
            sc.run_count += 1
            sc.last_run_at = datetime.now(timezone.utc)
            sc.last_result = {"status": "error", "error": str(exc)}
            await self._update_run_stats(sc)
            log.error("scheduler.execute.dispatch_error", error=str(exc))
            return

        # 3. Record result
        sc.run_count += 1
        sc.last_run_at = datetime.now(timezone.utc)

        if result.success:
            await self._audit.record_result(
                audit_ref,
                status="success",
                result=result.result,
                plugin_latency_ms=result.latency_ms,
            )
            sc.last_result = {"status": "success", "result": result.result}
            log.info(
                "scheduler.execute.success",
                latency_ms=round(result.latency_ms, 2),
            )
        else:
            await self._audit.record_result(
                audit_ref,
                status="error",
                error_message=result.error,
                plugin_latency_ms=result.latency_ms,
            )
            sc.error_count += 1
            sc.last_result = {"status": "error", "error": result.error}
            log.warning("scheduler.execute.plugin_error", error=result.error)

        await self._update_run_stats(sc)

    # ------------------------------------------------------------------
    # Cedar helper
    # ------------------------------------------------------------------
    def _evaluate_cedar(self, sc: ScheduledCall) -> CedarDecision:
        """Build Cedar context and evaluate policy for a scheduled call."""
        return self._cedar.authorize(
            agent_id=sc.agent_id,
            agent_attrs={"soulkey": "", "roles": []},
            tenant_id=sc.tenant_id,
            tenant_attrs={"tier": "enterprise", "max_agents": 50},
            plugin_id=sc.plugin_name,
            plugin_attrs={
                "classification": "safe",
                "owner_tenant": sc.tenant_id,
            },
            action="tool_call",
            context={
                "tool_name": sc.tool_name,
                "rate_count": 0,
                "rate_window_seconds": 3600,
                "hour_of_day": datetime.now(timezone.utc).hour,
                "has_approval": False,
                "estimated_cost_usd": 0,
                "input_keys": list(sc.arguments.keys()),
            },
        )

    # ------------------------------------------------------------------
    # APScheduler helpers
    # ------------------------------------------------------------------
    def _add_apscheduler_job(self, sc: ScheduledCall) -> None:
        """Register an APScheduler job for the given ScheduledCall."""
        if sc.cron_expr:
            trigger = CronTrigger.from_crontab(sc.cron_expr)
        elif sc.interval_seconds:
            trigger = IntervalTrigger(seconds=sc.interval_seconds)
        else:
            return

        self._scheduler.add_job(
            self._execute_scheduled_call,
            trigger=trigger,
            args=[sc.id],
            id=sc.id,
            name=f"scheduled:{sc.tool_name}",
            replace_existing=True,
        )

    def _remove_apscheduler_job(self, schedule_id: str) -> None:
        """Remove an APScheduler job if it exists."""
        try:
            self._scheduler.remove_job(schedule_id)
        except Exception:
            pass  # job may not exist

    def _get_next_run_time(self, schedule_id: str) -> Optional[datetime]:
        """Get the next fire time for a job from APScheduler."""
        job = self._scheduler.get_job(schedule_id)
        if job and job.next_run_time:
            return job.next_run_time
        return None

    # ------------------------------------------------------------------
    # DB persistence helpers
    # ------------------------------------------------------------------
    async def _load_from_db(self) -> None:
        """Load all persisted schedules and register enabled ones with APScheduler."""
        async with self._session_factory() as session:
            result = await session.execute(select(ScheduledCallRecord))
            rows = result.scalars().all()

        for row in rows:
            sc = ScheduledCall(
                id=row.id,
                agent_id=row.agent_id,
                tenant_id=row.tenant_id,
                plugin_name=row.plugin_name,
                tool_name=row.tool_name,
                arguments=json.loads(row.arguments_json) if row.arguments_json else {},
                cron_expr=row.cron_expr,
                interval_seconds=row.interval_seconds,
                enabled=row.enabled,
                created_at=row.created_at,
                last_run_at=row.last_run_at,
                run_count=row.run_count,
                error_count=row.error_count,
            )
            self._schedules[sc.id] = sc

            if sc.enabled:
                self._add_apscheduler_job(sc)

        logger.info("scheduler.loaded_from_db", count=len(rows))

    async def _update_enabled(self, schedule_id: str, enabled: bool) -> None:
        """Update the enabled flag in the database."""
        async with self._session_factory() as session:
            row = await session.get(ScheduledCallRecord, schedule_id)
            if row:
                row.enabled = enabled
                row.updated_at = datetime.now(timezone.utc)
                await session.commit()

    async def _update_run_stats(self, sc: ScheduledCall) -> None:
        """Persist run statistics after each execution."""
        async with self._session_factory() as session:
            row = await session.get(ScheduledCallRecord, sc.id)
            if row:
                row.last_run_at = sc.last_run_at
                row.last_status = (
                    sc.last_result.get("status") if sc.last_result else None
                )
                row.run_count = sc.run_count
                row.error_count = sc.error_count
                row.updated_at = datetime.now(timezone.utc)
                await session.commit()
