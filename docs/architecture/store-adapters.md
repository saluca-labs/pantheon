# Store Adapters

Pantheon's agents-platform data layer (`_agos_agents`, `_agos_prompts`,
`_agos_provider_keys`) is reachable through a small adapter pattern.
Two adapters ship today:

- **LocalPg** (default) — talks directly to Pantheon's main Postgres.
- **Supabase** (opt-in) — talks to a Supabase project the operator
  configures with environment variables.

Selection is per-tenant-but-not-per-call: the active adapter is read
from `_pantheon_config` at request entry and stays consistent for
the duration of the request.

This document is the architecture-tier reference. For the operator-side
"how do I flip it" walkthrough, see
[`docs/operations/store-adapter-config.md`](../operations/store-adapter-config.md).
For the larger agent platform context, see
[`docs/architecture/agents-platform.md`](./agents-platform.md).

## The contract

The adapter contract is a Python protocol that any store implementation
must satisfy. It lives in `apps/platform-api/src/agents/store/` and
covers the operations the rest of platform-api needs:

| Operation | Purpose |
|---|---|
| `get_agent(tenant_id, persona_id)` | Read one agent + its active prompt version + key ref |
| `list_agents(tenant_id, filter)` | Paginated agent list (by tag, name, active state) |
| `create_agent(tenant_id, payload)` | Insert a new agent |
| `update_agent(tenant_id, persona_id, patch)` | Patch fields (display_name, tags, model_policy, etc.) |
| `delete_agent(tenant_id, persona_id)` | Soft delete |
| `get_prompt(tenant_id, persona_id, version)` | Read one prompt version |
| `list_prompts(tenant_id, persona_id)` | All versions for an agent (paginated, newest first) |
| `append_prompt(tenant_id, persona_id, text, vars)` | New version (append-only) |
| `set_active_prompt(tenant_id, persona_id, version)` | Flip active pointer |
| `get_provider_key(tenant_id, key_id)` | Read one BYOK provider key + secret_ref |
| `list_provider_keys(tenant_id, provider)` | Paginated key list |
| `create_provider_key(tenant_id, payload)` | Insert |
| `update_provider_key(tenant_id, key_id, patch)` | Patch (metadata, etc.) |
| `delete_provider_key(tenant_id, key_id)` | Hard delete |
| `import_bundle(tenant_id, parsed_yaml)` | Atomic agent + prompts + keys insert (transactional) |

Both adapters MUST implement every method or import will fail at
process startup (the adapter constructor probes the protocol).

## Selection — `_pantheon_config`

A single config table records which store is active for the
agents-platform concern:

```sql
SELECT key, value FROM _pantheon_config WHERE key = 'agents_store';
-- key            | value
-- agents_store   | localpg     -- or 'supabase'
```

At process startup the agents-store factory reads this row and
instantiates the matching adapter once. There is no per-request
adapter switching — operators who flip the row need to restart
platform-api for the change to take effect (this is intentional;
switching adapters mid-request would split writes across two stores).

For the operator-facing flip procedure see
[`docs/operations/store-adapter-config.md`](../operations/store-adapter-config.md).

## LocalPg adapter

The default. Talks to Pantheon's main Postgres database via SQLAlchemy
+ asyncpg. The schema lives under `_agos_*` tables, migrated through
the `packages/database/` Alembic tree (the Agentic OS branch; see
[`docs/operations/alembic-branches.md`](../operations/alembic-branches.md)).

**Operational characteristics:**

- Zero extra moving parts — uses the database Pantheon already has.
- Transactions cover `import_bundle()` atomically inside a single
  Postgres tx.
- Connection pool comes from the main `platform-api` engine.

**When to use it:**

- All OSS self-hosters by default.
- Any deployment where "one Postgres" is the right shape.

## Supabase adapter

Opt-in. Talks to a hosted Supabase project (or any Postgres reachable
through the Supabase client library — the adapter does not require the
Supabase REST API).

**Environment variables:**

| Variable | Purpose |
|---|---|
| `PANTHEON_AGENTS_STORE_SUPABASE_URL` | Supabase project URL |
| `PANTHEON_AGENTS_STORE_SUPABASE_SERVICE_KEY` | Service-role key (server-only) |
| `PANTHEON_AGENTS_STORE_SUPABASE_SCHEMA` | Schema name, default `public` |

These are reserved by the adapter; do not reuse them for other
purposes.

**Operational characteristics:**

- Extra moving part: a Supabase project.
- `import_bundle()` opens a transaction on the Supabase side; rollback
  semantics match LocalPg.
- Latency depends on Supabase region vs the platform-api host.

**When to use it:**

- Teams that already have a Supabase project and want agents-platform
  data living there alongside their other Supabase-backed services.
- NOT a way to use Supabase as a required backend — Pantheon is local
  Postgres-first by default. Supabase is one of two adapter targets,
  never required.

## Writing a new adapter

The process is:

1. **Pick a name.** Add it to the allowed values for the
   `agents_store` config row (currently `localpg` | `supabase`).

2. **Create `apps/platform-api/src/agents/store/<name>.py`.** Implement
   every method in the adapter protocol. Use the existing LocalPg
   adapter as the reference implementation.

3. **Wire it into the factory.** `apps/platform-api/src/agents/store/__init__.py`
   selects the adapter based on the config row. Add your `<name>` ->
   `<NameAdapter>` mapping there.

4. **Document operator-side configuration.** Add a section to
   [`docs/operations/store-adapter-config.md`](../operations/store-adapter-config.md)
   covering required env vars and any setup steps (DB creation,
   migration handling, etc.).

5. **Decide the migration story.** LocalPg piggy-backs on the
   `packages/database/` Alembic tree. Supabase ships its own schema
   bootstrap. A new adapter needs to choose: own its schema (and
   document how operators bootstrap it) or run against a schema
   maintained externally (and document the schema contract).

6. **Add tests.** `apps/platform-api/tests/agents/` has a fixture
   pattern that runs the full CRUD + import suite against the
   selected adapter. New adapters should be added to the suite.

7. **Open a small ADR.** A new store adapter is a contributor-facing
   change worth recording. ADRs are sequential; check
   [`docs/decisions/`](../decisions/) for the current number.

## What the adapter pattern is NOT

- **Not** a per-tenant abstraction. Tenancy is enforced inside the
  adapter (every method takes `tenant_id`); the adapter itself is
  process-wide.
- **Not** a sharding boundary. If you need to shard the agents
  platform across multiple stores, that is a different concern that
  this pattern does not solve.
- **Not** a hot-failover mechanism. Adapter switching is offline
  (config-flip + restart), not online.
- **Not** transparent to platform-api code. Code that talks to the
  agents store imports the adapter factory, not a specific
  implementation; that part is transparent. But code that constructs
  the factory MUST go through `apps/platform-api/src/agents/store/__init__.py`
  to ensure the singleton stays consistent.

## See also

- [`docs/operations/store-adapter-config.md`](../operations/store-adapter-config.md)
  — operator-facing flip procedure (Wave I.1)
- [`docs/architecture/agents-platform.md`](./agents-platform.md)
  — the larger agent platform context this fits into
- [`docs/operations/alembic-branches.md`](../operations/alembic-branches.md)
  — migration topology that the LocalPg adapter participates in
- PR #128 (W-H.2.b) — original adapter shipping commit
