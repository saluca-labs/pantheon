# Alembic Migration Topology

> Status: stable as of platform/unification-v2 (May 2026)

This repo contains **two independent Alembic histories** living in two
trees. They share one Postgres database in dev/prod but are versioned
separately because they describe disjoint concerns. Understanding
which tree owns which tables avoids accidental conflicts when adding
new migrations.

## TL;DR

| Tree | Schema concern | Branch label | Tables |
| ---- | -------------- | ------------ | ------ |
| `packages/database/alembic/` | Local-auth canonical schema (the `@platform/auth` Postgres contract) | `auth` | `users`, `password_credentials`, `sessions`, `password_reset_tokens`, `audit_events`, `organizations`, `memberships` |
| `apps/platform-api/alembic/` | SoulAuth core domain (tenants, soulkeys, policy cache, billing, contracts, detection, etc.) | _(default unlabeled chain)_ | `_soul_users`, `_soul_tenants`, `_soul_keys`, `_policy_cache`, `_audit_log`, `licenses`, `partners`, `siem_connectors`, … |

The two histories never cross-reference: each has its own `Revises:`
chain rooted at its own `0001_*.py`.

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
packages/database/alembic/                  apps/platform-api/alembic/
└── 0001_local_auth (branch: "auth")        ├── 0001_initial_schema
                                            ├── 0002_add_waitlist_table
                                            ├── 0002_mssp_tenant_hierarchy
                                            ├── 0003_add_aletheia_cot_tables
                                            ├── 0004_audit_prev_hash_column
                                            ├── 0005_oidc_sso
                                            ├── 0006_local_auth      ← *adds password_hash to _soul_users*
                                            ├── 0007_standardize_metadata_column
                                            ├── ...
                                            └── 0033_+ (extending)
```

Notes:

* `packages/database/alembic/versions/0001_local_auth.py` carries
  `branch_labels = ("auth",)` so future revisions can be added under the
  same independent branch via `alembic revision --head=auth ...`.
* The platform-api chain is unlabeled — it is the default head for that
  config. The two `0006_local_auth` and `0001_local_auth` files are
  unrelated; the platform-api one only adds `password_hash` and
  `auth_provider` columns to the legacy `_soul_users` table.

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

* **Local-auth tables** (`users`, `sessions`, `password_credentials`, …):
  ```bash
  cd packages/database
  alembic revision --head=auth -m "describe change"
  ```

* **SoulAuth / platform-api domain** (anything `_soul_*`, billing,
  contracts, detection, partners, siem, …):
  ```bash
  cd apps/platform-api
  alembic revision -m "describe change"
  ```

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
admin. Two equivalent scripts are provided so you can pick the runtime
already installed on your host:

```bash
# Node / TypeScript
DATABASE_URL=postgres://platform:platform@localhost:5432/platform \
    npx tsx scripts/seed-admin.ts

# Python
DATABASE_URL=postgres://platform:platform@localhost:5432/platform \
    python scripts/seed-admin.py
```

Both refuse to run when `NODE_ENV=production` / `ENVIRONMENT=production`
and print the generated password exactly once on success.
