"""Unit tests for src/tiresias/routers/decrypt_router.py
(Tier 4 Piece A, chunk A2).

Strategy: invoke the endpoint function directly with a crafted Request
and heavily mock the downstream DB + envelope layer. This gives us
deterministic branch coverage (happy, each denial, fail-closed audit
write failure) without spinning FastAPI / Postgres.
"""
from __future__ import annotations

import os
import time
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi import HTTPException

# Must be set BEFORE importing the router so env-gated code picks them up.
os.environ["DECRYPT_ENDPOINT_ENABLED"] = "true"
os.environ["DECRYPT_ENFORCE_MFA"] = "true"
os.environ["STEPUP_JWT_SIGNING_KEY"] = "test-signing-key-HS256-0123456789abcdef"
os.environ["STEPUP_JWT_ALGORITHM"] = "HS256"

from src.tiresias.routers import decrypt_router as dr  # noqa: E402


TENANT_ID = "11111111-1111-1111-1111-111111111111"
AUDIT_ID = "22222222-2222-2222-2222-222222222222"
DEK_ID = "33333333-3333-3333-3333-333333333333"
CONTENT_ID = "44444444-4444-4444-4444-444444444444"
ACTOR_ID = uuid.UUID("55555555-5555-5555-5555-555555555555")


def _build_request(
    role: str | None = "auditor",
    soulkey: object | None = None,
    stepup_token: str | None = None,
) -> MagicMock:
    req = MagicMock()
    # request.state
    state = MagicMock()
    if soulkey is None and role is not None:
        sk = MagicMock()
        sk.id = ACTOR_ID
        sk.tenant_id = TENANT_ID
        soulkey = sk
    state.rbac_soulkey = soulkey
    state.rbac_role = role
    req.state = state

    # request.headers behaves like a case-insensitive mapping; implement .get
    headers: dict[str, str] = {}
    if stepup_token is not None:
        headers["X-Stepup-Token"] = stepup_token
    req.headers.get = lambda k, default=None: headers.get(k, headers.get(k.lower(), headers.get(k.title(), default)))
    return req


def _make_token(scope: str = "decrypt", expires_in: int = 60, subject_id: str | None = None) -> tuple[str, str]:
    jti = str(uuid.uuid4())
    claims = {
        "sub": subject_id or str(ACTOR_ID),
        "subject_type": "soulkey",
        "scope": scope,
        "jti": jti,
        "iat": int(time.time()),
        "exp": int(time.time()) + expires_in,
    }
    tok = jwt.encode(claims, os.environ["STEPUP_JWT_SIGNING_KEY"], algorithm="HS256")
    if isinstance(tok, bytes):
        tok = tok.decode()
    return tok, jti


@pytest.fixture(autouse=True)
def _enable_endpoint():
    # Ensure every test sees the endpoint as enabled.
    os.environ["DECRYPT_ENDPOINT_ENABLED"] = "true"
    os.environ["DECRYPT_ENFORCE_MFA"] = "true"
    yield


def _install_backend_mocks(
    monkeypatch,
    stepup_update_jti=AUDIT_ID,  # non-None => nonce marked used
    audit_row=(AUDIT_ID, TENANT_ID, {"dek_id": DEK_ID}, "trace"),
    content_row=(CONTENT_ID, b"CIPHERTEXT", b"NONCE12BYTES", b"TAG16BYTES123456", DEK_ID),
    audit_write_raises: Exception | None = None,
):
    """Pre-populate sys.modules with fake tiresias.proxy.app / storage.engine
    modules so the router's lazy imports resolve to our mocks without
    importing the real proxy app (which has heavy side-effects / external
    deps unavailable in unit-test env).
    """
    import sys
    import types

    mock_settings = MagicMock()
    mock_settings.mode = "saas"
    mock_settings.data_root = "/data"

    class _FakeEngine:
        pass

    fake_engine = _FakeEngine()

    envelope_mock = MagicMock()
    envelope_mock.get_or_create_dek = AsyncMock(return_value=b"\x00" * 32)
    envelope_mock.decrypt = AsyncMock(return_value="DECRYPTED_PLAINTEXT")

    # --- Build fake tiresias.proxy.app module
    fake_app = types.ModuleType("tiresias.proxy.app")
    fake_app.get_settings = MagicMock(return_value=mock_settings)
    fake_app.get_envelope = MagicMock(return_value=envelope_mock)

    # --- Build fake tiresias.storage.engine module
    fake_engine_mod = types.ModuleType("tiresias.storage.engine")
    fake_engine_mod.get_engine = AsyncMock(return_value=fake_engine)
    fake_engine_mod.set_tenant_context = AsyncMock()

    # --- Parent package stubs so dotted imports resolve
    for pkg_name in ("tiresias", "tiresias.proxy", "tiresias.storage"):
        if pkg_name not in sys.modules:
            monkeypatch.setitem(sys.modules, pkg_name, types.ModuleType(pkg_name))

    monkeypatch.setitem(sys.modules, "tiresias.proxy.app", fake_app)
    monkeypatch.setitem(sys.modules, "tiresias.storage.engine", fake_engine_mod)

    # AsyncSession: stub the context-manager to yield our mock session.
    execute_call_count = {"n": 0}

    async def session_execute(stmt, params=None):
        execute_call_count["n"] += 1
        sql = str(stmt)
        result = MagicMock()
        if "UPDATE _mfa_stepup_nonces" in sql:
            result.first = MagicMock(
                return_value=(stepup_update_jti,) if stepup_update_jti else None
            )
        elif "FROM _security_audit" in sql and "WHERE id" in sql:
            result.first = MagicMock(return_value=audit_row)
        elif "FROM aletheia_cot_content" in sql:
            result.first = MagicMock(return_value=content_row)
        elif "FROM _security_audit" in sql and "ORDER BY id DESC" in sql:
            # prev_hash lookup for the sync audit write
            result.first = MagicMock(return_value=None)
        elif "INSERT INTO _security_audit" in sql:
            if audit_write_raises:
                raise audit_write_raises
            result.first = MagicMock(return_value=None)
        else:
            result.first = MagicMock(return_value=None)
        return result

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(side_effect=session_execute)
    mock_session.commit = AsyncMock()

    class _FakeAsyncSessionCtx:
        def __init__(self, *_a, **_kw):
            pass
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(
        "src.tiresias.routers.decrypt_router.AsyncSession",
        _FakeAsyncSessionCtx,
        raising=True,
    )
    return mock_session


