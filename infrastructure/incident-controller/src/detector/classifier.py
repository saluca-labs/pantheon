"""Tiresias Incident Controller — Incident classifier.

Constructs fully populated Incident records from a correlated incident type,
severity level, and the contributing alerts.
"""

import logging

from src.detector.alert_receiver import Alert
from src.models.incident import Incident, IncidentType, Severity

logger = logging.getLogger("tiresias.detector.classifier")

# ---------------------------------------------------------------------------
# Human-readable title templates keyed by IncidentType
# ---------------------------------------------------------------------------

_TITLE_TEMPLATES: dict[IncidentType, str] = {
    IncidentType.SEC_WAF_BYPASS: "WAF Bypass Detected",
    IncidentType.SEC_UNAUTH_ACCESS: "Unauthorized Access Attempt",
    IncidentType.SEC_DATA_EXFIL: "Potential Data Exfiltration",
    IncidentType.SEC_KEY_COMPROMISE: "API Key / Secret Compromise",
    IncidentType.SVC_TOTAL_OUTAGE: "Total Service Outage",
    IncidentType.SVC_PARTIAL_DEGRADATION: "Partial Service Degradation",
    IncidentType.SVC_DB_UNREACHABLE: "Database Unreachable",
    IncidentType.SVC_CERT_EXPIRY: "TLS Certificate Expiring",
    IncidentType.INF_NODE_FAILURE: "Node Failure",
    IncidentType.INF_DISK_FULL: "Disk Space Exhausted",
    IncidentType.INF_MEMORY_EXHAUSTION: "Memory Exhaustion",
    IncidentType.INF_NETWORK_PARTITION: "Network Partition Detected",
}


class Classifier:
    """Creates Incident records from correlated alert data."""

    def classify(
        self,
        incident_type: IncidentType,
        severity: Severity,
        alerts: list[Alert],
    ) -> Incident:
        """Build a fully populated Incident from the given type, severity, and
        contributing alerts.

        Parameters
        ----------
        incident_type:
            The canonical type code determined by the correlator.
        severity:
            Severity level for the new incident.
        alerts:
            The contributing alerts that triggered this incident.

        Returns
        -------
        Incident
            A new ``Incident`` with auto-generated ID, human-readable title
            and description, and the source alerts attached.
        """
        incident_id = Incident.generate_id(incident_type)
        title = self._build_title(incident_type, alerts)
        description = self._build_description(alerts)

        source_alert_dicts = [
            {
                "fingerprint": a.fingerprint,
                "status": a.status,
                "labels": a.labels,
                "annotations": a.annotations,
                "starts_at": a.starts_at.isoformat() if a.starts_at else None,
                "values": a.values,
            }
            for a in alerts
        ]

        incident = Incident(
            id=incident_id,
            type=incident_type,
            severity=severity,
            title=title,
            description=description,
            source_alerts=source_alert_dicts,
        )

        incident.add_timeline_entry(
            source="incident_controller",
            event_type="incident_created",
            description=f"Incident {incident_id} created from {len(alerts)} alert(s)",
            details={"alert_fingerprints": [a.fingerprint for a in alerts]},
        )

        logger.info(
            "incident_classified",
            extra={
                "incident_id": incident_id,
                "type": incident_type.value,
                "severity": severity.value,
                "title": title,
                "alert_count": len(alerts),
            },
        )

        return incident

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_title(incident_type: IncidentType, alerts: list[Alert]) -> str:
        """Generate a human-readable title from the type and alert context."""
        base = _TITLE_TEMPLATES.get(incident_type, incident_type.value)

        # Try to extract a meaningful target from alert labels
        target_keys = ("instance", "host", "service", "job", "namespace")
        target = None
        for alert in alerts:
            for key in target_keys:
                if key in alert.labels:
                    target = alert.labels[key]
                    break
            if target:
                break

        if target:
            return f"{base} \u2014 {target}"
        return base

    @staticmethod
    def _build_description(alerts: list[Alert]) -> str:
        """Assemble a description from alert annotations."""
        parts: list[str] = []
        seen: set[str] = set()

        for alert in alerts:
            summary = alert.annotations.get(
                "summary",
                alert.annotations.get("description", ""),
            )
            if summary and summary not in seen:
                seen.add(summary)
                alertname = alert.labels.get("alertname", "alert")
                parts.append(f"[{alertname}] {summary}")

        return "\n".join(parts) if parts else "No description available."
