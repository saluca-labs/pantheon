"""
Tests for SoulWatch event processing pipeline.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from soulWatch.src.detection.sigma_engine import SigmaEngine, SigmaRule
from soulWatch.src.detection.playbooks import PlaybookEngine, ResponsePlaybook, PlaybookAction
from soulWatch.src.analytics.baseline import BaselineEngine
from soulWatch.src.analytics.detector import AnomalyDetector


class TestSigmaEngine:
    """Test the Sigma detection rule engine."""

    def test_load_rule_from_yaml(self):
        """Sigma rules should load from YAML strings."""
        engine = SigmaEngine()
        yaml_str = """
title: Test Rule
id: test-rule-001
status: stable
level: high
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type: auth_deny
    decision: deny
  condition: selection
tags:
  - test
enabled: true
"""
        rule = engine.load_rule(yaml_str)
        assert rule.id == "test-rule-001"
        assert rule.title == "Test Rule"
        assert rule.level == "high"
        assert rule.enabled is True

    def test_evaluate_simple_match(self):
        """Events matching a simple selection should trigger."""
        engine = SigmaEngine()
        rule = SigmaRule(
            id="test-001",
            title="Test",
            detection={
                "selection": {
                    "event_type": "auth_deny",
                    "decision": "deny",
                },
                "condition": "selection",
            },
        )
        engine.add_rule(rule)

        event = {"event_type": "auth_deny", "decision": "deny", "soulkey_id": str(uuid.uuid4())}
        matches = engine.evaluate(event)
        assert len(matches) == 1
        assert matches[0].rule.id == "test-001"

    def test_evaluate_no_match(self):
        """Events not matching should not trigger."""
        engine = SigmaEngine()
        rule = SigmaRule(
            id="test-002",
            title="Test",
            detection={
                "selection": {"event_type": "auth_deny"},
                "condition": "selection",
            },
        )
        engine.add_rule(rule)

        event = {"event_type": "auth_grant", "decision": "allow"}
        matches = engine.evaluate(event)
        assert len(matches) == 0

    def test_evaluate_or_condition(self):
        """OR conditions should match if either selection matches."""
        engine = SigmaEngine()
        rule = SigmaRule(
            id="test-003",
            title="Test OR",
            detection={
                "selection_a": {"event_type": "auth_deny"},
                "selection_b": {"event_type": "scope_violation"},
                "condition": "selection_a OR selection_b",
            },
        )
        engine.add_rule(rule)

        event = {"event_type": "scope_violation"}
        matches = engine.evaluate(event)
        assert len(matches) == 1

    def test_evaluate_and_condition(self):
        """AND conditions should only match if all selections match."""
        engine = SigmaEngine()
        rule = SigmaRule(
            id="test-004",
            title="Test AND",
            detection={
                "selection_type": {"event_type": "auth_deny"},
                "selection_decision": {"decision": "deny"},
                "condition": "selection_type AND selection_decision",
            },
        )
        engine.add_rule(rule)

        # Only type matches, not decision
        event = {"event_type": "auth_deny", "decision": "allow"}
        matches = engine.evaluate(event)
        assert len(matches) == 0

        # Both match
        event2 = {"event_type": "auth_deny", "decision": "deny"}
        matches2 = engine.evaluate(event2)
        assert len(matches2) == 1

    def test_evaluate_contains_modifier(self):
        """Contains modifier should do substring matching."""
        engine = SigmaEngine()
        rule = SigmaRule(
            id="test-005",
            title="Test Contains",
            detection={
                "selection": {"reason|contains": "suspended"},
                "condition": "selection",
            },
        )
        engine.add_rule(rule)

        event = {"reason": "Key is suspended by admin"}
        matches = engine.evaluate(event)
        assert len(matches) == 1

    def test_evaluate_startswith_modifier(self):
        """Startswith modifier should match prefix."""
        engine = SigmaEngine()
        rule = SigmaRule(
            id="test-006",
            title="Test Startswith",
            detection={
                "selection": {"resource|startswith": "admin"},
                "condition": "selection",
            },
        )
        engine.add_rule(rule)

        event = {"resource": "admin/settings"}
        matches = engine.evaluate(event)
        assert len(matches) == 1

    def test_evaluate_aggregation(self):
        """Aggregation with count() should track across multiple events."""
        engine = SigmaEngine()
        rule = SigmaRule(
            id="test-007",
            title="Test Aggregation",
            detection={
                "selection": {"event_type": "auth_deny"},
                "condition": "selection | count() > 2",
                "timeframe": "5m",
            },
        )
        engine.add_rule(rule)

        # First two events should not trigger
        for _ in range(2):
            event = {"event_type": "auth_deny", "soulkey_id": "test-agent"}
            matches = engine.evaluate(event)
            assert len(matches) == 0

        # Third event should trigger (count > 2 means 3+)
        event = {"event_type": "auth_deny", "soulkey_id": "test-agent"}
        matches = engine.evaluate(event)
        assert len(matches) == 1

    def test_rule_management(self):
        """Rules can be added, listed, and removed."""
        engine = SigmaEngine()
        rule = SigmaRule(id="mgmt-001", title="Mgmt Test")
        engine.add_rule(rule)

        assert len(engine.list_rules()) == 1
        assert engine.get_rule("mgmt-001") is not None

        removed = engine.remove_rule("mgmt-001")
        assert removed is True
        assert len(engine.list_rules()) == 0

    def test_disabled_rule_not_evaluated(self):
        """Disabled rules should not be evaluated."""
        engine = SigmaEngine()
        rule = SigmaRule(
            id="disabled-001",
            title="Disabled",
            detection={"selection": {"event_type": "auth_deny"}, "condition": "selection"},
            enabled=False,
        )
        engine.add_rule(rule)

        event = {"event_type": "auth_deny"}
        matches = engine.evaluate(event)
        assert len(matches) == 0


class TestPlaybookEngine:
    """Test the playbook execution engine."""

    @pytest.mark.asyncio
    async def test_playbook_execution(self):
        """Playbooks should execute their actions."""
        engine = PlaybookEngine()
        pb = ResponsePlaybook(
            id="test-pb",
            name="Test Playbook",
            trigger_rules=["test-rule"],
            severity_threshold="low",
            actions=[
                PlaybookAction(type="log", params={"message": "Test"}),
            ],
            cooldown_minutes=0,
        )
        engine.add_playbook(pb)

        # Create a fake match
        from soulWatch.src.detection.sigma_engine import SigmaMatch, SigmaRule as SR
        match = SigmaMatch(
            rule=SR(id="test-rule", title="Test", level="high"),
            event={"soulkey_id": str(uuid.uuid4())},
        )

        result = await engine.execute_playbook("test-pb", match)
        assert result.executed is True
        assert len(result.action_results) == 1
        assert result.action_results[0].success is True

    @pytest.mark.asyncio
    async def test_playbook_severity_threshold(self):
        """Playbook should skip if match severity is below threshold."""
        engine = PlaybookEngine()
        pb = ResponsePlaybook(
            id="high-only",
            name="High Only",
            trigger_rules=["test"],
            severity_threshold="high",
            actions=[PlaybookAction(type="log", params={})],
        )
        engine.add_playbook(pb)

        from soulWatch.src.detection.sigma_engine import SigmaMatch, SigmaRule as SR
        match = SigmaMatch(
            rule=SR(id="test", title="Test", level="low"),
            event={},
        )

        result = await engine.execute_playbook("high-only", match)
        assert result.executed is False
        assert "below threshold" in result.skipped_reason

    @pytest.mark.asyncio
    async def test_playbook_cooldown(self):
        """Playbook should respect cooldown period."""
        engine = PlaybookEngine()
        pb = ResponsePlaybook(
            id="cooldown-test",
            name="Cooldown",
            trigger_rules=["test"],
            severity_threshold="low",
            actions=[PlaybookAction(type="log", params={})],
            cooldown_minutes=60,
        )
        engine.add_playbook(pb)

        from soulWatch.src.detection.sigma_engine import SigmaMatch, SigmaRule as SR
        match = SigmaMatch(
            rule=SR(id="test", title="Test", level="high"),
            event={"soulkey_id": "agent-1"},
        )

        # First execution should work
        result1 = await engine.execute_playbook("cooldown-test", match)
        assert result1.executed is True

        # Second should be cooldown-blocked
        result2 = await engine.execute_playbook("cooldown-test", match)
        assert result2.executed is False
        assert "Cooldown" in result2.skipped_reason
