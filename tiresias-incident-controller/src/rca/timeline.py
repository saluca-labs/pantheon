"""Tiresias Incident Controller — Timeline Builder.

Aggregates events from Postgres audit tables, Loki log streams,
Kubernetes events, Prometheus alerts, and the incident's own action log
into a single chronological timeline for RCA analysis.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg
import httpx

from src.models import Incident, TimelineEntry

logger = logging.getLogger(__name__)

# How far outside the incident window (each side) to search for context
_WINDOW_PADDING = timedelta(hours=1)


class TimelineBuilder:
    """Constructs a merged, chronological timeline from every data source
    relevant to an incident."""

    def __init__(self, db_url: str, loki_url: str) -> None:
        self.db_url = db_url
        self.loki_url = loki_url

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def build(self, incident: Incident) -> list[TimelineEntry]:
        """Query all sources concurrently, merge, and sort by timestamp."""
        window_start = incident.detected_at - _WINDOW_PADDING
        window_end = (
            incident.resolved_at + _WINDOW_PADDING
            if incident.resolved_at
            else datetime.now(timezone.utc) + _WINDOW_PADDING
        )

        namespace = incident.metadata.get("namespace", "default")
        kubectl_path = incident.metadata.get("kubectl_path", "kubectl")
        prometheus_url = incident.metadata.get("prometheus_url", "")

        tasks = [
            self._soulauth_audit(window_start, window_end),
            self._soulwatch_detections(window_start, window_end),
            self._soulwatch_anomalies(window_start, window_end),
            self._cloud_armor_logs(window_start, window_end),
            self._kubernetes_events(namespace, kubectl_path),
            self._prometheus_alerts(prometheus_url, window_start, window_end),
            self._incident_controller_actions(incident),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        entries: list[TimelineEntry] = []
        labels = [
            "soulauth_audit", "soulwatch_detections", "soulwatch_anomalies",
            "cloud_armor", "kubernetes_events", "prometheus_alerts",
            "incident_controller",
        ]
        for label, result in zip(labels, results):
            if isinstance(result, Exception):
                logger.error("Timeline source %s failed: %s", label, result)
                continue
            entries.extend(result)

        entries.sort(key=lambda e: e.timestamp)
        logger.info(
            "Timeline built for %s — %d entries from %d sources",
            incident.id, len(entries), len(labels),
        )
        return entries

    # ------------------------------------------------------------------
    # Postgres sources
    # ------------------------------------------------------------------

    async def _query_pg(
        self,
        table: str,
        source_label: str,
        window_start: datetime,
        window_end: datetime,
    ) -> list[TimelineEntry]:
        """Generic helper to pull rows from a timestamped Postgres table."""
        entries: list[TimelineEntry] = []
        if not self.db_url:
            logger.warning("No db_url configured; skipping %s", table)
            return entries

        try:
            conn = await asyncpg.connect(self.db_url)
            try:
                rows = await conn.fetch(
                    f"SELECT * FROM {table} "
                    f"WHERE created_at >= $1 AND created_at <= $2 "
                    f"ORDER BY created_at",
                    window_start,
                    window_end,
                )
                for row in rows:
                    row_dict = dict(row)
                    entries.append(
                        TimelineEntry(
                            timestamp=row_dict.get("created_at", window_start),
                            source=source_label,
                            event_type=row_dict.get("event_type", table),
                            description=row_dict.get(
                                "description",
                                row_dict.get("message", f"{table} event"),
                            ),
                            details=_serialize_row(row_dict),
                            severity=row_dict.get("severity"),
                        )
                    )
            finally:
                await conn.close()
        except Exception as exc:
            logger.error("Failed to query %s: %s", table, exc)

        return entries

    async def _soulauth_audit(
        self, start: datetime, end: datetime
    ) -> list[TimelineEntry]:
        return await self._query_pg("_soulauth_audit", "soulauth_audit", start, end)

    async def _soulwatch_detections(
        self, start: datetime, end: datetime
    ) -> list[TimelineEntry]:
        return await self._query_pg(
            "_soulwatch_detections", "soulwatch_detections", start, end
        )

    async def _soulwatch_anomalies(
        self, start: datetime, end: datetime
    ) -> list[TimelineEntry]:
        return await self._query_pg(
            "_soulwatch_anomalies", "soulwatch_anomalies", start, end
        )

    # ------------------------------------------------------------------
    # Loki (Cloud Armor)
    # ------------------------------------------------------------------

    async def _cloud_armor_logs(
        self, start: datetime, end: datetime
    ) -> list[TimelineEntry]:
        """Query Loki for Cloud Armor WAF log entries."""
        if not self.loki_url:
            logger.warning("No loki_url configured; skipping Cloud Armor logs")
            return []

        entries: list[TimelineEntry] = []
        params = {
            "query": '{job="cloud-armor"}',
            "start": str(int(start.timestamp() * 1e9)),
            "end": str(int(end.timestamp() * 1e9)),
            "limit": 5000,
        }

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(
                    f"{self.loki_url.rstrip('/')}/loki/api/v1/query_range",
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()

            for stream in data.get("data", {}).get("result", []):
                labels = stream.get("stream", {})
                for ts_ns, line in stream.get("values", []):
                    ts = datetime.fromtimestamp(
                        int(ts_ns) / 1e9, tz=timezone.utc
                    )
                    entries.append(
                        TimelineEntry(
                            timestamp=ts,
                            source="cloud_armor",
                            event_type="waf_log",
                            description=line[:256],
                            details={"raw": line, "labels": labels},
                            severity=_infer_severity_from_waf(line),
                        )
                    )
        except Exception as exc:
            logger.error("Cloud Armor Loki query failed: %s", exc)

        return entries

    # ------------------------------------------------------------------
    # Kubernetes events
    # ------------------------------------------------------------------

    async def _kubernetes_events(
        self, namespace: str, kubectl_path: str
    ) -> list[TimelineEntry]:
        """Retrieve Kubernetes events via kubectl."""
        entries: list[TimelineEntry] = []
        try:
            proc = await asyncio.create_subprocess_exec(
                kubectl_path, "get", "events", "-n", namespace, "-o", "json",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                logger.error(
                    "kubectl get events failed: %s",
                    stderr.decode("utf-8", errors="replace"),
                )
                return entries

            data = json.loads(stdout.decode("utf-8", errors="replace"))
            for item in data.get("items", []):
                last_ts = item.get("lastTimestamp") or item.get(
                    "metadata", {}
                ).get("creationTimestamp", "")
                try:
                    ts = datetime.fromisoformat(
                        last_ts.replace("Z", "+00:00")
                    )
                except (ValueError, AttributeError):
                    ts = datetime.now(timezone.utc)

                entries.append(
                    TimelineEntry(
                        timestamp=ts,
                        source="kubernetes",
                        event_type=item.get("reason", "Unknown"),
                        description=item.get("message", ""),
                        details={
                            "kind": item.get("involvedObject", {}).get("kind"),
                            "name": item.get("involvedObject", {}).get("name"),
                            "count": item.get("count"),
                        },
                        severity=_k8s_event_severity(item),
                    )
                )
        except Exception as exc:
            logger.error("Kubernetes event collection failed: %s", exc)

        return entries

    # ------------------------------------------------------------------
    # Prometheus alerts
    # ------------------------------------------------------------------

    async def _prometheus_alerts(
        self,
        prometheus_url: str,
        start: datetime,
        end: datetime,
    ) -> list[TimelineEntry]:
        """Query the Prometheus /api/v1/query endpoint for ALERTS."""
        if not prometheus_url:
            logger.warning("No prometheus_url configured; skipping alerts")
            return []

        entries: list[TimelineEntry] = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{prometheus_url.rstrip('/')}/api/v1/query",
                    params={"query": "ALERTS", "time": str(end.timestamp())},
                )
                resp.raise_for_status()
                data = resp.json()

            for result in data.get("data", {}).get("result", []):
                metric = result.get("metric", {})
                value = result.get("value", [])
                ts = (
                    datetime.fromtimestamp(float(value[0]), tz=timezone.utc)
                    if value
                    else datetime.now(timezone.utc)
                )
                entries.append(
                    TimelineEntry(
                        timestamp=ts,
                        source="prometheus",
                        event_type="alert",
                        description=metric.get("alertname", "unknown_alert"),
                        details=metric,
                        severity=metric.get("severity"),
                    )
                )
        except Exception as exc:
            logger.error("Prometheus alert query failed: %s", exc)

        return entries

    # ------------------------------------------------------------------
    # Incident controller's own actions
    # ------------------------------------------------------------------

    async def _incident_controller_actions(
        self, incident: Incident
    ) -> list[TimelineEntry]:
        """Convert the incident's ``actions_taken`` log into timeline entries."""
        entries: list[TimelineEntry] = []
        for action in incident.actions_taken:
            entries.append(
                TimelineEntry(
                    timestamp=action.timestamp,
                    source="incident_controller",
                    event_type=action.action_type,
                    description=f"{action.action_type} on {action.target} — {action.status}",
                    details={
                        "action_id": action.id,
                        "target": action.target,
                        "status": action.status,
                        "duration_ms": action.duration_ms,
                        **(action.details or {}),
                    },
                    severity=None,
                )
            )
        return entries


# ----------------------------------------------------------------------
# Module-level helpers
# ----------------------------------------------------------------------

def _serialize_row(row: dict) -> dict:
    """Convert a Postgres row dict to JSON-safe types."""
    out: dict = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, bytes):
            out[k] = v.hex()
        else:
            out[k] = v
    return out


def _infer_severity_from_waf(line: str) -> Optional[str]:
    """Rough heuristic to assign severity from a WAF log line."""
    lower = line.lower()
    if any(w in lower for w in ("blocked", "denied", "forbidden")):
        return "high"
    if any(w in lower for w in ("rate_limited", "throttled")):
        return "medium"
    return "low"


def _k8s_event_severity(event: dict) -> Optional[str]:
    """Map Kubernetes event type to a severity string."""
    etype = event.get("type", "Normal")
    if etype == "Warning":
        return "medium"
    return "low"
