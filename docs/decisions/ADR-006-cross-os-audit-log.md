# ADR-006: Cross-OS Audit Log (`agos_audit`)

> Status: accepted (May 2026, platform/oasis-rollout, Workstream D)

## Context

Each Agentic OS owns its own primary tables. As the rollout progressed, two
related needs emerged:

1. **User-facing audit visibility.** End users needed to see "what happened
   in my Filmmaker project last week" without us building a per-OS history
   page nine times.
2. **Smoke and debugging visibility.** The smoke harness wanted a single
   place to confirm "did the write I just made actually land?" — independent
   of each OS's own read shape, which differs (some have `GET /list`, some
   have `GET /:id`, some require query params like `projectId`).

The platform already has a compliance-grade audit table (`audit_events`,
owned by `@platform/auth`) — but that table is scoped to authentication
events (login, logout, password reset, session invalidation). Rerouting
every per-OS write through it would conflate two very different audiences
(security ops vs. end users) and pollute the security-grade log with
high-volume product chatter.

We needed a **product-side** audit log: append-only, easy to query for
the current actor, no compliance constraints.

## Decision

Introduce a single shared table `agos_audit` plus a single read API
(`/api/tiresias/agentic-os/audit`) and a single viewer page
(`/dashboard/audit`). Every per-OS BFF write path calls a shared
`recordAudit({ actorId, projectId, osSlug, action, payload })` helper as
part of completing the request.

### Schema

```sql
CREATE TABLE agos_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NULL,
  actor_id    UUID NULL,
  os_slug     TEXT NOT NULL,
  action      TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agos_audit_project_created_idx ON agos_audit (project_id, created_at DESC);
CREATE INDEX agos_audit_actor_created_idx   ON agos_audit (actor_id,   created_at DESC);
```

Rationale for each non-obvious choice:

- **`os_slug` as TEXT, not enum** — keeps registry changes independent of
  DDL changes (see ADR-005). Validation enforced at read time via the
  registry-derived allowlist.
- **`project_id` nullable** — many actions (e.g. profile edits, flag
  toggles) have no project scope.
- **`actor_id` nullable** — leaves room for unattributed writes (e.g.
  future agent traffic via SoulKey before identity is resolved). All
  current writers set it.
- **`payload` JSONB** — per-action shape varies; central enumeration
  would be a never-ending update treadmill.
- **Two indices** — one for `actor_id` (the user's own audit view) and
  one for `project_id` (per-project history, not yet exposed in the UI
  but cheap to add).

### Pagination contract

Cursor encodes `(created_at, id)` as `base64url(JSON({ts, id}))`. Order
is `created_at DESC, id DESC`. Tie-breaking on `id` ensures stable
ordering across pages even when timestamps collide. Decoding rejects
malformed cursors with `400`, never silent fallbacks.

### Read auth

The endpoint always filters by `actor_id = current user`. There is no
admin / cross-actor read in v1.

## Consequences

**Positive:**

- One viewer to build, one cursor to test, one schema to maintain.
- Per-OS write paths get audit "for free" via a four-line `recordAudit`
  call; no new tables per OS.
- Smoke harness can verify writes via the audit endpoint instead of
  building per-OS read assertions.
- The `os_slug = 'flags'` reservation lets ADR-007 (feature flags) ride
  the same table without a parallel store.

**Negative / tradeoffs:**

- **Mutable rows.** Database admins can edit history. Acceptable for the
  product audience; insufficient for compliance. Compliance-grade events
  must continue to flow through `audit_events` with its `prev_hash`
  chain.
- **No retention policy yet.** The table grows monotonically. A retention
  job is a follow-up; current size projection (mid-five-figure rows per
  active user per year) gives us runway.
- **Best-effort writes.** A `recordAudit` failure logs a warning but does
  not fail the user write. This means audit completeness depends on the
  uptime of the same database the write went to — usually fine, since
  they share the connection pool, but technically lossy.
- **One actor, one filter.** No team / org / project view in v1; only
  the current actor's own rows are visible.

## Alternatives considered

- **Per-OS audit tables** (`agos_health_audit`, `agos_maker_audit`, …).
  Rejected: nine table schemas, nine viewers, nine indices, nine cursor
  codecs. The original duplication this ADR eliminates.

- **Reuse `audit_events`** from `@platform/auth`. Rejected: conflates
  compliance log with product chatter, blows up the security log volume
  by orders of magnitude, and mixes tamper-evident chained rows with
  product event noise.

- **Event bus (Redis Streams / Postgres LISTEN)**. Considered for an
  eventually-consistent fan-out architecture. Rejected for v1: simple
  synchronous insert is enough for the user-visible audit pane, and the
  team isn't yet running a streams consumer.

- **`os_slug` ENUM**. Rejected — see ADR-005. New OSes shouldn't require
  a DDL migration.

- **Hash-chained rows** (à la `audit_events.prev_hash`). Rejected for v1:
  product audit is high-volume and not a compliance asset. Adding the
  chain is a future option if we ever route compliance-relevant actions
  through this table.

## Migration / rollback

Table created in
[`packages/database/alembic/versions/0003_agentic_os.py`](../../packages/database/alembic/versions/0003_agentic_os.py)
during the very first OS rollout (Health). Other OSes have written into
it since; rolling back requires also removing the `recordAudit` calls
across nine packages. Treat the table as load-bearing.

## Followups

- **Retention policy** keyed off `created_at`, with per-`os_slug` overrides
  (e.g. keep `flags` events forever, prune `creator.post.preview` after
  90 days).
- **Cross-actor admin view** behind an RBAC scope (e.g. an org admin
  viewing their org's audit). Requires resolving membership at read time.
- **Move to write-side transaction** — make `recordAudit` participate
  in the same transaction as the user write. Currently best-effort.
