"""Slack event types for the relay daemon."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field


@dataclass(slots=True)
class SlackEvent:
    """A normalized Slack event consumed by agent tools."""

    id: str = ""
    type: str = ""  # "message", "app_mention", "slash_command", "file_shared"
    channel: str = ""
    user: str = ""
    text: str = ""
    thread_ts: str | None = None
    ts: str = ""  # Slack message timestamp
    files: list[dict] = field(default_factory=list)
    raw: dict = field(default_factory=dict)
    received_at: float = field(default_factory=time.time)

    # Tracking fields
    acked: bool = False
    delivered_to: str | None = None  # agent_id that consumed this event

    @classmethod
    def from_slack_payload(cls, event_type: str, payload: dict) -> SlackEvent:
        """Build a SlackEvent from a raw Slack event payload."""
        return cls(
            id=str(uuid.uuid4()),
            type=event_type,
            channel=payload.get("channel", payload.get("channel_id", "")),
            user=payload.get("user", payload.get("user_id", "")),
            text=payload.get("text", payload.get("command", "")),
            thread_ts=payload.get("thread_ts"),
            ts=payload.get("ts", payload.get("event_ts", "")),
            files=payload.get("files", []),
            raw=payload,
            received_at=time.time(),
        )

    def to_dict(self) -> dict:
        """Serialize for JSON transport."""
        return {
            "id": self.id,
            "type": self.type,
            "channel": self.channel,
            "user": self.user,
            "text": self.text,
            "thread_ts": self.thread_ts,
            "ts": self.ts,
            "files": self.files,
            "received_at": self.received_at,
        }
