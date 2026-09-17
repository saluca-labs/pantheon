# Pantheon Self-Host Troubleshooting

Failure-mode reference for operators running the docker compose stack.
For the architecture this is troubleshooting against, start with
[`docs/architecture/system-overview.md`](../../../docs/architecture/system-overview.md);
for migration topology see
[`docs/operations/alembic-branches.md`](../../../docs/operations/alembic-branches.md).

The structure mirrors how problems actually surface: by which
container is unhealthy, then by which subsystem inside it.

---

## Quick diagnostic snapshot

Run this first, paste the output anywhere you're asking for help:

```bash
echo "=== Pantheon Diagnostic ===" && \
echo "--- Container Status ---" && docker compose ps && \
echo "--- Health: platform-api ---" && curl -s http://localhost:8000/health | jq . && \
echo "--- Health: platform-web ---" && curl -sI http://localhost:3000 | head -1 && \
echo "--- Recent Errors ---" && \
docker compose logs --tail 200 2>&1 | grep -i -E "error|fatal|panic" | tail -30
```

---

## platform-web won't start

### Symptom: container exits during boot

```bash
docker compose logs platform-web --tail 50
```

| Error fragment | Cause | Fix |
|---|---|---|
| `SESSION_SECRET … must be at least 32 characters` | Default `.env` not edited | `openssl rand -base64 48` and paste into `.env`; `docker compose up -d platform-web` |
| `ECONNREFUSED … 5432` | Postgres not healthy yet (platform-web booted first) | `docker compose ps db` should report `(healthy)`. If it isn't, see "Postgres unhealthy" below. |
| `ECONNREFUSED … 8000` | platform-api unhealthy | Hit `curl http://localhost:8000/health`; if that fails, jump to "platform-api won't start" below. |
| `argon2 native module not found` | Image rebuilt against the wrong arch (rare, mostly on ARM hosts after an `x86_64` image cache) | `docker compose build --no-cache platform-web && docker compose up -d platform-web` |

### Symptom: dashboard loads but returns 500 from every page

The Next.js BFF routes need both `WEB_PUBLIC_URL` and `API_PUBLIC_URL`
to be set correctly. If `API_PUBLIC_URL` points at `localhost:8000`
but the platform-web container is in a separate network, BFF routes
can't reach the API. Inside docker compose the value should be the
service-name URL (`http://platform-api:8000`), and outside it should
be the host URL (`http://localhost:8000`). The `.env.example` defaults
work for `pnpm docker:up`.

### Symptom: blank page in browser, console shows `NEXT_PUBLIC_…` undefined

Next.js bakes `NEXT_PUBLIC_*` env vars into the JS bundle at build
time. If you customized those values and built your own image, rebuild
explicitly:

```bash
docker compose build --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 platform-web
docker compose up -d platform-web
```

The pre-built images that ship with the repo bake in localhost
defaults that work out of the box.

---

## platform-api won't start

### Symptom: container exits during boot

```bash
docker compose logs platform-api --tail 50
```

| Error fragment | Cause | Fix |
|---|---|---|
| `DATABASE_URL not set` or `host=localhost port=5432: Connection refused` | Postgres unhealthy or hostname wrong | Inside docker compose, the value should be `postgresql+asyncpg://platform:$POSTGRES_PASSWORD@db:5432/platform` (note: service name `db`, not `localhost`). |
| `alembic.util.exc.CommandError: Can't locate revision` | The DB has data from a different schema | Either drop the volume (`docker compose down -v` — destructive) or downgrade to the matching revision. See [`docs/operations/alembic-branches.md`](../../../docs/operations/alembic-branches.md). |
| `permission denied for schema public` | The Postgres role doesn't own the schema | Recreate the `db` volume: `docker compose down -v && docker compose up -d`. |
| `ImportError: cannot import name … from src.agents.…` | Image was built against a different commit | `docker compose build --no-cache platform-api && docker compose up -d platform-api` |

