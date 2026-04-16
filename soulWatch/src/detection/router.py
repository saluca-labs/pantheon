"""
Detection engine API router for SoulWatch - Sigma rules and playbook management.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.connection import get_db
from soulWatch.src.database.models import SoulWatchDetection, SoulWatchCustomRule
from soulWatch.src.detection._state import get_sigma_engine, get_playbook_engine
from soulWatch.src.detection.sigma_engine import SigmaRule

router = APIRouter(prefix="/watch/v1", tags=["detection"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class RuleSummary(BaseModel):
    id: str
    title: str
    status: str
    level: str
    enabled: bool
    tags: list[str] = []
    response_playbook: Optional[str] = None
    is_custom: bool = False


class RuleDetail(BaseModel):
    id: str
    title: str
    description: str
    status: str
    level: str
    logsource: dict
    detection: dict
    tags: list[str]
    response_playbook: Optional[str]
    enabled: bool
    is_custom: bool = False


class RuleUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    level: Optional[str] = None
    detection: Optional[dict] = None
    tags: Optional[list[str]] = None
    response_playbook: Optional[str] = None
    enabled: Optional[bool] = None


class RuleTestRequest(BaseModel):
    event: dict = Field(..., description="Sample event to test against this rule")


class RuleTestResponse(BaseModel):
    matched: bool
    matched_fields: dict = {}
    rule_id: str
    rule_title: str


class PlaybookSummary(BaseModel):
    id: str
    name: str
    description: str
    severity_threshold: str
    cooldown_minutes: int
    requires_approval: bool
    enabled: bool
    trigger_rules: list[str] = []


class DetectionRecord(BaseModel):
    id: str
    rule_id: str
    rule_title: str
    level: str
    soulkey_id: Optional[str] = None
    matched_fields: Optional[dict] = None
    response_playbook: Optional[str] = None
    created_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Rule endpoints
# ---------------------------------------------------------------------------


@router.get("/rules", response_model=list[RuleSummary])
async def list_rules(
    status: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    enabled: Optional[bool] = Query(None),
):
    """List all loaded Sigma rules (built-in + custom)."""
    engine = get_sigma_engine()
    rules = engine.list_rules()

    if status:
        rules = [r for r in rules if r.status == status]
    if level:
        rules = [r for r in rules if r.level == level]
    if enabled is not None:
        rules = [r for r in rules if r.enabled == enabled]

    return [
        RuleSummary(
            id=r.id, title=r.title, status=r.status, level=r.level,
            enabled=r.enabled, tags=r.tags, response_playbook=r.response_playbook,
            is_custom=r.is_custom,
        )
        for r in rules
    ]


# SECURITY WARNING: Custom Sigma rules accept user-supplied regex in their
# detection blocks. Malicious or poorly written regex can cause catastrophic
# backtracking (ReDoS), blocking the event loop for seconds or longer.
# TODO: Add regex complexity analysis or execution timeout before loading
# user-supplied rules into the Sigma engine.
@router.post("/rules", response_model=RuleDetail, status_code=201)
async def add_rule(
    body: str = Body(..., media_type="text/yaml"),
    db: AsyncSession = Depends(get_db),
):
    """Add a new custom Sigma rule from YAML body."""
    engine = get_sigma_engine()
    try:
        rule = engine.load_rule(body)
        rule.is_custom = True
        engine.add_rule(rule)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Sigma rule: {str(e)}")

    # Persist custom rule to DB
    custom_record = SoulWatchCustomRule(
        rule_id=rule.id,
        title=rule.title,
        description=rule.description,
        yaml_content=body,
        level=rule.level,
        enabled=rule.enabled,
    )
    db.add(custom_record)
    await db.flush()

    return RuleDetail(**rule.to_dict())


@router.get("/rules/{rule_id}", response_model=RuleDetail)
async def get_rule(rule_id: str):
    """Get detailed information about a specific rule."""
    engine = get_sigma_engine()
    rule = engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return RuleDetail(**rule.to_dict())


@router.put("/rules/{rule_id}", response_model=RuleDetail)
async def update_rule(
    rule_id: str,
    body: RuleUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing rule's fields."""
    engine = get_sigma_engine()
    rule = engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if body.title is not None:
        rule.title = body.title
    if body.description is not None:
        rule.description = body.description
    if body.status is not None:
        rule.status = body.status
    if body.level is not None:
        rule.level = body.level
    if body.detection is not None:
        rule.detection = body.detection
    if body.tags is not None:
        rule.tags = body.tags
    if body.response_playbook is not None:
        rule.response_playbook = body.response_playbook
    if body.enabled is not None:
        rule.enabled = body.enabled

    engine.add_rule(rule)

    # Update DB record if custom
    if rule.is_custom:
        result = await db.execute(
            select(SoulWatchCustomRule).where(SoulWatchCustomRule.rule_id == rule_id)
        )
        record = result.scalar_one_or_none()
        if record:
            record.title = rule.title
            record.description = rule.description
            record.level = rule.level
            record.enabled = rule.enabled
            record.yaml_content = rule.to_yaml()
            await db.flush()

    return RuleDetail(**rule.to_dict())


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom rule by ID. Built-in rules cannot be deleted."""
    engine = get_sigma_engine()
    rule = engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if not rule.is_custom:
        raise HTTPException(status_code=403, detail="Cannot delete built-in rules. Disable instead.")

    engine.remove_rule(rule_id)

    # Remove from DB
    result = await db.execute(
        select(SoulWatchCustomRule).where(SoulWatchCustomRule.rule_id == rule_id)
    )
    record = result.scalar_one_or_none()
    if record:
        await db.delete(record)
        await db.flush()


@router.post("/rules/{rule_id}/test", response_model=RuleTestResponse)
async def test_rule(rule_id: str, body: RuleTestRequest):
    """Test a rule against a sample event."""
    engine = get_sigma_engine()
    rule = engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    original_enabled = rule.enabled
    rule.enabled = True

    matches = engine.evaluate(body.event)
    rule_matches = [m for m in matches if m.rule.id == rule_id]

    rule.enabled = original_enabled

    if rule_matches:
        m = rule_matches[0]
        return RuleTestResponse(
            matched=True, matched_fields=m.matched_fields,
            rule_id=rule.id, rule_title=rule.title,
        )
    return RuleTestResponse(
        matched=False, matched_fields={},
        rule_id=rule.id, rule_title=rule.title,
    )


# ---------------------------------------------------------------------------
# Detection log endpoints
# ---------------------------------------------------------------------------


@router.get("/detections")
async def list_detections(
    tenant_id: Optional[str] = Query(None),
    rule_id: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    soulkey_id: Optional[str] = Query(None),
    since_hours: int = Query(24, ge=1, le=720),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    include_noise: bool = Query(False, description="When false (default), suppress rows with a non-null noise_classification (e.g. legacy_health_probe_noise). Set true for audit/investigation."),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated Sigma rule match log from the database.

    tenant_id is required for tenant-scoped access. Omitting it returns 401
    rather than leaking rows across tenants.

    When SOULWATCH_TENANT_HIERARCHY_MODE=true the query expands to include
    all active descendant tenants so MSSP/SaaS owners see rows from leaf
    tenants without needing per-tenant calls.
    """
    from sqlalchemy import func
    import uuid
    from soulWatch.src.database.tenants import get_descendant_tenant_ids
    from soulWatch.config.settings import get_settings

    # Tenant isolation — require explicit tenant_id to prevent cross-tenant leakage.
    if not tenant_id:
        raise HTTPException(status_code=401, detail="tenant_id is required")

    try:
        uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id")

    settings = get_settings()
    if settings.tenant_hierarchy_mode:
        tenant_ids = await get_descendant_tenant_ids(db, tenant_id)
        tenant_uuids = [uuid.UUID(t) for t in tenant_ids]
        tenant_filter = SoulWatchDetection.tenant_id.in_(tenant_uuids)
    else:
        tid = uuid.UUID(tenant_id)
        tenant_filter = SoulWatchDetection.tenant_id == tid

    cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    query = (
        select(SoulWatchDetection)
        .where(SoulWatchDetection.created_at >= cutoff)
        .where(tenant_filter)
        .order_by(SoulWatchDetection.created_at.desc())
    )

    if rule_id:
        query = query.where(SoulWatchDetection.rule_id == rule_id)
    if level:
        query = query.where(SoulWatchDetection.level == level)
    if soulkey_id:
        try:
            sk_id = uuid.UUID(soulkey_id)
            query = query.where(SoulWatchDetection.soulkey_id == sk_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid soulkey_id")

    # By default suppress known-noise rows (B7-FIX-HEALTH-PROBE-NOISE).
    # Callers investigating historical false-positives can opt in with include_noise=true.
    if not include_noise:
        query = query.where(SoulWatchDetection.noise_classification.is_(None))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(query.offset(offset).limit(page_size))
    detections = result.scalars().all()

    def _build_description(d: SoulWatchDetection) -> str:
        desc = f"Sigma rule '{d.rule_title}' (level: {d.level}) matched"
        if d.soulkey_id:
            desc += f" for agent {d.soulkey_id}"
        if d.matched_fields:
            field_summary = ", ".join(
                f"{k}={v}" for k, v in (d.matched_fields or {}).items()
            )
            desc += f" on fields: {field_summary}"
        return desc

    return {
        "detections": [
            {
                "id": str(d.id),
                "rule_id": d.rule_id,
                "rule_title": d.rule_title,
                "level": d.level,
                "soulkey_id": str(d.soulkey_id) if d.soulkey_id else None,
                "matched_fields": d.matched_fields,
                "event_data": d.event_data,
                "response_playbook": d.response_playbook,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "description": _build_description(d),
                "noise_classification": d.noise_classification,
            }
            for d in detections
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ---------------------------------------------------------------------------
# Playbook endpoints
# ---------------------------------------------------------------------------


@router.get("/playbooks", response_model=list[PlaybookSummary])
async def list_playbooks():
    """List all loaded response playbooks."""
    engine = get_playbook_engine()
    return [
        PlaybookSummary(
            id=pb.id, name=pb.name, description=pb.description,
            severity_threshold=pb.severity_threshold,
            cooldown_minutes=pb.cooldown_minutes,
            requires_approval=pb.requires_approval,
            enabled=pb.enabled, trigger_rules=pb.trigger_rules,
        )
        for pb in engine.list_playbooks()
    ]


@router.post("/playbooks", response_model=PlaybookSummary, status_code=201)
async def add_playbook(body: str = Body(..., media_type="text/yaml")):
    """Add a new playbook from YAML body."""
    engine = get_playbook_engine()
    try:
        data = yaml.safe_load(body)
        pb = engine._parse_playbook(data)
        engine.add_playbook(pb)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid playbook: {str(e)}")

    return PlaybookSummary(
        id=pb.id, name=pb.name, description=pb.description,
        severity_threshold=pb.severity_threshold,
        cooldown_minutes=pb.cooldown_minutes,
        requires_approval=pb.requires_approval,
        enabled=pb.enabled, trigger_rules=pb.trigger_rules,
    )


@router.get("/playbooks/{playbook_id}")
async def get_playbook(playbook_id: str):
    """Get a specific playbook."""
    engine = get_playbook_engine()
    pb = engine.get_playbook(playbook_id)
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return pb.to_dict()


@router.put("/playbooks/{playbook_id}")
async def update_playbook(
    playbook_id: str,
    body: str = Body(..., media_type="text/yaml"),
):
    """Replace a playbook with updated YAML."""
    engine = get_playbook_engine()
    existing = engine.get_playbook(playbook_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Playbook not found")

    try:
        data = yaml.safe_load(body)
        data["id"] = playbook_id
        pb = engine._parse_playbook(data)
        engine.add_playbook(pb)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid playbook: {str(e)}")

    return pb.to_dict()


@router.get("/playbooks/executions")
async def list_playbook_executions(
    limit: int = Query(100, le=500),
):
    """Get recent playbook execution log."""
    engine = get_playbook_engine()
    log = engine.get_execution_log(limit=limit)
    return {"executions": [r.to_dict() for r in log], "count": len(log)}
