# Pantheon User Guide

Operator-facing tour of the Pantheon dashboard. This guide assumes a
running deployment (see [`docs/operations/quickstart.md`](../../../docs/operations/quickstart.md))
and a logged-in user.

> **Audience.** Day-to-day users of the dashboard — the person who
> logs in, navigates the OS modules, runs agents, manages prompts,
> and configures provider keys. For self-hoster setup, see the
> [self-host bundle](../README.md#documentation). For contributor
> deep-dives, see the [architecture docs](../../../docs/architecture/system-overview.md).

## The dashboard shell

After login, you land on `/dashboard`. The shell has three regions:

- **Header** — tenant selector, identity menu, link to Settings.
- **Sidebar** — sections for the Agentic OS modules, plus Agents,
  Prompts, Audit, and Settings.
- **Main** — the active page.

The shell renders the same chrome across every Agentic OS surface. You
can switch OS modules without leaving the dashboard.

## The nine Agentic OS modules

Pantheon's product surface is organized as nine "OS" modules, each
covering one workflow domain. They share the dashboard shell, the
audit log, the feature-flag system, and the BYOK provider keys, but
their pages, schemas, and data are independent.

| Slug | Route | What it does | Status |
|---|---|---|---|
| `health` | `/dashboard/health` | Physical + mental wellness plans, citations, tracking. | live |
| `maker` | `/dashboard/maker` | Workshop projects, blockers, spec sheets, tools. | live |
| `filmmaker` | `/dashboard/filmmaker` | Pre-production planning and shoot day artifacts. | live |
| `cyber` | `/dashboard/cyber` | CyberSec OS — see [monitoring section](#monitoring) below. | live |
| `secure-dev` | `/dashboard/secure-dev` | Secure development workflow surfaces. | live |
| `research` | `/dashboard/research` | Lab notebook, literature, hypotheses, experiments. | preview |
| `business` | `/dashboard/business` | CRM contacts, deals, invoices, time tracking. | preview |
| `creator` | `/dashboard/creator` | Content production pipeline for solo creators. | preview |
| `autobiographer` | `/dashboard/autobiographer` | Long-form memoir / book authoring with chapters. | preview |

Each OS module has its own landing page with feature cards plus a
plan viewer that surfaces the OS's execution plan. The plan viewer is
linked from the OS's settings tab; for the full tour of what each
module does, see [`AGENTIC_OS_TOUR.md`](AGENTIC_OS_TOUR.md).

`live` OSes have shipped features. `preview` OSes have the registry
entry + plan viewer but feature pages may be stubs.

> **About the URL prefix.** The dashboard once mounted OS pages under
> `/dashboard/os/<slug>`. Wave G collapsed this to `/dashboard/<slug>`.
> Pages under `/dashboard/os/<slug>` still resolve (the filesystem
> routes haven't been moved yet) but `/dashboard/<slug>` is the
> canonical URL — that's what the registry and links use.

## Agents

The `/dashboard/agents` page lists the agents your tenant has defined.
An "agent" in Pantheon is a persona within a tenant — a SoulKey-
addressable identity that maps to one active prompt and one provider
key. Agents are first-class citizens (not just SoulKeys); the page
shows persona, display name, status, active prompt, and tags.

From the Agents page you can:

- **Create** a new agent with persona, name, description, and tags.
- **Import** one or many agents from `agent.yaml` via the bulk import
  flow (paste-and-preview against the same endpoint curl users hit).
- **Edit** display name, description, and tags.
- **Archive** an agent (soft-delete; preserves `persona_id`).
- **Mint a SoulKey** for the agent's runtime — see Settings → Agents
  → click an agent → New SoulKey.

The full operator walkthrough — schema reference, curl examples,
errors — lives in [`AGENTS_GUIDE.md`](AGENTS_GUIDE.md) and
[`docs/operations/agents-platform-quickstart.md`](../../../docs/operations/agents-platform-quickstart.md).

## Prompts

`/dashboard/prompts` shows the prompt library for your tenant.
Prompts are **append-only**: every edit appends a new version row
with `supersedes_id` pointing at the prior version, and the prior
version's status flips to `deprecated`. Agents that point at a
prompt by id automatically follow the chain.

The page surfaces:

- **Prompts by name** — the active version, plus the full version
  history per name.
- **Resolve preview** — what an agent will see when it asks for a
  prompt by name (tenant-then-global fallback).
- **New version** — append a new body under an existing name.
- **Status changes** — promote a draft to active, deprecate an old
  version.

Body changes always go via append; the PATCH endpoint only handles
status transitions. This is enforced by the API.

## Settings

`/dashboard/settings` is the operator hub. Tabs:

### Provider Keys

Per-tenant BYOK. Each provider key holds a `secret_ref` URI (e.g.
`env://TENANT_ANTHROPIC_KEY`); Pantheon never stores the resolved
secret. Supported providers today: `anthropic`, `openai`, `gemini`,
`groq`, `ollama`. Add a key, test it against the provider's `/v1/models`
probe, and rotate the underlying secret without changing Pantheon
config.

Full reference:
[`docs/operations/byok-provider-keys.md`](../../../docs/operations/byok-provider-keys.md).

### Agents Store

Pantheon's agent + prompt store is adapter-pluggable. Two adapters
ship: `LocalPg` (the same Postgres that hosts the rest of platform-
api, default) and `Supabase` (a managed Supabase project via the
service-role key). Switch between them from this tab; Pantheon
validates the proposed config before committing.

Supabase is **one option, not a requirement** — local-first
deployments stay on LocalPg.

Full reference:
[`docs/operations/store-adapter-config.md`](../../../docs/operations/store-adapter-config.md).

### Agents

Inline import, persona browser, and SoulKey minting. The same
`POST /v1/agents/import` endpoint is reachable from the portal
(paste YAML, preview, commit) as from curl.

### Users / Teams

Local user and team administration on top of SoulAuth. See
[user management](#user-management) below.

### Feature flags

Per-user toggles for in-flight features. The set of flags is small by
design; see [`docs/architecture/feature-flags.md`](../../../docs/architecture/feature-flags.md)
for the model.

## Monitoring

The CyberSec OS (`/dashboard/cyber`) is the user-facing monitoring
surface. It exposes a real-time view of the per-OS audit stream
(`agos_audit`), which is the cross-OS log that records every
user-attributable side effect (write, deploy, export, key issue).

The CyberSec OS pairs with the platform-wide audit page at
`/dashboard/audit`, which views the `audit_events` table — the
auth/compliance trail (logins, key issuance, RBAC changes). The
two streams live side-by-side; see
[`docs/security/audit-trail.md`](../../../docs/security/audit-trail.md)
for the boundary.

If you came from a Tiresias deployment looking for SoulWatch
behavioral anomaly detection or SoulGate prompt-injection rules,
those subsystems are still part of the codebase but are not the
focus of the OSS Pantheon user experience. Pantheon emphasizes
auditable user-attributable activity over machine-anomaly hunting.

## User management

The portal uses **SoulAuth federated auth** as its production
identity path. Local accounts (email + password), LDAP / Active
Directory, and OIDC (Google or generic) are all supported via the
SoulAuth router. The dashboard's login form authenticates against
SoulAuth; identity then federates into platform-api for every
subsequent API call.

For a single self-hoster, the seeded admin from `pnpm bootstrap`
is enough. To add more users, invite from `/dashboard/settings`
(Users tab) or wire an external IdP per
[`docs/operations/soulauth-integration.md`](../../../docs/operations/soulauth-integration.md).

> **Note on auth docs.** The `@platform/auth` Argon2id layer
> referenced in older docs is legacy / dead code. The production
> path is SoulAuth (bcrypt, separate service). If two docs
> disagree, defer to `soulauth-integration.md`.

## Common tasks

- **"I need to give an agent its first credential."** Settings →
  Agents → click an agent → New SoulKey. Copy the raw value
  immediately; Pantheon hashes it on insert.
- **"I changed my Anthropic API key."** Settings → Provider Keys →
  edit the row, paste the new `env://` reference (or set a new
  env var in `.env` and rebuild). Click Test.
- **"I want to bulk-define five agents."** Settings → Agents →
  paste a multi-document YAML stream (see
  [`agent.yaml` schema](../src/agents/agent_yaml_schema.md))
  → Preview → Commit. Per-agent atomicity: if one fails the
  rest still succeed.
- **"I want to see who did what."** `/dashboard/audit` for
  auth/compliance; `/dashboard/cyber` for user activity across
  the OSes.
- **"I'm locked out."** See
  [`apps/platform-api/deploy/TROUBLESHOOTING.md`](../deploy/TROUBLESHOOTING.md).

## See also

- [`AGENTS_GUIDE.md`](AGENTS_GUIDE.md) — full Agents + Prompts walkthrough
- [`AGENTIC_OS_TOUR.md`](AGENTIC_OS_TOUR.md) — what each of the nine OS modules does
- [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) — self-hoster administration
- [`PLATFORM_OVERVIEW.md`](PLATFORM_OVERVIEW.md) — one-page Pantheon overview
- [`docs/architecture/system-overview.md`](../../../docs/architecture/system-overview.md) — contributor architecture
