"""
Enterprise notification sinks for SoulWatch anomaly alerts.
PagerDuty, Slack, Teams, OpsGenie, Email, SNS.
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
from typing import Any, Optional

import httpx
import structlog

from soulWatch.src.analytics.detector import (
    Anomaly, AnomalyType,
    SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH, SEVERITY_CRITICAL,
)
from soulWatch.src.analytics.alerts import AlertSink

logger = structlog.get_logger(__name__)

SEVERITY_ORDER = [SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH, SEVERITY_CRITICAL]


def _dedup_key(anomaly: Anomaly) -> str:
    raw = f"{anomaly.type.value}:{anomaly.soulkey_id}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


_PAGERDUTY_SEVERITY_MAP = {
    SEVERITY_CRITICAL: "critical", SEVERITY_HIGH: "error",
    SEVERITY_MEDIUM: "warning", SEVERITY_LOW: "info",
}

_SLACK_COLOR_MAP = {
    SEVERITY_CRITICAL: "#FF0000", SEVERITY_HIGH: "#FF8C00",
    SEVERITY_MEDIUM: "#FFD700", SEVERITY_LOW: "#1E90FF",
}


class PagerDutyAlertSink(AlertSink):
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
                "summary": f"SoulWatch Anomaly: {anomaly.type.value} on agent {anomaly.soulkey_id}",
                "source": "soulwatch",
                "severity": _PAGERDUTY_SEVERITY_MAP.get(anomaly.severity, "info"),
                "timestamp": anomaly.timestamp.isoformat(),
                "component": "anomaly_detector",
                "custom_details": anomaly.to_dict(),
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


class SlackAlertSink(AlertSink):
    def __init__(self, webhook_url: str, channel: Optional[str] = None, timeout: int = 10):
        self._webhook_url = webhook_url
        self._channel = channel
        self._timeout = timeout

    async def send_alert(self, anomaly: Anomaly) -> None:
        color = _SLACK_COLOR_MAP.get(anomaly.severity, "#808080")
        severity_label = anomaly.severity.upper()
        body: dict[str, Any] = {
            "attachments": [{
                "color": color,
                "blocks": [
                    {"type": "header", "text": {"type": "plain_text", "text": f"[{severity_label}] SoulWatch Anomaly"}},
                    {"type": "section", "fields": [
                        {"type": "mrkdwn", "text": f"*Type:*\n{anomaly.type.value}"},
                        {"type": "mrkdwn", "text": f"*Severity:*\n{anomaly.severity}"},
                        {"type": "mrkdwn", "text": f"*Agent:*\n`{anomaly.soulkey_id}`"},
                    ]},
                    {"type": "section", "text": {"type": "mrkdwn", "text": f"*Detail:*\n{anomaly.description}"}},
                ],
            }],
        }
        if self._channel:
            body["channel"] = self._channel

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self._webhook_url, json=body)
                resp.raise_for_status()
            logger.info("notification.slack_sent", agent=str(anomaly.soulkey_id))
        except Exception as exc:
            logger.warning("notification.slack_failed", error=str(exc))
            raise


class TeamsAlertSink(AlertSink):
    def __init__(self, webhook_url: str, timeout: int = 10):
        self._webhook_url = webhook_url
        self._timeout = timeout

    async def send_alert(self, anomaly: Anomaly) -> None:
        card = {
            "type": "message",
            "attachments": [{
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard", "version": "1.4",
                    "body": [
                        {"type": "TextBlock", "text": f"[{anomaly.severity.upper()}] SoulWatch Anomaly", "weight": "Bolder", "size": "Large"},
                        {"type": "FactSet", "facts": [
                            {"title": "Type", "value": anomaly.type.value},
                            {"title": "Agent", "value": str(anomaly.soulkey_id)},
                            {"title": "Description", "value": anomaly.description},
                        ]},
                    ],
                },
            }],
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self._webhook_url, json=card)
                resp.raise_for_status()
            logger.info("notification.teams_sent")
        except Exception as exc:
            logger.warning("notification.teams_failed", error=str(exc))
            raise


class OpsGenieAlertSink(AlertSink):
    API_URL = "https://api.opsgenie.com/v2/alerts"

    def __init__(self, api_key: str, timeout: int = 10):
        self._api_key = api_key
        self._timeout = timeout

    async def send_alert(self, anomaly: Anomaly) -> None:
        payload = {
            "message": f"SoulWatch Anomaly: {anomaly.type.value} on {anomaly.soulkey_id}",
            "alias": _dedup_key(anomaly),
            "description": anomaly.description,
            "priority": {"critical": "P1", "high": "P2", "medium": "P3", "low": "P5"}.get(anomaly.severity, "P5"),
            "tags": [f"anomaly:{anomaly.type.value}", f"agent:{anomaly.soulkey_id}"],
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    self.API_URL, json=payload,
                    headers={"Authorization": f"GenieKey {self._api_key}", "Content-Type": "application/json"},
                )
                resp.raise_for_status()
            logger.info("notification.opsgenie_sent")
        except Exception as exc:
            logger.warning("notification.opsgenie_failed", error=str(exc))
            raise


class SNSAlertSink(AlertSink):
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
        client.publish(
            TopicArn=self._topic_arn,
            Subject=f"SoulWatch Anomaly: {anomaly.type.value} [{anomaly.severity}]",
            Message=json.dumps(anomaly.to_dict(), default=str),
        )
        logger.info("notification.sns_published", topic=self._topic_arn)
