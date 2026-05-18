# Agents + Prompts User Guide

End-user guide to the `/dashboard/agents`, `/dashboard/prompts`, and
the related Settings tabs (Provider Keys, Agents Store, Agents).

This document is the operator-facing companion to:

- [`docs/operations/agents-platform-quickstart.md`](../../../docs/operations/agents-platform-quickstart.md)
  — the curl-driven version of the same flows
- [`apps/platform-api/src/agents/agent_yaml_schema.md`](../src/agents/agent_yaml_schema.md)
  — canonical schema reference
- [`chapters/part3-agent-security.md`](chapters/part3-agent-security.md)
  — the admin-guide chapter on the agent platform

If you're scripting against the API, start with the operations
quickstart. If you're clicking through the dashboard, start here.

---

## What is an agent in Pantheon?

An **agent** in Pantheon is a persona within your tenant — a
SoulKey-addressable identity that maps to:

- One **active prompt** (versioned, append-only)
- One **provider key** (per-tenant BYOK, e.g. `env://TENANT_ANTHROPIC_KEY`)
- A set of **tags**, **model policies**, and **metadata**

Agents are first-class resources (not just "a SoulKey with a label"):
they're tracked in `_agos_agents`, have their own CRUD endpoints,
and the SoulKey is the runtime credential that connects an agent to
inbound requests.

## Creating your first agent (dashboard)

1. Sign in to the dashboard.
2. Navigate to **`/dashboard/agents`**.
3. Click **New Agent**.
4. Fill in:
   - **Persona** — short, URL-safe slug (e.g. `research-coach`).
     Unique per tenant; can't be changed after creation.
   - **Name** — human-readable label.
   - **Description** — what this agent does.
   - **Tags** — comma-separated; used for filtering on the list view.
5. Click **Create**. You're returned to the agent detail page.

The new agent has no active prompt yet. To attach one:

6. Click **Attach Prompt** → either **Create New** (paste the body)
   or **Select Existing** (pick from your prompt library).
7. Click **Save**. The agent now points at the prompt's currently-
   active version.

## Importing many agents at once (`agent.yaml`)

For more than two or three agents, the import flow is faster:

1. Navigate to **`/dashboard/settings`** → **Agents** tab.
2. Paste an `agent.yaml` document into the editor. Single agent or
   multi-document YAML stream (`---` separators) both work.
3. Click **Preview**. Pantheon validates the YAML and shows what
   would be written; no rows are touched yet.
4. Click **Commit**. Each agent commits in its own transaction —
   if one fails, the rest still succeed.

### A minimal `agent.yaml`

```yaml
metadata:
  persona: research-coach
  name: Research Coach
  description: Helps with literature reviews
  tags: [research]

spec:
  prompt:
    name: research-coach-prompt
    body: |
      You are a research coach. Help the user write better
      literature reviews. Cite sources. Surface counter-evidence.
    status: active
```

### A richer one with policies and a provider override

```yaml
metadata:
  persona: research-coach
  name: Research Coach

spec:
  prompt:
    name: research-coach-prompt
    body: |
      You are a research coach.

  model_policies:
    default_models: [claude-opus-4-20250514]
    forbidden_models: [gpt-3.5-turbo]
    enforcement: strict

  provider_overrides:
    - provider: anthropic
      secret_ref: env://TENANT_ANTHROPIC_KEY
      status: active
```

Full schema reference:
[`apps/platform-api/src/agents/agent_yaml_schema.md`](../src/agents/agent_yaml_schema.md).

## Attaching a SoulKey

An agent has no callable identity until you mint a SoulKey for it.

1. Navigate to **`/dashboard/agents`** → click the agent.
2. Click **New SoulKey**.
3. Optionally set:
   - **Label** — what this credential is used for (e.g. "prod runtime").
   - **Role** — defaults to `operator`.
   - **Metadata** — JSON for downstream tooling.
4. Click **Issue**. The raw SoulKey is shown once:
   `sk_agent_<tenant>_<persona>_<hex>`.
5. **Copy it immediately.** Pantheon hashes it on insert; the raw
   value is not recoverable.

Use the key in subsequent API calls:

```bash
curl -H "X-SoulKey: $SOULKEY" http://localhost:8000/v1/auth/whoami
```

## Managing prompts

`/dashboard/prompts` is the prompt library. Each row is a single
**version** of a prompt; multiple versions can share a `name`.

### Adding a new version

1. Find the prompt by name.
2. Click **New Version**.
3. Paste the new body. Click **Append**.
4. The new version becomes `active`; the prior active version flips
   to `deprecated`.

