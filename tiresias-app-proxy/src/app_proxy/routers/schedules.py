"""Schedule endpoints — CRUD for recurring scheduled tool calls."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app_proxy.auth.middleware import verify_request
from app_proxy.config import Settings
from app_proxy.main import get_settings

logger = structlog.stdlib.get_logger("app_proxy.routers.schedules")

router = APIRouter(prefix="/v1/schedules", tags=["schedules"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class CreateScheduleRequest(BaseModel):
    agent_id: str
    tenant_id: str
    plugin_name: str
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    cron_expr: Optional[str] = None
    interval_seconds: Optional[int] = None
    enabled: bool = True


class CreateScheduleResponse(BaseModel):
    schedule_id: str
    status: str = "created"
    next_run_at: Optional[str] = None


class ScheduleDetail(BaseModel):
    id: str
    agent_id: str
    tenant_id: str
    plugin_name: str
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    cron_expr: Optional[str] = None
    interval_seconds: Optional[int] = None
    enabled: bool = True
    created_at: Optional[str] = None
    last_run_at: Optional[str] = None
    last_result: Optional[dict[str, Any]] = None
    run_count: int = 0
    error_count: int = 0
    next_run_at: Optional[str] = None


class ScheduleListResponse(BaseModel):
    schedules: list[ScheduleDetail]


class ScheduleActionResponse(BaseModel):
    schedule_id: str
    status: str


# ---------------------------------------------------------------------------
# Auth dependency (same pattern as tools.py)
# ---------------------------------------------------------------------------
def _get_auth_context(request: Request) -> dict[str, Any]:
    settings = get_settings()
    return verify_request(request, settings)


def _get_scheduler_engine():
    """Resolve the SchedulerEngine from app-level state."""
    from app_proxy.main import get_scheduler

    engine = get_scheduler()
    if engine is None:
        raise HTTPException(status_code=503, detail="Scheduler not available")
    return engine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _to_detail(sc, next_run_at: datetime | None = None) -> ScheduleDetail:
    """Convert a ScheduledCall to a ScheduleDetail response."""
    return ScheduleDetail(
        id=sc.id,
        agent_id=sc.agent_id,
        tenant_id=sc.tenant_id,
        plugin_name=sc.plugin_name,
        tool_name=sc.tool_name,
        arguments=sc.arguments,
        cron_expr=sc.cron_expr,
        interval_seconds=sc.interval_seconds,
        enabled=sc.enabled,
        created_at=sc.created_at.isoformat() if sc.created_at else None,
        last_run_at=sc.last_run_at.isoformat() if sc.last_run_at else None,
        last_result=sc.last_result,
        run_count=sc.run_count,
        error_count=sc.error_count,
        next_run_at=next_run_at.isoformat() if next_run_at else None,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("", response_model=CreateScheduleResponse)
async def create_schedule(
    body: CreateScheduleRequest,
    _auth: dict[str, Any] = Depends(_get_auth_context),
) -> CreateScheduleResponse:
    """Create a new recurring scheduled tool call."""
    engine = _get_scheduler_engine()

    if not body.cron_expr and not body.interval_seconds:
        raise HTTPException(
            status_code=422,
            detail="Either cron_expr or interval_seconds must be provided",
        )

    try:
        sc = await engine.create_schedule(
            agent_id=body.agent_id,
            tenant_id=body.tenant_id,
            plugin_name=body.plugin_name,
            tool_name=body.tool_name,
            arguments=body.arguments,
            cron_expr=body.cron_expr,
            interval_seconds=body.interval_seconds,
            enabled=body.enabled,
        )
    except Exception as exc:
        logger.error("schedules.create.error", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))

    next_run = engine._get_next_run_time(sc.id)
    return CreateScheduleResponse(
        schedule_id=sc.id,
        status="created",
        next_run_at=next_run.isoformat() if next_run else None,
    )


@router.get("", response_model=ScheduleListResponse)
async def list_schedules(
    _auth: dict[str, Any] = Depends(_get_auth_context),
) -> ScheduleListResponse:
    """List all scheduled tool calls."""
    engine = _get_scheduler_engine()
    schedules = engine.list_schedules()
    details = []
    for sc in schedules:
        next_run = engine._get_next_run_time(sc.id)
        details.append(_to_detail(sc, next_run))
    return ScheduleListResponse(schedules=details)


@router.get("/{schedule_id}", response_model=ScheduleDetail)
async def get_schedule(
    schedule_id: str,
    _auth: dict[str, Any] = Depends(_get_auth_context),
) -> ScheduleDetail:
    """Get details for a specific schedule."""
    engine = _get_scheduler_engine()
    try:
        sc = engine.get_schedule(schedule_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id!r} not found")
    next_run = engine._get_next_run_time(sc.id)
    return _to_detail(sc, next_run)


@router.delete("/{schedule_id}", response_model=ScheduleActionResponse)
async def delete_schedule(
    schedule_id: str,
    _auth: dict[str, Any] = Depends(_get_auth_context),
) -> ScheduleActionResponse:
    """Delete a scheduled tool call."""
    engine = _get_scheduler_engine()
    try:
        await engine.delete_schedule(schedule_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id!r} not found")
    return ScheduleActionResponse(schedule_id=schedule_id, status="deleted")


@router.post("/{schedule_id}/pause", response_model=ScheduleActionResponse)
async def pause_schedule(
    schedule_id: str,
    _auth: dict[str, Any] = Depends(_get_auth_context),
) -> ScheduleActionResponse:
    """Pause a scheduled tool call (keep definition, stop triggering)."""
    engine = _get_scheduler_engine()
    try:
        await engine.pause_schedule(schedule_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id!r} not found")
    return ScheduleActionResponse(schedule_id=schedule_id, status="paused")


@router.post("/{schedule_id}/resume", response_model=ScheduleActionResponse)
async def resume_schedule(
    schedule_id: str,
    _auth: dict[str, Any] = Depends(_get_auth_context),
) -> ScheduleActionResponse:
    """Resume a paused scheduled tool call."""
    engine = _get_scheduler_engine()
    try:
        await engine.resume_schedule(schedule_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id!r} not found")
    return ScheduleActionResponse(schedule_id=schedule_id, status="resumed")
