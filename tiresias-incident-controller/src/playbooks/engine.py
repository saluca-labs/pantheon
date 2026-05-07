"""Tiresias Incident Controller - Playbook Engine.

Orchestrates automated incident response by selecting and executing
playbooks based on incident severity. Each playbook defines a sequence
of remediation steps (network isolation, scaling, DNS failover, etc.)
that are executed in order with proper error handling and audit logging.
"""

import logging
from datetime import datetime
from pathlib import Path

import yaml

from src.actions.cloud_armor import CloudArmorAction
from src.actions.cloudflare import CloudflareAction
from src.actions.credential import CredentialAction
from src.actions.kubernetes import KubernetesAction
from src.actions.notification import NotificationAction
from src.forensics.collector import ForensicCollector
from src.models.incident import Incident, IncidentStatus, Severity
from src.rca.report_generator import RCAReportGenerator
from src.rca.timeline import TimelineBuilder


class PlaybookEngine:
    """Selects and executes incident-response playbooks.

    The engine loads playbook definitions from a YAML config file, matches
    them against incident severity, and drives each step through the
    appropriate action executor (Kubernetes, Cloudflare, Cloud Armor, etc.).
    """

    def __init__(self, config_path: str, **kwargs) -> None:
        self.log = logging.getLogger("PlaybookEngine")
        self.config = yaml.safe_load(Path(config_path).read_text())

        # Initialize core action executors
        self.k8s = KubernetesAction()
        self.notifier = NotificationAction(
            kwargs.get("notification_config", "")
        )

        # Store remaining config for lazy initialisation of optional executors
        self._kwargs = kwargs

    # ------------------------------------------------------------------
    # Playbook selection
    # ------------------------------------------------------------------

    def select_playbook(self, severity: Severity) -> dict | None:
        """Return the first playbook whose triggers include *severity*."""
        for pb in self.config.get("playbooks", []):
            if severity.value in pb.get("triggers", []):
                return pb
        return None

    # ------------------------------------------------------------------
    # Top-level execution
    # ------------------------------------------------------------------

    async def execute(self, incident: Incident) -> Incident:
        """Execute the matching playbook for *incident* end-to-end.

        Returns the updated incident with status, timeline entries, and
        any forensic / RCA artefacts attached.
        """
        playbook = self.select_playbook(incident.severity)
        if not playbook:
            self.log.warning("No playbook found for %s", incident.severity)
            return incident

        incident.playbook = playbook["name"]
        incident.status = IncidentStatus.RESPONDING
        incident.add_timeline_entry(
            "incident_controller",
            "playbook_started",
            f"Executing playbook: {playbook['name']}",
        )

        # Immediate notification
        await self.notifier.send_telegram(
            title=f"\U0001f6a8 {incident.severity.value}: {incident.title}",
            message=(
                f"Incident {incident.id} detected. "
                f"Executing playbook: {playbook['name']}"
            ),
            severity=incident.severity.value,
        )

        # Execute each step in sequence
        for step in playbook.get("steps", []):
            try:
                await self._execute_step(incident, step)
            except Exception as exc:
                self.log.error("Step %s failed: %s", step["action"], exc)
                incident.add_timeline_entry(
                    "incident_controller",
                    "step_failed",
                    f"Step {step['action']} failed: {exc}",
                )
                if step.get("critical", False):
                    break

        # Optional post-remediation phases
        if playbook.get("collect_forensics", False):
            await self._collect_forensics(incident)

        if playbook.get("generate_rca", False):
            await self._generate_rca(incident)

        # Resolve if every action completed successfully
        if incident.actions_taken and all(
            a.status == "completed" for a in incident.actions_taken
        ):
            incident.status = IncidentStatus.RESOLVED
            incident.resolved_at = datetime.utcnow()
            incident.resolved_by = "auto"

        # Final status notification
        status_icon = (
            "\u2705" if incident.status == IncidentStatus.RESOLVED else "\u26a0\ufe0f"
        )
        await self.notifier.send_telegram(
            title=f"{status_icon} {incident.id}",
            message=(
                f"Status: {incident.status.value}. "
                f"Actions: {len(incident.actions_taken)} completed."
            ),
            severity=incident.severity.value,
        )

        return incident

    # ------------------------------------------------------------------
    # Step dispatcher
    # ------------------------------------------------------------------

    async def _execute_step(self, incident: Incident, step: dict) -> None:
        """Execute a single playbook step and record the outcome."""
        action_type: str = step["action"]
        target: str = step.get("target", "")
        params: dict = step.get("params", {})

        action = incident.add_action(action_type, target)
        incident.add_timeline_entry(
            "incident_controller",
            "action_started",
            f"Executing: {action_type} on {target}",
        )

        await self._dispatch(incident, action_type, params)
        action.status = "completed"

    async def _dispatch(
        self, incident: Incident, action_type: str, params: dict
    ) -> None:
        """Route an action to the correct executor."""
        namespace = params.get("namespace", "tiresias")

        if action_type == "apply_network_policy":
            await self.k8s.apply_network_policy(
                namespace, params.get("policy")
            )

        elif action_type == "scale_deployment":
            replicas = params.get("replicas", 0)
            for dep in params.get("deployments", []):
                await self.k8s.scale_deployment(namespace, dep, replicas)

        elif action_type == "restart_deployment":
            await self.k8s.restart_deployment(
                namespace, params.get("deployment")
            )

        elif action_type == "cordon_nodes":
            await self.k8s.cordon_nodes(params.get("selector"))

        elif action_type == "suspend_soulkeys":
            cred = CredentialAction()
            await cred.suspend_all_soulkeys(
                self._kwargs.get("db_url", ""),
                f"Incident: {incident.id}",
            )

        elif action_type == "waf_block_ips":
            armor = CloudArmorAction()
            duration = params.get("duration_hours", 24)
            for ip in params.get("ips", []):
                await armor.block_ip(ip, duration)

        elif action_type == "swap_dns":
            cf = CloudflareAction(
                self._kwargs.get("cloudflare_token", ""),
                self._kwargs.get("cloudflare_zone_id", ""),
            )
            await cf.swap_dns(
                params["record_name"],
                params.get("record_type", "A"),
                params["new_value"],
            )

        elif action_type == "notify":
            await self.notifier.send_telegram(
                params.get("title", ""),
                params.get("message", ""),
                incident.severity.value,
            )

        else:
            self.log.warning("Unknown action type: %s", action_type)

    # ------------------------------------------------------------------
    # Forensics & RCA helpers
    # ------------------------------------------------------------------

    async def _collect_forensics(self, incident: Incident) -> None:
        """Capture a forensic snapshot and attach it to the incident."""
        collector = ForensicCollector(
            self._kwargs.get("gcs_bucket", "saluca-incident-forensics")
        )
        snapshot = await collector.collect(incident)
        incident.forensic_snapshot_id = snapshot.id
        incident.add_timeline_entry(
            "incident_controller",
            "forensics_collected",
            f"Forensic snapshot: {snapshot.storage_uri}",
        )

    async def _generate_rca(self, incident: Incident) -> None:
        """Build a timeline and generate an AI-assisted RCA report."""
        builder = TimelineBuilder(
            self._kwargs.get("db_url", ""),
            self._kwargs.get("loki_url", ""),
        )
        timeline = await builder.build(incident)

        generator = RCAReportGenerator(
            self._kwargs.get("anthropic_api_key")
        )
        await generator.generate(incident, timeline, None)

        incident.rca_report_path = f"/data/rca/{incident.id}.md"
        incident.add_timeline_entry(
            "incident_controller",
            "rca_generated",
            f"RCA report: {incident.rca_report_path}",
        )
