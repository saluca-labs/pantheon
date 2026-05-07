"""Unit tests for src/auth/step_up_jwt.py (Tier 4 Piece A, chunk A2).

DB is mocked because the production INSERT/UPDATE use Postgres-specific
casts (`::uuid`, `to_timestamp`) and RLS, which aren't representable in
the SQLite in-memory fixture. We assert behavior at the signature /
claim / replay / scope contract.
"""
from __future__ import annotations

import os
import time
import uuid
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest

os.environ["STEPUP_JWT_SIGNING_KEY"] = "test-signing-key-HS256-0123456789abcdef"
os.environ["STEPUP_JWT_ALGORITHM"] = "HS256"
os.environ["STEPUP_JWT_TTL_SECONDS"] = "60"

from src.auth.step_up_jwt import (  # noqa: E402
    StepUpJWTConfigError,
    StepUpJWTInvalid,
    StepUpJWTReplay,
    StepUpJWTScopeMismatch,
    issue_stepup_jwt,
    validate_stepup_jwt,
)


def _mock_session_with_insert():
    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    return session


def _mock_session_with_update_rows(jti: str | None):
    session = MagicMock()
    session.commit = AsyncMock()

    result = MagicMock()
    # first() returns a row with jti if updated, else None
    result.first = MagicMock(return_value=(jti,) if jti is not None else None)
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.mark.asyncio
async def test_issue_and_validate_happy_path():
    subj_id = str(uuid.uuid4())
    session = _mock_session_with_insert()
    token = await issue_stepup_jwt(session, "soulkey", subj_id, "decrypt")
    assert isinstance(token, str)
    assert session.execute.await_count == 1
    assert session.commit.await_count == 1

    # Validate: simulate UPDATE returning the jti (nonce present + unused)
    decoded = jwt.decode(
        token, os.environ["STEPUP_JWT_SIGNING_KEY"], algorithms=["HS256"]
    )
    jti = decoded["jti"]
    v_session = _mock_session_with_update_rows(jti)
    claims = await validate_stepup_jwt(v_session, token, required_scope="decrypt")
    assert claims.jti == jti
    assert claims.subject_type == "soulkey"
    assert claims.subject_id == subj_id
    assert claims.scope == "decrypt"


@pytest.mark.asyncio
async def test_validate_rejects_replay():
    # Build a valid token but simulate UPDATE returning no rows (already used).
    subj_id = str(uuid.uuid4())
    claims = {
        "sub": subj_id,
        "subject_type": "soulkey",
        "scope": "decrypt",
        "jti": str(uuid.uuid4()),
        "iat": int(time.time()),
        "exp": int(time.time()) + 60,
    }
    token = jwt.encode(claims, os.environ["STEPUP_JWT_SIGNING_KEY"], algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode()

    session = _mock_session_with_update_rows(None)
    with pytest.raises(StepUpJWTReplay):
        await validate_stepup_jwt(session, token, required_scope="decrypt")


@pytest.mark.asyncio
async def test_validate_rejects_expired():
    claims = {
        "sub": str(uuid.uuid4()),
        "subject_type": "soulkey",
        "scope": "decrypt",
        "jti": str(uuid.uuid4()),
        "iat": int(time.time()) - 300,
        "exp": int(time.time()) - 60,
    }
    token = jwt.encode(claims, os.environ["STEPUP_JWT_SIGNING_KEY"], algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode()

    session = _mock_session_with_update_rows("ignored")
    with pytest.raises(StepUpJWTInvalid):
        await validate_stepup_jwt(session, token, required_scope="decrypt")


@pytest.mark.asyncio
async def test_validate_rejects_wrong_scope():
    claims = {
        "sub": str(uuid.uuid4()),
        "subject_type": "soulkey",
        "scope": "some_other_scope",
        "jti": str(uuid.uuid4()),
        "iat": int(time.time()),
        "exp": int(time.time()) + 60,
    }
    token = jwt.encode(claims, os.environ["STEPUP_JWT_SIGNING_KEY"], algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode()

    session = _mock_session_with_update_rows("ignored")
    with pytest.raises(StepUpJWTScopeMismatch):
        await validate_stepup_jwt(session, token, required_scope="decrypt")


@pytest.mark.asyncio
async def test_validate_rejects_bad_signature():
    claims = {
        "sub": str(uuid.uuid4()),
        "subject_type": "soulkey",
        "scope": "decrypt",
        "jti": str(uuid.uuid4()),
        "iat": int(time.time()),
        "exp": int(time.time()) + 60,
    }
    token = jwt.encode(claims, "WRONG-KEY-entirely-different-value", algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode()

    session = _mock_session_with_update_rows("ignored")
    with pytest.raises(StepUpJWTInvalid):
        await validate_stepup_jwt(session, token, required_scope="decrypt")


@pytest.mark.asyncio
async def test_validate_rejects_malformed_token():
    session = _mock_session_with_update_rows("ignored")
    with pytest.raises(StepUpJWTInvalid):
        await validate_stepup_jwt(session, "", required_scope="decrypt")
    with pytest.raises(StepUpJWTInvalid):
        await validate_stepup_jwt(session, "not.a.jwt", required_scope="decrypt")


@pytest.mark.asyncio
async def test_issue_rejects_invalid_subject_type():
    session = _mock_session_with_insert()
    with pytest.raises(StepUpJWTInvalid):
        await issue_stepup_jwt(session, "not_a_valid_type", str(uuid.uuid4()))


@pytest.mark.asyncio
async def test_issue_raises_config_error_without_key():
    old_key = os.environ.pop("STEPUP_JWT_SIGNING_KEY", None)
    try:
        session = _mock_session_with_insert()
        with pytest.raises(StepUpJWTConfigError):
            await issue_stepup_jwt(session, "soulkey", str(uuid.uuid4()))
    finally:
        if old_key is not None:
            os.environ["STEPUP_JWT_SIGNING_KEY"] = old_key
