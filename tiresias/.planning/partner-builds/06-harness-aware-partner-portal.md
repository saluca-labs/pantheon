# Build 06: Harness-Aware Partner Portal

**Status:** Planned
**Author:** Saluca Engineering
**Date:** 2026-04-06
**Depends on:** Build 05 (reseller/MSSP differentiation), Partner MCP Server spec (`/c/saluca-deploy/marketing/specs/partner-mcp-server.md`)
**Blocks:** Partner MCP initialization flow (voice/edge mode)

---

## 1. Problem

Alfred and the partner portal operate identically regardless of how the user connects. A partner on a voice call with Hermes gets the same Markdown table they would see in a terminal. An admin using Slack gets raw URLs instead of clickable links. The partner MCP init flow (spec: `partner-mcp-init.md`) already notes voice mode as a requirement but has no implementation path.

Specific failures without harness awareness:

1. **Voice partners receive unreadable output.** Commission reports, onboarding steps, and Stripe Connect URLs cannot be spoken aloud in their current form.
2. **CLI users get visual noise.** Embedded images, styled cards, and button prompts are meaningless in a terminal.
3. **Chat users miss affordances.** Clickable links, inline previews, and quick-reply buttons are available but unused.
4. **Partner MCP server has no harness signal.** The `partner-mcp-server.md` spec defines 18+ tools but none adapt their response format to the calling environment.
5. **Soul session already carries harness type but nothing reads it.** The `soul_session_init` call passes `harness: "claude-code"` (or equivalent) and it sits unused in session state.

---

## 2. Harness Detection

### 2.1 Detection Sources

| Source | Field | Values | Reliability |
|--------|-------|--------|-------------|
| `soul_session_init` | `harness` | `claude-code`, `chatbot`, `audio`, `hermes`, `pydantic-ai`, `custom` | High; set by harness config |
| MCP connection metadata | `User-Agent` header | Harness identifier string | Medium; not all harnesses set it |
| Explicit tool call | `set_harness_mode` | Any supported value | High; manual override |
| Session state (Tartarus) | `preferences.harness` | Stored from last session | Fallback only |

### 2.2 Canonical Harness Categories

Regardless of the specific harness name, all values map to one of three canonical categories:

| Category | Harness values that map here | Description |
|----------|------------------------------|-------------|
| `cli` | `claude-code`, `pydantic-ai`, `custom` | Terminal/code environment |
| `chat` | `chatbot`, `slack`, `telegram`, `web`, `openclaude` | Rich text UI with clickable elements |
| `voice` | `audio`, `hermes` | Spoken interface, minimal text |

Unknown harness values default to `cli` (safest; no assumptions about rendering).

### 2.3 Detection Flow

```
1. Read harness from soul_session_init response
2. Map to canonical category (cli/chat/voice)
3. Store in session context: session.harness_category
4. If not present, check Tartarus preferences.harness
5. If still unknown, default to "cli"
6. Allow override via set_harness_mode tool at any time
```

---

## 3. Behavior Adaptation Matrix

### 3.1 Output Formatting

