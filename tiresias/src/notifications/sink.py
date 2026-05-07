"""
DB-backed notification AlertSink.

ChannelNotificationSink implements AlertSink so it can be plugged into the
existing AlertRouter. On each anomaly, it queries _notification_channels
for the tenant's enabled channels whose severity_threshold is met, decrypts
their config, and dispatches to the appropriate enterprise sink.

This bridges the gap between the analytics pipeline (AlertRouter) and the
per-tenant notification channels configured via the CRUD API.
"""

from __future__ import annotations

import json
from typing import Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.analytics.alerts import AlertSink
from src.analytics.detector import Anomaly, SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH, SEVERITY_CRITICAL
from src.database.models import NotificationChannel, Soulkey
from src.idp.encryption import decrypt_secret

logger = structlog.get_logger(__name__)

# Severity ordering for threshold comparison
_SEVERITY_RANK = {
    SEVERITY_LOW: 0,
    SEVERITY_MEDIUM: 1,
    SEVERITY_HIGH: 2,
    SEVERITY_CRITICAL: 3,
}


def _meets_threshold(anomaly_severity: str, channel_threshold: str) -> bool:
    """Return True if the anomaly severity meets or exceeds the channel threshold."""
    return _SEVERITY_RANK.get(anomaly_severity, 0) >= _SEVERITY_RANK.get(channel_threshold, 1)


class ChannelNotificationSink(AlertSink):
    """
    AlertSink that dispatches to per-tenant DB-configured notification channels.

    Requires a session factory to query the database. Resolves tenant_id from
    the anomaly's soulkey_id, then queries active channels and dispatches.
    """

    def __init__(self, session_factory):
        self._session_factory = session_factory

    async def send_alert(self, anomaly: Anomaly) -> None:
        """Query DB channels for the tenant and dispatch to each matching one."""
        try:
            async with self._session_factory() as db:
                # Resolve tenant_id from soulkey
                tenant_id = await self._resolve_tenant(db, anomaly.soulkey_id)
                if not tenant_id:
                    return

                # Query enabled channels for this tenant
                result = await db.execute(
                    select(NotificationChannel).where(
                        NotificationChannel.tenant_id == tenant_id,
                        NotificationChannel.enabled == True,
                    )
                )
                channels = result.scalars().all()

                for channel in channels:
                    if not _meets_threshold(anomaly.severity, channel.severity_threshold):
                        continue

                    try:
                        config = json.loads(decrypt_secret(channel.config_encrypted))
                        await self._dispatch(channel.channel_type, config, anomaly)
                    except Exception as e:
                        logger.warning(
                            "notification.channel_dispatch_failed",
                            channel_id=str(channel.id),
                            channel_type=channel.channel_type,
                            error=str(e),
                        )

        except Exception as e:
            logger.warning("notification.sink_failed", error=str(e))

    async def _resolve_tenant(self, db: AsyncSession, soulkey_id) -> Optional:
        """Look up tenant_id from soulkey_id."""
        result = await db.execute(
            select(Soulkey.tenant_id).where(Soulkey.id == soulkey_id)
        )
        row = result.scalar_one_or_none()
        return row

    async def _dispatch(self, channel_type: str, config: dict, anomaly: Anomaly) -> None:
        """Send to a specific channel type using its config."""
        import httpx

        payload = {
            "source": "tiresias",
            "type": anomaly.type.value,
            "severity": anomaly.severity,
            "description": anomaly.description,
            "agent": str(anomaly.soulkey_id),
            "timestamp": anomaly.timestamp.isoformat(),
            "evidence": anomaly.evidence,
        }

        if channel_type == "slack":
            webhook_url = config.get("webhook_url", "")
            if not webhook_url:
                return
            blocks = [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": f"[{anomaly.severity.upper()}] {anomaly.type.value}"},
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": anomaly.description},
                },
                {
                    "type": "context",
                    "elements": [
                        {"type": "mrkdwn", "text": f"Agent: `{anomaly.soulkey_id}`"},
                        {"type": "mrkdwn", "text": f"Time: {anomaly.timestamp.isoformat()}"},
                    ],
                },
            ]
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(webhook_url, json={"blocks": blocks, "text": anomaly.description})

        elif channel_type == "pagerduty":
            routing_key = config.get("routing_key", "")
            if not routing_key:
                return
            severity_map = {"low": "info", "medium": "warning", "high": "error", "critical": "critical"}
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    "https://events.pagerduty.com/v2/enqueue",
                    json={
                        "routing_key": routing_key,
                        "event_action": "trigger",
                        "payload": {
                            "summary": f"[Tiresias] {anomaly.type.value}: {anomaly.description}",
                            "severity": severity_map.get(anomaly.severity, "warning"),
                            "source": f"tiresias-{anomaly.soulkey_id}",
                            "custom_details": payload,
                        },
                        "dedup_key": f"tiresias-{anomaly.soulkey_id}-{anomaly.type.value}",
                    },
                )

        elif channel_type == "teams":
            webhook_url = config.get("webhook_url", "")
            if not webhook_url:
                return
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(webhook_url, json={
                    "text": f"**[{anomaly.severity.upper()}]** {anomaly.type.value}\n\n{anomaly.description}\n\nAgent: `{anomaly.soulkey_id}`",
                })

        elif channel_type == "webhook":
            url = config.get("url", config.get("webhook_url", ""))
            headers = config.get("headers", {})
            if not url:
                return
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(url, json=payload, headers=headers)

        elif channel_type == "opsgenie":
            api_key = config.get("api_key", "")
            if not api_key:
                return
            priority_map = {"low": "P5", "medium": "P3", "high": "P2", "critical": "P1"}
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    "https://api.opsgenie.com/v2/alerts",
                    headers={"Authorization": f"GenieKey {api_key}"},
                    json={
                        "message": f"[Tiresias] {anomaly.type.value}",
                        "description": anomaly.description,
                        "priority": priority_map.get(anomaly.severity, "P3"),
                        "tags": ["tiresias", anomaly.severity],
                        "details": payload,
                    },
                )

        elif channel_type == "email":
            # Email is async-heavy (SMTP). Log intent; actual SMTP dispatch
            # would use the existing EmailAlertSink from integrations module.
            logger.info(
                "notification.email_queued",
                to=config.get("to_addresses"),
                severity=anomaly.severity,
            )

        elif channel_type == "sns":
            # SNS requires boto3; log intent for now
            logger.info(
                "notification.sns_queued",
                topic=config.get("topic_arn"),
                severity=anomaly.severity,
            )

        logger.debug(
            "notification.dispatched",
            channel_type=channel_type,
            severity=anomaly.severity,
            agent=str(anomaly.soulkey_id),
        )
