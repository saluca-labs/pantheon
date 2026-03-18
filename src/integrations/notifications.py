"""
Enterprise notification sinks for SoulAuth anomaly alerts.

Provides PagerDuty, Slack, Teams, OpsGenie, Email, and SNS alert
delivery with a NotificationRouter that handles severity-based
routing, rate limiting, and graceful degradation.
"""

import asyncio
import hashlib
import json
import time
import uuid
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

import httpx
import structlog

from src.analytics.detector import (
    Anomaly,
    AnomalyType,
    SEVERITY_LOW,
    SEVERITY_MEDIUM,
    SEVERITY_HIGH,
    SEVERITY_CRITICAL,
)
from src.analytics.alerts import AlertSink

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Severity mappings
# ---------------------------------------------------------------------------
SEVERITY_ORDER = [SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH, SEVERITY_CRITICAL]

_PAGERDUTY_SEVERITY_MAP = {
    SEVERITY_CRITICAL: "critical",
    SEVERITY_HIGH: "error",
    SEVERITY_MEDIUM: "warning",
    SEVERITY_LOW: "info",
}

_SLACK_COLOR_MAP = {
    SEVERITY_CRITICAL: "#FF0000",
    SEVERITY_HIGH: "#FF8C00",
    SEVERITY_MEDIUM: "#FFD700",
    SEVERITY_LOW: "#1E90FF",
}

_TEAMS_COLOR_MAP = {
    SEVERITY_CRITICAL: "attention",
    SEVERITY_HIGH: "warning",
    SEVERITY_MEDIUM: "accent",
    SEVERITY_LOW: "good",
}

_OPSGENIE_PRIORITY_MAP = {
    SEVERITY_CRITICAL: "P1",
    SEVERITY_HIGH: "P2",
    SEVERITY_MEDIUM: "P3",
    SEVERITY_LOW: "P5",
}


def _dedup_key(anomaly: Anomaly) -> str:
    """Deterministic dedup key for an anomaly based on type + agent."""
    raw = f"{anomaly.type.value}:{anomaly.soulkey_id}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ---------------------------------------------------------------------------
# PagerDuty Events API v2
# ---------------------------------------------------------------------------
class PagerDutyAlertSink(AlertSink):
    """Send trigger/resolve events to PagerDuty Events API v2."""

    EVENTS_URL = "https://events.pagerduty.com/v2/enqueue"

    def __init__(self, routing_key: str, timeout: int = 10):
        self._routing_key = routing_key
        self._timeout = timeout

    async def send_alert(self, anomaly: Anomaly) -> None:
        payload = {
            "routing_key": self._routing_key,
            "event_action": "trigger",
            "dedup_key": _dedup_key(anomaly),
            "payload": {
                "summary": f"SoulAuth Anomaly: {anomaly.type.value} on agent {anomaly.soulkey_id}",
                "source": "soulauth",
                "severity": _PAGERDUTY_SEVERITY_MAP.get(anomaly.severity, "info"),
                "timestamp": anomaly.timestamp.isoformat(),
                "component": "anomaly_detector",
                "custom_details": {
                    "anomaly_type": anomaly.type.value,
                    "agent_id": str(anomaly.soulkey_id),
                    "description": anomaly.description,
                    "evidence": anomaly.evidence,
                    "baseline_value": str(anomaly.baseline_value),
                    "observed_value": str(anomaly.observed_value),
                },
            },
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self.EVENTS_URL, json=payload)
                resp.raise_for_status()
            logger.info("notification.pagerduty_sent", dedup_key=payload["dedup_key"])
        except Exception as exc:
            logger.warning("notification.pagerduty_failed", error=str(exc))
            raise

    def build_payload(self, anomaly: Anomaly) -> dict:
        """Build the PagerDuty event payload (exposed for testing)."""
        return {
            "routing_key": self._routing_key,
            "event_action": "trigger",
            "dedup_key": _dedup_key(anomaly),
            "payload": {
                "summary": f"SoulAuth Anomaly: {anomaly.type.value} on agent {anomaly.soulkey_id}",
                "source": "soulauth",
                "severity": _PAGERDUTY_SEVERITY_MAP.get(anomaly.severity, "info"),
                "timestamp": anomaly.timestamp.isoformat(),
                "component": "anomaly_detector",
                "custom_details": {
                    "anomaly_type": anomaly.type.value,
                    "agent_id": str(anomaly.soulkey_id),
                    "description": anomaly.description,
                    "evidence": anomaly.evidence,
                    "baseline_value": str(anomaly.baseline_value),
                    "observed_value": str(anomaly.observed_value),
                },
            },
        }


