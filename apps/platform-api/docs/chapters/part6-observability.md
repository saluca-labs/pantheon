# Part VI: Observability

> **Pantheon Administrator Guide — Chapter**
> **Audience:** Self-hosters running production-style deployments

Pantheon ships three observability surfaces: two audit streams (one
for auth/compliance, one for per-OS user activity) and a Prometheus
metrics endpoint. This chapter walks through each.

---

## 6.1 The two audit streams

| Stream | Table | What it captures | Dashboard |
|---|---|---|---|
| Auth / compliance | `audit_events` | Logins, key issuance, RBAC changes, policy edits, federated-IdP events. | `/dashboard/audit` |
| Per-OS activity | `_agos_audit` | User-attributable side effects from inside an OS module (writes, deploys, exports, key issues). | `/dashboard/cyber` + per-OS audit panes |

The boundary is intentional: anything related to identity and
authorization goes to `audit_events`; anything that records a
side-effect inside an OS module goes to `_agos_audit`. Architecture
detail: [`docs/security/audit-trail.md`](../../../../docs/security/audit-trail.md).

Both tables are plain Postgres rows you can query with `psql`. For
analyst-flavored sample queries see
[`ANALYST_GUIDE.md`](../ANALYST_GUIDE.md).

### Retention

Default retention is **no automatic deletion**. Self-hosters decide
their own retention policy via either a Postgres trigger or a cron
job. A reference cron job ships in
`apps/platform-api/k8s/pantheon/cronjobs/` for GKE deployments;
for docker compose, write your own.

### Forwarding

For self-hosters who want to forward events to a SIEM, the recommended
path is a Postgres logical-replication consumer that reads from the
audit tables and ships into your SIEM's collector. The Tiresias-era
SoulWatch SIEM connectors (Splunk HEC, OpenSearch, Sentinel, Syslog)
are still in the codebase under `apps/platform-api/src/soulwatch/`
but are not foregrounded in the Pantheon user experience.

## 6.2 Prometheus metrics

Each service exposes `/metrics` for Prometheus scraping:

| Service | Endpoint |
|---|---|
| platform-api | `http://platform-api:8000/metrics` |
| platform-web | `http://platform-web:3000/api/metrics` |
| soul-service | `http://soul-service:8200/metrics` |

A baseline scrape config + Grafana dashboard ships in
[`infrastructure/grafana/`](../../../../infrastructure/grafana/). For
docker compose deployments, run a sidecar Prometheus + Grafana
container of your choice and point them at these endpoints.

Key metrics:

| Metric | Type | Notes |
|---|---|---|
| `pantheon_http_requests_total` | counter | Labels: route, method, status, tenant |
| `pantheon_http_request_duration_seconds` | histogram | Per-route latency |
| `pantheon_agents_import_total` | counter | `?dry_run` excluded |
| `pantheon_provider_key_probe_total` | counter | Labels: provider, status |
| `pantheon_soulauth_logins_total` | counter | Labels: method (local|ldap|oidc), status |
| `pantheon_agos_audit_writes_total` | counter | Labels: os_slug, action |

## 6.3 Dashboard observability surfaces

The dashboard renders the same data as Prometheus would, without
requiring you to stand up a separate observability stack:

- **`/dashboard/audit`** — paginated `audit_events` viewer with
  filters for actor, action, status, time window.
- **`/dashboard/cyber`** — paginated `_agos_audit` viewer, filterable
  by OS slug, actor, action verb, time window.
- **Per-OS audit panes** — each OS module has a settings tab that
  surfaces only that OS's `_agos_audit` rows.

For a quick CI/test signal that all OSes are responding, see the
24-check smoke matrix in
[`docs/operations/smoke-matrix.md`](../../../../docs/operations/smoke-matrix.md).

## 6.4 Health and readiness probes

Every Pantheon service exposes `/health` (liveness) and
`/health?detail=true` (per-component readiness):

```bash
curl http://localhost:8000/health
# {"status": "healthy"}

curl http://localhost:8000/health?detail=true
# {
#   "status": "healthy",
#   "components": {
#     "database": "healthy",
#     "soulauth": "healthy",
#     "policy_cache": "healthy"
#   }
# }
```

In docker compose, the health check is the readiness gate for
service-to-service dependencies; in Kubernetes, configure it as both
`livenessProbe` and `readinessProbe`.

## See also

- [`ADMIN_GUIDE.md`](../ADMIN_GUIDE.md) — observability section
- [`ANALYST_GUIDE.md`](../ANALYST_GUIDE.md) — query patterns
- [`docs/security/audit-trail.md`](../../../../docs/security/audit-trail.md) — boundary architecture
- [`docs/operations/smoke-matrix.md`](../../../../docs/operations/smoke-matrix.md) — CI checks
- [`infrastructure/grafana/`](../../../../infrastructure/grafana/) — baseline Grafana stack
