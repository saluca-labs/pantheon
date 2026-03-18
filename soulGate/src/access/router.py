"""
Access rule CRUD endpoints.
"""

import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.src.database.connection import get_db
from soulGate.src.database.models import SoulGateAccessRule

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/gate/v1/access", tags=["access-rules"])


class AccessRuleCreate(BaseModel):
    tenant_id: uuid.UUID
    rule_type: str  # ip_allow, ip_deny, geo_allow, geo_deny
    value: str
    priority: int = 100
    enabled: bool = True
    created_by: Optional[str] = None


class AccessRuleResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    rule_type: str
    value: str
    priority: int
    enabled: bool
    created_by: Optional[str]

    model_config = {"from_attributes": True}


@router.get("", response_model=list[AccessRuleResponse])
async def list_access_rules(
    tenant_id: Optional[uuid.UUID] = None,
    rule_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List access rules, optionally filtered by tenant and/or type."""
    query = select(SoulGateAccessRule)
    if tenant_id:
        query = query.where(SoulGateAccessRule.tenant_id == tenant_id)
    if rule_type:
        query = query.where(SoulGateAccessRule.rule_type == rule_type)
    query = query.order_by(SoulGateAccessRule.priority)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=AccessRuleResponse, status_code=201)
async def create_access_rule(
    body: AccessRuleCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new access rule."""
    # Validate rule_type
    valid_types = {"ip_allow", "ip_deny", "geo_allow", "geo_deny"}
    if body.rule_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rule_type. Must be one of: {', '.join(valid_types)}",
        )

    rule = SoulGateAccessRule(**body.model_dump())
    db.add(rule)
    await db.flush()
    await db.refresh(rule)

    logger.info(
        "access.rule_created",
        rule_id=str(rule.id),
        rule_type=body.rule_type,
        value=body.value,
    )
    return rule


@router.put("/{rule_id}", response_model=AccessRuleResponse)
async def update_access_rule(
    rule_id: uuid.UUID,
    body: AccessRuleCreate,
    db: AsyncSession = Depends(get_db),
):
    """Update an access rule."""
    result = await db.execute(
        select(SoulGateAccessRule).where(SoulGateAccessRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Access rule not found")

    for field_name, value in body.model_dump().items():
        setattr(rule, field_name, value)

    db.add(rule)
    await db.flush()
    await db.refresh(rule)

    logger.info("access.rule_updated", rule_id=str(rule_id))
    return rule


@router.delete("/{rule_id}", status_code=204)
async def delete_access_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an access rule."""
    result = await db.execute(
        select(SoulGateAccessRule).where(SoulGateAccessRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Access rule not found")

    await db.delete(rule)
    logger.info("access.rule_deleted", rule_id=str(rule_id))
