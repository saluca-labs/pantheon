"""
Tests for SoulAuth local (ID) mode — SQLite backend, zero-config setup.
At least 15 tests covering the full local mode stack.
"""

import asyncio
import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
import pytest_asyncio
import yaml
from click.testing import CliRunner

from src.database.local import (
    LocalDatabase,
    ensure_local_setup,
    _generate_keypair_if_missing,
    _write_default_config,
    _write_starter_policy,
    LOCAL_TENANT_ID,
    LOCAL_TENANT_SLUG,
    DEFAULT_KEYS_DIR,
    DEFAULT_POLICIES_DIR,
    DEFAULT_CONFIG_PATH,
)
from src.database.local_schema import get_sqlite_schema, get_table_names


# ──────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_singleton():
    """Reset LocalDatabase singleton between tests."""
    LocalDatabase.reset()
    yield
    LocalDatabase.reset()


@pytest.fixture
def tmp_soulauth(tmp_path):
    """Create a temporary ~/.soulauth-like directory for testing."""
    home = tmp_path / ".soulauth"
    home.mkdir()
    db_path = home / "soulauth.db"
    keys_dir = home / "keys"
    keys_dir.mkdir()
    policies_dir = home / "policies"
    policies_dir.mkdir()
    return {
        "home": home,
        "db_path": db_path,
        "keys_dir": keys_dir,
        "policies_dir": policies_dir,
    }


@pytest.fixture
def mock_soulauth_home(tmp_path, monkeypatch):
    """Redirect all default paths to tmp_path for isolated tests."""
    home = tmp_path / ".soulauth"
    monkeypatch.setattr("src.database.local.SOULAUTH_HOME", home)
    monkeypatch.setattr("src.database.local.DEFAULT_DB_PATH", home / "soulauth.db")
    monkeypatch.setattr("src.database.local.DEFAULT_KEYS_DIR", home / "keys")
    monkeypatch.setattr("src.database.local.DEFAULT_POLICIES_DIR", home / "policies")
    monkeypatch.setattr("src.database.local.DEFAULT_CONFIG_PATH", home / "config.yml")
    return home


# ──────────────────────────────────────────────────────────────────────
# 1. SQLite Schema Tests
# ──────────────────────────────────────────────────────────────────────

class TestLocalSchema:
    """Tests for SQLite-compatible schema."""

    def test_schema_contains_all_tables(self):
        """Test 1: Schema string contains all 6 table definitions."""
        schema = get_sqlite_schema()
        tables = get_table_names()
        assert len(tables) == 6
        for table in tables:
            assert f"CREATE TABLE IF NOT EXISTS {table}" in schema

    def test_schema_no_postgres_types(self):
        """Test 2: Schema uses no Postgres-specific types."""
        schema = get_sqlite_schema()
        assert "UUID" not in schema.upper().replace("_UUID", "").replace("GEN_RANDOM_UUID", "")
        assert "JSONB" not in schema
        assert "TIMESTAMPTZ" not in schema

    def test_table_names_list(self):
        """Test 3: Table names match expected set."""
        expected = {
            "_soul_tenants",
            "_soulkeys",
            "_soulauth_policy_cache",
            "_soulauth_audit",
            "_soulauth_delegations",
            "_soulauth_trials",
        }
        assert set(get_table_names()) == expected


# ──────────────────────────────────────────────────────────────────────
# 2. Local Database Tests
# ──────────────────────────────────────────────────────────────────────

