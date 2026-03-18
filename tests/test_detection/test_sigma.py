"""
Tests for the Sigma-compatible detection rule engine and response playbooks.
Covers rule parsing, field matching, logical operators, aggregation,
playbook execution, cooldowns, starter rules, and API endpoints.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import yaml

from src.detection.sigma_engine import (
    SigmaEngine,
    SigmaRule,
    SigmaMatch,
    _match_field,
    _evaluate_selection,
    _parse_timeframe,
)
from src.detection.playbooks import (
    PlaybookEngine,
    ResponsePlaybook,
    PlaybookAction,
    PlaybookResult,
    ActionResult,
    _severity_gte,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def engine():
    return SigmaEngine()


@pytest.fixture
def pb_engine():
    return PlaybookEngine()


@pytest.fixture
def sample_rule_yaml():
    return """
title: Test Rule
id: test-rule-001
status: stable
level: high
description: A test rule for unit testing
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type: auth_deny
    decision: deny
  condition: selection
tags:
  - attack.credential_access
response_playbook: pb-test
enabled: true
"""


@pytest.fixture
def sample_event():
    return {
        "event_type": "auth_deny",
        "decision": "deny",
        "soulkey_id": str(uuid.uuid4()),
        "persona_id": "test-agent",
        "resource": "vault/secrets",
        "action": "read",
        "reason": "key suspended",
        "context": {"source_ip": "10.0.0.1"},
    }


@pytest.fixture
def sample_playbook():
    return ResponsePlaybook(
        id="pb-test",
        name="Test Playbook",
        description="A test playbook",
        trigger_rules=["test-rule-001"],
        severity_threshold="medium",
        actions=[
            PlaybookAction(type="log", params={"message": "Test detection"}),
            PlaybookAction(type="notify", params={"channels": ["slack"]}),
        ],
        cooldown_minutes=5,
        requires_approval=False,
        enabled=True,
    )


@pytest.fixture
def rules_dir(tmp_path):
    """Create a temp directory with sample Sigma rules."""
    rule1 = {
        "title": "Temp Rule 1",
        "id": "tmp-rule-001",
        "status": "stable",
        "level": "high",
        "logsource": {"product": "soulauth", "service": "audit"},
        "detection": {
            "selection": {"event_type": "auth_deny"},
            "condition": "selection",
        },
        "tags": ["test"],
        "enabled": True,
    }
    rule2 = {
        "title": "Temp Rule 2",
        "id": "tmp-rule-002",
        "status": "experimental",
        "level": "medium",
        "logsource": {"product": "soulauth", "service": "audit"},
        "detection": {
            "selection": {"event_type": "key_revoked"},
            "condition": "selection",
        },
        "tags": ["test"],
        "enabled": True,
    }
    (tmp_path / "rule1.yml").write_text(yaml.dump(rule1))
    (tmp_path / "rule2.yml").write_text(yaml.dump(rule2))
    return str(tmp_path)


@pytest.fixture
def playbooks_dir(tmp_path):
    """Create a temp directory with sample playbooks."""
    pb = {
        "id": "pb-tmp-001",
        "name": "Temp Playbook",
        "description": "Test playbook from file",
        "trigger_rules": ["tmp-rule-001"],
        "severity_threshold": "low",
        "actions": [
            {"type": "log", "params": {"message": "triggered"}},
        ],
        "cooldown_minutes": 10,
        "requires_approval": False,
        "enabled": True,
    }
    (tmp_path / "playbook1.yml").write_text(yaml.dump(pb))
    return str(tmp_path)


# ---------------------------------------------------------------------------
# 1. Rule YAML parsing
# ---------------------------------------------------------------------------


class TestRuleParsing:
    def test_parse_yaml_rule(self, engine, sample_rule_yaml):
        """Parse a valid Sigma rule from YAML."""
        rule = engine.load_rule(sample_rule_yaml)
        assert rule.id == "test-rule-001"
        assert rule.title == "Test Rule"
        assert rule.status == "stable"
        assert rule.level == "high"
        assert rule.enabled is True
        assert "attack.credential_access" in rule.tags
        assert rule.response_playbook == "pb-test"
        assert rule.detection["condition"] == "selection"

    def test_parse_minimal_rule(self, engine):
        """Parse a rule with minimal fields."""
        yaml_str = "title: Minimal\ndetection:\n  selection:\n    event_type: auth_deny\n  condition: selection\n"
        rule = engine.load_rule(yaml_str)
        assert rule.title == "Minimal"
        assert rule.status == "experimental"  # default
        assert rule.level == "medium"  # default
        assert rule.enabled is True

    def test_parse_invalid_yaml(self, engine):
        """Parsing invalid YAML raises an error."""
        with pytest.raises(Exception):
            engine.load_rule("not: [valid: yaml: broken")


# ---------------------------------------------------------------------------
# 2. Field matching (exact, contains, startswith, endswith)
# ---------------------------------------------------------------------------


class TestFieldMatching:
    def test_exact_match(self):
        matched, details = _match_field({"event_type": "auth_deny"}, "event_type", "auth_deny")
        assert matched is True
        assert "event_type" in details

    def test_exact_no_match(self):
        matched, _ = _match_field({"event_type": "auth_grant"}, "event_type", "auth_deny")
        assert matched is False

    def test_contains_match(self):
        matched, _ = _match_field({"reason": "key suspended by admin"}, "reason|contains", "suspended")
        assert matched is True

    def test_contains_no_match(self):
        matched, _ = _match_field({"reason": "expired"}, "reason|contains", "suspended")
        assert matched is False

    def test_startswith_match(self):
        matched, _ = _match_field({"resource": "admin/users"}, "resource|startswith", "admin")
        assert matched is True

    def test_startswith_no_match(self):
        matched, _ = _match_field({"resource": "user/profile"}, "resource|startswith", "admin")
        assert matched is False

    def test_endswith_match(self):
        matched, _ = _match_field({"resource": "vault/secrets"}, "resource|endswith", "secrets")
        assert matched is True

    def test_endswith_no_match(self):
        matched, _ = _match_field({"resource": "vault/keys"}, "resource|endswith", "secrets")
        assert matched is False


# ---------------------------------------------------------------------------
# 3. Wildcard matching
# ---------------------------------------------------------------------------


class TestWildcardMatching:
    def test_prefix_wildcard(self):
        matched, _ = _match_field({"resource": "admin/users/list"}, "resource", "admin*")
        assert matched is True

    def test_suffix_wildcard(self):
        matched, _ = _match_field({"resource": "data/export/csv"}, "resource", "*/csv")
        assert matched is True

    def test_wildcard_no_match(self):
        matched, _ = _match_field({"resource": "user/profile"}, "resource", "admin*")
        assert matched is False

    def test_middle_wildcard(self):
        matched, _ = _match_field({"resource": "vault/secrets/key"}, "resource", "vault/*/key")
        assert matched is True


# ---------------------------------------------------------------------------
# 4. List matching (OR)
# ---------------------------------------------------------------------------


class TestListMatching:
    def test_list_match_first(self):
        matched, _ = _match_field({"event_type": "auth_deny"}, "event_type", ["auth_deny", "auth_grant"])
        assert matched is True

    def test_list_match_second(self):
        matched, _ = _match_field({"event_type": "auth_grant"}, "event_type", ["auth_deny", "auth_grant"])
        assert matched is True

    def test_list_no_match(self):
        matched, _ = _match_field({"event_type": "key_issued"}, "event_type", ["auth_deny", "auth_grant"])
        assert matched is False


# ---------------------------------------------------------------------------
# 5. Logical operators (AND, OR, NOT)
# ---------------------------------------------------------------------------


class TestLogicalOperators:
    def test_and_condition(self, engine):
        rule_yaml = """
