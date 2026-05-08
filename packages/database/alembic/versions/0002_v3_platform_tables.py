"""Add v3 platform infrastructure tables: _platform_jobs, _platform_password_reset_tokens, _platform_email_verification_tokens.

Revision ID: 0002_v3_platform_tables
Revises: 0001_local_auth
Create Date: 2026-05-07

These tables back the platform-api worker queue and the @platform/auth
password-reset / email-verification flows added in unification-v3.

Both the worker (`apps/platform-api/src/worker.py`) and the auth package
(`packages/auth/python/platform_auth/tokens.py`) ship `CREATE TABLE IF NOT
EXISTS` bootstrap DDL so first-boot still works without alembic; this
migration is the canonical declaration of the same schema and is itself
idempotent (uses ``IF NOT EXISTS`` guards via ``checkfirst``-friendly
``op.execute`` so it can be applied to a database where the worker or
auth package already created the tables lazily).

This revision extends the ``auth`` branch defined in 0001_local_auth.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0002_v3_platform_tables"
down_revision: Union[str, None] = "0001_local_auth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Forward DDL (idempotent — safe against worker/auth lazy bootstrap) ────

_UPGRADE_SQL = """
-- Worker job queue ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS _platform_jobs (
    id UUID PRIMARY KEY,
    kind TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS _platform_jobs_status_run_after_idx
    ON _platform_jobs (status, run_after);

-- Password-reset tokens (hash-only storage) ---------------------------------
CREATE TABLE IF NOT EXISTS _platform_password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS _platform_password_reset_tokens_user_id_idx
    ON _platform_password_reset_tokens (user_id);

-- Email-verification tokens (hash-only storage) -----------------------------
CREATE TABLE IF NOT EXISTS _platform_email_verification_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS _platform_email_verification_tokens_user_id_idx
    ON _platform_email_verification_tokens (user_id);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS _platform_email_verification_tokens_user_id_idx;
DROP TABLE IF EXISTS _platform_email_verification_tokens;
DROP INDEX IF EXISTS _platform_password_reset_tokens_user_id_idx;
DROP TABLE IF EXISTS _platform_password_reset_tokens;
DROP INDEX IF EXISTS _platform_jobs_status_run_after_idx;
DROP TABLE IF EXISTS _platform_jobs;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
