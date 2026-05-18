# ADR-001: Platform Topology — 2 Product Apps + Ops Modules

**Status:** Accepted  
**Date:** 2026-01  
**Deciders:** Platform team  

> **Note (2026-05-17):** This ADR predates the Pantheon rename. The
> "Tiresias codebase" referenced below is what now lives in the
> Pantheon monorepo at `salucallc/pantheon`. The decision and its
> consequences are unchanged; only the umbrella name shifted. See
> [ADR-011](./ADR-011-pantheon-rename.md) for the rename record.

## Context

The Tiresias codebase was spread across ~10 repositories (`tiresias`, `tiresias-web`, `tiresias-app-proxy`, `tiresias-sovereign`, `tiresias-grafana`, `tiresias-incident-controller`, `tiresias-monitor`, `tiresias-pentest`, `tiresias-rules`, `tiresias-enforcement`). This created friction in:

- Cross-cutting changes requiring PRs across multiple repos
- Inconsistent dependency management (no shared lockfiles)
- Duplicate DevX setup (each repo had its own CI, env files, Dockerfiles)
- Hard to trace inter-component auth changes

## Decision

Consolidate into a **pragmatic 2-app + ops modules** topology within a single monorepo:

```
/apps
  /platform-web        ← primary UI (Next.js)
  /platform-api        ← primary backend (FastAPI/SoulAuth)
  /platform-app-proxy  ← agent proxy (full profile)
  /platform-sovereign  ← on-premises variant (full profile)
/packages
  /auth, /memory, /config, /types, /observability, /database
/infrastructure
  /grafana, /monitor, /pentest, /rules, /enforcement, ...
```

**Rejected alternatives:**

| Alternative | Reason rejected |
|-------------|----------------|
| Full microservices (1 repo per service) | Too much overhead for current team size; harder to share packages |
| Single monolith | Conflates agent runtime (Python) with UI (TypeScript); different deploy cadences |
| Git submodules for shared packages | Complex setup, history fragmentation, poor DX |

## Consequences

**Positive:**
- Single `pnpm install` for all TypeScript packages
- Shared `packages/*` for auth, config, types — no copy-paste
- Unified CI pipeline (see Phase J)
- Single `docker compose up` for the full default stack
- `git mv` preserves history across all moves

**Negative / Tradeoffs:**
- Python apps remain outside the pnpm workspace (managed via `uv`)
- Large repo may slow some CI steps — mitigated by Turborepo caching
- `platform-app-proxy` and `platform-sovereign` only start in `full` compose profile

## Rollback Plan

All moves use `git mv` — history is preserved. Any component can be extracted back to a separate repo by `git filter-repo` without losing history.
