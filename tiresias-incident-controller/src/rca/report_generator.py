"""Tiresias Incident Controller — RCA Report Generator.

Produces a structured Markdown Root Cause Analysis report following the
template defined in spec Section 8.4.  When an Anthropic API key is
provided, the timeline and incident context are sent to Claude for
automated root-cause identification and remediation recommendations.
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

from src.models import ForensicSnapshot, Incident, TimelineEntry

logger = logging.getLogger(__name__)

_RCA_OUTPUT_DIR = Path("/data/rca")
_CLAUDE_MODEL = "claude-sonnet-4-6"


class RCAReportGenerator:
    """Generate a full Markdown RCA report, optionally enriched by Claude."""

    def __init__(self, anthropic_api_key: Optional[str] = None) -> None:
        self.anthropic_api_key = anthropic_api_key or os.getenv("ANTHROPIC_API_KEY")

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def generate(
        self,
        incident: Incident,
        timeline: list[TimelineEntry],
        forensic_snapshot: ForensicSnapshot,
    ) -> str:
        """Build the RCA report and persist it to disk.

        Returns the full Markdown content.
        """
        # Calculate response metrics
        ttd, ttr, ttrc = self._calculate_metrics(incident)

        # Optionally get AI-driven root-cause analysis
        ai_analysis: Optional[dict] = None
        if self.anthropic_api_key:
            ai_analysis = await self._analyze_with_claude(incident, timeline)

        report = self._render_report(
            incident=incident,
            timeline=timeline,
            forensic_snapshot=forensic_snapshot,
            ttd=ttd,
            ttr=ttr,
            ttrc=ttrc,
            ai_analysis=ai_analysis,
        )

        # Persist to disk
        output_path = _RCA_OUTPUT_DIR / f"{incident.id}.md"
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(report, encoding="utf-8")
            logger.info("RCA report written to %s", output_path)
        except Exception as exc:
            logger.error("Failed to write RCA report to %s: %s", output_path, exc)

        return report

    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------

    @staticmethod
    def _calculate_metrics(
        incident: Incident,
    ) -> tuple[Optional[str], Optional[str], Optional[str]]:
        """Return human-readable TTD, TTR, and TTRC strings.

        - TTD  = Time to Detect  (first alert -> incident created)
        - TTR  = Time to Respond (incident created -> first action)
        - TTRC = Time to Recover (incident created -> resolved)
        """
        ttd = ttr = ttrc = None

        # TTD: earliest source alert to detected_at
        if incident.source_alerts:
            earliest_alert_ts = None
            for alert in incident.source_alerts:
                ts_raw = alert.get("startsAt") or alert.get("timestamp")
                if ts_raw:
                    try:
                        ts = datetime.fromisoformat(
                            str(ts_raw).replace("Z", "+00:00")
                        )
                        if earliest_alert_ts is None or ts < earliest_alert_ts:
                            earliest_alert_ts = ts
                    except (ValueError, TypeError):
                        pass
            if earliest_alert_ts:
                delta = incident.detected_at - earliest_alert_ts
                ttd = _format_duration(delta.total_seconds())

        # TTR: detected_at -> first action timestamp
        if incident.actions_taken:
            first_action = min(incident.actions_taken, key=lambda a: a.timestamp)
            delta = first_action.timestamp - incident.detected_at
            ttr = _format_duration(delta.total_seconds())

        # TTRC: detected_at -> resolved_at
        if incident.resolved_at:
            delta = incident.resolved_at - incident.detected_at
            ttrc = _format_duration(delta.total_seconds())

        return ttd, ttr, ttrc

    # ------------------------------------------------------------------
    # Claude analysis
    # ------------------------------------------------------------------

    async def _analyze_with_claude(
        self,
        incident: Incident,
        timeline: list[TimelineEntry],
    ) -> Optional[dict]:
        """Send incident context and timeline to Claude for structured
        root-cause analysis.

        Returns a dict with keys: root_cause, contributing_factors,
        impact_assessment, remediation_immediate, remediation_short_term,
        remediation_long_term.
        """
        timeline_text = "\n".join(
            f"[{e.timestamp.isoformat()}] [{e.source}] {e.event_type}: "
            f"{e.description}"
            for e in timeline
        )

        prompt = (
            "You are a senior Site Reliability Engineer performing a Root "
            "Cause Analysis for a production incident.\n\n"
            f"## Incident\n"
            f"- ID: {incident.id}\n"
            f"- Type: {incident.type.value}\n"
            f"- Severity: {incident.severity.value}\n"
            f"- Title: {incident.title}\n"
            f"- Description: {incident.description}\n"
            f"- Detected at: {incident.detected_at.isoformat()}\n"
            f"- Resolved at: {incident.resolved_at.isoformat() if incident.resolved_at else 'ONGOING'}\n\n"
            f"## Timeline ({len(timeline)} events)\n{timeline_text}\n\n"
            "Respond with a JSON object (no markdown fences) containing:\n"
            '- "root_cause": string — concise root cause statement\n'
            '- "contributing_factors": list of strings\n'
            '- "impact_assessment": string — scope and blast radius\n'
            '- "remediation_immediate": list of strings — actions to take now\n'
            '- "remediation_short_term": list of strings — this sprint\n'
            '- "remediation_long_term": list of strings — next quarter\n'
        )

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": self.anthropic_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": _CLAUDE_MODEL,
                        "max_tokens": 4096,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                resp.raise_for_status()
                content = resp.json()["content"][0]["text"]
                return json.loads(content)
        except Exception as exc:
            logger.error("Claude RCA analysis failed: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Report rendering
    # ------------------------------------------------------------------

    def _render_report(
        self,
        incident: Incident,
        timeline: list[TimelineEntry],
        forensic_snapshot: ForensicSnapshot,
        ttd: Optional[str],
        ttr: Optional[str],
        ttrc: Optional[str],
        ai_analysis: Optional[dict],
    ) -> str:
        """Render the full Markdown RCA report."""
        sections: list[str] = []

        # Title
        sections.append(f"# Root Cause Analysis: {incident.id}\n")

        # Executive Summary
        sections.append("## Executive Summary\n")
        if ai_analysis:
            sections.append(ai_analysis.get("root_cause", "_To be determined._"))
        else:
            sections.append(
                "_[ Placeholder: Provide a 2-3 sentence executive summary "
                "of the incident, its root cause, and resolution. ]_"
            )
        sections.append("")

        # Incident Details table
        sections.append("## Incident Details\n")
        sections.append("| Field | Value |")
        sections.append("|-------|-------|")
        sections.append(f"| **Incident ID** | `{incident.id}` |")
        sections.append(f"| **Type** | {incident.type.value} |")
        sections.append(f"| **Severity** | {incident.severity.value} |")
        sections.append(f"| **Title** | {incident.title} |")
        sections.append(f"| **Status** | {incident.status.value} |")
        sections.append(
            f"| **Detected** | {incident.detected_at.isoformat()} |"
        )
        sections.append(
            f"| **Resolved** | "
            f"{incident.resolved_at.isoformat() if incident.resolved_at else 'ONGOING'} |"
        )
        sections.append(f"| **Resolved By** | {incident.resolved_by or 'N/A'} |")
        sections.append(f"| **TTD** | {ttd or 'N/A'} |")
        sections.append(f"| **TTR** | {ttr or 'N/A'} |")
        sections.append(f"| **TTRC** | {ttrc or 'N/A'} |")
        sections.append("")

        # Timeline
        sections.append("## Timeline\n")
        sections.append("| Timestamp | Source | Event | Description | Severity |")
        sections.append("|-----------|--------|-------|-------------|----------|")
        for entry in timeline:
            sections.append(
                f"| {entry.timestamp.isoformat()} "
                f"| {entry.source} "
                f"| {entry.event_type} "
                f"| {_escape_md(entry.description[:120])} "
                f"| {entry.severity or '-'} |"
            )
        sections.append("")

        # Root Cause
        sections.append("## Root Cause\n")
        if ai_analysis:
            sections.append(ai_analysis.get("root_cause", "_To be determined._"))
            if ai_analysis.get("contributing_factors"):
                sections.append("\n### Contributing Factors\n")
                for factor in ai_analysis["contributing_factors"]:
                    sections.append(f"- {factor}")
        else:
            sections.append(
                "_[ Placeholder: Describe the root cause of the incident. "
                "Use the 5-Whys technique or fishbone analysis. ]_"
            )
        sections.append("")

        # Impact Assessment
        sections.append("## Impact Assessment\n")
        if ai_analysis and ai_analysis.get("impact_assessment"):
            sections.append(ai_analysis["impact_assessment"])
        else:
            sections.append(
                "_[ Placeholder: Describe the scope and blast radius. "
                "Include affected users, services, and data. ]_"
            )
        sections.append("")

        # Response Assessment
        sections.append("## Response Assessment\n")
        sections.append(
            f"- **Actions taken:** {len(incident.actions_taken)}"
        )
        if incident.actions_taken:
            for action in incident.actions_taken:
                sections.append(
                    f"  - `{action.action_type}` on `{action.target}` "
                    f"({action.status})"
                    + (f" — {action.duration_ms}ms" if action.duration_ms else "")
                )
        sections.append(f"- **Playbook used:** {incident.playbook or 'N/A'}")
        sections.append("")

        # Remediation
        sections.append("## Remediation\n")
        if ai_analysis:
            sections.append("### Immediate Actions\n")
            for item in ai_analysis.get("remediation_immediate", []):
                sections.append(f"- [ ] {item}")
            sections.append("\n### Short-Term (This Sprint)\n")
            for item in ai_analysis.get("remediation_short_term", []):
                sections.append(f"- [ ] {item}")
            sections.append("\n### Long-Term (Next Quarter)\n")
            for item in ai_analysis.get("remediation_long_term", []):
                sections.append(f"- [ ] {item}")
        else:
            sections.append("### Immediate Actions\n")
            sections.append("- [ ] _[ List immediate remediation steps ]_\n")
            sections.append("### Short-Term (This Sprint)\n")
            sections.append("- [ ] _[ List short-term improvements ]_\n")
            sections.append("### Long-Term (Next Quarter)\n")
            sections.append("- [ ] _[ List long-term architectural changes ]_")
        sections.append("")

        # Evidence Links
        sections.append("## Evidence\n")
        sections.append(
            f"- **Forensic snapshot:** `{forensic_snapshot.storage_uri}`"
        )
        sections.append(
            f"- **Snapshot ID:** `{forensic_snapshot.id}`"
        )
        if forensic_snapshot.artifacts:
            sections.append(f"- **Artifacts ({len(forensic_snapshot.artifacts)}):**")
            for art in forensic_snapshot.artifacts:
                sections.append(
                    f"  - `{art['path']}` "
                    f"(SHA-256: `{art.get('hash_sha256', 'N/A')[:16]}...`)"
                )
        sections.append("")

        # Footer
        sections.append("---")
        sections.append(
            f"*Report generated at "
            f"{datetime.now(timezone.utc).isoformat()} by Tiresias Incident Controller*"
        )

        return "\n".join(sections) + "\n"


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def _format_duration(seconds: float) -> str:
    """Convert seconds to a human-readable duration string."""
    if seconds < 0:
        return "N/A"
    total = int(abs(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


def _escape_md(text: str) -> str:
    """Escape pipe characters for Markdown table cells."""
    return text.replace("|", "\\|").replace("\n", " ")
