"""
Tests for model routing policy enforcement.

Tests:
- Policy parsing from YAML
- resolve_models_for_task with various scenarios
- Forbidden model rejection (strict + advisory)
- Required model enforcement
- Task type fallback to defaults
- Cost budget enforcement
- PDP evaluate_model_access integration
"""

import os

# Set test environment BEFORE any soulauth imports
os.environ.setdefault("SOULAUTH_MODE", "local")
os.environ.setdefault("SOULAUTH_TESTING", "true")
os.environ.setdefault("SOULAUTH_DEBUG", "true")

import sys
import uuid
import pytest
import yaml
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

# Ensure src is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from src.policy.loader import (
    ModelPolicy,
    ModelPolicyViolation,
    TaskModelRule,
    ResolvedPolicy,
    load_policy_file,
    resolve_policy,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ALFRED_POLICY_PATH = Path(__file__).resolve().parent.parent.parent / "policies" / "tenants" / "saluca" / "personas" / "alfred.yaml"
NANOCLAW_POLICY_PATH = Path(__file__).resolve().parent.parent.parent / "policies" / "tenants" / "saluca" / "personas" / "nanoclaw.yaml"
ROBOT_BRAIN_POLICY_PATH = Path(__file__).resolve().parent.parent.parent / "policies" / "tenants" / "saluca" / "personas" / "robot_brain.yaml"


@pytest.fixture
def alfred_policy_data():
    return load_policy_file(str(ALFRED_POLICY_PATH))


@pytest.fixture
def nanoclaw_policy_data():
    return load_policy_file(str(NANOCLAW_POLICY_PATH))


@pytest.fixture
def robot_brain_policy_data():
    return load_policy_file(str(ROBOT_BRAIN_POLICY_PATH))


@pytest.fixture
def alfred_model_policy(alfred_policy_data):
    return ModelPolicy(alfred_policy_data["spec"]["model_policies"])


@pytest.fixture
def nanoclaw_model_policy(nanoclaw_policy_data):
    return ModelPolicy(nanoclaw_policy_data["spec"]["model_policies"])


@pytest.fixture
def advisory_model_policy():
    """A model policy in advisory mode (log-only, no denials)."""
    return ModelPolicy({
        "default_models": ["claude-sonnet-4-20250514"],
        "task_routing": {
            "code_generation": {
                "allowed": ["claude-sonnet-4-20250514"],
                "preferred": "claude-sonnet-4-20250514",
            },
        },
        "forbidden_models": ["gpt-3.5-turbo"],
        "enforcement": "advisory",
    })


# ---------------------------------------------------------------------------
# YAML Parsing Tests
# ---------------------------------------------------------------------------

