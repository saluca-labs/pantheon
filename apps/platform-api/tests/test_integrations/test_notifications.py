"""
Tests for enterprise notification sinks.
"""

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.analytics.detector import (
    Anomaly,
    AnomalyType,
    SEVERITY_LOW,
    SEVERITY_MEDIUM,
    SEVERITY_HIGH,
    SEVERITY_CRITICAL,
)
from src.integrations.notifications import (
    PagerDutyAlertSink,
    SlackAlertSink,
    TeamsAlertSink,
    OpsGenieAlertSink,
    EmailAlertSink,
    SNSAlertSink,
    NotificationRouter,
    _dedup_key,
    _PAGERDUTY_SEVERITY_MAP,
    _SLACK_COLOR_MAP,
    _OPSGENIE_PRIORITY_MAP,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def sample_anomaly():
    return Anomaly(
        type=AnomalyType.RATE_SPIKE,
        severity=SEVERITY_HIGH,
        soulkey_id=uuid.UUID("12345678-1234-5678-1234-567812345678"),
        description="Request rate exceeded 3x baseline",
        evidence={"baseline_rpm": 10, "observed_rpm": 35},
        timestamp=datetime(2026, 3, 17, 12, 0, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def critical_anomaly():
    return Anomaly(
        type=AnomalyType.SCOPE_ESCALATION,
        severity=SEVERITY_CRITICAL,
        soulkey_id=uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
        description="Agent escalated to admin scope",
        evidence={"previous_scope": "read", "new_scope": "admin", "tenant_id": "tenant-42"},
        timestamp=datetime(2026, 3, 17, 13, 0, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def low_anomaly():
    return Anomaly(
        type=AnomalyType.OFF_HOURS,
        severity=SEVERITY_LOW,
        soulkey_id=uuid.UUID("11111111-2222-3333-4444-555555555555"),
        description="Activity outside normal hours",
        evidence={},
        timestamp=datetime(2026, 3, 17, 3, 0, 0, tzinfo=timezone.utc),
    )


class _FakeSink:
    """In-memory sink for testing the router."""

    def __init__(self, should_fail: bool = False):
        self.alerts: list[Anomaly] = []
        self.should_fail = should_fail

    async def send_alert(self, anomaly: Anomaly) -> None:
        if self.should_fail:
            raise RuntimeError("Sink is down")
        self.alerts.append(anomaly)


# ---------------------------------------------------------------------------
# 1. PagerDuty initialization
# ---------------------------------------------------------------------------
def test_pagerduty_init():
    sink = PagerDutyAlertSink(routing_key="test-key-123")
    assert sink._routing_key == "test-key-123"
    assert sink._timeout == 10


# ---------------------------------------------------------------------------
# 2. PagerDuty event formatting
# ---------------------------------------------------------------------------
def test_pagerduty_event_formatting(sample_anomaly):
    sink = PagerDutyAlertSink(routing_key="rk-abc")
    payload = sink.build_payload(sample_anomaly)

    assert payload["routing_key"] == "rk-abc"
    assert payload["event_action"] == "trigger"
    assert payload["dedup_key"] == _dedup_key(sample_anomaly)
    assert payload["payload"]["severity"] == "error"  # high -> error
    assert "rate_spike" in payload["payload"]["summary"]
    details = payload["payload"]["custom_details"]
    assert details["anomaly_type"] == "rate_spike"
    assert details["agent_id"] == "12345678-1234-5678-1234-567812345678"


# ---------------------------------------------------------------------------
# 3. PagerDuty severity mapping completeness
# ---------------------------------------------------------------------------
def test_pagerduty_severity_mapping():
    for sev in [SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH, SEVERITY_CRITICAL]:
        assert sev in _PAGERDUTY_SEVERITY_MAP


# ---------------------------------------------------------------------------
# 4. Slack initialization
# ---------------------------------------------------------------------------
def test_slack_init():
    sink = SlackAlertSink(webhook_url="https://hooks.slack.com/xxx", channel="#alerts")
    assert sink._webhook_url == "https://hooks.slack.com/xxx"
    assert sink._channel == "#alerts"


# ---------------------------------------------------------------------------
# 5. Slack block kit formatting
# ---------------------------------------------------------------------------
def test_slack_block_kit(sample_anomaly):
    sink = SlackAlertSink(webhook_url="https://hooks.slack.com/xxx")
    blocks = sink.build_blocks(sample_anomaly)

    # Header block
    assert blocks[0]["type"] == "header"
    assert "HIGH" in blocks[0]["text"]["text"]

    # Section with fields
    fields_text = " ".join(f["text"] for f in blocks[1]["fields"])
    assert "rate_spike" in fields_text
    assert "12345678" in fields_text

    # Description
    assert "baseline" in blocks[2]["text"]["text"].lower()

    # Evidence
    assert "baseline_rpm" in blocks[3]["text"]["text"]

    # Divider at end
    assert blocks[-1]["type"] == "divider"


# ---------------------------------------------------------------------------
# 6. Teams Adaptive Card formatting
# ---------------------------------------------------------------------------
def test_teams_adaptive_card(sample_anomaly):
    sink = TeamsAlertSink(
        webhook_url="https://outlook.webhook.office.com/xxx",
        soulauth_base_url="https://sa.example.com",
    )
    card = sink.build_card(sample_anomaly)

    attachment = card["attachments"][0]
    content = attachment["content"]
    assert content["type"] == "AdaptiveCard"

    # FactSet
    facts = content["body"][1]["facts"]
    fact_dict = {f["title"]: f["value"] for f in facts}
    assert fact_dict["Type"] == "rate_spike"
    assert fact_dict["Severity"] == "high"

    # Action buttons
    actions = content["actions"]
    assert len(actions) == 2
    assert "View in SoulAuth" in actions[0]["title"]
    assert "Quarantine Agent" in actions[1]["title"]
    assert "sa.example.com" in actions[0]["url"]


# ---------------------------------------------------------------------------
# 7. OpsGenie initialization
# ---------------------------------------------------------------------------
def test_opsgenie_init():
    sink = OpsGenieAlertSink(
        api_key="og-key",
        responders=[{"type": "team", "name": "security"}],
    )
    assert sink._api_key == "og-key"
    assert len(sink._responders) == 1


# ---------------------------------------------------------------------------
# 8. Email digest batching
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_email_digest_batching(sample_anomaly, critical_anomaly):
    sink = EmailAlertSink(
        smtp_host="localhost",
        smtp_port=587,
        from_addr="alerts@soulauth.io",
        to_addrs=["admin@example.com", "sec@example.com"],
        digest_interval_seconds=300,
    )

    # Buffer anomalies without sending
    sink._last_flush = time.monotonic()  # reset
    await sink.send_alert(sample_anomaly)
    assert len(sink._buffer) == 1

    await sink.send_alert(critical_anomaly)
    assert len(sink._buffer) == 2

    # Simulate interval elapsed
    sink._last_flush = time.monotonic() - 301

    with patch("src.integrations.notifications.EmailAlertSink._send_email", new_callable=AsyncMock) as mock_send:
        await sink.send_alert(sample_anomaly)
        mock_send.assert_called_once()
        # Should have flushed all 3 anomalies
        call_args = mock_send.call_args
        assert "3 anomalies" in call_args[0][0]  # subject
        assert "CRITICAL" in call_args[0][0]  # highest severity

    # Buffer should be empty after flush
    assert len(sink._buffer) == 0


# ---------------------------------------------------------------------------
# 9. Email immediate mode
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_email_immediate_mode(sample_anomaly):
    sink = EmailAlertSink(
        smtp_host="localhost",
        smtp_port=587,
        from_addr="alerts@soulauth.io",
        to_addrs=["admin@example.com"],
        digest_interval_seconds=0,
    )

    with patch("src.integrations.notifications.EmailAlertSink._send_email", new_callable=AsyncMock) as mock_send:
        await sink.send_alert(sample_anomaly)
        mock_send.assert_called_once()
        subject = mock_send.call_args[0][0]
        assert "HIGH" in subject
        assert "rate_spike" in subject


# ---------------------------------------------------------------------------
# 10. NotificationRouter severity routing
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_router_severity_routing(sample_anomaly, low_anomaly):
    router = NotificationRouter()

    pagerduty = _FakeSink()
    slack = _FakeSink()
    email = _FakeSink()

    router.register_sink("pagerduty", pagerduty)
    router.register_sink("slack", slack)
    router.register_sink("email", email)

    # High severity -> slack + email (default rules)
    results = await router.route(sample_anomaly)
    assert results["slack"] is True
    assert results["email"] is True
    assert "pagerduty" not in results  # PD only for critical

    # Low severity -> no sinks (log only)
    results_low = await router.route(low_anomaly)
    assert len(results_low) == 0


# ---------------------------------------------------------------------------
# 11. NotificationRouter critical routes to all
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_router_critical_routes_all(critical_anomaly):
    router = NotificationRouter()

    pagerduty = _FakeSink()
    slack = _FakeSink()
    email = _FakeSink()

    router.register_sink("pagerduty", pagerduty)
    router.register_sink("slack", slack)
    router.register_sink("email", email)

    results = await router.route(critical_anomaly)
    assert results["pagerduty"] is True
    assert results["slack"] is True
    assert results["email"] is True
    assert len(pagerduty.alerts) == 1
    assert len(slack.alerts) == 1
    assert len(email.alerts) == 1


# ---------------------------------------------------------------------------
# 12. NotificationRouter rate limiting
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_router_rate_limiting(sample_anomaly):
    router = NotificationRouter(rate_limit_seconds=60.0, rate_limit_burst=2)

    slack = _FakeSink()
    email = _FakeSink()
    router.register_sink("slack", slack)
    router.register_sink("email", email)

    # First two should go through
    await router.route(sample_anomaly)
    await router.route(sample_anomaly)
    assert len(slack.alerts) == 2
    assert len(email.alerts) == 2

    # Third should be rate-limited
    results = await router.route(sample_anomaly)
    assert results["slack"] is False
    assert results["email"] is False
    assert len(slack.alerts) == 2  # unchanged


# ---------------------------------------------------------------------------
# 13. NotificationRouter graceful degradation (circuit breaker)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_router_graceful_degradation(sample_anomaly):
    router = NotificationRouter(rate_limit_burst=100)

    failing_sink = _FakeSink(should_fail=True)
    healthy_sink = _FakeSink()

    router.register_sink("slack", failing_sink)
    router.register_sink("email", healthy_sink)

    # 3 failures should open the circuit on slack
    for _ in range(3):
        results = await router.route(sample_anomaly)
        assert results["slack"] is False
        assert results["email"] is True

    # Now slack should be circuit-broken, email still works
    results = await router.route(sample_anomaly)
    assert results["slack"] is False  # circuit open
    assert results["email"] is True
    assert len(healthy_sink.alerts) == 4


# ---------------------------------------------------------------------------
# 14. NotificationRouter per-tenant overrides
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_router_tenant_overrides(sample_anomaly):
    router = NotificationRouter()

    slack = _FakeSink()
    pagerduty = _FakeSink()
    router.register_sink("slack", slack)
    router.register_sink("pagerduty", pagerduty)

    # Override: for tenant-42, even high goes to pagerduty
    router.set_tenant_rules("tenant-42", {
        SEVERITY_HIGH: ["pagerduty", "slack"],
        SEVERITY_CRITICAL: ["pagerduty", "slack"],
        SEVERITY_MEDIUM: ["slack"],
        SEVERITY_LOW: [],
    })

    results = await router.route(sample_anomaly, tenant_id="tenant-42")
    assert results["pagerduty"] is True
    assert results["slack"] is True


# ---------------------------------------------------------------------------
# 15. Dedup key determinism
# ---------------------------------------------------------------------------
def test_dedup_key_deterministic(sample_anomaly):
    key1 = _dedup_key(sample_anomaly)
    key2 = _dedup_key(sample_anomaly)
    assert key1 == key2
    assert len(key1) == 32


# ---------------------------------------------------------------------------
# 16. SNS initialization
# ---------------------------------------------------------------------------
def test_sns_init():
    sink = SNSAlertSink(topic_arn="arn:aws:sns:us-east-1:123456:soulauth-alerts")
    assert sink._topic_arn == "arn:aws:sns:us-east-1:123456:soulauth-alerts"
    assert sink._region_name == "us-east-1"