# ---------------------------------------------------------------------------
# Slack Incoming Webhooks (Block Kit)
# ---------------------------------------------------------------------------
class SlackAlertSink(AlertSink):
    """Send rich Block Kit messages to Slack via incoming webhook."""

    def __init__(
        self,
        webhook_url: str,
        channel: Optional[str] = None,
        timeout: int = 10,
    ):
        self._webhook_url = webhook_url
        self._channel = channel
        self._timeout = timeout
        # Track thread timestamps per agent for grouping
        self._threads: dict[str, str] = {}

    def build_blocks(self, anomaly: Anomaly) -> list[dict]:
        """Build Slack Block Kit blocks for the anomaly."""
        color = _SLACK_COLOR_MAP.get(anomaly.severity, "#808080")
        severity_label = anomaly.severity.upper()
        return [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"[{severity_label}] SoulAuth Anomaly",
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Type:*\n{anomaly.type.value}"},
                    {"type": "mrkdwn", "text": f"*Severity:*\n{anomaly.severity}"},
                    {"type": "mrkdwn", "text": f"*Agent:*\n`{anomaly.soulkey_id}`"},
                    {"type": "mrkdwn", "text": f"*Time:*\n{anomaly.timestamp.isoformat()}"},
                ],
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Description:*\n{anomaly.description}",
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Evidence:*\n```{json.dumps(anomaly.evidence, indent=2, default=str)}```",
                },
            },
            {"type": "divider"},
        ]

    async def send_alert(self, anomaly: Anomaly) -> None:
        blocks = self.build_blocks(anomaly)
        color = _SLACK_COLOR_MAP.get(anomaly.severity, "#808080")
        agent_key = str(anomaly.soulkey_id)

        body: dict[str, Any] = {
            "attachments": [
                {
                    "color": color,
                    "blocks": blocks,
                }
            ],
        }
        if self._channel:
            body["channel"] = self._channel

        # Thread replies for the same agent
        if agent_key in self._threads:
            body["thread_ts"] = self._threads[agent_key]

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self._webhook_url, json=body)
                resp.raise_for_status()
                # Attempt to capture thread_ts from response for future grouping
                try:
                    data = resp.json()
                    if "ts" in data and agent_key not in self._threads:
                        self._threads[agent_key] = data["ts"]
                except Exception:
                    pass
            logger.info("notification.slack_sent", agent=agent_key)
        except Exception as exc:
            logger.warning("notification.slack_failed", error=str(exc))
            raise


# ---------------------------------------------------------------------------
# Microsoft Teams Incoming Webhook (Adaptive Cards)
# ---------------------------------------------------------------------------
class TeamsAlertSink(AlertSink):
    """Send Adaptive Card messages to Microsoft Teams webhook."""

    def __init__(self, webhook_url: str, soulauth_base_url: str = "https://soulauth.example.com", timeout: int = 10):
        self._webhook_url = webhook_url
        self._base_url = soulauth_base_url
        self._timeout = timeout

    def build_card(self, anomaly: Anomaly) -> dict:
        """Build an Adaptive Card payload for Teams."""
        color = _TEAMS_COLOR_MAP.get(anomaly.severity, "default")
        severity_label = anomaly.severity.upper()
        agent_id = str(anomaly.soulkey_id)

        card = {
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": {
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                        "type": "AdaptiveCard",
                        "version": "1.4",
                        "body": [
                            {
                                "type": "TextBlock",
                                "text": f"[{severity_label}] SoulAuth Anomaly",
                                "weight": "Bolder",
                                "size": "Large",
                                "color": color,
                            },
                            {
                                "type": "FactSet",
                                "facts": [
                                    {"title": "Type", "value": anomaly.type.value},
                                    {"title": "Severity", "value": anomaly.severity},
                                    {"title": "Agent", "value": agent_id},
                                    {"title": "Time", "value": anomaly.timestamp.isoformat()},
                                    {"title": "Description", "value": anomaly.description},
                                ],
                            },
                            {
                                "type": "TextBlock",
                                "text": f"Evidence: {json.dumps(anomaly.evidence, default=str)}",
                                "wrap": True,
                                "isSubtle": True,
                            },
                        ],
                        "actions": [
                            {
                                "type": "Action.OpenUrl",
                                "title": "View in SoulAuth",
                                "url": f"{self._base_url}/admin/anomalies/{agent_id}",
                            },
                            {
                                "type": "Action.OpenUrl",
                                "title": "Quarantine Agent",
                                "url": f"{self._base_url}/admin/agents/{agent_id}/quarantine",
                            },
                        ],
                    },
                }
            ],
        }
        return card

    async def send_alert(self, anomaly: Anomaly) -> None:
        card = self.build_card(anomaly)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self._webhook_url, json=card)
                resp.raise_for_status()
            logger.info("notification.teams_sent", agent=str(anomaly.soulkey_id))
        except Exception as exc:
            logger.warning("notification.teams_failed", error=str(exc))
            raise


