"""
Tests for CoT policy enforcement.
Covers policy loading, exemption checks, enforcement modes (inject/reject/warn),
provider-specific injection, and cost tagging.
"""

import os
import tempfile
import textwrap
from pathlib import Path

import pytest

from src.aletheia.cot_policy import (
    CotPolicy,
    ExemptionRule,
    ProviderInjection,
    check_exemption,
    load_cot_policy,
    load_cot_policies_from_dir,
)
from src.aletheia.cot_enforcer import CotEnforcer, CotEnforcementResult


# -- Fixtures --

def _make_policy_file(tmp_dir: str, name: str, content: str) -> str:
    path = os.path.join(tmp_dir, f"{name}.yaml")
    with open(path, "w") as f:
        f.write(textwrap.dedent(content))
    return path


def _default_policy(**overrides) -> CotPolicy:
    defaults = dict(
        name="test-policy",
        require_thinking=True,
        enforcement="inject",
        providers={
            "anthropic": ProviderInjection(
                inject_field="thinking.enabled",
                inject_value=True,
                budget_tokens=10000,
            ),
            "openai": ProviderInjection(
                inject_field="reasoning_effort",
                inject_value="medium",
                budget_tokens=10000,
            ),
            "gemini": ProviderInjection(
                inject_field="generationConfig.thinkingConfig.thinkingBudget",
                inject_value=10000,
                budget_tokens=10000,
            ),
        },
        exemptions=[
            ExemptionRule(model_pattern="claude-3-5-haiku*"),
            ExemptionRule(endpoint_pattern="/v1/embeddings"),
            ExemptionRule(agent_pattern="linter-*"),
        ],
        enabled=True,
    )
    defaults.update(overrides)
    return CotPolicy(**defaults)


# -- Policy Loading --

class TestPolicyLoading:
    def test_load_cot_policy_valid_yaml(self, tmp_path):
        yaml_content = """\
        apiVersion: tiresias/v1
        kind: CotPolicy
        metadata:
          name: require-reasoning
          tier: enterprise
        spec:
          require_thinking: true
          enforcement: inject
          providers:
            anthropic:
              inject_field: "thinking.enabled"
              inject_value: true
              budget_tokens: 10000
          exempt:
            - model_pattern: "claude-3-5-haiku*"
            - endpoint_pattern: "/v1/embeddings"
        """
        path = _make_policy_file(str(tmp_path), "valid", yaml_content)
        policy = load_cot_policy(path)

        assert policy is not None
        assert policy.name == "require-reasoning"
        assert policy.enforcement == "inject"
        assert policy.require_thinking is True
        assert "anthropic" in policy.providers
        assert policy.providers["anthropic"].budget_tokens == 10000
        assert len(policy.exemptions) == 2

    def test_load_cot_policy_invalid_kind(self, tmp_path):
        yaml_content = """\
        apiVersion: tiresias/v1
        kind: RateLimitPolicy
        metadata:
          name: wrong-kind
        spec:
          enforcement: inject
        """
        path = _make_policy_file(str(tmp_path), "invalid", yaml_content)
        policy = load_cot_policy(path)
        assert policy is None

    def test_load_cot_policy_wrong_api_version(self, tmp_path):
        yaml_content = """\
        apiVersion: tiresias/v2
        kind: CotPolicy
        metadata:
          name: wrong-version
        spec:
          enforcement: inject
        """
        path = _make_policy_file(str(tmp_path), "wrongver", yaml_content)
        policy = load_cot_policy(path)
        assert policy is None

    def test_load_cot_policies_from_dir(self, tmp_path):
        for i in range(2):
            yaml_content = f"""\
            apiVersion: tiresias/v1
            kind: CotPolicy
            metadata:
              name: policy-{i}
            spec:
              require_thinking: true
              enforcement: inject
            """
            _make_policy_file(str(tmp_path), f"policy{i}", yaml_content)

        policies = load_cot_policies_from_dir(str(tmp_path))
        assert len(policies) == 2

    def test_load_cot_policies_empty_dir(self, tmp_path):
        policies = load_cot_policies_from_dir(str(tmp_path))
        assert len(policies) == 0

    def test_load_cot_policies_nonexistent_dir(self):
        policies = load_cot_policies_from_dir("/tmp/does-not-exist-xyz")
        assert len(policies) == 0


