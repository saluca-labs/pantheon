"""Slack Socket Mode relay daemon — buffers real-time events for tool consumption."""

from __future__ import annotations

import asyncio
import sqlite3
import time
from collections import deque
from pathlib import Path
from typing import Any

import structlog

from plugins.slack.events import SlackEvent

logger = structlog.get_logger(__name__)

# Event types the relay knows how to normalize.
_SUPPORTED_EVENT_TYPES = frozenset({
    "message",
    "app_mention",
    "file_shared",
})


class SlackRelay:
    """Socket Mode listener that buffers Slack events for tool consumption.

    Connects to Slack via Socket Mode (websocket), receives real-time events,
    and stores them in a thread-safe deque.  Plugin tools poll events via
    ``poll_events`` and acknowledge them with ``ack_event``.

    Supports optional SQLite persistence so events survive restarts.
    """

    def __init__(
        self,
        bot_token: str,
        app_token: str,
        *,
        buffer_size: int = 1000,
        db_path: str | None = None,
    ) -> None:
        self._bot_token = bot_token
        self._app_token = app_token
        self._buffer_size = buffer_size

        # In-memory ring buffer.
        self._buffer: deque[SlackEvent] = deque(maxlen=buffer_size)
        self._buffer_lock = asyncio.Lock()

        # Asyncio event so poll_events can block until something arrives.
        self._new_event = asyncio.Event()

        # Deduplication: track recently-seen message timestamps.
        self._seen_ts: deque[str] = deque(maxlen=buffer_size * 2)

        # Bot's own user ID — populated on start, used for self-filtering.
        self._bot_user_id: str | None = None

        # Filtering & trigger mode.
        self._allowlist: set[str] = set()
        self._trigger_mode: str = "all"  # "all" | "mention_only" | "prefix"
        self._trigger_prefixes: list[str] = []

        # Socket Mode client (lazy import to avoid hard dep at module level).
        self._socket_client: Any = None
        self._listener_task: asyncio.Task | None = None
        self._running = False

        # Optional SQLite persistence.
        self._db_path = db_path
        self._db: sqlite3.Connection | None = None
        if db_path:
            self._init_db(db_path)

    # ------------------------------------------------------------------
    # SQLite persistence (optional)
    # ------------------------------------------------------------------

    def _init_db(self, db_path: str) -> None:
        """Create the events table if it doesn't exist."""
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute("""
            CREATE TABLE IF NOT EXISTS relay_events (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                channel TEXT NOT NULL,
                user TEXT NOT NULL,
                text TEXT NOT NULL DEFAULT '',
                thread_ts TEXT,
                ts TEXT NOT NULL,
                files TEXT NOT NULL DEFAULT '[]',
                raw TEXT NOT NULL DEFAULT '{}',
                received_at REAL NOT NULL,
                acked INTEGER NOT NULL DEFAULT 0,
                delivered_to TEXT
            )
        """)
        self._db.execute("""
            CREATE INDEX IF NOT EXISTS idx_relay_events_acked
            ON relay_events (acked, received_at)
        """)
        self._db.commit()

    def _persist_event(self, event: SlackEvent) -> None:
        if self._db is None:
            return
        import json
        try:
            self._db.execute(
                """INSERT OR IGNORE INTO relay_events
                   (id, type, channel, user, text, thread_ts, ts, files, raw, received_at, acked)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
                (
                    event.id,
                    event.type,
                    event.channel,
                    event.user,
                    event.text,
                    event.thread_ts,
                    event.ts,
                    json.dumps(event.files),
                    json.dumps(event.raw),
                    event.received_at,
                ),
            )
            self._db.commit()
        except Exception:
            logger.exception("db_persist_error", event_id=event.id)

    def _persist_ack(self, event_id: str) -> None:
        if self._db is None:
            return
        try:
            self._db.execute(
                "UPDATE relay_events SET acked = 1 WHERE id = ?",
                (event_id,),
            )
            self._db.commit()
        except Exception:
            logger.exception("db_ack_error", event_id=event_id)

    # ------------------------------------------------------------------
    # Filtering configuration
    # ------------------------------------------------------------------

    def set_allowlist(self, user_ids: list[str]) -> None:
        """Only buffer events from these Slack user IDs.  Empty list = all."""
        self._allowlist = set(user_ids)
        logger.info("allowlist_updated", count=len(user_ids))

    def set_trigger_mode(self, mode: str, prefixes: list[str] | None = None) -> None:
        """Configure which messages pass the trigger filter.

        Modes:
          - ``'all'``: every message is buffered.
          - ``'mention_only'``: only ``app_mention`` events or messages
            containing ``@bot_user_id``.
          - ``'prefix'``: only messages whose text starts with one of the
            given prefixes.
        """
        if mode not in ("all", "mention_only", "prefix"):
            raise ValueError(f"Invalid trigger mode: {mode!r}")
        self._trigger_mode = mode
        self._trigger_prefixes = prefixes or []
        logger.info("trigger_mode_set", mode=mode, prefixes=self._trigger_prefixes)

    # ------------------------------------------------------------------
    # Event filtering
    # ------------------------------------------------------------------

    def _passes_filters(self, event: SlackEvent) -> bool:
        """Return True if the event should be buffered."""
        # Self-message filtering.
        if self._bot_user_id and event.user == self._bot_user_id:
            return False

        # Deduplication by Slack ts.
        dedup_key = f"{event.channel}:{event.ts}"
        if dedup_key in self._seen_ts:
            return False
        self._seen_ts.append(dedup_key)

        # User allowlist.
        if self._allowlist and event.user not in self._allowlist:
            return False

        # Trigger mode.
        if self._trigger_mode == "mention_only":
            if event.type != "app_mention":
                # Also accept messages that @-mention the bot.
                if self._bot_user_id and f"<@{self._bot_user_id}>" not in event.text:
                    return False

        elif self._trigger_mode == "prefix":
            if not any(event.text.startswith(p) for p in self._trigger_prefixes):
                return False

        return True

    # ------------------------------------------------------------------
    # Socket Mode connection
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Connect to Slack Socket Mode and start the listener background task."""
        if self._running:
            logger.warning("relay_already_running")
            return

        # Lazy import so the module can be loaded without slack_sdk installed.
        from slack_sdk.socket_mode.aiohttp import SocketModeClient
        from slack_sdk.web.async_client import AsyncWebClient

        web_client = AsyncWebClient(token=self._bot_token)

        # Resolve the bot's own user ID for self-filtering.
        try:
            auth_resp = await web_client.auth_test()
            self._bot_user_id = auth_resp.get("user_id")
            logger.info("bot_identity_resolved", user_id=self._bot_user_id)
        except Exception:
            logger.warning("auth_test_failed", exc_info=True)

        self._socket_client = SocketModeClient(
            app_token=self._app_token,
            web_client=web_client,
        )

        self._socket_client.socket_mode_request_listeners.append(self._on_socket_event)

        self._running = True
        self._listener_task = asyncio.create_task(self._run_socket(self._socket_client))
        logger.info("relay_started")

    async def _run_socket(self, client: Any) -> None:
        """Keep the socket mode client connected."""
        try:
            await client.connect()
            # Block until stop() is called.
            while self._running:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("socket_mode_error")
        finally:
            try:
                await client.disconnect()
            except Exception:
                pass

    async def _on_socket_event(self, client: Any, req: Any) -> None:
        """Handle an incoming Socket Mode request."""
        # Always acknowledge the envelope so Slack doesn't retry.
        response = {"envelope_id": req.envelope_id}
        await client.send_socket_mode_response(response)

        payload = req.payload
        event_type: str | None = None
        event_data: dict = {}

        # Classify the event.
        if req.type == "events_api":
            event_data = payload.get("event", {})
            event_type = event_data.get("type")
            # Handle subtypes: skip bot_message, message_changed, etc.
            subtype = event_data.get("subtype")
            if subtype in ("bot_message", "message_changed", "message_deleted"):
                return

        elif req.type == "slash_commands":
            event_type = "slash_command"
            event_data = payload

        elif req.type == "interactive":
            # Interactive payloads are complex — store raw for now.
            event_type = payload.get("type", "interactive")
            event_data = payload

        if event_type is None or event_type not in _SUPPORTED_EVENT_TYPES and event_type != "slash_command":
            logger.debug("event_type_ignored", type=event_type)
            return

        event = SlackEvent.from_slack_payload(event_type, event_data)

        if not self._passes_filters(event):
            logger.debug("event_filtered", type=event_type, user=event.user)
            return

        async with self._buffer_lock:
            self._buffer.append(event)

        self._persist_event(event)
        self._new_event.set()

        logger.info(
            "event_buffered",
            event_id=event.id,
            type=event.type,
            channel=event.channel,
            user=event.user,
        )

    # ------------------------------------------------------------------
    # Stop
    # ------------------------------------------------------------------

    async def stop(self) -> None:
        """Disconnect gracefully."""
        self._running = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None

        if self._db:
            self._db.close()
            self._db = None

        # Wake any blocked pollers so they can exit.
        self._new_event.set()
        logger.info("relay_stopped")

    # ------------------------------------------------------------------
    # Event consumption API
    # ------------------------------------------------------------------

    async def poll_events(
        self,
        agent_id: str,
        *,
        limit: int = 10,
        timeout: float = 30.0,
    ) -> list[SlackEvent]:
        """Block up to *timeout* seconds, then return buffered events.

        Returns at most *limit* un-acked events.  Events are marked with
        ``delivered_to`` but not removed until ``ack_event`` is called.
        """
        deadline = time.monotonic() + timeout

        while True:
            async with self._buffer_lock:
                pending = [
                    e for e in self._buffer
                    if not e.acked and e.delivered_to is None
                ]
                batch = pending[:limit]
                for e in batch:
                    e.delivered_to = agent_id

            if batch:
                return batch

            # Wait for a new event or timeout.
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return []

            self._new_event.clear()
            try:
                await asyncio.wait_for(self._new_event.wait(), timeout=remaining)
            except asyncio.TimeoutError:
                return []

    async def ack_event(self, event_id: str) -> bool:
        """Mark an event as processed and remove it from the buffer."""
        async with self._buffer_lock:
            for i, event in enumerate(self._buffer):
                if event.id == event_id:
                    event.acked = True
                    self._buffer.remove(event)
                    self._persist_ack(event_id)
                    logger.debug("event_acked", event_id=event_id)
                    return True

        logger.debug("event_ack_not_found", event_id=event_id)
        return False

    async def peek_buffer(self) -> list[SlackEvent]:
        """Return a snapshot of all un-acked events (non-destructive)."""
        async with self._buffer_lock:
            return [e for e in self._buffer if not e.acked]

    @property
    def buffer_size(self) -> int:
        return len(self._buffer)

    @property
    def is_running(self) -> bool:
        return self._running