class TestPolicyParsing:
    """Test that YAML policy files parse correctly into ModelPolicy objects."""

    def test_alfred_yaml_loads(self, alfred_policy_data):
        assert alfred_policy_data["metadata"]["persona"] == "alfred"
        assert "model_policies" in alfred_policy_data["spec"]

    def test_alfred_model_policy_fields(self, alfred_model_policy):
        mp = alfred_model_policy
        assert "claude-opus-4-20250514" in mp.default_models
        assert "claude-sonnet-4-20250514" in mp.default_models
        assert "gpt-3.5-turbo" in mp.forbidden_models
        assert mp.enforcement == "strict"
        assert mp.cost_budget is not None
        assert mp.cost_budget["daily_limit_usd"] == 50.0
        assert mp.cost_budget["per_request_max_usd"] == 2.0

    def test_alfred_task_routing(self, alfred_model_policy):
        mp = alfred_model_policy
        assert "reasoning" in mp.task_routing
        assert "code_generation" in mp.task_routing
        assert "vision" in mp.task_routing
        assert "simulation" in mp.task_routing

        reasoning = mp.task_routing["reasoning"]
        assert reasoning.required == ["claude-opus-4-20250514"]
        assert reasoning.task_type == "reasoning"

        vision = mp.task_routing["vision"]
        assert vision.preferred == "gemini-2.5-flash"
        assert "gemini-2.5-flash" in vision.allowed

    def test_nanoclaw_forbidden_opus(self, nanoclaw_model_policy):
        mp = nanoclaw_model_policy
        assert "claude-opus-4-20250514" in mp.forbidden_models
        assert "gpt-4o" in mp.forbidden_models

    def test_robot_brain_limited_models(self, robot_brain_policy_data):
        mp = ModelPolicy(robot_brain_policy_data["spec"]["model_policies"])
        assert "claude-opus-4-20250514" in mp.forbidden_models
        assert "claude-sonnet-4-20250514" in mp.forbidden_models
        assert mp.cost_budget["daily_limit_usd"] == 5.0

    def test_resolved_policy_includes_model_policies(self, alfred_policy_data):
        resolved = resolve_policy(alfred_policy_data, {})
        assert resolved.model_policies is not None
        assert isinstance(resolved.model_policies, ModelPolicy)
        assert "claude-opus-4-20250514" in resolved.model_policies.default_models

    def test_resolved_policy_to_dict_includes_model_policies(self, alfred_policy_data):
        resolved = resolve_policy(alfred_policy_data, {})
        d = resolved.to_dict()
        assert d["spec"]["model_policies"] is not None
        assert "default_models" in d["spec"]["model_policies"]
        assert "task_routing" in d["spec"]["model_policies"]

    def test_resolved_policy_no_model_policies(self):
        """A policy without model_policies should have model_policies=None."""
        data = {
            "metadata": {"tenant": "test", "persona": "basic", "role": "viewer"},
            "spec": {"resources": {}},
        }
        resolved = resolve_policy(data, {})
        assert resolved.model_policies is None


# ---------------------------------------------------------------------------
# resolve_models_for_task Tests
# ---------------------------------------------------------------------------

class TestResolveModelsForTask:
    """Test the core model resolution logic."""

    def test_auto_select_preferred(self, alfred_model_policy):
        model, reason = alfred_model_policy.resolve_models_for_task("code_generation")
        assert model == "claude-sonnet-4-20250514"
        assert reason == "auto_selected"

    def test_auto_select_required(self, alfred_model_policy):
        model, reason = alfred_model_policy.resolve_models_for_task("reasoning")
        assert model == "claude-opus-4-20250514"
        # required tasks with no preferred should auto-select from required
        assert reason == "auto_selected"

    def test_allowed_model_passes(self, alfred_model_policy):
        model, reason = alfred_model_policy.resolve_models_for_task(
            "code_generation", "claude-opus-4-20250514"
        )
        assert model == "claude-opus-4-20250514"
        assert reason == "allowed"

    def test_unknown_task_uses_default(self, alfred_model_policy):
        model, reason = alfred_model_policy.resolve_models_for_task(
            "unknown_task", "claude-sonnet-4-20250514"
        )
        assert model == "claude-sonnet-4-20250514"
        assert reason == "default_policy"

    def test_unknown_task_no_request_uses_first_default(self, alfred_model_policy):
        model, reason = alfred_model_policy.resolve_models_for_task("unknown_task")
        assert model == "claude-opus-4-20250514"  # first in default_models
        assert reason == "default_policy"

    def test_preferred_auto_selection(self, alfred_model_policy):
        model, reason = alfred_model_policy.resolve_models_for_task("vision")
        assert model == "gemini-2.5-flash"
        assert reason == "auto_selected"


# ---------------------------------------------------------------------------
# Forbidden Model Tests
# ---------------------------------------------------------------------------

