# Contributing to Pantheon

Thanks for your interest in contributing. Pantheon is a local-first,
OSS, monorepo platform — `apps/`, `packages/`, `infrastructure/`, and
`docs/` all live under one git history. This guide covers what you
need to know before opening a PR.

If you are looking to **use** Pantheon (not contribute), start at
[`docs/operations/quickstart.md`](docs/operations/quickstart.md).

## Quickstart for contributors

```bash
# 1. Clone
git clone https://github.com/salucallc/pantheon.git
cd pantheon

# 2. Bootstrap (installs pnpm deps + Python deps + DB)
pnpm bootstrap

# 3. Run the dev stack
pnpm dev   # platform-web on :3000, platform-api on :8000
```

Full local-dev walk-through:
[`docs/operations/local-development.md`](docs/operations/local-development.md).

## Repo layout (high level)

```
apps/                    Deployed services
  platform-web/            Next.js dashboard + BFF (Pantheon)
  platform-api/            FastAPI core (Pantheon)
  platform-app-proxy/      Tiresias App Proxy (stays Tiresias-branded — see ADR-013)
  matrix-bridge/           Matrix homeserver + appservice bridge
  memory-service/          @platform/memory HTTP sidecar
  soul-service/, soul-mcp/ Vendored Soul cryptographic memory + MCP adapter
packages/                Shared libraries (TS + Python halves where applicable)
infrastructure/          Sigma detection rules, Cedar policies, internal-ops stacks
docs/                    Pantheon-native canonical docs (root)
  architecture/            System overview, module boundaries, agent platform
  decisions/               ADRs (numbered, accepted/superseded/etc.)
  operations/              Self-hoster ops — quickstart, container-deployment, smoke matrix
  security/                Auth model, audit trail
.github/workflows/       CI (lint, typecheck, smoke matrix)
```

Two pieces of historical context that show up everywhere:

- The `tiresias` Python package namespace (`apps/platform-api/src/tiresias/`)
  is a code-namespace literal — it stays Tiresias-branded even though
  the umbrella is now Pantheon. Same for the `tiresias-proxy` service.
- The **Tiresias App Proxy** (`apps/platform-app-proxy/`) is an
  intentional carve-out: that sub-product keeps the Tiresias brand
  under the Pantheon umbrella. See
  [`docs/decisions/ADR-013-app-proxy-tiresias-branding.md`](docs/decisions/ADR-013-app-proxy-tiresias-branding.md).

## Before opening a PR

Run these locally and fix anything red:

```bash
# Top-level lint + type
pnpm lint
pnpm typecheck

# Per-app where relevant
pnpm --filter platform-web test:run
pnpm --filter @platform/portal typecheck
pnpm --filter platform-web typecheck

# Python side (platform-api)
cd apps/platform-api && uv run pytest tests/platform/  # gated tests
```

CI runs lint + typecheck + a smoke matrix on every PR. The smoke
matrix is documented in
[`docs/operations/smoke-matrix.md`](docs/operations/smoke-matrix.md);
each per-OS surface and each shared route is covered by at least one
probe.

If you change anything in `apps/platform-api/alembic/` or
`packages/database/alembic/`, see
[`docs/operations/alembic-branches.md`](docs/operations/alembic-branches.md)
for the two-tree topology — the SoulAuth tree (`apps/platform-api/`)
and the Agentic OS tree (`packages/database/`) migrate independently.

## Branch naming

We use the wave-based convention that matches our planning docs:

```
feat/wave-<wave-id>-<short-slug>      # ships a wave deliverable
fix/<short-slug>                       # focused bug fix
chore/<short-slug>                     # tooling, CI, scripts, non-user-visible
docs/<short-slug>                      # docs-only change
```

Examples:

```
feat/wave-i-3-contributor-docs
fix/cyber-source-ip-host-cast
chore/portal-drop-residual-tiresias
docs/auth-model-rewrite
```

Wave IDs come from the planning tree at `Z:/_planning/` (internal).
External contributors do not need to touch waves — `fix/`, `docs/`,
and `chore/` prefixes work fine.

## Commits

We use **conventional commits**:

```
<type>(<scope>): <subject>

<body — what changed and why, wrap at 72 cols>

<footer — refs to issues, breaking change notices, co-authors>
```

`type` is one of:

- `feat` — new feature
- `fix` — bug fix
- `chore` — tooling / build / non-user-visible
- `docs` — documentation only
- `refactor` — code change without behavior change
- `test` — adds or fixes tests
- `perf` — performance-only change

`scope` is the area touched, often a directory or feature name:
`platform-api`, `portal`, `agentic-os`, `cyber`, `arch`,
`contributor-docs`, etc.

Examples from recent history:

