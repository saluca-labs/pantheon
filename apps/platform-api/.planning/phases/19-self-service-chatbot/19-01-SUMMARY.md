---
phase: 19-self-service-chatbot
plan: "01"
subsystem: backend/chatbot
tags: [chatbot, sse, openrouter, knowledge-base, tfidf, support]
dependency_graph:
  requires: [18-01-SUMMARY.md]
  provides: [POST /v1/support/chat SSE endpoint, TF-IDF knowledge search, customer context injection]
  affects: [src/main.py, config/settings.py]
tech_stack:
  added: [httpx streaming, TF-IDF in stdlib (math/re), SSE via StreamingResponse]
  patterns: [AsyncGenerator SSE streaming, keyword+TF-IDF hybrid search, best-effort context injection]
key_files:
  created:
    - ~/tiresias/src/chatbot/__init__.py
    - ~/tiresias/src/chatbot/knowledge.py
    - ~/tiresias/src/chatbot/context.py
    - ~/tiresias/src/chatbot/router.py
    - ~/tiresias/src/chatbot/knowledge/quickstart.md
    - ~/tiresias/src/chatbot/knowledge/api_reference.md
    - ~/tiresias/src/chatbot/knowledge/integration_guide.md
    - ~/tiresias/src/chatbot/knowledge/detection_rules.md
    - ~/tiresias/src/chatbot/knowledge/prh_patterns.md
  modified:
    - ~/tiresias/src/main.py
    - ~/tiresias/config/settings.py
decisions:
  - "OpenRouter gemma-3-27b-it:free as primary model (free tier, never Anthropic API)"
  - "TF-IDF over stdlib only — no new Python deps per project constraint"
  - "SSE via FastAPI StreamingResponse + AsyncGenerator — no websockets needed"
  - "context.py never raises — best-effort only, graceful degradation on any state miss"
  - "history.append_turn deferred to plan 02 — ImportError catch in router.py"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-22"
  tasks_completed: 2
  tasks_total: 2
  files_created: 9
  files_modified: 2
---

# Phase 19 Plan 01: Self-Service Chatbot Backend Summary

SSE streaming support chatbot backed by OpenRouter (gemma-3-27b-it:free), keyword+TF-IDF knowledge base over 5 Tiresias doc files, and best-effort customer context injection from in-process request/app state.

## What Was Built

### src/chatbot/ module (new)

| File | Purpose |
|------|---------|
| `__init__.py` | Empty module init |
| `knowledge.py` | TF-IDF doc search: `load_knowledge_base()`, `search_knowledge(query, top_k=3)` |
| `context.py` | `build_customer_context(request)` — injects tier, tenant_id, agent count, recent alerts |
| `router.py` | `POST /v1/support/chat` SSE endpoint, OpenRouter streaming, knowledge retrieval |

### Knowledge base (5 files, 36 chunks total)

| File | Chunks | Content |
|------|--------|---------|
| `quickstart.md` | 7 | Installation, SoulKey creation, SDK usage, setup errors |
| `api_reference.md` | 9 | All API endpoints: auth, enforcement, detection, analytics, PRH, support, SIEM |
| `integration_guide.md` | 7 | OpenAI/Anthropic/LangChain/SIEM integration patterns |
| `detection_rules.md` | 7 | Sigma rule format, examples, anomaly types, playbooks |
| `prh_patterns.md` | 6 | 6 threat categories, risk score interpretation, PRH config |

**TF-IDF stats:** vocab_size=625, module auto-loads on import.

### Routes registered

- `POST /v1/support/chat` — SSE stream via `chatbot_router` included in main app

### settings.py change

Added `openrouter_api_key: Optional[str]` field with `OPENROUTER_API_KEY` env var binding. Router falls back to `os.environ.get("OPENROUTER_API_KEY")` if settings lookup fails.

## Verification Results

All success criteria passed:

- `search_knowledge('how do I install the SDK')` returns `DocChunk(source='quickstart', ...)` — PASS
- `search_knowledge('PRH threat categories injection')` returns `DocChunk(source='prh_patterns', ...)` — PASS
- `search_knowledge('Sigma detection rule YAML')` returns `DocChunk(source='detection_rules', ...)` — PASS
- `/v1/support/chat` in `app.routes` — PASS
- All modules import without error — PASS

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `e0065c5` | feat(19-01): knowledge base — 5 markdown docs + TF-IDF search engine |
| Task 2 | `ab24ad4` | feat(19-01): context injector, SSE chat router, main.py wire-up |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SSH heredoc quoting conflict in router.py**
- **Found during:** Task 2
- **Issue:** The `_SYSTEM_TEMPLATE` string contained single quotes (`i don't know`, `i'm not sure`) which broke bash heredoc via SSH pipe.
- **Fix:** Used `scp` to transfer the file from local Windows temp to GCP, then `cp` to destination. Template string rewritten as Python string concatenation to avoid bash quoting issues.
- **Files modified:** `src/chatbot/router.py`
- **Commit:** ab24ad4

## Known Stubs

None — all data sources are wired. `build_customer_context()` is best-effort (graceful degradation), not stubbed. History persistence stub is explicitly documented in plan 02 scope via `ImportError` catch.

## Self-Check: PASSED