# ---------------------------------------------------------------------------
# OpsGenie Alert API
# ---------------------------------------------------------------------------
class OpsGenieAlertSink(AlertSink):
    """Create/close alerts in OpsGenie."""

    API_URL = "https://api.opsgenie.com/v2/alerts"

    def __init__(
        self,
        api_key: str,
        responders: Optional[list[dict]] = None,
        timeout: int = 10,
    ):
        self._api_key = api_key
        self._responders = responders or []
        self._timeout = timeout

    async def send_alert(self, anomaly: Anomaly) -> None:
        agent_id = str(anomaly.soulkey_id)
        tags = [
            f"anomaly:{anomaly.type.value}",
            f"agent:{agent_id}",
        ]
        if anomaly.evidence.get("tenant_id"):
            tags.append(f"tenant:{anomaly.evidence['tenant_id']}")

        payload = {
            "message": f"SoulAuth Anomaly: {anomaly.type.value} on {agent_id}",
            "alias": _dedup_key(anomaly),
            "description": anomaly.description,
            "priority": _OPSGENIE_PRIORITY_MAP.get(anomaly.severity, "P5"),
            "tags": tags,
            "details": {
                "anomaly_type": anomaly.type.value,
                "agent_id": agent_id,
                "severity": anomaly.severity,
                "evidence": json.dumps(anomaly.evidence, default=str),
                "timestamp": anomaly.timestamp.isoformat(),
            },
        }
        if self._responders:
            payload["responders"] = self._responders

        headers = {
            "Authorization": f"GenieKey {self._api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self.API_URL, json=payload, headers=headers)
                resp.raise_for_status()
            logger.info("notification.opsgenie_sent", alias=payload["alias"])
        except Exception as exc:
            logger.warning("notification.opsgenie_failed", error=str(exc))
            raise


# ---------------------------------------------------------------------------
# Email via SMTP (aiosmtplib)
# ---------------------------------------------------------------------------
class EmailAlertSink(AlertSink):
    """
    Async SMTP email alerts with optional digest mode.

    When digest_interval_seconds > 0 the sink batches anomalies and
    flushes them as a single HTML email at the configured interval.
    Call flush() manually or let send_alert handle periodic flushing.
    """

    def __init__(
        self,
        smtp_host: str,
        smtp_port: int,
        smtp_user: Optional[str] = None,
        smtp_password: Optional[str] = None,
        from_addr: str = "soulauth@example.com",
        to_addrs: Optional[list[str]] = None,
        subject_prefix: str = "[SoulAuth Alert]",
        use_tls: bool = True,
        digest_interval_seconds: int = 300,
    ):
        self._smtp_host = smtp_host
        self._smtp_port = smtp_port
        self._smtp_user = smtp_user
        self._smtp_password = smtp_password
        self._from_addr = from_addr
        self._to_addrs = to_addrs or []
        self._subject_prefix = subject_prefix
        self._use_tls = use_tls
        self._digest_interval = digest_interval_seconds

        # Digest buffer
        self._buffer: list[Anomaly] = []
        self._last_flush: float = time.monotonic()

    def _render_html(self, anomalies: list[Anomaly]) -> str:
        """Render one or more anomalies into an HTML email body."""
        rows = ""
        for a in anomalies:
            color = {
                SEVERITY_CRITICAL: "#FF0000",
                SEVERITY_HIGH: "#FF8C00",
                SEVERITY_MEDIUM: "#FFD700",
                SEVERITY_LOW: "#1E90FF",
            }.get(a.severity, "#808080")
            rows += (
                f"<tr>"
                f"<td style='color:{color};font-weight:bold'>{a.severity.upper()}</td>"
                f"<td>{a.type.value}</td>"
                f"<td><code>{a.soulkey_id}</code></td>"
                f"<td>{a.description}</td>"
                f"<td>{a.timestamp.isoformat()}</td>"
                f"</tr>"
            )
        return (
            "<html><body>"
            "<h2>SoulAuth Anomaly Alert</h2>"
            "<table border='1' cellpadding='6' cellspacing='0'>"
            "<tr><th>Severity</th><th>Type</th><th>Agent</th>"
            "<th>Description</th><th>Time</th></tr>"
            f"{rows}"
            "</table></body></html>"
        )

    async def _send_email(self, subject: str, html_body: str) -> None:
        """Actually send via SMTP."""
        try:
            import aiosmtplib
        except ImportError:
            logger.warning("notification.email_missing_dep", detail="aiosmtplib not installed")
            raise

        msg = MIMEMultipart("alternative")
        msg["From"] = self._from_addr
        msg["To"] = ", ".join(self._to_addrs)
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        await aiosmtplib.send(
            msg,
            hostname=self._smtp_host,
            port=self._smtp_port,
            username=self._smtp_user,
            password=self._smtp_password,
            use_tls=self._use_tls,
        )
        logger.info("notification.email_sent", recipients=len(self._to_addrs))

    async def flush(self) -> None:
        """Flush the digest buffer and send batched email."""
        if not self._buffer:
            return
        anomalies = list(self._buffer)
        self._buffer.clear()
        self._last_flush = time.monotonic()

        count = len(anomalies)
        max_sev = max(
            anomalies,
            key=lambda a: SEVERITY_ORDER.index(a.severity) if a.severity in SEVERITY_ORDER else 0,
        ).severity.upper()
        subject = f"{self._subject_prefix} {count} anomalies (highest: {max_sev})"
        html = self._render_html(anomalies)
        await self._send_email(subject, html)

    async def send_alert(self, anomaly: Anomaly) -> None:
        if self._digest_interval <= 0:
            # Immediate mode
            subject = f"{self._subject_prefix} {anomaly.severity.upper()} — {anomaly.type.value}"
            html = self._render_html([anomaly])
            await self._send_email(subject, html)
            return

        # Digest mode: buffer and flush when interval elapsed
        self._buffer.append(anomaly)
        elapsed = time.monotonic() - self._last_flush
        if elapsed >= self._digest_interval:
            await self.flush()


# ---------------------------------------------------------------------------
# AWS SNS
# ---------------------------------------------------------------------------
class SNSAlertSink(AlertSink):
    """Publish anomaly alerts to an AWS SNS topic."""

    def __init__(self, topic_arn: str, region_name: str = "us-east-1"):
        self._topic_arn = topic_arn
        self._region_name = region_name

    async def send_alert(self, anomaly: Anomaly) -> None:
        try:
            import boto3
        except ImportError:
            logger.warning("notification.sns_missing_dep", detail="boto3 not installed")
            raise

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._publish, anomaly)

    def _publish(self, anomaly: Anomaly) -> None:
        import boto3

        client = boto3.client("sns", region_name=self._region_name)
        message = json.dumps(anomaly.to_dict(), default=str)
        client.publish(
            TopicArn=self._topic_arn,
            Subject=f"SoulAuth Anomaly: {anomaly.type.value} [{anomaly.severity}]",
            Message=message,
            MessageAttributes={
                "severity": {"DataType": "String", "StringValue": anomaly.severity},
                "anomaly_type": {"DataType": "String", "StringValue": anomaly.type.value},
                "agent_id": {"DataType": "String", "StringValue": str(anomaly.soulkey_id)},
            },
        )
        logger.info("notification.sns_published", topic=self._topic_arn)


