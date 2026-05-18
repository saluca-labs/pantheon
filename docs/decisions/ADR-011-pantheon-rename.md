# ADR-011: Pantheon Rename + URL Unification + Tier-Off-by-Default

**Status:** Accepted  
**Date:** 2026-05-17  
**Deciders:** Cristian (sole maintainer at decision time)  
**Wave:** I (documentation closure)

## Context

By Wave G the platform had three accumulated identity problems that
made docs, URLs, and product framing internally inconsistent:

1. **Umbrella name drift.** Internal-only the platform had picked up
   the working name "Oscar Suite" during the W-A through W-E period
   (visible in a small number of `apps/platform-web/content/agentic-os/`
   plan docs). External-facing the platform was branded "Tiresias"
   from the pre-monorepo era. Neither matched the actual shape the
   project had grown into: a local-first, OSS, multi-OS umbrella.
2. **URL prefix collision.** The Agentic OS layer originally lived at
   `/dashboard/os/<slug>/...` (the registry-driven sub-app prefix).
   Wave G unified the dashboard shell so per-OS surfaces live directly
   under `/dashboard/<slug>/...` — but the docs and a handful of
   READMEs still referenced the old `/dashboard/os/<slug>` prefix.
3. **Tier-gating leak.** The Tiresias-era enterprise SaaS framing
   assumed a tier ladder (`community < starter < pro < enterprise <
   mssp < saas`) gating features. Pantheon as OSS has no business with
   a tier ladder by default — it is a local-first project.

These three problems were tangled enough that punting on naming meant
punting on docs, and punting on docs meant the user / contributor
experience kept degrading.

## Decision

1. **Umbrella name = Pantheon.** All user-facing umbrella copy,
   READMEs, ADRs, architecture docs, and operational docs name the
   platform Pantheon. The git org / repo is `salucallc/pantheon`.

2. **Carve-out: the Tiresias App Proxy keeps its name.** The
   App Proxy sub-product (`apps/platform-app-proxy/`) stays branded
   Tiresias because it has external traction under that name and its
   product surface is meaningfully distinct from the rest of
   Pantheon. The Python code namespace (`apps/platform-api/src/tiresias/`)
   and the service name (`tiresias-proxy`) also stay Tiresias-branded
   as code-namespace literals. See
   [ADR-013](./ADR-013-app-proxy-tiresias-branding.md) for the full
   carve-out record.

3. **URL prefix unification.** All per-OS dashboard surfaces collapse
   from `/dashboard/os/<slug>/...` to `/dashboard/<slug>/...`. The
   `/dashboard/os` index page is removed; the cross-OS index now lives
   at `/dashboard` itself. Mechanical doc patch landed as PR #139.

4. **Tier gating off by default.** Pantheon ships with no tier ladder.
   The `TierGate` component and `tierMeets` helper still exist in the
   portal codebase for backward compatibility with the small number of
   pages that historically required gating, but the default minimum
   tier is `community` (i.e. everyone), and Wave I.3 removes the
   `minTier` registry from `/dashboard/docs` so that all built-in
   docs render for every user regardless of tier. The
   `license_required` knob in `apps/platform-api/src/tiresias/config.py`
   defaults to `False`.

## Consequences

**Positive:**

- One umbrella name, used consistently across READMEs, ADRs, and
  shipped UI. New contributors no longer have to guess which name is
  current.
- URL prefix matches the actual route pattern after Wave G — the docs
  match the running code.
- OSS posture is unambiguous: clone, `pnpm bootstrap`, log in. No
  license-key prompts, no tier-locked surfaces in the default
  build.
- The App Proxy carve-out is documented as an intentional decision,
  not an oversight; future doc passes can refer to ADR-013 instead
  of relitigating it every time.

**Negative / trade-offs:**

- Internal Saluca operational tooling (`infrastructure/grafana/`,
  `infrastructure/incident-controller/`, `infrastructure/pentest/`)
  still references the pre-Pantheon Saluca lab environment. Wave I.3
  reframes those READMEs as "internal ops only" rather than rewriting
  them for OSS self-host — they would not be useful to OSS users
  even if rebranded.
- The `tiresias` Python namespace is a permanent reminder that the
  monorepo grew out of the pre-Pantheon Tiresias codebase. Renaming
  the Python package would be a high-cost change for low contributor
  value, so it stays.
- Self-hosters who pre-dated Pantheon may have `/dashboard/os/...`
  bookmarks. We did not implement explicit redirects; the old URLs
  404.

## Status of related ADRs

- ADR-001 — Platform topology — annotated with a Pantheon-rename note
  (decision and consequences unchanged).
- ADR-002 — Local-auth-default — superseded by ADR-012 (SoulAuth
  federated auth).
- ADR-013 — App Proxy Tiresias branding carve-out (this ADR's
  companion).

## See also

- [`docs/operations/quickstart.md`](../operations/quickstart.md) —
  current canonical self-host quickstart, references Pantheon.
- [`docs/architecture/system-overview.md`](../architecture/system-overview.md)
  — labels the platform subgraph as "Pantheon Platform" after this
  rename.
- PR #139 — the mechanical URL prefix patch (`/dashboard/os/<slug>` →
  `/dashboard/<slug>`).
- PR #138 — moves sales / partner / patent content out of the OSS
  repo entirely (no place for commercial collateral in an OSS
  distribution).
