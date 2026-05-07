"""
Admin API router — key lifecycle, tenant management, policy management, audit.
Implements SPEC.md section 9. RBAC-protected via Track B5.
"""

import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from src.database.connection import get_db
from src.database.models import SoulTenant, Soulkey
from src.auth.soulkey import (
    issue_soulkey,
    suspend_soulkey,
    reinstate_soulkey,
    revoke_soulkey,
    list_soulkeys,
)
from src.auth.schemas import (
    IssueSoulkeyRequest,
    IssueSoulkeyResponse,
    SoulkeyDetail,
    SuspendKeyRequest,
    RevokeKeyRequest,
    CreateTenantRequest,
    TenantDetail,
    UpdateTenantRequest,
    PolicySyncResponse,
    PolicyValidationResponse,
)
from src.audit.logger import log_auth_event, query_audit_log
from src.policy.loader import load_tenant_policies, sync_policies_to_cache
from src.middleware.tenant import (
    create_tenant,
    resolve_tenant,
    resolve_tenant_by_slug,
    list_tenants,
    update_tenant_status,
)
from src.auth.rbac import require_permission
from config.settings import get_settings
from src.tenant.offboard import offboard_tenant
from src.license.issuer import issue_license, revoke_license, get_licenses_for_tenant
from src.license.schemas import (
    IssueLicenseRequest, IssueLicenseResponse,
    LicenseDetail, RevokeLicenseRequest, RevokeLicenseResponse,
    KEKRotateRequest, KEKRotateResponse,
)

router = APIRouter(prefix="/v1/soulauth/admin", tags=["Admin"])


def _get_caller_tenant_id(request) -> Optional[uuid.UUID]:
    """
    Extract the caller's tenant_id from the authenticated soulkey.
    All admin operations are scoped to the caller's tenant to prevent
    cross-tenant data access (IDOR).

    Returns None in testing mode to disable tenant scoping.
    """
    import os
    _is_testing = os.environ.get("SOULAUTH_TESTING", "").lower() == "true"
    _env = os.environ.get("ENVIRONMENT", "production").lower()
    if _is_testing and _env != "production":
        return None

    soulkey = getattr(request.state, "rbac_soulkey", None)
    if not soulkey:
        raise HTTPException(status_code=401, detail="No authenticated soulkey")
    return soulkey.tenant_id


# --- Tenant Management (SPEC.md 8) ---