@pytest.mark.asyncio
async def test_endpoint_dark_when_feature_flag_disabled(monkeypatch):
    monkeypatch.setenv("DECRYPT_ENDPOINT_ENABLED", "false")
    req = _build_request()
    with pytest.raises(HTTPException) as exc:
        await dr.decrypt_audit_row(AUDIT_ID, req)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_missing_auth_raises_401(monkeypatch):
    _install_backend_mocks(monkeypatch)
    req = _build_request(role=None, soulkey=None)
    with pytest.raises(HTTPException) as exc:
        await dr.decrypt_audit_row(AUDIT_ID, req)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_non_auditor_role_raises_403(monkeypatch):
    _install_backend_mocks(monkeypatch)
    req = _build_request(role="admin")
    with pytest.raises(HTTPException) as exc:
        await dr.decrypt_audit_row(AUDIT_ID, req)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_missing_stepup_header_raises_401(monkeypatch):
    _install_backend_mocks(monkeypatch)
    req = _build_request(role="auditor", stepup_token=None)
    with pytest.raises(HTTPException) as exc:
        await dr.decrypt_audit_row(AUDIT_ID, req)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_expired_stepup_raises_401(monkeypatch):
    _install_backend_mocks(monkeypatch)
    tok, _ = _make_token(expires_in=-10)
    req = _build_request(role="auditor", stepup_token=tok)
    with pytest.raises(HTTPException) as exc:
        await dr.decrypt_audit_row(AUDIT_ID, req)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_replayed_stepup_raises_401(monkeypatch):
    # UPDATE returns no rows => replay
    _install_backend_mocks(monkeypatch, stepup_update_jti=None)
    tok, _ = _make_token()
    req = _build_request(role="auditor", stepup_token=tok)
    with pytest.raises(HTTPException) as exc:
        await dr.decrypt_audit_row(AUDIT_ID, req)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_rls_blocked_audit_row_returns_404(monkeypatch):
    _install_backend_mocks(monkeypatch, audit_row=None)
    tok, _ = _make_token()
    req = _build_request(role="auditor", stepup_token=tok)
    with pytest.raises(HTTPException) as exc:
        await dr.decrypt_audit_row(AUDIT_ID, req)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_happy_path_returns_decrypted(monkeypatch):
    _install_backend_mocks(monkeypatch)
    tok, jti = _make_token()
    req = _build_request(role="auditor", stepup_token=tok)
    resp = await dr.decrypt_audit_row(AUDIT_ID, req)
    assert resp["audit_id"] == AUDIT_ID
    assert resp["dek_id"] == DEK_ID
    assert resp["content_id"] == CONTENT_ID
    assert resp["plaintext"] == "DECRYPTED_PLAINTEXT"
    assert resp["stepup_jti"] == jti


@pytest.mark.asyncio
async def test_audit_write_failure_is_fail_closed(monkeypatch):
    _install_backend_mocks(
        monkeypatch,
        audit_write_raises=RuntimeError("simulated db write failure"),
    )
    tok, _ = _make_token()
    req = _build_request(role="auditor", stepup_token=tok)
    with pytest.raises(HTTPException) as exc:
        await dr.decrypt_audit_row(AUDIT_ID, req)
    assert exc.value.status_code == 503
    assert "audit_write_failed" in str(exc.value.detail)
