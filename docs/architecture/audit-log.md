# Cross-OS Audit Log

> Status: live as of platform/oasis-rollout (May 2026, Workstream D)
> Related ADR: [ADR-006 — Cross-OS audit log](../decisions/ADR-006-cross-os-audit-log.md)

The Agentic OS layer ships a single shared, append-only audit table
(`agos_audit`) that every per-OS BFF route writes to. The viewer at
`/dashboard/os/audit` is a paginated, filterable read interface over that
table for the current actor.

This is **not** the platform-wide compliance audit log — see
[`docs/security/auth-model.md`](../security/auth-model.md) for the
`audit_events` table that `@platform/auth` writes to. The two tables
serve different audiences:

| Table          | Owner                    | Audience                  | Retention        |
| -------------- | ------------------------ | ------------------------- | ---------------- |
| `audit_events` | `@platform/auth`         | Compliance, security ops  | Long-lived       |
| `agos_audit`   | Agentic OS BFF routes    | The end user              | Same DB, no purge job today |

## Schema

Created in
[`packages/database/alembic/versions/0003_agentic_os.py`](../../packages/database/alembic/versions/0003_agentic_os.py):

```sql
CREATE TABLE IF NOT EXISTS agos_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID         NULL,            -- nullable: not every action has a project
  actor_id    UUID         NULL,            -- nullable: agent traffic may be unattributed
  os_slug     TEXT NOT NULL,                -- 'health' | 'maker' | ... | 'flags'
  action      TEXT NOT NULL,                -- per-OS stable string ('health.plan.upsert', ...)
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_audit_project_created_idx
    ON agos_audit (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agos_audit_actor_created_idx
    ON agos_audit (actor_id, created_at DESC);
```

### Why these columns

- **`project_id` nullable** — not every action belongs to a project (e.g.
  flag toggles, profile updates).
- **`actor_id` nullable** — leaves room for unattributed agent writes.
  Today every write path sets it; the viewer requires it for filtering.
- **`os_slug` text, not enum** — registry slugs are TypeScript-side; making
  the column an enum would force a migration on every new OS. Validation
  is enforced at the read layer via the registry-derived allowlist.
- **`payload` JSONB** — per-action shape; not centrally enumerated.
  Viewer renders it as collapsible JSON.

## Read API

[`GET /api/tiresias/agentic-os/audit`](../../apps/platform-web/src/app/api/tiresias/agentic-os/audit/route.ts)

| Param   | Type                | Notes                                          |
| ------- | ------------------- | ---------------------------------------------- |
| `slug`  | string              | Optional. Must be a registered slug or `flags`. Unknown slugs → 400. |
| `action`| string              | Optional. Substring match against `action` (case-sensitive). |
| `from`  | ISO-8601 timestamp  | Optional, inclusive lower bound on `created_at`. |
| `to`    | ISO-8601 timestamp  | Optional, exclusive upper bound on `created_at`. |
| `limit` | integer             | 1..200. Default 50.                            |
| `cursor`| opaque string       | From a previous response's `nextCursor`. Encodes `(created_at, id)`. |

Response shape:

```json
{
  "entries": [
    {
      "id":         "550e8400-e29b-41d4-a716-446655440000",
      "actorId":    "auth0|abc...",
      "osSlug":     "health",
      "action":     "health.plan.upsert",
      "payload":    { "planId": "...", "delta": { ... } },
      "createdAt":  "2026-05-08T07:42:11.318Z"
    }
  ],
  "nextCursor": "eyJ0cyI6IjIwMjYtMDUtMDhUMDc6NDI6MTEuMzE4WiIsImlkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIn0"
}
```

`nextCursor` is `null` when there are no more rows.

### Cursor codec

The cursor is `base64url(JSON({ts, id}))`, where `ts` is the ISO-8601
`created_at` and `id` is the UUID of the last row in the current page.
Pagination ordering is `created_at DESC`, tie-broken by `id DESC`. The
predicate for the next page is:

```sql
WHERE actor_id = $1
  AND (
    created_at < $cursor.ts
    OR (created_at = $cursor.ts AND id < $cursor.id)
  )
ORDER BY created_at DESC, id DESC
LIMIT $limit
```

