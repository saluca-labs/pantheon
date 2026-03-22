"""Tiresias Incident Controller — Notification action executor.

Sends alerts to Telegram, Linear, and email via configured webhooks/APIs.
Notification channels are determined by incident severity and the
notifications.yaml configuration file.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import httpx
import yaml

from src.actions.base import ActionExecutor
from src.models.incident import ActionRecord, Incident

log = logging.getLogger(__name__)

TELEGRAM_WEBHOOK_URL = "http://100.100.85.53:8080/notify/telegram"


class NotificationAction(ActionExecutor):
    """Send notifications across configured channels."""

    def __init__(self, config_path: str) -> None:
        super().__init__()
        self.config_path = config_path
        self.config = self._load_config(config_path)

    # ------------------------------------------------------------------
    # Config
    # ------------------------------------------------------------------

    @staticmethod
    def _load_config(config_path: str) -> dict[str, Any]:
        """Load notifications.yaml configuration."""
        path = Path(config_path)
        if not path.exists():
            log.warning(f"Notification config not found: {config_path}")
            return {}
        with open(path) as f:
            return yaml.safe_load(f) or {}

    def _get_channels_for_severity(self, severity: str) -> list[str]:
        """Return the list of notification channels for a severity level."""
        severity_config = self.config.get("severity_channels", {})
        return severity_config.get(severity, severity_config.get("default", ["telegram"]))

    # ------------------------------------------------------------------
    # Telegram
    # ------------------------------------------------------------------

    async def send_telegram(
        self, title: str, message: str, severity: str
    ) -> dict:
        """Send a Telegram notification via the alfred_backend webhook."""
        payload = {
            "title": title,
            "message": message,
            "severity": severity,
            "source": "tiresias-incident-controller",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(TELEGRAM_WEBHOOK_URL, json=payload)
            resp.raise_for_status()
        self.log.info(f"Telegram notification sent: {title}")
        return {"channel": "telegram", "status": "sent", "title": title}

    # ------------------------------------------------------------------
    # Linear
    # ------------------------------------------------------------------

    async def create_linear_ticket(
        self,
        title: str,
        description: str,
        priority: int = 1,
        labels: list[str] | None = None,
    ) -> dict:
        """Create a Linear issue for incident tracking."""
        linear_config = self.config.get("linear", {})
        api_key = linear_config.get("api_key", "")
        team_id = linear_config.get("team_id", "")

        if not api_key or not team_id:
            raise RuntimeError("Linear API key or team_id not configured")

        mutation = """
        mutation CreateIssue($title: String!, $description: String, $teamId: String!, $priority: Int, $labelIds: [String!]) {
            issueCreate(input: {title: $title, description: $description, teamId: $teamId, priority: $priority, labelIds: $labelIds}) {
                success
                issue { id identifier url }
            }
        }
        """
        variables = {
            "title": title,
            "description": description,
            "teamId": team_id,
            "priority": priority,
        }
        if labels:
            variables["labelIds"] = labels

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.linear.app/graphql",
                json={"query": mutation, "variables": variables},
                headers={
                    "Authorization": api_key,
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        issue = data.get("data", {}).get("issueCreate", {}).get("issue", {})
        self.log.info(f"Linear ticket created: {issue.get('identifier', 'unknown')}")
        return {
            "channel": "linear",
            "status": "created",
            "issue_id": issue.get("id"),
            "identifier": issue.get("identifier"),
            "url": issue.get("url"),
        }

    # ------------------------------------------------------------------
    # Email (Resend)
    # ------------------------------------------------------------------

    async def send_email(self, to: str, subject: str, body: str) -> dict:
        """Send an email notification via the Resend API."""
        resend_config = self.config.get("resend", {})
        api_key = resend_config.get("api_key", "")
        from_address = resend_config.get("from", "incidents@saluca.io")

        if not api_key:
            raise RuntimeError("Resend API key not configured")

        payload = {
            "from": from_address,
            "to": to,
            "subject": subject,
            "html": body,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        self.log.info(f"Email sent to {to}: {subject}")
        return {
            "channel": "email",
            "status": "sent",
            "email_id": data.get("id"),
            "to": to,
        }

    # ------------------------------------------------------------------
    # Incident-level notification
    # ------------------------------------------------------------------

    async def notify_incident(
        self, incident: Incident, template: str
    ) -> dict:
        """Render a template and send notifications to all channels
        configured for the incident's severity level."""
        severity = incident.severity.value
        channels = self._get_channels_for_severity(severity)
        results: list[dict] = []

        rendered_title = f"[{severity}] {incident.title}"
        rendered_body = template.format(
            incident_id=incident.id,
            severity=severity,
            title=incident.title,
            description=incident.description,
            status=incident.status.value,
            detected_at=incident.detected_at.isoformat(),
            type=incident.type.value,
        )

        for channel in channels:
            try:
                if channel == "telegram":
                    result = await self.send_telegram(
                        rendered_title, rendered_body, severity
                    )
                elif channel == "linear":
                    result = await self.create_linear_ticket(
                        rendered_title, rendered_body
                    )
                elif channel == "email":
                    email_config = self.config.get("email", {})
                    recipients = email_config.get("recipients", {}).get(
                        severity, email_config.get("default_to", [])
                    )
                    for to_addr in recipients:
                        result = await self.send_email(
                            to_addr, rendered_title, rendered_body
                        )
                        results.append(result)
                    continue
                else:
                    self.log.warning(f"Unknown channel: {channel}")
                    continue
                results.append(result)
            except Exception as e:
                self.log.error(f"Failed to notify via {channel}: {e}")
                results.append({"channel": channel, "status": "failed", "error": str(e)})

        return {"notifications": results, "channels": channels}

    # ------------------------------------------------------------------
    # ActionExecutor interface
    # ------------------------------------------------------------------

    async def _execute(self, action: ActionRecord, **kwargs) -> dict | None:
        """Dispatch to the correct notification method."""
        dispatch = {
            "send_telegram": self.send_telegram,
            "create_linear_ticket": self.create_linear_ticket,
            "send_email": self.send_email,
            "notify_incident": self.notify_incident,
        }
        handler = dispatch.get(action.action_type)
        if handler is None:
            raise ValueError(f"Unknown action_type: {action.action_type}")
        return await handler(**kwargs)
