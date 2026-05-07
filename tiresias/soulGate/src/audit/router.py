"""
Audit log query and statistics endpoints.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.src.database.connection import get_db
from soulGate.src.database.models import SoulGateRequestLog
from soulGate.src.audit.logger import get_queue_size

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/gate/v1/audit", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    tenant_id: Optional[uuid.UUID]
    soulkey_id: Optional[uuid.UUID]
    persona_id: Optional[str]
    api_key_id: Optional[uuid.UUID]
    method: str
    path: str
    request_size_bytes: Optional[int]
    response_status: Optional[int]
    response_size_bytes: Optional[int]
    response_time_ms: Optional[float]
    upstream_name: Optional[str]
    blocked: bool
    block_reason: Optional[str]
    threat_flags: Optional[dict]
    source_ip: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


@router.get("/logs", response_model=list[AuditLogResponse])
async def list_audit_logs(
    tenant_id: Optional[uuid.UUID] = None,
    upstream_name: Optional[str] = None,
    blocked: Optional[bool] = None,
    since_hours: int = Query(default=24, ge=1, le=720),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Query audit logs with filters."""
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)

    query = select(SoulGateRequestLog).where(
        SoulGateRequestLog.created_at >= since
    )

    if tenant_id:
        query = query.where(SoulGateRequestLog.tenant_id == tenant_id)
    if upstream_name:
        query = query.where(SoulGateRequestLog.upstream_name == upstream_name)
    if blocked is not None:
        query = query.where(SoulGateRequestLog.blocked == blocked)

    query = query.order_by(SoulGateRequestLog.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats")
async def audit_stats(
    tenant_id: Optional[uuid.UUID] = None,
    since_hours: int = Query(default=24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
):
    """Get audit log statistics."""
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)

    base_filter = [SoulGateRequestLog.created_at >= since]
    if tenant_id:
        base_filter.append(SoulGateRequestLog.tenant_id == tenant_id)

    # Total requests
    total_result = await db.execute(
        select(func.count(SoulGateRequestLog.id)).where(and_(*base_filter))
    )
    total = total_result.scalar() or 0

    # Blocked requests
    blocked_result = await db.execute(
        select(func.count(SoulGateRequestLog.id)).where(
            and_(*base_filter, SoulGateRequestLog.blocked == True)
        )
    )
    blocked = blocked_result.scalar() or 0

    # Average response time
    avg_result = await db.execute(
        select(func.avg(SoulGateRequestLog.response_time_ms)).where(and_(*base_filter))
    )
    avg_response_time = avg_result.scalar()

    # Requests by upstream
    upstream_result = await db.execute(
        select(
            SoulGateRequestLog.upstream_name,
            func.count(SoulGateRequestLog.id),
        )
        .where(and_(*base_filter))
        .group_by(SoulGateRequestLog.upstream_name)
    )
    by_upstream = {row[0] or "unknown": row[1] for row in upstream_result.all()}

    # Requests by status
    status_result = await db.execute(
        select(
            SoulGateRequestLog.response_status,
            func.count(SoulGateRequestLog.id),
        )
        .where(and_(*base_filter))
        .group_by(SoulGateRequestLog.response_status)
    )
    by_status = {str(row[0] or "pending"): row[1] for row in status_result.all()}

    # Block reasons
    block_result = await db.execute(
        select(
            SoulGateRequestLog.block_reason,
            func.count(SoulGateRequestLog.id),
        )
        .where(
            and_(*base_filter, SoulGateRequestLog.blocked == True)
        )
        .group_by(SoulGateRequestLog.block_reason)
    )
    by_block_reason = {row[0] or "unknown": row[1] for row in block_result.all()}

    return {
        "period_hours": since_hours,
        "total_requests": total,
        "blocked_requests": blocked,
        "block_rate": round(blocked / total * 100, 2) if total > 0 else 0,
        "avg_response_time_ms": round(avg_response_time, 2) if avg_response_time else 0,
        "by_upstream": by_upstream,
        "by_status": by_status,
        "by_block_reason": by_block_reason,
        "audit_queue_size": get_queue_size(),
    }
