# Runtime Matrix

| Component | Language | Framework | Database | Cache | Deploy Target | Container Base |
|-----------|----------|-----------|----------|-------|---------------|----------------|
| `apps/platform-web` | TypeScript / Node 22 | Next.js 16 | PostgreSQL 16 (via `pg`) | None (in-memory rate limit) | Docker / Vercel-compatible | `node:22-alpine` |
| `apps/platform-api` | Python 3.11 | FastAPI + Uvicorn | PostgreSQL 16 (asyncpg / SQLAlchemy async) | Optional Redis 7 | Docker | `python:3.11-slim` |
| `apps/platform-app-proxy` | Python 3.12 | FastAPI | PostgreSQL 16 | None | Docker | `python:3.12-slim` |
| `apps/platform-sovereign` | Python 3.11 | FastAPI | PostgreSQL 16 | None | Docker | `python:3.11-slim` |
| `packages/auth` (TS) | TypeScript | — | PostgreSQL 16 (peer dep: `pg`) | — | Compiled to dist/ | N/A (library) |
| `packages/auth` (Python) | Python 3.11 | FastAPI (peer) | PostgreSQL 16 (SQLAlchemy async) | — | Installed as editable | N/A (library) |
| `packages/memory` | TypeScript | — | SQLite (better-sqlite3) + optional PostgreSQL | — | Compiled to dist/ | N/A (library) |
| `packages/config` (TS) | TypeScript | — | — | — | Compiled to dist/ | N/A (library) |
| `packages/config` (Python) | Python 3.11 | pydantic-settings | — | — | Installed as editable | N/A (library) |
| `packages/observability` (TS) | TypeScript | pino | — | — | Compiled to dist/ | N/A (library) |
| `packages/observability` (Python) | Python 3.11 | structlog | — | — | Installed as editable | N/A (library) |
| `packages/database` | Python 3.11 | Alembic | PostgreSQL 16 | — | CLI migration tool | N/A |
| `infrastructure/grafana` | — | Grafana + Prometheus + Loki | — | — | Docker Compose | Official images |
| `infrastructure/monitor` | Python | Custom | — | — | Docker | python:3.x-slim |
| `infrastructure/enforcement` | Python | — | — | — | Docker | python:3.x-slim |

## Notes

- All TypeScript packages target ES2022 / NodeNext modules.
- Python services use `asyncpg` driver for async DB access; Alembic uses `psycopg2-binary` for synchronous migrations.
- Redis is optional in the default profile; it becomes required in the `full` profile for the worker service.
- `packages/memory` uses SQLite by default for local development; PostgreSQL with `pgvector` or `sqlite-vec` for production.
