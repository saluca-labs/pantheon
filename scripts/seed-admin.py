#!/usr/bin/env python3
"""Seed admin user for local development (Python equivalent of seed-admin.ts).

Mirrors scripts/seed-admin.ts so backend services that already have the
Python toolchain can bootstrap an admin user without a Node.js runtime.

Refuses to run when NODE_ENV/ENVIRONMENT is 'production'.

Usage:
    DATABASE_URL=postgresql://platform:platform@localhost:5432/platform \\
        python scripts/seed-admin.py

Environment:
    DATABASE_URL    (required) Postgres URL.
    ADMIN_EMAIL     (default 'admin@local')
    ADMIN_PASSWORD  (default: 32 random hex chars; printed once on success)
    NODE_ENV / ENVIRONMENT — production short-circuits and exits 1.
"""

from __future__ import annotations

import os
import secrets
import sys

import psycopg2
from platform_auth import hash_password


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

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (admin_email,))
            existing = cur.fetchone()
            if existing:
                print(
                    f"[seed-admin] Admin user {admin_email} already exists. Skipping."
                )
                return 0

            hashed = hash_password(admin_password)

            try:
                cur.execute(
                    """
                    INSERT INTO users (email, display_name, email_verified)
                    VALUES (%s, 'Admin', true)
                    RETURNING id
                    """,
                    (admin_email,),
                )
                user_id_row = cur.fetchone()
                if not user_id_row:
                    raise RuntimeError("User insert returned no id")
                user_id = user_id_row[0]

                cur.execute(
                    """
                    INSERT INTO password_credentials (user_id, hash)
                    VALUES (%s, %s)
                    """,
                    (user_id, hashed),
                )

                conn.commit()
            except Exception:
                conn.rollback()
                raise

        print("[seed-admin] ✓ Created admin user")
        print(f"[seed-admin]   Email:    {admin_email}")
        print(f"[seed-admin]   Password: {admin_password}")
        print("[seed-admin]   ⚠️  Save this password — it will not be shown again.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
