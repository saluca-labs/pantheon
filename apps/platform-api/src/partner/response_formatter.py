"""Harness-aware response formatter for the Tiresias partner portal.

Adapts partner portal output (links, tables, credentials, commission
summaries, onboarding steps) based on the calling harness environment
(CLI, chat, or voice).  No external dependencies beyond stdlib.
"""

from __future__ import annotations

from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# Harness mode enum and mapping
# ---------------------------------------------------------------------------

class HarnessMode(str, Enum):
    CLI = "cli"
    CHAT = "chat"
    VOICE = "voice"


_HARNESS_MAP: dict[str, HarnessMode] = {
    # CLI harnesses
    "claude-code": HarnessMode.CLI,
    "opencode": HarnessMode.CLI,
    "terminal": HarnessMode.CLI,
    "pydantic-ai": HarnessMode.CLI,
    "custom": HarnessMode.CLI,
    # Chat harnesses
    "chatbot": HarnessMode.CHAT,
    "slack": HarnessMode.CHAT,
    "telegram": HarnessMode.CHAT,
    "web": HarnessMode.CHAT,
    "openclaude": HarnessMode.CHAT,
    # Voice harnesses
    "audio": HarnessMode.VOICE,
    "voice": HarnessMode.VOICE,
    "hermes": HarnessMode.VOICE,
}

_current_mode: HarnessMode = HarnessMode.CLI


# ---------------------------------------------------------------------------
# Mode get / set
# ---------------------------------------------------------------------------

def set_harness_mode(mode: str) -> None:
    """Set the current harness mode.

    Accepts any known harness name (e.g. ``"claude-code"``, ``"slack"``,
    ``"audio"``) or a canonical category name (``"cli"``, ``"chat"``,
    ``"voice"``).  Unknown values default to CLI.
    """
    global _current_mode
    lowered = mode.lower().strip()

    # Direct category name?
    try:
        _current_mode = HarnessMode(lowered)
        return
    except ValueError:
        pass

    _current_mode = _HARNESS_MAP.get(lowered, HarnessMode.CLI)


def get_harness_mode() -> HarnessMode:
    """Return the current harness mode."""
    return _current_mode


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def format_link(text: str, url: str) -> str:
    match _current_mode:
        case HarnessMode.CLI:
            return f"{text}: {url}"
        case HarnessMode.CHAT:
            return f"[{text}]({url})"
        case HarnessMode.VOICE:
            return text


def format_table(headers: list[str], rows: list[list[str]]) -> str:
    match _current_mode:
        case HarnessMode.CLI | HarnessMode.CHAT:
            return _markdown_table(headers, rows)
        case HarnessMode.VOICE:
            return _voice_table_summary(headers, rows)


def _markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    if not headers:
        return ""

    # Compute column widths (handle empty rows gracefully).
    num_cols = len(headers)
    col_widths: list[int] = [len(h) for h in headers]
    for row in rows:
        for i in range(min(len(row), num_cols)):
            col_widths[i] = max(col_widths[i], len(str(row[i])))

    def _pad_row(cells: list[str]) -> str:
        parts = []
        for i in range(num_cols):
            val = str(cells[i]) if i < len(cells) else ""
            parts.append(val.ljust(col_widths[i]))
        return "| " + " | ".join(parts) + " |"

    header_line = _pad_row(headers)
    sep_line = "|" + "|".join("-" + "-" * w + "-" for w in col_widths) + "|"
    data_lines = [_pad_row(row) for row in rows]
    return "\n".join([header_line, sep_line] + data_lines)


def _voice_table_summary(headers: list[str], rows: list[list[str]]) -> str:
    count = len(rows)
    if count == 0:
        return "No items to report."

    summaries: list[str] = []
    ordinals = ["first", "second", "third"]
    for i, row in enumerate(rows[:3]):
        label = ordinals[i]
        value = str(row[0]) if row else "unknown"
        summaries.append(f"{label} is {value}")

    prefix = f"{count} item{'s' if count != 1 else ''}: "
    result = prefix + ", ".join(summaries)

    if count > 3:
        result += f", plus {count - 3} more"

    return result


