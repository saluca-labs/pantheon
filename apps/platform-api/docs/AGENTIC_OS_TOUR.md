# Agentic OS Tour

A user-facing walkthrough of the nine Agentic OS modules that
together form Pantheon's product surface. Each module has its own
schema, pages, and feature set, but they share the dashboard shell,
the audit log, the feature-flag system, and the BYOK provider keys.

For each module: what it does, where it lives, the shipped feature
list (as of this writing), and the per-module plan file that describes
where it's heading.

> **Audience.** Users orienting to Pantheon for the first time, or
> deciding which OS modules are relevant to their workflow. For the
> contributor architecture see [`docs/architecture/agentic-os.md`](../../../docs/architecture/agentic-os.md).
> For the dashboard mechanics see [`USER_GUIDE.md`](USER_GUIDE.md).

---

## How the Agentic OS layer works

Each OS is registered in
[`apps/platform-web/src/lib/agentic-os/registry.ts`](../../platform-web/src/lib/agentic-os/registry.ts).
The registry entry declares:

- `slug` — URL slug (`/dashboard/<slug>`)
- `label`, `tagline`, `description`, `accent` — for the sidebar + hero
- `status` — `live` (shipped features), `preview` (registry + plan
  viewer only), or `planned`
- `features` — currently-shipped feature pages with `href`, `label`,
  `description`
- `planFile` — path to the OS's execution plan in
  `apps/platform-web/content/agentic-os/<slug>.md`

The OS shell renders the feature grid on the OS landing page and
surfaces the plan via the OS's settings tab. Adding a new OS is a
single-file change to the registry plus the slug-specific feature
code.

---

## Health OS

- **Slug:** `health` · **Status:** live
- **Route:** `/dashboard/health`
- **Tagline:** Physical + mental wellness, evidence-based.
- **Plan:** [`health.md`](../../platform-web/content/agentic-os/health.md)

Plan, track, and reflect on physical and mental wellness with
citation-backed guidance. Never medical advice; always with a
crisis-safety wall.

**Shipped surfaces (sample):**

- Intake & profile — initial setup, health baselines, consent
  collection.
- Plans — multi-week wellness plans with citations.
- Tracking — per-day logs against the active plan.

Health was the first OS shipped and is the reference for the per-OS
data + audit + plan-viewer conventions every other OS follows.

---

## Maker OS

- **Slug:** `maker` · **Status:** live
- **Route:** `/dashboard/maker`
- **Tagline:** Workshop projects, blockers, spec sheets, tools.
- **Plan:** [`maker.md`](../../platform-web/content/agentic-os/maker.md)

Workshop / making project management. Track projects, log blockers,
maintain spec sheets and a tool inventory.

**Shipped surfaces (sample):**

- Projects — multi-stage project tracking.
- Coach — AI coach for unblock conversations.
- Blockers — log + categorize + workshop blockers.
- Spec sheets, references — per-project reference material.
- Tools — workshop inventory with consumables tracking.

---

## Filmmaker OS

- **Slug:** `filmmaker` · **Status:** live
- **Route:** `/dashboard/filmmaker`
- **Tagline:** Pre-production planning and shoot day artifacts.
- **Plan:** [`filmmaker.md`](../../platform-web/content/agentic-os/filmmaker.md)

Pre-production and shoot-day workflow surfaces for solo filmmakers
and small crews.

---

## CyberSec OS

- **Slug:** `cyber` · **Status:** live
- **Route:** `/dashboard/cyber`
- **Tagline:** Cross-OS user-activity investigation.
- **Plan:** [`cyber.md`](../../platform-web/content/agentic-os/cyber.md)

Pantheon's user-facing monitoring surface. Surfaces the per-OS audit
stream (`_agos_audit`) as a filterable feed across every OS module.

This is the **non-detection** monitoring view: audit + investigation
without behavioral anomaly detection or prompt-injection scanning.
The detection-focused subsystems (SoulWatch, SoulGate / PRH) remain
in the codebase under `src/soulwatch/` and `src/soulgate/` but are
not foregrounded here. See
[`ANALYST_GUIDE.md`](ANALYST_GUIDE.md) for the rationale.