```
docs(self-host): Wave I.1 — Pantheon self-hoster documentation refresh
feat(platform-api,ci): W-J.1 — Pantheon-built tiresias-proxy
chore(security): scrub committed secrets + add gitleaks
fix(cyber): W-G.1 — cast source_ip via host() for IOC matching
```

We do **not** use AI-assistant attribution lines in commits. Co-authors
(human) are welcome and follow the standard `Co-Authored-By:` trailer.

## Pull request description

A good PR body has three things:

1. **What changed** — bullet list scoped to the diff. Don't restate
   the title; expand on the moving pieces.
2. **Why** — the motivating problem or wave deliverable. Link to the
   audit doc, the ADR, or the issue this closes.
3. **How to verify** — what reviewers should run locally to
   sanity-check. Even one curl command beats nothing.

Example template:

```markdown
## Summary
- bullet 1
- bullet 2
- bullet 3

## Context
Closes #XXX. Part of Wave I.3 — contributor docs pass.

## Verification
- pnpm --filter @platform/portal typecheck   # passes
- pnpm lint                                   # passes
- manual: visit /dashboard/docs, confirm no tier-lock UI renders
```

## Finding work

- **Issues** — open issues on `salucallc/pantheon` are fair game.
  Comment "I'll take this" before starting on anything non-trivial so
  we can avoid duplicate effort.
- **Waves** — Pantheon ships in roughly-weekly waves, sequenced in
  `Z:/_planning/` (internal). Each wave has a top-level deliverable;
  PRs against a wave land on `main` once CI greens.
- **Audit follow-ups** — many open contributor tasks come from the
  doc audit at `Z:/_planning/WAVE_I_DOC_AUDIT.md`. The audit
  catalogues 181 docs by classification and is the source-of-truth
  for what is stale vs fresh.

## What lives where (cheat sheet)

| If you want to… | Look at… |
|---|---|
| Add a new Agentic OS module | [`docs/architecture/agentic-os.md`](docs/architecture/agentic-os.md), [`ADR-005`](docs/decisions/ADR-005-agentic-os-module-registry.md) |
| Add a route under `/dashboard/<slug>/...` | `apps/platform-web/src/app/(dashboard)/dashboard/<slug>/` |
| Add an Alembic migration | [`docs/operations/alembic-branches.md`](docs/operations/alembic-branches.md) |
| Touch the auth surface | [`docs/security/auth-model.md`](docs/security/auth-model.md), [`docs/operations/soulauth-integration.md`](docs/operations/soulauth-integration.md) |
| Add or change an ADR | [`docs/decisions/`](docs/decisions/) (numbered sequentially; supersession via header, never by editing the old body) |
| Add a CI smoke probe | [`docs/operations/smoke-matrix.md`](docs/operations/smoke-matrix.md) |
| Wire a per-tenant BYOK provider key | [`docs/operations/byok-provider-keys.md`](docs/operations/byok-provider-keys.md) |
| Import an `agent.yaml` | [`docs/operations/agents-platform-quickstart.md`](docs/operations/agents-platform-quickstart.md), [`apps/platform-api/src/agents/agent_yaml_schema.md`](apps/platform-api/src/agents/agent_yaml_schema.md) |
| Flip the agents store between LocalPg and Supabase | [`docs/operations/store-adapter-config.md`](docs/operations/store-adapter-config.md), [`docs/architecture/store-adapters.md`](docs/architecture/store-adapters.md) |

## What NOT to do

- Do not rename the `tiresias` Python namespace or the
  `tiresias-proxy` service — they are code-namespace literals.
- Do not rebrand `apps/platform-app-proxy/` — the App Proxy stays
  Tiresias under the Pantheon umbrella ([ADR-013](docs/decisions/ADR-013-app-proxy-tiresias-branding.md)).
- Do not configure or document `@platform/auth` as the production
  auth path — SoulAuth federated (bcrypt) is production;
  `@platform/auth` (Argon2id) is legacy / dead code.
  ([ADR-012](docs/decisions/ADR-012-soulauth-federated.md),
  [`docs/security/auth-model.md`](docs/security/auth-model.md))
- Do not re-introduce tier gating in user-visible docs surfaces.
  Pantheon is local-first OSS with no tier gating by default
  ([ADR-011](docs/decisions/ADR-011-pantheon-rename.md)).
- Do not add ADRs by editing existing ADR bodies. ADRs are
  historical records — supersede them with a header, then write a
  new ADR.

## License

Pantheon is MIT-licensed except where otherwise noted (the Sigma
ruleset under `infrastructure/rules/` is Apache 2.0; vendored
upstream services keep their own licenses). All contributions are
accepted under MIT unless the file you are editing carries a
different license header.
