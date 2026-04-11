"""
Portal Policy Management API.

Provides CRUD endpoints for managing tenant policies from the portal.
Policies are stored in _soulauth_policy_cache and optionally committed
to per-tenant git repos for on-prem sync.

Endpoints:
  GET  /v1/portal/policies                       — list policies for tenant
  GET  /v1/portal/policies/{persona_id}          — get resolved policy
  PUT  /v1/portal/policies/{persona_id}          — update policy
  GET  /v1/portal/policies/{persona_id}/history  — version history
  POST /v1/portal/policies/{persona_id}/rollback — rollback to previous version
  GET  /v1/portal/policies/sync-status           — git sync health
  POST /v1/portal/policies/sync                  — trigger manual sync
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import PolicyCache, PolicyHistory

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


class DeployKeyRequest(BaseModel):
    tenant_slug: str = Field(..., description="Tenant identifier for the deploy key")


class DeployKeyResponse(BaseModel):
    tenant_slug: str
    public_key: str
    message: str = "Add this public key as a deploy key in your git repository settings"


class GitPushResult(BaseModel):
    commit_hash: Optional[str] = None
    pushed: bool = False
    error: Optional[str] = None


class PolicyHistoryEntry(BaseModel):
    id: str
    policy_version: str
    changed_by: str
    change_summary: Optional[str] = None
    created_at: Optional[datetime] = None


class PolicyHistoryResponse(BaseModel):
    tenant_id: str
    persona_id: str
    entries: list[PolicyHistoryEntry]


class PolicyRollbackRequest(BaseModel):
    version_id: str = Field(..., description="The PolicyHistory.id (UUID) to restore")


class PolicyRollbackResponse(BaseModel):
    tenant_id: str
    persona_id: str
    restored_version: str
    new_version: str
    rolled_back_at: datetime


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


def _get_policy_repo_path() -> Optional[Path]:
    """Return the policy repo base path if configured, else None."""
    raw = os.environ.get("SOULAUTH_POLICY_REPO_PATH")
    if not raw:
        return None
    return Path(raw)


def _get_deploy_keys_dir() -> Path:
    """Return the directory for storing deploy keys."""
    raw = os.environ.get("SOULAUTH_DEPLOY_KEYS_DIR", "/var/lib/tiresias/deploy_keys")
    return Path(raw)


def _get_deploy_key_for_tenant(tenant_slug: str) -> Optional[str]:
    """Return the deploy key path for a tenant if it exists."""
    keys_dir = _get_deploy_keys_dir()
    key_path = keys_dir / f"{tenant_slug}_deploy_key"
    if key_path.exists():
        return str(key_path)
    return None


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
            sync_interval_seconds=mgr.sync_interval,
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

    # Snapshot the OLD policy state into history before applying the update
    history_entry = PolicyHistory(
        tenant_id=policy.tenant_id,
        persona_id=persona_id,
        policy_version=policy.policy_version,
        resolved_policy=dict(policy.resolved_policy),
        changed_by="portal",
        change_summary=f"Updated {', '.join(updated_sections)}",
    )
    db.add(history_entry)

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

    # Fire-and-forget git push if a policy repo is configured
    repo_base = _get_policy_repo_path()
    if repo_base is not None:
        deploy_key = _get_deploy_key_for_tenant(tenant_id)

        async def _background_push():
            try:
                from src.policy.git_push import init_tenant_repo, commit_and_push

                repo_path = await init_tenant_repo(tenant_id, repo_base)
                result = await commit_and_push(
                    repo_path=repo_path,
                    tenant_slug=tenant_id,
                    resolved_policy=resolved,
                    updated_sections=updated_sections,
                    deploy_key_path=deploy_key,
                )
                logger.info(
                    "portal.policy.git_push_result",
                    tenant_id=tenant_id,
                    commit_hash=result.get("commit_hash"),
                    pushed=result.get("pushed"),
                    error=result.get("error"),
                )
            except Exception as exc:
                logger.error(
                    "portal.policy.git_push_background_error",
                    tenant_id=tenant_id,
                    error=str(exc),
                )

        asyncio.create_task(_background_push())

    return PolicyUpdateResponse(
        tenant_id=tenant_id,
        persona_id=persona_id,
        policy_version=new_version,
        updated_sections=updated_sections,
        updated_at=now,
    )


@router.get(
    "/{persona_id}/history",
    response_model=PolicyHistoryResponse,
    summary="Get version history for a persona's policy",
)
async def get_policy_history(
    persona_id: str,
    tenant_id: str = Depends(_extract_tenant_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200, description="Max entries to return"),
):
    """Return policy version history ordered by most recent first."""
    result = await db.execute(
        select(PolicyHistory)
        .where(
            PolicyHistory.tenant_id == tenant_id,
            PolicyHistory.persona_id == persona_id,
        )
        .order_by(desc(PolicyHistory.created_at))
        .limit(limit)
    )
    rows = result.scalars().all()

    return PolicyHistoryResponse(
        tenant_id=tenant_id,
        persona_id=persona_id,
        entries=[
            PolicyHistoryEntry(
                id=str(r.id),
                policy_version=r.policy_version,
                changed_by=r.changed_by,
                change_summary=r.change_summary,
                created_at=r.created_at,
            )
            for r in rows
        ],
    )


@router.post(
    "/{persona_id}/rollback",
    response_model=PolicyRollbackResponse,
    summary="Rollback a persona's policy to a previous version",
)
async def rollback_policy(
    persona_id: str,
    body: PolicyRollbackRequest,
    tenant_id: str = Depends(_extract_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    """Restore a policy to a previous version from history."""
    # Look up the history entry to restore
    result = await db.execute(
        select(PolicyHistory).where(
            PolicyHistory.id == body.version_id,
            PolicyHistory.tenant_id == tenant_id,
            PolicyHistory.persona_id == persona_id,
        )
    )
    history_entry = result.scalar_one_or_none()
    if not history_entry:
        raise HTTPException(
            status_code=404,
            detail=f"No history entry found with id '{body.version_id}' for persona '{persona_id}'",
        )

    # Fetch the current policy to snapshot before rollback
    current_result = await db.execute(
        select(PolicyCache).where(
            PolicyCache.tenant_id == tenant_id,
            PolicyCache.persona_id == persona_id,
        )
    )
    current_policy = current_result.scalar_one_or_none()
    if not current_policy:
        raise HTTPException(status_code=404, detail=f"No active policy found for persona '{persona_id}'")

    new_version = _bump_version(current_policy.policy_version)
    now = datetime.now(timezone.utc)

    # Snapshot current state into history before overwriting
    pre_rollback_snapshot = PolicyHistory(
        tenant_id=current_policy.tenant_id,
        persona_id=persona_id,
        policy_version=current_policy.policy_version,
        resolved_policy=dict(current_policy.resolved_policy),
        changed_by="portal_rollback",
        change_summary=f"Pre-rollback snapshot; rolling back to version {history_entry.policy_version}",
    )
    db.add(pre_rollback_snapshot)

    # Write the historical policy back to the cache
    await db.execute(
        update(PolicyCache)
        .where(
            PolicyCache.tenant_id == tenant_id,
            PolicyCache.persona_id == persona_id,
        )
        .values(
            resolved_policy=history_entry.resolved_policy,
            policy_version=new_version,
            synced_at=now,
        )
    )
    await db.commit()

    logger.info(
        "portal.policy.rollback",
        tenant_id=tenant_id,
        persona_id=persona_id,
        restored_from=str(history_entry.id),
        restored_version=history_entry.policy_version,
        new_version=new_version,
    )

    return PolicyRollbackResponse(
        tenant_id=tenant_id,
        persona_id=persona_id,
        restored_version=history_entry.policy_version,
        new_version=new_version,
        rolled_back_at=now,
    )


@router.post(
    "/deploy-keys",
    response_model=DeployKeyResponse,
    summary="Generate a deploy key for tenant git push",
)
async def create_deploy_key(
    body: DeployKeyRequest,
    tenant_id: str = Depends(_extract_tenant_id),
):
    """
    Generate an Ed25519 SSH deploy key pair for a tenant.
    Returns the public key — the customer adds it to their git repo
    as a deploy key with write access so Tiresias can push policy updates.
    """
    repo_base = _get_policy_repo_path()
    if repo_base is None:
        raise HTTPException(
            status_code=501,
            detail="Policy repo push is not configured (SOULAUTH_POLICY_REPO_PATH not set)",
        )

    from src.policy.git_push import generate_deploy_key, init_tenant_repo

    keys_dir = _get_deploy_keys_dir()

    try:
        # Ensure the tenant repo scaffold exists
        await init_tenant_repo(body.tenant_slug, repo_base)

        private_key_path, public_key = await generate_deploy_key(
            tenant_slug=body.tenant_slug,
            keys_dir=keys_dir,
        )
    except Exception as e:
        logger.error(
            "portal.policy.deploy_key_failed",
            tenant=body.tenant_slug,
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=f"Failed to generate deploy key: {e}")

    logger.info(
        "portal.policy.deploy_key_created",
        tenant_id=tenant_id,
        tenant_slug=body.tenant_slug,
    )

    return DeployKeyResponse(
        tenant_slug=body.tenant_slug,
        public_key=public_key,
    )
