# platform-api Architecture

> **Redirect.** The canonical architecture document for Pantheon now
> lives at the repo root in
> [`docs/architecture/system-overview.md`](../../docs/architecture/system-overview.md).
> This file used to host a 800-line v3.4.4 description of the
> pre-Pantheon Tiresias enterprise SaaS architecture; that content
> is superseded by the post-WH Pantheon platform shape and has been
> removed.

For per-area drill-downs, see:

- [`docs/architecture/system-overview.md`](../../docs/architecture/system-overview.md) — top-level topology, request flow, component roles
- [`docs/architecture/module-boundaries.md`](../../docs/architecture/module-boundaries.md) — what each app/package owns and must not touch
- [`docs/architecture/agentic-os.md`](../../docs/architecture/agentic-os.md) — Agentic OS layer architecture
- [`docs/architecture/agents-platform.md`](../../docs/architecture/agents-platform.md) — W-H agent platform (CRUD, store adapters, BYOK)
- [`docs/architecture/store-adapters.md`](../../docs/architecture/store-adapters.md) — LocalPg vs Supabase adapter pattern
- [`docs/architecture/audit-log.md`](../../docs/architecture/audit-log.md) — `agos_audit` schema and retention
- [`docs/architecture/feature-flags.md`](../../docs/architecture/feature-flags.md) — per-user feature flags
- [`docs/security/auth-model.md`](../../docs/security/auth-model.md) — SoulAuth federated vs `@platform/auth` legacy
- [`apps/platform-api/src/agents/agent_yaml_schema.md`](src/agents/agent_yaml_schema.md) — canonical `agent.yaml` schema

For platform-api-internal layout (router map, src/ tree), see
[`apps/platform-api/README.md`](README.md).
