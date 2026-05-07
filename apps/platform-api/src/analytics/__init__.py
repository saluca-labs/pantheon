"""
Anomaly detection and behavioral analytics for SoulAuth.
Detects unusual agent behavior patterns — rate spikes, off-hours access,
scope escalation, credential stuffing, and other indicators of compromise.
"""

from src.analytics.baseline import AgentBaseline, BaselineEngine
from src.analytics.detector import AnomalyType, Anomaly, AnomalyDetector
from src.analytics.alerts import (
    AlertSink,
    LogAlertSink,
    WebhookAlertSink,
    TelegramAlertSink,
    PrometheusAlertSink,
    AlertRouter,
)

__all__ = [
    "AgentBaseline",
    "BaselineEngine",
    "AnomalyType",
    "Anomaly",
    "AnomalyDetector",
    "AlertSink",
    "LogAlertSink",
    "WebhookAlertSink",
    "TelegramAlertSink",
    "PrometheusAlertSink",
    "AlertRouter",
]
