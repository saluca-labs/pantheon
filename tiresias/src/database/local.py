"""
Local-first SQLite backend for SoulAuth ID (Independent Developer) mode.

Zero-config, zero-infrastructure. Just `pip install soulauth && soulauth init`.
Uses aiosqlite + SQLAlchemy async for full async compatibility with the enterprise path.
"""

import os
import uuid
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from src.database.local_schema import get_sqlite_schema, get_table_names

# Default paths
SOULAUTH_HOME = Path.home() / ".soulauth"
DEFAULT_DB_PATH = SOULAUTH_HOME / "soulauth.db"
DEFAULT_KEYS_DIR = SOULAUTH_HOME / "keys"
DEFAULT_POLICIES_DIR = SOULAUTH_HOME / "policies"
DEFAULT_CONFIG_PATH = SOULAUTH_HOME / "config.yml"

# Local tenant defaults
LOCAL_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
LOCAL_TENANT_NAME = "Local Developer"
LOCAL_TENANT_SLUG = "local"


class LocalDatabase:
    """
    Thread-safe singleton SQLite backend for local-first SoulAuth.

    Manages:
    - SQLite database at ~/.soulauth/soulauth.db
    - ES256 JWT keypair at ~/.soulauth/keys/
    - Default "local" tenant
    - Async session factory compatible with the enterprise path
    """

    _instance: Optional["LocalDatabase"] = None
    _lock = threading.Lock()

    def __new__(cls, db_path: Optional[str] = None):
        with cls._lock:
            if cls._instance is None:
                instance = super().__new__(cls)
                instance._initialized = False
                cls._instance = instance
            return cls._instance

    def __init__(self, db_path: Optional[str] = None):
        if self._initialized:
            return
        self._db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self._engine = None
        self._session_factory = None
        self._initialized = True

    @classmethod
    def reset(cls):
        """Reset singleton (for testing)."""
        with cls._lock:
            cls._instance = None

    @property
    def db_path(self) -> Path:
        return self._db_path

    @property
    def engine(self):
        return self._engine

    async def init(self):
        """
        Full local setup:
        1. Create directory structure
        2. Generate ES256 keypair if missing
        3. Create SQLite database and schema
        4. Create default local tenant
        5. Write default config
        """
        # Ensure directory structure
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        DEFAULT_KEYS_DIR.mkdir(parents=True, exist_ok=True)
        DEFAULT_POLICIES_DIR.mkdir(parents=True, exist_ok=True)

        # Generate keys if needed
        _generate_keypair_if_missing()

        # Create engine
        db_url = f"sqlite+aiosqlite:///{self._db_path}"
        self._engine = create_async_engine(
            db_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=False,
        )

        self._session_factory = async_sessionmaker(
            self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

        # Create schema
        await self._create_schema()

        # Create default tenant
        await self._ensure_default_tenant()

        # Write default config
        _write_default_config(self._db_path)

        # Write starter policy
        _write_starter_policy()

    async def _create_schema(self):
        """Execute SQLite schema DDL using raw aiosqlite for executescript support."""
        import aiosqlite

        schema = get_sqlite_schema()
        async with aiosqlite.connect(str(self._db_path)) as db:
            await db.executescript(schema)
            await db.commit()

    async def _ensure_default_tenant(self):
        """Create the default 'local' tenant if it doesn't exist."""
        async with self._engine.begin() as conn:
            result = await conn.exec_driver_sql(
                "SELECT id FROM _soul_tenants WHERE slug = ?", ("local",)
            )
            row = result.fetchone()
            if row is None:
                now = datetime.now(timezone.utc).isoformat()
                await conn.exec_driver_sql(
                    """INSERT INTO _soul_tenants (id, name, slug, tier, status, metadata, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        str(LOCAL_TENANT_ID),
                        LOCAL_TENANT_NAME,
                        LOCAL_TENANT_SLUG,
                        "id",
                        "active",
                        "{}",
                        now,
                        now,
                    ),
                )

    async def get_session(self) -> AsyncSession:
        """Return an async session. Caller must manage context."""
        if self._session_factory is None:
            raise RuntimeError("LocalDatabase not initialized. Call init() first.")
        return self._session_factory()

    def get_session_factory(self) -> async_sessionmaker:
        """Return the session factory for FastAPI dependency injection."""
        if self._session_factory is None:
            raise RuntimeError("LocalDatabase not initialized. Call init() first.")
        return self._session_factory

    async def close(self):
        """Dispose engine on shutdown."""
        if self._engine:
            await self._engine.dispose()


def _generate_keypair_if_missing():
    """Generate ES256 keypair at ~/.soulauth/keys/ if not present."""
    private_path = DEFAULT_KEYS_DIR / "private.pem"
    public_path = DEFAULT_KEYS_DIR / "public.pem"

    if private_path.exists() and public_path.exists():
        return

    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    private_path.write_bytes(private_pem)
    os.chmod(private_path, 0o600)
    public_path.write_bytes(public_pem)


def _write_default_config(db_path: Path):
    """Write default config.yml if it doesn't exist."""
    if DEFAULT_CONFIG_PATH.exists():
        return

    config = {
        "mode": "local",
        "database": {
            "path": str(db_path),
            "type": "sqlite",
        },
        "jwt": {
            "algorithm": "ES256",
            "private_key_path": str(DEFAULT_KEYS_DIR / "private.pem"),
            "public_key_path": str(DEFAULT_KEYS_DIR / "public.pem"),
        },
        "server": {
            "host": "127.0.0.1",
            "port": 8000,
        },
        "tenant": {
            "id": str(LOCAL_TENANT_ID),
            "name": LOCAL_TENANT_NAME,
            "slug": LOCAL_TENANT_SLUG,
        },
        "detection_enabled": False,
        "siem_enabled": False,
        "notifications_enabled": False,
    }

    DEFAULT_CONFIG_PATH.write_text(yaml.dump(config, default_flow_style=False))


def _write_starter_policy():
    """Write the starter policy for local dev if not present."""
    policy_path = DEFAULT_POLICIES_DIR / "local_dev.yml"
    if policy_path.exists():
        return

    policy = {
        "apiVersion": "soulauth/v1",
        "kind": "PersonaPolicy",
        "metadata": {
            "tenant": "local",
            "persona": "*",
            "role": "developer",
            "description": "Default permissive policy for local development",
        },
        "spec": {
            "resources": {
                "*": [
                    {
                        "actions": ["read", "write", "execute"],
                        "scopes": ["*"],
                        "conditions": [],
                    }
                ],
            },
            "jit": {
                "max_capability_ttl": 900,
                "default_capability_ttl": 300,
                "require_active_session": False,
                "allowed_nodes": ["*"],
                "operating_window": "24/7",
                "max_concurrent_capabilities": 50,
            },
            "escalation": {
                "can_grant_temporary_access": True,
                "can_suspend_agents": True,
                "approval_required_for": [],
            },
        },
    }

    policy_path.write_text(yaml.dump(policy, default_flow_style=False))


async def ensure_local_setup(db_path: Optional[str] = None) -> LocalDatabase:
    """
    One-call setup: checks if ~/.soulauth/ exists, creates everything if not.

    Creates:
    - ~/.soulauth/soulauth.db (SQLite database)
    - ~/.soulauth/keys/private.pem (ES256 private key)
    - ~/.soulauth/keys/public.pem (ES256 public key)
    - ~/.soulauth/config.yml (local config with defaults)
    - ~/.soulauth/policies/ (policy directory with starter policy)

    Returns the initialized LocalDatabase instance.
    """
    LocalDatabase.reset()  # Ensure fresh instance with possibly new path
    local_db = LocalDatabase(db_path=db_path)
    await local_db.init()
    return local_db
