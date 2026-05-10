#!/usr/bin/env python3
"""Seed admin user for the SoulAuth login table (`_soul_users`).

Writes directly to the same tables the running soulauth login handler reads
from, so the seeded admin can actually log in via POST /v1/auth/local/login.

Schema targeted (apps/platform-api/alembic/versions/0005_oidc_sso.py +
0006_local_auth.py + 0019_team_rbac.py + 0036_add_mfa_credentials_and_auditor_role.py):
    _soul_tenants      — parent of _soul_users; one is created if none exist.
    _soul_users        — login row. Required cols for local auth:
                            email, tenant_id, password_hash (bcrypt),
                            auth_provider='local', admin_role='owner',
                            is_account_admin=true, idp_provider='local',
                            idp_sub=<email>, status='active'.

Login handler reference:
    apps/platform-api/src/auth/local_router.py:88-149  (POST /v1/auth/local/login)
        - filters by email, auth_provider LIKE '%local%', status='active'
        - verifies password via bcrypt.checkpw against `password_hash`
        - returns admin_role to the portal
    apps/platform-api/src/auth/local_bootstrap.py     (canonical bootstrap)
        - same column set this script writes
    apps/platform-api/src/teams/router.py:77,89        (account-admin gating)
        - tenant-wide admin actions require is_account_admin=true

Refuses to run when NODE_ENV/ENVIRONMENT is 'production'.

Usage:
    DATABASE_URL=postgresql://platform:platform@localhost:5432/platform \\
        python scripts/seed-admin.py

Environment:
    DATABASE_URL        (required) Postgres URL.
    ADMIN_EMAIL         (default 'admin@local')
    ADMIN_PASSWORD      (default: 32 random hex chars; printed once on success)
    ADMIN_TENANT_SLUG   (default 'default') Used when no tenant exists yet
                        and we need to create one to attach the admin to.
    ADMIN_TENANT_NAME   (default 'Default Tenant')
    ADMIN_TENANT_TIER   (default 'owner') Tier of an auto-created tenant.
    NODE_ENV / ENVIRONMENT — production short-circuits and exits 1.
"""

from __future__ import annotations

import os
import secrets
import sys
import uuid

import bcrypt
import psycopg2


def _hash_password(password: str) -> str:
    """Bcrypt hash — must match local_router._verify_password (bcrypt.checkpw)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _resolve_tenant_id(cur, slug: str, name: str, tier: str) -> str:
    """Return a tenant id, preferring tier='owner', then 'mssp', then any.
    Creates one with the given slug/name/tier if the table is empty.
    Mirrors local_bootstrap._resolve_tenant ordering.
    """
    cur.execute("SELECT id FROM _soul_tenants WHERE tier = 'owner' LIMIT 1")
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute("SELECT id FROM _soul_tenants WHERE tier = 'mssp' LIMIT 1")
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute("SELECT id FROM _soul_tenants LIMIT 1")
    row = cur.fetchone()
    if row:
        return row[0]

    # Empty — create one.
    tenant_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO _soul_tenants (id, name, slug, tier, status)
        VALUES (%s, %s, %s, %s, 'active')
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
        """,
        (tenant_id, name, slug, tier),
    )
    return cur.fetchone()[0]


def main() -> int:
    env = os.environ.get("NODE_ENV") or os.environ.get("ENVIRONMENT") or "development"
    if env == "production":
        print("[seed-admin] Refusing to seed in production. Exiting.", file=sys.stderr)
        return 1

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("[seed-admin] DATABASE_URL is required. Set it in .env", file=sys.stderr)
        return 1

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@local")
    admin_password = os.environ.get("ADMIN_PASSWORD") or secrets.token_hex(16)
    password_supplied = bool(os.environ.get("ADMIN_PASSWORD"))

    tenant_slug = os.environ.get("ADMIN_TENANT_SLUG", "default")
    tenant_name = os.environ.get("ADMIN_TENANT_NAME", "Default Tenant")
    tenant_tier = os.environ.get("ADMIN_TENANT_TIER", "owner")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            try:
                tenant_id = _resolve_tenant_id(cur, tenant_slug, tenant_name, tenant_tier)

                # Look up existing admin in the target tenant.
                cur.execute(
                    "SELECT id FROM _soul_users WHERE email = %s AND tenant_id = %s",
                    (admin_email, tenant_id),
                )
                existing = cur.fetchone()

                hashed = _hash_password(admin_password)

                if existing:
                    user_id = existing[0]
                    cur.execute(
                        """
                        UPDATE _soul_users
                           SET password_hash    = %s,
                               auth_provider    = 'local',
                               admin_role       = 'owner',
                               is_account_admin = TRUE,
                               status           = 'active',
                               idp_provider     = 'local',
                               idp_sub          = %s,
                               display_name     = COALESCE(display_name, 'Administrator'),
                               updated_at       = NOW()
                         WHERE id = %s
                        """,
                        (hashed, admin_email, user_id),
                    )
                    action = "updated"
                else:
                    user_id = str(uuid.uuid4())
                    cur.execute(
                        """
                        INSERT INTO _soul_users (
                            id, tenant_id, email, display_name,
                            password_hash, auth_provider, admin_role,
                            is_account_admin, status, idp_provider, idp_sub
                        )
                        VALUES (
                            %s, %s, %s, 'Administrator',
                            %s, 'local', 'owner',
                            TRUE, 'active', 'local', %s
                        )
                        """,
                        (user_id, tenant_id, admin_email, hashed, admin_email),
                    )
                    action = "created"

                conn.commit()
            except Exception:
                conn.rollback()
                raise

        print(f"[seed-admin] OK Admin user {action}")
        print(f"[seed-admin]   Email:     {admin_email}")
        print(f"[seed-admin]   Tenant ID: {tenant_id}")
        print(f"[seed-admin]   User ID:   {user_id}")
        if not password_supplied or action == "created":
            print(f"[seed-admin]   Password:  {admin_password}")
            print("[seed-admin]   Save this password — it will not be shown again.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
