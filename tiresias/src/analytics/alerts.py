"""
Alert routing and notification for anomaly detections.
Routes anomalies to configured sinks based on severity,
with deduplication and escalation logic.
"""

import asyncio
import uuid
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog

from src.analytics.detector import (
    Anomaly,
    AnomalyType,
    SEVERITY_LOW,
    SEVERITY_MEDIUM,
    SEVERITY_HIGH,
    SEVERITY_CRITICAL,
)

logger = structlog.get_logger(__name__)

# Severity ordering for escalation
SEVERITY_ORDER = [SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH, SEVERITY_CRITICAL]


def _escalate_severity(current: str) -> str:
    """Bump severity one level up."""
    idx = SEVERITY_ORDER.index(current) if current in SEVERITY_ORDER else 0
    return SEVERITY_ORDER[min(idx + 1, len(SEVERITY_ORDER) - 1)]


class AlertSink(ABC):
    """Base class for alert destinations."""

    @abstractmethod
    async def send_alert(self, anomaly: Anomaly) -> None:
        """Send an anomaly alert to this sink."""
        ...


class LogAlertSink(AlertSink):
    """Logs anomalies via structlog. Always active as default sink."""

    async def send_alert(self, anomaly: Anomaly) -> None:
        log_fn = logger.warning if anomaly.severity in (SEVERITY_HIGH, SEVERITY_CRITICAL) else logger.info
        log_fn(
            "alert.anomaly",
            type=anomaly.type.value,
            severity=anomaly.severity,
            soulkey_id=str(anomaly.soulkey_id),
            description=anomaly.description,
        )


class WebhookAlertSink(AlertSink):
    """Sends alerts to a configurable webhook URL."""

    def __init__(self, webhook_url: str, timeout: int = 10):
        self._webhook_url = webhook_url
        self._timeout = timeout

    async def send_alert(self, anomaly: Anomaly) -> None:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                await client.post(
                    self._webhook_url,
                    json={
                        "source": "soulauth_anomaly_detector",
                        "anomaly": anomaly.to_dict(),
                    },
                )
            logger.debug("alert.webhook_sent", url=self._webhook_url, type=anomaly.type.value)
        except Exception as e:
            logger.warning("alert.webhook_failed", url=self._webhook_url, error=str(e))


class TelegramAlertSink(AlertSink):
    """Sends critical anomalies to a Telegram chat."""

    def __init__(self, bot_token: str, chat_id: str):
        self._bot_token = bot_token
        self._chat_id = chat_id

    async def send_alert(self, anomaly: Anomaly) -> None:
        severity_emoji = {
            SEVERITY_LOW: "INFO",
            SEVERITY_MEDIUM: "WARN",
            SEVERITY_HIGH: "ALERT",
            SEVERITY_CRITICAL: "CRITICAL",
        }
        prefix = severity_emoji.get(anomaly.severity, "ALERT")
        message = (
            f"[{prefix}] SoulAuth Anomaly\n"
            f"Type: {anomaly.type.value}\n"
            f"Severity: {anomaly.severity}\n"
            f"Agent: {anomaly.soulkey_id}\n"
            f"Detail: {anomaly.description}"
        )
        try:
            import httpx
            url = f"https://api.telegram.org/bot{self._bot_token}/sendMessage"
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(url, json={"chat_id": self._chat_id, "text": message})
            logger.debug("alert.telegram_sent", type=anomaly.type.value)
        except Exception as e:
            logger.warning("alert.telegram_failed", error=str(e))


class PrometheusAlertSink(AlertSink):
    """Increments Prometheus counters per anomaly type and severity."""

    async def send_alert(self, anomaly: Anomaly) -> None:
        try:
            from src.monitoring.metrics import ANOMALIES_TOTAL
            ANOMALIES_TOTAL.labels(
                type=anomaly.type.value,
                severity=anomaly.severity,
            ).inc()
        except Exception as e:
            logger.debug("alert.prometheus_failed", error=str(e))


@dataclass
class _DedupEntry:
    """Tracks recent alerts for deduplication and escalation."""
    count: int = 0
    first_seen: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_alerted: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    escalated: bool = False


class AlertRouter:
    """
    Routes anomalies to configured sinks based on severity.
    Handles deduplication and automatic escalation.
    """

    def __init__(
        self,
        cooldown_seconds: int = 300,       # 5 minute dedup window
        escalation_count: int = 3,          # 3 occurrences to escalate
        escalation_window_seconds: int = 900,  # within 15 minutes
    ):
        self._sinks: dict[str, list[AlertSink]] = {
            SEVERITY_LOW: [],
            SEVERITY_MEDIUM: [],
            SEVERITY_HIGH: [],
            SEVERITY_CRITICAL: [],
        }
        self._cooldown = timedelta(seconds=cooldown_seconds)
        self._escalation_count = escalation_count
        self._escalation_window = timedelta(seconds=escalation_window_seconds)

        # Dedup state: (soulkey_id, anomaly_type) -> _DedupEntry
        self._dedup: dict[tuple, _DedupEntry] = {}

        # Always add log sink for all severities
        log_sink = LogAlertSink()
        for severity in self._sinks:
            self._sinks[severity].append(log_sink)

    def add_sink(self, sink: AlertSink, min_severity: str = SEVERITY_LOW) -> None:
        """
        Register an alert sink for all severities at or above min_severity.
        """
        severity_idx = SEVERITY_ORDER.index(min_severity) if min_severity in SEVERITY_ORDER else 0
        for severity in SEVERITY_ORDER[severity_idx:]:
            if sink not in self._sinks[severity]:
                self._sinks[severity].append(sink)

    async def route(self, anomaly: Anomaly) -> bool:
        """
        Route an anomaly to appropriate sinks.
        Returns True if the alert was sent, False if deduplicated.
        """
        key = (anomaly.soulkey_id, anomaly.type)
        now = datetime.now(timezone.utc)

        # Initialize or update dedup tracking
        if key not in self._dedup:
            self._dedup[key] = _DedupEntry(count=1, first_seen=now, last_alerted=now)
        else:
            entry = self._dedup[key]
            entry.count += 1

            # Reset if outside escalation window
            if now - entry.first_seen > self._escalation_window:
                self._dedup[key] = _DedupEntry(count=1, first_seen=now, last_alerted=now)
            else:
                # Check dedup cooldown
                if now - entry.last_alerted < self._cooldown:
                    # Check escalation: if count threshold hit within window, escalate
                    if entry.count >= self._escalation_count and not entry.escalated:
                        anomaly.severity = _escalate_severity(anomaly.severity)
                        anomaly.description = f"[ESCALATED x{entry.count}] {anomaly.description}"
                        entry.escalated = True
                        entry.last_alerted = now
                    else:
                        return False  # Deduplicated
                else:
                    entry.last_alerted = now

                    # Check escalation
                    if entry.count >= self._escalation_count and not entry.escalated:
                        anomaly.severity = _escalate_severity(anomaly.severity)
                        anomaly.description = f"[ESCALATED x{entry.count}] {anomaly.description}"
                        entry.escalated = True

        # Send to all sinks registered for this severity
        sinks = self._sinks.get(anomaly.severity, self._sinks[SEVERITY_LOW])
        for sink in sinks:
            try:
                await sink.send_alert(anomaly)
            except Exception as e:
                logger.warning(
                    "alert.sink_failed",
                    sink=type(sink).__name__,
                    error=str(e),
                )

        return True

    def clear_dedup_state(self):
        """Reset deduplication state (useful for testing)."""
        self._dedup.clear()
