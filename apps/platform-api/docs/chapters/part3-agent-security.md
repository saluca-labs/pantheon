# Part III: Agent Platform

> **Pantheon Administrator Guide — Chapter**
> **Audience:** Self-hosters managing the agent + prompt surfaces

This chapter covers the Wave-H agent platform inside platform-api:
the agent + prompt CRUD, the YAML bulk import, the per-tenant BYOK
provider keys, and the configurable store adapter.

For the end-user dashboard view see [`AGENTS_GUIDE.md`](../AGENTS_GUIDE.md);
for the operator quickstart see
[`docs/operations/agents-platform-quickstart.md`](../../../../docs/operations/agents-platform-quickstart.md).

---

## 3.1 The data model

| Resource | Table | Keying | Notes |
|---|---|---|---|
| Agent | `_agos_agents` | `(tenant_id, persona_id)` | One persona per tenant. Points at one active prompt. |
| Prompt | `_agos_prompts` | `name` (versioned) | Append-only; new bodies create a row with `supersedes_id`. |
| Provider key | `_tenant_provider_keys` | `(tenant_id, provider)` | Per-tenant BYOK. Holds a `secret_ref` URI, never resolved value. |
| Policy cache | `_soulauth_policy_cache` | `(tenant_id, persona_id)` | Materialized PDP view; auto-written by import. |
| Tenant | `_soul_tenants` | `id` | Boundary for everything above. |

The five tables above plus their auxiliary indexes are the agent
platform. They live in the platform-api Postgres by default; the
Agents Store adapter can move `_agos_agents` and `_agos_prompts` to
a managed Supabase project (see 3.5 below).

## 3.2 Endpoint surface

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/v1/agents` | `agents:read` | `?include_global=true` for marketplace |
| `POST` | `/v1/agents` | `agents:write` | Create single agent |
| `GET` | `/v1/agents/{id}` | `agents:read` | Cross-tenant → 404 |
| `PATCH` | `/v1/agents/{id}` | `agents:write` | Mutable fields only |
| `DELETE` | `/v1/agents/{id}` | `agents:write` | Soft-delete |
| `POST` | `/v1/agents/import` | `agents:write` | YAML bulk import; `?dry_run=true` |
| `GET` | `/v1/prompts` | `prompts:read` | Filterable by name / status |
| `POST` | `/v1/prompts/{id}/versions` | `prompts:write` | Append new version body |
| `GET` | `/v1/prompts/resolve` | `prompts:read` | Active prompt by name |
| `GET` | `/v1/provider-keys` | `providers:read` | Per-tenant, masked |
| `POST` | `/v1/provider-keys` | `providers:write` | Upsert by `(tenant, provider)` |
| `POST` | `/v1/provider-keys/{id}/test` | `providers:read` | Probe upstream `/v1/models` |
| `GET` | `/v1/agents-store/config` | `policy:read` | Current adapter |
| `POST` | `/v1/agents-store/config` | `policy:read` | Switch adapter |

Full per-endpoint walkthrough:
[`docs/operations/agents-platform-quickstart.md`](../../../../docs/operations/agents-platform-quickstart.md).

## 3.3 The `agent.yaml` schema

Canonical schema reference (kept under platform-api so it stays
versioned with the validator):
[`apps/platform-api/src/agents/agent_yaml_schema.md`](../../src/agents/agent_yaml_schema.md).

Minimum-viable agent:

```yaml
metadata:
  persona: research-coach
  name: Research Coach
spec:
  prompt:
    name: research-coach-prompt
    body: |
      You are a research coach.
```

Multi-document YAML streams (`---` separators) import multiple agents
in one call. Per-agent atomicity: each agent commits in its own
transaction, so a failure in one doesn't roll back the rest. Use
`?dry_run=true` to preview the write set without committing.

## 3.4 Per-tenant BYOK provider keys

Pantheon stores only a `secret_ref` URI per provider key, never the
resolved secret. Supported providers and probe endpoints:

| Provider | Probe | Auth |
|---|---|---|
| `anthropic` | `/v1/models` | `x-api-key` + `anthropic-version` |
| `openai` | `/v1/models` | `Authorization: Bearer …` |
| `gemini` | `/v1beta/models` | `?key=…` |
| `groq` | `/openai/v1/models` | `Authorization: Bearer …` |
| `ollama` | `/api/tags` | unauthenticated |

Supported `secret_ref` schemes — all resolved through the
`platform_secrets` facade in `packages/secrets/python/`:

- `env://VAR_NAME` — reads from the platform-api container's environment.
- `file:///path` — reads file contents (Docker/k8s mounted secrets).
- `vault://<mount>/data/<path>#<field>` — HashiCorp Vault KV-v2.
- `gcpsm://projects/<id>/secrets/<name>/versions/<v>` — GCP Secret Manager.
- `awssm://<arn-or-name>[#<json-field>]` — AWS Secrets Manager.

Unknown schemes are rejected at write time with a structured 400.

Full mechanics including probe semantics, masking rules, and the
"why isn't my key resolving" failure modes:
[`docs/operations/byok-provider-keys.md`](../../../../docs/operations/byok-provider-keys.md).

## 3.5 Configurable Agents Store

The agent + prompt store is adapter-pluggable. Two adapters ship:

| Adapter | When to use |
|---|---|
| `LocalPg` (default) | Self-host; everything lives in your own Postgres. Zero extra config. |
| `Supabase` | You already run Supabase and want the agents store to live there. Configure with project URL + service-role key (`env://` reference). |

The selection is stored in `_pantheon_config` and is editable from
the dashboard (`/dashboard/settings` → Agents Store) or via
`POST /v1/agents-store/config`. Pantheon validates the proposed
config against a connectivity probe before committing.

Supabase is **one option, not a requirement**. The local-first
default is the supported path; the Supabase adapter exists for
operators who want managed Postgres without running their own.

Full reference:
[`docs/operations/store-adapter-config.md`](../../../../docs/operations/store-adapter-config.md).

## 3.6 Prompt versioning model

Prompts are append-only. The contract:

- `POST /v1/prompts` creates a new prompt row with `status='draft'`.
- `POST /v1/prompts/{id}/versions` appends a new row with the same
  `name`, increments the version, sets `supersedes_id` to the prior
  active row, and flips the prior active row's status to `deprecated`.
- `PATCH /v1/prompts/{id}` updates status only — body changes always
  go through `POST /versions`.
- Agents reference a prompt by id; when the underlying name's active
  version changes, the agent's resolved body changes automatically
  (the agent stores the id of the prompt **name's** active version
  pointer, not the body).
- `GET /v1/prompts/resolve?name=…` returns the currently-active
  version for a given name, with tenant-then-global fallback (global
  rows are visible across tenants for marketplace prompts).

Re-importing an `agent.yaml` with the same `spec.prompt.name` and an
**unchanged** body is a no-op. Re-importing with a **changed** body
appends a new version automatically.

## See also

- [`AGENTS_GUIDE.md`](../AGENTS_GUIDE.md) — end-user dashboard view
- [`agents-platform-quickstart.md`](../../../../docs/operations/agents-platform-quickstart.md) — operator quickstart
- [`byok-provider-keys.md`](../../../../docs/operations/byok-provider-keys.md) — BYOK reference
- [`store-adapter-config.md`](../../../../docs/operations/store-adapter-config.md) — LocalPg vs Supabase
- [`agent_yaml_schema.md`](../../src/agents/agent_yaml_schema.md) — schema reference
