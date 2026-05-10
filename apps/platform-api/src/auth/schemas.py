"""
Pydantic schemas for authentication requests and responses.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class IdentityResponse(BaseModel):
    soulkey_id: uuid.UUID
    tenant_id: uuid.UUID
    persona_id: str
    status: str
    label: Optional[str] = None
    issued_at: datetime
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None


class IssueSoulkeyRequest(BaseModel):
    tenant_id: uuid.UUID
    persona_id: str
    label: Optional[str] = None
    expires_at: Optional[datetime] = None
    metadata: Optional[dict] = None


class IssueSoulkeyResponse(BaseModel):
    soulkey_id: uuid.UUID
    raw_key: str = Field(description="Shown once. Never stored. Save immediately.")
    persona_id: str
    tenant_id: uuid.UUID
    status: str
    issued_at: datetime
    expires_at: Optional[datetime] = None


class SoulkeyDetail(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    persona_id: str
    label: Optional[str] = None
    status: str
    issued_at: datetime
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    suspended_at: Optional[datetime] = None
    suspended_by: Optional[str] = None
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[str] = None
    revocation_reason: Optional[str] = None
    metadata: Optional[dict] = None

    model_config = {"from_attributes": True}


class SuspendKeyRequest(BaseModel):
    suspended_by: str
    reason: Optional[str] = None


class RevokeKeyRequest(BaseModel):
    revoked_by: str
    reason: str


class AuthEvaluateRequest(BaseModel):
    resource: str
    action: str
    scope: str
    context: Optional[dict] = Field(default_factory=dict)
    user_context: Optional[dict] = Field(
        default=None,
        description="Optional user context: {user_id, user_role, user_department, user_clearance, relationship_type}",
    )


class AuthEvaluateResponse(BaseModel):
    decision: str
    capability_token: Optional[str] = None
    expires_in: Optional[int] = None
    granted_scopes: Optional[list[str]] = None
    reason: Optional[str] = None
    escalation_available: Optional[bool] = None
    escalation_approver_role: Optional[str] = None
    audit_id: uuid.UUID


class WhoamiResponse(BaseModel):
    persona_id: str
    tenant_id: uuid.UUID
    soulkey_id: uuid.UUID
    status: str
    # Tenant tier + display name resolved from the DB so the portal can refresh
    # stale cookie data without a separate /tenant lookup. Optional for
    # backward compatibility with older clients.
    tier: Optional[str] = None
    tenant_name: Optional[str] = None
    active_capabilities: int = 0
    policy_summary: Optional[dict] = None


class EscalationRequest(BaseModel):
    resource: str
    action: str
    scope: str
    justification: str
    requested_ttl: int = 300


class EscalationResponse(BaseModel):
    escalation_id: uuid.UUID
    status: str
    approver_role: str
    notification_sent: bool = False


class DelegationRequest(BaseModel):
    target_persona: str
    resource: str
    action: str
    scope: str
    ttl: int
    reason: str


class DelegationResponse(BaseModel):
    delegation_id: uuid.UUID
    grantee_persona: str
    resource: str
    action: str
    scope: str
    expires_at: datetime


# --- Tenant schemas ---

class CreateTenantRequest(BaseModel):
    name: str
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$")
    tier: str = "free"
    parent_tenant_id: Optional[uuid.UUID] = None
    metadata: Optional[dict] = None


class TenantDetail(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    tier: str
    status: str
    parent_tenant_id: Optional[uuid.UUID] = None
    hierarchy_depth: int = 0
    metadata: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UpdateTenantRequest(BaseModel):
    name: Optional[str] = None
    tier: Optional[str] = None
    status: Optional[str] = None
    metadata: Optional[dict] = None


# --- Trial schemas ---

class TrialRegistrationRequest(BaseModel):
    contact_name: str
    contact_email: str = Field(pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
    company_name: str
    company_domain: str
    use_case: Optional[str] = None


class TrialRegistrationResponse(BaseModel):
    trial_id: uuid.UUID
    status: str
    message: str
    verification_required: bool = True


class TrialVerifyRequest(BaseModel):
    trial_id: uuid.UUID
    verification_token: str


class TrialActivationResponse(BaseModel):
    trial_id: uuid.UUID
    tenant_id: uuid.UUID
    soulkey_id: uuid.UUID
    raw_key: str = Field(description="Trial soulkey. Shown once. Save immediately.")
    proxy_api_key: Optional[str] = Field(
        default=None,
        description="Tiresias proxy API key — shown once. Point agents at proxy.tiresias.network with this key.",
    )
    license_key: Optional[str] = Field(
        default=None,
        description="License JWT for on-prem deployment. Install via TIRESIAS_LICENSE_KEY env var.",
    )
    status: str
    expires_at: datetime


# --- Waitlist schemas ---

class WaitlistJoinRequest(BaseModel):
    contact_name: str
    contact_email: str = Field(pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
    company_name: str
    company_domain: str
    use_case: Optional[str] = None


class WaitlistJoinResponse(BaseModel):
    waitlist_id: uuid.UUID
    status: str
    message: str
    position: Optional[int] = None


# --- Policy sync schemas ---

class PolicySyncResponse(BaseModel):
    status: str
    policies_updated: int
    policy_version: Optional[str] = None
    validation_errors: list[str] = []


class PolicyValidationResponse(BaseModel):
    valid: bool
    errors: list[str] = []
    tenant_slug: str
