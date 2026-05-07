"""Retention policy management endpoints (Task #42).

GET  /v1/admin/retention  -- returns current tenant's retention policies
PUT  /v1/admin/retention  -- updates retention policy for the authenticated tenant

The _retention_policies table is RLS-protected (migration 0033), so queries
automatically filter by the tenant_id set via app.current_tenant_id GUC.
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tiresias.storage.engine import get_engine, set_tenant_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin", tags=["admin"])

# -- Constants ----------------------------------------------------------------

# Valid data types for retention policies
DATA_TYPES = frozenset({
    "audit_logs",
    "dream_cycles",
    "billing_records",
    "detection_results",
    "quarantine_history",
})

# Tier label -> retention tier mapping for display
RETENTION_TIER_DAYS = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "1yr": 365,
    "2yr": 730,
}

# SaaS tier minimums (in days)
SAAS_TIER_MINIMUMS = {
    "community": 7,
    "starter": 7,
    "pro": 30,
    "enterprise": 90,
    "mssp": 90,
    "saas": 90,
    "owner": 7,
}

VALID_RETENTION_TIERS = {"7d", "30d", "90d", "1yr", "2yr", "custom"}

MIN_CUSTOM_DAYS = 7
MAX_CUSTOM_DAYS = 2555  # ~7 years for on-prem tax compliance


# -- Request / Response models ------------------------------------------------

class RetentionPolicyRow(BaseModel):
    tenant_id: str
    deployment_mode: str
    retention_tier: str
    custom_retention_days: int | None = None
    created_at: str
    updated_at: str
    effective_days: int = 0  # computed from tier or custom


class RetentionPolicyResponse(BaseModel):
    policy: RetentionPolicyRow | None = None
    tier_minimums: dict[str, int] = Field(default_factory=lambda: dict(SAAS_TIER_MINIMUMS))
    available_tiers: list[str] = Field(
        default_factory=lambda: ["7d", "30d", "90d", "1yr", "2yr"],
    )


class RetentionPolicyUpdate(BaseModel):
    retention_tier: str
    custom_retention_days: int | None = None
    archive_before_delete: bool = True


# -- Helpers ------------------------------------------------------------------

def _get_proxy_settings():
    from tiresias.proxy.app import get_settings
    return get_settings()


def _resolve_tenant_id(request: Request) -> str:
    cfg = _get_proxy_settings()
    if cfg.mode == "saas" and request is not None:
        tid = getattr(request.state, "tenant_id", None)
        if tid:
            return str(tid)
    return cfg.tenant_id


def _effective_days(tier: str, custom_days: int | None) -> int:
    if tier == "custom" and custom_days is not None:
        return custom_days
    return RETENTION_TIER_DAYS.get(tier, 30)


# -- Endpoints ----------------------------------------------------------------

@router.get("/retention")
async def get_retention_policy(request: Request) -> RetentionPolicyResponse:
    """Return retention policy for the authenticated tenant."""
    cfg = _get_proxy_settings()
    tenant_id = _resolve_tenant_id(request)

    engine = await get_engine(tenant_id, cfg.data_root)
    async with AsyncSession(engine) as session:
        await set_tenant_context(session, tenant_id)

        result = await session.execute(
            text(
                """
                SELECT tenant_id::text, deployment_mode, retention_tier,
                       custom_retention_days,
                       created_at::text, updated_at::text
                FROM _retention_policies
                LIMIT 1
                """
            ),
        )
        row = result.mappings().first()

    if not row:
        return RetentionPolicyResponse(policy=None)

    effective = _effective_days(row["retention_tier"], row["custom_retention_days"])
    policy = RetentionPolicyRow(
        tenant_id=row["tenant_id"],
        deployment_mode=row["deployment_mode"],
        retention_tier=row["retention_tier"],
        custom_retention_days=row["custom_retention_days"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        effective_days=effective,
    )

    return RetentionPolicyResponse(policy=policy)


@router.put("/retention")
async def update_retention_policy(
    request: Request,
    body: RetentionPolicyUpdate,
) -> RetentionPolicyResponse:
    """Update retention policy for the authenticated tenant.

    Validates tier-based minimums for SaaS tenants and custom day ranges
    for on-prem tenants.
    """
    cfg = _get_proxy_settings()
    tenant_id = _resolve_tenant_id(request)

    # Validate retention_tier
    if body.retention_tier not in VALID_RETENTION_TIERS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid retention_tier. Must be one of: {sorted(VALID_RETENTION_TIERS)}",
        )

    engine = await get_engine(tenant_id, cfg.data_root)
    async with AsyncSession(engine) as session:
        await set_tenant_context(session, tenant_id)

        # Fetch current policy to check deployment mode
        result = await session.execute(
            text(
                "SELECT deployment_mode, retention_tier FROM _retention_policies LIMIT 1"
            ),
        )
        current = result.mappings().first()

        if not current:
            raise HTTPException(status_code=404, detail="No retention policy found for this tenant")

        deployment_mode = current["deployment_mode"]

        # SaaS cannot use custom tier
        if deployment_mode == "saas" and body.retention_tier == "custom":
            raise HTTPException(
                status_code=400,
                detail="SaaS tenants cannot use custom retention. Choose a predefined tier.",
            )

        # Validate custom days for on-prem
        if body.retention_tier == "custom":
            if body.custom_retention_days is None:
                raise HTTPException(
                    status_code=400,
                    detail="custom_retention_days is required when retention_tier is 'custom'",
                )
            if body.custom_retention_days < MIN_CUSTOM_DAYS:
                raise HTTPException(
                    status_code=400,
                    detail=f"custom_retention_days must be at least {MIN_CUSTOM_DAYS}",
                )
            if body.custom_retention_days > MAX_CUSTOM_DAYS:
                raise HTTPException(
                    status_code=400,
                    detail=f"custom_retention_days cannot exceed {MAX_CUSTOM_DAYS} (7 years)",
                )

        # For SaaS, validate against tier minimums
        if deployment_mode == "saas":
            proposed_days = _effective_days(body.retention_tier, body.custom_retention_days)
            # Get tenant's license tier from request state
            tenant_tier = getattr(request.state, "tier", None) or "community"
            minimum = SAAS_TIER_MINIMUMS.get(tenant_tier, 7)
            if proposed_days < minimum:
                raise HTTPException(
                    status_code=400,
                    detail=f"Your plan ({tenant_tier}) requires a minimum retention of {minimum} days",
                )

        # Perform update
        custom_days_val = body.custom_retention_days if body.retention_tier == "custom" else None
        await session.execute(
            text(
                """
                UPDATE _retention_policies
                SET retention_tier = :tier,
                    custom_retention_days = :custom_days,
                    updated_at = now()
                WHERE TRUE
                """
            ),
            {"tier": body.retention_tier, "custom_days": custom_days_val},
        )
        await session.commit()

        # Re-fetch updated row
        result = await session.execute(
            text(
                """
                SELECT tenant_id::text, deployment_mode, retention_tier,
                       custom_retention_days,
                       created_at::text, updated_at::text
                FROM _retention_policies
                LIMIT 1
                """
            ),
        )
        row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=500, detail="Failed to read updated policy")

    effective = _effective_days(row["retention_tier"], row["custom_retention_days"])
    policy = RetentionPolicyRow(
        tenant_id=row["tenant_id"],
        deployment_mode=row["deployment_mode"],
        retention_tier=row["retention_tier"],
        custom_retention_days=row["custom_retention_days"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        effective_days=effective,
    )

    return RetentionPolicyResponse(policy=policy)
