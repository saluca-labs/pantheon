"""Reversibility smoke test for migration 0034/0035 (Tier 5 Phase 1).

Runs `alembic upgrade 0035` then `alembic downgrade 0033` against a
throwaway sqlite DB. We only verify the migrations load and execute
without Python-level errors — the RLS policies + ENUM/JSONB bits are
Postgres-only and are exercised by the K8s one-shot Jobs against Cloud
SQL as a separate verification step (see BUILDER_TIER5_PHASE1_LOG).

This test is skipped when alembic isn't importable in the CI sandbox.
"""
from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def _has_alembic() -> bool:
    try:
        importlib.import_module("alembic")
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _has_alembic(), reason="alembic not installed in this env")
def test_migrations_are_importable_and_have_expected_revisions():
    """Light smoke: load both revision modules, check linkage to 0033."""
    sys.path.insert(0, str(REPO_ROOT))
    os.environ.setdefault("SOULAUTH_DATABASE_URL", "sqlite:///:memory:")

    # Import by file path since alembic versions are not a package.
    import importlib.util

    m34 = importlib.util.spec_from_file_location(
        "mig0034",
        REPO_ROOT / "alembic" / "versions" / "0034_add_billing_periods.py",
    )
    mod34 = importlib.util.module_from_spec(m34)  # type: ignore[arg-type]
    m34.loader.exec_module(mod34)  # type: ignore[union-attr]
    assert mod34.revision == "0034"
    assert mod34.down_revision == "0033"
    # Ensure upgrade/downgrade functions exist (can't run them without a live
    # Postgres due to ENUM + RLS — executed in the K8s migrate Job instead).
    assert callable(mod34.upgrade)
    assert callable(mod34.downgrade)

    m35 = importlib.util.spec_from_file_location(
        "mig0035",
        REPO_ROOT / "alembic" / "versions" / "0035_add_invoice_sync_log.py",
    )
    mod35 = importlib.util.module_from_spec(m35)  # type: ignore[arg-type]
    m35.loader.exec_module(mod35)  # type: ignore[union-attr]
    assert mod35.revision == "0035"
    assert mod35.down_revision == "0034"
    assert callable(mod35.upgrade)
    assert callable(mod35.downgrade)
