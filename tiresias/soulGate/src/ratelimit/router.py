"""
Rate limit policy CRUD endpoints.
"""

import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.src.database.connection import get_db
from soulGate.src.database.models import SoulGateRateLimit
from soulGate.src.ratelimit.engine import load_rate_limit_policies

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/gate/v1/ratelimits", tags=["rate-limits"])


class RateLimitCreate(BaseModel):
    tenant_id: uuid.UUID
    soulkey_id: Optional[uuid.UUID] = None
    persona_id: Optional[str] = None
    endpoint_pattern: str = "*"
    requests_per_minute: int = 60
    burst_size: int = 10
    window_type: str = "sliding"
    enabled: bool = True


class RateLimitUpdate(BaseModel):
    requests_per_minute: Optional[int] = None
    burst_size: Optional[int] = None
    endpoint_pattern: Optional[str] = None
    enabled: Optional[bool] = None


class RateLimitResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    soulkey_id: Optional[uuid.UUID]
    persona_id: Optional[str]
    endpoint_pattern: str
    requests_per_minute: int
    burst_size: int
    window_type: str
    enabled: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=list[RateLimitResponse])
async def list_rate_limits(
    tenant_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """List rate limit policies, optionally filtered by tenant."""
    query = select(SoulGateRateLimit)
    if tenant_id:
        query = query.where(SoulGateRateLimit.tenant_id == tenant_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=RateLimitResponse, status_code=201)
async def create_rate_limit(
    body: RateLimitCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new rate limit policy."""
    policy = SoulGateRateLimit(**body.model_dump())
    db.add(policy)
    await db.flush()
    await db.refresh(policy)

    # Reload policies into engine
    await load_rate_limit_policies(db)

    logger.info("ratelimit.created", policy_id=str(policy.id), tenant_id=str(body.tenant_id))
    return policy


@router.put("/{policy_id}", response_model=RateLimitResponse)
async def update_rate_limit(
    policy_id: uuid.UUID,
    body: RateLimitUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a rate limit policy."""
    result = await db.execute(
        select(SoulGateRateLimit).where(SoulGateRateLimit.id == policy_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Rate limit policy not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(policy, field, value)

    db.add(policy)
    await db.flush()
    await db.refresh(policy)

    await load_rate_limit_policies(db)

    logger.info("ratelimit.updated", policy_id=str(policy_id))
    return policy


@router.delete("/{policy_id}", status_code=204)
async def delete_rate_limit(
    policy_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a rate limit policy."""
    result = await db.execute(
        select(SoulGateRateLimit).where(SoulGateRateLimit.id == policy_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Rate limit policy not found")

    await db.delete(policy)
    await load_rate_limit_policies(db)

    logger.info("ratelimit.deleted", policy_id=str(policy_id))