title: AND test
id: and-test
detection:
  sel1:
    event_type: auth_deny
  sel2:
    decision: deny
  condition: sel1 AND sel2
"""
        rule = engine.load_rule(rule_yaml)
        engine.add_rule(rule)

        matches = engine.evaluate({"event_type": "auth_deny", "decision": "deny"})
        assert len(matches) == 1

        matches = engine.evaluate({"event_type": "auth_deny", "decision": "grant"})
        assert len(matches) == 0

    def test_or_condition(self, engine):
        rule_yaml = """
title: OR test
id: or-test
detection:
  sel1:
    event_type: auth_deny
  sel2:
    event_type: key_revoked
  condition: sel1 OR sel2
"""
        rule = engine.load_rule(rule_yaml)
        engine.add_rule(rule)

        matches = engine.evaluate({"event_type": "auth_deny"})
        assert len(matches) == 1

        matches = engine.evaluate({"event_type": "key_revoked"})
        assert len(matches) == 1

        matches = engine.evaluate({"event_type": "auth_grant"})
        assert len(matches) == 0

    def test_not_condition(self, engine):
        rule_yaml = """
title: NOT test
id: not-test
detection:
  sel1:
    event_type: auth_grant
  condition: NOT sel1
"""
        rule = engine.load_rule(rule_yaml)
        engine.add_rule(rule)

        # NOT auth_grant should match anything that is NOT auth_grant
        matches = engine.evaluate({"event_type": "auth_deny"})
        assert len(matches) == 1

        matches = engine.evaluate({"event_type": "auth_grant"})
        assert len(matches) == 0


# ---------------------------------------------------------------------------
# 6. Numeric comparisons
# ---------------------------------------------------------------------------


class TestNumericComparisons:
    def test_gte_match(self):
        matched, _ = _match_field({"count": 10}, "count|gte", 5)
        assert matched is True

    def test_gte_no_match(self):
        matched, _ = _match_field({"count": 3}, "count|gte", 5)
        assert matched is False

    def test_lte_match(self):
        matched, _ = _match_field({"count": 3}, "count|lte", 5)
        assert matched is True

    def test_lte_no_match(self):
        matched, _ = _match_field({"count": 10}, "count|lte", 5)
        assert matched is False

    def test_gt_match(self):
        matched, _ = _match_field({"count": 6}, "count|gt", 5)
        assert matched is True

    def test_lt_match(self):
        matched, _ = _match_field({"count": 4}, "count|lt", 5)
        assert matched is True


# ---------------------------------------------------------------------------
# 7. Event evaluation against rules
# ---------------------------------------------------------------------------


class TestEventEvaluation:
    def test_basic_evaluation(self, engine, sample_rule_yaml, sample_event):
        rule = engine.load_rule(sample_rule_yaml)
        engine.add_rule(rule)

        matches = engine.evaluate(sample_event)
        assert len(matches) == 1
        assert matches[0].rule.id == "test-rule-001"
        assert matches[0].event == sample_event

    def test_match_contains_details(self, engine, sample_rule_yaml, sample_event):
        rule = engine.load_rule(sample_rule_yaml)
        engine.add_rule(rule)

        matches = engine.evaluate(sample_event)
        assert len(matches) == 1
        assert "event_type" in matches[0].matched_fields


# ---------------------------------------------------------------------------
# 8. No match returns empty
# ---------------------------------------------------------------------------


class TestNoMatch:
    def test_no_matching_rules(self, engine, sample_rule_yaml):
        rule = engine.load_rule(sample_rule_yaml)
        engine.add_rule(rule)

        event = {"event_type": "auth_grant", "decision": "grant"}
        matches = engine.evaluate(event)
        assert len(matches) == 0

    def test_empty_engine(self, engine):
        matches = engine.evaluate({"event_type": "auth_deny"})
        assert len(matches) == 0


# ---------------------------------------------------------------------------
# 9. Multiple rules matching same event
# ---------------------------------------------------------------------------


class TestMultipleRuleMatch:
    def test_two_rules_match_same_event(self, engine):
        rule1_yaml = """
