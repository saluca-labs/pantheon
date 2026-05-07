"""Tiresias Incident Controller — Google Cloud Armor WAF action executor.

Manages Cloud Armor security-policy rules via gcloud CLI for IP blocking
and unblocking during incident response.
"""

from __future__ import annotations

import asyncio
import json
import logging

from src.actions.base import ActionExecutor
from src.models.incident import ActionRecord

log = logging.getLogger(__name__)

POLICY_NAME = "tiresias-waf"
PROJECT = "salucainfrastructure"


class CloudArmorAction(ActionExecutor):
    """Block/unblock IPs via Google Cloud Armor security policies."""

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    async def _run_gcloud(self, args: list[str]) -> tuple[str, str, int]:
        """Run a gcloud command and return (stdout, stderr, returncode)."""
        cmd = ["gcloud", *args, "--project", PROJECT, "--format=json"]
        self.log.debug(f"gcloud {' '.join(args)}")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await proc.communicate()
        stdout = stdout_bytes.decode().strip()
        stderr = stderr_bytes.decode().strip()
        if proc.returncode != 0:
            self.log.error(f"gcloud failed (rc={proc.returncode}): {stderr}")
        return stdout, stderr, proc.returncode

    # ------------------------------------------------------------------
    # Rule management
    # ------------------------------------------------------------------

    async def block_ip(
        self, ip: str, duration_hours: int = 24, priority: int = 500
    ) -> dict:
        """Add a deny rule blocking the given IP address.

        Args:
            ip: IP address or CIDR to block.
            duration_hours: Advisory TTL for the rule (stored in description).
            priority: Rule priority (lower = evaluated first).
        """
        description = (
            f"tiresias-auto-block duration={duration_hours}h ip={ip}"
        )
        stdout, stderr, rc = await self._run_gcloud(
            [
                "compute",
                "security-policies",
                "rules",
                "create",
                str(priority),
                "--security-policy",
                POLICY_NAME,
                "--src-ip-ranges",
                ip,
                "--action",
                "deny-403",
                "--description",
                description,
            ]
        )
        if rc != 0:
            raise RuntimeError(f"block_ip failed: {stderr}")
        return {
            "ip": ip,
            "priority": priority,
            "duration_hours": duration_hours,
            "output": stdout,
        }

    async def unblock_ip(self, ip: str, priority: int | None = None) -> dict:
        """Remove the deny rule for the given IP.

        If priority is not provided, the rule is looked up from list_rules().
        """
        if priority is None:
            rules = await self.list_rules()
            matching = [
                r for r in rules.get("rules", [])
                if ip in r.get("match", {}).get("config", {}).get("srcIpRanges", [])
            ]
            if not matching:
                raise LookupError(f"No rule found blocking {ip}")
            priority = int(matching[0]["priority"])

        stdout, stderr, rc = await self._run_gcloud(
            [
                "compute",
                "security-policies",
                "rules",
                "delete",
                str(priority),
                "--security-policy",
                POLICY_NAME,
                "--quiet",
            ]
        )
        if rc != 0:
            raise RuntimeError(f"unblock_ip failed: {stderr}")
        return {"ip": ip, "priority": priority, "output": stdout}

    async def list_rules(self) -> dict:
        """List all rules in the tiresias-waf security policy."""
        stdout, stderr, rc = await self._run_gcloud(
            [
                "compute",
                "security-policies",
                "rules",
                "list",
                POLICY_NAME,
            ]
        )
        if rc != 0:
            raise RuntimeError(f"list_rules failed: {stderr}")
        try:
            rules = json.loads(stdout) if stdout else []
        except json.JSONDecodeError:
            rules = []
        return {"rules": rules}

    # ------------------------------------------------------------------
    # ActionExecutor interface
    # ------------------------------------------------------------------

    async def _execute(self, action: ActionRecord, **kwargs) -> dict | None:
        """Dispatch to the correct method based on action_type."""
        dispatch = {
            "block_ip": self.block_ip,
            "unblock_ip": self.unblock_ip,
            "list_rules": self.list_rules,
        }
        handler = dispatch.get(action.action_type)
        if handler is None:
            raise ValueError(f"Unknown action_type: {action.action_type}")
        return await handler(**kwargs)

    async def rollback(self, action: ActionRecord) -> ActionRecord:
        """Rollback a block_ip action by removing the deny rule."""
        if action.action_type != "block_ip":
            self.log.warning(f"No rollback defined for {action.action_type}")
            return action

        details = action.details or {}
        ip = details.get("ip")
        priority = details.get("priority")
        if not ip:
            action.status = "rollback_failed"
            action.error = "IP not recorded in action details"
            return action

        action.status = "rolling_back"
        try:
            await self.unblock_ip(ip, priority=priority)
            action.status = "rolled_back"
            self.log.info(f"Rolled back IP block for {ip}")
        except Exception as e:
            action.status = "rollback_failed"
            action.error = f"Rollback failed: {e}"
            self.log.error(f"Cloud Armor rollback failed: {e}")
        return action
