---
phase: 19-self-service-chatbot
plan: "02"
subsystem: chatbot
tags: [chatbot, escalation, history, actions, linear, telegram]
dependency_graph:
  requires: [19-01]
  provides: [BOT-05, BOT-06, BOT-07]
  affects: [src/chatbot/router.py, src/chatbot/history.py, src/chatbot/actions.py, src/chatbot/escalation.py]
tech_stack:
  added: []
  patterns: [in-memory deque store, intent regex matching, SSE action event, auto-escalation confidence threshold]
key_files:
  created:
    - ~/tiresias/src/chatbot/history.py
    - ~/tiresias/src/chatbot/actions.py
    - ~/tiresias/src/chatbot/escalation.py
  modified:
    - ~/tiresias/src/chatbot/router.py
decisions:
  - "TicketResponse.created_at is str not datetime -- passed now.isoformat() and sla_deadline_for(severity, now) with two args"
  - "Escalation confidence threshold set at 0.4 -- matches plan spec"
  - "Action detection is pre-LLM, fires SSE action event before token stream begins"
metrics:
  duration: "~20 minutes"
  completed: "2026-03-21"
  tasks_completed: 2
  files_changed: 4
---

# Phase 19 Plan 02: Chatbot Actions, Escalation, and History Summary

Extended the Tiresias chatbot backend with action execution, auto-escalation, and in-memory chat history. Customers can now trigger data-backed responses for agent status and alerts, automatically receive a Linear ticket when the bot is uncertain, and review conversation history via API.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | History store + action engine + escalation module | 0721753 | history.py, actions.py, escalation.py |
| 2 | Extend router with history endpoint + escalation integration | 7937731 | router.py |

## What Was Built

### history.py
- In-memory per-tenant chat history: `append_turn`, `list_sessions`, `get_session`
- Retention: 100 sessions per tenant, 50 turns per session (FIFO deque eviction)
- Sessions keyed by `(tenant_id, session_id)`

### actions.py
- `detect_action(message)`: regex-based intent matching, returns action name or None
- `execute_action(action, message)`: dispatches to handlers, returns formatted string
- Supported action intents:
  - `check_agent_status`: reads baseline_engine._baselines + quarantine module
  - `get_recent_alerts`: reads alert_router._recent_alerts (last 5)
  - `test_detection_rule`: returns dashboard/API guidance
  - `get_dashboard_link`: maps 15 keywords to dashboard paths
- All action handlers are fault-tolerant (except returns None on error)

### escalation.py
- `should_escalate(message, confidence)`: returns True if confidence < 0.4 OR escalation phrase detected
- Escalation phrases: "talk to a human", "speak to a person/human/agent", "escalate", "real person", "live agent", "open/create ticket", "need help"
- `escalate(...)`: builds TicketResponse (P2/question), calls `create_linear_issue()` then `send_ticket_notification()`
- Confidence threshold: **0.4**

### router.py (extended)
- Routes added:
  - `GET /v1/support/chat/history` — list sessions for tenant
  - `GET /v1/support/chat/history/{session_id}` — full turn list with tenant isolation (403 if mismatch)
- `POST /v1/support/chat` changes:
  - Pre-LLM: `detect_action()` called; if match, `execute_action()` result emitted as `event: action` SSE before tokens
  - Post-LLM: `append_turn()` persists history
  - Post-LLM: `should_escalate()` checked; if true, `escalate()` called and `done` event includes `"escalated": true`
  - `_sse_done()` now includes `escalated` boolean field
  - `_sse_action()` helper added

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sla_deadline_for signature mismatch**
- **Found during:** Task 1 (reading models.py before writing escalation.py)
- **Issue:** Plan template called `sla_deadline_for("p2")` with one arg; actual signature is `sla_deadline_for(severity, created_at: datetime) -> str`
- **Fix:** Called `sla_deadline_for("p2", now)` with both args; also confirmed `TicketResponse.created_at` is `str` not `datetime`, so passed `now.isoformat()`
- **Files modified:** escalation.py
- **Commit:** 0721753

## Known Stubs

None. All data flows are wired: action handlers read live backend state (with graceful fallback), escalation calls real Linear and Telegram integrations via existing support modules.

## Self-Check: PASSED

Files exist:
- FOUND: ~/tiresias/src/chatbot/history.py
- FOUND: ~/tiresias/src/chatbot/actions.py
- FOUND: ~/tiresias/src/chatbot/escalation.py
- FOUND: ~/tiresias/src/chatbot/router.py

Commits:
- FOUND: 0721753 (feat(19-02): add history store, action engine, and escalation module)
- FOUND: 7937731 (feat(19-02): extend router with history endpoints and escalation integration)

All assertions passed in final verification run.