### Symptom: alembic migration fails

```bash
docker compose exec platform-api python -m alembic current
docker compose exec platform-api python -m alembic history --verbose | tail -40
```

The repo runs **two** alembic trees:

- `packages/database` — local-auth schema (`users`, `sessions`,
  `password_credentials`, `audit_events`, `organizations`).
- `apps/platform-api` — agent-platform schema (`_soul_tenants`,
  `_agos_agents`, `_agos_prompts`, `_tenant_provider_keys`,
  `_soulauth_policy_cache`, …).

A failure in one does not affect the other; targeted fix:

```bash
# Local-auth tree
docker compose exec platform-api bash -lc '
  cd /app/packages/database && python -m alembic current'

# Agent-platform tree
docker compose exec platform-api bash -lc '
  cd /app/apps/platform-api && python -m alembic current'
```

If a head is missing, run `python -m alembic upgrade head` from the
tree's own directory. The dual-tree boundary, the locked revisions,
and the recommended order are documented in
[`docs/operations/alembic-branches.md`](../../../docs/operations/alembic-branches.md).

---

## SoulAuth federated-auth confusion

Pantheon has **two distinct auth paths**, and they're easy to confuse:

1. **SoulAuth federated auth** — the production user login path.
   Separate Python service, separate database (`_soulauth_*` schema,
   bcrypt password hashes), federates user identity into the
   `platform-api` request context.
2. **`@platform/auth` Argon2id local-auth** — the legacy
   in-platform-web local-auth layer (`packages/auth/`). It's still in
   the repo but **not the active production path**; it exists as a
   reference / for tests.

The two failure modes:

| Symptom | Likely cause | Where to look |
|---|---|---|
| Portal login UI works, but `X-SoulKey` API calls return 401 | You're logged in via SoulAuth (session cookie) but no SoulKey has been minted for your tenant | Settings → Agents → New SoulKey, or via `/v1/soulauth/admin/keys` |
| SoulAuth user can log in but Pantheon dashboard says "no organization" | The federated user wasn't mapped to a tenant in `_soul_tenants` | Re-run the admin seed: `docker compose exec platform-api python scripts/seed-admin.py` |
| Docs say "Argon2id is the production password algorithm" | You're reading a stale `docs/security/auth-model.md` revision | Treat `@platform/auth` Argon2id as legacy; SoulAuth bcrypt is production. See [`docs/operations/soulauth-integration.md`](../../../docs/operations/soulauth-integration.md). |
| `seed-admin.py` finished but you can't find the password | The output goes to stdout once; if you missed it, re-run with `--reset` to mint a fresh password | `docker compose exec platform-api python scripts/seed-admin.py --reset` |

Full posture write-up:
[`docs/operations/soulauth-integration.md`](../../../docs/operations/soulauth-integration.md).

---

## `agent.yaml` import errors

`POST /v1/agents/import` does **all-or-nothing** validation: if any
agent in the bulk payload has a validation error, the entire request
is rejected with HTTP 400 and a flat `errors` list, each entry
pointing at the offending JSONPath.

```json
{
  "imported": [],
  "errors": [
    {"path": "agents[0].metadata.persona",                 "message": "required"},
    {"path": "agents[1].spec.provider_overrides[0].secret_ref",
     "message": "unknown or malformed secret-ref scheme: 'ftp'"}
  ]
}
```

Common failure modes:

