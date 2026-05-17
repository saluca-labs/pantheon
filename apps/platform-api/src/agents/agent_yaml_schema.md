# Pantheon `agent.yaml` schema (W-H.2.f)

This is the canonical, **generic** schema accepted by `POST /v1/agents/import`.
It unifies the historical persona-policy YAML
(`policies/tenants/<slug>/personas/<persona>.yaml`) with the new DB-backed
prompt body (W-H.2.a → W-H.2.c) and the per-tenant BYOK provider keys
(W-H.2.e) into a single bulk-imports format.

Pantheon ships this **format + endpoint + UI**. Tenant-specific import
pipelines (e.g. saluca's `Z:/saluca-corp/`) live OUTSIDE pantheon and
consume this endpoint via HTTP.

---

## Top-level shape

```yaml
metadata: { ... }   # required
spec:               # required (may be {} but the key must be present)
  prompt:           # optional
  model_policies:   # optional
  resources:        # optional
  jit:              # optional
  escalation:       # optional
  provider_overrides:  # optional
```

Unknown top-level fields are **rejected** at validation time.

### Bulk container

A single import request may carry one or many agents. Two equivalent forms:

```yaml
# Form A — multi-document YAML stream (yaml.safe_load_all)
---
metadata: { persona: a, ... }
spec: { ... }
---
metadata: { persona: b, ... }
spec: { ... }
```

```yaml
# Form B — explicit list
agents:
  - metadata: { persona: a, ... }
    spec:     { ... }
  - metadata: { persona: b, ... }
    spec:     { ... }
```

Inline JSON requests MUST use Form B.

---

## `metadata`

| Field         | Type             | Required | Default              | Notes |
|---------------|------------------|----------|----------------------|-------|
| `tenant`      | string (slug)    | no       | caller's tenant slug | If present, MUST match caller's tenant slug; otherwise validation error |
| `persona`     | string           | **yes**  | —                    | Natural key (locked decision #2). Per-tenant unique. |
| `name`        | string           | no       | `persona`            | Display name |
| `description` | string           | no       | `null`               | Free text |
| `role`        | string           | no       | `null`               | Used for `roles.yaml` template merge if applicable |
| `tags`        | list of strings  | no       | `[]`                 | Stored verbatim in `_agos_agents.metadata.tags` |

---

## `spec.prompt` (optional)

If present, the import creates a prompt row (or appends a new version if a
matching name already exists for the tenant) and atomically updates
`_agos_agents.prompt_id` to point at the new row.

| Field   | Type   | Required | Default | Notes |
|---------|--------|----------|---------|-------|
| `name`  | string | **yes**  | —       | Stable prompt name (per locked decision #3, supersession-by-name) |
| `body`  | string | **yes**  | —       | Plain text (locked decision #4 — no templating) |
| `version` | int  | no       | 1       | Advisory; supersession chain is derived from store-side state |
| `status`  | enum | no       | active  | `draft \| active \| deprecated` |

Validation:
- `body` cannot be empty when `prompt` is present.

---

## `spec.model_policies` (optional)

Mirrors `src.policy.loader.ModelPolicy`. Written to
`_soulauth_policy_cache.resolved_policy.spec.model_policies` so the existing
PDP picks it up with no change.

| Field             | Type                    | Notes |
|-------------------|-------------------------|-------|
| `default_models`  | list of model id strings| Fallback list when no task rule matches |
| `task_routing`    | map<task_type, rule>    | See rule shape below |
| `forbidden_models`| list of strings         | Strict-deny list |
| `cost_budget`     | map<string, number>     | e.g. `{daily_limit_usd: 50, per_request_max_usd: 2}` |
| `enforcement`     | string                  | `strict` (default) \| `advisory` |

`task_routing[task_type]` rule shape:

| Field        | Type            | Notes |
|--------------|-----------------|-------|
| `allowed`    | list of strings | Models permitted for this task |
| `required`   | list of strings | If set, requested model must be in this list |
| `preferred`  | string          | Auto-selection default |
| `description`| string          | Free text |

---

## `spec.resources` (optional)

Carried verbatim from the historical persona YAML. Map of
`<resource_name>` → list of policy rule dicts, each with optional
`actions`, `scopes`, `nodes`, `services`, `conditions` keys.

## `spec.jit` (optional)

Mirrors `src.policy.loader.JITConfig` — capability TTLs and operating window.

## `spec.escalation` (optional)

Mirrors `src.policy.loader.EscalationConfig` — temporary access + agent
suspension permissions.

---

## `spec.provider_overrides` (optional)

List of per-tenant BYOK provider key rows. Each entry upserts a row into
`_tenant_provider_keys` for `(caller_tenant_id, provider)`.

| Field        | Type   | Required | Default  | Notes |
|--------------|--------|----------|----------|-------|
| `provider`   | enum   | **yes**  | —        | `anthropic \| openai \| gemini \| groq \| ollama` |
| `secret_ref` | string | **yes**  | —        | Secret URI; **only `env://VAR_NAME` is supported in this version**. Reserved schemes (`vault://`, `gcpsm://`, `awssm://`, `enc://`) are **rejected at validation time** with a helpful message — no row is created. |
| `base_url`   | string | no       | `null`   | Provider base URL override (Azure endpoint, Ollama host, etc.) |
| `status`     | enum   | no       | active   | `active \| disabled` |

---

## Validation errors

Errors are returned as a flat list of `{path, message}` objects so the UI
can bind each error to its source input:

```json
{
  "imported": [],
  "errors": [
    { "path": "agents[0].metadata.persona",          "message": "required" },
    { "path": "agents[0].spec.prompt.body",          "message": "cannot be empty when spec.prompt is present" },
    { "path": "agents[0].spec.provider_overrides[1].secret_ref",
      "message": "scheme 'vault://' is reserved but not yet implemented (only env:// is supported in this version)" },
    { "path": "agents[1].metadata.tenant",
      "message": "'other-tenant' does not match caller tenant 'your-tenant'" }
  ]
}
```

**If any agent has a validation error, the entire request is rejected — no
partial commit.**

---

## Successful import response

```json
{
  "imported": [
    {
      "persona_id": "research-coach",
      "agent_id": "…",
      "prompt_id": "…",
      "provider_keys_created": 2,
      "policy_synced": true,
      "created": true
    }
  ],
  "errors": []
}
```

`created=true` when the agent row was inserted, `false` on update of an
existing `(tenant, persona)` row.

---

## End-to-end example

```yaml
metadata:
  tenant: your-slug
  persona: research-coach
  name: Research Coach
  description: Helps with literature reviews
  role: research
  tags: [research, coach]

spec:
  prompt:
    name: research-coach-lit-reviewer
    body: |
      You are a research coach. Help the user with literature reviews.
    version: 1
    status: active

  model_policies:
    default_models: [claude-opus-4-20250514]
    task_routing:
      reasoning:
        required: [claude-opus-4-20250514]
        description: Deep analysis
    forbidden_models: [gpt-3.5-turbo]
    enforcement: strict

  resources:
    memory:
      - actions: [read, write]
        scopes: ["*"]

  jit:
    max_capability_ttl: 900
    default_capability_ttl: 300

  escalation:
    can_grant_temporary_access: false

  provider_overrides:
    - provider: anthropic
      secret_ref: env://TENANT_ANTHROPIC_KEY
      base_url: null
      status: active
```
