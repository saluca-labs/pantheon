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




class ModelPolicyViolation(Exception):
    """Raised when a model access request violates policy constraints."""
    pass


class TaskModelRule:
    """A single task-to-model routing rule from a persona policy."""

    def __init__(self, task_type: str, data: dict):
        self.task_type: str = task_type
        self.allowed: list[str] = data.get("allowed", [])
        self.required: list[str] = data.get("required", None)
        self.preferred: str = data.get("preferred", None)
        self.description: str = data.get("description", "")


class ModelPolicy:
    """Model routing policy for a persona -- governs which models can be used per task."""

    def __init__(self, data: dict):
        self.default_models: list[str] = data.get("default_models", [])
        self.task_routing: dict[str, TaskModelRule] = {}
        for task_type, rule_data in data.get("task_routing", {}).items():
            self.task_routing[task_type] = TaskModelRule(task_type, rule_data)
        self.forbidden_models: list[str] = data.get("forbidden_models", [])
        self.cost_budget: dict[str, float] | None = data.get("cost_budget", None)
        self.enforcement: str = data.get("enforcement", "strict")

    def resolve_models_for_task(
        self, task_type: str, requested_model: str | None = None
    ) -> tuple[str, str]:
        """Returns (model_to_use, decision_reason).

        Raises ModelPolicyViolation in strict mode on forbidden/required violations.
        """
        rule = self.task_routing.get(task_type)

        if not rule:
            # Fall back to default_models
            if requested_model and requested_model not in self.forbidden_models:
                return requested_model, "default_policy"
            if requested_model and requested_model in self.forbidden_models:
                if self.enforcement == "strict":
                    raise ModelPolicyViolation(
                        f"Model {requested_model} is forbidden for persona"
                    )
                return self.default_models[0] if self.default_models else requested_model, "forbidden_override"
            return self.default_models[0] if self.default_models else "", "default_policy"

        if requested_model:
            if requested_model in self.forbidden_models:
                if self.enforcement == "strict":
                    raise ModelPolicyViolation(
                        f"Model {requested_model} is forbidden for persona"
                    )
                return rule.preferred or rule.allowed[0], "forbidden_override"
            if rule.required and requested_model not in rule.required:
                if self.enforcement == "strict":
                    raise ModelPolicyViolation(
                        f"Task {task_type} requires one of {rule.required}, "
                        f"got {requested_model}"
                    )
                return rule.required[0], "required_override"
            if rule.allowed and requested_model in rule.allowed:
                return requested_model, "allowed"
            if rule.required and requested_model in rule.required:
                return requested_model, "required"
            # requested model not in allowed list
            if rule.allowed:
                if self.enforcement == "strict":
                    raise ModelPolicyViolation(
                        f"Model {requested_model} not in allowed list "
                        f"{rule.allowed} for task {task_type}"
                    )
                return rule.preferred or rule.allowed[0], "not_allowed_override"

        # No specific request
        if rule.preferred:
            return rule.preferred, "auto_selected"
        if rule.allowed:
            return rule.allowed[0], "auto_selected"
        if rule.required:
            return rule.required[0], "auto_selected"
        return self.default_models[0] if self.default_models else "", "auto_selected"

    def to_dict(self) -> dict:
        result = {
            "default_models": self.default_models,
            "task_routing": {},
            "forbidden_models": self.forbidden_models,
            "enforcement": self.enforcement,
        }
        if self.cost_budget:
            result["cost_budget"] = self.cost_budget
        for task_type, rule in self.task_routing.items():
            entry = {"allowed": rule.allowed, "description": rule.description}
            if rule.required:
                entry["required"] = rule.required
            if rule.preferred:
                entry["preferred"] = rule.preferred
            result["task_routing"][task_type] = entry
        return result


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

        # Model routing policy
        model_policies_data = spec.get("model_policies")
        self.model_policies: ModelPolicy | None = (
            ModelPolicy(model_policies_data) if model_policies_data else None
        )

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
                "model_policies": self.model_policies.to_dict() if self.model_policies else None,
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