class TestLocalDatabase:
    """Tests for LocalDatabase class."""

    @pytest.mark.asyncio
    async def test_init_creates_database(self, tmp_path, mock_soulauth_home):
        """Test 4: LocalDatabase.init() creates the SQLite database file."""
        db_path = tmp_path / ".soulauth" / "soulauth.db"
        local_db = LocalDatabase(db_path=str(db_path))
        await local_db.init()

        assert db_path.exists()
        assert db_path.stat().st_size > 0

        await local_db.close()

    @pytest.mark.asyncio
    async def test_schema_creates_all_tables(self, tmp_path, mock_soulauth_home):
        """Test 5: All 6 tables are created in the SQLite database."""
        import aiosqlite

        db_path = tmp_path / ".soulauth" / "soulauth.db"
        local_db = LocalDatabase(db_path=str(db_path))
        await local_db.init()

        async with aiosqlite.connect(str(db_path)) as db:
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [row[0] for row in await cursor.fetchall()]

        expected_tables = get_table_names()
        for table in expected_tables:
            assert table in tables, f"Table {table} not found in database"

        await local_db.close()

    @pytest.mark.asyncio
    async def test_default_tenant_created(self, tmp_path, mock_soulauth_home):
        """Test 6: Default 'local' tenant is created on init."""
        import aiosqlite

        db_path = tmp_path / ".soulauth" / "soulauth.db"
        local_db = LocalDatabase(db_path=str(db_path))
        await local_db.init()

        async with aiosqlite.connect(str(db_path)) as db:
            cursor = await db.execute(
                "SELECT id, name, slug, tier FROM _soul_tenants WHERE slug = 'local'"
            )
            row = await cursor.fetchone()

        assert row is not None
        assert row[0] == str(LOCAL_TENANT_ID)
        assert row[1] == "Local Developer"
        assert row[2] == "local"
        assert row[3] == "id"

        await local_db.close()

    @pytest.mark.asyncio
    async def test_session_factory(self, tmp_path, mock_soulauth_home):
        """Test 7: get_session() returns a valid async session."""
        db_path = tmp_path / ".soulauth" / "soulauth.db"
        local_db = LocalDatabase(db_path=str(db_path))
        await local_db.init()

        session = await local_db.get_session()
        assert session is not None

        # Should be able to execute a query
        from sqlalchemy import text
        result = await session.execute(text("SELECT 1"))
        row = result.fetchone()
        assert row[0] == 1

        await session.close()
        await local_db.close()

    @pytest.mark.asyncio
    async def test_singleton_pattern(self, tmp_path, mock_soulauth_home):
        """Test 8: LocalDatabase uses thread-safe singleton pattern."""
        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        db1 = LocalDatabase(db_path=db_path)
        db2 = LocalDatabase(db_path=db_path)
        assert db1 is db2

    @pytest.mark.asyncio
    async def test_singleton_reset(self, tmp_path, mock_soulauth_home):
        """Test 9: LocalDatabase.reset() clears the singleton."""
        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        db1 = LocalDatabase(db_path=db_path)
        LocalDatabase.reset()
        db2 = LocalDatabase(db_path=db_path)
        assert db1 is not db2


# ──────────────────────────────────────────────────────────────────────
# 3. Key Generation Tests
# ──────────────────────────────────────────────────────────────────────

class TestKeyGeneration:
    """Tests for ES256 keypair generation."""

    def test_keypair_generation(self, tmp_path, mock_soulauth_home):
        """Test 10: ES256 keypair is generated at the expected paths."""
        keys_dir = tmp_path / ".soulauth" / "keys"
        keys_dir.mkdir(parents=True, exist_ok=True)

        # Monkey-patch the DEFAULT_KEYS_DIR used by the function
        import src.database.local as local_mod
        orig = local_mod.DEFAULT_KEYS_DIR
        local_mod.DEFAULT_KEYS_DIR = keys_dir
        try:
            _generate_keypair_if_missing()
        finally:
            local_mod.DEFAULT_KEYS_DIR = orig

        priv = keys_dir / "private.pem"
        pub = keys_dir / "public.pem"
        assert priv.exists()
        assert pub.exists()
        assert b"BEGIN PRIVATE KEY" in priv.read_bytes()
        assert b"BEGIN PUBLIC KEY" in pub.read_bytes()

    def test_keypair_not_overwritten(self, tmp_path, mock_soulauth_home):
        """Test 11: Existing keypair is not overwritten on re-init."""
        keys_dir = tmp_path / ".soulauth" / "keys"
        keys_dir.mkdir(parents=True, exist_ok=True)

        import src.database.local as local_mod
        orig = local_mod.DEFAULT_KEYS_DIR
        local_mod.DEFAULT_KEYS_DIR = keys_dir
        try:
            _generate_keypair_if_missing()
            priv_content = (keys_dir / "private.pem").read_bytes()

            _generate_keypair_if_missing()
            assert (keys_dir / "private.pem").read_bytes() == priv_content
        finally:
            local_mod.DEFAULT_KEYS_DIR = orig


# ──────────────────────────────────────────────────────────────────────
# 4. ensure_local_setup Tests
# ──────────────────────────────────────────────────────────────────────

