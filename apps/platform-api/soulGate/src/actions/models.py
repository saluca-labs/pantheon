"""
Pydantic models for the TiresiasAction canonical schema.
Defines the request/response contract for action submission
through the SoulGate action pipeline.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ActionType(str, Enum):
    """Supported action types for PicoClaw execution."""
    POST_MESSAGE = "POST_MESSAGE"
    REPLY_IN_THREAD = "REPLY_IN_THREAD"
    REACT = "REACT"
    DM = "DM"
    SHARE_LINK = "SHARE_LINK"
    PIN_MESSAGE = "PIN_MESSAGE"
    CREATE_CHANNEL = "CREATE_CHANNEL"
    DO_NOTHING = "DO_NOTHING"


class ActionTarget(BaseModel):
    """Target destination for the action."""
    platform: str
    channel: str
    thread_ts: Optional[str] = None


class ActionContent(BaseModel):
    """Content payload for the action."""
    text: Optional[str] = None
    emoji: Optional[str] = None
    link_url: Optional[str] = None


class TiresiasActionRequest(BaseModel):
    """Canonical action request submitted by MiroShark through SoulGate."""
    action_id: uuid.UUID
    tenant_id: str
    persona_id: str
    action_type: ActionType
    target: ActionTarget
    content: ActionContent
    simulation_context: Optional[dict] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DenialInfo(BaseModel):
    """Details of a policy denial decision."""
    policy_name: str
    rule_name: str
    policy_level: str
    reason: str


class TiresiasActionResponse(BaseModel):
    """Response after action processing through the pipeline."""
    action_id: uuid.UUID
    status: str  # executed, failed, denied
    result: Optional[dict] = None
    error: Optional[str] = None
    denied_by: Optional[DenialInfo] = None


class PolicyDecision(BaseModel):
    """Result of policy evaluation for an action."""
    allowed: bool
    reason: str
    policy_name: Optional[str] = None
    rule_name: Optional[str] = None