@router.post(
    "/tenants",
    response_model=TenantDetail,
    summary="Create a new tenant",
    dependencies=[Depends(require_permission("tenants:create"))],
    responses={
        200: {"description": "Tenant created successfully"},
        409: {"description": "Tenant slug already exists", "content": {"application/json": {"example": {"detail": "Tenant slug already exists"}}}},
    },
)
async def admin_create_tenant(
    request: CreateTenantRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new tenant organization.

    Each tenant is an isolated namespace with its own SoulKeys, policies,
    and audit trail. The slug must be unique and is used in policy file paths.
    Requires `tenants:create` permission.

    If parent_tenant_id is provided, the new tenant is created as a child
    in the hierarchy. Tier creation rules and depth limits are enforced.
    """
    # Check for slug uniqueness
    existing = await resolve_tenant_by_slug(db, request.slug)
    if existing:
        raise HTTPException(status_code=409, detail="Tenant slug already exists")

    parent_tenant_id = request.parent_tenant_id
    hierarchy_depth = 0

    if parent_tenant_id:
        # 1. Validate parent exists
        parent = await resolve_tenant(db, parent_tenant_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent tenant not found")

        # 2. Validate caller owns the parent (or is within the parent's hierarchy)
        caller_tenant_id = _get_caller_tenant_id(http_request)
        if caller_tenant_id and caller_tenant_id != parent_tenant_id:
            from src.mssp.isolation import assert_in_hierarchy
            await assert_in_hierarchy(db, caller_tenant_id, parent_tenant_id)

        # 3. Tier creation rules
        from src.tier import TIER_ALLOWED_CHILDREN, TIER_MAX_CHILDREN, can_create_child
        if not can_create_child(parent.tier, request.tier):
            allowed = TIER_ALLOWED_CHILDREN.get(parent.tier, [])
            raise HTTPException(
                status_code=422,
                detail=f"Tier '{parent.tier}' cannot create child tier '{request.tier}'. "
                       f"Allowed: {allowed}",
            )

        # 4. Depth validation
        from src.mssp.isolation import validate_depth_for_new_child
        try:
            hierarchy_depth = await validate_depth_for_new_child(db, parent_tenant_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        # 5. Max children check
        max_children = TIER_MAX_CHILDREN.get(parent.tier, 0)
        if max_children > 0:
            from src.mssp.isolation import get_child_tenant_ids
            existing_children = await get_child_tenant_ids(db, parent_tenant_id, include_root=False)
            if len(existing_children) >= max_children:
                raise HTTPException(
                    status_code=422,
                    detail=f"Parent tenant has reached max children ({max_children})",
                )

    # Build metadata with provenance
    metadata = request.metadata or {}
    if parent_tenant_id:
        metadata["provisioned_by"] = str(parent_tenant_id)

    tenant = await create_tenant(
        db=db,
        name=request.name,
        slug=request.slug,
        tier=request.tier,
        metadata=metadata,
        parent_tenant_id=parent_tenant_id,
        hierarchy_depth=hierarchy_depth,
    )

    # Eagerly provision DEK for envelope encryption
    from src.middleware.tenant import provision_tenant_encryption
    await provision_tenant_encryption(db, str(tenant.id), tier=request.tier if hasattr(request, 'tier') else "community")

    return TenantDetail(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        tier=tenant.tier,
        status=tenant.status,
        parent_tenant_id=tenant.parent_tenant_id,
        hierarchy_depth=tenant.hierarchy_depth,
        metadata=tenant.metadata_,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


@router.get(
    "/tenants",
    response_model=list[TenantDetail],
    summary="List all tenants",
    dependencies=[Depends(require_permission("tenants:read"))],
)
async def admin_list_tenants(
    status: Optional[str] = Query(None, description="Filter by status: active, suspended"),
    tier: Optional[str] = Query(None, description="Filter by tier: free, starter, pro, enterprise"),
    db: AsyncSession = Depends(get_db),
):
    """List all tenants with optional status and tier filters. Requires `tenants:read` permission."""
    tenants = await list_tenants(db, status=status, tier=tier)
    return [
        TenantDetail(
            id=t.id,
            name=t.name,
            slug=t.slug,
            tier=t.tier,
            status=t.status,
            parent_tenant_id=t.parent_tenant_id,
            hierarchy_depth=t.hierarchy_depth,
            metadata=t.metadata_,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in tenants
    ]


@router.get(
    "/tenants/{tenant_id}",
    response_model=TenantDetail,
    dependencies=[Depends(require_permission("tenants:read"))],
)
async def admin_get_tenant(
    tenant_id: uuid.UUID,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Get detailed information about a specific tenant. Requires `tenants:read` permission."""
    caller_tenant_id = _get_caller_tenant_id(request)
    if caller_tenant_id is not None and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=403, detail="Cannot access another tenant's data")
    tenant = await resolve_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return TenantDetail(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        tier=tenant.tier,
        status=tenant.status,
        parent_tenant_id=tenant.parent_tenant_id,
        hierarchy_depth=tenant.hierarchy_depth,
        metadata=tenant.metadata_,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


@router.patch(
    "/tenants/{tenant_id}",
    response_model=TenantDetail,
    dependencies=[Depends(require_permission("tenants:update"))],
)
async def admin_update_tenant(
    tenant_id: uuid.UUID,
    request: UpdateTenantRequest,
    http_request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Update tenant properties."""
    caller_tenant_id = _get_caller_tenant_id(http_request)
    if caller_tenant_id is not None and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=403, detail="Cannot modify another tenant's data")
    tenant = await resolve_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    update_values = {}
    if request.name is not None:
        update_values["name"] = request.name
    if request.tier is not None:
        update_values["tier"] = request.tier
    if request.status is not None:
        update_values["status"] = request.status
    if request.metadata is not None:
        update_values["metadata_"] = request.metadata

    if update_values:
        await db.execute(
            update(SoulTenant).where(SoulTenant.id == tenant_id).values(**update_values)
        )
        # Refresh
        result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
        tenant = result.scalar_one()

    return TenantDetail(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        tier=tenant.tier,
        status=tenant.status,
        parent_tenant_id=tenant.parent_tenant_id,
        hierarchy_depth=tenant.hierarchy_depth,
        metadata=tenant.metadata_,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


@router.post(
    "/tenants/{tenant_id}/suspend",
    dependencies=[Depends(require_permission("tenants:update"))],
)
async def admin_suspend_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Suspend a tenant (disables all soulkeys)."""
    tenant = await update_tenant_status(db, tenant_id, "suspended")
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return {"status": "suspended", "tenant_id": str(tenant_id)}


@router.post(
    "/tenants/{tenant_id}/activate",
    dependencies=[Depends(require_permission("tenants:update"))],
)
async def admin_activate_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Activate or reactivate a tenant."""
    tenant = await update_tenant_status(db, tenant_id, "active")
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return {"status": "active", "tenant_id": str(tenant_id)}


# --- Key Management (SPEC.md 9.1) ---

@router.post(
    "/keys",
    response_model=IssueSoulkeyResponse,
    summary="Issue a new SoulKey",
    dependencies=[Depends(require_permission("keys:create"))],
    responses={
        200: {"description": "SoulKey issued. The raw_key is shown once and never stored."},
        404: {"description": "Tenant not found"},
    },
)
async def admin_issue_key(
    request: IssueSoulkeyRequest,
    http_request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Issue a new SoulKey for a persona within a tenant.

    The response includes the raw key which is shown exactly once.
    The key is hashed with SHA-512 before storage and cannot be
    recovered. Save the raw key immediately.

    Requires `keys:create` permission.
    """
    caller_tenant_id = _get_caller_tenant_id(http_request)
    if caller_tenant_id is not None and request.tenant_id != caller_tenant_id:
        raise HTTPException(status_code=403, detail="Cannot issue keys for another tenant")
    # Look up tenant for short slug
    tenant = await db.execute(
        select(SoulTenant).where(SoulTenant.id == request.tenant_id)
    )
    tenant = tenant.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    raw_key, soulkey = await issue_soulkey(
        db=db,
        tenant_id=request.tenant_id,
        persona_id=request.persona_id,
        tenant_short=tenant.slug[:3] if tenant.slug else "unk",
        label=request.label,
        expires_at=request.expires_at,
        metadata=request.metadata,
    )

    # Audit log
    await log_auth_event(
        db,
        tenant_id=request.tenant_id,
        event_type="key_issued",
        soulkey_id=soulkey.id,
        persona_id=request.persona_id,
        context={"label": request.label},
    )

    return IssueSoulkeyResponse(
        soulkey_id=soulkey.id,
        raw_key=raw_key,
        persona_id=soulkey.persona_id,
        tenant_id=soulkey.tenant_id,
        status=soulkey.status,
        issued_at=soulkey.issued_at,
        expires_at=soulkey.expires_at,
    )


@router.get(
    "/keys",
    response_model=list[SoulkeyDetail],
    dependencies=[Depends(require_permission("keys:read"))],
)
async def admin_list_keys(
    request: Request,
    tenant_id: uuid.UUID = Query(..., description="Tenant UUID to list keys for"),
    status: Optional[str] = Query(None, description="Filter by status: active, suspended, revoked"),
    persona_id: Optional[str] = Query(None, description="Filter by persona ID"),
    db: AsyncSession = Depends(get_db),
):
    """List all SoulKeys for a tenant with optional status and persona filters. Requires `keys:read` permission."""
    caller_tenant_id = _get_caller_tenant_id(request)
    if caller_tenant_id is not None and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=403, detail="Cannot access keys for another tenant")
    keys = await list_soulkeys(db, tenant_id, status, persona_id)
    return [
        SoulkeyDetail(
            id=k.id,
            tenant_id=k.tenant_id,
            persona_id=k.persona_id,
            label=k.label,
            status=k.status,
            issued_at=k.issued_at,
            expires_at=k.expires_at,
            last_used_at=k.last_used_at,
            suspended_at=k.suspended_at,
            suspended_by=k.suspended_by,
            revoked_at=k.revoked_at,
            revoked_by=k.revoked_by,
            revocation_reason=k.revocation_reason,
            metadata=k.metadata_,
        )
        for k in keys
    ]


@router.get(
    "/keys/{key_id}",
    response_model=SoulkeyDetail,
    dependencies=[Depends(require_permission("keys:read"))],
)
async def admin_get_key(
    key_id: uuid.UUID,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Get detailed information about a specific SoulKey including lifecycle timestamps. Requires `keys:read` permission."""
    caller_tenant_id = _get_caller_tenant_id(request)
    result = await db.execute(
        select(Soulkey).where(Soulkey.id == key_id, *([Soulkey.tenant_id == caller_tenant_id] if caller_tenant_id is not None else []))
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Soulkey not found")

    return SoulkeyDetail(
        id=key.id,
        tenant_id=key.tenant_id,
        persona_id=key.persona_id,
        label=key.label,
        status=key.status,
        issued_at=key.issued_at,
        expires_at=key.expires_at,
        last_used_at=key.last_used_at,
        suspended_at=key.suspended_at,
        suspended_by=key.suspended_by,
        revoked_at=key.revoked_at,
        revoked_by=key.revoked_by,
        revocation_reason=key.revocation_reason,
        metadata=key.metadata_,
    )


@router.post(
    "/keys/{key_id}/suspend",
    response_model=SoulkeyDetail,
    dependencies=[Depends(require_permission("keys:update"))],
)
async def admin_suspend_key(
    key_id: uuid.UUID,
    request: SuspendKeyRequest,
    http_request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Suspend an active SoulKey (reversible). The agent will receive DENY decisions until reinstated. Requires `keys:update` permission."""
    caller_tenant_id = _get_caller_tenant_id(http_request)
    # Verify key belongs to caller's tenant before suspending
    result = await db.execute(
        select(Soulkey).where(Soulkey.id == key_id, *([Soulkey.tenant_id == caller_tenant_id] if caller_tenant_id is not None else []))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Active soulkey not found")
    soulkey = await suspend_soulkey(db, key_id, request.suspended_by, request.reason)
    if not soulkey:
        raise HTTPException(status_code=404, detail="Active soulkey not found")

    await log_auth_event(
        db,
        tenant_id=soulkey.tenant_id,
        event_type="key_suspended",
        soulkey_id=soulkey.id,
        persona_id=soulkey.persona_id,
        reason=request.reason,
        context={"suspended_by": request.suspended_by},
    )

    return SoulkeyDetail(
        id=soulkey.id,
        tenant_id=soulkey.tenant_id,
        persona_id=soulkey.persona_id,
        label=soulkey.label,
        status=soulkey.status,
        issued_at=soulkey.issued_at,
        expires_at=soulkey.expires_at,
        last_used_at=soulkey.last_used_at,
        suspended_at=soulkey.suspended_at,
        suspended_by=soulkey.suspended_by,
        revoked_at=soulkey.revoked_at,
        revoked_by=soulkey.revoked_by,
        revocation_reason=soulkey.revocation_reason,
        metadata=soulkey.metadata_,
    )


@router.post(
    "/keys/{key_id}/reinstate",
    response_model=SoulkeyDetail,
    dependencies=[Depends(require_permission("keys:update"))],
)
async def admin_reinstate_key(
    key_id: uuid.UUID,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Reinstate a previously suspended SoulKey, restoring active status. Requires `keys:update` permission."""
    caller_tenant_id = _get_caller_tenant_id(request)
    result = await db.execute(
        select(Soulkey).where(Soulkey.id == key_id, *([Soulkey.tenant_id == caller_tenant_id] if caller_tenant_id is not None else []))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Suspended soulkey not found")
    soulkey = await reinstate_soulkey(db, key_id)
    if not soulkey:
        raise HTTPException(status_code=404, detail="Suspended soulkey not found")

    await log_auth_event(
        db,
        tenant_id=soulkey.tenant_id,
        event_type="key_reinstated",
        soulkey_id=soulkey.id,
        persona_id=soulkey.persona_id,
    )

    return SoulkeyDetail(
        id=soulkey.id,
        tenant_id=soulkey.tenant_id,
        persona_id=soulkey.persona_id,
        label=soulkey.label,
        status=soulkey.status,
        issued_at=soulkey.issued_at,
        expires_at=soulkey.expires_at,
        last_used_at=soulkey.last_used_at,
        suspended_at=soulkey.suspended_at,
        suspended_by=soulkey.suspended_by,
        revoked_at=soulkey.revoked_at,
        revoked_by=soulkey.revoked_by,
        revocation_reason=soulkey.revocation_reason,
        metadata=soulkey.metadata_,
    )


@router.post(
    "/keys/{key_id}/revoke",
    response_model=SoulkeyDetail,
    dependencies=[Depends(require_permission("keys:delete"))],
)
async def admin_revoke_key(
    key_id: uuid.UUID,
    request: RevokeKeyRequest,
    http_request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Permanently revoke a SoulKey. This is a terminal operation - the key cannot be reinstated. Use suspend for reversible deactivation. Requires `keys:delete` permission."""
    caller_tenant_id = _get_caller_tenant_id(http_request)
    result = await db.execute(
        select(Soulkey).where(Soulkey.id == key_id, *([Soulkey.tenant_id == caller_tenant_id] if caller_tenant_id is not None else []))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Soulkey not found or already revoked")
    soulkey = await revoke_soulkey(db, key_id, request.revoked_by, request.reason)
    if not soulkey:
        raise HTTPException(status_code=404, detail="Soulkey not found or already revoked")

    await log_auth_event(
        db,
        tenant_id=soulkey.tenant_id,
        event_type="key_revoked",
        soulkey_id=soulkey.id,
        persona_id=soulkey.persona_id,
        reason=request.reason,
        context={"revoked_by": request.revoked_by},
    )

    return SoulkeyDetail(
        id=soulkey.id,
        tenant_id=soulkey.tenant_id,
        persona_id=soulkey.persona_id,
        label=soulkey.label,
        status=soulkey.status,
        issued_at=soulkey.issued_at,
        expires_at=soulkey.expires_at,
        last_used_at=soulkey.last_used_at,
        suspended_at=soulkey.suspended_at,
        suspended_by=soulkey.suspended_by,
        revoked_at=soulkey.revoked_at,
        revoked_by=soulkey.revoked_by,
        revocation_reason=soulkey.revocation_reason,
        metadata=soulkey.metadata_,
    )


@router.post(
    "/keys/{key_id}/rotate",
    response_model=IssueSoulkeyResponse,
    dependencies=[Depends(require_permission("keys:update"))],
)
async def admin_rotate_key(
    key_id: uuid.UUID,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Rotate a SoulKey - issues a new key for the same persona and revokes the old one atomically. The new raw key is shown once. Requires `keys:update` permission."""
    caller_tenant_id = _get_caller_tenant_id(request)
    # Get old key - scoped to caller's tenant
    result = await db.execute(
        select(Soulkey).where(Soulkey.id == key_id, *([Soulkey.tenant_id == caller_tenant_id] if caller_tenant_id is not None else []))
    )
    old_key = result.scalar_one_or_none()
    if not old_key:
        raise HTTPException(status_code=404, detail="Soulkey not found")

    # Get tenant slug
    tenant = await db.execute(
        select(SoulTenant).where(SoulTenant.id == old_key.tenant_id)
    )
    tenant = tenant.scalar_one_or_none()
    tenant_short = tenant.slug[:3] if tenant else "unk"

    # Issue new key
    raw_key, new_key = await issue_soulkey(
        db=db,
        tenant_id=old_key.tenant_id,
        persona_id=old_key.persona_id,
        tenant_short=tenant_short,
        label=f"Rotated from {old_key.label or old_key.id}",
        metadata=old_key.metadata_,
    )

    # Revoke old key
    await revoke_soulkey(db, key_id, "system", "Key rotation")

    await log_auth_event(
        db,
        tenant_id=old_key.tenant_id,
        event_type="key_issued",
        soulkey_id=new_key.id,
        persona_id=new_key.persona_id,
        context={"rotated_from": str(key_id)},
    )

    return IssueSoulkeyResponse(
        soulkey_id=new_key.id,
        raw_key=raw_key,
        persona_id=new_key.persona_id,
        tenant_id=new_key.tenant_id,
        status=new_key.status,
        issued_at=new_key.issued_at,
        expires_at=new_key.expires_at,
    )


# --- Policy Management (SPEC.md 9.2) ---

@router.post(
    "/policy/sync",
    response_model=PolicySyncResponse,
    dependencies=[Depends(require_permission("policy:sync"))],
)
async def admin_sync_policy(
    request: Request,
    tenant_id: uuid.UUID = Query(..., description="Tenant UUID to sync policies for"),
    db: AsyncSession = Depends(get_db),
):
    """Trigger policy sync from git repository to database cache. Validates YAML before applying. Requires `policy:sync` permission."""
    caller_tenant_id = _get_caller_tenant_id(request)
    if caller_tenant_id is not None and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=403, detail="Cannot sync policies for another tenant")
    settings = get_settings()
    if not settings.policy_repo_path:
        raise HTTPException(
            status_code=400,
            detail="Policy repository path not configured",
        )

    # Get tenant slug
    tenant = await db.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )
    tenant = tenant.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Validate policies first
    from src.policy.git_sync import validate_policy_yaml, get_repo_version

    errors = validate_policy_yaml(settings.policy_repo_path, tenant.slug)
    if errors:
        return PolicySyncResponse(
            status="validation_failed",
            policies_updated=0,
            validation_errors=errors,
        )

    policies = load_tenant_policies(settings.policy_repo_path, tenant.slug)
    count = await sync_policies_to_cache(db, tenant_id, policies)

    # Get version info
    version = get_repo_version(settings.policy_repo_path)
    version_str = version.commit_hash[:8] if version else "local"

    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="policy_synced",
        context={
            "count": count,
            "tenant_slug": tenant.slug,
            "policy_version": version_str,
        },
    )

    return PolicySyncResponse(
        status="synced",
        policies_updated=count,
        policy_version=version_str,
    )


@router.post(
    "/policy/validate",
    response_model=PolicyValidationResponse,
    dependencies=[Depends(require_permission("policy:read"))],
)
async def admin_validate_policy(
    request: Request,
    tenant_id: uuid.UUID = Query(..., description="Tenant UUID to validate policies for"),
    db: AsyncSession = Depends(get_db),
):
    """Validate policy YAML files for a tenant without applying changes. Use before sync to catch errors. Requires `policy:read` permission."""
    caller_tenant_id = _get_caller_tenant_id(request)
    if caller_tenant_id is not None and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=403, detail="Cannot validate policies for another tenant")
    settings = get_settings()
    if not settings.policy_repo_path:
        raise HTTPException(
            status_code=400, detail="Policy repository path not configured"
        )

    tenant = await db.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )
    tenant = tenant.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    from src.policy.git_sync import validate_policy_yaml

    errors = validate_policy_yaml(settings.policy_repo_path, tenant.slug)

    return PolicyValidationResponse(
        valid=len(errors) == 0,
        errors=errors,
        tenant_slug=tenant.slug,
    )


@router.get(
    "/policy/current",
    dependencies=[Depends(require_permission("policy:read"))],
)
async def admin_get_policy(
    request: Request,
    tenant_id: uuid.UUID = Query(..., description="Tenant UUID"),
    persona_id: str = Query(..., description="Persona ID to look up policy for"),
    db: AsyncSession = Depends(get_db),
):
    """Get the resolved (cached) policy for a specific persona, including JIT settings, resource permissions, and escalation config. Requires `policy:read` permission."""
    caller_tenant_id = _get_caller_tenant_id(request)
    if caller_tenant_id is not None and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=403, detail="Cannot access policies for another tenant")
    from src.policy.loader import load_cached_policy

    policy = await load_cached_policy(db, tenant_id, persona_id)
    if not policy:
        raise HTTPException(status_code=404, detail="No cached policy found")

    return policy.to_dict()


# --- Audit Management (SPEC.md 7.3) ---

@router.get(
    "/audit/report",
    dependencies=[Depends(require_permission("audit:read"))],
)
async def admin_audit_report(
    request: Request,
    tenant_id: uuid.UUID = Query(..., description="Tenant UUID to query audit events for"),
    event_type: Optional[str] = Query(None, description="Filter by event type: key_issued, key_suspended, key_revoked, auth_grant, auth_deny, policy_synced, escalation_approved"),
    persona_id: Optional[str] = Query(None, description="Filter by persona ID"),
    start_date: Optional[datetime] = Query(None, description="Start of date range (ISO 8601)"),
    end_date: Optional[datetime] = Query(None, description="End of date range (ISO 8601)"),
    limit: int = Query(100, le=1000, description="Max events to return (1-1000)"),
    offset: int = Query(0, description="Pagination offset"),
    db: AsyncSession = Depends(get_db),
):
    # Tenant scoping - prevent cross-tenant audit access
    caller_tenant_id = _get_caller_tenant_id(request)
    if caller_tenant_id is not None and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=403, detail="Cannot access another tenant's audit log")
    """
    Query the immutable audit log for compliance reporting.

    Returns timestamped events for all authentication, authorization,
    key lifecycle, and policy operations within a tenant. Supports
    filtering by event type, persona, and date range.

    Requires `audit:read` permission.
    """
    events = await query_audit_log(
        db,
        tenant_id=tenant_id,
        event_type=event_type,
        persona_id=persona_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )

    return {
        "tenant_id": str(tenant_id),
        "count": len(events),
        "events": [
            {
                "id": str(e.id),
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                "event_type": e.event_type,
                "persona_id": e.persona_id,
                "resource": e.resource,
                "action": e.action,
                "scope": e.scope,
                "decision": e.decision,
                "reason": e.reason,
                "context": e.context,
            }
            for e in events
        ],
    }


# --- License Management (BILL-LIC) ---

@router.post(
    "/licenses/issue",
    response_model=IssueLicenseResponse,
    summary="Issue a signed license JWT (BILL-LIC-01)",
    dependencies=[Depends(require_permission("licenses:create"))],
)
async def admin_issue_license(
    request: Request,
    body: IssueLicenseRequest,
    db: AsyncSession = Depends(get_db),
) -> IssueLicenseResponse:
    """
    Issue a new signed license JWT and persist to _soul_licenses.
    The JWT is returned once — store it securely.
    """
    caller_tenant_id = _get_caller_tenant_id(request)
    soulkey = getattr(request.state, "rbac_soulkey", None)
    issued_by = f"soulkey:{soulkey.id}" if soulkey else "admin"

    try:
        result = await issue_license(
            db,
            tier=body.tier,
            tenant_id=body.tenant_id,
            features=body.features,
            is_nfr=body.is_nfr,
            partner_id=body.partner_id,
            validity_days=body.validity_days,
            issued_by=issued_by,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return IssueLicenseResponse(**result)


@router.get(
    "/licenses/{tenant_id}",
    response_model=list[LicenseDetail],
    summary="List licenses for a tenant (BILL-LIC-02)",
    dependencies=[Depends(require_permission("licenses:read"))],
)
async def admin_list_licenses(
    tenant_id: uuid.UUID,
    include_revoked: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> list[LicenseDetail]:
    """Query all licenses for a given tenant."""
    licenses = await get_licenses_for_tenant(db, tenant_id, include_revoked=include_revoked)
    return [LicenseDetail(**lic) for lic in licenses]


@router.post(
    "/licenses/{license_id}/revoke",
    response_model=RevokeLicenseResponse,
    summary="Revoke a license (BILL-LIC-03)",
    dependencies=[Depends(require_permission("licenses:revoke"))],
)
async def admin_revoke_license(
    license_id: uuid.UUID,
    request: Request,
    body: RevokeLicenseRequest = None,
    db: AsyncSession = Depends(get_db),
) -> RevokeLicenseResponse:
    """Revoke a license. This is permanent — the JWT will no longer validate."""
    soulkey = getattr(request.state, "rbac_soulkey", None)
    revoked_by = f"soulkey:{soulkey.id}" if soulkey else "admin"

    try:
        result = await revoke_license(db, license_id, revoked_by=revoked_by)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return RevokeLicenseResponse(**result)


@router.post(
    "/tenants/{tenant_id}/kek/rotate",
    response_model=KEKRotateResponse,
    summary="Rotate customer KEK for BYOK envelope encryption",
    dependencies=[Depends(require_permission("encryption:manage"))],
)
async def admin_rotate_kek(
    tenant_id: uuid.UUID,
    body: KEKRotateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> KEKRotateResponse:
    """
    Customer-held KEK rotation ceremony.

    The customer provides a new 32-byte KEK (hex or base64). The system:
    1. Unwraps the existing DEK with the current KEK
    2. Re-wraps the DEK with the new customer KEK
    3. Updates tiresias_licenses.wrapped_dek and kek_provider
    4. Audit-logs the rotation event

    The DEK itself does NOT change — existing encrypted data remains readable.
    Only the wrapping key changes.
    """
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm must be true to proceed with KEK rotation")

    from src.tiresias.encryption.providers import resolve_kek_provider
    from src.tiresias.encryption.providers.local import LocalKEKProvider
    from src.tiresias.encryption.envelope import EnvelopeEncryption
    from src.tiresias.config import TiresiasSettings
    from datetime import datetime, timezone

    t_settings = TiresiasSettings()

    # Resolve current KEK provider
    try:
        old_provider = resolve_kek_provider(t_settings)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to resolve current KEK provider: {exc}")

    # Create new provider from customer-provided KEK
    try:
        new_provider = LocalKEKProvider.from_explicit_value(body.new_kek)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid KEK value: {exc}")

    # Perform rotation
    envelope = EnvelopeEncryption(old_provider)
    try:
        await envelope.rotate_dek(
            tenant_id=str(tenant_id),
            old_provider=old_provider,
            new_provider=new_provider,
            session=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    now = datetime.now(timezone.utc)

    # Audit log the rotation event
    try:
        from src.audit.logger import log_auth_event
        soulkey = getattr(request.state, "rbac_soulkey", None)
        await log_auth_event(
            tenant_id=str(tenant_id),
            event_type="kek_rotated",
            soulkey_id=str(soulkey.id) if soulkey else None,
            persona_id="admin",
            resource="encryption",
            action="kek_rotate",
            scope="tenant",
            decision="allow",
            reason="Customer KEK rotation ceremony",
            context={
                "old_provider": old_provider.provider_name,
                "new_provider": new_provider.provider_name,
            },
        )
    except Exception:
        pass  # Audit failure is non-fatal

    return KEKRotateResponse(
        tenant_id=str(tenant_id),
        old_provider=old_provider.provider_name,
        new_provider=new_provider.provider_name,
        status="rotated",
        rotated_at=now.isoformat(),
    )


@router.post(
    "/keys/proxy/rotate",
    summary="Rotate a tenant's Tiresias proxy API key",
    dependencies=[Depends(require_permission("keys:create"))],
    responses={
        200: {"description": "New proxy key issued. The old key is immediately invalidated."},
        404: {"description": "No proxy key found for tenant"},
    },
)
async def admin_rotate_proxy_key(
    request: Request,
    tenant_id: uuid.UUID = Query(..., description="Tenant UUID whose proxy key to rotate"),
    db: AsyncSession = Depends(get_db),
):
    """
    Rotate a tenant's Tiresias proxy API key.

    Generates a new key and immediately invalidates the old one (hash overwritten).
    The new raw key is returned exactly once — save it immediately.

    Use this when a customer loses their proxy key or suspects compromise.
    Requires `keys:create` permission.
    """
    caller_tenant_id = _get_caller_tenant_id(request)
    if caller_tenant_id is not None and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=403, detail="Cannot rotate keys for another tenant")

    # Look up tenant for slug
    result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    from src.saas.proxy_keys import rotate_proxy_key
    try:
        new_raw_key = await rotate_proxy_key(
            db=db,
            tenant_id=str(tenant_id),
            tenant_slug=tenant.slug,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Audit log
    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="admin.proxy_key.rotated",
        soulkey_id=getattr(getattr(request.state, "rbac_soulkey", None), "id", None),
        persona_id=getattr(getattr(request.state, "rbac_soulkey", None), "persona_id", None),
        resource="proxy_key",
        action="rotate",
        scope="admin",
        decision="allow",
        reason="Proxy API key rotated via admin endpoint",
    )

    return {
        "tenant_id": str(tenant_id),
        "proxy_api_key": new_raw_key,
        "status": "rotated",
        "message": "New proxy key issued. The old key is immediately invalid. Save this key — it will not be shown again.",
    }


@router.post(
    "/tenants/{tenant_id}/offboard",
    summary="Offboard tenant — revoke keys, destroy DEK, scrub data",
    dependencies=[Depends(require_permission("tenants:delete"))],
)
async def admin_offboard_tenant(
    tenant_id: uuid.UUID,
    request: Request,
    purge_dek: bool = Query(True, description="Destroy wrapped DEK (crypto-shred)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Full tenant offboarding cascade:
    1. Revoke all soulkeys
    2. Destroy wrapped DEK (crypto-shred)
    3. NULL all encrypted audit fields
    4. Set tenant status to 'deactivated'
    5. Audit-log the cascade
    """
    soulkey = getattr(request.state, "rbac_soulkey", None)
    offboarded_by = f"soulkey:{soulkey.id}" if soulkey else "admin"

    try:
        result = await offboard_tenant(db, tenant_id, offboarded_by=offboarded_by, purge_dek=purge_dek)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Offboard failed: {exc}")

    return result
