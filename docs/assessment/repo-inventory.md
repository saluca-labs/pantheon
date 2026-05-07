# Repository Inventory

Generated as part of the `platform/unification-v1` consolidation.

## Apps

| Path | Former Name | Purpose | Status | Runtime | Key Dependencies | Fate |
|------|-------------|---------|--------|---------|-----------------|------|
| `apps/platform-api` | `tiresias` | Core FastAPI backend: SoulAuth agent identity, SoulGate/SoulWatch policy enforcement, billing, portal, RBAC, SIEM, audit | Active | Python 3.11 / FastAPI | SQLAlchemy, Alembic, Pydantic, argon2-cffi | Keep — primary backend |
| `apps/platform-web` | `tiresias-web` | Next.js 16 BFF + Dashboard UI | Active | Node 22 / Next.js | React 19, TanStack Query, Tailwind CSS | Keep — primary frontend |
| `apps/platform-app-proxy` | `tiresias-app-proxy` | Agent-facing reverse proxy with policy enforcement | Active | Python 3.12 / FastAPI | Cedar SDK, platform-api | Keep — full profile |
| `apps/platform-sovereign` | `tiresias-sovereign` | Sovereign/on-premises deployment variant | Active | Python 3.11 | FastAPI | Keep — full profile |

## Infrastructure Services

| Path | Former Name | Purpose | Status | Runtime | Fate |
|------|-------------|---------|--------|---------|------|
| `infrastructure/grafana` | `tiresias-grafana` | Grafana + Prometheus + Loki + Promtail monitoring stack | Active | Docker Compose | Keep — ops monitoring |
| `infrastructure/incident-controller` | `tiresias-incident-controller` | Automated incident response controller | Active | Python | Keep — ops |
| `infrastructure/monitor` | `tiresias-monitor` | External availability monitoring | Active | Python | Keep — ops |
| `infrastructure/pentest` | `tiresias-pentest` | Automated penetration testing suite | Active | Python | Keep — security |
| `infrastructure/rules` | `tiresias-rules` | Cedar policy rules and playbooks | Active | Cedar / YAML | Keep — do not modify contents |
| `infrastructure/enforcement` | `tiresias-enforcement` | Policy enforcement point agent | Active | Python | Keep — ops |

## Packages

| Path | Purpose | Status | Runtime | Fate |
|------|---------|--------|---------|------|
| `packages/auth` | Local-auth: Argon2id hashing, Postgres sessions, CSRF, rate limiting | New | TS + Python | Keep |
| `packages/memory` | Agent memory (vendored from elysium @ 758a4a5): topic index, FTS, hybrid vector search | New | Node 22 / TypeScript | Keep — internal only |
| `packages/config` | Zod/Pydantic env validation | New | TS + Python | Keep |
| `packages/types` | Shared TS domain types: User, Session, Role, AuditEvent | New | TypeScript | Keep |
| `packages/observability` | Structured logging (pino/structlog) | New | TS + Python | Keep |
| `packages/database` | Alembic migration tree for local-auth schema | New | Python / Alembic | Keep |

## Archived

| Path | Former Path | Reason |
|------|-------------|--------|
| `archive/cloudbuild/*.yaml` | `tiresias/cloudbuild-*.yaml` | GCP Cloud Build configs, superseded by GitHub Actions CI |
| `archive/dockerfiles/*.bak` | Various | Old Dockerfiles archived before multi-stage replacement |
