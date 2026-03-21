"""
Support ticket API router.

Routes:
  POST /v1/support/tickets                      -- create ticket (all tiers)
  GET  /v1/support/tickets                      -- list tickets (authenticated)
  GET  /v1/support/tickets/{id}                 -- get ticket detail (authenticated)
  PUT  /v1/support/tickets/{id}/acknowledge     -- acknowledge ticket (authenticated)
  PUT  /v1/support/tickets/{id}/resolve         -- resolve ticket (authenticated)

Ticket storage is in-memory (production: promote to DB).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, Request, status

from src.support.models import TicketCreate, TicketResponse, TicketListResponse, sla_deadline_for
from src.support.notifications import send_ticket_notification
from src.support.linear import create_linear_issue

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/support", tags=["Support"])

# ---------------------------------------------------------------------------
# In-memory ticket store: { ticket_id: dict }
# ---------------------------------------------------------------------------
_tickets: dict[str, dict] = {}


def _make_ticket_id() -> str:
    """Short uppercase hex ID, e.g. A3F2C1B0."""
    return uuid.uuid4().hex[:8].upper()


def _ticket_to_response(t: dict) -> TicketResponse:
    return TicketResponse(
        ticket_id=t["ticket_id"],
        status=t["status"],
        severity=t["severity"],
        category=t["category"],
        subject=t["subject"],
        description=t["description"],
        tenant_id=t.get("tenant_id"),
        created_at=t["created_at"],
        acknowledged_at=t.get("acknowledged_at"),
        resolved_at=t.get("resolved_at"),
        sla_deadline=t.get("sla_deadline"),
    )


def _get_tenant_id(request: Request) -> Optional[str]:
    """Extract tenant ID from request state (set by TenantContextMiddleware)."""
    return getattr(getattr(request, "state", None), "tenant_id", None)


def _get_tenant_name(request: Request) -> str:
    tenant_id = _get_tenant_id(request)
    if tenant_id:
        return str(tenant_id)
    return request.client.host if request.client else "unknown"


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
async def create_ticket(payload: TicketCreate, request: Request) -> TicketResponse:
    ticket_id = _make_ticket_id()
    now = datetime.now(timezone.utc)
    sla_deadline = sla_deadline_for(payload.severity, now)

    tenant_id = _get_tenant_id(request)
    tenant_name = _get_tenant_name(request)

    ticket: dict = {
        "ticket_id": ticket_id,
        "status": "open",
        "severity": payload.severity,
        "category": payload.category,
        "subject": payload.subject,
        "description": payload.description,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "created_at": now.isoformat(),
        "acknowledged_at": None,
        "resolved_at": None,
        "sla_deadline": sla_deadline,
    }
    _tickets[ticket_id] = ticket

    response = _ticket_to_response(ticket)

    # Create Linear issue first (non-fatal)
    linear_url = None
    try:
        linear_url = await create_linear_issue(response, tenant_name)
        if linear_url:
            ticket["linear_url"] = linear_url
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
async def list_tickets(request: Request) -> TicketListResponse:
    tenant_id = _get_tenant_id(request)

    if tenant_id is not None:
        # Filter to current tenant's tickets only
        matching = [t for t in _tickets.values() if t.get("tenant_id") == str(tenant_id)]
    else:
        # No tenant context — return all (admin / unauthenticated path)
        matching = list(_tickets.values())

    # Sort newest first
    matching.sort(key=lambda t: t["created_at"], reverse=True)
    return TicketListResponse(
        tickets=[_ticket_to_response(t) for t in matching],
        total=len(matching),
    )


@router.get(
    "/tickets/{ticket_id}",
    response_model=TicketResponse,
    summary="Get ticket detail",
    description="Retrieve a specific support ticket by ID.",
)
async def get_ticket(ticket_id: str, request: Request) -> TicketResponse:
    ticket = _tickets.get(ticket_id.upper())
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")

    # Tenant isolation
    tenant_id = _get_tenant_id(request)
    if tenant_id is not None and ticket.get("tenant_id") and ticket["tenant_id"] != str(tenant_id):
        raise HTTPException(status_code=403, detail="Access denied")

    return _ticket_to_response(ticket)


@router.put(
    "/tickets/{ticket_id}/acknowledge",
    response_model=TicketResponse,
    summary="Acknowledge a ticket",
    description="Mark a ticket as acknowledged. Stops escalation clock.",
)
async def acknowledge_ticket(ticket_id: str, request: Request) -> TicketResponse:
    ticket = _tickets.get(ticket_id.upper())
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")

    tenant_id = _get_tenant_id(request)
    if tenant_id is not None and ticket.get("tenant_id") and ticket["tenant_id"] != str(tenant_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if ticket["status"] in ("resolved", "closed"):
        raise HTTPException(status_code=409, detail=f"Ticket is already {ticket['status']}")

    now = datetime.now(timezone.utc)
    ticket["status"] = "acknowledged"
    ticket["acknowledged_at"] = now.isoformat()

    logger.info("support.ticket_acknowledged", ticket_id=ticket_id)
    return _ticket_to_response(ticket)


@router.put(
    "/tickets/{ticket_id}/resolve",
    response_model=TicketResponse,
    summary="Resolve a ticket",
    description="Mark a ticket as resolved.",
)
async def resolve_ticket(ticket_id: str, request: Request) -> TicketResponse:
    ticket = _tickets.get(ticket_id.upper())
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")

    tenant_id = _get_tenant_id(request)
    if tenant_id is not None and ticket.get("tenant_id") and ticket["tenant_id"] != str(tenant_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if ticket["status"] == "closed":
        raise HTTPException(status_code=409, detail="Ticket is already closed")

    now = datetime.now(timezone.utc)
    ticket["status"] = "resolved"
    ticket["resolved_at"] = now.isoformat()
    # Auto-set acknowledged_at if not already set
    if not ticket.get("acknowledged_at"):
        ticket["acknowledged_at"] = now.isoformat()

    logger.info("support.ticket_resolved", ticket_id=ticket_id)
    return _ticket_to_response(ticket)
