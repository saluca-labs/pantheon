"""
SoulAuth SDK response models.
Pydantic models for typed SDK responses.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# --- Health ---

class HealthStatus(BaseModel):
    """Health check response from the SoulAuth service."""
    status: str
    service: str
    version: str


# --- Identity & Registration ---

class AgentRegistration(BaseModel):
    """Response from agent registration (soulkey issuance)."""
    soulkey_id: uuid.UUID
    raw_key: str = Field(description="Raw soulkey. Shown once. Save immediately.")
    persona_id: str
    tenant_id: uuid.UUID
    status: str
    issued_at: datetime
    expires_at: Optional[datetime] = None


class IdentityInfo(BaseModel):
    """Identity resolution response."""
    soulkey_id: uuid.UUID
    tenant_id: uuid.UUID
    persona_id: str
    status: str
    label: Optional[str] = None
    issued_at: datetime
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None


class WhoamiInfo(BaseModel):
    """Agent self-inspection response."""
    persona_id: str
    tenant_id: uuid.UUID
    soulkey_id: uuid.UUID
    status: str
    active_capabilities: int = 0
    policy_summary: Optional[dict] = None


# --- Tokens ---

class TokenResponse(BaseModel):
    """Capability token issued after access evaluation."""
    decision: str
    capability_token: Optional[str] = None
    expires_in: Optional[int] = None
    granted_scopes: Optional[list[str]] = None
    reason: Optional[str] = None
    escalation_available: Optional[bool] = None
    escalation_approver_role: Optional[str] = None
    audit_id: uuid.UUID


class TokenClaims(BaseModel):
    """Decoded capability token claims."""
    issuer: str = Field(alias="iss")
    subject: str = Field(alias="sub")
    tenant_id: str = Field(alias="tid")
    persona_id: str = Field(alias="pid")
    scopes: list[str] = Field(alias="scp")
    session_binding: str = Field(default="", alias="sid")
    token_id: str = Field(alias="jti")
    issued_at: int = Field(alias="iat")
    expires_at: int = Field(alias="exp")

    model_config = {"populate_by_name": True}


# --- Access Evaluation ---

class EvaluationResult(BaseModel):
    """PDP access evaluation result."""
    decision: str
    capability_token: Optional[str] = None
    expires_in: Optional[int] = None
    granted_scopes: Optional[list[str]] = None
    reason: Optional[str] = None
    escalation_available: Optional[bool] = None
    escalation_approver_role: Optional[str] = None
    audit_id: uuid.UUID

    @property
    def allowed(self) -> bool:
        """Whether access was granted."""
        return self.decision.upper() == "GRANT"

    @property
    def denied(self) -> bool:
        """Whether access was denied."""
        return self.decision.upper() == "DENY"


# --- Audit ---

class AuditEvent(BaseModel):
    """A single audit log entry."""
    id: str
    timestamp: Optional[str] = None
    event_type: str
    persona_id: Optional[str] = None
    resource: Optional[str] = None
    action: Optional[str] = None
    scope: Optional[str] = None
    decision: Optional[str] = None
    reason: Optional[str] = None
    context: Optional[dict] = None


class AuditReport(BaseModel):
    """Audit log query result."""
    tenant_id: str
    count: int
    events: list[AuditEvent]


# --- Trial ---

class TrialRegistration(BaseModel):
    """Trial registration response."""
    trial_id: uuid.UUID
    status: str
    message: str
    verification_required: bool = True


class TrialActivation(BaseModel):
    """Trial activation response (after verification)."""
    trial_id: uuid.UUID
    tenant_id: uuid.UUID
    soulkey_id: uuid.UUID
    raw_key: str = Field(description="Trial soulkey. Shown once. Save immediately.")
    status: str
    expires_at: datetime


# --- Tenant ---

class TenantInfo(BaseModel):
    """Tenant details."""
    id: uuid.UUID
    name: str
    slug: str
    tier: str
    status: str
    metadata: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
