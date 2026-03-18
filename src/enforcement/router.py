"""
Enforcement API router — quarantine management and policy configuration endpoints.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import QuarantinePolicyDB
from src.enforcement.quarantine import (
    QuarantineEngine,
    QuarantineAction,
    QuarantinePolicy,
    QuarantineStatus,
    DEFAULT_QUARANTINE_POLICIES,
)
from src.analytics.detector import AnomalyType
from src.auth.rbac import require_permission

router = APIRouter(prefix="/v1/enforcement", tags=["Enforcement"])

# Module-level engine instance (initialized on first use or via lifespan)
_engine: Optional[QuarantineEngine] = None


def get_quarantine_engine() -> QuarantineEngine:
    global _engine
    if _engine is None:
        _engine = QuarantineEngine()
    return _engine


def set_quarantine_engine(engine: QuarantineEngine):
    global _engine
    _engine = engine


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ManualQuarantineRequest(BaseModel):
    actions: list[str] = Field(
        default=["suspend_key", "kill_session"],
        description="Quarantine actions to execute",
    )
    reason: str = "Manual quarantine"
    auto_release_after: Optional[int] = Field(
        default=None,
        description="Minutes until auto-release (null = manual only)",
    )


class ReleaseRequest(BaseModel):
    released_by: str = "admin"


class QuarantineRecordResponse(BaseModel):
    id: str
    soulkey_id: str
    tenant_id: str
    persona_id: str
    triggered_by_type: str
    triggered_by_id: Optional[str] = None
    actions_taken: list[str]
    status: str
    quarantined_at: str
    released_at: Optional[str] = None
    auto_release_at: Optional[str] = None
    released_by: Optional[str] = None
    reason: str


class QuarantinePolicyResponse(BaseModel):
    trigger: Optional[str]
    severity_threshold: str
    actions: list[str]
    auto_release_after: Optional[int]
    requires_approval: bool
    notification_priority: str


class QuarantinePolicyConfigCreate(BaseModel):
    """Schema for creating a new quarantine policy configuration."""
    trigger_type: str = Field(
        ...,
        description="Anomaly type trigger: credential_stuffing, scope_escalation, rate_spike, or 'any'",
    )
    threshold: float = Field(default=0.8, ge=0.0, le=1.0)
    severity_threshold: str = Field(
        default="high",
        description="Minimum severity: low, medium, high, critical",
    )
    action: str = Field(
        default="suspend_key",
        description="Comma-separated actions: suspend_key, revoke_key, kill_session, force_reauth, rate_limit, isolate, reset_context",
    )
    cooldown_minutes: int = Field(default=15, ge=0)
    auto_release_hours: Optional[float] = Field(default=1.0, ge=0.0)
    enabled: bool = True


class QuarantinePolicyConfigUpdate(BaseModel):
    """Schema for updating an existing quarantine policy configuration."""
    trigger_type: Optional[str] = None
    threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    severity_threshold: Optional[str] = None
    action: Optional[str] = None
    cooldown_minutes: Optional[int] = Field(default=None, ge=0)
    auto_release_hours: Optional[float] = Field(default=None, ge=0.0)
    enabled: Optional[bool] = None


class QuarantinePolicyConfigResponse(BaseModel):
    id: str
    tenant_id: str
    trigger_type: str
    threshold: float
    severity_threshold: str
    action: str
    cooldown_minutes: int
    auto_release_hours: Optional[float]
    enabled: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Default policy seeds
# ---------------------------------------------------------------------------

DEFAULT_POLICY_SEEDS: list[dict] = [
    {
        "trigger_type": "credential_stuffing",
        "threshold": 0.8,
        "severity_threshold": "high",
        "action": "suspend_key,kill_session",
        "cooldown_minutes": 15,
        "auto_release_hours": 1.0,
        "enabled": True,
    },
    {
        "trigger_type": "scope_escalation",
        "threshold": 0.7,
        "severity_threshold": "high",
        "action": "rate_limit,force_reauth",
        "cooldown_minutes": 10,
        "auto_release_hours": 0.5,
        "enabled": True,
    },
    {
        "trigger_type": "rate_spike",
        "threshold": 0.9,
        "severity_threshold": "critical",
        "action": "suspend_key,kill_session,reset_context",
        "cooldown_minutes": 30,
        "auto_release_hours": None,
        "enabled": True,
    },
    {
        "trigger_type": "any",
        "threshold": 0.9,
        "severity_threshold": "critical",
        "action": "suspend_key,kill_session",
        "cooldown_minutes": 30,
        "auto_release_hours": None,
        "enabled": True,
    },
]


async def seed_default_policies(db: AsyncSession, tenant_id: uuid.UUID) -> list[QuarantinePolicyDB]:
    """Seed default quarantine policies for a new tenant."""
    policies = []
    for seed in DEFAULT_POLICY_SEEDS:
        policy = QuarantinePolicyDB(
            tenant_id=tenant_id,
            **seed,
        )
        db.add(policy)
        policies.append(policy)
    await db.flush()
    return policies


async def load_tenant_policies(db: AsyncSession, tenant_id: uuid.UUID) -> list[QuarantinePolicy]:
    """
    Load quarantine policies from DB for a tenant.
    Falls back to hardcoded defaults if no DB policies exist.
    """
    result = await db.execute(
        select(QuarantinePolicyDB).where(
            QuarantinePolicyDB.tenant_id == tenant_id,
            QuarantinePolicyDB.enabled == True,
        )
    )
    db_policies = result.scalars().all()

    if not db_policies:
        return list(DEFAULT_QUARANTINE_POLICIES)

    # Convert DB models to engine QuarantinePolicy dataclasses
    policies = []
    anomaly_type_map = {
        "credential_stuffing": AnomalyType.CREDENTIAL_STUFFING,
        "scope_escalation": AnomalyType.SCOPE_ESCALATION,
        "rate_spike": AnomalyType.RATE_SPIKE,
        "any": None,
    }

    for dbp in db_policies:
        trigger = anomaly_type_map.get(dbp.trigger_type)
        actions_list = [
            QuarantineAction(a.strip())
            for a in dbp.action.split(",")
            if a.strip()
        ]
        auto_release = int(dbp.auto_release_hours * 60) if dbp.auto_release_hours else None

        policies.append(QuarantinePolicy(
            trigger=trigger,  # type: ignore[arg-type]
            severity_threshold=dbp.severity_threshold,
            actions=actions_list,
            auto_release_after=auto_release,
            requires_approval=False,
            notification_priority="critical" if dbp.severity_threshold == "critical" else "high",
        ))

    return policies


def _policy_to_response(p: QuarantinePolicyDB) -> dict:
    """Convert a QuarantinePolicyDB model to a response dict."""
    return {
        "id": str(p.id),
        "tenant_id": str(p.tenant_id),
        "trigger_type": p.trigger_type,
        "threshold": p.threshold,
        "severity_threshold": p.severity_threshold,
        "action": p.action,
        "cooldown_minutes": p.cooldown_minutes,
        "auto_release_hours": p.auto_release_hours,
        "enabled": p.enabled,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Quarantine management endpoints
# ---------------------------------------------------------------------------

@router.get("/quarantine", response_model=list[QuarantineRecordResponse], dependencies=[Depends(require_permission("enforcement:read"))])
async def list_quarantined(
    tenant_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List all quarantined agents, optionally filtered by tenant."""
    engine = get_quarantine_engine()
    tid = uuid.UUID(tenant_id) if tenant_id else None
    records = await engine.list_quarantined(tenant_id=tid)
    return [r.to_dict() for r in records]