class TestForbiddenModels:
    """Test forbidden model enforcement in strict and advisory modes."""

    def test_forbidden_strict_raises(self, alfred_model_policy):
        with pytest.raises(ModelPolicyViolation, match="forbidden"):
            alfred_model_policy.resolve_models_for_task("code_generation", "gpt-3.5-turbo")

    def test_forbidden_strict_unknown_task_raises(self, alfred_model_policy):
        with pytest.raises(ModelPolicyViolation, match="forbidden"):
            alfred_model_policy.resolve_models_for_task("unknown_task", "gpt-3.5-turbo")

    def test_forbidden_advisory_redirects(self, advisory_model_policy):
        model, reason = advisory_model_policy.resolve_models_for_task(
            "unknown_task", "gpt-3.5-turbo"
        )
        assert model == "claude-sonnet-4-20250514"  # redirected to default
        assert reason == "forbidden_override"

    def test_nanoclaw_cannot_use_opus(self, nanoclaw_model_policy):
        with pytest.raises(ModelPolicyViolation, match="forbidden"):
            nanoclaw_model_policy.resolve_models_for_task(
                "code_generation", "claude-opus-4-20250514"
            )


# ---------------------------------------------------------------------------
# Required Model Tests
# ---------------------------------------------------------------------------

class TestRequiredModels:
    """Test required model enforcement."""

    def test_required_wrong_model_strict_raises(self, alfred_model_policy):
        """reasoning requires opus -- requesting sonnet should raise."""
        with pytest.raises(ModelPolicyViolation, match="requires"):
            alfred_model_policy.resolve_models_for_task(
                "reasoning", "claude-sonnet-4-20250514"
            )

    def test_required_correct_model_passes(self, alfred_model_policy):
        model, reason = alfred_model_policy.resolve_models_for_task(
            "reasoning", "claude-opus-4-20250514"
        )
        assert model == "claude-opus-4-20250514"
        assert reason == "required"

    def test_required_advisory_redirects(self):
        mp = ModelPolicy({
            "default_models": ["claude-sonnet-4-20250514"],
            "task_routing": {
                "reasoning": {
                    "required": ["claude-opus-4-20250514"],
                },
            },
            "forbidden_models": [],
            "enforcement": "advisory",
        })
        model, reason = mp.resolve_models_for_task("reasoning", "claude-sonnet-4-20250514")
        assert model == "claude-opus-4-20250514"
        assert reason == "required_override"


# ---------------------------------------------------------------------------
# Task Fallback Tests
# ---------------------------------------------------------------------------

class TestTaskFallback:
    """Test fallback behavior when task_type is missing or unknown."""

    def test_no_task_type_uses_default(self, alfred_model_policy):
        model, reason = alfred_model_policy.resolve_models_for_task("")
        assert model == "claude-opus-4-20250514"
        assert reason == "default_policy"

    def test_none_task_type_uses_default(self, alfred_model_policy):
        # Empty string task_type won't match any routing rule
        model, reason = alfred_model_policy.resolve_models_for_task(
            "", "claude-sonnet-4-20250514"
        )
        assert model == "claude-sonnet-4-20250514"
        assert reason == "default_policy"


# ---------------------------------------------------------------------------
# Cost Budget Tests
# ---------------------------------------------------------------------------

class TestCostBudget:
    """Test cost budget fields are parsed correctly."""

    def test_cost_budget_parsed(self, alfred_model_policy):
        assert alfred_model_policy.cost_budget is not None
        assert alfred_model_policy.cost_budget["daily_limit_usd"] == 50.0
        assert alfred_model_policy.cost_budget["per_request_max_usd"] == 2.0

    def test_nanoclaw_cost_budget(self, nanoclaw_model_policy):
        assert nanoclaw_model_policy.cost_budget["daily_limit_usd"] == 10.0
        assert nanoclaw_model_policy.cost_budget["per_request_max_usd"] == 0.50

    def test_no_cost_budget(self):
        mp = ModelPolicy({
            "default_models": ["test-model"],
            "task_routing": {},
            "forbidden_models": [],
        })
        assert mp.cost_budget is None


# ---------------------------------------------------------------------------
# ModelPolicy.to_dict Tests
# ---------------------------------------------------------------------------

