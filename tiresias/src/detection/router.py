"""
Detection engine API router — Sigma rules and playbook management.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src.detection._state import (
    get_sigma_engine,
    get_playbook_engine,
)
from src.detection.sigma_engine import SigmaRule, SigmaMatch
from src.auth.rbac import require_permission

router = APIRouter(prefix="/v1/detection", tags=["Detection"])


# ---------------------------------------------------------------------------
# Pydantic models for request/response
# ---------------------------------------------------------------------------


class RuleSummary(BaseModel):
    id: str
    title: str
    status: str
    level: str
    enabled: bool
    tags: list[str] = []
    response_playbook: Optional[str] = None


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


class MatchSummary(BaseModel):
    rule_id: str
    rule_title: str
    level: str
    timestamp: str
    matched_fields: dict = {}
    response_playbook: Optional[str] = None


class EngineStatus(BaseModel):
    rules_loaded: int
    rules_enabled: int
    rules_by_level: dict
    matches_last_hour: int
    total_matches_buffered: int
    playbooks_loaded: int
    detection_enabled: bool = True


# ---------------------------------------------------------------------------
# Rule endpoints
# ---------------------------------------------------------------------------


@router.get("/rules", response_model=list[RuleSummary], summary="List Sigma detection rules", dependencies=[Depends(require_permission("detection:read"))])
async def list_rules(
    status: Optional[str] = Query(None, description="Filter by status: stable, test, experimental"),
    level: Optional[str] = Query(None, description="Filter by level: low, medium, high, critical"),
    enabled: Optional[bool] = Query(None, description="Filter by enabled state"),
):
    """List all loaded Sigma detection rules with optional filters. Requires Pro tier or above."""
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
            id=r.id,
            title=r.title,
            status=r.status,
            level=r.level,
            enabled=r.enabled,
            tags=r.tags,
            response_playbook=r.response_playbook,
        )
        for r in rules
    ]


@router.post("/rules", response_model=RuleDetail, status_code=201, summary="Add a Sigma detection rule", dependencies=[Depends(require_permission("detection:write"))])
async def add_rule(body: str = Body(..., media_type="text/yaml")):
    """Add a new Sigma-format detection rule from a YAML body. The rule is validated and loaded into the detection engine immediately."""
    engine = get_sigma_engine()
    try:
        rule = engine.load_rule(body)
        engine.add_rule(rule)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Sigma rule: {str(e)}")

    return RuleDetail(**rule.to_dict())


@router.get("/rules/{rule_id}", response_model=RuleDetail, summary="Get detection rule details", dependencies=[Depends(require_permission("detection:read"))])
async def get_rule(rule_id: str):
    """Get detailed information about a specific Sigma rule including detection logic, tags, and associated response playbook."""
    engine = get_sigma_engine()
    rule = engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return RuleDetail(**rule.to_dict())


@router.put("/rules/{rule_id}", response_model=RuleDetail, summary="Update a detection rule", dependencies=[Depends(require_permission("detection:write"))])
async def update_rule(rule_id: str, update: RuleUpdateRequest):
    """Update an existing Sigma rule's fields. Only provided fields are modified."""
    engine = get_sigma_engine()
    rule = engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if update.title is not None:
        rule.title = update.title
    if update.description is not None:
        rule.description = update.description
    if update.status is not None:
        rule.status = update.status
    if update.level is not None:
        rule.level = update.level
    if update.detection is not None:
        rule.detection = update.detection
    if update.tags is not None:
        rule.tags = update.tags
    if update.response_playbook is not None:
        rule.response_playbook = update.response_playbook
    if update.enabled is not None:
        rule.enabled = update.enabled

    engine.add_rule(rule)
    return RuleDetail(**rule.to_dict())


@router.delete("/rules/{rule_id}", status_code=204, summary="Delete a detection rule", dependencies=[Depends(require_permission("detection:write"))])
async def delete_rule(rule_id: str):
    """Remove a Sigma rule from the detection engine. Returns 204 on success, 404 if not found."""
    engine = get_sigma_engine()
    if not engine.remove_rule(rule_id):
        raise HTTPException(status_code=404, detail="Rule not found")


