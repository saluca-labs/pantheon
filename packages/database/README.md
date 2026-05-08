# `@platform/database` — Alembic Migration Tree

Owns the **local-auth** migration chain shared by all platform services. Sister tree at `apps/platform-api/alembic/` owns the SoulAuth schema.

License: MIT — internal package, do not publish.

## Why a Separate Tree?

The local-auth schema (users, sessions, audit_events, organizations, memberships, plus every Agentic OS table) is independent of the SoulAuth platform schema. Keeping the trees separate means:

- Each app owns the migrations it actually depends on.
- `platform-web` does not need the SoulAuth Alembic env to run its tests.
- The two trees can be migrated in either order during local bootstrap.

See [docs/operations/alembic-branches.md](../../docs/operations/alembic-branches.md) for the full chain diagram and the ordering rationale.

## Running Migrations

```bash
cd packages/database
python -m alembic upgrade head
```

Or from the repo root:

```bash
pnpm migrate     # runs both alembic trees in order
```

## Migration Conventions

1. **Linear chain, no branches.** New migrations always set `down_revision` to the current head. Naming: `NNNN_<feature>.py`.
2. **Idempotent DDL.** Prefer `CREATE TABLE IF NOT EXISTS` so re-running a migration on a partially applied DB is safe. Existing tables get `ALTER TABLE` rather than `CREATE IF NOT EXISTS` (see `0012_filmmaker_projects.py`).
3. **Agentic OS tables prefixed `agos_`.** Per-OS tables also get the `agos_` prefix (`agos_audit`, `agos_feature_flags`, `agos_maker_*`, `agos_filmmaker_*`, …) so they're easy to grep and to drop together if a teardown is ever needed. See [ADR-005](../../docs/decisions/ADR-005-agentic-os-module-registry.md).
4. **`agos_feature_flags` is opt-out.** Default `enabled = TRUE` for any user/slug pair without a row. See [ADR-007](../../docs/decisions/ADR-007-per-user-feature-flags.md).
5. **Auth migrations are immutable.** `0001_local_auth.py` is the canonical DDL; never edit it after release. Add new auth columns via a follow-up migration.

## Current Chain (head: `0013`)

| Rev | File | Adds |
|-----|------|------|
| 0001 | `0001_local_auth.py` | users, sessions, audit_events, organizations, memberships |
| 0002 | `0002_v3_platform_tables.py` | v3 platform tables |
| 0003 | `0003_agentic_os.py` | `agos_audit`, base Agentic OS tables |
| 0004 | `0004_maker_os.py` | Maker OS tables |
| 0005 | `0005_research_os.py` | Research OS tables |
| 0006 | `0006_secure_dev_os.py` | Secure-Dev OS tables |
| 0007 | `0007_cyber_os.py` | Cyber OS tables |
| 0008 | `0008_filmmaker_os.py` | Filmmaker OS base tables |
| 0009 | `0009_autobiographer_os.py` | Autobiographer OS tables |
| 0010 | `0010_business_os.py` | Business OS tables |
| 0011 | `0011_creator_os.py` | Creator OS tables |
| 0012 | `0012_filmmaker_projects.py` | Filmmaker projects (`ALTER TABLE` form) |
| 0013 | `0013_agos_feature_flags.py` | `agos_feature_flags` (opt-out) |

Authoritative source: `packages/database/alembic/versions/`.

## See Also

- [docs/operations/alembic-branches.md](../../docs/operations/alembic-branches.md) — full chain narrative + dual-tree ordering
- [docs/security/audit-trail.md](../../docs/security/audit-trail.md) — `audit_events` (this tree) vs `agos_audit` (this tree, different audience)
- [docs/architecture/audit-log.md](../../docs/architecture/audit-log.md) — `agos_audit` schema and cursor codec
