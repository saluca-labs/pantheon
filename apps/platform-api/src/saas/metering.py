"""
Usage metering — aggregate per-tenant metrics from AuditLog for billing.
Implements SAAS-02.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import AuditLog, SoulTenant

logger = structlog.get_logger(__name__)


async def get_tenant_usage(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> dict:
    """
    Aggregate usage metrics for a tenant over a time range.
    Returns dict with requests, tokens, anomalies, storage_bytes.
    Raises ValueError if tenant does not exist.
    """
    # Verify tenant exists
    result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise ValueError(f"Tenant {tenant_id} not found")

    # Base query scoped to tenant
    query = select(
        func.count(AuditLog.id).label("total_events"),
    ).where(AuditLog.tenant_id == tenant_id)

    if start:
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        query = query.where(AuditLog.timestamp >= start)
    if end:
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        query = query.where(AuditLog.timestamp <= end)

    result = await db.execute(query)
    row = result.one()
    total_events = row.total_events or 0

    # Count auth requests specifically (event_type contains "auth" or "evaluate")
    auth_query = select(func.count(AuditLog.id)).where(
        AuditLog.tenant_id == tenant_id,
        AuditLog.event_type.in_(["auth.evaluate", "auth.identity", "auth.issue", "auth.revoke"]),
    )
    if start:
        auth_query = auth_query.where(AuditLog.timestamp >= start)
    if end:
        auth_query = auth_query.where(AuditLog.timestamp <= end)
    auth_result = await db.execute(auth_query)
    auth_requests = auth_result.scalar() or 0

    # Count anomaly events
    anomaly_query = select(func.count(AuditLog.id)).where(
        AuditLog.tenant_id == tenant_id,
        AuditLog.event_type.like("anomaly%"),
    )
    if start:
        anomaly_query = anomaly_query.where(AuditLog.timestamp >= start)
    if end:
        anomaly_query = anomaly_query.where(AuditLog.timestamp <= end)
    anomaly_result = await db.execute(anomaly_query)
    anomaly_count = anomaly_result.scalar() or 0

    # Token estimate: no token col in AuditLog — derive from context JSON field
    # context->>'tokens' if present, else 0
    context_query = select(AuditLog.context).where(
        AuditLog.tenant_id == tenant_id,
        AuditLog.context.isnot(None),
    )
    if start:
        context_query = context_query.where(AuditLog.timestamp >= start)
    if end:
        context_query = context_query.where(AuditLog.timestamp <= end)
    ctx_result = await db.execute(context_query)
    token_total = 0
    for (ctx,) in ctx_result:
        if isinstance(ctx, dict) and "tokens" in ctx:
            try:
                token_total += int(ctx["tokens"])
            except (TypeError, ValueError):
                pass

    # Storage bytes: rough estimate — 512 bytes per audit record
    storage_bytes = total_events * 512

    logger.info(
        "saas.metering.usage",
        tenant_id=str(tenant_id),
        total_events=total_events,
        auth_requests=auth_requests,
        anomaly_count=anomaly_count,
        token_total=token_total,
    )

    return {
        "tenant_id": str(tenant_id),
        "requests": auth_requests,
        "tokens": token_total,
        "anomalies": anomaly_count,
        "storage_bytes": storage_bytes,
        "total_events": total_events,
        "period": {
            "start": start.isoformat() if start else None,
            "end": end.isoformat() if end else None,
        },
    }
