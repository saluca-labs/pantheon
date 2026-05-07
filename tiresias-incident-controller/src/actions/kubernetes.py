"""Tiresias Incident Controller — Kubernetes action executor.

Wraps kubectl commands via asyncio subprocess for quarantine, scaling,
restart, cordon/uncordon, log capture, and cluster state inspection.
"""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from pathlib import Path

from src.actions.base import ActionExecutor
from src.models.incident import ActionRecord

log = logging.getLogger(__name__)


class KubernetesAction(ActionExecutor):
    """Execute kubectl operations with structured logging and rollback."""

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    async def _run_kubectl(self, args: list[str]) -> tuple[str, str, int]:
        """Run a kubectl command and return (stdout, stderr, returncode)."""
        cmd = ["kubectl", *args]
        self.log.debug(f"kubectl {' '.join(args)}")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await proc.communicate()
        stdout = stdout_bytes.decode().strip()
        stderr = stderr_bytes.decode().strip()
        if proc.returncode != 0:
            self.log.error(f"kubectl failed (rc={proc.returncode}): {stderr}")
        return stdout, stderr, proc.returncode

    # ------------------------------------------------------------------
    # Network Policy
    # ------------------------------------------------------------------

    async def apply_network_policy(
        self, namespace: str, policy_yaml: str
    ) -> dict:
        """Apply a quarantine NetworkPolicy from a YAML string."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as tmp:
            tmp.write(policy_yaml)
            tmp_path = tmp.name

        try:
            stdout, stderr, rc = await self._run_kubectl(
                ["apply", "-n", namespace, "-f", tmp_path]
            )
            if rc != 0:
                raise RuntimeError(f"apply_network_policy failed: {stderr}")
            return {"output": stdout}
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    async def remove_network_policy(
        self, namespace: str, policy_name: str
    ) -> dict:
        """Remove (rollback) a NetworkPolicy by name."""
        stdout, stderr, rc = await self._run_kubectl(
            ["delete", "networkpolicy", policy_name, "-n", namespace, "--ignore-not-found"]
        )
        if rc != 0:
            raise RuntimeError(f"remove_network_policy failed: {stderr}")
        return {"output": stdout}

    # ------------------------------------------------------------------
    # Deployment management
    # ------------------------------------------------------------------

    async def scale_deployment(
        self, namespace: str, deployment: str, replicas: int
    ) -> dict:
        """Scale a deployment to the specified replica count."""
        stdout, stderr, rc = await self._run_kubectl(
            ["scale", f"deployment/{deployment}", f"--replicas={replicas}", "-n", namespace]
        )
        if rc != 0:
            raise RuntimeError(f"scale_deployment failed: {stderr}")
        return {"output": stdout, "replicas": replicas}

    async def restart_deployment(self, namespace: str, deployment: str) -> dict:
        """Perform a rollout restart of a deployment."""
        stdout, stderr, rc = await self._run_kubectl(
            ["rollout", "restart", f"deployment/{deployment}", "-n", namespace]
        )
        if rc != 0:
            raise RuntimeError(f"restart_deployment failed: {stderr}")
        return {"output": stdout}

    # ------------------------------------------------------------------
    # Node management
    # ------------------------------------------------------------------

    async def cordon_nodes(self, selector: str) -> dict:
        """Cordon nodes matching the given label selector."""
        stdout, stderr, rc = await self._run_kubectl(
            ["cordon", "-l", selector]
        )
        if rc != 0:
            raise RuntimeError(f"cordon_nodes failed: {stderr}")
        return {"output": stdout, "selector": selector}

    async def uncordon_nodes(self, selector: str) -> dict:
        """Uncordon (rollback) nodes matching the given label selector."""
        stdout, stderr, rc = await self._run_kubectl(
            ["uncordon", "-l", selector]
        )
        if rc != 0:
            raise RuntimeError(f"uncordon_nodes failed: {stderr}")
        return {"output": stdout, "selector": selector}

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------

    async def get_pod_logs(
        self, namespace: str, pod: str, since: str = "1h"
    ) -> dict:
        """Capture pod logs for the given time window."""
        stdout, stderr, rc = await self._run_kubectl(
            ["logs", pod, "-n", namespace, f"--since={since}", "--tail=5000"]
        )
        if rc != 0:
            raise RuntimeError(f"get_pod_logs failed: {stderr}")
        return {"logs": stdout}

    async def get_cluster_state(self, namespace: str) -> dict:
        """Dump all resources in the namespace as YAML."""
        stdout, stderr, rc = await self._run_kubectl(
            ["get", "all", "-n", namespace, "-o", "yaml"]
        )
        if rc != 0:
            raise RuntimeError(f"get_cluster_state failed: {stderr}")
        return {"cluster_state_yaml": stdout}

    async def get_events(self, namespace: str) -> dict:
        """Get events in the namespace sorted by last timestamp."""
        stdout, stderr, rc = await self._run_kubectl(
            ["get", "events", "-n", namespace, "--sort-by=.lastTimestamp", "-o", "json"]
        )
        if rc != 0:
            raise RuntimeError(f"get_events failed: {stderr}")
        try:
            events = json.loads(stdout)
        except json.JSONDecodeError:
            events = {"raw": stdout}
        return {"events": events}

    # ------------------------------------------------------------------
    # ActionExecutor interface
    # ------------------------------------------------------------------

    async def _execute(self, action: ActionRecord, **kwargs) -> dict | None:
        """Dispatch to the correct method based on action_type."""
        dispatch = {
            "apply_network_policy": self.apply_network_policy,
            "remove_network_policy": self.remove_network_policy,
            "scale_deployment": self.scale_deployment,
            "restart_deployment": self.restart_deployment,
            "cordon_nodes": self.cordon_nodes,
            "uncordon_nodes": self.uncordon_nodes,
            "get_pod_logs": self.get_pod_logs,
            "get_cluster_state": self.get_cluster_state,
            "get_events": self.get_events,
        }
        handler = dispatch.get(action.action_type)
        if handler is None:
            raise ValueError(f"Unknown action_type: {action.action_type}")
        return await handler(**kwargs)

    async def rollback(self, action: ActionRecord) -> ActionRecord:
        """Rollback a completed Kubernetes action."""
        rollback_map = {
            "apply_network_policy": "remove_network_policy",
            "cordon_nodes": "uncordon_nodes",
        }
        rollback_type = rollback_map.get(action.action_type)
        if rollback_type is None:
            self.log.warning(f"No rollback defined for {action.action_type}")
            return action

        action.status = "rolling_back"
        self.log.info(f"Rolling back {action.action_type} on {action.target}")
        try:
            rollback_handler = getattr(self, rollback_type)
            details = action.details or {}
            if rollback_type == "remove_network_policy":
                await rollback_handler(
                    namespace=details.get("namespace", "default"),
                    policy_name=details.get("policy_name", action.target),
                )
            elif rollback_type == "uncordon_nodes":
                await rollback_handler(selector=details.get("selector", action.target))
            action.status = "rolled_back"
            self.log.info(f"Rolled back {action.action_type} on {action.target}")
        except Exception as e:
            action.status = "rollback_failed"
            action.error = f"Rollback failed: {e}"
            self.log.error(f"Rollback failed for {action.action_type}: {e}")
        return action
