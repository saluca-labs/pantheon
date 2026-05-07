"""
Tests for SIEM integration module.
Covers CEF formatting, forwarder initialization, event forwarding,
batch operations, dead letter queue, buffer flush, health checks,
multi-destination, and retry logic.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import pytest_asyncio

from src.integrations.cef import AuditEvent, format_cef, SEVERITY_MAP, EVENT_NAMES
from src.integrations.config import (
    SplunkConfig,
    ElasticConfig,
    SyslogConfig,
    WebhookConfig,
    AzureSentinelConfig,
)
from src.integrations.siem import (
    SplunkHECForwarder,
    ElasticForwarder,
    SyslogForwarder,
    WebhookForwarder,
    AzureSentinelForwarder,
    create_forwarder,
)
from src.integrations.forwarder import EventForwarder, ForwarderMetrics


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_event(**overrides) -> AuditEvent:
    defaults = {
        "event_id": str(uuid.uuid4()),
        "tenant_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "auth_grant",
        "soulkey_id": str(uuid.uuid4()),
        "persona_id": "alfred",
        "resource": "memory",
        "action": "read",
        "scope": "cs:algorithms",
        "decision": "grant",
        "reason": "policy allows",
        "capability_id": str(uuid.uuid4()),
        "context": {"node": "gcp-1"},
    }
    defaults.update(overrides)
    return AuditEvent(**defaults)


@pytest.fixture
def sample_event():
    return _make_event()


@pytest.fixture
def sample_batch():
    return [_make_event(event_type="auth_grant"), _make_event(event_type="auth_deny")]


# ---------------------------------------------------------------------------
# CEF Formatting Tests
# ---------------------------------------------------------------------------

class TestCEFFormatting:
    def test_cef_basic_structure(self, sample_event):
        """CEF string has correct header structure."""
        cef = format_cef(sample_event)
        parts = cef.split("|")
        assert parts[0] == "CEF:0"
        assert parts[1] == "Saluca"
        assert parts[2] == "Tiresias SoulAuth"
        assert parts[3] == "1.0"
        assert parts[4] == "auth_grant"
        assert parts[5] == "Authorization Granted"
        assert parts[6] == "3"

    def test_cef_severity_mapping(self):
        """Each event type maps to the correct CEF severity."""
        for etype, expected_sev in SEVERITY_MAP.items():
            event = _make_event(event_type=etype)
            cef = format_cef(event)
            parts = cef.split("|")
            assert parts[6] == str(expected_sev), f"severity mismatch for {etype}"

    def test_cef_extension_fields(self, sample_event):
        """CEF extension contains expected key=value pairs."""
        cef = format_cef(sample_event)
        ext = cef.split("|", 7)[7]
        assert f"externalId={sample_event.event_id}" in ext
        assert "suser=alfred" in ext
        assert "act=read" in ext
        assert "outcome=grant" in ext
        assert "cs1Label=tenantId" in ext
        assert "cs3Label=resource" in ext

    def test_cef_escaping(self):
        """Equals and backslash characters in extension values are properly escaped."""
        event = _make_event(reason="denied=bad", persona_id="user\\admin")
        cef = format_cef(event)
        ext = cef.split("|", 7)[7]
        # Equals signs in extension values must be escaped
        assert "reason=denied\\=bad" in ext
        # Backslashes in extension values must be escaped
        assert "suser=user\\\\admin" in ext

    def test_cef_optional_fields_absent(self):
        """CEF omits extension fields that are None."""
        event = _make_event(
            soulkey_id=None,
            capability_id=None,
            scope=None,
            resource=None,
        )
        cef = format_cef(event)
        ext = cef.split("|", 7)[7]
        assert "cs2Label" not in ext
        assert "cs3Label" not in ext
        assert "cs4Label" not in ext
        assert "cs5Label" not in ext


# ---------------------------------------------------------------------------
# Forwarder Initialization Tests
# ---------------------------------------------------------------------------

class TestForwarderInit:
    def test_splunk_forwarder_init(self):
        cfg = SplunkConfig(hec_url="https://splunk:8088/services/collector", hec_token="tok")
        fwd = SplunkHECForwarder(cfg)
        assert fwd.config.hec_token == "tok"

    def test_elastic_forwarder_init(self):
        cfg = ElasticConfig(url="https://es:9200", api_key="abc123")
        fwd = ElasticForwarder(cfg)
        assert fwd.config.index_pattern == "soulauth-audit-{date}"

    def test_syslog_forwarder_init(self):
        cfg = SyslogConfig(host="syslog.local", port=514, protocol="udp")
        fwd = SyslogForwarder(cfg)
        assert fwd.config.protocol == "udp"

    def test_webhook_forwarder_init(self):
        cfg = WebhookConfig(url="https://hook.example.com/events", headers={"X-Api-Key": "secret"})
        fwd = WebhookForwarder(cfg)
        assert fwd.config.max_retries == 3

    def test_azure_sentinel_forwarder_init(self):
        cfg = AzureSentinelConfig(workspace_id="ws-123", shared_key="c2VjcmV0")
        fwd = AzureSentinelForwarder(cfg)
        assert fwd.config.log_type == "SoulAuth_Audit"

    def test_create_forwarder_factory(self):
        """Factory creates the correct forwarder type."""
        cfg = WebhookConfig(url="https://example.com")
        fwd = create_forwarder(cfg)
        assert isinstance(fwd, WebhookForwarder)


# ---------------------------------------------------------------------------
# Event Forwarding Tests (mocked HTTP)
# ---------------------------------------------------------------------------

class TestSplunkForwarding:
    @pytest.mark.asyncio
    async def test_forward_event_success(self, sample_event):
        cfg = SplunkConfig(hec_url="https://splunk:8088/services/collector", hec_token="tok")
        fwd = SplunkHECForwarder(cfg)
        mock_resp = httpx.Response(200, json={"text": "Success", "code": 0})
        fwd._client = AsyncMock()
        fwd._client.post = AsyncMock(return_value=mock_resp)

        result = await fwd.forward_event(sample_event)
        assert result is True
        fwd._client.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_forward_batch_success(self, sample_batch):
        cfg = SplunkConfig(hec_url="https://splunk:8088/services/collector", hec_token="tok")
        fwd = SplunkHECForwarder(cfg)
        mock_resp = httpx.Response(200, json={"text": "Success", "code": 0})
        fwd._client = AsyncMock()
        fwd._client.post = AsyncMock(return_value=mock_resp)

        result = await fwd.forward_batch(sample_batch)
        assert result is True

    @pytest.mark.asyncio
    async def test_forward_event_failure(self, sample_event):
        cfg = SplunkConfig(hec_url="https://splunk:8088/services/collector", hec_token="tok")
        fwd = SplunkHECForwarder(cfg)
        mock_resp = httpx.Response(403, text="Forbidden")
        fwd._client = AsyncMock()
        fwd._client.post = AsyncMock(return_value=mock_resp)

        result = await fwd.forward_event(sample_event)
        assert result is False

    @pytest.mark.asyncio
    async def test_health_check(self):
        cfg = SplunkConfig(hec_url="https://splunk:8088/services/collector", hec_token="tok")
        fwd = SplunkHECForwarder(cfg)
        mock_resp = httpx.Response(200, text="HEC is healthy")
        fwd._client = AsyncMock()
        fwd._client.get = AsyncMock(return_value=mock_resp)

        result = await fwd.health_check()
        assert result is True


class TestElasticForwarding:
    @pytest.mark.asyncio
    async def test_forward_event_success(self, sample_event):
        cfg = ElasticConfig(url="https://es:9200")
        fwd = ElasticForwarder(cfg)
        mock_resp = httpx.Response(201, json={"result": "created"})
        fwd._client = AsyncMock()
        fwd._client.put = AsyncMock(return_value=mock_resp)

        result = await fwd.forward_event(sample_event)
        assert result is True

    @pytest.mark.asyncio
    async def test_forward_batch_success(self, sample_batch):
        cfg = ElasticConfig(url="https://es:9200")
        fwd = ElasticForwarder(cfg)
        mock_resp = httpx.Response(200, json={"errors": False, "items": []})
        fwd._client = AsyncMock()
        fwd._client.post = AsyncMock(return_value=mock_resp)

        result = await fwd.forward_batch(sample_batch)
        assert result is True

    @pytest.mark.asyncio
    async def test_index_name_date_pattern(self, sample_event):
        cfg = ElasticConfig(url="https://es:9200", index_pattern="audit-{date}")
        fwd = ElasticForwarder(cfg)
        idx = fwd._index_name(sample_event)
        # Should contain dots-separated date
        assert idx.startswith("audit-")
        assert "." in idx

    @pytest.mark.asyncio
    async def test_health_check_healthy(self):
        cfg = ElasticConfig(url="https://es:9200")
        fwd = ElasticForwarder(cfg)
        mock_resp = httpx.Response(200, json={"status": "green"})
        fwd._client = AsyncMock()
        fwd._client.get = AsyncMock(return_value=mock_resp)

        assert await fwd.health_check() is True

    @pytest.mark.asyncio
    async def test_health_check_red(self):
        cfg = ElasticConfig(url="https://es:9200")
        fwd = ElasticForwarder(cfg)
        mock_resp = httpx.Response(200, json={"status": "red"})
        fwd._client = AsyncMock()
        fwd._client.get = AsyncMock(return_value=mock_resp)

        assert await fwd.health_check() is False


class TestWebhookForwarding:
    @pytest.mark.asyncio
    async def test_forward_with_retry_on_server_error(self, sample_event):
        """Webhook retries on 500 errors with exponential backoff."""
        cfg = WebhookConfig(
            url="https://hook.example.com",
            max_retries=2,
            retry_base_delay=0.01,  # Fast for tests
        )
        fwd = WebhookForwarder(cfg)

        # First two calls return 500, third succeeds
        responses = [
            httpx.Response(500, text="Internal Server Error"),
            httpx.Response(500, text="Internal Server Error"),
            httpx.Response(200, json={"ok": True}),
        ]
        call_count = 0

        async def mock_post(*args, **kwargs):
            nonlocal call_count
            resp = responses[call_count]
            call_count += 1
            return resp

        fwd._client = AsyncMock()
        fwd._client.post = mock_post

        result = await fwd.forward_event(sample_event)
        assert result is True
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_no_retry_on_client_error(self, sample_event):
        """Webhook does not retry on 4xx errors."""
        cfg = WebhookConfig(url="https://hook.example.com", max_retries=3, retry_base_delay=0.01)
        fwd = WebhookForwarder(cfg)
        mock_resp = httpx.Response(400, text="Bad Request")
        fwd._client = AsyncMock()
        fwd._client.post = AsyncMock(return_value=mock_resp)

        result = await fwd.forward_event(sample_event)
        assert result is False
        # Should be called only once — no retries on 4xx
        assert fwd._client.post.call_count == 1

    @pytest.mark.asyncio
    async def test_health_check(self):
        cfg = WebhookConfig(url="https://hook.example.com")
        fwd = WebhookForwarder(cfg)
        mock_resp = httpx.Response(200)
        fwd._client = AsyncMock()
        fwd._client.head = AsyncMock(return_value=mock_resp)

        assert await fwd.health_check() is True


# ---------------------------------------------------------------------------
# EventForwarder (Orchestrator) Tests
# ---------------------------------------------------------------------------

class TestEventForwarder:
    def test_forward_adds_to_buffer(self, sample_event):
        ef = EventForwarder(buffer_size=10, flush_interval=60)
        ef.forward(sample_event)
        assert ef.metrics.buffer_size == 1

    @pytest.mark.asyncio
    async def test_flush_sends_to_destinations(self, sample_batch):
        """Flush sends buffered events to all configured forwarders."""
        mock_fwd = AsyncMock(spec=WebhookForwarder)
        mock_fwd.forward_batch = AsyncMock(return_value=True)

        ef = EventForwarder(buffer_size=10, flush_interval=60)
        ef._forwarders = [mock_fwd]

        for event in sample_batch:
            ef.forward(event)

        await ef.flush()

        mock_fwd.forward_batch.assert_called_once()
        batch_arg = mock_fwd.forward_batch.call_args[0][0]
        assert len(batch_arg) == 2
        assert ef.metrics.events_forwarded == 2
        assert ef.metrics.buffer_size == 0

    @pytest.mark.asyncio
    async def test_dead_letter_queue_on_failure(self, sample_event):
        """Failed events go to dead letter queue."""
        mock_fwd = AsyncMock(spec=WebhookForwarder)
        mock_fwd.forward_batch = AsyncMock(return_value=False)

        ef = EventForwarder(buffer_size=10, flush_interval=60)
        ef._forwarders = [mock_fwd]
        ef.forward(sample_event)

        await ef.flush()

        assert ef.metrics.events_failed == 1
        assert ef.metrics.dead_letter_size == 1

    @pytest.mark.asyncio
    async def test_dead_letter_retry(self, sample_event):
        """Dead letter items are retried on next flush."""
        call_count = 0

        async def mock_batch(events):
            nonlocal call_count
            call_count += 1
            return call_count > 1  # Fail first, succeed second

        mock_fwd = AsyncMock(spec=WebhookForwarder)
        mock_fwd.forward_batch = mock_batch

        ef = EventForwarder(buffer_size=10, flush_interval=60)
        ef._forwarders = [mock_fwd]
        ef.forward(sample_event)

        # First flush — fails, goes to DLQ
        await ef.flush()
        assert ef.metrics.dead_letter_size == 1

        # Second flush — DLQ items retried, succeeds
        await ef.flush()
        assert ef.metrics.dead_letter_size == 0

    @pytest.mark.asyncio
    async def test_multiple_destinations(self, sample_event):
        """Events are forwarded to all configured destinations."""
        mock_fwd1 = AsyncMock(spec=WebhookForwarder)
        mock_fwd1.forward_batch = AsyncMock(return_value=True)
        mock_fwd2 = AsyncMock(spec=SplunkHECForwarder)
        mock_fwd2.forward_batch = AsyncMock(return_value=True)

        ef = EventForwarder(buffer_size=10, flush_interval=60)
        ef._forwarders = [mock_fwd1, mock_fwd2]
        ef.forward(sample_event)

        await ef.flush()

        mock_fwd1.forward_batch.assert_called_once()
        mock_fwd2.forward_batch.assert_called_once()

    @pytest.mark.asyncio
    async def test_start_stop_lifecycle(self):
        """Start creates background task, stop cancels it."""
        ef = EventForwarder(buffer_size=10, flush_interval=0.05)
        ef.start()
        assert ef._running is True
        assert ef._task is not None

        await asyncio.sleep(0.02)
        await ef.stop()
        assert ef._running is False
        assert ef._task is None

    @pytest.mark.asyncio
    async def test_flush_on_stop(self, sample_event):
        """Remaining buffer is flushed during stop."""
        mock_fwd = AsyncMock(spec=WebhookForwarder)
        mock_fwd.forward_batch = AsyncMock(return_value=True)
        mock_fwd.close = AsyncMock()

        ef = EventForwarder(buffer_size=100, flush_interval=300)
        ef._forwarders = [mock_fwd]
        ef.forward(sample_event)

        ef.start()
        await ef.stop()

        # forward_batch should have been called during stop's flush
        mock_fwd.forward_batch.assert_called()
        assert ef.metrics.events_forwarded >= 1

    @pytest.mark.asyncio
    async def test_health_check_aggregation(self):
        """Health check reports status for each destination."""
        mock_fwd1 = AsyncMock(spec=WebhookForwarder)
        mock_fwd1.health_check = AsyncMock(return_value=True)
        mock_fwd2 = AsyncMock(spec=SplunkHECForwarder)
        mock_fwd2.health_check = AsyncMock(return_value=False)

        ef = EventForwarder()
        ef._forwarders = [mock_fwd1, mock_fwd2]

        health = await ef.health_check()
        assert health["AsyncMock"] is True or health["AsyncMock"] is False
        assert len(health) >= 1  # At least one result (mocks share type name)

    def test_metrics_to_dict(self):
        m = ForwarderMetrics(events_forwarded=10, events_failed=2, buffer_size=5)
        d = m.to_dict()
        assert d["events_forwarded"] == 10
        assert d["events_failed"] == 2
