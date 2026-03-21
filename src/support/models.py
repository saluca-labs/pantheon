"""
Support ticket Pydantic schemas.
"""

from datetime import datetime, timezone, timedelta
from typing import Literal, Optional

from pydantic import BaseModel, Field


# SLA hours per severity
_SLA_HOURS: dict[str, int] = {
    "p0": 4,
    "p1": 8,
    "p2": 24,
    "p3": 72,
}


def sla_deadline_for(severity: str, created_at: datetime) -> str:
    """Return ISO-8601 SLA deadline for a given severity and creation time."""
    hours = _SLA_HOURS.get(severity, 24)
    deadline = created_at + timedelta(hours=hours)
    return deadline.isoformat()


class TicketCreate(BaseModel):
    subject: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=5000)
    severity: Literal["p0", "p1", "p2", "p3"] = "p2"
    category: Literal["bug", "security", "outage", "question", "feature"] = "bug"


class TicketResponse(BaseModel):
    ticket_id: str
    status: str  # open, acknowledged, in_progress, resolved, closed
    severity: str
    category: str
    subject: str
    description: str
    tenant_id: Optional[str] = None
    created_at: str
    acknowledged_at: Optional[str] = None
    resolved_at: Optional[str] = None
    sla_deadline: Optional[str] = None  # P0=4h, P1=8h, P2=24h, P3=72h


class TicketListResponse(BaseModel):
    tickets: list[TicketResponse]
    total: int
