"""
Integration management API for SoulWatch - SIEM destinations and DLQ.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.connection import get_db
from soulWatch.src.database.models import SoulWatchDLQ
from soulWatch.src.integrations.forwarder import get_event_forwarder

router = APIRouter(prefix="/watch/v1/integrations", tags=["integrations"])


@router.get("")
async def list_integrations():
    """List active SIEM destinations and their status."""
    forwarder = get_event_forwarder()
    if not forwarder:
        return {"destinations": [], "message": "SIEM forwarder not configured"}

    health = await forwarder.health_check()
    return {
        "destinations": health.get("destinations", 0),
        "buffer_size": health.get("buffer_size", 0),
        "dead_letter_size": health.get("dead_letter_size", 0),
        "running": health.get("running", False),
        "metrics": forwarder.metrics.to_dict(),
    }


@router.get("/health")
async def integration_health():
    """Health check for SIEM destinations."""
    forwarder = get_event_forwarder()
    if not forwarder:
        return {"status": "not_configured"}

    health = await forwarder.health_check()
    return {"status": "healthy" if health.get("running") else "stopped", **health}


@router.get("/dlq")
async def list_dlq(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """View dead letter queue entries."""
    offset = (page - 1) * page_size
    result = await db.execute(
        select(SoulWatchDLQ)
        .order_by(SoulWatchDLQ.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = result.scalars().all()

    count_result = await db.execute(select(func.count()).select_from(SoulWatchDLQ))
    total = count_result.scalar() or 0

    return {
        "dlq_items": [
            {
                "id": str(item.id),
                "destination": item.destination,
                "error_message": item.error_message,
                "retry_count": item.retry_count,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "last_retry_at": item.last_retry_at.isoformat() if item.last_retry_at else None,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
