"""
Pydantic schemas for the MSSP API layer.
These are the contracts between isolation.py, router.py, and API callers.
"""

import uuid
from typing import Optional
from pydantic import BaseModel, Field


class TenantStats(BaseModel):
    """Aggregate stats for a child tenant -- shown in /v1/mssp/tenants listing."""
    agent_count: int = 0
    anomaly_count: int = 0
    quarantine_count: int = 0


class TenantNode(BaseModel):
    """A tenant in the hierarchy tree."""
    id: uuid.UUID
    name: str
    slug: str
    tier: str
    status: str
    parent_tenant_id: Optional[uuid.UUID] = None
    hierarchy_depth: int = 0
    stats: TenantStats = Field(default_factory=TenantStats)


class TenantCreateRequest(BaseModel):
    """Request body for POST /v1/mssp/tenants."""
    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=63, pattern=r"^[a-z0-9-]+$")
    tier: str = Field(default="enterprise")
    feature_overrides: dict = Field(
        default_factory=dict,
        description="Optional feature flag overrides inherited from parent.",
    )
    metadata: dict = Field(default_factory=dict)


class TenantCreateResponse(BaseModel):
    """Response for POST /v1/mssp/tenants."""
    tenant_id: uuid.UUID
    name: str
    slug: str
    tier: str
    parent_tenant_id: uuid.UUID
    hierarchy_depth: int
    admin_soulkey: str = Field(
        description="Plaintext admin soulkey for the new tenant. Store it -- not shown again."
    )


class CrossTenantMatchSummary(BaseModel):
    """A Sigma match attributed to a specific child tenant."""
    tenant_id: uuid.UUID
    tenant_slug: str
    rule_id: str
    rule_title: str
    level: str
    timestamp: str
    matched_fields: dict = {}
    response_playbook: Optional[str] = None


class CrossTenantQuarantineRecord(BaseModel):
    """A quarantine record attributed to a specific child tenant."""
    tenant_id: uuid.UUID
    tenant_slug: str
    id: str
    soulkey_id: str
    persona_id: str
    triggered_by_type: str
    actions_taken: list[str]
    status: str
    quarantined_at: str
    released_at: Optional[str] = None
    reason: str
