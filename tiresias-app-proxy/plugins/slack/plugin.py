"""Slack plugin for Tiresias App Proxy — read channels, post messages, manage reactions, relay."""

from __future__ import annotations

import asyncio
import base64
import json
from typing import Any, Optional

import httpx

try:
    import structlog
    logger = structlog.get_logger(__name__)
except ImportError:
    import logging
    logger = logging.getLogger(__name__)  # type: ignore[assignment]

# Relay modules are being built by another agent — graceful fallback.
try:
    from plugins.slack.outbound import SlackOutbound
except ImportError:
    SlackOutbound = None  # type: ignore[assignment,misc]

try:
    from plugins.slack.relay import SlackRelay
except ImportError:
    SlackRelay = None  # type: ignore[assignment,misc]

try:
    from app_proxy.sdk.base import TiresiasPlugin
    from app_proxy.sdk.types import ToolContext, ToolDefinition, ToolResult
except ImportError:
    # SDK not yet installed — use local stubs so the module is importable.
    from dataclasses import dataclass, field

    class TiresiasPlugin:  # type: ignore[no-redef]
        name: str
        version: str
        description: str
        capabilities: list[str]
        required_secrets: list[str] = []

        def tools(self) -> list: ...
        async def call(self, tool_name: str, arguments: dict, ctx: Any) -> Any: ...

    @dataclass(frozen=True, slots=True)
    class ToolDefinition:  # type: ignore[no-redef]
        name: str
        description: str
        inputSchema: dict[str, Any]
        annotations: dict[str, Any] = field(default_factory=dict)

    @dataclass(slots=True)
    class ToolContext:  # type: ignore[no-redef]
        secrets: dict[str, str] = field(default_factory=dict)
        caller_agent_id: str = ""
        caller_tenant_id: str = ""
        session_id: Optional[str] = None

    @dataclass(frozen=True, slots=True)
    class ToolResult:  # type: ignore[no-redef]
        content: list[dict[str, Any]] = field(default_factory=list)
        is_error: bool = False

        @classmethod
        def text(cls, text: str, *, is_error: bool = False) -> ToolResult:
            return cls(content=[{"type": "text", "text": text}], is_error=is_error)

        @classmethod
        def error(cls, message: str) -> ToolResult:
            return cls.text(message, is_error=True)


SLACK_API_BASE = "https://slack.com/api"


