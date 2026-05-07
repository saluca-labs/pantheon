"""Tests for Aletheia tool policy schema, engine, overrides, and rate limits."""

import os
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from src.aletheia.tool_policy import (
    ToolPolicy,
    ToolPolicyRule,
    MatchSpec,
    RateLimitSpec,
    AgentOverride,
    load_tool_policy,
    load_tool_policies_from_dir,
)
from src.aletheia.tool_policy_engine import (
    ToolPolicyEngine,
    ToolPolicyResult,
    init_tool_policy_engine,
    get_active_engine,
    reload_tool_policies,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def default_enterprise_policy_dir():
    """Return the path to the real policies/tool directory."""
    policy_dir = Path(__file__).parent.parent / "policies" / "tool"
    if policy_dir.is_dir():
        return str(policy_dir)
    pytest.skip("policies/tool directory not found")


@pytest.fixture
def sample_policy_yaml():
    """Return a minimal ToolPolicy YAML string."""
    return {
        "apiVersion": "tiresias/v1",
        "kind": "ToolPolicy",
        "metadata": {"name": "test-policy", "tier": "enterprise"},
        "spec": {
            "default_action": "allow",
            "rules": [
                {
                    "name": "block-rm",
                    "match": {"commands": ["rm"]},
                    "action": "deny",
                    "reason": "Destructive operation blocked",
                },
                {
                    "name": "warn-export",
                    "match": {
                        "commands": ["gws drive files.export", "gws gmail users.messages.get"],
                        "args_pattern": ".*--(format|type)=(raw|full).*",
                    },
                    "action": "warn",
                    "reason": "Data export warning",
                },
                {
                    "name": "rate-limited-api",
                    "match": {"commands": ["gws *", "gh api *"]},
                    "rate_limit": {"max_per_minute": 3, "max_per_hour": 10},
                    "action": "allow",
                },
            ],
            "agent_overrides": {
                "alfred-main": {
                    "override_rules": [{"name": "block-rm", "action": "warn"}],
                },
                "untrusted-agent": {
                    "default_action": "deny",
                    "allowed_commands": [
                        "gws gmail users.messages.list",
                        "gws drive files.list",
                    ],
                },
            },
        },
    }


@pytest.fixture
def tmp_policy_dir(sample_policy_yaml):
    """Create a temp dir with a single policy YAML file."""
    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, "test-policy.yaml")
        with open(path, "w") as f:
            yaml.dump(sample_policy_yaml, f)
        yield tmpdir


@pytest.fixture
def engine(tmp_policy_dir):
    """Return a ToolPolicyEngine loaded from the temp policy dir."""
    policies = load_tool_policies_from_dir(tmp_policy_dir)
    return ToolPolicyEngine(policies)


# ---------------------------------------------------------------------------
# Schema / Loader tests (ALETH-05)
# ---------------------------------------------------------------------------