| Dimension | cli | chat | voice |
|-----------|-----|------|-------|
| **Tables** | Markdown ASCII tables | Rendered HTML/rich tables | Skip; state key numbers verbally |
| **Code blocks** | Fenced Markdown (``` ) | Syntax-highlighted blocks | Skip; describe what the code does |
| **Links** | Plain text URL on its own line | `[Title](url)` hyperlinks | "I'll send you a link" + push to companion channel |
| **Images/charts** | Skip; describe textually | Render inline where platform supports | Skip; describe the trend or finding |
| **Lists** | Bulleted Markdown | Bulleted with icons/emoji where appropriate | Numbered, max 3 items, spoken as "first... second... third..." |
| **Errors** | Full stack context, file paths | Simplified message with "contact support" link | "Something went wrong. I'll flag this for the team." |

### 3.2 Verbosity

| Dimension | cli | chat | voice |
|-----------|-----|------|-------|
| **Max response length** | 500 tokens | 800 tokens | 120 tokens |
| **Explanation depth** | Concise, action-oriented | Moderate, explain context | Minimal, 1 to 2 sentences |
| **Confirmation style** | Single line: "Done. Partner invited." | Styled confirmation with details | "Done." or "Sent." |
| **Follow-up prompts** | Suggest next command | Show button options if platform supports | Ask one yes/no question |

### 3.3 Interaction Capabilities

| Capability | cli | chat | voice |
|------------|-----|------|-------|
| **Run commands** | Yes (file edits, deploys, curl) | No (suggest commands, don't execute) | No |
| **File creation** | Yes | Offer download link | Write silently, confirm verbally |
| **Multi-step wizards** | Sequential prompts | Card-based step indicator | One question at a time, max 5 steps |
| **Credentials/secrets** | Print to terminal (user's local env) | Show in ephemeral message if supported, otherwise mask | Never speak; write to file silently |
| **Progress indicators** | Inline status lines | Progress bar or percentage | "Working on it... done." |

---

## 4. Implementation

### 4.1 Session State Extension

Add `harness_category` to the session context object returned by `soul_session_init`:

```python
# In soul session response (already returns harness, just add category)
{
    "session_id": "alfred-main",
    "harness": "claude-code",
    "harness_category": "cli",  # NEW: canonical category
    "node_id": "minipc",
    ...
}
```

### 4.2 Response Formatter Module

New file: `src/partner/response_formatter.py`

```python
from enum import Enum
from typing import Any


class HarnessCategory(str, Enum):
    CLI = "cli"
    CHAT = "chat"
    VOICE = "voice"


HARNESS_MAP: dict[str, HarnessCategory] = {
    "claude-code": HarnessCategory.CLI,
    "pydantic-ai": HarnessCategory.CLI,
    "custom": HarnessCategory.CLI,
    "chatbot": HarnessCategory.CHAT,
    "slack": HarnessCategory.CHAT,
    "telegram": HarnessCategory.CHAT,
    "web": HarnessCategory.CHAT,
    "openclaude": HarnessCategory.CHAT,
    "audio": HarnessCategory.VOICE,
    "hermes": HarnessCategory.VOICE,
}


def resolve_category(harness: str | None) -> HarnessCategory:
    if harness is None:
        return HarnessCategory.CLI
    return HARNESS_MAP.get(harness.lower(), HarnessCategory.CLI)


def format_link(text: str, url: str, category: HarnessCategory) -> str:
    match category:
        case HarnessCategory.CLI:
            return f"{text}: {url}"
        case HarnessCategory.CHAT:
            return f"[{text}]({url})"
        case HarnessCategory.VOICE:
            return f"I'll send you the {text.lower()} link."


def format_table(
    headers: list[str],
    rows: list[list[str]],
    category: HarnessCategory,
) -> str:
    match category:
        case HarnessCategory.CLI:
            # Standard Markdown table
            col_widths = [
                max(len(h), max((len(str(r)) for r in col), default=0))
                for h, col in zip(headers, zip(*rows))
            ]
            header_line = "| " + " | ".join(
                h.ljust(w) for h, w in zip(headers, col_widths)
            ) + " |"
            sep_line = "|-" + "-|-".join("-" * w for w in col_widths) + "-|"
            data_lines = [
                "| " + " | ".join(
                    str(c).ljust(w) for c, w in zip(row, col_widths)
                ) + " |"
                for row in rows
            ]
            return "\n".join([header_line, sep_line] + data_lines)

        case HarnessCategory.CHAT:
            # Same Markdown; chat renderers handle it
            return format_table(headers, rows, HarnessCategory.CLI)

        case HarnessCategory.VOICE:
            # Summarize: just the first column and a key metric
            if not rows:
                return "No data to report."
            summary_parts = []
            for row in rows[:3]:  # Max 3 items for voice
                summary_parts.append(f"{row[0]}: {row[-1]}")
            result = ". ".join(summary_parts) + "."
            if len(rows) > 3:
                result += f" Plus {len(rows) - 3} more."
            return result


def should_render_image(category: HarnessCategory) -> bool:
    return category == HarnessCategory.CHAT


def max_response_tokens(category: HarnessCategory) -> int:
    match category:
        case HarnessCategory.CLI:
            return 500
        case HarnessCategory.CHAT:
            return 800
        case HarnessCategory.VOICE:
            return 120


def credential_display(
    label: str,
    value: str,
    category: HarnessCategory,
    file_path: str | None = None,
) -> str:
    """Format credential output. Voice never speaks secrets."""
    match category:
        case HarnessCategory.CLI:
            return f"{label}: {value}"
        case HarnessCategory.CHAT:
            return f"**{label}:** `{value}` (treat as sensitive)"
        case HarnessCategory.VOICE:
            if file_path:
                return f"Your {label.lower()} has been saved to a file."
            return f"Your {label.lower()} is ready. Check your written channel for details."
```

### 4.3 Companion Channel for Voice Mode

Voice mode cannot display links, credentials, or detailed data. A companion channel solves this:

1. When `harness_category == voice`, any link/credential/table output is also pushed to a designated written channel (Slack DM, email, or Tartarus local file).
2. The voice response references the push: "Check your messages for the link."
3. Companion channel is configured during partner onboarding (`preferences.companion_channel`).

Options:
- `slack_dm`: Push via Slack API to partner's DM
- `email`: Send via partner's registered email
- `local_file`: Write to `~/.tiresias-partner/companion-output.md` (default if nothing configured)

### 4.4 Integration with Partner MCP Tools

Every partner MCP tool response passes through the formatter before returning to the agent. The pattern:

```python
# In any MCP tool handler
from src.partner.response_formatter import (
    resolve_category,
    format_link,
    format_table,
    should_render_image,
)

async def handle_tool_call(request, session):
    category = resolve_category(session.get("harness"))

    # ... tool logic ...

    # Format output for harness
    link = format_link("Stripe Connect Setup", onboarding_url, category)
    return {"content": link}
```

---

## 5. Partner Portal Specific Adaptations

### 5.1 Stripe Connect Onboarding

| Step | cli | chat | voice |
|------|-----|------|-------|
| Generate onboarding link | Print URL | Clickable "Complete Stripe Setup" button | "I've generated your Stripe setup link. Check your messages." |
| Account status check | `Status: pending_verification` | Styled status card with progress indicator | "Your Stripe account is almost ready. They need one more document." |
| Payout notification | Terminal line with amount | Rich card with amount, date, breakdown | "You received $1,240 from Tiresias." |

### 5.2 Commission Reports

| Report type | cli | chat | voice |
|-------------|-----|------|-------|
| Monthly summary | ASCII table with partner, revenue, commission columns | Rendered table + trend chart | "Your commissions this month: $3,200, up 15% from last month." |
| Deal detail | Key-value pairs, one per line | Expandable card | "Deal with Apex closed at $2,400 MRR. Your share is $600." |
| Payout history | Markdown table | Table + CSV download link | "Three payouts this quarter totaling $8,100." |

### 5.3 Partner Invitation

| Action | cli | chat | voice |
|--------|-----|------|-------|
| Create invitation | Print invitation code + raw email text | Styled email preview with "Send" button | "Invitation created for maria@apex.com. Should I send it now?" |
| Invitation status | `PENDING` / `ACCEPTED` / `EXPIRED` inline | Status badge with timestamp | "Maria accepted her invitation two hours ago." |
| Bulk invite | CSV path input, results table | File upload widget, progress bar | Not supported; defer to written channel |

### 5.4 Partner Onboarding (MCP Init Flow)

The conversational onboarding in `partner-mcp-init.md` adapts per harness:

| Phase | cli | chat | voice |
|-------|-----|------|-------|
| Welcome message | Full text block (as specified in init spec) | Same text with styled formatting | "Welcome to the Tiresias Partner Network. I'll walk you through setup. What's your name and company?" |
| Profile collection | Free-form text prompt | Form fields if platform supports, otherwise conversational | One question at a time: "What's your name?" then "What's your company?" then "What market do you focus on?" |
| Pro license delivery | Print key to terminal | Show key in code block + copy button | "Your license is saved locally. You're all set." |
| Product training | Full curriculum list | Interactive checklist | "Ready for a quick product overview? It'll take about five minutes." |
| First asset generation | Trigger command, receive Markdown | Preview in chat, download button | "I've created your first sales deck. It's in your assets folder." |

---

## 6. Harness Override and Preferences

Partners can override the detected harness at any time:

```
# Via MCP tool
set_harness_mode("voice")   # Force voice mode even on CLI
set_harness_mode("auto")    # Reset to auto-detection

# Via preferences (persisted in Tartarus)
preferences.harness = "chat"           # Default harness for this partner
preferences.companion_channel = "slack_dm"  # Where voice overflow goes
preferences.verbosity_override = null  # null = use harness default
```

The override persists for the current session. The preference persists across sessions.

---

## 7. Testing Strategy

| Test | Method |
|------|--------|
| Harness mapping correctness | Unit test: every known harness string maps to expected category |
| Unknown harness fallback | Unit test: garbage string returns `cli` |
| Link formatting per category | Unit test: `format_link` output matches expected pattern for each category |
| Table formatting for voice | Unit test: voice tables summarize, max 3 items |
| Credential suppression in voice | Unit test: `credential_display` with voice category never contains the raw value |
| Voice companion channel push | Integration test: voice mode link triggers companion channel write |
| End-to-end onboarding per harness | Manual test: run partner init flow in claude-code, Slack, and Hermes; verify output is appropriate |
| Response length enforcement | Unit test: `max_response_tokens` returns correct limits per category |

---

## 8. File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `src/partner/response_formatter.py` | Create | Harness detection, category mapping, all formatting helpers |
| `src/partner/companion.py` | Create | Companion channel push logic (Slack DM, email, local file) |
| `src/partner/router.py` | Modify | Inject `harness_category` into request context from session |
| `src/partner/types.py` | Modify | Add `HarnessCategory` to shared types |
| Soul session init endpoint | Modify | Return `harness_category` alongside raw `harness` field |
| Partner MCP tool handlers | Modify | Wrap response formatting through `response_formatter` |
| `tests/test_response_formatter.py` | Create | Unit tests for all formatter functions |

---

## 9. Migration Notes

No database migration required. The `harness_category` field lives in session state (in-memory) and optionally in Tartarus `preferences` table (already has a flexible key-value schema). No schema changes to `_soul_partners` or any PostgreSQL table.