| `errors[].message` excerpt | Cause | Fix |
|---|---|---|
| `required` on `metadata.persona` | Missing top-level persona key | Add `metadata.persona: <slug>`. Per-tenant unique. |
| `does not match caller tenant 'your-slug'` | `metadata.tenant` in the YAML doesn't match the caller's tenant | Drop the field (it defaults to the caller's tenant) or set it correctly. |
| `cannot be empty when spec.prompt is present` | Body is missing inside the `spec.prompt` block | Either remove the entire `spec.prompt:` block or fill `spec.prompt.body`. |
| `unknown or malformed secret-ref scheme` | Typo or an unsupported URI scheme | Re-check; supported schemes are `env://`, `file://`, `vault://`, `gcpsm://`, `awssm://`. See [`docs/operations/byok-provider-keys.md`](../../../docs/operations/byok-provider-keys.md). |

Schema reference:
[`../src/agents/agent_yaml_schema.md`](../src/agents/agent_yaml_schema.md).
Use `?dry_run=true` to preview without writing:

```bash
curl -X POST "http://localhost:8000/v1/agents/import?dry_run=true" \
  -H "X-SoulKey: $SOULKEY" \
  -H "Content-Type: text/yaml" \
  --data-binary @my-agents.yaml
```

---

## Provider key resolution failures

`POST /v1/provider-keys` validates the URI scheme at write time but
defers value resolution to call time. This lets you stage a row before
the env var exists. When something downstream actually tries to use
the key:

```bash
curl -X POST "http://localhost:8000/v1/provider-keys/<key-id>/test" \
  -H "X-SoulKey: $SOULKEY"
```

returns `{ok, latency_ms, error?, secret_ref_info}`.

| `error` excerpt | Cause | Fix |
|---|---|---|
| `secret_ref resolution failed: env var 'X' not set` | The env var the URI points at doesn't exist in the platform-api container | Add it to the platform-api service env in `docker-compose.yml` (or `.env` if the service reads from it), then `docker compose up -d platform-api`. |
| `auth rejected (HTTP 401)` | The key resolved, but the provider rejected it | Wrong / rotated / scope-limited key. Generate a new one upstream and PATCH `secret_ref`. |
| `auth rejected (HTTP 403)` | Key is valid but lacks the model / route permission | Check the provider console — most providers gate models per workspace. |
| `timeout` | Network egress blocked or the provider endpoint is unreachable | If you set `base_url`, verify it's reachable from the container (`docker compose exec platform-api curl -I <base_url>`). |
| `secret_ref resolution failed: …` for `vault://` / `gcpsm://` / `awssm://` | Backend SDK missing, credentials unset, or the secret store is unreachable from the platform-api container | Install the backend extra (`pip install platform-secrets[vault\|aws\|gcp]`) and set the standard backend env vars (`VAULT_ADDR` + `VAULT_TOKEN`; `AWS_REGION`; `GOOGLE_APPLICATION_CREDENTIALS`). See [`packages/secrets/python/README.md`](../../../packages/secrets/python/README.md). |

The resolved secret value is **never** included in any response body
or log line. Full BYOK reference:
[`docs/operations/byok-provider-keys.md`](../../../docs/operations/byok-provider-keys.md).

---

## Agents store adapter config issues

The agent + prompt store is selected at runtime from
`_pantheon_config`. Default is LocalPg; you can flip to Supabase via
the portal Settings → Agents Store pane or via `POST
/v1/agents-store/config`.

```bash
# Check current
curl -s http://localhost:8000/v1/agents-store/config -H "X-SoulKey: $SOULKEY" | jq .

# Test a proposed config without persisting it
curl -X POST http://localhost:8000/v1/agents-store/test \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{"kind":"supabase","config":{"url":"https://xxxxx.supabase.co","service_role_key_ref":"env://SUPABASE_SERVICE_ROLE_KEY"}}'
```

| Error | Cause | Fix |
|---|---|---|
| `supabase config missing 'url'` | URL not provided | Pass `config.url`. |
| `supabase config missing 'service_role_key_ref'` | Ref not provided | Pass `config.service_role_key_ref` as `env://VAR_NAME`. |
| `could not resolve service_role_key_ref` | Env var isn't set inside the container | Add it to the platform-api service env, then `docker compose up -d platform-api`. |
| Switch succeeded but agents list returns empty | The Supabase project doesn't yet have the Pantheon schema applied | Apply the schema (see [`docs/operations/store-adapter-config.md`](../../../docs/operations/store-adapter-config.md)). |
| Flip from local → supabase loses existing agents | Adapters do NOT migrate data | If you need to preserve data, export from LocalPg and re-import via `POST /v1/agents/import` against the new store. |

Full flip-the-switch walkthrough:
[`docs/operations/store-adapter-config.md`](../../../docs/operations/store-adapter-config.md).

---

## Header status dot stuck on loading / Aletheia indicator never resolves on minimal deployments

### Symptom

The Aletheia status dot in the dashboard header (top-right) sits on
its loading colour indefinitely. The rest of the UI is fully
functional.

### Cause

The dashboard header polls `/v1/aletheia/cot/chain` to surface CoT
audit-chain status. On minimal / OSS self-host installs that don't
deploy the Tiresias App Proxy + Aletheia integration, that endpoint
404s and the indicator never leaves its initial loading state.

```bash
# Confirm by hitting the endpoint directly
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:8000/v1/aletheia/cot/chain
# 404 → Aletheia not deployed; loading dot is expected.
# 200 → Aletheia is wired; if the dot still hangs, file a bug.
```

The 404 was previously hidden by a tier gate; Wave I.3.b dropped that
gate per the "no tier gating by default" decision, so every session
now polls regardless of deployment shape.

### Workarounds

1. **Accept the loading dot** — purely cosmetic, no functional impact.
2. **Deploy Aletheia** if you want the indicator to resolve. See
   [`apps/platform-app-proxy/README.md`](../../platform-app-proxy/README.md).
3. **Future enhancement:** detect 404 and render a clear "not
   configured" state. By design until that lands.

---

## Postgres unhealthy

```bash
docker compose ps db
docker compose logs db --tail 40
```

| Error fragment | Cause | Fix |
|---|---|---|
| `FATAL: password authentication failed for user "platform"` | `POSTGRES_PASSWORD` changed after the volume was initialized | Either change the value back to what the volume expects, or `docker compose down -v` (destructive) and re-up. |
| `database "platform" does not exist` | Volume from a prior install with a different `POSTGRES_DB` | Same fix as above: align `POSTGRES_DB` with the existing volume, or recreate. |
| `pg_isready` returns refused | Container is still starting | Wait 10–30s; start_period is 10s. If it's been > 1 min, inspect logs. |

---

## Port conflicts

Default port bindings: 3000 (platform-web), 8000 (platform-api), 5432
(db), 8025 (mailhog), 8910 (memory-service), 8080 (tiresias-proxy with
`full` profile).

```bash
# Linux / macOS
ss -tlnp | grep -E '3000|8000|5432|8080|8910'

# Windows (PowerShell)
netstat -ano | findstr ":3000 :8000 :5432 :8080 :8910"
```

Override in `.env`:

```
PLATFORM_WEB_PORT=3001
PLATFORM_API_PORT=8001
DB_PORT=5433
```

Then `docker compose down && docker compose up -d`.

---

## Log inspection

```bash
# Stream everything
docker compose logs -f

# Stream a single service
docker compose logs -f platform-api

# Errors only (structured logs)
docker compose logs platform-api --tail 200 --no-log-prefix \
  | jq 'select(.level == "error")'

# Around a specific timestamp
docker compose logs --since 10m platform-api | grep -i 'soulauth\|provider_key'
```

---

## When you need to file a bug

Include:

1. Output of `docker compose ps`.
2. Output of `docker compose logs --tail 200 platform-api platform-web db`.
3. The exact request that failed (curl command + response body), with
   any secret values redacted.
4. The output of the "Quick diagnostic snapshot" at the top of this
   document.

Open the issue on GitHub:
[`https://github.com/salucallc/pantheon/issues`](https://github.com/salucallc/pantheon/issues).
For security-sensitive reports, see [`../SECURITY.md`](../SECURITY.md).
