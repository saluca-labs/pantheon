"""
Tests for policy loading and evaluation.
"""

import os
import tempfile
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
import yaml

from src.policy.loader import (
    load_policy_file,
    load_role_templates,
    resolve_policy,
    find_matching_rule,
    ResolvedPolicy,
    PolicyRule,
)


@pytest.fixture
def policy_repo(tmp_path):
    """Create a temporary policy repository structure."""
    # shared/roles.yaml
    shared_dir = tmp_path / "shared"
    shared_dir.mkdir()
    roles = {
        "apiVersion": "soulauth/v1",
        "kind": "RoleTemplates",
        "roles": {
            "orchestrator": {
                "description": "Unrestricted agent",
                "defaults": {
                    "jit": {
                        "max_capability_ttl": 900,
                        "allowed_nodes": ["*"],
                    },
                    "escalation": {
                        "can_grant_temporary_access": True,
                        "can_suspend_agents": True,
                    },
                },
            },
            "domain_specialist": {
                "description": "Scoped specialist",
                "defaults": {
                    "jit": {
                        "max_capability_ttl": 300,
                        "allowed_nodes": [],
                    },
                    "escalation": {
                        "can_grant_temporary_access": False,
                        "can_suspend_agents": False,
                    },
                },
            },
        },
    }
    with open(shared_dir / "roles.yaml", "w") as f:
        yaml.dump(roles, f)

    # tenants/saluca/personas/alfred.yaml
    tenant_dir = tmp_path / "tenants" / "saluca" / "personas"
    tenant_dir.mkdir(parents=True)

    alfred_policy = {
        "apiVersion": "soulauth/v1",
        "kind": "PersonaPolicy",
        "metadata": {
            "tenant": "saluca",
            "persona": "alfred",
            "role": "orchestrator",
            "description": "AI chief of staff",
        },
        "spec": {
            "jit": {
                "max_capability_ttl": 900,
                "default_capability_ttl": 300,
                "require_active_session": False,
                "allowed_nodes": ["*"],
                "operating_window": "24/7",
                "max_concurrent_capabilities": 10,
            },
            "resources": {
                "memory": [
                    {"actions": ["read", "write", "delete"], "scopes": ["*"], "conditions": []},
                ],
                "vault": [
                    {"actions": ["read", "reveal"], "scopes": ["*"], "conditions": [{"require_approval": False}]},
                ],
            },
            "escalation": {
                "can_grant_temporary_access": True,
                "can_suspend_agents": True,
                "approval_required_for": [],
            },
        },
    }
    with open(tenant_dir / "alfred.yaml", "w") as f:
        yaml.dump(alfred_policy, f)

    oracle_policy = {
        "apiVersion": "soulauth/v1",
        "kind": "PersonaPolicy",
        "metadata": {
            "tenant": "saluca",
            "persona": "oracle",
            "role": "domain_specialist",
            "description": "CS & Math specialist",
        },
        "spec": {
            "jit": {
                "default_capability_ttl": 120,
                "require_active_session": True,
                "allowed_nodes": ["claude-code-gcp", "ai-lab"],
                "operating_window": "24/7",
                "max_concurrent_capabilities": 5,
            },
            "resources": {
                "memory": [
                    {"actions": ["read", "write"], "scopes": ["cs:*", "math:*"], "conditions": []},
                    {"actions": ["read"], "scopes": ["*"], "conditions": [{"require_approval": True, "approver_role": "orchestrator"}]},
                ],
            },
        },
    }
    with open(tenant_dir / "oracle.yaml", "w") as f:
        yaml.dump(oracle_policy, f)

    return tmp_path


class TestPolicyLoading:
    """Tests for loading YAML policy files."""

    def test_load_policy_file(self, policy_repo):
        """Load a policy YAML file."""
        path = policy_repo / "tenants" / "saluca" / "personas" / "alfred.yaml"
        data = load_policy_file(str(path))
        assert data["metadata"]["persona"] == "alfred"
        assert data["metadata"]["role"] == "orchestrator"

    def test_load_role_templates(self, policy_repo):
        """Load shared role templates."""
        templates = load_role_templates(str(policy_repo / "shared"))
        assert "orchestrator" in templates
        assert "domain_specialist" in templates
        assert templates["orchestrator"]["defaults"]["jit"]["max_capability_ttl"] == 900