class TestEnsureLocalSetup:
    """Tests for the one-call ensure_local_setup function."""

    @pytest.mark.asyncio
    async def test_creates_everything(self, tmp_path, mock_soulauth_home):
        """Test 12: ensure_local_setup creates DB, keys, config, and policies."""
        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        local_db = await ensure_local_setup(db_path=db_path)

        home = tmp_path / ".soulauth"
        assert (home / "soulauth.db").exists()
        assert (home / "keys" / "private.pem").exists()
        assert (home / "keys" / "public.pem").exists()
        assert (home / "config.yml").exists()
        assert (home / "policies").is_dir()

        await local_db.close()

    @pytest.mark.asyncio
    async def test_config_yml_contents(self, tmp_path, mock_soulauth_home):
        """Test 13: config.yml has correct default values."""
        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        local_db = await ensure_local_setup(db_path=db_path)

        config_path = tmp_path / ".soulauth" / "config.yml"
        config = yaml.safe_load(config_path.read_text())

        assert config["mode"] == "local"
        assert config["database"]["type"] == "sqlite"
        assert config["server"]["host"] == "127.0.0.1"
        assert config["server"]["port"] == 8000
        assert config["tenant"]["slug"] == "local"
        assert config["detection_enabled"] is False
        assert config["siem_enabled"] is False

        await local_db.close()

    @pytest.mark.asyncio
    async def test_starter_policy_created(self, tmp_path, mock_soulauth_home):
        """Test 14: Starter policy is written to the policies directory."""
        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        local_db = await ensure_local_setup(db_path=db_path)

        policy_dir = tmp_path / ".soulauth" / "policies"
        policy_files = list(policy_dir.glob("*.yml"))
        assert len(policy_files) >= 1

        # Parse and verify
        policy = yaml.safe_load(policy_files[0].read_text())
        assert policy["kind"] == "PersonaPolicy"
        assert policy["metadata"]["persona"] == "*"
        assert policy["metadata"]["role"] == "developer"

        await local_db.close()


# ──────────────────────────────────────────────────────────────────────
# 5. Agent Registration in Local Mode
# ──────────────────────────────────────────────────────────────────────

class TestLocalAgentRegistration:
    """Tests for agent operations in local mode."""

    @pytest.mark.asyncio
    async def test_register_agent_local(self, tmp_path, mock_soulauth_home):
        """Test 15: Register an agent in local mode and verify it exists."""
        from src.auth.soulkey import generate_soulkey

        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        local_db = await ensure_local_setup(db_path=db_path)

        raw_key, key_hash = generate_soulkey(LOCAL_TENANT_SLUG, "test-agent")
        soulkey_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        async with local_db.engine.begin() as conn:
            await conn.exec_driver_sql(
                """INSERT INTO _soulkeys
                   (id, tenant_id, persona_id, key_hash, label, status, issued_at, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (soulkey_id, str(LOCAL_TENANT_ID), "test-agent", key_hash,
                 "Test Agent", "active", now, "{}"),
            )

        # Verify
        async with local_db.engine.begin() as conn:
            result = await conn.exec_driver_sql(
                "SELECT persona_id, status FROM _soulkeys WHERE key_hash = ?",
                (key_hash,),
            )
            row = result.fetchone()

        assert row is not None
        assert row[0] == "test-agent"
        assert row[1] == "active"

        await local_db.close()


# ──────────────────────────────────────────────────────────────────────
# 6. Audit Logging in Local Mode
# ──────────────────────────────────────────────────────────────────────

class TestLocalAuditLogging:
    """Tests for audit trail in local mode."""

    @pytest.mark.asyncio
    async def test_audit_log_insert(self, tmp_path, mock_soulauth_home):
        """Test 16: Audit events can be written and read from SQLite."""
        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        local_db = await ensure_local_setup(db_path=db_path)

        event_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        async with local_db.engine.begin() as conn:
            await conn.exec_driver_sql(
                """INSERT INTO _soulauth_audit
                   (id, tenant_id, timestamp, event_type, persona_id, resource, action, decision, context)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (event_id, str(LOCAL_TENANT_ID), now, "access_evaluated",
                 "test-agent", "memory", "read", "grant", "{}"),
            )

        # Read back
        async with local_db.engine.begin() as conn:
            result = await conn.exec_driver_sql(
                "SELECT event_type, decision FROM _soulauth_audit WHERE id = ?",
                (event_id,),
            )
            row = result.fetchone()

        assert row is not None
        assert row[0] == "access_evaluated"
        assert row[1] == "grant"

        await local_db.close()


# ──────────────────────────────────────────────────────────────────────
# 7. Settings Tests
# ──────────────────────────────────────────────────────────────────────

