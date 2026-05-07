"""
API key management CRUD endpoints.
"""

import uuid
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.src.database.connection import get_db
from soulGate.src.database.models import SoulGateAPIKey
from soulGate.src.auth.apikey import issue_api_key, rotate_api_key, revoke_api_key

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/gate/v1/apikeys", tags=["api-keys"])


class APIKeyCreate(BaseModel):
    tenant_id: uuid.UUID
    label: str
    scopes: Optional[list[str]] = None
    rate_limit_override: Optional[dict] = None
    created_by: Optional[str] = None
    expires_at: Optional[datetime] = None


class APIKeyResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    label: str
    key_prefix: str
    status: str
    scopes: Optional[list]
    rate_limit_override: Optional[dict]
    created_by: Optional[str]
    created_at: Optional[datetime]
    rotated_at: Optional[datetime]
    revoked_at: Optional[datetime]
    expires_at: Optional[datetime]

    model_config = {"from_attributes": True}


class APIKeyIssueResponse(BaseModel):
    """Response that includes the raw key (shown only once)."""
    raw_key: str
    key: APIKeyResponse


@router.get("", response_model=list[APIKeyResponse])
async def list_api_keys(
    tenant_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List API keys, optionally filtered by tenant and/or status."""
    query = select(SoulGateAPIKey)
    if tenant_id:
        query = query.where(SoulGateAPIKey.tenant_id == tenant_id)
    if status:
        query = query.where(SoulGateAPIKey.status == status)
    query = query.order_by(SoulGateAPIKey.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=APIKeyIssueResponse, status_code=201)
async def create_api_key(
    body: APIKeyCreate,
    db: AsyncSession = Depends(get_db),
):
    """Issue a new API key. The raw key is returned only once."""
    raw_key, key_record = await issue_api_key(
        db=db,
        tenant_id=body.tenant_id,
        label=body.label,
        scopes=body.scopes,
        rate_limit_override=body.rate_limit_override,
        created_by=body.created_by,
        expires_at=body.expires_at,
    )
    return APIKeyIssueResponse(
        raw_key=raw_key,
        key=APIKeyResponse.model_validate(key_record),
    )


@router.post("/{key_id}/rotate", response_model=APIKeyIssueResponse)
async def rotate_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Rotate an API key. Returns the new raw key (shown only once)."""
    result = await rotate_api_key(db, key_id)
    if not result:
        raise HTTPException(status_code=404, detail="API key not found or not active")

    raw_key, key_record = result
    return APIKeyIssueResponse(
        raw_key=raw_key,
        key=APIKeyResponse.model_validate(key_record),
    )


@router.delete("/{key_id}", status_code=204)
async def revoke_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Revoke an API key."""
    revoked = await revoke_api_key(db, key_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="API key not found or not active")

    logger.info("apikey.revoked_via_api", key_id=str(key_id))


@router.get("/stats")
async def api_key_stats(
    tenant_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """Get API key statistics."""
    query = select(
        SoulGateAPIKey.status,
        func.count(SoulGateAPIKey.id),
    ).group_by(SoulGateAPIKey.status)

    if tenant_id:
        query = query.where(SoulGateAPIKey.tenant_id == tenant_id)

    result = await db.execute(query)
    rows = result.all()

    stats = {row[0]: row[1] for row in rows}
    return {
        "total": sum(stats.values()),
        "by_status": stats,
    }
