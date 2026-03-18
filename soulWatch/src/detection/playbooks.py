"""
Response playbook system for SoulWatch detection engine.
Playbooks define automated response actions triggered by Sigma rule matches.
"""

import ipaddress
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import structlog
import yaml

from soulWatch.src.detection.sigma_engine import SigmaMatch

logger = structlog.get_logger(__name__)

SEVERITY_ORDER = ["informational", "low", "medium", "high", "critical"]


def _severity_gte(actual: str, threshold: str) -> bool:
    actual_idx = SEVERITY_ORDER.index(actual) if actual in SEVERITY_ORDER else 0
    threshold_idx = SEVERITY_ORDER.index(threshold) if threshold in SEVERITY_ORDER else 0
    return actual_idx >= threshold_idx


@dataclass
class PlaybookAction:
    type: str
    params: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"type": self.type, "params": self.params}


@dataclass
class ResponsePlaybook:
    id: str
    name: str
    description: str = ""
    trigger_rules: list[str] = field(default_factory=list)
    severity_threshold: str = "medium"
    actions: list[PlaybookAction] = field(default_factory=list)
    cooldown_minutes: int = 15
    requires_approval: bool = False
    enabled: bool = True

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "trigger_rules": self.trigger_rules,
            "severity_threshold": self.severity_threshold,
            "actions": [a.to_dict() for a in self.actions],
            "cooldown_minutes": self.cooldown_minutes,
            "requires_approval": self.requires_approval,
            "enabled": self.enabled,
        }

    def to_yaml(self) -> str:
        return yaml.dump(self.to_dict(), default_flow_style=False, sort_keys=False)


@dataclass
class ActionResult:
    action_type: str
    success: bool
    message: str = ""
    details: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "action_type": self.action_type,
            "success": self.success,
            "message": self.message,
            "details": self.details,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class PlaybookResult:
    playbook_id: str
    playbook_name: str
    match_rule_id: str
    match_level: str
    executed: bool
    skipped_reason: Optional[str] = None
    action_results: list[ActionResult] = field(default_factory=list)
    requires_approval: bool = False
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "playbook_id": self.playbook_id,
            "playbook_name": self.playbook_name,
            "match_rule_id": self.match_rule_id,
            "match_level": self.match_level,
            "executed": self.executed,
            "skipped_reason": self.skipped_reason,
            "action_results": [a.to_dict() for a in self.action_results],
            "requires_approval": self.requires_approval,
            "timestamp": self.timestamp.isoformat(),
        }


