# Alembic Migration Topology

> Status: stable as of platform/oasis-rollout (May 2026)

This repo contains **two independent Alembic histories** living in two
trees. They share one Postgres database in dev/prod but are versioned
separately because they describe disjoint concerns. Understanding
which tree owns which tables avoids accidental conflicts when adding
new migrations.

## TL;DR

| Tree | Schema concern | Branch label | Tables |
| ---- | -------------- | ------------ | ------ |
| `packages/database/alembic/` | Local-auth schema + v3 platform infra + **Agentic OS schemas** (all `agos_*` tables) | `auth` | `users`, `password_credentials`, `sessions`, `password_reset_tokens`, `audit_events`, `organizations`, `memberships`, `_platform_jobs`, `_platform_password_reset_tokens`, `_platform_email_verification_tokens`, **`agos_audit`**, **`agos_health_*`**, **`agos_maker_*`**, **`agos_research_*`**, **`agos_securedev_*`**, **`agos_cyber_*`**, **`agos_filmmaker_*`**, **`agos_autobiographer_*`**, **`agos_business_*`**, **`agos_creator_*`**, **`agos_feature_flags`** |
| `apps/platform-api/alembic/` | SoulAuth core domain (tenants, soulkeys, policy cache, billing, contracts, detection, etc.) | _(default unlabeled chain)_ | `_soul_users`, `_soul_tenants`, `_soul_keys`, `_policy_cache`, `_audit_log`, `licenses`, `partners`, `siem_connectors`, … |

The two histories never cross-reference: each has its own `Revises:`
chain rooted at its own `0001_*.py`.

The Agentic OS layer (introduced May 2026) lives entirely under the
`auth` branch — its tables are owned by `apps/platform-web`, not the
platform-api. See [`docs/architecture/agentic-os.md`](../architecture/agentic-os.md)
for the full layer.

## Why two trees?

Historically `apps/platform-api` (originally SoulAuth) shipped its own
multi-tenant identity model, with tables prefixed `_soul_*` to avoid
clashes with consumer schemas. When local-auth was added in v1, the
new tables (`users`, `password_credentials`, `sessions`, …) were placed
under `@platform/auth` so any backend service can adopt them without
inheriting the SoulAuth domain.

Splitting the migrations also keeps each consumer's deploy story simple:

* services that only need local-auth (e.g. side projects vendoring
  `@platform/auth`) point Alembic at `packages/database/alembic/`
  alone and get a one-revision database.
* the platform-api keeps its long-lived SoulAuth chain (`0001_initial_schema`
  → `0033_*` and counting) in its own folder.

## Branch topology

```
packages/database/alembic/                                apps/platform-api/alembic/
├── 0001_local_auth (branch: "auth")                      ├── 0001_initial_schema
├── 0002_v3_platform_tables                               ├── 0002_add_waitlist_table
├── 0003_agentic_os         ← agos_audit, agos_health_*  ├── 0002_mssp_tenant_hierarchy
├── 0004_maker_os          ← agos_maker_*               ├── 0003_add_aletheia_cot_tables
├── 0005_research_os       ← agos_research_*            ├── 0004_audit_prev_hash_column
├── 0006_secure_dev_os     ← agos_securedev_*           ├── 0005_oidc_sso
├── 0007_cyber_os          ← agos_cyber_*               ├── 0006_local_auth
├── 0008_filmmaker_os      ← agos_filmmaker_*           ├── 0007_standardize_metadata_column
├── 0009_autobiographer_os ← agos_autobiographer_*      ├── ...
├── 0010_business_os       ← agos_business_*            └── 0033_+ (extending)
├── 0011_creator_os        ← agos_creator_*
├── 0012_filmmaker_projects (ALTER TABLE on 0008's table)
└── 0013_agos_feature_flags (head) ← agos_feature_flags
```

Notes:

* `packages/database/alembic/versions/0001_local_auth.py` carries
  `branch_labels = ("auth",)` so future revisions can be added under the
  same independent branch via `alembic revision --head=auth ...`.
* `0002_v3_platform_tables.py` extends the `auth` chain with three v3
  platform-infra tables. Idempotent (`CREATE TABLE IF NOT EXISTS`).
* `0003_agentic_os` introduces the cross-OS `agos_audit` table plus the
  first vertical (Health). Subsequent revisions `0004`..`0011` each add
  one OS's primary tables.
* `0012_filmmaker_projects` is an **ALTER TABLE** on the `agos_filmmaker_projects`
  table created in 0008, adding `name`, `description`, `status`, `tags`
  columns and migrating data from the original `title`/`synopsis`.
  The earlier 0012 (a `CREATE IF NOT EXISTS`) was rewritten when it was
  found to silently no-op on existing databases.
* `0013_agos_feature_flags` is the **current head** and adds the
  per-user feature-flag table for [ADR-007](../decisions/ADR-007-per-user-feature-flags.md).
  Idempotent and ships zero rows.
* All `agos_*` tables are owned by `apps/platform-web`. The platform-api
  must not create or migrate them. See
  [`docs/architecture/module-boundaries.md`](../architecture/module-boundaries.md).
* The platform-api chain is unlabeled — it is the default head for that
  config. The `0006_local_auth` revision in *that* tree is unrelated to
  `packages/database`'s `0001_local_auth`; the platform-api one only adds
  `password_hash` and `auth_provider` columns to the legacy `_soul_users`
  table.

## Running migrations

Each tree has its own `alembic.ini`. Always `cd` into the tree first:

```bash
# Local-auth schema (run once for any service consuming @platform/auth)
cd packages/database
alembic upgrade head

# SoulAuth / platform-api domain
cd apps/platform-api
alembic upgrade head
```

Both `env.py` files load `DATABASE_URL` from environment, so the same
Postgres database can be the target for both upgrades. In dev,
`docker compose up db` followed by both upgrades produces the full
schema.

## Adding a new migration

* **Local-auth tables** (`users`, `sessions`, `password_credentials`, …)
  **or any Agentic OS table** (`agos_*`):
  ```bash
  cd packages/database
  alembic revision --head=auth -m "describe change"
  ```
  Make every DDL idempotent (`CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, etc.). The dual-tree alembic CI job
  re-runs `upgrade head` to verify idempotency.

* **SoulAuth / platform-api domain** (anything `_soul_*`, billing,
  contracts, detection, partners, siem, …):
  ```bash
  cd apps/platform-api
  alembic revision -m "describe change"
  ```

Before adding a new revision, run `alembic heads` in the target tree to
confirm the current head — a parallel revision (two files with the same
`down_revision`) breaks the chain and fails the CI alembic job.

Never edit a file across trees. If a change spans both schemas (rare),
land two PRs — one per tree — and call out the deploy ordering in the
PR description.

## Production deploy order

1. Apply `packages/database` migrations first (creates / extends the
   local-auth tables).
2. Apply `apps/platform-api` migrations second (the SoulAuth domain
   may reference `users.id` from FKs; if so the user table must exist
   already).

Both upgrade commands are idempotent and safe to re-run.

## Seeding an admin user

After both upgrade chains finish on a fresh database, seed the local
admin via the canonical Python seeder:

```bash
DATABASE_URL=postgres://platform:platform@localhost:5432/platform \
    ./.venv/bin/python scripts/seed-admin.py
```

The seeder refuses to run when `NODE_ENV=production` /
`ENVIRONMENT=production` and prints the generated password exactly once
on success. Python is the single canonical implementation so argon2
password hashing matches the Python auth system — no risk of drift
between two parallel implementations.
