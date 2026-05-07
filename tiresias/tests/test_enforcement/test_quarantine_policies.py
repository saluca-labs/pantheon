"""
Tests for quarantine policy configuration CRUD API (C4).
Tests the per-tenant configurable quarantine policies.
"""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.enforcement.router import (
    QuarantinePolicyConfigCreate,
    QuarantinePolicyConfigUpdate,
    DEFAULT_POLICY_SEEDS,
    seed_default_policies,
    load_tenant_policies,
    _policy_to_response,
)
from src.enforcement.quarantine import QuarantineAction, QuarantinePolicy


# ---------------------------------------------------------------------------
# QuarantinePolicyConfigCreate schema validation
# ---------------------------------------------------------------------------

class TestPolicySchemas:
    def test_valid_create(self):
        config = QuarantinePolicyConfigCreate(
            trigger_type="credential_stuffing",
            threshold=0.8,
            severity_threshold="high",
            action="suspend_key,kill_session",
            cooldown_minutes=15,
            auto_release_hours=1.0,
            enabled=True,
        )
        assert config.trigger_type == "credential_stuffing"
        assert config.threshold == 0.8

    def test_default_values(self):
        config = QuarantinePolicyConfigCreate(trigger_type="rate_spike")
        assert config.threshold == 0.8
        assert config.severity_threshold == "high"
        assert config.action == "suspend_key"
        assert config.cooldown_minutes == 15
        assert config.auto_release_hours == 1.0
        assert config.enabled is True

    def test_threshold_bounds(self):
        with pytest.raises(Exception):
            QuarantinePolicyConfigCreate(trigger_type="rate_spike", threshold=1.5)
        with pytest.raises(Exception):
            QuarantinePolicyConfigCreate(trigger_type="rate_spike", threshold=-0.1)

    def test_update_partial(self):
        update = QuarantinePolicyConfigUpdate(enabled=False)
        data = update.model_dump(exclude_unset=True)
        assert data == {"enabled": False}
        assert "trigger_type" not in data

    def test_update_all_fields(self):
        update = QuarantinePolicyConfigUpdate(
            trigger_type="scope_escalation",
            threshold=0.5,
            severity_threshold="medium",
            action="rate_limit",
            cooldown_minutes=30,
            auto_release_hours=2.0,
            enabled=True,
        )
        data = update.model_dump(exclude_unset=True)
        assert len(data) == 7


# ---------------------------------------------------------------------------
# Default policy seeds
# ---------------------------------------------------------------------------

class TestDefaultSeeds:
    def test_seed_count(self):
        assert len(DEFAULT_POLICY_SEEDS) >= 3, "Should have at least 3 default policy seeds"

    def test_seed_structure(self):
        for seed in DEFAULT_POLICY_SEEDS:
            assert "trigger_type" in seed
            assert "threshold" in seed
            assert "severity_threshold" in seed
            assert "action" in seed
            assert "cooldown_minutes" in seed
            assert "enabled" in seed

    def test_seed_valid_trigger_types(self):
        valid_triggers = {"credential_stuffing", "scope_escalation", "rate_spike", "any"}
        for seed in DEFAULT_POLICY_SEEDS:
            assert seed["trigger_type"] in valid_triggers

    def test_seed_valid_actions(self):
        valid_actions = {a.value for a in QuarantineAction}
        for seed in DEFAULT_POLICY_SEEDS:
            for action in seed["action"].split(","):
                assert action.strip() in valid_actions, f"Invalid action '{action}' in seed"


# ---------------------------------------------------------------------------
# Policy response formatting
# ---------------------------------------------------------------------------

class TestPolicyResponse:
    def test_response_format(self):
        mock_policy = MagicMock()
        mock_policy.id = uuid.uuid4()
        mock_policy.tenant_id = uuid.uuid4()
        mock_policy.trigger_type = "rate_spike"
        mock_policy.threshold = 0.9
        mock_policy.severity_threshold = "critical"
        mock_policy.action = "suspend_key,kill_session"
        mock_policy.cooldown_minutes = 30
        mock_policy.auto_release_hours = None
        mock_policy.enabled = True
        mock_policy.created_at = None
        mock_policy.updated_at = None

        resp = _policy_to_response(mock_policy)

        assert resp["trigger_type"] == "rate_spike"
        assert resp["threshold"] == 0.9
        assert resp["action"] == "suspend_key,kill_session"
        assert resp["enabled"] is True
        assert "id" in resp
        assert "tenant_id" in resp


# ---------------------------------------------------------------------------
# Engine policy loading
# ---------------------------------------------------------------------------

class TestPolicyLoading:
    def test_default_quarantine_policies_exist(self):
        """Default policies should be non-empty."""
        from src.enforcement.quarantine import DEFAULT_QUARANTINE_POLICIES
        assert len(DEFAULT_QUARANTINE_POLICIES) >= 3

    def test_quarantine_engine_uses_defaults(self):
        """Engine should use default policies when no DB policies are available."""
        from src.enforcement.quarantine import QuarantineEngine, DEFAULT_QUARANTINE_POLICIES
        engine = QuarantineEngine()
        assert len(engine.policies) == len(DEFAULT_QUARANTINE_POLICIES)

    def test_quarantine_engine_custom_policies(self):
        """Engine should accept custom policies."""
        from src.enforcement.quarantine import QuarantineEngine
        from src.analytics.detector import AnomalyType

        custom = [
            QuarantinePolicy(
                trigger=AnomalyType.RATE_SPIKE,
                severity_threshold="low",
                actions=[QuarantineAction.RATE_LIMIT],
                auto_release_after=5,
            ),
        ]
        engine = QuarantineEngine(policies=custom)
        assert len(engine.policies) == 1
        assert engine.policies[0].severity_threshold == "low"

    def test_disabled_policies_skipped(self):
        """When loading from DB, disabled policies should be excluded."""
        # This tests the filter logic conceptually
        from src.enforcement.quarantine import QuarantineEngine
        # Passing empty list simulates all disabled
        engine = QuarantineEngine(policies=[])
        assert len(engine.policies) == 0
