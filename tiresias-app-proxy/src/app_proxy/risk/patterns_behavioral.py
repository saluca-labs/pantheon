"""Behavioral threat pattern definitions for cross-tool sequence analysis.

Each pattern is a function:
    (history: deque[ToolEvent]) -> BehavioralAlert | None

Patterns run in O(n) where n is the window size (max 100 events).
"""

from __future__ import annotations

import time
from collections import deque
from typing import Callable

from app_proxy.risk.analyzer import BehavioralAlert, ToolEvent

# ---------------------------------------------------------------------------
# Tool classification sets
# ---------------------------------------------------------------------------
_READ_TOOLS = frozenset({
    "read_messages", "list_channels", "download_file", "list_files",
    "get_message", "search_messages", "list_users", "get_user",
    "read_document", "list_documents", "get_channel", "list_members",
})

_WRITE_EXTERNAL_TOOLS = frozenset({
    "send_message", "upload_file", "email", "send_email",
    "post_message", "forward_message", "share_file",
})

_ADMIN_TOOLS = frozenset({
    "configure_relay", "set_allowlist", "update_policy", "set_permissions",
    "create_webhook", "delete_webhook", "modify_config", "set_role",
    "update_config", "manage_plugin",
})

_DESTRUCTIVE_TOOLS = frozenset({
    "delete", "remove", "delete_message", "remove_file", "delete_channel",
    "purge", "destroy", "drop", "delete_user", "remove_member",
})

_LIST_READ_TOOLS = _READ_TOOLS  # alias for reconnaissance


def _has_keyword(tool: str, keywords: tuple[str, ...]) -> bool:
    """Check if any keyword appears as a segment in the tool name (handles plugin prefixes)."""
    return any(kw in tool for kw in keywords)


def _is_read(tool: str) -> bool:
    """Check if a tool name looks like a read/list operation."""
    return tool in _READ_TOOLS or _has_keyword(tool, ("_read_", "_list_", "_get_", "_search_", "_fetch_", "_download_")) or tool.startswith(("list_", "get_", "read_", "search_", "fetch_"))


def _is_write_external(tool: str) -> bool:
    return tool in _WRITE_EXTERNAL_TOOLS or _has_keyword(tool, ("_send_", "_email_", "_forward_", "_share_", "_upload_")) or tool.startswith(("send_", "email_", "forward_", "share_", "upload_"))


def _is_admin(tool: str) -> bool:
    return tool in _ADMIN_TOOLS or _has_keyword(tool, ("_configure_", "_set_allowlist", "_update_config", "_manage_")) or tool.startswith(("configure_", "set_", "manage_"))


def _is_destructive(tool: str) -> bool:
    return tool in _DESTRUCTIVE_TOOLS or _has_keyword(tool, ("_delete_", "_remove_", "_purge_", "_destroy_", "_drop_")) or tool.startswith(("delete_", "remove_", "purge_", "destroy_", "drop_"))


# ---------------------------------------------------------------------------
# Pattern 1: Data exfiltration
# ---------------------------------------------------------------------------
def detect_data_exfiltration(history: deque[ToolEvent]) -> BehavioralAlert | None:
    """Agent reads from internal source THEN sends to external target within 5 min."""
    read_events: list[ToolEvent] = []
    for ev in history:
        if ev.status == "denied":
            continue
        if _is_read(ev.tool_name):
            read_events.append(ev)
        elif _is_write_external(ev.tool_name) and read_events:
            # Check if any read happened within 5 minutes before this write
            for rev in read_events:
                if 0 < (ev.timestamp - rev.timestamp) <= 300:
                    return BehavioralAlert(
                        pattern_name="data_exfiltration",
                        severity="critical",
                        description=(
                            f"Agent read from '{rev.tool_name}' then sent to "
                            f"'{ev.tool_name}' within {ev.timestamp - rev.timestamp:.0f}s"
                        ),
                        events=[rev, ev],
                        recommendation=(
                            "Review whether the agent should have access to both "
                            "internal read and external send tools. Consider adding "
                            "Cedar policy constraints on data flow between plugins."
                        ),
                    )
    return None


# ---------------------------------------------------------------------------
# Pattern 2: Privilege escalation
# ---------------------------------------------------------------------------
def detect_privilege_escalation(history: deque[ToolEvent]) -> BehavioralAlert | None:
    """New agent (< 10 total calls) using admin/config tools after only reads."""
    if len(history) < 2:
        return None

    admin_events: list[ToolEvent] = []
    non_read_non_admin_seen = False

    for ev in history:
        if _is_admin(ev.tool_name):
            admin_events.append(ev)
        elif not _is_read(ev.tool_name):
            non_read_non_admin_seen = True

    if not admin_events:
        return None

    # Flag if agent is new (< 10 total calls) and doing admin ops
    is_new_agent = len(history) < 10

    # Flag if admin tools appear after only read operations (no prior non-read, non-admin)
    has_only_reads_before_admin = not non_read_non_admin_seen

    if is_new_agent or has_only_reads_before_admin:
        return BehavioralAlert(
            pattern_name="privilege_escalation",
            severity="critical",
            description=(
                f"Agent invoked admin tool(s) "
                f"({', '.join(e.tool_name for e in admin_events[:3])}) "
                f"{'as a new agent (<10 calls)' if is_new_agent else 'after only read operations'}"
            ),
            events=admin_events[:3],
            recommendation=(
                "Verify agent identity and authorization level. "
                "New agents should not typically need admin access. "
                "Consider requiring human approval for configuration changes."
            ),
        )
    return None


