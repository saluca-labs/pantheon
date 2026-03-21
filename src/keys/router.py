"""
API Key (Soulkey) CRUD — KEY-01, KEY-02, KEY-03, KEY-04.

Endpoints:
  GET    /v1/keys               — list all soulkeys for the caller's tenant (KEY-01)
  POST   /v1/keys               — create new soulkey, return raw key once (KEY-02)
  DELETE /v1/keys/{key_id}      — permanently revoke a soulkey (KEY-03)
  GET    /v1/keys/{key_id}/usage — request counts 24h/7d/30d from audit log (KEY-04)

Tenant identified via X-Tenant-ID header.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import AuditLog, Soulkey, SoulTenant
from src.auth.soulkey import issue_soulkey, list_soulkeys, revoke_soulkey

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/keys", tags=["API Keys"])


# --- Schemas -----------------------------------------------------------------

class SoulkeyItem(BaseModel):
    id: str
    label: Optional[str]
    persona_id: str
    status: str
    issued_at: Optional[datetime]
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]

    model_config = {"from_attributes": True}


class SoulkeyListResponse(BaseModel):
    keys: list[SoulkeyItem]
    total: int


class CreateKeyRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=255, description="Human-readable label for this key")
    persona_id: str = Field(default="api-user", description="Persona slug attached to this key")
    expires_at: Optional[datetime] = Field(None, description="Optional expiry. If omitted, key never expires.")


class CreateKeyResponse(BaseModel):
    id: str
    label: str
    persona_id: str
    raw_key: str = Field(description="The full soulkey value — shown exactly once. Copy it now.")
    issued_at: Optional[datetime]
    expires_at: Optional[datetime]
    status: str


class RevokeResponse(BaseModel):
    id: str
    status: str
    revoked_at: Optional[datetime]
    message: str


class KeyUsageWindow(BaseModel):
    window: str  # "24h", "7d", "30d"
    request_count: int


class KeyUsageResponse(BaseModel):
    key_id: str
    label: Optional[str]
    usage: list[KeyUsageWindow]


# --- Helpers -----------------------------------------------------------------

def _get_caller_tenant_id(request: Request) -> uuid.UUID:
    raw = request.headers.get("X-Tenant-ID")
    if not raw:
        raise HTTPException(status_code=403, detail="X-Tenant-ID header is required.")
    try:
        return uuid.UUID(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed X-Tenant-ID UUID.")


async def _get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> SoulTenant:
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


async def _get_key_owned_by_tenant(
    db: AsyncSession, key_id: uuid.UUID, tenant_id: uuid.UUID
) -> Soulkey:
    result = await db.execute(
        select(Soulkey).where(Soulkey.id == key_id, Soulkey.tenant_id == tenant_id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    return key


# --- Endpoints ---------------------------------------------------------------

@router.get(
    "",
    response_model=SoulkeyListResponse,
    summary="List all API keys for the tenant (KEY-01)",
)
async def list_keys(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> SoulkeyListResponse:
    """List all soulkeys belonging to the caller tenant, ordered by issued_at desc."""
    tenant_id = _get_caller_tenant_id(request)
    keys = await list_soulkeys(db, tenant_id)
    items = [
        SoulkeyItem(
            id=str(k.id),
            label=k.label,
            persona_id=k.persona_id,
            status=k.status,
            issued_at=k.issued_at,
            expires_at=k.expires_at,
            last_used_at=k.last_used_at,
        )
        for k in keys
    ]
    return SoulkeyListResponse(keys=items, total=len(items))


@router.post(
    "",
    response_model=CreateKeyResponse,
    status_code=201,
    summary="Create a new API key — shown once (KEY-02)",
)
async def create_key(
    request: Request,
    body: CreateKeyRequest,
    db: AsyncSession = Depends(get_db),
) -> CreateKeyResponse:
    """
    Issue a new soulkey. The raw key value is returned ONCE in this response.
    Only the SHA-512 hash is stored — there is no way to retrieve the raw key later.
    """
    tenant_id = _get_caller_tenant_id(request)
    tenant = await _get_tenant(db, tenant_id)

    raw_key, soulkey = await issue_soulkey(
        db=db,
        tenant_id=tenant_id,
        persona_id=body.persona_id,
        tenant_short=tenant.slug[:8],
        label=body.label,
        expires_at=body.expires_at,
    )
    await db.commit()

    logger.info("api_key_created", tenant_id=str(tenant_id), key_id=str(soulkey.id))

    return CreateKeyResponse(
        id=str(soulkey.id),
        label=soulkey.label or body.label,
        persona_id=soulkey.persona_id,
        raw_key=raw_key,
        issued_at=soulkey.issued_at,
        expires_at=soulkey.expires_at,
        status=soulkey.status,
    )


@router.delete(
    "/{key_id}",
    response_model=RevokeResponse,
    summary="Revoke an API key permanently (KEY-03)",
)
async def revoke_key(
    key_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RevokeResponse:
    """
    Permanently revoke a soulkey. Effect is immediate — no grace period.
    Terminal state: revoked keys cannot be reinstated.
    """
    tenant_id = _get_caller_tenant_id(request)
    key = await _get_key_owned_by_tenant(db, key_id, tenant_id)

    if key.status == "revoked":
        raise HTTPException(status_code=409, detail="Key is already revoked")

    revoked = await revoke_soulkey(
        db=db,
        soulkey_id=key_id,
        revoked_by="customer:self-service",
        reason="Customer revoked via dashboard",
    )
    await db.commit()

    if not revoked:
        raise HTTPException(status_code=404, detail="Key not found or already revoked")

    logger.info("api_key_revoked", tenant_id=str(tenant_id), key_id=str(key_id))

    return RevokeResponse(
        id=str(key_id),
        status="revoked",
        revoked_at=revoked.revoked_at,
        message="Key revoked. Effect is immediate.",
    )


@router.get(
    "/{key_id}/usage",
    response_model=KeyUsageResponse,
    summary="Key usage stats from audit log (KEY-04)",
)
async def key_usage(
    key_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> KeyUsageResponse:
    """
    Returns request count for this key over 24h, 7d, and 30d windows.
    Counts rows in _soulauth_audit where soulkey_id matches.
    """
    tenant_id = _get_caller_tenant_id(request)
    key = await _get_key_owned_by_tenant(db, key_id, tenant_id)

    now = datetime.now(timezone.utc)
    windows = [
        ("24h", now - timedelta(hours=24)),
        ("7d", now - timedelta(days=7)),
        ("30d", now - timedelta(days=30)),
    ]

    usage_data: list[KeyUsageWindow] = []
    for window_label, since in windows:
        count_result = await db.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.soulkey_id == key_id,
                AuditLog.timestamp >= since,
            )
        )
        count = count_result.scalar_one() or 0
        usage_data.append(KeyUsageWindow(window=window_label, request_count=count))

    return KeyUsageResponse(
        key_id=str(key_id),
        label=key.label,
        usage=usage_data,
    )
