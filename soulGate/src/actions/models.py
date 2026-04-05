"""
Action pipeline data models.
Defines the request/response envelope and policy decision types
for the SoulGate action gateway.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ActionType(str, Enum):
    """Supported action types routed through SoulGate."""
    slack_message = "slack_message"
    slack_reaction = "slack_reaction"
    slack_thread_reply = "slack_thread_reply"
    email_send = "email_send"
    webhook_fire = "webhook_fire"
    tool_invoke = "tool_invoke"
    calendar_create = "calendar_create"
    custom = "custom"


class TiresiasActionRequest(BaseModel):
    """Inbound action submission from PicoClaw or any agent harness."""
    action_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    action_type: ActionType
    persona_id: Optional[str] = None
    soulkey_id: Optional[uuid.UUID] = None
    tenant_id: Optional[uuid.UUID] = None
    target_platform: Optional[str] = None
    target_channel: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    simulation: bool = False
    simulation_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DenialInfo(BaseModel):
    """Details returned when an action is denied by policy."""
    policy_name: str
    rule_name: str
    reason: str


class PolicyDecision(BaseModel):
    """Result of policy evaluation."""
    allowed: bool = True
    denial: Optional[DenialInfo] = None


class TiresiasActionResponse(BaseModel):
    """Response envelope returned to the caller."""
    action_id: uuid.UUID
    decision: str = "permit"  # permit, deny, quarantine
    denial: Optional[DenialInfo] = None
    downstream_status: Optional[int] = None
    downstream_body: Optional[dict[str, Any]] = None
    response_time_ms: Optional[float] = None
    simulation: bool = False