# ---------------------------------------------------------------------------
# Pattern 3: Rapid destructive
# ---------------------------------------------------------------------------
def detect_rapid_destructive(history: deque[ToolEvent]) -> BehavioralAlert | None:
    """Agent calls 3+ destructive tools within 2 minutes."""
    destructive: list[ToolEvent] = [
        ev for ev in history if _is_destructive(ev.tool_name) and ev.status != "denied"
    ]
    if len(destructive) < 3:
        return None

    # Sliding window of 2 minutes over destructive events
    for i in range(len(destructive) - 2):
        window = [destructive[i]]
        for j in range(i + 1, len(destructive)):
            if destructive[j].timestamp - destructive[i].timestamp <= 120:
                window.append(destructive[j])
            else:
                break
        if len(window) >= 3:
            return BehavioralAlert(
                pattern_name="rapid_destructive",
                severity="warning",
                description=(
                    f"Agent performed {len(window)} destructive operations "
                    f"within {window[-1].timestamp - window[0].timestamp:.0f}s: "
                    f"{', '.join(e.tool_name for e in window[:5])}"
                ),
                events=window,
                recommendation=(
                    "Rate-limit destructive operations or require per-call "
                    "approval. Investigate whether bulk deletion was intended."
                ),
            )
    return None


# ---------------------------------------------------------------------------
# Pattern 4: Reconnaissance
# ---------------------------------------------------------------------------
def detect_reconnaissance(history: deque[ToolEvent]) -> BehavioralAlert | None:
    """Agent calls 5+ read/list tools in rapid succession (< 1 min) without writes."""
    reads: list[ToolEvent] = [
        ev for ev in history if _is_read(ev.tool_name) and ev.status != "denied"
    ]
    if len(reads) < 5:
        return None

    # Sliding window of 60 seconds
    for i in range(len(reads) - 4):
        window = [reads[i]]
        for j in range(i + 1, len(reads)):
            if reads[j].timestamp - reads[i].timestamp <= 60:
                window.append(reads[j])
            else:
                break

        if len(window) < 5:
            continue

        # Check that no write operations occurred during this window
        t_start = window[0].timestamp
        t_end = window[-1].timestamp
        has_writes = any(
            not _is_read(ev.tool_name) and t_start <= ev.timestamp <= t_end
            for ev in history
        )
        if not has_writes:
            return BehavioralAlert(
                pattern_name="reconnaissance",
                severity="warning",
                description=(
                    f"Agent performed {len(window)} read/list operations "
                    f"in {window[-1].timestamp - window[0].timestamp:.0f}s "
                    f"without any write actions"
                ),
                events=window,
                recommendation=(
                    "May be legitimate enumeration, but rapid scanning of "
                    "multiple resources can indicate reconnaissance. Monitor "
                    "for subsequent exfiltration attempts."
                ),
            )
    return None


# ---------------------------------------------------------------------------
# Pattern 5: Approval circumvention
# ---------------------------------------------------------------------------
def detect_approval_circumvention(history: deque[ToolEvent]) -> BehavioralAlert | None:
    """Agent submits same tool call 3+ times after denial (trying different args)."""
    # Group denied calls by tool_name
    denied_by_tool: dict[str, list[ToolEvent]] = {}
    for ev in history:
        if ev.status == "denied":
            denied_by_tool.setdefault(ev.tool_name, []).append(ev)

    for tool_name, denied_events in denied_by_tool.items():
        if len(denied_events) < 3:
            continue

        # Check if different argument keys were tried (circumvention signal)
        arg_key_sets = [frozenset(ev.arguments_keys) for ev in denied_events]
        unique_arg_sets = len(set(arg_key_sets))

        # 3+ denials on same tool — either same args (brute retry) or
        # different args (circumvention). Both are suspicious.
        return BehavioralAlert(
            pattern_name="approval_circumvention",
            severity="critical",
            description=(
                f"Agent submitted '{tool_name}' {len(denied_events)} times after denial"
                f"{' with varying arguments' if unique_arg_sets > 1 else ' with identical arguments'}"
            ),
            events=denied_events[:5],
            recommendation=(
                "Agent is repeatedly attempting a denied action. "
                "Consider temporarily blocking the agent or escalating "
                "to a human operator for review."
            ),
        )
    return None


# ---------------------------------------------------------------------------
# Registry of all pattern functions
# ---------------------------------------------------------------------------
PatternFunc = Callable[[deque[ToolEvent]], BehavioralAlert | None]

ALL_BEHAVIORAL_PATTERNS: list[PatternFunc] = [
    detect_data_exfiltration,
    detect_privilege_escalation,
    detect_rapid_destructive,
    detect_reconnaissance,
    detect_approval_circumvention,
]
