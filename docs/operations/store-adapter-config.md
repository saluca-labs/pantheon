# Agents Store Adapter Configuration

Pantheon's Wave-H agent platform writes agents and prompts through an
**adapter-pluggable** store. Two adapters ship today:

- **LocalPg** (default) — writes to the same Postgres instance that
  hosts the rest of platform-api. Zero extra setup; the rows live in
  `_agos_agents` / `_agos_prompts` alongside everything else.
- **Supabase** — writes to a managed Supabase project via its
  PostgREST API using the project's service-role key.

This guide is for self-hosters choosing between them, and for
operators flipping the switch.

## When to use each

| Use LocalPg if … | Use Supabase if … |
|---|---|
| You're running Pantheon on a single host. | You're already on Supabase for other workloads and want a single source of truth. |
| Self-host simplicity matters more than multi-region replication. | You need Supabase's row-level security, realtime listeners, or PostgREST surface for downstream tools. |
| You're fine with one Postgres for everything. | You want to isolate agent-platform data from the rest of platform-api. |
| You don't want to maintain a Supabase project. | You're comfortable managing the Supabase service-role key. |

LocalPg is the right default for most self-hosters. Supabase is
optional, not required.

## Where the config lives

Adapter selection lives in the `_pantheon_config` table:

```
key                   | value
----------------------|----------
agents_store.kind     | "local" | "supabase"
agents_store.config   | (JSON: {} for local, {url, service_role_key_ref} for supabase)
```

The config is read by `src.agents.factory.get_agent_store()` and
`get_prompt_store()` on each request. Stores are not cached globally,
so a flip is picked up by the next request — no platform-api restart
required.

## Check current config

```bash
export PANTHEON=http://localhost:8000
export SOULKEY="sk_agent_…"   # needs policy:read permission

curl -s "$PANTHEON/v1/agents-store/config" -H "X-SoulKey: $SOULKEY" | jq .
```

For LocalPg:

```json
{
  "kind": "local",
  "config": {}
}
```

For Supabase (the service-role key is **never** echoed back; you only
see the URI ref + a description of its scheme):

```json
{
  "kind": "supabase",
  "config": {
    "url": "https://xxxxx.supabase.co",
    "service_role_key_ref": {
      "raw": "env://SUPABASE_SERVICE_ROLE_KEY",
      "scheme": "env",
      "target": "SUPABASE_SERVICE_ROLE_KEY",
      "valid": true
    }
  }
}
```

## Flip to LocalPg (the default)

LocalPg requires no setup. The agent + prompt tables are created by
the alembic tree at `apps/platform-api/alembic/` and are populated by
any CRUD call.

```bash
curl -X POST "$PANTHEON/v1/agents-store/config" \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{"kind": "local", "config": {}}'
```

## Flip to Supabase

### Step 1 — Provision a Supabase project

Create a Supabase project (free tier is sufficient for evaluation).
You need two things:

- The project URL (e.g. `https://abcdef.supabase.co`).
- The **service-role** key (Settings → API → `service_role`). This is
  NOT the anon key. Treat it like a database superuser credential.

### Step 2 — Apply the Pantheon schema to the Supabase project

Pantheon's agent + prompt schema must exist in the Supabase project
before any writes succeed. The relevant tables (`_agos_agents`,
`_agos_prompts`) are defined in
`apps/platform-api/alembic/versions/`. The simplest application path is
the SQL editor in Supabase Studio:

```bash
# Find the relevant alembic revisions
ls apps/platform-api/alembic/versions/ | grep -E 'agos_(agent|prompt)'
```

Open each revision file, copy the `CREATE TABLE` statements out of
the `upgrade()` function, and run them in the Supabase SQL editor.
Future automation here is tracked under
[`apps/platform-api/src/agents/supabase_store.py`](../../apps/platform-api/src/agents/supabase_store.py)
— the adapter assumes the schema already exists.

### Step 3 — Make the service-role key available to platform-api

Add the key to the platform-api container's environment as
`SUPABASE_SERVICE_ROLE_KEY` (or whatever variable name you prefer):