class TestToolPolicyLoader:
    """Tests for YAML parsing and schema validation."""

    def test_load_valid_policy(self, tmp_policy_dir):
        """Load a valid ToolPolicy YAML file."""
        policies = load_tool_policies_from_dir(tmp_policy_dir)
        assert len(policies) == 1
        p = policies[0]
        assert p.name == "test-policy"
        assert p.default_action == "allow"
        assert len(p.rules) == 3
        assert len(p.agent_overrides) == 2
        assert p.enabled is True

    def test_wrong_api_version(self, tmp_policy_dir):
        """Reject YAML with wrong apiVersion."""
        bad = {"apiVersion": "v2", "kind": "ToolPolicy", "metadata": {"name": "bad"}, "spec": {}}
        path = os.path.join(tmp_policy_dir, "bad.yaml")
        with open(path, "w") as f:
            yaml.dump(bad, f)
        result = load_tool_policy(path)
        assert result is None

    def test_wrong_kind(self, tmp_policy_dir):
        """Reject YAML with wrong kind."""
        bad = {"apiVersion": "tiresias/v1", "kind": "CotPolicy", "metadata": {"name": "bad"}, "spec": {}}
        path = os.path.join(tmp_policy_dir, "bad.yaml")
        with open(path, "w") as f:
            yaml.dump(bad, f)
        result = load_tool_policy(path)
        assert result is None

    def test_invalid_regex_skips_rule(self):
        """Rule with invalid args_pattern regex is skipped."""
        with tempfile.TemporaryDirectory() as tmpdir:
            doc = {
                "apiVersion": "tiresias/v1",
                "kind": "ToolPolicy",
                "metadata": {"name": "bad-regex"},
                "spec": {
                    "rules": [
                        {
                            "name": "bad",
                            "match": {"commands": ["test"], "args_pattern": "[invalid"},
                            "action": "deny",
                        }
                    ]
                },
            }
            path = os.path.join(tmpdir, "bad.yaml")
            with open(path, "w") as f:
                yaml.dump(doc, f)
            policy = load_tool_policy(path)
            assert policy is not None
            assert len(policy.rules) == 0  # bad regex rule is skipped

    def test_disabled_policy_not_loaded(self):
        """Disabled policies are excluded from load_tool_policies_from_dir."""
        with tempfile.TemporaryDirectory() as tmpdir:
            doc = {
                "apiVersion": "tiresias/v1",
                "kind": "ToolPolicy",
                "metadata": {"name": "disabled"},
                "spec": {"enabled": False, "rules": []},
            }
            path = os.path.join(tmpdir, "disabled.yaml")
            with open(path, "w") as f:
                yaml.dump(doc, f)
            policies = load_tool_policies_from_dir(tmpdir)
            assert len(policies) == 0

    def test_empty_dir(self):
        """Empty directory returns no policies."""
        with tempfile.TemporaryDirectory() as tmpdir:
            policies = load_tool_policies_from_dir(tmpdir)
            assert len(policies) == 0

    def test_nonexistent_dir(self):
        """Nonexistent directory returns no policies."""
        policies = load_tool_policies_from_dir("/nonexistent/path")
        assert len(policies) == 0

    def test_glob_matching(self, tmp_policy_dir):
        """Glob command patterns are parsed correctly."""
        policies = load_tool_policies_from_dir(tmp_policy_dir)
        rate_rule = [r for r in policies[0].rules if r.name == "rate-limited-api"][0]
        assert "gws *" in rate_rule.match.commands

    def test_rate_limit_parsed(self, tmp_policy_dir):
        """Rate limit spec is parsed from YAML."""
        policies = load_tool_policies_from_dir(tmp_policy_dir)
        rate_rule = [r for r in policies[0].rules if r.name == "rate-limited-api"][0]
        assert rate_rule.rate_limit is not None
        assert rate_rule.rate_limit.max_per_minute == 3
        assert rate_rule.rate_limit.max_per_hour == 10


# ---------------------------------------------------------------------------
# Engine evaluation tests (ALETH-04)
# ---------------------------------------------------------------------------

class TestToolPolicyEngine:
    """Tests for policy evaluation logic."""

    def test_deny_rm(self, engine):
        """rm command should be denied by block-rm rule."""
        result = engine.evaluate("test-agent", "test-tenant", "rm", ["-rf", "/"])
        assert result.verdict == "deny"
        assert result.rule_matched == "block-rm"
        assert "Destructive" in result.reason

    def test_allow_ls(self, engine):
        """ls command should be allowed (no matching rule, default allow)."""
        result = engine.evaluate("test-agent", "test-tenant", "ls", ["-la"])
        assert result.verdict == "allow"

    def test_warn_data_export(self, engine):
        """Data export with --format=raw should trigger warn."""
        result = engine.evaluate(
            "test-agent", "test-tenant",
            "gws drive files.export",
            ["--format=raw", "--file-id=abc"],
        )
        assert result.verdict == "warn"
        assert result.rule_matched == "warn-export"

    def test_no_warn_without_args_match(self, engine):
        """Data export without matching args pattern should not warn."""
        result = engine.evaluate(
            "test-agent", "test-tenant",
            "gws drive files.export",
            ["--file-id=abc"],
        )
        # Should match rate-limited-api (gws *) but not warn-export
        assert result.verdict == "allow"

    def test_fail_open_no_engine(self):
        """When no engine is active, get_active_engine returns None."""
        import src.aletheia.tool_policy_engine as mod
        old = mod._active_engine
        mod._active_engine = None
        assert get_active_engine() is None
        mod._active_engine = old

    def test_deny_wins_over_warn(self):
        """If both deny and warn rules match, deny should win."""
        policy = ToolPolicy(
            name="test",
            rules=[
                ToolPolicyRule(
                    name="warn-rule",
                    match=MatchSpec(commands=["danger*"]),
                    action="warn",
                    reason="warning",
                ),
                ToolPolicyRule(
                    name="deny-rule",
                    match=MatchSpec(commands=["danger*"]),
                    action="deny",
                    reason="denied",
                ),
            ],
        )
        engine = ToolPolicyEngine([policy])
        result = engine.evaluate("test", "test", "dangerous", [])
        assert result.verdict == "deny"


# ---------------------------------------------------------------------------
# Agent override tests (ALETH-05)
# ---------------------------------------------------------------------------