title: Rule 1
id: multi-rule-1
detection:
  selection:
    event_type: auth_deny
  condition: selection
"""
        rule2_yaml = """
title: Rule 2
id: multi-rule-2
detection:
  selection:
    decision: deny
  condition: selection
"""
        engine.add_rule(engine.load_rule(rule1_yaml))
        engine.add_rule(engine.load_rule(rule2_yaml))

        matches = engine.evaluate({"event_type": "auth_deny", "decision": "deny"})
        assert len(matches) == 2
        rule_ids = {m.rule.id for m in matches}
        assert "multi-rule-1" in rule_ids
        assert "multi-rule-2" in rule_ids


# ---------------------------------------------------------------------------
# 10. Playbook loading
# ---------------------------------------------------------------------------


class TestPlaybookLoading:
    def test_load_playbook_from_yaml(self, pb_engine, playbooks_dir):
        count = pb_engine.load_playbooks(playbooks_dir)
        assert count == 1
        assert pb_engine.get_playbook("pb-tmp-001") is not None

    def test_add_playbook_at_runtime(self, pb_engine, sample_playbook):
        pb_engine.add_playbook(sample_playbook)
        assert pb_engine.get_playbook("pb-test") is not None

    def test_list_playbooks(self, pb_engine, sample_playbook):
        pb_engine.add_playbook(sample_playbook)
        pbs = pb_engine.list_playbooks()
        assert len(pbs) == 1
        assert pbs[0].id == "pb-test"


# ---------------------------------------------------------------------------
# 11. Playbook execution
# ---------------------------------------------------------------------------


class TestPlaybookExecution:
    async def test_execute_playbook(self, pb_engine, sample_playbook, engine, sample_rule_yaml, sample_event):
        engine.add_rule(engine.load_rule(sample_rule_yaml))
        pb_engine.add_playbook(sample_playbook)

        matches = engine.evaluate(sample_event)
        assert len(matches) == 1

        result = await pb_engine.execute_playbook("pb-test", matches[0])
        assert result.executed is True
        assert result.playbook_id == "pb-test"
        assert len(result.action_results) == 2
        assert result.action_results[0].action_type == "log"
        assert result.action_results[0].success is True

    async def test_execute_nonexistent_playbook(self, pb_engine, engine, sample_rule_yaml, sample_event):
        engine.add_rule(engine.load_rule(sample_rule_yaml))
        matches = engine.evaluate(sample_event)

        result = await pb_engine.execute_playbook("nonexistent", matches[0])
        assert result.executed is False
        assert "not found" in result.skipped_reason


# ---------------------------------------------------------------------------
# 12. Cooldown enforcement
# ---------------------------------------------------------------------------


class TestCooldownEnforcement:
    async def test_cooldown_blocks_reexecution(self, pb_engine, sample_playbook, engine, sample_rule_yaml, sample_event):
        engine.add_rule(engine.load_rule(sample_rule_yaml))
        pb_engine.add_playbook(sample_playbook)

        matches = engine.evaluate(sample_event)
        result1 = await pb_engine.execute_playbook("pb-test", matches[0])
        assert result1.executed is True

        # Second execution should be blocked by cooldown
        matches2 = engine.evaluate(sample_event)
        result2 = await pb_engine.execute_playbook("pb-test", matches2[0])
        assert result2.executed is False
        assert "Cooldown" in result2.skipped_reason


# ---------------------------------------------------------------------------
# 13. Starter rules load correctly
# ---------------------------------------------------------------------------


class TestStarterRules:
    def test_load_bundled_rules(self, engine):
        rules_dir = os.path.join(os.path.dirname(__file__), "..", "..", "src", "detection", "rules")
        rules_dir = os.path.normpath(rules_dir)
        count = engine.load_rules(rules_dir)
        assert count >= 6, f"Expected at least 6 starter rules, got {count}"

    def test_starter_rule_ids(self, engine):
        rules_dir = os.path.join(os.path.dirname(__file__), "..", "..", "src", "detection", "rules")
        rules_dir = os.path.normpath(rules_dir)
        engine.load_rules(rules_dir)

        expected_ids = {
            "sa-rule-001-credential-stuffing",
            "sa-rule-002-privilege-escalation",
            "sa-rule-003-off-hours-activity",
            "sa-rule-004-data-exfiltration",
            "sa-rule-005-prompt-injection",
            "sa-rule-006-key-abuse",
        }
        loaded_ids = {r.id for r in engine.list_rules()}
        assert expected_ids.issubset(loaded_ids)

    def test_starter_playbooks_load(self, pb_engine):
        pb_dir = os.path.join(os.path.dirname(__file__), "..", "..", "src", "detection", "playbooks")
        pb_dir = os.path.normpath(pb_dir)
        count = pb_engine.load_playbooks(pb_dir)
        assert count >= 3, f"Expected at least 3 starter playbooks, got {count}"


# ---------------------------------------------------------------------------
# 14. API endpoints (list, add, test)
# ---------------------------------------------------------------------------


class TestAPIEndpoints:
    @pytest.fixture
    def client(self):
        """Create a test client with detection engine initialized."""
        from fastapi.testclient import TestClient
        from fastapi import FastAPI

        from src.detection.router import router
        from src.detection._state import init_detection

        app = FastAPI()
        app.include_router(router)

        sigma = SigmaEngine()
        playbook = PlaybookEngine()
        init_detection(sigma, playbook)

        return TestClient(app)

    def test_list_rules_empty(self, client):
        resp = client.get("/v1/detection/rules")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_add_and_list_rule(self, client):
        rule_yaml = """
