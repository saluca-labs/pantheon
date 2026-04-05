"""Helper to build Cedar evaluation context dicts for the App Proxy."""

from __future__ import annotations

import datetime
from typing import Any, Sequence


def build_tool_call_context(
    tool_name: str,
    rate_count: int,
    has_approval: bool,
    input_args: dict[str, Any] | None = None,
    *,
    rate_window_seconds: int = 60,
    estimated_cost_usd: int = 0,
) -> dict[str, Any]:
    """Build a flat context dict matching the Cedar ``tool_call`` action schema.

    Parameters
    ----------
    tool_name:
        Canonical name of the tool being invoked (e.g. ``"slack.post_message"``).
    rate_count:
        Number of calls in the current rate window.
    has_approval:
        Whether a human approval token is attached to this call.
    input_args:
        Raw tool input arguments — only the *keys* are forwarded to Cedar
        (values never leave the proxy).
    rate_window_seconds:
        Size of the sliding rate window in seconds.
    estimated_cost_usd:
        Estimated cost in whole USD cents (Cedar ``Long``).
    """
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    input_keys: list[str] = sorted(input_args.keys()) if input_args else []

    return {
        "tool_name": tool_name,
        "rate_count": rate_count,
        "rate_window_seconds": rate_window_seconds,
        "hour_of_day": now_utc.hour,
        "has_approval": has_approval,
        "estimated_cost_usd": estimated_cost_usd,
        "input_keys": input_keys,
    }


def build_read_context(
    tool_name: str,
) -> dict[str, Any]:
    """Build context for a ``read`` action."""
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    return {
        "tool_name": tool_name,
        "hour_of_day": now_utc.hour,
    }


def build_write_context(
    tool_name: str,
    rate_count: int,
    has_approval: bool,
) -> dict[str, Any]:
    """Build context for a ``write`` action."""
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    return {
        "tool_name": tool_name,
        "hour_of_day": now_utc.hour,
        "has_approval": has_approval,
        "rate_count": rate_count,
    }