@router.post("/rules/{rule_id}/test", response_model=RuleTestResponse, summary="Test a rule against a sample event", dependencies=[Depends(require_permission("detection:write"))])
async def test_rule(rule_id: str, body: RuleTestRequest):
    """Test a specific Sigma rule against a sample event payload. Returns whether the rule matched and which fields triggered the match."""
    engine = get_sigma_engine()
    rule = engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    # Temporarily enable for test
    original_enabled = rule.enabled
    rule.enabled = True

    matches = engine.evaluate(body.event)
    rule_matches = [m for m in matches if m.rule.id == rule_id]

    rule.enabled = original_enabled

    if rule_matches:
        m = rule_matches[0]
        return RuleTestResponse(
            matched=True,
            matched_fields=m.matched_fields,
            rule_id=rule.id,
            rule_title=rule.title,
        )

    return RuleTestResponse(
        matched=False,
        matched_fields={},
        rule_id=rule.id,
        rule_title=rule.title,
    )


# ---------------------------------------------------------------------------
# Playbook endpoints
# ---------------------------------------------------------------------------


@router.get("/playbooks", response_model=list[PlaybookSummary], summary="List response playbooks", dependencies=[Depends(require_permission("detection:read"))])
async def list_playbooks():
    """List all loaded response playbooks including severity thresholds, cooldown settings, and trigger rules."""
    engine = get_playbook_engine()
    return [
        PlaybookSummary(
            id=pb.id,
            name=pb.name,
            description=pb.description,
            severity_threshold=pb.severity_threshold,
            cooldown_minutes=pb.cooldown_minutes,
            requires_approval=pb.requires_approval,
            enabled=pb.enabled,
            trigger_rules=pb.trigger_rules,
        )
        for pb in engine.list_playbooks()
    ]


@router.post("/playbooks", response_model=PlaybookSummary, status_code=201, summary="Add a response playbook", dependencies=[Depends(require_permission("detection:write"))])
async def add_playbook(body: str = Body(..., media_type="text/yaml")):
    """Add a new response playbook from a YAML body. Playbooks define automated responses to detection rule matches."""
    engine = get_playbook_engine()
    try:
        data = yaml.safe_load(body)
        pb = engine._parse_playbook(data)
        engine.add_playbook(pb)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid playbook: {str(e)}")

    return PlaybookSummary(
        id=pb.id,
        name=pb.name,
        description=pb.description,
        severity_threshold=pb.severity_threshold,
        cooldown_minutes=pb.cooldown_minutes,
        requires_approval=pb.requires_approval,
        enabled=pb.enabled,
        trigger_rules=pb.trigger_rules,
    )


# ---------------------------------------------------------------------------
# Matches & Status
# ---------------------------------------------------------------------------


@router.get("/matches", response_model=list[MatchSummary], summary="Get recent detection matches", dependencies=[Depends(require_permission("detection:read"))])
async def get_matches(
    rule_id: Optional[str] = Query(None, description="Filter by rule ID"),
    level: Optional[str] = Query(None, description="Filter by severity level"),
    minutes: int = Query(60, description="Lookback window in minutes"),
    limit: int = Query(100, le=1000, description="Max matches to return"),
):
    """Get recent Sigma rule matches within the specified time window. Each match includes the triggering rule, matched fields, and timestamp."""
    engine = get_sigma_engine()
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

    matches = engine.get_recent_matches(
        limit=limit,
        rule_id=rule_id,
        level=level,
        since=since,
    )

    return [
        MatchSummary(
            rule_id=m.rule.id,
            rule_title=m.rule.title,
            level=m.rule.level,
            timestamp=m.timestamp.isoformat(),
            matched_fields=m.matched_fields,
            response_playbook=m.rule.response_playbook,
        )
        for m in matches
    ]


@router.get("/status", response_model=EngineStatus, summary="Detection engine status", dependencies=[Depends(require_permission("detection:read"))])
async def engine_status():
    """Get detection engine status including loaded rule counts, match statistics, and playbook information."""
    sigma = get_sigma_engine()
    playbook = get_playbook_engine()

    status = sigma.get_status()
    status["playbooks_loaded"] = len(playbook.list_playbooks())
    status["detection_enabled"] = True

    return EngineStatus(**status)