class TestAgentOverrides:
    """Tests for per-agent override behavior."""

    def test_alfred_override_deny_to_warn(self, engine):
        """alfred-main has override: block-rm deny -> warn."""
        result = engine.evaluate("alfred-main", "test-tenant", "rm", ["-rf", "/"])
        assert result.verdict == "warn"
        assert result.override_applied is True
        assert result.rule_matched == "block-rm"

    def test_untrusted_agent_denied_by_default(self, engine):
        """untrusted-agent with default_action=deny, command not in whitelist."""
        result = engine.evaluate("untrusted-agent", "test-tenant", "rm", ["-rf", "/"])
        assert result.verdict == "deny"
        assert result.override_applied is True

    def test_untrusted_agent_allowed_whitelisted(self, engine):
        """untrusted-agent can use whitelisted commands."""
        result = engine.evaluate(
            "untrusted-agent", "test-tenant",
            "gws gmail users.messages.list", [],
        )
        # Should NOT be denied by whitelist (command is in allowed_commands)
        assert result.verdict != "deny" or result.override_applied is False

    def test_untrusted_agent_blocked_non_whitelisted(self, engine):
        """untrusted-agent cannot use non-whitelisted commands."""
        result = engine.evaluate("untrusted-agent", "test-tenant", "kubectl", ["get", "pods"])
        assert result.verdict == "deny"
        assert result.override_applied is True


# ---------------------------------------------------------------------------
# Rate limiting tests (ALETH-04)
# ---------------------------------------------------------------------------

class TestRateLimiting:
    """Tests for sliding window rate limiting."""

    def test_rate_limit_triggers_deny(self, engine):
        """Exceeding max_per_minute should escalate to deny."""
        # The rate-limited-api rule has max_per_minute=3
        for i in range(3):
            result = engine.evaluate("rate-test", "test-tenant", "gws list", [])
            assert result.verdict == "allow", f"Call {i} should be allow"

        # 4th call should be denied
        result = engine.evaluate("rate-test", "test-tenant", "gws list", [])
        assert result.verdict == "deny"
        assert result.rate_limited is True

    def test_rate_limit_per_agent(self, engine):
        """Rate limits are tracked per-agent."""
        for i in range(3):
            engine.evaluate("agent-a", "test-tenant", "gws list", [])

        # agent-b should still be allowed
        result = engine.evaluate("agent-b", "test-tenant", "gws list", [])
        assert result.verdict == "allow"


# ---------------------------------------------------------------------------
# Hot-reload / singleton tests (ALETH-05)
# ---------------------------------------------------------------------------

class TestHotReload:
    """Tests for singleton init and hot-reload."""

    def test_init_and_get(self, tmp_policy_dir):
        """init_tool_policy_engine loads policies and get returns engine."""
        init_tool_policy_engine(tmp_policy_dir)
        engine = get_active_engine()
        assert engine is not None
        assert engine.policy_count == 1

    def test_reload_picks_up_changes(self, tmp_policy_dir):
        """After adding a second YAML, reload should increase policy count."""
        init_tool_policy_engine(tmp_policy_dir)
        assert get_active_engine().policy_count == 1

        # Add a second policy
        doc = {
            "apiVersion": "tiresias/v1",
            "kind": "ToolPolicy",
            "metadata": {"name": "extra"},
            "spec": {"default_action": "deny", "rules": []},
        }
        with open(os.path.join(tmp_policy_dir, "extra.yaml"), "w") as f:
            yaml.dump(doc, f)

        reload_tool_policies(tmp_policy_dir)
        assert get_active_engine().policy_count == 2

    def test_empty_dir_sets_none(self):
        """Reload from empty dir sets engine to None."""
        with tempfile.TemporaryDirectory() as tmpdir:
            init_tool_policy_engine(tmpdir)
            assert get_active_engine() is None


# ---------------------------------------------------------------------------
# Default enterprise policy integration test (ALETH-05)
# ---------------------------------------------------------------------------

class TestDefaultEnterprisePolicy:
    """Tests against the real default-enterprise.yaml if available."""

    def test_load_default_enterprise(self, default_enterprise_policy_dir):
        """Load the real default-enterprise.yaml and validate structure."""
        policies = load_tool_policies_from_dir(default_enterprise_policy_dir)
        assert len(policies) >= 1

        p = policies[0]
        assert p.name == "default-enterprise"
        assert len(p.rules) == 3
        assert len(p.agent_overrides) == 2

    def test_deny_rm_default_enterprise(self, default_enterprise_policy_dir):
        """rm is denied in default-enterprise policy."""
        policies = load_tool_policies_from_dir(default_enterprise_policy_dir)
        engine = ToolPolicyEngine(policies)
        result = engine.evaluate("some-agent", "some-tenant", "rm", ["-rf", "/"])
        assert result.verdict == "deny"

    def test_alfred_main_override(self, default_enterprise_policy_dir):
        """alfred-main gets warn instead of deny for rm."""
        policies = load_tool_policies_from_dir(default_enterprise_policy_dir)
        engine = ToolPolicyEngine(policies)
        result = engine.evaluate("alfred-main", "some-tenant", "rm", ["-rf", "/"])
        assert result.verdict == "warn"
        assert result.override_applied is True
