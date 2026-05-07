"""
Support ticket API router.

Routes:
  POST /v1/support/tickets                      -- create ticket (all tiers)
  GET  /v1/support/tickets                      -- list tickets (authenticated)
  GET  /v1/support/tickets/{id}                 -- get ticket detail (authenticated)
  PUT  /v1/support/tickets/{id}/acknowledge     -- acknowledge ticket (authenticated)
  PUT  /v1/support/tickets/{id}/resolve         -- resolve ticket (authenticated)

Ticket storage is persisted to the PostgreSQL/SQLite database via _support_tickets table.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.support.models import TicketCreate, TicketResponse, TicketListResponse, sla_deadline_for
from src.support.notifications import send_ticket_notification
from src.support.linear import create_linear_issue

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/support", tags=["Support"])


def _make_ticket_id() -> str:
    """Short uppercase hex ID, e.g. A3F2C1B0."""
    return uuid.uuid4().hex[:8].upper()


def _get_tenant_id(request: Request) -> Optional[str]:
    """Extract tenant ID from request state (set by TenantContextMiddleware)."""
    return getattr(getattr(request, "state", None), "tenant_id", None)


def _get_tenant_name(request: Request) -> str:
    tenant_id = _get_tenant_id(request)
    if tenant_id:
        return str(tenant_id)
    return request.client.host if request.client else "unknown"


def _row_to_response(row) -> TicketResponse:
    """Map a DB row (RowMapping or Row) to TicketResponse."""
    r = row._mapping if hasattr(row, "_mapping") else row

    def _iso(val) -> Optional[str]:
        if val is None:
            return None
        if isinstance(val, str):
            return val
        if isinstance(val, datetime):
            return val.isoformat()
        return str(val)

    return TicketResponse(
        ticket_id=r["ticket_id"],
        status=r["status"],
        severity=r["severity"],
        category=r["category"],
        subject=r["subject"],
        description=r["description"],
        tenant_id=str(r["tenant_id"]) if r.get("tenant_id") else None,
        created_at=_iso(r["created_at"]),
        acknowledged_at=_iso(r.get("acknowledged_at")),
        resolved_at=_iso(r.get("resolved_at")),
        sla_deadline=_iso(r.get("sla_deadline")),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/tickets",
    response_model=TicketResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a support ticket",
    description=(
        "Open a new support ticket. Available to all tiers including community. "
        "P0/P1 tickets trigger immediate Telegram notification to the ops team."
    ),
)
async def create_ticket(
    payload: TicketCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TicketResponse:
    ticket_id = _make_ticket_id()
    now = datetime.now(timezone.utc)
    sla_deadline = sla_deadline_for(payload.severity, now)

    tenant_id = _get_tenant_id(request)
    tenant_name = _get_tenant_name(request)

    stmt = text("""
        INSERT INTO _support_tickets (
            ticket_id, tenant_id, status, severity, category,
            subject, description, contact_email, contact_name,
            sla_deadline, created_at
        ) VALUES (
            :ticket_id, :tenant_id, 'open', :severity, :category,
            :subject, :description, :contact_email, :contact_name,
            :sla_deadline, :created_at
        )
    """)
    await db.execute(stmt, {
        "ticket_id": ticket_id,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "severity": payload.severity,
        "category": payload.category,
        "subject": payload.subject,
        "description": payload.description,
        "contact_email": payload.contact_email,
        "contact_name": payload.contact_name,
        "sla_deadline": sla_deadline,
        "created_at": now.isoformat(),
    })
    await db.commit()

    # Fetch the freshly inserted row
    row = (await db.execute(
        text("SELECT * FROM _support_tickets WHERE ticket_id = :tid"),
        {"tid": ticket_id},
    )).fetchone()

    response = _row_to_response(row)

    # Create Linear issue first (non-fatal)
    linear_url = None
    try:
        linear_url = await create_linear_issue(response, tenant_name)
        if linear_url:
            await db.execute(
                text("UPDATE _support_tickets SET linear_url = :url WHERE ticket_id = :tid"),
                {"url": linear_url, "tid": ticket_id},
            )
            await db.commit()
    except Exception as exc:
        logger.warning("support.linear_create_error", ticket_id=ticket_id, error=str(exc))

    # Fire Telegram notification with Linear URL (non-fatal)
    try:
        await send_ticket_notification(response, tenant_name, linear_url=linear_url)
    except Exception as exc:
        logger.warning("support.create_notification_error", ticket_id=ticket_id, error=str(exc))

    logger.info(
        "support.ticket_created",
        ticket_id=ticket_id,
        severity=payload.severity,
        category=payload.category,
        tenant_id=str(tenant_id) if tenant_id else None,
    )
    return response


@router.get(
    "/tickets",
    response_model=TicketListResponse,
    summary="List support tickets",
    description="List all support tickets for the current tenant. Requires authentication.",
)
async def list_tickets(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TicketListResponse:
    tenant_id = _get_tenant_id(request)

    if tenant_id is not None:
        rows = (await db.execute(
            text("SELECT * FROM _support_tickets WHERE tenant_id = :tid ORDER BY created_at DESC"),
            {"tid": str(tenant_id)},
        )).fetchall()
    else:
        rows = (await db.execute(
            text("SELECT * FROM _support_tickets ORDER BY created_at DESC"),
        )).fetchall()

    tickets = [_row_to_response(r) for r in rows]
    return TicketListResponse(tickets=tickets, total=len(tickets))


@router.get(
    "/tickets/{ticket_id}",
    response_model=TicketResponse,
    summary="Get ticket detail",
    description="Retrieve a specific support ticket by ID.",
)
async def get_ticket(
    ticket_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TicketResponse:
    row = (await db.execute(
        text("SELECT * FROM _support_tickets WHERE ticket_id = :tid"),
        {"tid": ticket_id.upper()},
    )).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")

    r = row._mapping if hasattr(row, "_mapping") else row
    tenant_id = _get_tenant_id(request)
    if tenant_id is not None and r.get("tenant_id") and str(r["tenant_id"]) != str(tenant_id):
        raise HTTPException(status_code=403, detail="Access denied")

    return _row_to_response(row)


@router.put(
    "/tickets/{ticket_id}/acknowledge",
    response_model=TicketResponse,
    summary="Acknowledge a ticket",
    description="Mark a ticket as acknowledged. Stops escalation clock.",
)
async def acknowledge_ticket(
    ticket_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TicketResponse:
    row = (await db.execute(
        text("SELECT * FROM _support_tickets WHERE ticket_id = :tid"),
        {"tid": ticket_id.upper()},
    )).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")

    r = row._mapping if hasattr(row, "_mapping") else row
    tenant_id = _get_tenant_id(request)
    if tenant_id is not None and r.get("tenant_id") and str(r["tenant_id"]) != str(tenant_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if r["status"] in ("resolved", "closed"):
        raise HTTPException(status_code=409, detail=f"Ticket is already {r['status']}")

    now = datetime.now(timezone.utc)
    await db.execute(
        text("""
            UPDATE _support_tickets
            SET status = 'acknowledged', acknowledged_at = :now
            WHERE ticket_id = :tid
        """),
        {"now": now.isoformat(), "tid": ticket_id.upper()},
    )
    await db.commit()

    # Fire P0 acknowledgment email (non-fatal, P0 only)
    if r.get("severity") == "p0":
        try:
            import asyncio as _asyncio
            from src.email.triggers import on_p0_acknowledged as _email_p0
            _contact_email = r.get("contact_email") or ""
            _contact_name = r.get("contact_name") or "Customer"
            if _contact_email:
                _asyncio.create_task(_email_p0(
                    contact_name=_contact_name,
                    contact_email=_contact_email,
                    ticket_id=r["ticket_id"],
                    subject=r.get("subject", "P0 Issue"),
                    sla_hours=4,
                ))
        except Exception:
            pass

    updated_row = (await db.execute(
        text("SELECT * FROM _support_tickets WHERE ticket_id = :tid"),
        {"tid": ticket_id.upper()},
    )).fetchone()

    logger.info("support.ticket_acknowledged", ticket_id=ticket_id)
    return _row_to_response(updated_row)


@router.put(
    "/tickets/{ticket_id}/resolve",
    response_model=TicketResponse,
    summary="Resolve a ticket",
    description="Mark a ticket as resolved.",
)
async def resolve_ticket(
    ticket_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TicketResponse:
    row = (await db.execute(
        text("SELECT * FROM _support_tickets WHERE ticket_id = :tid"),
        {"tid": ticket_id.upper()},
    )).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")

    r = row._mapping if hasattr(row, "_mapping") else row
    tenant_id = _get_tenant_id(request)
    if tenant_id is not None and r.get("tenant_id") and str(r["tenant_id"]) != str(tenant_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if r["status"] == "closed":
        raise HTTPException(status_code=409, detail="Ticket is already closed")

    now = datetime.now(timezone.utc)
    await db.execute(
        text("""
            UPDATE _support_tickets
            SET status = 'resolved',
                resolved_at = :now,
                acknowledged_at = COALESCE(acknowledged_at, :now)
            WHERE ticket_id = :tid
        """),
        {"now": now.isoformat(), "tid": ticket_id.upper()},
    )
    await db.commit()

    updated_row = (await db.execute(
        text("SELECT * FROM _support_tickets WHERE ticket_id = :tid"),
        {"tid": ticket_id.upper()},
    )).fetchone()

    logger.info("support.ticket_resolved", ticket_id=ticket_id)
    return _row_to_response(updated_row)
