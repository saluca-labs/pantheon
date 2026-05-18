# Pantheon Analyst Reference

A short reference for the CyberSec OS + audit log surfaces in
Pantheon. For the full operator tour see
[`USER_GUIDE.md`](USER_GUIDE.md); for the per-tenant audit-trail
architecture see [`docs/security/audit-trail.md`](../../../docs/security/audit-trail.md).

> **Audience.** Someone investigating what an agent or user did on the
> platform — typically a self-hoster or a small-team lead reviewing
> activity, not a dedicated SOC role. The historical Tiresias Analyst
> Guide assumed a full SOC team and a SaaS deployment; Pantheon's
> shape is smaller and the surfaces collapse accordingly.

## The two audit streams

Pantheon writes two parallel audit streams, by design:

| Stream | Table | What it captures | Where to view |
|---|---|---|---|
| **Auth / compliance trail** | `audit_events` | Logins, key issuance, RBAC changes, policy edits, federated-IdP events. Every entry has a tenant + actor + action. | `/dashboard/audit` |
| **Per-OS activity trail** | `_agos_audit` | User-attributable side effects from inside an OS module (writes, deploys, exports, imports, settings changes). Every entry has `os_slug`, `actor`, `action`, `resource`. | `/dashboard/cyber` and per-OS audit panes |

The boundary is firm: auth and identity events go to `audit_events`;
domain side effects go to `_agos_audit`. The
[audit-trail architecture doc](../../../docs/security/audit-trail.md)
explains the write paths and retention rules.

## The CyberSec OS

`/dashboard/cyber` is the cross-OS investigation surface. It surfaces
the `_agos_audit` stream as a filterable feed across every OS module,
with quick filters for actor, OS slug, action verb, and time window.

Use it when you want to answer questions like:

- "What did `alice@example.com` do across all OSes this week?"
- "Show every `export` action in the Business OS in the last 30 days."
- "Did anyone touch the Health OS protocols table after the last
  release?"

The CyberSec OS does **not** today host behavioral anomaly detection
(SoulWatch) or prompt-injection scanning (SoulGate / PRH). Those
subsystems exist in the codebase as legacy from the Tiresias era but
are not foregrounded in Pantheon's user surface. If you need them as
contributor-facing tools, see the platform-api source under
`src/soulwatch/` and `src/soulgate/`.

## Querying the streams directly

For richer investigation than the dashboard exposes, both tables are
plain Postgres rows you can query with `psql`:

```bash
docker compose exec db psql -U pantheon pantheon
```

### Recent auth events for a tenant

```sql
SELECT created_at, actor_id, action, resource, status
FROM audit_events
WHERE tenant_id = '<your-tenant-uuid>'
ORDER BY created_at DESC
LIMIT 100;
```

### Per-OS activity by actor

```sql
SELECT created_at, os_slug, action, resource_type, resource_id, metadata
FROM _agos_audit
WHERE actor_user_id = '<user-uuid>'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### Cross-OS export events

```sql
SELECT created_at, os_slug, actor_user_id, resource_type, resource_id
FROM _agos_audit
WHERE action = 'export'
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

## Out of scope for Pantheon

The Tiresias-era Analyst Guide covered Sigma-rule authoring, SoulGate
action pipeline forensics, prompt-injection composite-risk scoring,
and per-agent behavioral baselines. None of those surfaces are
exposed in Pantheon's current dashboard. The underlying code is still
present for contributors who want to extend it, but Pantheon's user
posture leans on auditable user-attributable activity rather than
machine-anomaly hunting.

If you need the older detection workflow, the relevant code lives at:

- `apps/platform-api/src/soulwatch/` — behavioral baselines, Sigma rule engine
- `apps/platform-api/src/soulgate/` — action pipeline, PRH detection
- `infrastructure/rules/` — Sigma rule library

These are contributor-facing today. A user-facing surface for them is
not on the Pantheon roadmap.

## See also

- [`USER_GUIDE.md`](USER_GUIDE.md) — dashboard tour (includes monitoring section)
- [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) — self-host admin
- [`docs/security/audit-trail.md`](../../../docs/security/audit-trail.md) — audit boundary architecture
- [`drilldowns/rbac-permission-matrix.md`](drilldowns/rbac-permission-matrix.md) — per-role permissions
