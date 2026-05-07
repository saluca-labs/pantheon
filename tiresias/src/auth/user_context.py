"""
User-Agent Relationship Access Control.
Scopes an agent's data access by the human user's identity and clearance level.
This is the key feature that makes agent authorization context-aware:
the same chatbot gets different permissions depending on who is talking to it.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Clearance hierarchy (higher index = more access)
# ---------------------------------------------------------------------------

CLEARANCE_LEVELS = ["public", "internal", "confidential", "restricted"]
CLEARANCE_ORDER = {level: idx for idx, level in enumerate(CLEARANCE_LEVELS)}


class RelationshipType(str, Enum):
    """How a human user relates to the agent."""
    OWNER = "owner"
    SUPERVISOR = "supervisor"
    USER = "user"
    AUDITOR = "auditor"
    GUEST = "guest"


# Base access multipliers per relationship type.
# "owner" gets full agent capabilities; "guest" gets read-only, etc.
RELATIONSHIP_ACCESS = {
    RelationshipType.OWNER: {"allowed_actions": None, "read_only": False},       # None = all
    RelationshipType.SUPERVISOR: {"allowed_actions": None, "read_only": False},
    RelationshipType.USER: {"allowed_actions": None, "read_only": False},
    RelationshipType.AUDITOR: {"allowed_actions": ["read"], "read_only": True},
    RelationshipType.GUEST: {"allowed_actions": ["read"], "read_only": True},
}


@dataclass
class UserContext:
    """Identity of the human user driving an agent request."""
    user_id: str
    user_role: str = ""
    user_department: str = ""
    user_clearance: str = "public"
    session_id: str = ""
    relationship_type: str = "user"
    metadata: dict = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> "UserContext":
        if not data or not data.get("user_id"):
            raise ValueError("user_context requires at least user_id")
        return cls(
            user_id=data["user_id"],
            user_role=data.get("user_role", ""),
            user_department=data.get("user_department", ""),
            user_clearance=data.get("user_clearance", "public"),
            session_id=data.get("session_id", ""),
            relationship_type=data.get("relationship_type", "user"),
            metadata=data.get("metadata", {}),
        )


# ---------------------------------------------------------------------------
# Policy-level user-context rules
# ---------------------------------------------------------------------------

def evaluate_user_context_rules(
    user_context: UserContext,
    resource_rules: list[dict],
    requested_action: str,
) -> Optional[list[str]]:
    """
    Given user_context_rules from a policy resource definition,
    determine which actions are allowed for this user's clearance.

    Returns:
        - list of allowed actions (may be empty), or
        - None if no user_context_rules matched (fall through to default).
    """
    if not resource_rules:
        return None

    user_clearance_level = CLEARANCE_ORDER.get(user_context.user_clearance, 0)

    for rule in resource_rules:
        rule_clearance = rule.get("user_clearance", "")
        if rule_clearance == user_context.user_clearance:
            return rule.get("allowed_actions", [])

    # If no exact match, find the highest clearance level <= user's level
    best_match: Optional[dict] = None
    best_level = -1
    for rule in resource_rules:
        rule_clearance = rule.get("user_clearance", "public")
        rule_level = CLEARANCE_ORDER.get(rule_clearance, 0)
        if rule_level <= user_clearance_level and rule_level > best_level:
            best_match = rule
            best_level = rule_level

    if best_match:
        return best_match.get("allowed_actions", [])

    return None


def apply_user_context(
    user_context: UserContext,
    policy_allowed_actions: list[str],
    resource_user_rules: Optional[list[dict]] = None,
    requested_action: str = "",
) -> tuple[list[str], dict]:
    """
    Intersect agent policy permissions with user context constraints.

    Returns:
        (final_allowed_actions, extra_claims)
        where extra_claims are added to the capability token.
    """
    extra_claims = {
        "uid": user_context.user_id,
        "ucl": user_context.user_clearance,
        "urt": user_context.relationship_type,
    }

    # 1. Relationship-based restriction
    try:
        rel = RelationshipType(user_context.relationship_type)
    except ValueError:
        rel = RelationshipType.GUEST

    rel_access = RELATIONSHIP_ACCESS[rel]
    rel_allowed = rel_access["allowed_actions"]

    if rel_allowed is not None:
        # Intersect with policy-allowed actions
        policy_allowed_actions = [a for a in policy_allowed_actions if a in rel_allowed]

    # 2. User-context rules from policy YAML (if present)
    if resource_user_rules:
        ucr_actions = evaluate_user_context_rules(
            user_context, resource_user_rules, requested_action
        )
        if ucr_actions is not None:
            # Intersect: agent can't exceed what user-context rules allow
            policy_allowed_actions = [a for a in policy_allowed_actions if a in ucr_actions]

    return policy_allowed_actions, extra_claims


def clearance_allows(user_clearance: str, required_clearance: str) -> bool:
    """Check if user clearance meets or exceeds the required level."""
    user_level = CLEARANCE_ORDER.get(user_clearance, 0)
    required_level = CLEARANCE_ORDER.get(required_clearance, 0)
    return user_level >= required_level