# ---------------------------------------------------------------------------
# Notification Router
# ---------------------------------------------------------------------------
@dataclass
class _RateLimitEntry:
    last_sent: float = 0.0
    count: int = 0


class NotificationRouter:
    """
    Routes anomaly alerts to multiple sinks based on severity rules.

    Default routing:
      critical -> PagerDuty + Slack + Email
      high     -> Slack + Email
      medium   -> Slack
      low      -> log only

    Supports per-tenant overrides, rate limiting per sink, and graceful
    degradation when a sink fails.
    """

    def __init__(
        self,
        rate_limit_seconds: float = 60.0,
        rate_limit_burst: int = 10,
    ):
        self._rate_limit_seconds = rate_limit_seconds
        self._rate_limit_burst = rate_limit_burst

        # Named sinks
        self._sinks: dict[str, AlertSink] = {}

        # Default routing rules: severity -> list of sink names
        self._default_rules: dict[str, list[str]] = {
            SEVERITY_CRITICAL: ["pagerduty", "slack", "email"],
            SEVERITY_HIGH: ["slack", "email"],
            SEVERITY_MEDIUM: ["slack"],
            SEVERITY_LOW: [],
        }

        # Per-tenant overrides: tenant_id -> {severity -> [sink names]}
        self._tenant_rules: dict[str, dict[str, list[str]]] = {}

        # Rate limiting state per sink name
        self._rate_limits: dict[str, _RateLimitEntry] = defaultdict(_RateLimitEntry)

        # Failure tracking for graceful degradation
        self._failure_counts: dict[str, int] = defaultdict(int)
        self._circuit_open: dict[str, float] = {}
        self._circuit_reset_seconds: float = 300.0  # 5 min circuit breaker

    # -- Configuration -------------------------------------------------------

    def register_sink(self, name: str, sink: AlertSink) -> None:
        """Register a named sink."""
        self._sinks[name] = sink

    def set_default_rules(self, rules: dict[str, list[str]]) -> None:
        """Override default routing rules."""
        self._default_rules = rules

    def set_tenant_rules(self, tenant_id: str, rules: dict[str, list[str]]) -> None:
        """Set per-tenant routing overrides."""
        self._tenant_rules[tenant_id] = rules

    # -- Routing -------------------------------------------------------------

    def _get_sink_names(self, severity: str, tenant_id: Optional[str] = None) -> list[str]:
        """Resolve which sink names should receive this severity alert."""
        if tenant_id and tenant_id in self._tenant_rules:
            rules = self._tenant_rules[tenant_id]
        else:
            rules = self._default_rules
        return rules.get(severity, [])

    def _is_rate_limited(self, sink_name: str) -> bool:
        """Check if a sink has exceeded its rate limit."""
        entry = self._rate_limits[sink_name]
        now = time.monotonic()
        # Reset window if enough time has passed
        if now - entry.last_sent >= self._rate_limit_seconds:
            entry.count = 0
            entry.last_sent = now
            return False
        return entry.count >= self._rate_limit_burst

    def _record_send(self, sink_name: str) -> None:
        entry = self._rate_limits[sink_name]
        now = time.monotonic()
        if now - entry.last_sent >= self._rate_limit_seconds:
            entry.count = 1
            entry.last_sent = now
        else:
            entry.count += 1

    def _is_circuit_open(self, sink_name: str) -> bool:
        """Circuit breaker: skip sink if it has failed too many times recently."""
        if sink_name not in self._circuit_open:
            return False
        opened_at = self._circuit_open[sink_name]
        if time.monotonic() - opened_at >= self._circuit_reset_seconds:
            # Half-open: allow retry
            del self._circuit_open[sink_name]
            self._failure_counts[sink_name] = 0
            return False
        return True

    def _record_failure(self, sink_name: str) -> None:
        self._failure_counts[sink_name] += 1
        if self._failure_counts[sink_name] >= 3:
            self._circuit_open[sink_name] = time.monotonic()
            logger.warning(
                "notification.circuit_open",
                sink=sink_name,
                failures=self._failure_counts[sink_name],
            )

    def _record_success(self, sink_name: str) -> None:
        self._failure_counts[sink_name] = 0
        if sink_name in self._circuit_open:
            del self._circuit_open[sink_name]

    async def route(self, anomaly: Anomaly, tenant_id: Optional[str] = None) -> dict[str, bool]:
        """
        Route an anomaly to the appropriate sinks.

        Returns a dict of {sink_name: success_bool} for each attempted sink.
        Always logs regardless of routing rules.
        """
        # Always log
        logger.info(
            "notification.alert",
            type=anomaly.type.value,
            severity=anomaly.severity,
            agent=str(anomaly.soulkey_id),
        )

        sink_names = self._get_sink_names(anomaly.severity, tenant_id)
        results: dict[str, bool] = {}

        for name in sink_names:
            sink = self._sinks.get(name)
            if sink is None:
                logger.debug("notification.sink_not_registered", sink=name)
                results[name] = False
                continue

            if self._is_circuit_open(name):
                logger.debug("notification.circuit_open_skip", sink=name)
                results[name] = False
                continue

            if self._is_rate_limited(name):
                logger.debug("notification.rate_limited", sink=name)
                results[name] = False
                continue

            try:
                await sink.send_alert(anomaly)
                self._record_send(name)
                self._record_success(name)
                results[name] = True
            except Exception as exc:
                logger.warning("notification.sink_error", sink=name, error=str(exc))
                self._record_failure(name)
                results[name] = False

        return results