class TestPolicyResolution:
    """Tests for policy resolution with role templates."""

    def test_resolve_orchestrator_policy(self, policy_repo):
        """Orchestrator policy resolves with full permissions."""
        data = load_policy_file(
            str(policy_repo / "tenants" / "saluca" / "personas" / "alfred.yaml")
        )
        templates = load_role_templates(str(policy_repo / "shared"))
        policy = resolve_policy(data, templates)

        assert policy.persona == "alfred"
        assert policy.role == "orchestrator"
        assert policy.jit.max_capability_ttl == 900
        assert "*" in policy.jit.allowed_nodes
        assert policy.escalation.can_grant_temporary_access is True
        assert "memory" in policy.resources
        assert "vault" in policy.resources

    def test_resolve_specialist_inherits_defaults(self, policy_repo):
        """Specialist policy inherits role template defaults."""
        data = load_policy_file(
            str(policy_repo / "tenants" / "saluca" / "personas" / "oracle.yaml")
        )
        templates = load_role_templates(str(policy_repo / "shared"))
        policy = resolve_policy(data, templates)

        assert policy.persona == "oracle"
        assert policy.role == "domain_specialist"
        # max_capability_ttl comes from role template since not set in persona
        assert policy.jit.max_capability_ttl == 300
        # allowed_nodes comes from persona (overrides template)
        assert "claude-code-gcp" in policy.jit.allowed_nodes
        assert "ai-lab" in policy.jit.allowed_nodes

    def test_resolved_policy_to_dict(self, policy_repo):
        """ResolvedPolicy can be serialized to dict for caching."""
        data = load_policy_file(
            str(policy_repo / "tenants" / "saluca" / "personas" / "alfred.yaml")
        )
        templates = load_role_templates(str(policy_repo / "shared"))
        policy = resolve_policy(data, templates)

        d = policy.to_dict()
        assert d["metadata"]["persona"] == "alfred"
        assert "resources" in d["spec"]
        assert "jit" in d["spec"]


class TestRuleMatching:
    """Tests for find_matching_rule."""

    def test_exact_action_and_scope_match(self):
        rules = [
            PolicyRule({"actions": ["read", "write"], "scopes": ["cs:*"], "conditions": []}),
        ]
        result = find_matching_rule(rules, "read", "cs:algorithms")
        assert result is not None

    def test_wildcard_scope(self):
        rules = [
            PolicyRule({"actions": ["read"], "scopes": ["*"], "conditions": []}),
        ]
        result = find_matching_rule(rules, "read", "anything:at:all")
        assert result is not None

    def test_no_action_match(self):
        rules = [
            PolicyRule({"actions": ["read"], "scopes": ["*"], "conditions": []}),
        ]
        result = find_matching_rule(rules, "delete", "something")
        assert result is None

    def test_no_scope_match(self):
        rules = [
            PolicyRule({"actions": ["read"], "scopes": ["cs:*"], "conditions": []}),
        ]
        result = find_matching_rule(rules, "read", "business:strategy")
        assert result is None

    def test_multiple_rules_first_match(self):
        rules = [
            PolicyRule({"actions": ["read", "write"], "scopes": ["cs:*"], "conditions": []}),
            PolicyRule({"actions": ["read"], "scopes": ["*"], "conditions": [{"require_approval": True}]}),
        ]
        # First rule matches for cs:algorithms
        result = find_matching_rule(rules, "read", "cs:algorithms")
        assert result is not None
        assert len(result.conditions) == 0  # First rule has no conditions

        # Second rule matches for business:strategy (no approval-free match)
        result = find_matching_rule(rules, "read", "business:strategy")
        assert result is not None
        assert len(result.conditions) == 1  # Second rule requires approval