title: API Test Rule
id: api-test-001
level: high
detection:
  selection:
    event_type: auth_deny
  condition: selection
tags:
  - test
"""
        resp = client.post(
            "/v1/detection/rules",
            content=rule_yaml,
            headers={"Content-Type": "text/yaml"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["id"] == "api-test-001"

        resp = client.get("/v1/detection/rules")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_get_rule_detail(self, client):
        rule_yaml = "title: Detail Rule\nid: detail-001\ndetection:\n  selection:\n    event_type: auth_deny\n  condition: selection\n"
        client.post("/v1/detection/rules", content=rule_yaml, headers={"Content-Type": "text/yaml"})

        resp = client.get("/v1/detection/rules/detail-001")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Detail Rule"

    def test_get_rule_not_found(self, client):
        resp = client.get("/v1/detection/rules/nonexistent")
        assert resp.status_code == 404

    def test_delete_rule(self, client):
        rule_yaml = "title: Delete Me\nid: del-001\ndetection:\n  selection:\n    event_type: x\n  condition: selection\n"
        client.post("/v1/detection/rules", content=rule_yaml, headers={"Content-Type": "text/yaml"})

        resp = client.delete("/v1/detection/rules/del-001")
        assert resp.status_code == 204

        resp = client.get("/v1/detection/rules/del-001")
        assert resp.status_code == 404

    def test_test_rule_match(self, client):
        rule_yaml = "title: Test Match\nid: match-001\ndetection:\n  selection:\n    event_type: auth_deny\n  condition: selection\n"
        client.post("/v1/detection/rules", content=rule_yaml, headers={"Content-Type": "text/yaml"})

        resp = client.post(
            "/v1/detection/rules/match-001/test",
            json={"event": {"event_type": "auth_deny"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["matched"] is True

    def test_test_rule_no_match(self, client):
        rule_yaml = "title: Test No Match\nid: nomatch-001\ndetection:\n  selection:\n    event_type: auth_deny\n  condition: selection\n"
        client.post("/v1/detection/rules", content=rule_yaml, headers={"Content-Type": "text/yaml"})

        resp = client.post(
            "/v1/detection/rules/nomatch-001/test",
            json={"event": {"event_type": "auth_grant"}},
        )
        assert resp.status_code == 200
        assert resp.json()["matched"] is False

    def test_engine_status(self, client):
        resp = client.get("/v1/detection/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "rules_loaded" in data
        assert "matches_last_hour" in data
        assert "detection_enabled" in data


# ---------------------------------------------------------------------------
# 15. Rule enable/disable
# ---------------------------------------------------------------------------


class TestRuleEnableDisable:
    def test_disabled_rule_not_evaluated(self, engine, sample_rule_yaml, sample_event):
        rule = engine.load_rule(sample_rule_yaml)
        rule.enabled = False
        engine.add_rule(rule)

        matches = engine.evaluate(sample_event)
        assert len(matches) == 0

    def test_enable_rule_via_update(self, engine, sample_rule_yaml, sample_event):
        rule = engine.load_rule(sample_rule_yaml)
        rule.enabled = False
        engine.add_rule(rule)

        # Re-enable
        rule.enabled = True
        engine.add_rule(rule)

        matches = engine.evaluate(sample_event)
        assert len(matches) == 1


# ---------------------------------------------------------------------------
# 16. Severity threshold filtering
# ---------------------------------------------------------------------------


class TestSeverityThreshold:
    async def test_below_threshold_skipped(self, pb_engine, engine):
        rule_yaml = """