```yaml
# docker-compose.override.yml
services:
  platform-api:
    environment:
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
```

```bash
# .env (gitignored)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

```bash
docker compose up -d platform-api
```

### Step 4 — Test the proposed config (without persisting)

```bash
curl -X POST "$PANTHEON/v1/agents-store/test" \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{
    "kind": "supabase",
    "config": {
      "url": "https://abcdef.supabase.co",
      "service_role_key_ref": "env://SUPABASE_SERVICE_ROLE_KEY"
    }
  }'
```

A healthy response:

```json
{"ok": true, "details": {"backend": "supabase", "url": "https://abcdef.supabase.co"}}
```

Common failures (full table in
[TROUBLESHOOTING](../../apps/platform-api/deploy/TROUBLESHOOTING.md#agents-store-adapter-config-issues)):

| Failure | Cause |
|---|---|
| `could not resolve service_role_key_ref` | Env var isn't set inside the container |
| HTTP 401 from Supabase | Wrong service-role key (or you used the anon key) |
| HTTP 404 on `_agos_agents` | Schema not applied in the Supabase project (Step 2) |

### Step 5 — Persist the config

```bash
curl -X POST "$PANTHEON/v1/agents-store/config" \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{
    "kind": "supabase",
    "config": {
      "url": "https://abcdef.supabase.co",
      "service_role_key_ref": "env://SUPABASE_SERVICE_ROLE_KEY"
    }
  }'
```

Future requests will hit Supabase. The next CRUD call is the
verification — if it succeeds, you're done.

### Step 6 — Flip via the portal (alternative)

The Settings → Agents Store pane in the dashboard wraps the same three
calls (`GET /config`, `POST /test`, `POST /config`) into a guided UI.
The portal masks the service-role key, validates the URL prefix, and
shows the test result inline before persisting.

## Important: data does NOT migrate between adapters

Flipping the kind does not copy existing rows from one backend to the
other. If you switch from LocalPg → Supabase and you have existing
agents, those rows stay in LocalPg's `_agos_agents` table and the
Supabase backend will look empty.

If you need to preserve data across a flip:

1. Export from the current backend via `GET /v1/agents` +
   `GET /v1/prompts` (gives you JSON).
2. Convert to `agent.yaml` form (or build a JSON list matching the
   import schema).
3. Flip the config.
4. Re-import via `POST /v1/agents/import`.

There's deliberate friction here — switching backends mid-flight is a
rare operation, and silent dual-writes would create more failure
modes than they'd solve.

## Per-tenant or global?

Today the config is **global** — one adapter per Pantheon
installation. Per-tenant adapter selection is not modelled (it would
multiply complexity for every tenant lookup); if you need
tenant-isolated stores, run separate Pantheon installations.

## Endpoint reference

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/v1/agents-store/config` | `policy:read` | Current adapter; service-role key masked |
| POST | `/v1/agents-store/config` | `policy:read` | Upsert; validates the secret-ref URI before saving |
| POST | `/v1/agents-store/test` | `policy:read` | Health-check a PROPOSED config without persisting |

(`policy:read` is the gate per the locked decision for agents-store
admin paths; tighten via RBAC if you need finer-grained control.)

## See also

- [`agents-platform-quickstart.md`](agents-platform-quickstart.md)
  — what runs against the configured store
- [`byok-provider-keys.md`](byok-provider-keys.md) — separate from
  the store adapter; provider keys live in platform-api's own
  Postgres regardless
- [`apps/platform-api/src/agents/factory.py`](../../apps/platform-api/src/agents/factory.py)
  — the selection code
- [`apps/platform-api/src/agents/local_pg_store.py`](../../apps/platform-api/src/agents/local_pg_store.py),
  [`supabase_store.py`](../../apps/platform-api/src/agents/supabase_store.py)
  — the two adapter implementations
- [`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../apps/platform-api/deploy/TROUBLESHOOTING.md#agents-store-adapter-config-issues)
  — failure modes