@router.post("/quarantine/{soulkey_id}", response_model=QuarantineRecordResponse, dependencies=[Depends(require_permission("enforcement:write"))])
async def manual_quarantine(
    soulkey_id: str,
    request: ManualQuarantineRequest,
    db: AsyncSession = Depends(get_db),
):
    """Manually quarantine an agent by soulkey ID."""
    engine = get_quarantine_engine()

    # Resolve soulkey
    from src.database.models import Soulkey

    sk_id = uuid.UUID(soulkey_id)
    result = await db.execute(select(Soulkey).where(Soulkey.id == sk_id))
    sk = result.scalar_one_or_none()
    if not sk:
        raise HTTPException(status_code=404, detail="Soulkey not found")

    actions = []
    for a in request.actions:
        try:
            actions.append(QuarantineAction(a))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid action: {a}")

    record = await engine.execute_quarantine(
        db=db,
        soulkey_id=sk.id,
        tenant_id=sk.tenant_id,
        persona_id=sk.persona_id,
        actions=actions,
        reason=request.reason,
        triggered_by_type="manual",
        auto_release_after=request.auto_release_after,
    )
    return record.to_dict()


@router.post(
    "/quarantine/{quarantine_id}/release",
    response_model=dict,
    dependencies=[Depends(require_permission("enforcement:write"))],
)
async def release_quarantine(
    quarantine_id: str,
    request: ReleaseRequest,
    db: AsyncSession = Depends(get_db),
):
    """Release an agent from quarantine."""
    engine = get_quarantine_engine()
    qid = uuid.UUID(quarantine_id)
    ok = await engine.release_quarantine(db, qid, released_by=request.released_by)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail="Quarantine record not found or already released",
        )
    return {"status": "released", "quarantine_id": quarantine_id}