Codec source: [`src/lib/agentic-os/audit/repo.ts`](../../apps/platform-web/src/lib/agentic-os/audit/repo.ts)
(`encodeCursor` / `decodeCursor`). Malformed cursors return `400`, never
silent fallbacks — that prevents subtle pagination bugs.

### Slug allowlist

The audit module derives its valid-slug set from `AGENTIC_OS_MODULES`
plus the literal `'flags'` (the feature-flag subsystem). Any other value
in the `slug` query param returns `400 invalid slug`. This stops a client
from running a wide-open `slug=anything` scan to enumerate the system.

## Write path

Every per-OS BFF route that mutates state calls `recordAudit` **before**
returning success to the client. The convention is:

```ts
// inside POST /api/tiresias/agentic-os/<slug>/...
const result = await repo.upsert(...)
await recordAudit({
  actorId,
  projectId: result.projectId ?? null,
  osSlug: '<slug>',
  action: '<slug>.<entity>.<verb>',  // e.g. 'maker.build.create'
  payload: { id: result.id, ... }
})
return NextResponse.json(result)
```

Failures during `recordAudit` log a warning but do not roll back the user
write — the operational stance is "audit is best-effort, not transactional".
A future hardening could move this into the same transaction as the write.

## Read auth

The viewer endpoint authenticates via the standard local-auth session
cookie (`getCurrentAuditUser` is a re-export of `getCurrentMakerUser`
from the maker session module — same identity, different name to make
the audit module's import graph explicit). It always filters by
`actor_id = current user`. There is no admin / cross-actor view today;
that's a follow-up that requires an RBAC scope.

## UI

[`/dashboard/os/audit`](../../apps/platform-web/src/app/(dashboard)/dashboard/os/audit/page.tsx)
renders a server-fetched first page and the
[`AuditViewer`](../../apps/platform-web/src/components/agentic-os/audit/audit-viewer.tsx)
client component handles filters + "Load more". The component never
fetches everything at once — it always paginates with the same cursor
contract as the API.

Filters supported in the UI:

- OS slug (dropdown of registered slugs + `flags`)
- Action substring (free text)
- Time range (two `<input type="datetime-local">`)

## Tests

[`src/__tests__/agentic-os/audit/audit.test.ts`](../../apps/platform-web/src/__tests__/agentic-os/audit/audit.test.ts)
— 17 tests covering:

- Cursor encode → decode round-trip (including unicode in payloads)
- Cursor decode rejects malformed and tampered values
- `isValidSlug` returns true for every registered slug + `flags`
- `listAudit` honors limit, cursor, slug filter, action substring,
  `from`/`to` bounds, and the actor filter
- Empty result returns `{ entries: [], nextCursor: null }`

## Smoke

[`step_audit_view`](../../scripts/smoke-test.py) runs after the per-OS
write probes:

1. `GET /api/.../audit?limit=50` → expect `200`
2. Body has `entries` array
3. **If at least one write probe ran**, expect `entries.length >= 1`
4. **If no write probes ran** (e.g. per-slug job for a read-only OS like
   `filmmaker`), accept `entries.length === 0`

The "expect ≥ 1" guard was added in
[PR #12](https://github.com/cristianxruvalcaba-coder/tiresias-monorepo/pull/12)
after the initial failure mode where `--os filmmaker --write` ran with
no actual writes (filmmaker is intentionally read-only in smoke). A
`404` from the endpoint short-circuits with a skip success for staged
rollout safety.

## Retention

There is no purge job today. `agos_audit` grows monotonically with user
activity. Two follow-ups are tracked:

- A `created_at`-based retention policy (e.g. drop rows older than 365
  days for non-compliance-relevant `os_slug` values).
- A backfill of `actor_id NOT NULL` so the column can be tightened.

## What this audit log does NOT do

- **No tamper evidence.** Rows are mutable in the database; there is no
  hash chain or signed log. The `audit_events` table in
  `@platform/auth` has a `prev_hash` column for that purpose.
- **No cross-actor read.** Every read is filtered to `actor_id = me`.
- **No partner/multi-tenant scoping.** Single-tenant table; tenants
  isolation lives at the `actor_id` level only.
- **Not a compliance log.** For SOC2/HIPAA-grade audit, route through the
  platform-api `audit_events` chain instead.
