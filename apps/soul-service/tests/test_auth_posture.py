"""
Unit tests for soul-service's auth-posture resolution.

These cover the fail-closed-in-production contract added to pantheon_entry:
a missing SOUL_SERVICE_KEY must REFUSE TO START in production and only
fall back to fail-open in development. This mirrors the sibling
memory-service, which exits on a missing key in production.

The function under test is pure, so these run without FastAPI, uvicorn, or
the vendored soul package beyond the one-time module import.
"""

import os
import sys

import pytest

# Make pantheon_entry importable (it lives one directory up from tests/).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pantheon_entry import InsecureSoulConfigError, resolve_auth_posture


def test_key_set_enforces_regardless_of_env():
    assert resolve_auth_posture("s3cret", "development") == "enforce"
    assert resolve_auth_posture("s3cret", "production") == "enforce"


def test_no_key_in_development_fails_open():
    assert resolve_auth_posture("", "development") == "fail-open"


def test_no_key_in_production_refuses_to_start():
    with pytest.raises(InsecureSoulConfigError):
        resolve_auth_posture("", "production")


def test_no_key_in_production_error_is_actionable():
    with pytest.raises(InsecureSoulConfigError) as exc:
        resolve_auth_posture("", "production")
    msg = str(exc.value)
    assert "SOUL_SERVICE_KEY" in msg
    assert "production" in msg


def test_non_production_envs_fail_open_like_memory_service():
    # Only the exact env "production" is gated, matching memory-service's
    # NODE_ENV === "production" check. Other envs are treated as non-prod.
    assert resolve_auth_posture("", "staging") == "fail-open"
    assert resolve_auth_posture("", "") == "fail-open"