# -- Exemption Checks --

class TestExemptions:
    def test_exemption_model_pattern(self):
        policy = _default_policy()
        assert check_exemption(policy, "claude-3-5-haiku-20241022", "/v1/chat", None) is True

    def test_exemption_endpoint_pattern(self):
        policy = _default_policy()
        assert check_exemption(policy, "claude-opus-4-6", "/v1/embeddings", None) is True

    def test_exemption_agent_pattern(self):
        policy = _default_policy()
        assert check_exemption(policy, "claude-opus-4-6", "/v1/chat", "linter-python") is True

    def test_no_exemption(self):
        policy = _default_policy()
        assert check_exemption(policy, "claude-opus-4-6", "/v1/chat", "my-agent") is False

    def test_no_exemption_no_agent(self):
        policy = _default_policy()
        assert check_exemption(policy, "claude-opus-4-6", "/v1/chat", None) is False


# -- Enforcement Modes --

class TestEnforcementModes:
    def test_enforce_inject_anthropic(self):
        policy = _default_policy(enforcement="inject")
        enforcer = CotEnforcer([policy])
        body = {"model": "claude-opus-4-6", "messages": []}

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")

        assert result.action == "inject"
        assert result.modified_body is not None
        assert result.modified_body["thinking"]["type"] == "enabled"
        assert result.modified_body["thinking"]["budget_tokens"] == 10000
        assert result.cost_injected is True

    def test_enforce_inject_openai(self):
        policy = _default_policy(enforcement="inject")
        enforcer = CotEnforcer([policy])
        body = {"model": "o3-mini", "messages": []}

        result = enforcer.evaluate("openai", body, "o3-mini", "/v1/chat")

        assert result.action == "inject"
        assert result.modified_body is not None
        assert result.modified_body["reasoning_effort"] == "medium"
        assert result.cost_injected is True

    def test_enforce_inject_gemini(self):
        policy = _default_policy(enforcement="inject")
        enforcer = CotEnforcer([policy])
        body = {"model": "gemini-2.0-flash-thinking", "contents": []}

        result = enforcer.evaluate("gemini", body, "gemini-2.0-flash-thinking", "/v1/chat")

        assert result.action == "inject"
        assert result.modified_body is not None
        assert result.modified_body["generationConfig"]["thinkingConfig"]["thinkingBudget"] == 10000
        assert result.cost_injected is True

    def test_enforce_reject(self):
        policy = _default_policy(enforcement="reject")
        enforcer = CotEnforcer([policy])
        body = {"model": "claude-opus-4-6", "messages": []}

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")

        assert result.action == "reject"
        assert result.reason == "cot-policy-violation"
        assert result.modified_body is None

    def test_enforce_warn(self):
        policy = _default_policy(enforcement="warn")
        enforcer = CotEnforcer([policy])
        body = {"model": "claude-opus-4-6", "messages": []}

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")

        assert result.action == "warn"
        assert result.modified_body is None
        assert result.cost_injected is False

    def test_already_has_thinking_anthropic(self):
        policy = _default_policy(enforcement="inject")
        enforcer = CotEnforcer([policy])
        body = {
            "model": "claude-opus-4-6",
            "messages": [],
            "thinking": {"type": "enabled", "budget_tokens": 5000},
        }

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")

        assert result.action == "pass"
        assert result.modified_body is None
        assert result.cost_injected is False

    def test_already_has_thinking_openai(self):
        policy = _default_policy(enforcement="inject")
        enforcer = CotEnforcer([policy])
        body = {"model": "o3-mini", "messages": [], "reasoning_effort": "high"}

        result = enforcer.evaluate("openai", body, "o3-mini", "/v1/chat")

        assert result.action == "pass"
        assert result.cost_injected is False

    def test_already_has_thinking_gemini(self):
        policy = _default_policy(enforcement="inject")
        enforcer = CotEnforcer([policy])
        body = {
            "model": "gemini-2.0-flash",
            "generationConfig": {"thinkingConfig": {"thinkingBudget": 8000}},
        }

        result = enforcer.evaluate("gemini", body, "gemini-2.0-flash", "/v1/chat")

        assert result.action == "pass"
        assert result.cost_injected is False

    def test_exempt_model_passes(self):
        policy = _default_policy(enforcement="reject")
        enforcer = CotEnforcer([policy])
        body = {"model": "claude-3-5-haiku-20241022", "messages": []}

        result = enforcer.evaluate("anthropic", body, "claude-3-5-haiku-20241022", "/v1/chat")

        assert result.action == "exempt"

    def test_exempt_endpoint_passes(self):
        policy = _default_policy(enforcement="reject")
        enforcer = CotEnforcer([policy])
        body = {"model": "text-embedding-3-large", "input": "test"}

        result = enforcer.evaluate("openai", body, "text-embedding-3-large", "/v1/embeddings")

        assert result.action == "exempt"