title: Low Rule
id: low-rule-001
level: low
detection:
  selection:
    event_type: auth_deny
  condition: selection
"""
        rule = engine.load_rule(rule_yaml)
        engine.add_rule(rule)

        pb = ResponsePlaybook(
            id="pb-high-threshold",
            name="High Threshold PB",
            trigger_rules=["low-rule-001"],
            severity_threshold="high",
            actions=[PlaybookAction(type="log", params={})],
            cooldown_minutes=5,
            enabled=True,
        )
        pb_engine.add_playbook(pb)

        matches = engine.evaluate({"event_type": "auth_deny"})
        assert len(matches) == 1

        result = await pb_engine.execute_playbook("pb-high-threshold", matches[0])
        assert result.executed is False
        assert "below threshold" in result.skipped_reason.lower()

    async def test_at_threshold_executes(self, pb_engine, engine):
        rule_yaml = """
title: High Rule
id: high-rule-001
level: high
detection:
  selection:
    event_type: auth_deny
  condition: selection
"""
        rule = engine.load_rule(rule_yaml)
        engine.add_rule(rule)

        pb = ResponsePlaybook(
            id="pb-med-threshold",
            name="Med Threshold PB",
            trigger_rules=["high-rule-001"],
            severity_threshold="medium",
            actions=[PlaybookAction(type="log", params={})],
            cooldown_minutes=5,
            enabled=True,
        )
        pb_engine.add_playbook(pb)

        matches = engine.evaluate({"event_type": "auth_deny"})
        result = await pb_engine.execute_playbook("pb-med-threshold", matches[0])
        assert result.executed is True


# ---------------------------------------------------------------------------
# 17. Aggregation with timeframe
# ---------------------------------------------------------------------------


class TestAggregation:
    def test_aggregation_below_threshold(self, engine):
        rule_yaml = """
