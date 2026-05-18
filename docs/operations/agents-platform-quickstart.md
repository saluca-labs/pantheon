# Agents Platform Quickstart

Pantheon's Wave-H agent platform is a set of FastAPI endpoints plus a
portal surface for defining, importing, and managing agents and the
prompts they run with. This guide walks through the operator paths:
import an agent via curl, list what you have, attach a SoulKey, and
manage prompt versions.

This document assumes a running Pantheon (see
[`docs/operations/quickstart.md`](quickstart.md)) and a SoulKey with
`agents:write`, `prompts:write`, and `providers:write` permissions. The
seeded admin from `pnpm bootstrap` has all of these.

```bash
export PANTHEON=http://localhost:8000
export SOULKEY="sk_agent_…"     # from the seed-admin output or portal
```

## The model

| Concept | Lives in | Notes |
|---|---|---|
| **Agent** | `_agos_agents` | A persona within a tenant. Keyed by `(tenant_id, persona_id)`. Points at one active prompt. |
| **Prompt** | `_agos_prompts` | Versioned, append-only. Keyed by `name`; new bodies append a row with `supersedes_id` pointing at the prior version. |
| **Provider key** | `_tenant_provider_keys` | Per-tenant BYOK. Keyed by `(tenant_id, provider)`. Holds a secret-ref (e.g. `env://VAR`), never the resolved value. |
| **Policy cache** | `_soulauth_policy_cache` | Materialized policy view per `(tenant_id, persona_id)` for the PDP. Auto-written by `/v1/agents/import`. |
| **Tenant** | `_soul_tenants` | Boundary for all of the above. SoulKeys are scoped to a tenant. |

For the storage layer's adapter (LocalPg vs Supabase), see
[`store-adapter-config.md`](store-adapter-config.md). For per-tenant
BYOK details, see [`byok-provider-keys.md`](byok-provider-keys.md).
For the federated user-auth layer, see
[`soulauth-integration.md`](soulauth-integration.md).

## Path 1 — Import an agent from `agent.yaml`

The canonical schema lives at
[`apps/platform-api/src/agents/agent_yaml_schema.md`](../../apps/platform-api/src/agents/agent_yaml_schema.md).
It accepts one or many agents in a single request (YAML stream, JSON
list, or multipart files).

### A minimal valid agent

```bash
cat > /tmp/research-coach.yaml <<'EOF'
metadata:
  persona: research-coach
  name: Research Coach
  description: Helps with literature reviews
  tags: [research]

spec:
  prompt:
    name: research-coach-prompt
    body: |
      You are a research coach. Help the user write better literature
      reviews. Cite sources. Surface counter-evidence.
    status: active
EOF

curl -X POST "$PANTHEON/v1/agents/import" \
  -H "X-SoulKey: $SOULKEY" \
  -H "Content-Type: text/yaml" \
  --data-binary @/tmp/research-coach.yaml
```

Expected response:

```json
{
  "imported": [
    {
      "persona_id": "research-coach",
      "agent_id": "…",
      "prompt_id": "…",
      "provider_keys_created": 0,
      "policy_synced": false,
      "created": true
    }
  ],
  "errors": []
}
```

`created: false` means a row already existed for `(your-tenant,
research-coach)` and the import updated it in place.

### Bulk import with policy + provider override

```yaml
---
metadata:
  persona: research-coach
  name: Research Coach

spec:
  prompt:
    name: research-coach-prompt
    body: |
      You are a research coach. Help the user with literature reviews.

  model_policies:
    default_models: [claude-opus-4-20250514]
    forbidden_models: [gpt-3.5-turbo]
    enforcement: strict

  provider_overrides:
    - provider: anthropic
      secret_ref: env://TENANT_ANTHROPIC_KEY
      status: active

---
metadata:
  persona: editor
  name: Editor

spec:
  prompt:
    name: editor-prompt
    body: |
      You polish prose without changing meaning.
```

The `---` separator makes this a multi-document YAML stream; both
agents are validated together, then committed in independent
transactions. Per-agent atomicity: if one fails to write, the rest
still succeed.

### Preview without writing

```bash
curl -X POST "$PANTHEON/v1/agents/import?dry_run=true" \
  -H "X-SoulKey: $SOULKEY" \
  -H "Content-Type: text/yaml" \
  --data-binary @my-agents.yaml
```

`dry_run=true` returns what would be written (with `agent_id:
"(dry-run)"`) without touching the database.

### Validation errors

All errors come back as a flat list with JSONPath-style `path`
references:

```json
{
  "imported": [],
  "errors": [
    {"path": "agents[0].metadata.persona", "message": "required"},
    {"path": "agents[1].spec.provider_overrides[0].secret_ref",
     "message": "scheme 'vault://' is reserved but not yet implemented (only env:// is supported in this version)"}
  ]
}
```