class SlackPlugin(TiresiasPlugin):
    """Slack integration — read channels, post messages, manage reactions, relay."""

    name = "slack"
    version = "2.0.0"
    description = "Slack integration — read channels, post messages, manage reactions, relay"
    capabilities = ["slack:read", "slack:post", "slack:react", "slack:relay"]
    required_secrets = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"]

    def __init__(self) -> None:
        self._relay: Any = None  # SlackRelay | None
        self._outbound: Any = None  # SlackOutbound | None
        self._relay_started: bool = False

    # ------------------------------------------------------------------
    # Relay / outbound lifecycle
    # ------------------------------------------------------------------

    async def _ensure_relay(self, ctx: ToolContext) -> Any:
        """Lazily start the Socket Mode relay on first use."""
        if self._relay is not None:
            return self._relay

        if SlackRelay is None:
            raise RuntimeError("Relay module not installed — plugins.slack.relay is unavailable")

        bot_token = self._get_token(ctx)
        app_token = ctx.secrets.get("SLACK_APP_TOKEN", "")
        if not app_token:
            raise ValueError("SLACK_APP_TOKEN not provided in context secrets")

        self._relay = SlackRelay(
            bot_token=bot_token,
            app_token=app_token,
            buffer_size=1000,
        )
        await self._relay.start()
        self._relay_started = True
        logger.info("relay_initialized")
        return self._relay

    def _ensure_outbound(self, ctx: ToolContext) -> Any:
        """Lazily create the outbound client on first use."""
        if self._outbound is not None:
            return self._outbound

        if SlackOutbound is None:
            raise RuntimeError("Outbound module not installed — plugins.slack.outbound is unavailable")

        bot_token = self._get_token(ctx)
        self._outbound = SlackOutbound(bot_token)
        logger.info("outbound_initialized")
        return self._outbound

    # ------------------------------------------------------------------
    # Tool definitions
    # ------------------------------------------------------------------

    def tools(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="slack_list_channels",
                description="List Slack channels the bot has access to.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
                annotations={
                    "readOnlyHint": True,
                    "tiresias:approvalRequired": False,
                },
            ),
            ToolDefinition(
                name="slack_read_messages",
                description="Read recent messages from a Slack channel.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "description": "Channel ID to read from.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Number of messages to retrieve (default 10).",
                            "default": 10,
                            "minimum": 1,
                            "maximum": 100,
                        },
                    },
                    "required": ["channel"],
                    "additionalProperties": False,
                },
                annotations={
                    "readOnlyHint": True,
                    "tiresias:capability": "slack:read",
                },
            ),
            ToolDefinition(
                name="slack_send_message",
                description="Post a message to a Slack channel, optionally in a thread.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "description": "Channel ID to post to.",
                        },
                        "text": {
                            "type": "string",
                            "description": "Message text to send.",
                        },
                        "thread_ts": {
                            "type": "string",
                            "description": "Thread timestamp to reply in (optional).",
                        },
                    },
                    "required": ["channel", "text"],
                    "additionalProperties": False,
                },
                annotations={
                    "destructiveHint": True,
                    "tiresias:capability": "slack:post",
                },
            ),
            ToolDefinition(
                name="slack_add_reaction",
                description="Add an emoji reaction to a Slack message.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "description": "Channel ID containing the message.",
                        },
                        "timestamp": {
                            "type": "string",
                            "description": "Timestamp of the message to react to.",
                        },
                        "emoji": {
                            "type": "string",
                            "description": "Emoji name without colons (e.g. 'thumbsup').",
                        },
                    },
                    "required": ["channel", "timestamp", "emoji"],
                    "additionalProperties": False,
                },
                annotations={
                    "tiresias:capability": "slack:react",
                },
            ),
            ToolDefinition(
                name="slack_delete_message",
                description="Delete a message from a Slack channel.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "description": "Channel ID containing the message.",
                        },
                        "timestamp": {
                            "type": "string",
                            "description": "Timestamp of the message to delete.",
                        },
                    },
                    "required": ["channel", "timestamp"],
                    "additionalProperties": False,
                },
                annotations={
                    "destructiveHint": True,
                    "tiresias:approvalRequired": True,
                    "tiresias:capability": "slack:post",
                },
            ),
            # ---------------------------------------------------------------
            # Relay inbound tools
            # ---------------------------------------------------------------
            ToolDefinition(
                name="slack_poll_events",
                description="Poll for buffered Slack events from the relay daemon.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Max events to return (default 10).",
                            "default": 10,
                            "minimum": 1,
                            "maximum": 100,
                        },
                        "timeout": {
                            "type": "number",
                            "description": "Long-poll timeout in seconds (default 30).",
                            "default": 30.0,
                            "minimum": 0,
                            "maximum": 120,
                        },
                    },
                    "additionalProperties": False,
                },
                annotations={
                    "readOnlyHint": True,
                    "tiresias:approvalRequired": False,
                },
            ),
            ToolDefinition(
                name="slack_ack_event",
                description="Acknowledge (mark as processed) a buffered relay event.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "event_id": {
                            "type": "string",
                            "description": "ID of the event to acknowledge.",
                        },
                    },
                    "required": ["event_id"],
                    "additionalProperties": False,
                },
                annotations={
                    "readOnlyHint": True,
                },
            ),
            ToolDefinition(
                name="slack_download_file",
                description="Download a file attachment from a Slack message via its private URL.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "file_url": {
                            "type": "string",
                            "description": "Slack private file URL (url_private).",
                        },
                        "filename": {
                            "type": "string",
                            "description": "Desired local filename for the download.",
                        },
                    },
                    "required": ["file_url", "filename"],
                    "additionalProperties": False,
                },
                annotations={
                    "readOnlyHint": True,
                },
            ),
            # ---------------------------------------------------------------
            # Enhanced outbound tools
            # ---------------------------------------------------------------
            ToolDefinition(
                name="slack_send_rich_message",
                description="Send a message with persona, typing indicator, and optional reaction.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "description": "Channel ID to post to.",
                        },
                        "text": {
                            "type": "string",
                            "description": "Message text to send.",
                        },
                        "thread_ts": {
                            "type": "string",
                            "description": "Thread timestamp to reply in (optional).",
                        },
                        "username": {
                            "type": "string",
                            "description": "Display name override for the bot.",
                        },
                        "icon_emoji": {
                            "type": "string",
                            "description": "Emoji icon override (e.g. ':robot_face:').",
                        },
                        "add_reaction": {
                            "type": "string",
                            "description": "Emoji to react with after posting (no colons).",
                        },
                        "show_typing": {
                            "type": "boolean",
                            "description": "Send typing indicator before message (default false).",
                            "default": False,
                        },
                    },
                    "required": ["channel", "text"],
                    "additionalProperties": False,
                },
                annotations={
                    "destructiveHint": True,
                    "tiresias:capability": "slack:post",
                },
            ),
            ToolDefinition(
                name="slack_upload_file",
                description="Upload a file to a Slack channel.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "description": "Channel ID to upload to.",
                        },
                        "content": {
                            "type": "string",
                            "description": "File content, base64 encoded.",
                        },
                        "filename": {
                            "type": "string",
                            "description": "Name for the uploaded file.",
                        },
                        "title": {
                            "type": "string",
                            "description": "Title for the file (optional).",
                        },
                        "thread_ts": {
                            "type": "string",
                            "description": "Thread timestamp to attach file to (optional).",
                        },
                    },
                    "required": ["channel", "content", "filename"],
                    "additionalProperties": False,
                },
                annotations={
                    "destructiveHint": True,
                    "tiresias:capability": "slack:post",
                },
            ),
            ToolDefinition(
                name="slack_edit_message",
                description="Edit an existing message in a Slack channel.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "description": "Channel ID containing the message.",
                        },
                        "timestamp": {
                            "type": "string",
                            "description": "Timestamp of the message to edit.",
                        },
                        "text": {
                            "type": "string",
                            "description": "New message text.",
                        },
                    },
                    "required": ["channel", "timestamp", "text"],
                    "additionalProperties": False,
                },
                annotations={
                    "destructiveHint": True,
                    "tiresias:capability": "slack:post",
                },
            ),
            ToolDefinition(
                name="slack_remove_reaction",
                description="Remove an emoji reaction from a Slack message.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "description": "Channel ID containing the message.",
                        },
                        "timestamp": {
                            "type": "string",
                            "description": "Timestamp of the message.",
                        },
                        "emoji": {
                            "type": "string",
                            "description": "Emoji name without colons (e.g. 'thumbsup').",
                        },
                    },
                    "required": ["channel", "timestamp", "emoji"],
                    "additionalProperties": False,
                },
                annotations={
                    "tiresias:capability": "slack:react",
                },
            ),
            ToolDefinition(
                name="slack_set_typing",
                description="Show a typing indicator in a Slack channel.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "description": "Channel ID to show typing in.",
                        },
                    },
                    "required": ["channel"],
                    "additionalProperties": False,
                },
                annotations={
                    "tiresias:capability": "slack:post",
                },
            ),
            # ---------------------------------------------------------------
            # Config tools
            # ---------------------------------------------------------------
            ToolDefinition(
                name="slack_configure_relay",
                description="Configure relay daemon behavior (allowlist, trigger mode, prefixes).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "allowlist": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of channel IDs to listen on.",
                        },
                        "trigger_mode": {
                            "type": "string",
                            "enum": ["all", "mention_only", "prefix"],
                            "description": "When to relay events: all, mention_only, or prefix.",
                        },
                        "prefixes": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Prefixes that trigger relay (when trigger_mode='prefix').",
                        },
                    },
                    "additionalProperties": False,
                },
                annotations={
                    "tiresias:adminOnly": True,
                },
            ),
        ]

    # ------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------

    async def call(self, tool_name: str, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        handlers = {
            # Original tools
            "slack_list_channels": self._list_channels,
            "slack_read_messages": self._read_messages,
            "slack_send_message": self._send_message,
            "slack_add_reaction": self._add_reaction,
            "slack_delete_message": self._delete_message,
            # Relay inbound
            "slack_poll_events": self._poll_events,
            "slack_ack_event": self._ack_event,
            "slack_download_file": self._download_file,
            # Enhanced outbound
            "slack_send_rich_message": self._send_rich_message,
            "slack_upload_file": self._upload_file,
            "slack_edit_message": self._edit_message,
            "slack_remove_reaction": self._remove_reaction,
            "slack_set_typing": self._set_typing,
            # Config
            "slack_configure_relay": self._configure_relay,
        }
        handler = handlers.get(tool_name)
        if handler is None:
            return ToolResult.error(f"Unknown tool: {tool_name}")
        return await handler(arguments, ctx)

    # ------------------------------------------------------------------
    # Slack API helpers
    # ------------------------------------------------------------------

    async def _slack_request(
        self,
        method: str,
        token: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make an authenticated Slack API request and return the parsed response."""
        url = f"{SLACK_API_BASE}/{method}"
        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient(timeout=15) as client:
            if json_body is not None:
                headers["Content-Type"] = "application/json; charset=utf-8"
                resp = await client.post(url, headers=headers, json=json_body)
            else:
                resp = await client.get(url, headers=headers, params=params or {})

            resp.raise_for_status()
            return resp.json()

    def _get_token(self, ctx: ToolContext) -> str:
        token = ctx.secrets.get("SLACK_BOT_TOKEN", "")
        if not token:
            raise ValueError("SLACK_BOT_TOKEN not provided in context secrets")
        return token

    # ------------------------------------------------------------------
    # Tool implementations
    # ------------------------------------------------------------------

    async def _list_channels(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            token = self._get_token(ctx)
            data = await self._slack_request(
                "conversations.list",
                token,
                params={"types": "public_channel,private_channel", "limit": "200"},
            )
        except Exception as exc:
            return ToolResult.error(f"Slack API error: {exc}")

        if not data.get("ok"):
            return ToolResult.error(f"Slack error: {data.get('error', 'unknown')}")

        channels = [
            {
                "id": ch["id"],
                "name": ch.get("name", ""),
                "is_private": ch.get("is_private", False),
                "num_members": ch.get("num_members", 0),
                "topic": ch.get("topic", {}).get("value", ""),
            }
            for ch in data.get("channels", [])
        ]

        return ToolResult.text(json.dumps(channels, indent=2))

    async def _read_messages(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        channel: str = arguments["channel"]
        limit: int = arguments.get("limit", 10)

        try:
            token = self._get_token(ctx)
            data = await self._slack_request(
                "conversations.history",
                token,
                params={"channel": channel, "limit": str(limit)},
            )
        except Exception as exc:
            return ToolResult.error(f"Slack API error: {exc}")

        if not data.get("ok"):
            return ToolResult.error(f"Slack error: {data.get('error', 'unknown')}")

        messages = [
            {
                "user": msg.get("user", ""),
                "text": msg.get("text", ""),
                "ts": msg.get("ts", ""),
                "thread_ts": msg.get("thread_ts"),
            }
            for msg in data.get("messages", [])
        ]

        return ToolResult.text(json.dumps(messages, indent=2))

    async def _send_message(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        channel: str = arguments["channel"]
        text: str = arguments["text"]
        thread_ts: str | None = arguments.get("thread_ts")

        body: dict[str, Any] = {"channel": channel, "text": text}
        if thread_ts:
            body["thread_ts"] = thread_ts

        try:
            token = self._get_token(ctx)
            data = await self._slack_request("chat.postMessage", token, json_body=body)
        except Exception as exc:
            return ToolResult.error(f"Slack API error: {exc}")

        if not data.get("ok"):
            return ToolResult.error(f"Slack error: {data.get('error', 'unknown')}")

        return ToolResult.text(json.dumps({
            "ok": True,
            "channel": data.get("channel", channel),
            "ts": data.get("ts", ""),
        }))

    async def _add_reaction(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        channel: str = arguments["channel"]
        timestamp: str = arguments["timestamp"]
        emoji: str = arguments["emoji"]

        try:
            token = self._get_token(ctx)
            data = await self._slack_request(
                "reactions.add",
                token,
                json_body={"channel": channel, "timestamp": timestamp, "name": emoji},
            )
        except Exception as exc:
            return ToolResult.error(f"Slack API error: {exc}")

        if not data.get("ok"):
            return ToolResult.error(f"Slack error: {data.get('error', 'unknown')}")

        return ToolResult.text(json.dumps({"ok": True}))

    async def _delete_message(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        channel: str = arguments["channel"]
        timestamp: str = arguments["timestamp"]

        try:
            token = self._get_token(ctx)
            data = await self._slack_request(
                "chat.delete",
                token,
                json_body={"channel": channel, "ts": timestamp},
            )
        except Exception as exc:
            return ToolResult.error(f"Slack API error: {exc}")

        if not data.get("ok"):
            return ToolResult.error(f"Slack error: {data.get('error', 'unknown')}")

        return ToolResult.text(json.dumps({"ok": True}))

    # ------------------------------------------------------------------
    # Relay inbound handlers
    # ------------------------------------------------------------------

    async def _poll_events(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        limit: int = arguments.get("limit", 10)
        timeout: float = arguments.get("timeout", 30.0)

        try:
            relay = await self._ensure_relay(ctx)
            events = await relay.poll_events(
                agent_id=ctx.caller_agent_id,
                limit=limit,
                timeout=timeout,
            )
        except Exception as exc:
            return ToolResult.error(f"Relay error: {exc}")

        return ToolResult.text(json.dumps(
            [e.to_dict() for e in events],
            indent=2,
        ))

    async def _ack_event(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        event_id: str = arguments["event_id"]

        try:
            relay = await self._ensure_relay(ctx)
            acked = await relay.ack_event(event_id)
        except Exception as exc:
            return ToolResult.error(f"Relay error: {exc}")

        return ToolResult.text(json.dumps({"ok": acked, "event_id": event_id}))

    async def _download_file(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        file_url: str = arguments["file_url"]
        filename: str = arguments["filename"]

        try:
            token = self._get_token(ctx)
            headers = {"Authorization": f"Bearer {token}"}
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(file_url, headers=headers)
                resp.raise_for_status()
                content_b64 = base64.b64encode(resp.content).decode("ascii")
        except Exception as exc:
            return ToolResult.error(f"File download error: {exc}")

        return ToolResult.text(json.dumps({
            "ok": True,
            "filename": filename,
            "size_bytes": len(resp.content),
            "content_base64": content_b64,
        }))

    # ------------------------------------------------------------------
    # Enhanced outbound handlers
    # ------------------------------------------------------------------

    async def _send_rich_message(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        channel: str = arguments["channel"]
        text: str = arguments["text"]
        thread_ts: str | None = arguments.get("thread_ts")
        username: str | None = arguments.get("username")
        icon_emoji: str | None = arguments.get("icon_emoji")
        add_reaction: str | None = arguments.get("add_reaction")
        show_typing: bool = arguments.get("show_typing", False)

        try:
            outbound = self._ensure_outbound(ctx)

            if show_typing:
                await outbound.send_typing(channel)
                await asyncio.sleep(0.5)

            result = await outbound.send_message(
                channel,
                text,
                thread_ts=thread_ts,
                username=username,
                icon_emoji=icon_emoji,
            )

            if not result.get("ok"):
                return ToolResult.error(f"Slack error: {result.get('error', 'unknown')}")

            msg_ts = result.get("ts", "")

            if add_reaction and msg_ts:
                await outbound.add_reaction(channel, msg_ts, add_reaction)

        except Exception as exc:
            return ToolResult.error(f"Slack API error: {exc}")

        return ToolResult.text(json.dumps({
            "ok": True,
            "channel": result.get("channel", channel),
            "ts": msg_ts,
        }))

    async def _upload_file(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        channel: str = arguments["channel"]
        content_b64: str = arguments["content"]
        filename: str = arguments["filename"]
        title: str | None = arguments.get("title")
        thread_ts: str | None = arguments.get("thread_ts")

        try:
            content = base64.b64decode(content_b64)
            outbound = self._ensure_outbound(ctx)
            result = await outbound.upload_file(
                channel,
                content,
                filename,
                title=title,
                thread_ts=thread_ts,
            )
        except Exception as exc:
            return ToolResult.error(f"File upload error: {exc}")

        if not result.get("ok"):
            return ToolResult.error(f"Slack error: {result.get('error', 'unknown')}")

        return ToolResult.text(json.dumps({"ok": True}))

    async def _edit_message(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        channel: str = arguments["channel"]
        timestamp: str = arguments["timestamp"]
        text: str = arguments["text"]

        try:
            outbound = self._ensure_outbound(ctx)
            result = await outbound.edit_message(channel, timestamp, text)
        except Exception as exc:
            return ToolResult.error(f"Slack API error: {exc}")

        if not result.get("ok"):
            return ToolResult.error(f"Slack error: {result.get('error', 'unknown')}")

        return ToolResult.text(json.dumps({"ok": True, "ts": timestamp}))

    async def _remove_reaction(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        channel: str = arguments["channel"]
        timestamp: str = arguments["timestamp"]
        emoji: str = arguments["emoji"]

        try:
            outbound = self._ensure_outbound(ctx)
            result = await outbound.remove_reaction(channel, timestamp, emoji)
        except Exception as exc:
            return ToolResult.error(f"Slack API error: {exc}")

        if not result.get("ok"):
            return ToolResult.error(f"Slack error: {result.get('error', 'unknown')}")

        return ToolResult.text(json.dumps({"ok": True}))

    async def _set_typing(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        channel: str = arguments["channel"]

        try:
            outbound = self._ensure_outbound(ctx)
            await outbound.send_typing(channel)
        except Exception as exc:
            return ToolResult.error(f"Slack API error: {exc}")

        return ToolResult.text(json.dumps({"ok": True}))

    # ------------------------------------------------------------------
    # Configuration handler
    # ------------------------------------------------------------------

    async def _configure_relay(self, arguments: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            relay = await self._ensure_relay(ctx)
        except Exception as exc:
            return ToolResult.error(f"Relay error: {exc}")

        allowlist = arguments.get("allowlist")
        trigger_mode = arguments.get("trigger_mode")
        prefixes = arguments.get("prefixes")

        if allowlist is not None:
            relay.set_allowlist(allowlist)

        if trigger_mode is not None:
            relay.set_trigger_mode(trigger_mode, prefixes)

        return ToolResult.text(json.dumps({
            "ok": True,
            "relay_running": relay.is_running,
            "buffer_size": relay.buffer_size,
        }))