---

## Secure Dev OS

- **Slug:** `secure-dev` · **Status:** live
- **Route:** `/dashboard/secure-dev`
- **Tagline:** Secure development workflow surfaces.
- **Plan:** [`secure-dev.md`](../../platform-web/content/agentic-os/secure-dev.md)

Secure-development workflow tooling: code review checklists, threat
modeling primitives, dependency tracking.

---

## Research OS

- **Slug:** `research` · **Status:** preview
- **Route:** `/dashboard/research`
- **Tagline:** ELN + literature + experiments.
- **Plan:** [`research.md`](../../platform-web/content/agentic-os/research.md)

Electronic lab notebook, literature mapping, hypothesis ledger, and
experiment design for solo PhDs and small labs.

**Shipped surfaces (preview):**

- Hypothesis ledger — `/dashboard/research/hypotheses` (the first
  feature page shipped).

Other features (library, experiments, exports) are on the plan but
stubbed as of the current registry status.

---

## Business OS

- **Slug:** `business` · **Status:** preview
- **Route:** `/dashboard/business`
- **Tagline:** CRM contacts, deals, invoices, time tracking.
- **Plan:** [`business.md`](../../platform-web/content/agentic-os/business.md)

Solo-operator business management: contacts CRM, deal pipeline,
invoicing, time tracking, marketing broadcasts. Stops short of full
ERP — no multi-tenant SaaS billing, no tax filing, no HRIS-grade
payroll.

**Shipped surfaces (preview):**

- Contacts CRM stub — `_agos_business_*` tables from migration
  `0010_business_os`. Phase 1 of the plan will promote the stub into
  the full contracted shape.

---

## Creator OS

- **Slug:** `creator` · **Status:** preview
- **Route:** `/dashboard/creator`
- **Tagline:** Content production pipeline for solo creators.
- **Plan:** [`creator.md`](../../platform-web/content/agentic-os/creator.md)

Content production pipeline: ideation, drafting, publishing, audience
feedback. Targets solo creators (writers, podcasters, video creators).

---

## Autobiographer OS

- **Slug:** `autobiographer` · **Status:** preview
- **Route:** `/dashboard/autobiographer`
- **Tagline:** Long-form memoir / book authoring.
- **Plan:** [`autobiographer.md`](../../platform-web/content/agentic-os/autobiographer.md)

Long-form authoring workflow for memoirs and books. Books → chapters
→ interviews → exports.

**Shipped surfaces (preview):**

- Books listing — `/dashboard/autobiographer/books`.
- Book detail + chapters scaffold.

Full execution plan is multi-phase; the registry status will move
to `live` as feature pages ship.

---

## Cross-cutting features

Every OS shares the following platform-level affordances:

| Feature | Where | What it does |
|---|---|---|
| **Audit pane** | OS settings tab | Per-OS slice of `_agos_audit`. |
| **Plan viewer** | OS settings tab | Renders the OS's execution plan markdown. |
| **Feature flags** | `/dashboard/settings` → Feature flags | Per-user toggles for in-flight features. |
| **Cross-OS audit** | `/dashboard/cyber` | Aggregated `_agos_audit` across all OSes. |
| **Auth + tenant** | platform-wide | SoulAuth federated; one identity across every OS. |

## Adding a new OS

For contributors: see
[`docs/architecture/agentic-os.md`](../../../docs/architecture/agentic-os.md)
for the conventions (registry entry, content plan file, shared `_agos_*`
audit and feature-flag wiring) and Wave-G ADRs for the dashboard
shell unification.

## See also

- [`USER_GUIDE.md`](USER_GUIDE.md) — dashboard mechanics
- [`AGENTS_GUIDE.md`](AGENTS_GUIDE.md) — Agents + Prompts deep-dive
- [`ANALYST_GUIDE.md`](ANALYST_GUIDE.md) — CyberSec OS + audit log reference
- [`docs/architecture/agentic-os.md`](../../../docs/architecture/agentic-os.md) — contributor architecture
- Per-OS plan files in [`apps/platform-web/content/agentic-os/`](../../platform-web/content/agentic-os/)