# -- Cost Tagging --

class TestCostTagging:
    def test_cost_tag_on_inject(self):
        policy = _default_policy(enforcement="inject")
        enforcer = CotEnforcer([policy])
        body = {"model": "claude-opus-4-6", "messages": []}

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")
        assert result.cost_injected is True

    def test_no_cost_tag_on_pass(self):
        policy = _default_policy(enforcement="inject")
        enforcer = CotEnforcer([policy])
        body = {
            "model": "claude-opus-4-6",
            "messages": [],
            "thinking": {"type": "enabled", "budget_tokens": 5000},
        }

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")
        assert result.cost_injected is False

    def test_no_cost_tag_on_reject(self):
        policy = _default_policy(enforcement="reject")
        enforcer = CotEnforcer([policy])
        body = {"model": "claude-opus-4-6", "messages": []}

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")
        assert result.cost_injected is False

    def test_no_cost_tag_on_warn(self):
        policy = _default_policy(enforcement="warn")
        enforcer = CotEnforcer([policy])
        body = {"model": "claude-opus-4-6", "messages": []}

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")
        assert result.cost_injected is False


# -- Immutability --

class TestImmutability:
    def test_inject_does_not_mutate_original(self):
        policy = _default_policy(enforcement="inject")
        enforcer = CotEnforcer([policy])
        original = {"model": "claude-opus-4-6", "messages": [{"role": "user", "content": "hi"}]}

        result = enforcer.evaluate("anthropic", original, "claude-opus-4-6", "/v1/chat")

        assert result.action == "inject"
        assert "thinking" not in original
        assert "thinking" in result.modified_body


# -- No-policy pass-through --

class TestNoPolicy:
    def test_no_policies_returns_pass(self):
        enforcer = CotEnforcer([])
        body = {"model": "claude-opus-4-6", "messages": []}

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")
        assert result.action == "pass"

    def test_disabled_policy_returns_pass(self):
        policy = _default_policy(enabled=False)
        enforcer = CotEnforcer([policy])
        body = {"model": "claude-opus-4-6", "messages": []}

        result = enforcer.evaluate("anthropic", body, "claude-opus-4-6", "/v1/chat")
        assert result.action == "pass"


# -- Missing provider config --

class TestMissingProviderConfig:
    def test_unknown_provider_warns(self):
        policy = _default_policy(enforcement="inject", providers={})
        enforcer = CotEnforcer([policy])
        body = {"model": "local-model", "messages": []}

        result = enforcer.evaluate("local", body, "local-model", "/v1/chat")

        assert result.action == "warn"
        assert "No injection config" in result.reason
