# Troubleshooting Flowcharts

> **Pantheon Administrator Guide — Drilldown**
> **Parent:** [`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../deploy/TROUBLESHOOTING.md)

Decision-tree views of the most common Pantheon failure modes. The
canonical prose troubleshooting reference is in
[`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../deploy/TROUBLESHOOTING.md)
(refreshed in Wave I.1); this drilldown distills the same information
into branching diagnostic flows.

---

## 1. "I can't log in"

```
User clicks Sign In → error or hang
│
├─ Browser shows "Connection refused" or page never loads
│   │
│   ├─ platform-web container down?
│   │   docker compose ps  →  is platform-web up?
│   │   - NO → docker compose logs platform-web; check SESSION_SECRET
│   │   - YES → continue
│   │
│   └─ Reverse proxy in front of platform-web?
│       Check proxy → upstream connectivity
│
├─ Login form renders, but submit returns 500
│   │
│   ├─ platform-api unhealthy?
│   │   curl http://localhost:8000/health
│   │   - 500/timeout → jump to "platform-api is down"
│   │   - 200 → continue
│   │
│   └─ SoulAuth subsystem error?
│       docker compose logs platform-api | grep soulauth
│       - "missing _soulauth_users table" → re-run migrations
│       - "OIDC discovery failed" → SOULAUTH_OIDC_ENABLED=false to test local first
│
└─ Login form returns 401 with valid creds
    │
    ├─ Seeded admin password lost?
    │   docker compose exec platform-api python scripts/seed-admin.py
    │
    └─ Federated user not mapped to tenant?
        - LDAP: check SOULAUTH_LDAP_USER_FILTER matches
        - OIDC: check tenant_mapping in /v1/idp/{id}
        - See soulauth-integration.md "no organization" section
```

## 2. "Agent.yaml import fails"

```
POST /v1/agents/import → 400
│
├─ "required" on metadata.persona
│   YAML missing `metadata.persona` for at least one document.
│   Each agent needs metadata.persona + metadata.name minimum.
│
├─ "scheme 'vault://' is reserved but not yet implemented"
│   provider_overrides[].secret_ref uses an unsupported scheme.
│   Use env://VAR_NAME (only implemented scheme today).
│
├─ "tenant_id does not match SoulKey tenant"
│   metadata.tenant_id (optional) explicitly conflicts with the
│   SoulKey's tenant. Drop the tenant_id field — it's inferred.
│
├─ "unknown provider 'azure'"
│   provider_overrides[].provider must be one of:
│   anthropic, openai, gemini, groq, ollama
│
└─ "duplicate persona within request"
    Two agents in the same payload share a metadata.persona value.
    Personas are unique per (tenant_id, persona_id) so they collide.
```

See the agent.yaml schema reference at
[`src/agents/agent_yaml_schema.md`](../../src/agents/agent_yaml_schema.md)
for the full schema. If ANY error fires in a multi-agent payload,
NO writes happen — fix and resubmit.

## 3. "Provider key test fails"

```
POST /v1/provider-keys/{id}/test → error
│
├─ "secret_ref does not resolve"
│   - env://VAR_NAME → echo $VAR_NAME inside the platform-api container:
│     docker compose exec platform-api env | grep VAR_NAME
│     If empty: set in .env, then `docker compose up -d platform-api`
│   - Reserved schemes (vault://, gcpsm://, etc.) are not yet
│     implemented and will fail at write time, not test time
│
├─ "upstream returned 401"
│   The resolved secret is invalid against the provider.
│   Verify the raw key works:
│   curl -H "x-api-key: $TENANT_ANTHROPIC_KEY" \
│        -H "anthropic-version: 2023-06-01" \
│        https://api.anthropic.com/v1/models
│
├─ "upstream returned 403"
│   The key is valid but lacks the required scope/quota.
│   Check provider dashboard for org / project limits.
│
└─ "connection timeout"
    - Network from platform-api to api.anthropic.com / api.openai.com
      / api.groq.com / etc. is blocked.
    - For ollama: verify base_url points at a reachable host
      (default http://localhost:11434 won't work from inside the
      platform-api container — use http://host.docker.internal:11434
      or the host LAN IP).
```

## 4. "platform-api is down"

```
curl http://localhost:8000/health → timeout / connection refused
│
├─ Container down?
│   docker compose ps platform-api
│   - "Exit" → docker compose logs platform-api
│
├─ Recent error in logs?
│   docker compose logs platform-api --tail 200 | grep -iE 'error|fatal'
│   │
│   ├─ "alembic.runtime.migration ... can't apply migration"
│   │   Migration conflict. See:
│   │   docs/operations/alembic-branches.md
│   │
│   ├─ "asyncpg.exceptions.InvalidPasswordError"
│   │   POSTGRES_PASSWORD mismatch between .env and the running db
│   │   container. `docker compose down -v` + re-bootstrap, or fix
│   │   the password on either side.
│   │
│   ├─ "OSError: [Errno 98] Address already in use"
│   │   Port 8000 already taken on the host. Stop the conflicting
│   │   process or set PLATFORM_API_PORT=8001 in .env.
│   │
│   └─ "ModuleNotFoundError"
│       Container built against a stale image. Rebuild:
│       docker compose build --no-cache platform-api
│
└─ All clean, but /health still hangs
    Postgres unhealthy. docker compose ps db should report (healthy).
    If not, docker compose logs db; check disk space (df -h).
```

## 5. "I deleted something I shouldn't have"

```
You ran DELETE /v1/agents/{id}
│
├─ Soft-delete (default)
│   The agent is in status='archived' but its row still exists.
│   Restore via:
│   UPDATE _agos_agents SET status='active' WHERE id='<uuid>';
│
└─ Hard-delete (only via direct SQL)
    Restore from your most recent pg_dump:
    gunzip -c backups/pantheon-YYYYMMDD.sql.gz \
      | docker compose exec -T db psql -U pantheon pantheon
    See ADMIN_GUIDE.md §4 for the backup/restore reference.
```

## See also

- [`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../deploy/TROUBLESHOOTING.md) — canonical prose reference
- [`ADMIN_GUIDE.md`](../ADMIN_GUIDE.md) — §5 troubleshooting summary
- [`docs/operations/alembic-branches.md`](../../../../docs/operations/alembic-branches.md) — migration topology
- [`docs/operations/byok-provider-keys.md`](../../../../docs/operations/byok-provider-keys.md) — BYOK failure modes
- [`docs/operations/soulauth-integration.md`](../../../../docs/operations/soulauth-integration.md) — auth confusion section