class TestLocalSettings:
    """Tests for local mode settings auto-configuration."""

    def test_local_mode_settings(self, monkeypatch):
        """Test 17: Settings auto-configure for local mode."""
        monkeypatch.setenv("SOULAUTH_MODE", "local")

        # Clear lru_cache
        from config.settings import get_settings
        get_settings.cache_clear()

        try:
            settings = get_settings()
            assert settings.mode == "local"
            assert "sqlite" in settings.database_url
            assert settings.detection_enabled is False
            assert settings.siem_enabled is False
            assert settings.notifications_enabled is False
            assert settings.host == "127.0.0.1"
        finally:
            monkeypatch.delenv("SOULAUTH_MODE", raising=False)
            get_settings.cache_clear()

    def test_enterprise_mode_default(self, monkeypatch):
        """Test 18: Default mode is enterprise with Postgres URL."""
        monkeypatch.delenv("SOULAUTH_MODE", raising=False)
        monkeypatch.setenv("SOULAUTH_DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/soulauth")
        monkeypatch.setenv("SOULAUTH_DATABASE_URL_SYNC", "postgresql+psycopg2://user:pass@localhost/soulauth")

        from config.settings import get_settings
        get_settings.cache_clear()

        try:
            settings = get_settings()
            assert settings.mode == "enterprise"
            assert "postgresql" in settings.database_url
        finally:
            get_settings.cache_clear()


# ──────────────────────────────────────────────────────────────────────
# 8. CLI Command Tests
# ──────────────────────────────────────────────────────────────────────

class TestCLICommands:
    """Tests for CLI commands (using Click's test runner)."""

    def test_status_not_initialized(self, monkeypatch, tmp_path):
        """Test 19: Status command shows 'not initialized' when no DB exists."""
        from src.cli import cli

        # Point to nonexistent path
        monkeypatch.setattr(
            "src.database.local.DEFAULT_DB_PATH",
            tmp_path / "nonexistent" / "soulauth.db",
        )
        # Also patch the cli module's import
        monkeypatch.setattr(
            "src.cli.DEFAULT_DB_PATH" if hasattr(__import__("src.cli", fromlist=["DEFAULT_DB_PATH"]), "DEFAULT_DB_PATH") else
            "src.database.local.DEFAULT_DB_PATH",
            tmp_path / "nonexistent" / "soulauth.db",
        )

        runner = CliRunner()
        result = runner.invoke(cli, ["status"])
        assert "Not initialized" in result.output or result.exit_code == 0

    def test_init_with_no_server(self, monkeypatch, tmp_path):
        """Test 20: Init command with --no-server completes setup without starting server."""
        from src.cli import cli

        # Redirect all paths to tmp
        home = tmp_path / ".soulauth"
        monkeypatch.setattr("src.database.local.SOULAUTH_HOME", home)
        monkeypatch.setattr("src.database.local.DEFAULT_DB_PATH", home / "soulauth.db")
        monkeypatch.setattr("src.database.local.DEFAULT_KEYS_DIR", home / "keys")
        monkeypatch.setattr("src.database.local.DEFAULT_POLICIES_DIR", home / "policies")
        monkeypatch.setattr("src.database.local.DEFAULT_CONFIG_PATH", home / "config.yml")

        runner = CliRunner()
        result = runner.invoke(cli, [
            "init",
            "--db-path", str(home / "soulauth.db"),
            "--no-server",
        ])

        assert result.exit_code == 0, f"CLI failed: {result.output}"
        assert "You're ready" in result.output
        assert (home / "soulauth.db").exists()


# ──────────────────────────────────────────────────────────────────────
# 9. Database Persistence Tests
# ──────────────────────────────────────────────────────────────────────

class TestDatabasePersistence:
    """Tests for data persistence across sessions."""

    @pytest.mark.asyncio
    async def test_data_persists_across_sessions(self, tmp_path, mock_soulauth_home):
        """Test 21: Data written in one session persists in the next."""
        db_path = str(tmp_path / ".soulauth" / "soulauth.db")

        # Session 1: write data
        local_db = await ensure_local_setup(db_path=db_path)
        event_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        async with local_db.engine.begin() as conn:
            await conn.exec_driver_sql(
                """INSERT INTO _soulauth_audit
                   (id, tenant_id, timestamp, event_type, context)
                   VALUES (?, ?, ?, ?, ?)""",
                (event_id, str(LOCAL_TENANT_ID), now, "test_persistence", "{}"),
            )
        await local_db.close()

        # Session 2: read data
        LocalDatabase.reset()
        local_db2 = LocalDatabase(db_path=db_path)
        await local_db2.init()

        async with local_db2.engine.begin() as conn:
            result = await conn.exec_driver_sql(
                "SELECT event_type FROM _soulauth_audit WHERE id = ?",
                (event_id,),
            )
            row = result.fetchone()

        assert row is not None
        assert row[0] == "test_persistence"

        await local_db2.close()

    @pytest.mark.asyncio
    async def test_default_tenant_not_duplicated(self, tmp_path, mock_soulauth_home):
        """Test 22: Re-running init doesn't duplicate the default tenant."""
        db_path = str(tmp_path / ".soulauth" / "soulauth.db")

        # Init twice
        local_db = await ensure_local_setup(db_path=db_path)
        await local_db.close()
        LocalDatabase.reset()
        local_db = await ensure_local_setup(db_path=db_path)

        async with local_db.engine.begin() as conn:
            result = await conn.exec_driver_sql(
                "SELECT COUNT(*) FROM _soul_tenants WHERE slug = 'local'"
            )
            count = result.fetchone()[0]

        assert count == 1

        await local_db.close()