class PlaybookEngine:
    """Loads, manages, and executes response playbooks."""

    def __init__(self):
        self._playbooks: dict[str, ResponsePlaybook] = {}
        self._cooldowns: dict[tuple[str, str], datetime] = {}
        self._execution_log: list[PlaybookResult] = []
        self._action_handlers: dict[str, Any] = {}
        self._register_default_handlers()

    def load_playbooks(self, playbooks_dir: str) -> int:
        pb_path = Path(playbooks_dir)
        if not pb_path.is_dir():
            logger.warning("playbook.dir_not_found", path=playbooks_dir)
            return 0

        count = 0
        for fpath in sorted(pb_path.glob("*.yml")) + sorted(pb_path.glob("*.yaml")):
            try:
                data = yaml.safe_load(fpath.read_text())
                pb = self._parse_playbook(data)
                self._playbooks[pb.id] = pb
                count += 1
            except Exception as e:
                logger.warning("playbook.load_failed", file=str(fpath), error=str(e))

        logger.info("playbook.loaded", count=count, directory=playbooks_dir)
        return count

    def add_playbook(self, playbook: ResponsePlaybook):
        self._playbooks[playbook.id] = playbook
        logger.info("playbook.added", playbook_id=playbook.id, name=playbook.name)

    def remove_playbook(self, playbook_id: str) -> bool:
        if playbook_id in self._playbooks:
            del self._playbooks[playbook_id]
            return True
        return False

    def get_playbook(self, playbook_id: str) -> Optional[ResponsePlaybook]:
        return self._playbooks.get(playbook_id)

    def list_playbooks(self) -> list[ResponsePlaybook]:
        return list(self._playbooks.values())

    def find_playbooks_for_rule(self, rule_id: str) -> list[ResponsePlaybook]:
        return [
            pb for pb in self._playbooks.values()
            if pb.enabled and rule_id in pb.trigger_rules
        ]

    async def execute_playbook(
        self, playbook_id: str, match: SigmaMatch
    ) -> PlaybookResult:
        playbook = self._playbooks.get(playbook_id)
        if not playbook:
            return PlaybookResult(
                playbook_id=playbook_id, playbook_name="unknown",
                match_rule_id=match.rule.id, match_level=match.rule.level,
                executed=False, skipped_reason="Playbook not found",
            )

        if not playbook.enabled:
            return PlaybookResult(
                playbook_id=playbook_id, playbook_name=playbook.name,
                match_rule_id=match.rule.id, match_level=match.rule.level,
                executed=False, skipped_reason="Playbook is disabled",
            )

        if not _severity_gte(match.rule.level, playbook.severity_threshold):
            return PlaybookResult(
                playbook_id=playbook_id, playbook_name=playbook.name,
                match_rule_id=match.rule.id, match_level=match.rule.level,
                executed=False,
                skipped_reason=f"Severity '{match.rule.level}' below threshold '{playbook.severity_threshold}'",
            )

        agent_key = self._agent_key_from_match(match)
        cooldown_key = (playbook_id, agent_key)
        now = datetime.now(timezone.utc)

        if cooldown_key in self._cooldowns:
            last_exec = self._cooldowns[cooldown_key]
            cooldown_delta = timedelta(minutes=playbook.cooldown_minutes)
            if now - last_exec < cooldown_delta:
                remaining = (last_exec + cooldown_delta - now).total_seconds()
                return PlaybookResult(
                    playbook_id=playbook_id, playbook_name=playbook.name,
                    match_rule_id=match.rule.id, match_level=match.rule.level,
                    executed=False,
                    skipped_reason=f"Cooldown active ({remaining:.0f}s remaining)",
                )

        if playbook.requires_approval:
            result = PlaybookResult(
                playbook_id=playbook_id, playbook_name=playbook.name,
                match_rule_id=match.rule.id, match_level=match.rule.level,
                executed=False, requires_approval=True,
                skipped_reason="Queued for human approval",
            )
            self._execution_log.append(result)
            return result

        context = self._build_context(match, playbook)
        action_results: list[ActionResult] = []

        for action in playbook.actions:
            ar = await self.execute_action(action, context)
            action_results.append(ar)

        self._cooldowns[cooldown_key] = now

        result = PlaybookResult(
            playbook_id=playbook_id, playbook_name=playbook.name,
            match_rule_id=match.rule.id, match_level=match.rule.level,
            executed=True, action_results=action_results,
        )
        self._execution_log.append(result)

        logger.info(
            "playbook.executed",
            playbook_id=playbook_id,
            rule_id=match.rule.id,
            actions_count=len(action_results),
            agent=agent_key,
        )
        return result

    async def execute_action(self, action: PlaybookAction, context: dict) -> ActionResult:
        handler = self._action_handlers.get(action.type)
        if not handler:
            return ActionResult(
                action_type=action.type, success=False,
                message=f"No handler registered for action type '{action.type}'",
            )

        try:
            return await handler(action.params, context)
        except Exception as e:
            logger.warning("playbook.action_failed", action_type=action.type, error=str(e))
            return ActionResult(
                action_type=action.type, success=False,
                message=f"Action failed: {str(e)}",
            )

    def get_execution_log(self, limit: int = 100) -> list[PlaybookResult]:
        return list(reversed(self._execution_log[-limit:]))

    @staticmethod
    def _agent_key_from_match(match: SigmaMatch) -> str:
        event = match.event
        return str(event.get("soulkey_id", "")) or str(event.get("persona_id", "")) or "unknown"

    @staticmethod
    def _build_context(match: SigmaMatch, playbook: ResponsePlaybook) -> dict:
        return {
            "match": match.to_dict(),
            "playbook_id": playbook.id,
            "playbook_name": playbook.name,
            "rule_id": match.rule.id,
            "rule_title": match.rule.title,
            "level": match.rule.level,
            "event": match.event,
            "matched_fields": match.matched_fields,
            "timestamp": match.timestamp.isoformat(),
        }

    def _parse_playbook(self, data: dict) -> ResponsePlaybook:
        actions = []
        for a in data.get("actions", []):
            actions.append(PlaybookAction(
                type=a.get("type", "log"),
                params=a.get("params", {}),
            ))

        return ResponsePlaybook(
            id=data.get("id", str(uuid.uuid4())),
            name=data.get("name", "Untitled Playbook"),
            description=data.get("description", ""),
            trigger_rules=data.get("trigger_rules", []),
            severity_threshold=data.get("severity_threshold", "medium"),
            actions=actions,
            cooldown_minutes=data.get("cooldown_minutes", 15),
            requires_approval=data.get("requires_approval", False),
            enabled=data.get("enabled", True),
        )

    def _register_default_handlers(self):
        self._action_handlers["log"] = self._handle_log
        self._action_handlers["quarantine"] = self._handle_quarantine
        self._action_handlers["notify"] = self._handle_notify
        self._action_handlers["escalate"] = self._handle_escalate
        self._action_handlers["rate_limit"] = self._handle_rate_limit
        self._action_handlers["webhook"] = self._handle_webhook
        self._action_handlers["reset_context"] = self._handle_reset_context

    async def _handle_log(self, params: dict, context: dict) -> ActionResult:
        message = params.get("message", "Detection triggered")
        logger.warning(
            "playbook.action.log", message=message,
            rule_id=context.get("rule_id"), level=context.get("level"),
        )
        return ActionResult(
            action_type="log", success=True, message=f"Logged: {message}",
            details={"log_level": params.get("level", "warning"), "rule_id": context.get("rule_id")},
        )

    async def _handle_quarantine(self, params: dict, context: dict) -> ActionResult:
        soulkey_id = context.get("event", {}).get("soulkey_id")
        reason = params.get("reason", f"Auto-quarantine by playbook {context.get('playbook_id')}")
        logger.warning(
            "playbook.action.quarantine", soulkey_id=soulkey_id,
            reason=reason, rule_id=context.get("rule_id"),
        )
        return ActionResult(
            action_type="quarantine", success=True,
            message=f"Quarantine requested for soulkey {soulkey_id}",
            details={"soulkey_id": soulkey_id, "reason": reason},
        )

    async def _handle_notify(self, params: dict, context: dict) -> ActionResult:
        channels = params.get("channels", ["log"])
        message = params.get("message", f"Detection: {context.get('rule_title', 'unknown')}")
        logger.info(
            "playbook.action.notify", channels=channels,
            message=message, rule_id=context.get("rule_id"),
        )
        return ActionResult(
            action_type="notify", success=True,
            message=f"Notification sent to {', '.join(channels)}",
            details={"channels": channels, "message": message},
        )

    async def _handle_escalate(self, params: dict, context: dict) -> ActionResult:
        target = params.get("target", "soc_team")
        priority = params.get("priority", context.get("level", "high"))
        logger.warning(
            "playbook.action.escalate", target=target,
            priority=priority, rule_id=context.get("rule_id"),
        )
        return ActionResult(
            action_type="escalate", success=True,
            message=f"Escalated to {target} at priority {priority}",
            details={"target": target, "priority": priority},
        )

    async def _handle_rate_limit(self, params: dict, context: dict) -> ActionResult:
        max_requests = params.get("max_requests", 10)
        window_seconds = params.get("window_seconds", 60)
        soulkey_id = context.get("event", {}).get("soulkey_id")
        logger.info(
            "playbook.action.rate_limit", soulkey_id=soulkey_id,
            max_requests=max_requests, window_seconds=window_seconds,
        )
        return ActionResult(
            action_type="rate_limit", success=True,
            message=f"Rate limit applied: {max_requests} req/{window_seconds}s",
            details={"soulkey_id": soulkey_id, "max_requests": max_requests, "window_seconds": window_seconds},
        )

    @staticmethod
    def _validate_webhook_url(url: str) -> str | None:
        """
        Validate a webhook URL to prevent SSRF attacks.
        Returns an error message if the URL is invalid, or None if valid.
        """
        try:
            parsed = urlparse(url)
        except Exception:
            return "Malformed URL"

        # Only allow HTTPS
        if parsed.scheme != "https":
            return f"Only HTTPS webhook URLs are allowed (got '{parsed.scheme}')"

        if not parsed.hostname:
            return "URL has no hostname"

        # Resolve hostname and check for private/internal IPs
        hostname = parsed.hostname
        try:
            addr = ipaddress.ip_address(hostname)
        except ValueError:
            # It's a hostname, not an IP literal - resolve it
            import socket
            try:
                resolved = socket.getaddrinfo(hostname, None)
                addrs = [ipaddress.ip_address(r[4][0]) for r in resolved]
            except socket.gaierror:
                return f"Cannot resolve hostname '{hostname}'"
            for addr in addrs:
                if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                    return f"Webhook URL resolves to blocked private/internal address ({addr})"
            return None

        # Direct IP check
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            return f"Webhook URL targets blocked private/internal address ({addr})"

        return None

    async def _handle_webhook(self, params: dict, context: dict) -> ActionResult:
        url = params.get("url", "")
        if not url:
            return ActionResult(action_type="webhook", success=False, message="No webhook URL configured")

        # SSRF protection: validate URL before dispatching
        validation_error = self._validate_webhook_url(url)
        if validation_error:
            logger.warning(
                "playbook.action.webhook.blocked",
                url=url,
                reason=validation_error,
                rule_id=context.get("rule_id"),
            )
            return ActionResult(
                action_type="webhook", success=False,
                message=f"Webhook blocked: {validation_error}",
                details={"url": url, "reason": validation_error},
            )

        logger.info("playbook.action.webhook", url=url, rule_id=context.get("rule_id"))
        return ActionResult(
            action_type="webhook", success=True,
            message=f"Webhook dispatched to {url}",
            details={"url": url, "payload_keys": list(context.keys())},
        )

    async def _handle_reset_context(self, params: dict, context: dict) -> ActionResult:
        soulkey_id = context.get("event", {}).get("soulkey_id")
        logger.info("playbook.action.reset_context", soulkey_id=soulkey_id, rule_id=context.get("rule_id"))
        return ActionResult(
            action_type="reset_context", success=True,
            message=f"Context reset requested for soulkey {soulkey_id}",
            details={"soulkey_id": soulkey_id},
        )