If **any** error is present, **no writes happen**. See
[`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../apps/platform-api/deploy/TROUBLESHOOTING.md#agentyaml-import-errors)
for the full error catalog.

## Path 2 — Import via the portal

The dashboard at `http://localhost:3000/dashboard/settings` includes
an Agents pane with a paste-and-preview YAML import flow. It hits the
same `POST /v1/agents/import` endpoint and surfaces validation errors
inline against the source pane. Use the portal if you want preview
diffs against existing rows; use curl if you're scripting.

## Path 3 — List, read, patch

```bash
# List
curl -s "$PANTHEON/v1/agents" -H "X-SoulKey: $SOULKEY" | jq .

# Include global (marketplace) agents alongside your tenant's
curl -s "$PANTHEON/v1/agents?include_global=true" -H "X-SoulKey: $SOULKEY" | jq .

# Read one
curl -s "$PANTHEON/v1/agents/<agent-id>" -H "X-SoulKey: $SOULKEY" | jq .

# Patch (update display name + description)
curl -X PATCH "$PANTHEON/v1/agents/<agent-id>" \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{"name":"Research Coach v2","description":"Citation-first"}'

# Soft-delete (sets status='archived', preserves persona_id)
curl -X DELETE "$PANTHEON/v1/agents/<agent-id>" -H "X-SoulKey: $SOULKEY"
```

Cross-tenant access returns 404 (not 403) by design — Pantheon doesn't
leak existence of agents in other tenants.

## Path 4 — Prompt versioning

Prompts are append-only. When you POST a new version under a name
that already exists, Pantheon writes a fresh row with `supersedes_id`
pointing at the prior version and the prior version's status flips
to `deprecated`. The agent that points at the prompt by id
automatically follows the chain.

```bash
# List prompts for a given name
curl -s "$PANTHEON/v1/prompts?name=research-coach-prompt" \
  -H "X-SoulKey: $SOULKEY" | jq .

# Resolve the currently-active prompt by name (tenant-then-global)
curl -s "$PANTHEON/v1/prompts/resolve?name=research-coach-prompt" \
  -H "X-SoulKey: $SOULKEY" | jq .

# Append a new version
curl -X POST "$PANTHEON/v1/prompts/<prompt-id>/versions" \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{"body": "Updated prompt body…"}'
```

Re-importing an `agent.yaml` with the same `spec.prompt.name` and an
**unchanged** body is a no-op — the existing latest row is reused.
Re-importing with a **changed** body appends a new version
automatically.

## Path 5 — Attach a SoulKey for the agent's runtime

Agents authenticate to platform-api via the `X-SoulKey` header. To
mint a key for an existing persona:

```bash
curl -X POST "$PANTHEON/v1/soulauth/admin/keys" \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<your-tenant-uuid>",
    "persona_id": "research-coach",
    "label": "research-coach prod runtime",
    "metadata": {"role": "agent"}
  }'
```

The response includes `raw_key`. **Save it immediately** — Pantheon
hashes it on insert and the raw value cannot be recovered.

Or use the portal: Settings → Agents → click an agent → New SoulKey.

## Path 6 — Wire BYOK provider keys to your agents

The `spec.provider_overrides` block in `agent.yaml` upserts rows in
`_tenant_provider_keys`. To do it directly without re-importing the
agent:

```bash
curl -X POST "$PANTHEON/v1/provider-keys" \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "secret_ref": "env://TENANT_ANTHROPIC_KEY",
    "status": "active"
  }'

# Test it (no quota burned — uses a cheap /v1/models probe)
curl -X POST "$PANTHEON/v1/provider-keys/<key-id>/test" \
  -H "X-SoulKey: $SOULKEY"
```

Full reference: [`byok-provider-keys.md`](byok-provider-keys.md).

## Endpoint reference

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/v1/agents` | `agents:read` | `?include_global=true` to fold in marketplace rows |
| POST | `/v1/agents` | `agents:write` | Create a single agent (no prompt body — use import for that) |
| GET | `/v1/agents/{id}` | `agents:read` | Cross-tenant → 404 |
| PATCH | `/v1/agents/{id}` | `agents:write` | Updates mutable fields only |
| DELETE | `/v1/agents/{id}` | `agents:write` | Soft-delete (status='archived') |
| GET | `/v1/prompts` | `prompts:read` | `?name=`, `?status=`, `?include_global=` |
| POST | `/v1/prompts` | `prompts:write` | Create a draft |
| GET | `/v1/prompts/resolve?name=…` | `prompts:read` | Resolve active prompt for a name |
| GET | `/v1/prompts/{id}` | `prompts:read` | |
| PATCH | `/v1/prompts/{id}` | `prompts:write` | Status changes only — body changes go via `POST /versions` |
| DELETE | `/v1/prompts/{id}` | `prompts:write` | Soft-delete (status='deprecated') |
| POST | `/v1/prompts/{id}/versions` | `prompts:write` | Append a new version body |
| POST | `/v1/agents/import` | `agents:write` | Bulk import (`?dry_run=true` for preview) |
| GET | `/v1/provider-keys` | `providers:read` | `?provider=anthropic` to filter |
| POST | `/v1/provider-keys` | `providers:write` | Upsert by (tenant, provider) |
| POST | `/v1/provider-keys/{id}/test` | `providers:read` | Resolve + probe upstream; secret never echoed |
| POST | `/v1/provider-keys/test` | `providers:read` | Inline test without saving |
| GET | `/v1/agents-store/config` | `policy:read` | Current adapter (local / supabase) |
| POST | `/v1/agents-store/config` | `policy:read` | Switch adapter |
| POST | `/v1/agents-store/test` | `policy:read` | Health-check a proposed config |

## See also

- [`apps/platform-api/src/agents/agent_yaml_schema.md`](../../apps/platform-api/src/agents/agent_yaml_schema.md)
  — canonical schema reference
- [`byok-provider-keys.md`](byok-provider-keys.md) — BYOK details
- [`store-adapter-config.md`](store-adapter-config.md) — LocalPg vs Supabase
- [`soulauth-integration.md`](soulauth-integration.md) — federated user auth
- [`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../apps/platform-api/deploy/TROUBLESHOOTING.md)
  — failure-mode reference