Agents that referenced the prompt by id (not by name) keep pointing
at the version-pointer for the name, so the agent's resolved body
updates automatically.

### Promoting a draft

Drafts have `status='draft'` and aren't returned by
`/v1/prompts/resolve`. To promote:

1. Click the draft.
2. Set **Status** to **active**. The prior active version (if any)
   moves to `deprecated`.

### Body changes go through versions, not patches

The `PATCH /v1/prompts/{id}` endpoint only handles status changes.
**Body changes always append a new version.** This is enforced by
the API; the dashboard mirrors the constraint.

## Managing provider keys

Each tenant's BYOK keys live at **`/dashboard/settings`** → **Provider Keys**.

To add one:

1. Click **New Key**.
2. Pick **Provider** — `anthropic`, `openai`, `gemini`, `groq`, `ollama`.
3. Paste **Secret Ref** — supported schemes: `env://VAR_NAME`,
   `file:///path`, `vault://<mount>/data/<path>#<field>`,
   `gcpsm://projects/<id>/secrets/<name>/versions/<v>`,
   `awssm://<arn-or-name>[#<json-field>]`. Backend credentials are
   discovered from the standard env vars on the platform-api
   container — see [`packages/secrets/python/README.md`](../../../packages/secrets/python/README.md).
4. Optional **Base URL** — overrides the default (Azure OpenAI,
   alternate Ollama host, etc.).
5. Click **Save**.

To test:

6. Click **Test** on the row. Pantheon makes a cheap probe call
   (`/v1/models` for most providers, `/api/tags` for ollama) and
   reports success / failure.

To rotate the underlying secret without changing Pantheon config:
just update the env var on the platform-api container and restart.
The `secret_ref` doesn't change.

Full reference:
[`docs/operations/byok-provider-keys.md`](../../../docs/operations/byok-provider-keys.md).

## Switching the Agents Store adapter

By default, agents and prompts live in the same Postgres as the rest
of platform-api (`LocalPg` adapter). To move them to a managed
Supabase project:

1. Provision a Supabase project; capture the project URL and the
   service-role key.
2. Make the service key available via env: `SUPABASE_SERVICE_KEY=…`.
3. Navigate to **`/dashboard/settings`** → **Agents Store**.
4. Pick **Supabase**, fill in the URL, set `secret_ref` to
   `env://SUPABASE_SERVICE_KEY`.
5. Click **Test**. Pantheon probes the connection.
6. Click **Switch**. Migrations run on the Supabase side; the live
   read/write path swaps over.

Switching is one-way at the data level (data doesn't move; new
writes go to the new adapter). For a real migration plan see
[`docs/operations/store-adapter-config.md`](../../../docs/operations/store-adapter-config.md).

## Browsing the marketplace (global agents)

Agents and prompts with `tenant_id = NULL` are **global** — visible
across all tenants. By default the dashboard hides these; enable the
**Include global** toggle on `/dashboard/agents` or `/dashboard/prompts`
to fold them in. Global rows are read-only for non-owner roles.

Global agents are seeded from `apps/platform-api/seeds/agents/*.yaml`
at first boot. To add to the marketplace in your local install, drop
a YAML file in that directory and re-run `pnpm seed`.

## Common pitfalls

- **"I imported and don't see anything"** — make sure you didn't
  pass `?dry_run=true` (CLI) or hit the **Preview** button without
  **Commit** (dashboard).
- **"My agent returns 401"** — the `X-SoulKey` is wrong or revoked.
  Mint a new one; the raw value is shown only at creation.
- **"My agent's prompt is stale"** — confirm the agent's prompt id
  points at the right `_agos_prompts.name`. Re-attach if needed.
- **"My provider key test fails"** — the secret-ref env var isn't
  set inside the platform-api container. `docker compose exec
  platform-api env | grep VAR_NAME` to confirm.
- **"I can't see another tenant's agents"** — that's by design.
  Cross-tenant access returns 404, not 403.

For more failure modes:
[`drilldowns/troubleshooting-flowcharts.md`](drilldowns/troubleshooting-flowcharts.md).

## See also

- [`USER_GUIDE.md`](USER_GUIDE.md) — dashboard tour overview
- [`AGENTIC_OS_TOUR.md`](AGENTIC_OS_TOUR.md) — per-OS module walkthrough
- [`chapters/part3-agent-security.md`](chapters/part3-agent-security.md) — admin chapter on the agent platform
- [`docs/operations/agents-platform-quickstart.md`](../../../docs/operations/agents-platform-quickstart.md) — curl-driven version
- [`apps/platform-api/src/agents/agent_yaml_schema.md`](../src/agents/agent_yaml_schema.md) — schema reference