class TestModelPolicyToDict:
    """Test serialization round-trip."""

    def test_to_dict_round_trip(self, alfred_model_policy):
        d = alfred_model_policy.to_dict()
        mp2 = ModelPolicy(d)
        assert mp2.default_models == alfred_model_policy.default_models
        assert mp2.forbidden_models == alfred_model_policy.forbidden_models
        assert mp2.enforcement == alfred_model_policy.enforcement
        assert set(mp2.task_routing.keys()) == set(alfred_model_policy.task_routing.keys())

    def test_to_dict_includes_required(self, alfred_model_policy):
        d = alfred_model_policy.to_dict()
        assert "required" in d["task_routing"]["reasoning"]
        assert d["task_routing"]["reasoning"]["required"] == ["claude-opus-4-20250514"]

    def test_to_dict_includes_preferred(self, alfred_model_policy):
        d = alfred_model_policy.to_dict()
        assert d["task_routing"]["code_generation"]["preferred"] == "claude-sonnet-4-20250514"


# ---------------------------------------------------------------------------
# PDP evaluate_model_access Integration Tests (mocked DB)
# ---------------------------------------------------------------------------

class TestEvaluateModelAccess:
    """Test the PDP evaluate_model_access function with mocked dependencies."""

    @pytest.fixture
    def mock_soulkey(self):
        sk = MagicMock()
        sk.id = uuid.uuid4()
        sk.tenant_id = uuid.uuid4()
        sk.persona_id = "alfred"
        sk.status = "active"
        return sk

    @pytest.fixture
    def mock_policy_with_models(self):
        data = load_policy_file(str(ALFRED_POLICY_PATH))
        return resolve_policy(data, {})

    @pytest.mark.asyncio
    async def test_grant_allowed_model(self, mock_soulkey, mock_policy_with_models):
        from src.auth.pdp import evaluate_model_access

        mock_db = AsyncMock()

        with patch("src.auth.pdp.resolve_identity", return_value=mock_soulkey) as mock_resolve, \
             patch("src.auth.pdp.check_key_expiry", return_value=True), \
             patch("src.auth.pdp.load_cached_policy", return_value=mock_policy_with_models), \
             patch("src.auth.pdp.log_auth_event", return_value=uuid.uuid4()):

            decision = await evaluate_model_access(
                db=mock_db,
                raw_soulkey="sk_test_abc",
                requested_model="claude-sonnet-4-20250514",
                task_type="code_generation",
            )

            assert decision.decision == "grant"
            assert decision.resolved_model == "claude-sonnet-4-20250514"

    @pytest.mark.asyncio
    async def test_deny_forbidden_model(self, mock_soulkey, mock_policy_with_models):
        from src.auth.pdp import evaluate_model_access

        mock_db = AsyncMock()

        with patch("src.auth.pdp.resolve_identity", return_value=mock_soulkey), \
             patch("src.auth.pdp.check_key_expiry", return_value=True), \
             patch("src.auth.pdp.load_cached_policy", return_value=mock_policy_with_models), \
             patch("src.auth.pdp.log_auth_event", return_value=uuid.uuid4()):

            decision = await evaluate_model_access(
                db=mock_db,
                raw_soulkey="sk_test_abc",
                requested_model="gpt-3.5-turbo",
                task_type="code_generation",
            )

            assert decision.decision == "deny"
            assert "forbidden" in decision.reason.lower()

    @pytest.mark.asyncio
    async def test_redirect_non_allowed_model(self, mock_soulkey, mock_policy_with_models):
        from src.auth.pdp import evaluate_model_access

        mock_db = AsyncMock()

        with patch("src.auth.pdp.resolve_identity", return_value=mock_soulkey), \
             patch("src.auth.pdp.check_key_expiry", return_value=True), \
             patch("src.auth.pdp.load_cached_policy", return_value=mock_policy_with_models), \
             patch("src.auth.pdp.log_auth_event", return_value=uuid.uuid4()):

            # Request haiku for code_generation (not in allowed list)
            decision = await evaluate_model_access(
                db=mock_db,
                raw_soulkey="sk_test_abc",
                requested_model="claude-haiku-4-5-20251001",
                task_type="code_generation",
            )

            # Strict mode: should deny (not in allowed list for code_generation)
            assert decision.decision == "deny"

    @pytest.mark.asyncio
    async def test_deny_unknown_soulkey(self):
        from src.auth.pdp import evaluate_model_access

        mock_db = AsyncMock()

        with patch("src.auth.pdp.resolve_identity", return_value=None):
            decision = await evaluate_model_access(
                db=mock_db,
                raw_soulkey="sk_unknown",
                requested_model="claude-sonnet-4-20250514",
            )

            assert decision.decision == "deny"
            assert "unknown soulkey" in decision.reason

    @pytest.mark.asyncio
    async def test_no_model_policy_allows_all(self, mock_soulkey):
        from src.auth.pdp import evaluate_model_access

        mock_db = AsyncMock()
        # Policy without model_policies
        policy_no_models = resolve_policy(
            {"metadata": {"tenant": "t", "persona": "p", "role": "r"}, "spec": {"resources": {}}},
            {},
        )

        with patch("src.auth.pdp.resolve_identity", return_value=mock_soulkey), \
             patch("src.auth.pdp.check_key_expiry", return_value=True), \
             patch("src.auth.pdp.load_cached_policy", return_value=policy_no_models), \
             patch("src.auth.pdp.log_auth_event", return_value=uuid.uuid4()):

            decision = await evaluate_model_access(
                db=mock_db,
                raw_soulkey="sk_test_abc",
                requested_model="any-model-at-all",
            )

            assert decision.decision == "grant"
            assert decision.enforcement_mode == "none"

    @pytest.mark.asyncio
    async def test_cost_per_request_deny(self, mock_soulkey, mock_policy_with_models):
        from src.auth.pdp import evaluate_model_access

        mock_db = AsyncMock()

        with patch("src.auth.pdp.resolve_identity", return_value=mock_soulkey), \
             patch("src.auth.pdp.check_key_expiry", return_value=True), \
             patch("src.auth.pdp.load_cached_policy", return_value=mock_policy_with_models), \
             patch("src.auth.pdp.log_auth_event", return_value=uuid.uuid4()):

            # Alfred's per-request max is $2.00
            decision = await evaluate_model_access(
                db=mock_db,
                raw_soulkey="sk_test_abc",
                requested_model="claude-opus-4-20250514",
                task_type="reasoning",
                estimated_cost_usd=5.00,  # exceeds $2.00 limit
            )

            assert decision.decision == "deny"
            assert "per-request max" in decision.reason

    @pytest.mark.asyncio
    async def test_cost_daily_budget_deny(self, mock_soulkey, mock_policy_with_models):
        from src.auth.pdp import evaluate_model_access

        mock_db = AsyncMock()

        with patch("src.auth.pdp.resolve_identity", return_value=mock_soulkey), \
             patch("src.auth.pdp.check_key_expiry", return_value=True), \
             patch("src.auth.pdp.load_cached_policy", return_value=mock_policy_with_models), \
             patch("src.auth.pdp.log_auth_event", return_value=uuid.uuid4()), \
             patch("src.auth.pdp._get_daily_model_spend", return_value=49.50):

            # Alfred's daily limit is $50.00, already spent $49.50
            decision = await evaluate_model_access(
                db=mock_db,
                raw_soulkey="sk_test_abc",
                requested_model="claude-opus-4-20250514",
                task_type="reasoning",
                estimated_cost_usd=1.00,  # would exceed $50.00
            )

            assert decision.decision == "deny"
            assert "budget" in decision.reason.lower() or "daily" in decision.reason.lower()
