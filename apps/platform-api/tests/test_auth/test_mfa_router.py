"""
Tier 4 Piece A chunk A3 - unit tests for src/auth/mfa_router.py.

Tests run against SQLite in-memory. The _mfa_credentials and
_mfa_stepup_nonces tables are NOT part of the ORM (only alembic
0036/0037), so we DDL them inline in a test fixture.
"""
from __future__ import annotations

import base64
import hmac
import hashlib
import os
import struct
import time
import uuid

os.environ.setdefault("SOULAUTH_MODE", "local")
os.environ.setdefault("SOULAUTH_TESTING", "true")
os.environ.setdefault("SOULAUTH_DEBUG", "true")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("MFA_ENROLL_ENABLED", "true")
os.environ.setdefault("MFA_STEPUP_ENABLED", "true")

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from src.database.connection import Base, get_db
from src.database.models import SoulTenant, SoulUser
from src.auth.oidc_session import create_session
from src.auth import mfa_router as mfa_mod


TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


def _totp_now(secret_b32: str) -> str:
    padded = secret_b32 + "=" * (-len(secret_b32) % 8)
    key = base64.b32decode(padded, casefold=True)
    step = int(time.time() // 30)
    msg = struct.pack(">Q", step)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[-1] & 0x0F
    dbc = ((h[o] & 0x7F) << 24) | ((h[o + 1] & 0xFF) << 16) | ((h[o + 2] & 0xFF) << 8) | (h[o + 3] & 0xFF)
    return f"{dbc % 1_000_000:06d}"


@pytest_asyncio.fixture
async def engine_and_sm():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Create MFA tables (alembic-only; we inline DDL for sqlite tests)
        await conn.execute(text(
            "CREATE TABLE _mfa_credentials ("
            "  id TEXT PRIMARY KEY,"
            "  subject_type TEXT NOT NULL,"
            "  subject_id TEXT NOT NULL,"
            "  credential_type TEXT NOT NULL,"
            "  credential_id TEXT,"
            "  public_key BLOB,"
            "  totp_secret_encrypted BLOB,"
            "  aaguid TEXT,"
            "  sign_count BIGINT NOT NULL DEFAULT 0,"
            "  nickname TEXT,"
            "  created_at TIMESTAMP NOT NULL,"
            "  last_used_at TIMESTAMP"
            ")"
        ))
        await conn.execute(text(
            "CREATE TABLE _mfa_stepup_nonces ("
            "  jti TEXT PRIMARY KEY,"
            "  subject_type TEXT NOT NULL,"
            "  subject_id TEXT NOT NULL,"
            "  scope TEXT NOT NULL,"
            "  issued_at TIMESTAMP NOT NULL,"
            "  expires_at TIMESTAMP NOT NULL,"
            "  used_at TIMESTAMP"
            ")"
        ))
    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield engine, sf
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS _mfa_stepup_nonces"))
        await conn.execute(text("DROP TABLE IF EXISTS _mfa_credentials"))
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def app(engine_and_sm):
    _engine, sm = engine_and_sm

    async def _get_db_override():
        async with sm() as session:
            yield session

    a = FastAPI()
    a.include_router(mfa_mod.router)
    a.dependency_overrides[get_db] = _get_db_override
    # Reset in-memory state between test cases
    mfa_mod._enroll_limiter.reset()
    mfa_mod._stepup_limiter.reset()
    mfa_mod._challenge_store.reset()
    return a


async def _make_user(sm, role: str = "admin", email: str | None = None) -> tuple[SoulUser, str]:
    async with sm() as s:
        tenant = SoulTenant(
            id=uuid.uuid4(), name="T", slug=f"t-{uuid.uuid4().hex[:6]}",
            tier="enterprise", status="active",
        )
        s.add(tenant)
        await s.flush()
        user = SoulUser(
            id=uuid.uuid4(), tenant_id=tenant.id,
            email=(email or f"u-{uuid.uuid4().hex[:6]}@example.com"),
            admin_role=role, status="active",
        )
        s.add(user)
        await s.flush()
        raw_token, _sess = await create_session(s, user)
        await s.commit()
        return user, raw_token


async def _auth(client: AsyncClient, token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Happy path: TOTP enrollment
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enroll_totp_happy_path(app, engine_and_sm):
    _e, sm = engine_and_sm
    user, token = await _make_user(sm, role="admin")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/v1/mfa/enroll/start",
            json={"type": "totp", "nickname": "phone"},
            headers=await _auth(c, token),
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["type"] == "totp"
        assert "otpauth://" in j["otpauth_uri"]
        pending = j["pending_state"]
        secret = j["secret_b32"]
        code = _totp_now(secret)

        r2 = await c.post(
            "/v1/mfa/enroll/complete",
            json={"pending_state": pending, "code": code},
            headers=await _auth(c, token),
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["type"] == "totp"

        # Credential now listed
        r3 = await c.get("/v1/mfa/credentials", headers=await _auth(c, token))
        assert r3.status_code == 200
        creds = r3.json()["credentials"]
        assert len(creds) == 1
        assert creds[0]["type"] == "totp"


# ---------------------------------------------------------------------------
# CESO-B2: owner + TOTP rejected
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_owner_totp_rejected(app, engine_and_sm):
    _e, sm = engine_and_sm
    _user, token = await _make_user(sm, role="owner")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/v1/mfa/enroll/start",
            json={"type": "totp"},
            headers=await _auth(c, token),
        )
        assert r.status_code == 403
        body = r.json()
        detail = body.get("detail", body)
        assert detail["error"] == "owner_requires_webauthn"
        assert detail["reason"] == "owner_role_must_use_passkey"


# ---------------------------------------------------------------------------
# Rate limiting: 3 starts in 1 min -> 4th returns 429
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enroll_rate_limit(app, engine_and_sm):
    _e, sm = engine_and_sm
    _user, token = await _make_user(sm, role="admin")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        for i in range(3):
            r = await c.post(
                "/v1/mfa/enroll/start",
                json={"type": "totp"},
                headers=await _auth(c, token),
            )
            assert r.status_code == 200, f"attempt {i}: {r.text}"
        r4 = await c.post(
            "/v1/mfa/enroll/start",
            json={"type": "totp"},
            headers=await _auth(c, token),
        )
        assert r4.status_code == 429
        assert "Retry-After" in r4.headers


# ---------------------------------------------------------------------------
# Stepup happy path (TOTP)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stepup_happy_path_totp(app, engine_and_sm):
    _e, sm = engine_and_sm
    _user, token = await _make_user(sm, role="admin")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        # enroll
        r = await c.post("/v1/mfa/enroll/start", json={"type": "totp"}, headers=await _auth(c, token))
        secret = r.json()["secret_b32"]
        pending = r.json()["pending_state"]
        await c.post(
            "/v1/mfa/enroll/complete",
            json={"pending_state": pending, "code": _totp_now(secret)},
            headers=await _auth(c, token),
        )
        # challenge
        rc = await c.post(
            "/v1/mfa/stepup/challenge",
            json={"scope": "decrypt"},
            headers=await _auth(c, token),
        )
        assert rc.status_code == 200, rc.text
        challenge_id = rc.json()["challenge_id"]
        # verify
        rv = await c.post(
            "/v1/mfa/stepup/verify",
            json={"scope": "decrypt", "challenge_id": challenge_id, "code": _totp_now(secret)},
            headers=await _auth(c, token),
        )
        assert rv.status_code == 200, rv.text
        tok = rv.json()["stepup_token"]
        assert tok.startswith("stub.") or len(tok) > 20
        assert rv.json()["expires_in"] == 60


# ---------------------------------------------------------------------------
# Stepup replay: second verify against the same challenge must fail
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stepup_replay_fails(app, engine_and_sm):
    _e, sm = engine_and_sm
    _user, token = await _make_user(sm, role="admin")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/v1/mfa/enroll/start", json={"type": "totp"}, headers=await _auth(c, token))
        secret = r.json()["secret_b32"]
        pending = r.json()["pending_state"]
        await c.post(
            "/v1/mfa/enroll/complete",
            json={"pending_state": pending, "code": _totp_now(secret)},
            headers=await _auth(c, token),
        )
        rc = await c.post(
            "/v1/mfa/stepup/challenge",
            json={"scope": "decrypt"},
            headers=await _auth(c, token),
        )
        challenge_id = rc.json()["challenge_id"]
        ok = await c.post(
            "/v1/mfa/stepup/verify",
            json={"scope": "decrypt", "challenge_id": challenge_id, "code": _totp_now(secret)},
            headers=await _auth(c, token),
        )
        assert ok.status_code == 200
        replay = await c.post(
            "/v1/mfa/stepup/verify",
            json={"scope": "decrypt", "challenge_id": challenge_id, "code": _totp_now(secret)},
            headers=await _auth(c, token),
        )
        assert replay.status_code == 401


# ---------------------------------------------------------------------------
# Credentials list/delete isolation: user B cannot see user A's creds
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_credentials_list_isolation(app, engine_and_sm):
    _e, sm = engine_and_sm
    _a, tok_a = await _make_user(sm, role="admin", email="a@example.com")
    _b, tok_b = await _make_user(sm, role="admin", email="b@example.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/v1/mfa/enroll/start", json={"type": "totp"}, headers=await _auth(c, tok_a))
        await c.post(
            "/v1/mfa/enroll/complete",
            json={"pending_state": r.json()["pending_state"], "code": _totp_now(r.json()["secret_b32"])},
            headers=await _auth(c, tok_a),
        )
        # A sees 1
        ra = await c.get("/v1/mfa/credentials", headers=await _auth(c, tok_a))
        assert len(ra.json()["credentials"]) == 1
        # B sees 0
        rb = await c.get("/v1/mfa/credentials", headers=await _auth(c, tok_b))
        assert len(rb.json()["credentials"]) == 0


# ---------------------------------------------------------------------------
# Delete last credential for owner -> 403 cannot_remove_last_credential
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_last_credential_owner_forbidden(app, engine_and_sm):
    """
    Owners cannot TOTP enroll, so we seed a webauthn credential directly
    and then attempt delete. We first acquire a mfa_manage stepup via TOTP
    on a second sidecar credential.  Simpler: seed two creds, delete one,
    then attempt the second -> 403.
    """
    _e, sm = engine_and_sm
    user, token = await _make_user(sm, role="owner")

    # Seed one webauthn cred so owner has MFA; then try stepup/delete flow
    async with sm() as s:
        from datetime import datetime, timezone
        await s.execute(text(
            "INSERT INTO _mfa_credentials "
            "(id, subject_type, subject_id, credential_type, credential_id, "
            " public_key, nickname, sign_count, created_at) "
            "VALUES (:id,'soul_user',:sid,'webauthn','cid-1',:pk,'yubikey',0,:ct)"
        ), {
            "id": str(uuid.uuid4()),
            "sid": str(user.id),
            "pk": b"\x01\x02",
            "ct": datetime.now(timezone.utc),
        })
        await s.commit()

    # Get cred id
    async with sm() as s:
        r = await s.execute(text(
            "SELECT id FROM _mfa_credentials WHERE subject_id = :sid"
        ), {"sid": str(user.id)})
        cred_id = str(r.scalar())

    # Build a stepup nonce for scope=mfa_manage directly (simulating
    # a successful prior verify without double-enrolling).
    from datetime import datetime, timedelta, timezone as _tz
    import secrets as _s
    jti = _s.token_urlsafe(16)
    async with sm() as s:
        now = datetime.now(_tz.utc)
        await s.execute(text(
            "INSERT INTO _mfa_stepup_nonces (jti, subject_type, subject_id, scope, issued_at, expires_at) "
            "VALUES (:jti,'soul_user',:sid,'mfa_manage',:iat,:exp)"
        ), {
            "jti": jti, "sid": str(user.id),
            "iat": now, "exp": now + timedelta(seconds=60),
        })
        await s.commit()

    stepup_tok = f"stub.{jti}.mfa_manage"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.delete(
            f"/v1/mfa/credentials/{cred_id}",
            headers={"Authorization": f"Bearer {token}", "X-Stepup-Token": stepup_tok},
        )
        assert r.status_code == 403, r.text
        body = r.json()
        detail = body.get("detail", body)
        assert detail["error"] == "cannot_remove_last_credential"


# ---------------------------------------------------------------------------
# Feature flag disable -> 404
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enroll_disabled_returns_404(app, engine_and_sm, monkeypatch):
    _e, sm = engine_and_sm
    _user, token = await _make_user(sm, role="admin")
    monkeypatch.setenv("MFA_ENROLL_ENABLED", "false")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/v1/mfa/enroll/start",
            json={"type": "totp"},
            headers=await _auth(c, token),
        )
        assert r.status_code == 404
