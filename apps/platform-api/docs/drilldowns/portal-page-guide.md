# Dashboard Page-by-Page Guide

> **Pantheon Administrator Guide — Drilldown**
> **Parent:** [`USER_GUIDE.md`](../USER_GUIDE.md)
> **Audience:** Self-hosters and end users orienting to the dashboard

Walks through every shipped `/dashboard/*` page, what it does, what
data it surfaces, and what permissions you need to reach it. For the
tour at a higher level see [`USER_GUIDE.md`](../USER_GUIDE.md).

---

## 1. Dashboard shell

The dashboard is a Next.js 15 App Router application served from
`apps/platform-web/`. The shell layout has three regions:

- **`DashboardHeader`** — tenant selector, user identity menu, link to
  Settings.
- **`DashboardSidebar`** — section navigation. No tier-gating; all
  navigation is visible to users who have the relevant role
  permission.
- **Main content area** — the active route's page.

> **About the URL prefix.** The dashboard once mounted OS pages under
> `/dashboard/os/<slug>`. Wave G collapsed this to `/dashboard/<slug>`.
> The filesystem routes still live under
> `src/app/(dashboard)/dashboard/os/`, so `/dashboard/os/<slug>` URLs
> also resolve — but `/dashboard/<slug>` is the canonical URL and
> what the registry and navigation use.

## 2. Top-level pages

### 2.1 `/dashboard` (overview)

Landing page after login. Surfaces a per-tenant rollup: agents
defined, prompts active, recent audit events, per-OS quick links.

| Data | Source |
|---|---|
| Agents count | `GET /v1/agents` |
| Prompts count | `GET /v1/prompts` |
| Recent audit | `GET /v1/audit/events?limit=10` |
| Per-OS status | from registry (`apps/platform-web/src/lib/agentic-os/registry.ts`) |

### 2.2 `/dashboard/agents`

First-class agent fleet management. See
[`AGENTS_GUIDE.md`](../AGENTS_GUIDE.md) for the deep walkthrough.

| Action | Permission | Endpoint |
|---|---|---|
| List | `agents:read` | `GET /v1/agents` |
| Create | `agents:write` | `POST /v1/agents` |
| Edit | `agents:write` | `PATCH /v1/agents/{id}` |
| Archive | `agents:write` | `DELETE /v1/agents/{id}` |
| Bulk import | `agents:write` | `POST /v1/agents/import` |
| Mint SoulKey | `keys:create` | `POST /v1/soulauth/admin/keys` |

### 2.3 `/dashboard/prompts`

Prompt library with append-only versioning.

| Action | Permission | Endpoint |
|---|---|---|
| List by name | `prompts:read` | `GET /v1/prompts?name=…` |
| Resolve active | `prompts:read` | `GET /v1/prompts/resolve?name=…` |
| Append version | `prompts:write` | `POST /v1/prompts/{id}/versions` |
| Status change | `prompts:write` | `PATCH /v1/prompts/{id}` |

### 2.4 `/dashboard/audit`

Auth + compliance trail viewer. Reads `audit_events`.

| Field | Filter |
|---|---|
| Actor | text |
| Action | dropdown |
| Status | success / failure |
| Time | range picker |

Permission: `audit:read`. Available to `viewer`, `auditor`,
`operator`, `admin`, `owner`.

### 2.5 `/dashboard/settings`

Operator hub. Tabs:

- **Provider Keys** — per-tenant BYOK; reads/writes
  `_tenant_provider_keys`. Endpoints under `/v1/provider-keys/*`.
- **Agents Store** — adapter selection; reads/writes
  `_pantheon_config`. Endpoints under `/v1/agents-store/*`.
- **Agents** — paste-and-preview YAML import; reads `/v1/agents`,
  posts to `/v1/agents/import`.
- **Users / Teams** — local user + team admin atop SoulAuth.
- **Feature flags** — per-user toggles for in-flight features.

## 3. The nine Agentic OS modules

Each OS module mounts under `/dashboard/<slug>` and renders the OS's
own page tree. The dashboard shell stays the same; only the main
content area changes.

| Slug | Route | Features (sample) | Status |
|---|---|---|---|
| `health` | `/dashboard/health` | intake, plans, tracking | live |
| `maker` | `/dashboard/maker` | projects, blockers, coach, spec sheets, tools | live |
| `filmmaker` | `/dashboard/filmmaker` | pre-production, shoot day | live |
| `cyber` | `/dashboard/cyber` | cross-OS audit feed | live |
| `secure-dev` | `/dashboard/secure-dev` | secure dev workflow | live |
| `research` | `/dashboard/research` | hypotheses, lit, experiments | preview |
| `business` | `/dashboard/business` | contacts, deals, invoices, time | preview |
| `creator` | `/dashboard/creator` | content pipeline | preview |
| `autobiographer` | `/dashboard/autobiographer` | books, chapters | preview |

Each OS's full feature inventory + future phases is described in
the OS's `apps/platform-web/content/agentic-os/<slug>.md` plan file,
viewable in the dashboard via the OS's settings tab.

See [`AGENTIC_OS_TOUR.md`](../AGENTIC_OS_TOUR.md) for a per-module
walkthrough.

## 4. Per-OS page conventions

Every OS module follows the same structural conventions, established
in Wave B:

- **Index page** (`/dashboard/<slug>`) — feature grid + recent
  activity summary.
- **Feature pages** (`/dashboard/<slug>/<feature>`) — the actual
  work surfaces.
- **Settings tab** — per-OS config, feature flags, audit pane for
  this OS's `_agos_audit` slice, plan-viewer link.

Feature cards live in the registry; missing features render a
"coming soon" placeholder rather than 404.

## 5. Permissions summary

| Role | Pages visible |
|---|---|
| `viewer` | All read pages; cannot create/edit anything |
| `operator` | All read pages + agents/prompts/providers edit (no delete) |
| `admin` | All pages; full CRUD across surfaces |
| `auditor` | Read everything + decrypted audit fields (MFA-gated) |
| `owner` | Full access including billing / delete tenant |

Full per-permission breakdown:
[`rbac-permission-matrix.md`](rbac-permission-matrix.md).

## See also

- [`USER_GUIDE.md`](../USER_GUIDE.md) — dashboard tour at a higher level
- [`AGENTS_GUIDE.md`](../AGENTS_GUIDE.md) — Agents + Prompts deep-dive
- [`AGENTIC_OS_TOUR.md`](../AGENTIC_OS_TOUR.md) — per-OS feature inventory
- [`rbac-permission-matrix.md`](rbac-permission-matrix.md) — RBAC reference
