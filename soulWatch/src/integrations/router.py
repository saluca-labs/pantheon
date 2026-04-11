"""
Integration management API for SoulWatch - SIEM destinations, DLQ, and syslog.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.connection import get_db
from soulWatch.src.database.models import SoulWatchDLQ
from soulWatch.src.integrations.forwarder import get_event_forwarder

router = APIRouter(prefix="/watch/v1/integrations", tags=["integrations"])


@router.get("")
async def list_integrations():
    """List active SIEM destinations and their status."""
    forwarder = get_event_forwarder()
    syslog_status = _get_syslog_status()

    if not forwarder and not syslog_status.get("configured"):
        return {"destinations": [], "syslog": syslog_status, "message": "No SIEM forwarder configured"}

    health = {}
    metrics_dict = {}
    if forwarder:
        health = await forwarder.health_check()
        metrics_dict = forwarder.metrics.to_dict()

    return {
        "destinations": health.get("destinations", 0),
        "buffer_size": health.get("buffer_size", 0),
        "dead_letter_size": health.get("dead_letter_size", 0),
        "running": health.get("running", False),
        "metrics": metrics_dict,
        "syslog": syslog_status,
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


@router.post("/dlq/{item_id}/retry")
async def retry_dlq_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Manually trigger a retry for a single DLQ entry.
    On success the row is deleted; on failure retry_count is incremented.
    """
    try:
        item_uuid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")

    result = await db.execute(select(SoulWatchDLQ).where(SoulWatchDLQ.id == item_uuid))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="DLQ item not found")

    forwarder = get_event_forwarder()
    if not forwarder:
        raise HTTPException(status_code=503, detail="SIEM forwarder not configured")

    from soulWatch.src.integrations.forwarder import _event_from_row
    try:
        event = _event_from_row(row)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Cannot deserialize event: {exc}")

    failed = await forwarder._forward_batch_all_destinations(db, [event], destination_label="manual_retry")
    if failed:
        row.retry_count += 1
        row.last_retry_at = datetime.now(timezone.utc)
        row.error_message = failed[0][1][:1000]
        return {
            "status": "failed",
            "retry_count": row.retry_count,
            "error": row.error_message,
        }
    else:
        await db.execute(delete(SoulWatchDLQ).where(SoulWatchDLQ.id == item_uuid))
        return {"status": "delivered", "id": item_id}


@router.post("/dlq/retry-all")
async def retry_all_dlq(
    db: AsyncSession = Depends(get_db),
):
    """
    Kick off a flush cycle immediately, which retries all eligible DLQ rows.
    Returns the DLQ size before and after.
    """
    forwarder = get_event_forwarder()
    if not forwarder:
        raise HTTPException(status_code=503, detail="SIEM forwarder not configured")

    count_before_result = await db.execute(select(func.count()).select_from(SoulWatchDLQ))
    count_before = count_before_result.scalar() or 0

    await forwarder.flush()

    count_after_result = await db.execute(select(func.count()).select_from(SoulWatchDLQ))
    count_after = count_after_result.scalar() or 0

    return {
        "status": "ok",
        "dlq_before": count_before,
        "dlq_after": count_after,
        "delivered": count_before - count_after,
    }


@router.delete("/dlq/{item_id}")
async def delete_dlq_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete (discard) a DLQ entry without retrying it."""
    try:
        item_uuid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")

    result = await db.execute(delete(SoulWatchDLQ).where(SoulWatchDLQ.id == item_uuid))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="DLQ item not found")
    return {"status": "deleted", "id": item_id}


# ── Syslog configuration endpoints ─────────────────────────────────────


class SyslogConfigRequest(BaseModel):
    """Request body for creating/updating syslog configuration."""
    enabled: bool = Field(default=True)
    host: str = Field(..., min_length=1, max_length=253)
    port: int = Field(default=514, ge=1, le=65535)
    protocol: str = Field(default="udp", pattern="^(udp|tcp|tls)$")
    facility: int = Field(default=13, ge=0, le=23)
    use_cef: bool = Field(default=True, description="Use CEF format (true) or RFC 5424 (false)")


def _get_syslog_status() -> dict:
    """Get current syslog transport status."""
    from soulWatch.src.integrations.syslog_forwarder import get_syslog_transport
    transport = get_syslog_transport()
    if not transport:
        return {"configured": False, "enabled": False}
    status = transport.status()
    status["configured"] = True
    status["enabled"] = True
    return status


@router.get("/syslog")
async def get_syslog_config():
    """Get current syslog forwarding configuration and status."""
    return _get_syslog_status()


@router.put("/syslog")
async def update_syslog_config(config: SyslogConfigRequest):
    """
    Create or update syslog forwarding configuration.
    Takes effect immediately — no restart required.
    """
    from soulWatch.src.integrations.syslog_forwarder import (
        SyslogTransport, get_syslog_transport, set_syslog_transport,
    )

    # Close existing transport if any
    existing = get_syslog_transport()
    if existing:
        existing.close()
        set_syslog_transport(None)

    if not config.enabled:
        return {"status": "disabled", "message": "Syslog forwarding disabled"}

    # Create new transport
    transport = SyslogTransport(
        host=config.host,
        port=config.port,
        protocol=config.protocol,
        facility=config.facility,
        use_cef=config.use_cef,
    )
    set_syslog_transport(transport)

    return {
        "status": "configured",
        "message": f"Syslog forwarding enabled to {config.host}:{config.port} via {config.protocol}",
        "config": transport.status(),
    }


@router.post("/syslog/test")
async def test_syslog():
    """
    Send a test syslog message to the configured destination.
    Returns success/failure with details.
    """
    from soulWatch.src.integrations.syslog_forwarder import get_syslog_transport
    transport = get_syslog_transport()
    if not transport:
        raise HTTPException(
            status_code=400,
            detail="Syslog not configured. Use PUT /watch/v1/integrations/syslog first.",
        )

    result = transport.test_connection()
    if not result["success"]:
        raise HTTPException(
            status_code=502,
            detail=f"Syslog test failed: {result.get('error', 'unknown error')}",
        )

    return {
        "status": "success",
        "message": f"Test message sent to {result['host']}:{result['port']} via {result['protocol']}",
        "details": result,
    }


@router.delete("/syslog")
async def delete_syslog_config():
    """Disable and remove syslog forwarding configuration."""
    from soulWatch.src.integrations.syslog_forwarder import get_syslog_transport, set_syslog_transport
    transport = get_syslog_transport()
    if transport:
        transport.close()
        set_syslog_transport(None)

    return {"status": "removed", "message": "Syslog forwarding disabled and configuration cleared"}
