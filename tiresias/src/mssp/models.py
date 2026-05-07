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


# ---------------------------------------------------------------------------
# MSSP Aletheia cross-tenant models (ALETH-15)
# ---------------------------------------------------------------------------

class CrossTenantCoTEntry(BaseModel):
    """A single CoT chain entry attributed to a child tenant."""
    id: str
    chain_id: str
    entry_index: int
    request_id: str
    tenant_id: str
    tenant_name: Optional[str] = None
    timestamp: str
    model: str
    provider: str
    agent_id: Optional[str] = None
    cot_hash: str
    cot_token_count: int
    entry_hash: str
    content_stored: bool


class CrossTenantCoTResponse(BaseModel):
    """Paginated cross-tenant CoT chain query result."""
    entries: list[CrossTenantCoTEntry]
    total: int
    tenant_count: int


class PolicyPushRequest(BaseModel):
    """Request body for POST /v1/mssp/aletheia/policies/push."""
    target_tenant_ids: list[str] = Field(
        ..., description="UUIDs of child tenants to push policy to"
    )
    policy_yaml: str = Field(
        ..., min_length=1, description="YAML policy content to push"
    )


class PolicyPushResult(BaseModel):
    """Per-tenant result of a policy push operation."""
    tenant_id: str
    tenant_name: Optional[str] = None
    status: str  # "success" | "error"
    detail: Optional[str] = None


class PolicyPushResponse(BaseModel):
    """Aggregate result of pushing policies to child tenants."""
    results: list[PolicyPushResult]
    success_count: int
    error_count: int