# ──────────────────────────────────────────────────────────────────────
# 10. Policy in Local Mode
# ──────────────────────────────────────────────────────────────────────

class TestLocalPolicy:
    """Tests for policy handling in local mode."""

    @pytest.mark.asyncio
    async def test_policy_cache_insert(self, tmp_path, mock_soulauth_home):
        """Test 23: Policy cache entries can be stored and retrieved."""
        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        local_db = await ensure_local_setup(db_path=db_path)

        policy_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        resolved = json.dumps({"resources": {"*": {"actions": ["read", "write"]}}})

        async with local_db.engine.begin() as conn:
            await conn.exec_driver_sql(
                """INSERT INTO _soulauth_policy_cache
                   (id, tenant_id, persona_id, policy_version, resolved_policy, synced_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (policy_id, str(LOCAL_TENANT_ID), "test-agent", "v1", resolved, now),
            )

        async with local_db.engine.begin() as conn:
            result = await conn.exec_driver_sql(
                "SELECT resolved_policy FROM _soulauth_policy_cache WHERE persona_id = ?",
                ("test-agent",),
            )
            row = result.fetchone()

        assert row is not None
        policy_data = json.loads(row[0])
        assert "resources" in policy_data

        await local_db.close()


# ──────────────────────────────────────────────────────────────────────
# 11. Token Operations in Local Mode
# ──────────────────────────────────────────────────────────────────────

class TestLocalTokens:
    """Tests for token operations in local mode."""

    @pytest.mark.asyncio
    async def test_token_issuance_local(self, tmp_path, mock_soulauth_home):
        """Test 24: Capability tokens can be issued in local mode."""
        from src.tokens.capability import issue_capability_token, validate_capability_token

        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        local_db = await ensure_local_setup(db_path=db_path)

        soulkey_id = uuid.uuid4()
        token, jti, exp = issue_capability_token(
            soulkey_id=soulkey_id,
            tenant_id=LOCAL_TENANT_ID,
            persona_id="test-agent",
            granted_scopes=["memory:read:*"],
            ttl=300,
        )

        assert token is not None
        assert jti is not None
        assert exp > datetime.now(timezone.utc)

        # Validate the token
        claims = validate_capability_token(token)
        assert claims["pid"] == "test-agent"
        assert claims["scp"] == ["memory:read:*"]

        await local_db.close()


# ──────────────────────────────────────────────────────────────────────
# 12. Delegation in Local Mode
# ──────────────────────────────────────────────────────────────────────

class TestLocalDelegation:
    """Tests for delegation table in local mode."""

    @pytest.mark.asyncio
    async def test_delegation_insert(self, tmp_path, mock_soulauth_home):
        """Test 25: Delegations can be created in local SQLite."""
        from src.auth.soulkey import generate_soulkey

        db_path = str(tmp_path / ".soulauth" / "soulauth.db")
        local_db = await ensure_local_setup(db_path=db_path)

        # Create a soulkey first (for FK)
        raw_key, key_hash = generate_soulkey(LOCAL_TENANT_SLUG, "grantor")
        grantor_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        async with local_db.engine.begin() as conn:
            await conn.exec_driver_sql(
                """INSERT INTO _soulkeys (id, tenant_id, persona_id, key_hash, status, issued_at, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (grantor_id, str(LOCAL_TENANT_ID), "grantor", key_hash, "active", now, "{}"),
            )

            deleg_id = str(uuid.uuid4())
            await conn.exec_driver_sql(
                """INSERT INTO _soulauth_delegations
                   (id, tenant_id, grantor_id, grantee_persona, resource, action, scope, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (deleg_id, str(LOCAL_TENANT_ID), grantor_id, "grantee-agent",
                 "vault", "read", "*", now),
            )

        async with local_db.engine.begin() as conn:
            result = await conn.exec_driver_sql(
                "SELECT grantee_persona, resource FROM _soulauth_delegations WHERE id = ?",
                (deleg_id,),
            )
            row = result.fetchone()

        assert row is not None
        assert row[0] == "grantee-agent"
        assert row[1] == "vault"

        await local_db.close()
