"""
Pydantic request/response schemas for the partner admin API.

Used by admin_router.py for all /v1/admin/partners endpoints.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from src.partner.types import PartnerType


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class PartnerListParams(BaseModel):
    """Query parameters for GET /v1/admin/partners."""
    status: Optional[str] = Field(None, description="Filter by status: active, suspended, deactivated, pending")
    partner_type: Optional[PartnerType] = Field(None, description="Filter by partner type: reseller, mssp")
    search: Optional[str] = Field(None, description="Case-insensitive search on name, contact_email, referral_code")
    page: int = Field(1, ge=1, description="Page number (1-indexed)")
    per_page: int = Field(20, ge=1, le=100, description="Items per page")


class DeactivatePartnerRequest(BaseModel):
    """Request body for POST /v1/admin/partners/{partner_id}/deactivate."""
    reason: str = Field(..., min_length=5, max_length=1000, description="Reason for deactivation")


class ReactivatePartnerRequest(BaseModel):
    """Request body for POST /v1/admin/partners/{partner_id}/reactivate."""
    reason: Optional[str] = Field(None, max_length=1000, description="Optional notes for reactivation")


class UpdatePartnerTermsRequest(BaseModel):
    """Request body for PATCH /v1/admin/partners/{partner_id}/terms."""
    commission_rate: Optional[float] = Field(None, ge=0.10, le=0.40, description="Commission rate (0.10 to 0.40)")
    payout_frequency: Optional[str] = Field(None, pattern="^(monthly|quarterly)$", description="Payout frequency: monthly or quarterly")
    partner_type: Optional[PartnerType] = Field(None, description="Partner type: reseller or mssp")


class RevokeInvitationRequest(BaseModel):
    """Request body for DELETE /v1/admin/invitations/{invitation_id}."""
    reason: Optional[str] = Field(None, max_length=1000, description="Optional reason for revocation")


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class PartnerSummary(BaseModel):
    """Summary view of a partner for list endpoints."""
    id: str
    name: str
    contact_email: str
    partner_type: Optional[str] = None
    status: str
    referral_code: str
    commission_rate: float
    created_at: Optional[str] = None
    referral_count: int = 0
    mrr_attributed: Optional[float] = None


class ReferralInfo(BaseModel):
    """Referral tenant entry within partner detail."""
    tenant_id: str
    tenant_name: str
    tier: str
    status: str
    created_at: Optional[str] = None


class AuditEntry(BaseModel):
    """Single audit log entry."""
    id: str
    event_type: str
    actor: Optional[str] = None
    detail: Optional[dict] = None
    created_at: Optional[str] = None


class PartnerDetail(BaseModel):
    """Full partner detail including referrals and audit trail."""
    id: str
    name: str
    contact_email: str
    partner_type: Optional[str] = None
    status: str
    referral_code: str
    commission_rate: float
    created_at: Optional[str] = None
    referral_count: int = 0
    mrr_attributed: Optional[float] = None
    stripe_connect_account_id: Optional[str] = None
    charges_enabled: Optional[bool] = None
    payouts_enabled: Optional[bool] = None
    deactivated_at: Optional[str] = None
    deactivated_reason: Optional[str] = None
    deactivated_by: Optional[str] = None
    referrals: list[ReferralInfo] = []
    audit_entries: list[AuditEntry] = []


class PartnerListResponse(BaseModel):
    """Paginated partner list response."""
    items: list[PartnerSummary]
    total: int
    page: int
    per_page: int
    pages: int


class InvitationSummary(BaseModel):
    """Summary view of a partner invitation."""
    id: str
    token_hash: str = Field(description="Last 8 characters of the token hash")
    partner_name: str
    contact_email: str
    partner_type: Optional[str] = None
    commission_rate: float
    status: str
    created_at: Optional[str] = None
    expires_at: Optional[str] = None
    consumed_at: Optional[str] = None


class InvitationListResponse(BaseModel):
    """Paginated invitation list response."""
    items: list[InvitationSummary]
    total: int


class AdminActionResponse(BaseModel):
    """Standard response for admin mutation endpoints."""
    success: bool
    message: str
    partner_id: str
