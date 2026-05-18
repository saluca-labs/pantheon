# Audit Trail

> Status: stable as of platform/oasis-rollout (May 2026)

The platform maintains **two distinct audit trails**, owned by different
subsystems, serving different audiences. This page documents both, when
to use each, and the security posture of the Agentic OS-side log
introduced in [ADR-006](../decisions/ADR-006-cross-os-audit-log.md).

## TL;DR

| Table          | Owner                   | Writers                             | Audience                     | Tamper-evident? | Compliance-grade? |
| -------------- | ----------------------- | ----------------------------------- | ---------------------------- | --------------- | ----------------- |
| `audit_events` | `@platform/auth`        | Auth flows (login, logout, reset, …) | Compliance, security ops     | Yes (`prev_hash` chain) | Yes |
| `agos_audit`   | Agentic OS BFF (platform-web) | Per-OS write routes, flag toggles   | The end user (own activity)  | No              | No  |

The two never cross-join. They live in the same Postgres database for
operational simplicity, but the conceptual boundary is firm.

## `audit_events` — compliance-grade

Defined in [`packages/auth/src/schema.sql`](../../packages/auth/src/schema.sql)
and migrated by
[`packages/database/alembic/versions/0001_local_auth.py`](../../packages/database/alembic/versions/0001_local_auth.py).
See [`docs/security/auth-model.md`](auth-model.md) for the full auth
model.

### What's recorded

Every authentication and session lifecycle event:

| Action                         | Trigger                          |
| ------------------------------ | -------------------------------- |
| `auth.login`                   | Successful login                 |
| `auth.login_failed`            | Invalid password                 |
| `auth.logout`                  | Session invalidated              |
| `auth.register`                | New user registration            |
| `auth.password_reset_request`  | Reset email requested            |
| `auth.password_reset_complete` | Password changed via reset token |
| `session.created`              | New session created              |
| `session.invalidated`          | Session invalidated              |

### Tamper evidence

The `audit_events` table includes a `prev_hash` column (added in
`packages/database/alembic/versions/...0004_audit_prev_hash_column...`).
Each row hashes the previous row + its own payload. Anyone can verify
the chain post-hoc; an inserted or mutated row breaks the chain.

This makes the table suitable for SOC2 / HIPAA / GDPR-grade audit
requirements *with* the caveat that the verification process must be
operationalized (a periodic job that walks the chain, alerts on
breakage, and signs the latest head into an external append-only
store like an SIEM).

### Operational posture

- **Write fan-in:** all auth-side flows write here. Failures log to
  stderr but do not block the user flow (auth must remain available
  even if audit briefly fails). Production deploys should monitor for
  audit-write warnings and alert on sustained failure rates.
- **Retention:** indefinite by default. A compliance retention policy
  (e.g. 7 years for SOC2) is the operator's responsibility.
- **Read access:** restricted. No user-facing UI today; reads happen
  via direct SQL by ops. Future: an admin-only `audit_events` viewer.

## `agos_audit` — product-side

Defined in
[`packages/database/alembic/versions/0003_agentic_os.py`](../../packages/database/alembic/versions/0003_agentic_os.py)
and described in detail in
[`docs/architecture/audit-log.md`](../architecture/audit-log.md).

### What's recorded

Every Agentic OS write — and every feature-flag toggle — produces a row:

```
{
  id, project_id, actor_id, os_slug, action, payload, created_at
}
```

`os_slug` is one of the nine module slugs or the literal `'flags'`.
`action` is a stable per-OS string (e.g. `health.plan.upsert`,
`maker.build.create`, `flags.toggle`). `payload` is JSONB carrying
whatever the writing route chose to record.

### Audience

The end user. Every read at `/api/tiresias/agentic-os/audit` is filtered
to `actor_id = current user`. The viewer at `/dashboard/audit` is the
canonical surface; users see their own activity there, paginated and
filterable.

### Security posture

This is a **product** log, not a compliance log:

- **Mutable.** Database admins can edit history. The application layer
  treats rows as append-only, but that's a convention, not an
  enforcement.
- **No tamper chain.** No `prev_hash`. Mutations are not detectable.
- **Best-effort writes.** A `recordAudit` failure logs a warning and
  the user write proceeds. Audit completeness depends on database
  uptime, which is usually fine (same connection pool as the user
  write), but technically lossy.
- **Single-actor read scope.** No cross-actor read in v1. An admin
  cross-actor view is a [followup](../decisions/ADR-006-cross-os-audit-log.md#followups).
- **Not exposed to agents.** SoulKey-authenticated agent traffic does
  not currently read this table.

If you need any of those properties (immutability, chain verification,
admin-wide view, agent introspection), use `audit_events` or build a
new dedicated log — do not fight `agos_audit` into the role.

## When to use which

```
┌─────────────────────────────────────┬──────────────────┐
│ Recording…                          │ Use…             │
├─────────────────────────────────────┼──────────────────┤
│ Login / session lifecycle           │ audit_events     │
│ Password reset, MFA enrollment      │ audit_events     │
│ Membership / role changes           │ audit_events     │
│ Anything required by compliance     │ audit_events     │
├─────────────────────────────────────┼──────────────────┤
│ Per-OS user actions                 │ agos_audit       │
│ Feature flag toggles                │ agos_audit       │
│ Anything the user should see        │ agos_audit       │
│ in their own activity feed          │                  │
├─────────────────────────────────────┼──────────────────┤
│ Both (rare — e.g. a billing event   │ audit_events     │
│ that's also user-visible)           │ + a dedicated    │
│                                     │ user-visible     │
│                                     │ surface          │
└─────────────────────────────────────┴──────────────────┘
```

Don't dual-write the same event into both tables — that creates
divergence the moment the schemas drift. If a user-visible event needs
compliance treatment, route it through `audit_events` and surface it
in `agos_audit` only via a synthetic "view-only" row pointing at the
real entry.

## PII posture

Both tables can carry PII in their payloads. The application code
should:

- **Never log raw passwords or tokens.** `audit_events` payloads must
  not include `password`, `token`, `session_id`, etc. The hashing and
  rotation paths in `packages/auth` redact these by construction.
- **Avoid free-form user content in `agos_audit` payloads.** Store IDs
  and deltas, not full document bodies. The OS feature pages render
  the live entity; the audit row is a pointer plus a summary.
- **Treat `actor_id` as PII.** It is the platform UUID, not the email,
  but it is still subject access requestable. Any export must include
  audit rows for the requesting user.

## Verifying the auth chain

A simple verifier (pseudocode):

```python
expected = HEAD_HASH = b'\x00' * 32
for row in cur.execute("SELECT id, payload, prev_hash, hash FROM audit_events ORDER BY created_at"):
    if row.prev_hash != expected:
        raise TamperDetected(row.id)
    expected = row.hash
```

Production deploys should run this in a scheduled job and emit a
metric. A failure must alert immediately — by definition either the
table was tampered with, or a write path forgot to compute the hash.

## Reference

- [Auth model](auth-model.md) — `audit_events` writers
- [Audit log architecture](../architecture/audit-log.md) — `agos_audit` schema
- [ADR-006](../decisions/ADR-006-cross-os-audit-log.md) — why two tables
