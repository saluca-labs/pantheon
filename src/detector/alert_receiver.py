"""Tiresias Incident Controller — Grafana alert receiver.

Parses incoming Grafana unified alerting webhook payloads into normalised
Alert dataclass instances for downstream correlation and classification.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

logger = logging.getLogger("tiresias.detector.alert_receiver")


# ---------------------------------------------------------------------------
# Normalised alert representation
# ---------------------------------------------------------------------------

@dataclass
class Alert:
    """A single normalised alert derived from a Grafana webhook payload."""

    fingerprint: str
    status: str  # "firing" or "resolved"
    labels: dict = field(default_factory=dict)
    annotations: dict = field(default_factory=dict)
    starts_at: Optional[datetime] = None
    values: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Receiver
# ---------------------------------------------------------------------------

class AlertReceiver:
    """Parses Grafana unified alerting webhook payloads."""

    @staticmethod
    def _parse_timestamp(raw: Optional[str]) -> Optional[datetime]:
        """Best-effort ISO-8601 timestamp parsing."""
        if not raw:
            return None
        # Grafana sends RFC-3339 timestamps; strip trailing Z or offset info
        # that fromisoformat in older Python versions cannot handle.
        try:
            cleaned = raw.replace("Z", "+00:00")
            return datetime.fromisoformat(cleaned)
        except (ValueError, TypeError):
            logger.warning("unparseable_timestamp", extra={"raw": raw})
            return None

    def parse_grafana_alert(self, payload: dict) -> list[Alert]:
        """Parse a Grafana unified alerting webhook body into Alert objects.

        Parameters
        ----------
        payload:
            The full JSON body sent by Grafana.  Expected top-level keys:
            ``receiver``, ``status``, ``alerts`` (list).

        Returns
        -------
        list[Alert]
            One ``Alert`` per entry in ``payload["alerts"]``.
        """
        receiver = payload.get("receiver", "unknown")
        group_status = payload.get("status", "unknown")
        raw_alerts: list[dict] = payload.get("alerts", [])

        logger.info(
            "grafana_webhook_received",
            extra={
                "receiver": receiver,
                "group_status": group_status,
                "alert_count": len(raw_alerts),
            },
        )

        parsed: list[Alert] = []
        for raw in raw_alerts:
            alert = Alert(
                fingerprint=raw.get("fingerprint", ""),
                status=raw.get("status", group_status),
                labels=raw.get("labels", {}),
                annotations=raw.get("annotations", {}),
                starts_at=self._parse_timestamp(raw.get("startsAt")),
                values=raw.get("values", {}),
            )
            parsed.append(alert)

            logger.info(
                "alert_parsed",
                extra={
                    "fingerprint": alert.fingerprint,
                    "status": alert.status,
                    "alertname": alert.labels.get("alertname", ""),
                    "severity": alert.labels.get("severity", ""),
                },
            )

        return parsed
