"""
Portal Policy Management API.

Provides CRUD endpoints for managing tenant policies from the portal.
Policies are stored in _soulauth_policy_cache and optionally committed
to per-tenant git repos for on-prem sync.

Endpoints:
  GET  /v1/portal/policies              — list policies for tenant
  GET  /v1/portal/policies/{persona_id} — get resolved policy
  PUT  /v1/portal/policies/{persona_id} — update policy
  GET  /v1/portal/policies/sync-status  — git sync health
  POST /v1/portal/policies/sync         — trigger manual sync
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import PolicyCache

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/portal/policies", tags=["Portal — Policy Management"])


# --- Schemas ------------------------------------------------------------------

class PolicySummary(BaseModel):
    persona_id: str
    policy_version: str
    synced_at: Optional[datetime] = None


class PolicyListResponse(BaseModel):
    tenant_id: str
    policies: list[PolicySummary]


class PolicyDetailResponse(BaseModel):
    tenant_id: str
    persona_id: str
    policy_version: str
    resolved_policy: dict
    synced_at: Optional[datetime] = None


class PolicyUpdateRequest(BaseModel):
    """Update a tenant's policy for a given persona.

    Supports granular updates to specific policy sections:
    - cost_limits: daily/weekly/monthly spend caps
    - model_restrictions: allowed/denied model list
    - pii_detection: enable/disable PII scanning
    - volume_limits: request rate caps
    - custom_rules: Sigma-compatible detection rules
    """
    cost_limits: Optional[dict] = Field(
        default=None,
        description="Cost caps: {daily_usd, weekly_usd, monthly_usd, alert_threshold_pct}",
    )
    model_restrictions: Optional[dict] = Field(
        default=None,
        description="Model access: {allowed: [...], denied: [...], default: 'gpt-4o'}",
    )
    pii_detection: Optional[dict] = Field(
        default=None,
        description="PII scanning: {enabled: bool, action: 'block'|'redact'|'alert', patterns: [...]}",
    )
    volume_limits: Optional[dict] = Field(
        default=None,
        description="Rate limits: {rpm: int, daily_requests: int, monthly_requests: int}",
    )
    custom_rules: Optional[list[dict]] = Field(
        default=None,
        description="Sigma-compatible detection rules as YAML-parsed dicts",
    )


class PolicyUpdateResponse(BaseModel):
    tenant_id: str
    persona_id: str
    policy_version: str
    updated_sections: list[str]
    updated_at: datetime


class SyncStatusResponse(BaseModel):
    last_sync_time: Optional[str] = None
    last_sync_status: str = "unknown"
    last_error: Optional[str] = None
    last_commit_hash: Optional[str] = None
    sync_interval_seconds: int = 300


# --- Helpers ------------------------------------------------------------------

def _extract_tenant_id(x_tenant_id: str = Header(..., alias="X-Tenant-ID")) -> str:
    return x_tenant_id


def _bump_version(current: str) -> str:
    """Increment the policy version string (e.g., '1.0' -> '1.1', '2.3' -> '2.4')."""
    try:
        parts = current.rsplit(".", 1)
        if len(parts) == 2:
            major, minor = parts[0], int(parts[1])
            return f"{major}.{minor + 1}"
    except (ValueError, IndexError):
        pass
    return f"{current}.1"


# --- Endpoints ----------------------------------------------------------------

@router.get(
    "",
    response_model=PolicyListResponse,
    summary="List all policies for a tenant",
)
async def list_policies(
    tenant_id: str = Depends(_extract_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PolicyCache.persona_id, PolicyCache.policy_version, PolicyCache.synced_at)
        .where(PolicyCache.tenant_id == tenant_id)
        .order_by(PolicyCache.persona_id)
    )
    rows = result.all()
    return PolicyListResponse(
        tenant_id=tenant_id,
        policies=[
            PolicySummary(persona_id=r[0], policy_version=r[1], synced_at=r[2])
            for r in rows
        ],
    )


@router.get(
    "/sync-status",
    response_model=SyncStatusResponse,
    summary="Git sync health check",
)
async def sync_status():
    """Return the current policy git sync status."""
    try:
        from src.policy.git_sync import get_sync_manager
        mgr = get_sync_manager()
        if mgr is None:
            return SyncStatusResponse(last_sync_status="not_configured")
        return SyncStatusResponse(
            last_sync_time=mgr._last_sync_time.isoformat() if mgr._last_sync_time else None,
            last_sync_status=mgr._last_sync_status,
            last_error=mgr._last_error,
            last_commit_hash=mgr._last_commit_hash,
            sync_interval_seconds=mgr._interval,
        )
    except Exception:
        return SyncStatusResponse(last_sync_status="not_configured")


@router.get(
    "/{persona_id}",
    response_model=PolicyDetailResponse,
    summary="Get resolved policy for a persona",
)
async def get_policy(
    persona_id: str,
    tenant_id: str = Depends(_extract_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PolicyCache).where(
            PolicyCache.tenant_id == tenant_id,
            PolicyCache.persona_id == persona_id,
        )
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail=f"No policy found for persona '{persona_id}'")

    return PolicyDetailResponse(
        tenant_id=tenant_id,
        persona_id=persona_id,
        policy_version=policy.policy_version,
        resolved_policy=policy.resolved_policy,
        synced_at=policy.synced_at,
    )


@router.put(
    "/{persona_id}",
    response_model=PolicyUpdateResponse,
    summary="Update policy sections for a persona",
)
async def update_policy(
    persona_id: str,
    body: PolicyUpdateRequest,
    tenant_id: str = Depends(_extract_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    # Fetch existing policy
    result = await db.execute(
        select(PolicyCache).where(
            PolicyCache.tenant_id == tenant_id,
            PolicyCache.persona_id == persona_id,
        )
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail=f"No policy found for persona '{persona_id}'")

    # Merge updates into resolved_policy
    resolved = dict(policy.resolved_policy)
    updated_sections: list[str] = []

    # Ensure 'portal_overrides' section exists for portal-managed settings
    if "portal_overrides" not in resolved:
        resolved["portal_overrides"] = {}

    overrides = resolved["portal_overrides"]

    if body.cost_limits is not None:
        overrides["cost_limits"] = body.cost_limits
        updated_sections.append("cost_limits")

    if body.model_restrictions is not None:
        overrides["model_restrictions"] = body.model_restrictions
        updated_sections.append("model_restrictions")

    if body.pii_detection is not None:
        overrides["pii_detection"] = body.pii_detection
        updated_sections.append("pii_detection")

    if body.volume_limits is not None:
        overrides["volume_limits"] = body.volume_limits
        updated_sections.append("volume_limits")

    if body.custom_rules is not None:
        overrides["custom_rules"] = body.custom_rules
        updated_sections.append("custom_rules")

    if not updated_sections:
        raise HTTPException(status_code=400, detail="No policy sections provided for update")

    new_version = _bump_version(policy.policy_version)
    now = datetime.now(timezone.utc)

    await db.execute(
        update(PolicyCache)
        .where(
            PolicyCache.tenant_id == tenant_id,
            PolicyCache.persona_id == persona_id,
        )
        .values(
            resolved_policy=resolved,
            policy_version=new_version,
            synced_at=now,
        )
    )
    await db.commit()

    logger.info(
        "portal.policy.updated",
        tenant_id=tenant_id,
        persona_id=persona_id,
        sections=updated_sections,
        version=new_version,
    )

    return PolicyUpdateResponse(
        tenant_id=tenant_id,
        persona_id=persona_id,
        policy_version=new_version,
        updated_sections=updated_sections,
        updated_at=now,
    )