@router.get("/quarantine/policies", response_model=list[QuarantinePolicyResponse], dependencies=[Depends(require_permission("enforcement:read"))])
async def list_quarantine_policies():
    """View active quarantine policies (in-memory engine defaults)."""
    engine = get_quarantine_engine()
    return [
        {
            "trigger": p.trigger.value if p.trigger else None,
            "severity_threshold": p.severity_threshold,
            "actions": [a.value for a in p.actions],
            "auto_release_after": p.auto_release_after,
            "requires_approval": p.requires_approval,
            "notification_priority": p.notification_priority,
        }
        for p in engine.policies
    ]


# ---------------------------------------------------------------------------
# Quarantine Policy Configuration CRUD (C4 - per-tenant configurable)
# ---------------------------------------------------------------------------

@router.get("/policies", response_model=list[QuarantinePolicyConfigResponse], dependencies=[Depends(require_permission("enforcement:read"))])
async def list_policies(
    tenant_id: str = Query(..., description="Tenant ID to list policies for"),
    db: AsyncSession = Depends(get_db),
):
    """List quarantine policies for a tenant."""
    tid = uuid.UUID(tenant_id)
    result = await db.execute(
        select(QuarantinePolicyDB).where(QuarantinePolicyDB.tenant_id == tid)
    )
    policies = result.scalars().all()

    if not policies:
        # Auto-seed defaults on first access
        policies = await seed_default_policies(db, tid)
        await db.commit()

    return [_policy_to_response(p) for p in policies]


@router.post("/policies", response_model=QuarantinePolicyConfigResponse, status_code=201, dependencies=[Depends(require_permission("enforcement:write"))])
async def create_policy(
    tenant_id: str = Query(..., description="Tenant ID"),
    body: QuarantinePolicyConfigCreate = ...,
    db: AsyncSession = Depends(get_db),
):
    """Create a new quarantine policy for a tenant."""
    tid = uuid.UUID(tenant_id)

    # Validate trigger_type
    valid_triggers = {"credential_stuffing", "scope_escalation", "rate_spike", "any"}
    if body.trigger_type not in valid_triggers:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid trigger_type. Must be one of: {', '.join(sorted(valid_triggers))}",
        )

    # Validate severity_threshold
    valid_severities = {"low", "medium", "high", "critical"}
    if body.severity_threshold not in valid_severities:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid severity_threshold. Must be one of: {', '.join(sorted(valid_severities))}",
        )

    # Validate actions
    valid_actions = {a.value for a in QuarantineAction}
    for action_str in body.action.split(","):
        action_str = action_str.strip()
        if action_str and action_str not in valid_actions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action '{action_str}'. Must be one of: {', '.join(sorted(valid_actions))}",
            )

    policy = QuarantinePolicyDB(
        tenant_id=tid,
        trigger_type=body.trigger_type,
        threshold=body.threshold,
        severity_threshold=body.severity_threshold,
        action=body.action,
        cooldown_minutes=body.cooldown_minutes,
        auto_release_hours=body.auto_release_hours,
        enabled=body.enabled,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)

    return _policy_to_response(policy)


@router.patch("/policies/{policy_id}", response_model=QuarantinePolicyConfigResponse, dependencies=[Depends(require_permission("enforcement:write"))])
async def update_policy(
    policy_id: str,
    body: QuarantinePolicyConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing quarantine policy."""
    pid = uuid.UUID(policy_id)
    result = await db.execute(
        select(QuarantinePolicyDB).where(QuarantinePolicyDB.id == pid)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    update_data = body.model_dump(exclude_unset=True)

    # Validate updated fields
    if "trigger_type" in update_data:
        valid_triggers = {"credential_stuffing", "scope_escalation", "rate_spike", "any"}
        if update_data["trigger_type"] not in valid_triggers:
            raise HTTPException(status_code=400, detail=f"Invalid trigger_type")

    if "severity_threshold" in update_data:
        valid_severities = {"low", "medium", "high", "critical"}
        if update_data["severity_threshold"] not in valid_severities:
            raise HTTPException(status_code=400, detail=f"Invalid severity_threshold")

    if "action" in update_data:
        valid_actions = {a.value for a in QuarantineAction}
        for action_str in update_data["action"].split(","):
            action_str = action_str.strip()
            if action_str and action_str not in valid_actions:
                raise HTTPException(status_code=400, detail=f"Invalid action '{action_str}'")

    for key, value in update_data.items():
        setattr(policy, key, value)

    await db.commit()
    await db.refresh(policy)

    return _policy_to_response(policy)


@router.delete("/policies/{policy_id}", dependencies=[Depends(require_permission("enforcement:write"))])
async def delete_policy(
    policy_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a quarantine policy."""
    pid = uuid.UUID(policy_id)
    result = await db.execute(
        select(QuarantinePolicyDB).where(QuarantinePolicyDB.id == pid)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    await db.delete(policy)
    await db.commit()

    return {"status": "deleted", "policy_id": policy_id}
