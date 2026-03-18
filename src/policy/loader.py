"""
Policy-as-code loader.
Loads YAML policy files, resolves role templates, caches in database.
Implements SPEC.md section 4.
"""

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.database.models import PolicyCache


class PolicyRule:
    """A single resource access rule from a persona policy."""

    def __init__(self, data: dict):
        self.actions: list[str] = data.get("actions", [])
        self.scopes: list[str] = data.get("scopes", ["*"])
        self.nodes: list[str] = data.get("nodes", ["*"])
        self.services: list[str] = data.get("services", ["*"])
        self.conditions: list[dict] = data.get("conditions", [])


class JITConfig:
    def __init__(self, data: dict):
        self.max_capability_ttl: int = data.get("max_capability_ttl", 300)
        self.default_capability_ttl: int = data.get("default_capability_ttl", 120)
        self.require_active_session: bool = data.get("require_active_session", True)
        self.allowed_nodes: list[str] = data.get("allowed_nodes", [])
        self.operating_window: str = data.get("operating_window", "24/7")
        self.max_concurrent_capabilities: int = data.get("max_concurrent_capabilities", 5)


class EscalationConfig:
    def __init__(self, data: dict):
        self.can_grant_temporary_access: bool = data.get("can_grant_temporary_access", False)
        self.can_suspend_agents: bool = data.get("can_suspend_agents", False)
        self.approval_required_for: list[str] = data.get("approval_required_for", [])


class ResolvedPolicy:
    """Fully resolved persona policy ready for PDP evaluation."""

    def __init__(self, data: dict):
        spec = data.get("spec", {})
        metadata = data.get("metadata", {})

        self.tenant: str = metadata.get("tenant", "")
        self.persona: str = metadata.get("persona", "")
        self.role: str = metadata.get("role", "")
        self.description: str = metadata.get("description", "")

        self.jit = JITConfig(spec.get("jit", {}))
        self.escalation = EscalationConfig(spec.get("escalation", {}))

        self.resources: dict[str, list[PolicyRule]] = {}
        for resource_name, rules_data in spec.get("resources", {}).items():
            if isinstance(rules_data, list):
                self.resources[resource_name] = [PolicyRule(r) for r in rules_data]
            else:
                self.resources[resource_name] = []

    def to_dict(self) -> dict:
        return {
            "metadata": {
                "tenant": self.tenant,
                "persona": self.persona,
                "role": self.role,
                "description": self.description,
            },
            "spec": {
                "jit": {
                    "max_capability_ttl": self.jit.max_capability_ttl,
                    "default_capability_ttl": self.jit.default_capability_ttl,
                    "require_active_session": self.jit.require_active_session,
                    "allowed_nodes": self.jit.allowed_nodes,
                    "operating_window": self.jit.operating_window,
                    "max_concurrent_capabilities": self.jit.max_concurrent_capabilities,
                },
                "escalation": {
                    "can_grant_temporary_access": self.escalation.can_grant_temporary_access,
                    "can_suspend_agents": self.escalation.can_suspend_agents,
                    "approval_required_for": self.escalation.approval_required_for,
                },
                "resources": {
                    name: [
                        {
                            "actions": rule.actions,
                            "scopes": rule.scopes,
                            "nodes": rule.nodes,
                            "services": rule.services,
                            "conditions": rule.conditions,
                        }
                        for rule in rules
                    ]
                    for name, rules in self.resources.items()
                },
            },
        }


def load_policy_file(path: str) -> dict:
    """Load a single YAML policy file."""
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def load_role_templates(shared_dir: str) -> dict:
    """Load shared role templates from roles.yaml."""
    roles_path = Path(shared_dir) / "roles.yaml"
    if not roles_path.exists():
        return {}
    data = load_policy_file(str(roles_path))
    return data.get("roles", {})


def resolve_policy(policy_data: dict, role_templates: dict) -> ResolvedPolicy:
    """Resolve a persona policy by merging with role template defaults."""
    metadata = policy_data.get("metadata", {})
    role = metadata.get("role", "")
    template = role_templates.get(role, {})
    template_defaults = template.get("defaults", {})

    spec = policy_data.get("spec", {})

    # Merge JIT
    if "jit" not in spec:
        spec["jit"] = template_defaults.get("jit", {})
    else:
        for key, value in template_defaults.get("jit", {}).items():
            if key not in spec["jit"]:
                spec["jit"][key] = value

    # Merge escalation
    if "escalation" not in spec:
        spec["escalation"] = template_defaults.get("escalation", {})
    else:
        for key, value in template_defaults.get("escalation", {}).items():
            if key not in spec["escalation"]:
                spec["escalation"][key] = value

    # Merge resources
    if "resources" not in spec and "resources" in template_defaults:
        spec["resources"] = template_defaults["resources"]

    return ResolvedPolicy({"metadata": metadata, "spec": spec})


def load_tenant_policies(
    policy_repo_path: str, tenant_slug: str
) -> list[tuple[str, ResolvedPolicy]]:
    """Load all persona policies for a tenant."""
    repo = Path(policy_repo_path)
    shared_dir = repo / "shared"
    tenant_dir = repo / "tenants" / tenant_slug / "personas"

    role_templates = load_role_templates(str(shared_dir))
    policies = []
    if tenant_dir.exists():
        for policy_file in tenant_dir.glob("*.yaml"):
            data = load_policy_file(str(policy_file))
            persona_id = policy_file.stem
            resolved = resolve_policy(data, role_templates)
            policies.append((persona_id, resolved))
    return policies


async def sync_policies_to_cache(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    policies: list[tuple[str, ResolvedPolicy]],
    policy_version: str = "local",
) -> int:
    """Upsert resolved policies into _soulauth_policy_cache."""
    count = 0
    for persona_id, policy in policies:
        stmt = pg_insert(PolicyCache).values(
            tenant_id=tenant_id,
            persona_id=persona_id,
            policy_version=policy_version,
            resolved_policy=policy.to_dict(),
            synced_at=datetime.now(timezone.utc),
        ).on_conflict_do_update(
            constraint="uq_policy_cache_tenant_persona",
            set_={
                "policy_version": policy_version,
                "resolved_policy": policy.to_dict(),
                "synced_at": datetime.now(timezone.utc),
            },
        )
        await db.execute(stmt)
        count += 1
    return count


async def load_cached_policy(
    db: AsyncSession, tenant_id: uuid.UUID, persona_id: str
) -> Optional[ResolvedPolicy]:
    """Load a resolved policy from the database cache."""
    result = await db.execute(
        select(PolicyCache).where(
            PolicyCache.tenant_id == tenant_id,
            PolicyCache.persona_id == persona_id,
        )
    )
    cache_entry = result.scalar_one_or_none()
    if not cache_entry:
        return None
    return ResolvedPolicy(cache_entry.resolved_policy)


def find_matching_rule(
    rules: list[PolicyRule], action: str, scope: str
) -> Optional[PolicyRule]:
    """Find a policy rule that grants the requested action on the given scope."""
    for rule in rules:
        if action not in rule.actions and "*" not in rule.actions:
            continue

        scope_matched = False
        for rule_scope in rule.scopes:
            if rule_scope == "*":
                scope_matched = True
                break
            if rule_scope == scope:
                scope_matched = True
                break
            if rule_scope.endswith(":*"):
                prefix = rule_scope[:-1]
                if scope.startswith(prefix):
                    scope_matched = True
                    break

        if scope_matched:
            return rule
    return None