title: Count Rule
id: count-rule-001
level: high
detection:
  selection:
    event_type: auth_deny
  condition: selection | count() > 3
  timeframe: 5m
"""
        engine.add_rule(engine.load_rule(rule_yaml))

        # First few events should not trigger
        for _ in range(3):
            matches = engine.evaluate({"event_type": "auth_deny", "soulkey_id": "agent-1"})
        assert len(matches) == 0

    def test_aggregation_above_threshold(self, engine):
        rule_yaml = """
title: Count Rule Trigger
id: count-rule-002
level: high
detection:
  selection:
    event_type: auth_deny
  condition: selection | count() > 3
  timeframe: 5m
"""
        engine.add_rule(engine.load_rule(rule_yaml))

        for _ in range(4):
            matches = engine.evaluate({"event_type": "auth_deny", "soulkey_id": "agent-2"})

        assert len(matches) == 1
        assert "_aggregation" in matches[0].matched_fields


# ---------------------------------------------------------------------------
# 18. Timeframe parsing
# ---------------------------------------------------------------------------


class TestTimeframeParsing:
    def test_parse_minutes(self):
        td = _parse_timeframe("5m")
        assert td == timedelta(minutes=5)

    def test_parse_seconds(self):
        td = _parse_timeframe("30s")
        assert td == timedelta(seconds=30)

    def test_parse_hours(self):
        td = _parse_timeframe("1h")
        assert td == timedelta(hours=1)

    def test_parse_days(self):
        td = _parse_timeframe("7d")
        assert td == timedelta(days=7)

    def test_parse_invalid(self):
        td = _parse_timeframe("invalid")
        assert td is None


# ---------------------------------------------------------------------------
# 19. Load rules from directory
# ---------------------------------------------------------------------------


class TestDirectoryLoading:
    def test_load_rules_from_dir(self, engine, rules_dir):
        count = engine.load_rules(rules_dir)
        assert count == 2
        assert engine.get_rule("tmp-rule-001") is not None
        assert engine.get_rule("tmp-rule-002") is not None

    def test_load_nonexistent_dir(self, engine):
        count = engine.load_rules("/nonexistent/path")
        assert count == 0


# ---------------------------------------------------------------------------
# 20. Rule removal
# ---------------------------------------------------------------------------


class TestRuleRemoval:
    def test_remove_existing_rule(self, engine, sample_rule_yaml):
        rule = engine.load_rule(sample_rule_yaml)
        engine.add_rule(rule)
        assert len(engine.list_rules()) == 1

        removed = engine.remove_rule("test-rule-001")
        assert removed is True
        assert len(engine.list_rules()) == 0

    def test_remove_nonexistent_rule(self, engine):
        removed = engine.remove_rule("nonexistent")
        assert removed is False


# ---------------------------------------------------------------------------
# 21. Playbook requires approval
# ---------------------------------------------------------------------------


class TestApprovalRequired:
    async def test_approval_required_queues(self, pb_engine, engine, sample_event):
        rule_yaml = """