def format_currency(amount: float) -> str:
    """Format *amount* as ``$X,XXX.XX`` regardless of harness mode."""
    return f"${amount:,.2f}"


def format_commission_summary(
    partner_name: str,
    month: str,
    referrals: int,
    mrr: float,
    earned: float,
    payout: float,
) -> str:
    earned_fmt = format_currency(earned)
    payout_fmt = format_currency(payout)
    mrr_fmt = format_currency(mrr)

    match _current_mode:
        case HarnessMode.CLI:
            return _markdown_table(
                ["Field", "Value"],
                [
                    ["Partner", partner_name],
                    ["Month", month],
                    ["Referrals", str(referrals)],
                    ["MRR", mrr_fmt],
                    ["Earned", earned_fmt],
                    ["Payout", payout_fmt],
                ],
            )
        case HarnessMode.CHAT:
            lines = [
                f"## Commission Summary: {partner_name}",
                f"**Month:** {month}",
                f"**Referrals:** {referrals}",
                f"**MRR:** {mrr_fmt}",
                f"**Earned:** {earned_fmt}",
                f"**Payout:** {payout_fmt}",
            ]
            return "\n".join(lines)
        case HarnessMode.VOICE:
            return (
                f"{partner_name}, {month}: {referrals} referrals, "
                f"{earned_fmt} earned, {payout_fmt} payout"
            )


def format_partner_status(partner: dict[str, Any]) -> str:
    name = partner.get("name", "Unknown")
    status = partner.get("status", "unknown")
    referral_count = partner.get("referral_count", 0)
    commission_rate = partner.get("commission_rate", 0)

    match _current_mode:
        case HarnessMode.CLI:
            lines = [
                f"Name: {name}",
                f"Status: {status}",
                f"Referrals: {referral_count}",
                f"Commission Rate: {commission_rate}%",
            ]
            return "\n".join(lines)
        case HarnessMode.CHAT:
            indicator = "🟢" if status == "active" else "🔴" if status == "inactive" else "🟡"
            lines = [
                f"**{name}** {indicator}",
                f"Status: {status}",
                f"Referrals: {referral_count}",
                f"Commission Rate: {commission_rate}%",
            ]
            return "\n".join(lines)
        case HarnessMode.VOICE:
            return (
                f"{name} is {status}, {referral_count} referrals, "
                f"earning {commission_rate} percent"
            )


def format_onboarding_step(
    step_num: int,
    total: int,
    title: str,
    detail: str,
    action_url: str | None = None,
) -> str:
    match _current_mode:
        case HarnessMode.CLI:
            lines = [f"[{step_num}/{total}] {title}", f"  {detail}"]
            if action_url:
                lines.append(f"  {action_url}")
            return "\n".join(lines)
        case HarnessMode.CHAT:
            checkbox = "- [ ]"
            lines = [
                f"{checkbox} **Step {step_num}/{total}: {title}**",
                f"  {detail}",
            ]
            if action_url:
                lines.append(f"  [Continue]({action_url})")
            return "\n".join(lines)
        case HarnessMode.VOICE:
            return f"Step {step_num} of {total}: {title}"


def should_render_image() -> bool:
    return _current_mode == HarnessMode.CHAT


def max_response_tokens() -> int:
    match _current_mode:
        case HarnessMode.CLI:
            return 500
        case HarnessMode.CHAT:
            return 800
        case HarnessMode.VOICE:
            return 120


def format_credential(label: str, value: str) -> str:
    match _current_mode:
        case HarnessMode.CLI:
            return f"{label}: {value}"
        case HarnessMode.CHAT:
            return f"{label}: `{value}`"
        case HarnessMode.VOICE:
            return f"{label} has been set"