title: Approval Rule
id: approval-rule-001
level: critical
detection:
  selection:
    event_type: auth_deny
  condition: selection
"""
        engine.add_rule(engine.load_rule(rule_yaml))

        pb = ResponsePlaybook(
            id="pb-approval",
            name="Approval PB",
            trigger_rules=["approval-rule-001"],
            severity_threshold="low",
            actions=[PlaybookAction(type="quarantine", params={})],
            cooldown_minutes=5,
            requires_approval=True,
            enabled=True,
        )
        pb_engine.add_playbook(pb)

        matches = engine.evaluate(sample_event)
        result = await pb_engine.execute_playbook("pb-approval", matches[0])
        assert result.executed is False
        assert result.requires_approval is True
        assert "approval" in result.skipped_reason.lower()


# ---------------------------------------------------------------------------
# 22. Severity utility
# ---------------------------------------------------------------------------


class TestSeverityUtility:
    def test_severity_ordering(self):
        assert _severity_gte("critical", "low") is True
        assert _severity_gte("low", "critical") is False
        assert _severity_gte("medium", "medium") is True
        assert _severity_gte("high", "medium") is True
        assert _severity_gte("informational", "low") is False


# ---------------------------------------------------------------------------
# 23. Engine status
# ---------------------------------------------------------------------------


class TestEngineStatus:
    def test_status_report(self, engine, sample_rule_yaml):
        engine.add_rule(engine.load_rule(sample_rule_yaml))
        status = engine.get_status()
        assert status["rules_loaded"] == 1
        assert status["rules_enabled"] == 1
        assert "rules_by_level" in status
        assert status["rules_by_level"]["high"] == 1


# ---------------------------------------------------------------------------
# 24. Nested field access
# ---------------------------------------------------------------------------


class TestNestedFieldAccess:
    def test_dot_notation(self):
        event = {"context": {"source_ip": "10.0.0.1"}}
        matched, _ = _match_field(event, "context.source_ip", "10.0.0.1")
        assert matched is True

    def test_missing_nested_field(self):
        event = {"context": {}}
        matched, _ = _match_field(event, "context.source_ip", "10.0.0.1")
        assert matched is False
