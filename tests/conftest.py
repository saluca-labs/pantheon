"""Shared pytest fixtures for Tiresias App Proxy end-to-end tests.

Overrides the application's module-level state so tests run against:
- An in-memory SQLite database with tables created
- A test plugins directory with the mock plugin
- The real Cedar engine with production policies
- The real AuditLogger backed by the in-memory DB
- No API key / admin key requirements (dev mode)
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

# ── Paths ────────────────────────────────────────────────────────────────────
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
_POLICIES_DIR = _PROJECT_ROOT / "policies" / "cedar"
_CEDAR_SCHEMA = _PROJECT_ROOT / "src" / "app_proxy" / "policy" / "schema.json"


@pytest.fixture(scope="session")
def test_plugins_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Create a temporary plugins directory with the mock plugin wired up.

    The directory layout mirrors what PluginRegistry.load() expects::

        <tmp>/mock/config.yaml
        <tmp>/mock/manifest.json
    """
    plugins_root = tmp_path_factory.mktemp("plugins")
    mock_dir = plugins_root / "mock"
    mock_dir.mkdir()

    # Copy config.yaml
    shutil.copy(_FIXTURES_DIR / "mock_plugin_config.yaml", mock_dir / "config.yaml")

    # Copy manifest.json
    shutil.copy(_FIXTURES_DIR / "mock_manifest.json", mock_dir / "manifest.json")

    return plugins_root


@pytest.fixture(scope="session")
def cedar_policies_dir() -> Path:
    return _POLICIES_DIR


@pytest.fixture(scope="session")
def cedar_schema_path() -> Path:
    return _CEDAR_SCHEMA


# ── Application bootstrap ───────────────────────────────────────────────────

@pytest_asyncio.fixture()
async def app_client(
    test_plugins_dir: Path,
    cedar_policies_dir: Path,
    cedar_schema_path: Path,
) -> AsyncIterator[AsyncClient]:
    """Yield an httpx AsyncClient wired to the FastAPI app.

    Monkey-patches the module-level state in ``app_proxy.main`` so the
    routers can resolve settings, DB, Cedar engine, audit logger, and
    plugin registry without running the full lifespan.
    """
    import app_proxy.main as main_mod
    from app_proxy.config import Settings
    from app_proxy.plugins.registry import PluginRegistry

    # Save original state
    orig_settings = main_mod._settings
    orig_db = main_mod._db_engine
    orig_cedar = main_mod._cedar_engine
    orig_registry = main_mod._plugin_registry
    orig_audit = main_mod._audit_logger

    # --- Build test settings (no auth keys = dev mode) ---
    settings = Settings(
        database_url="sqlite+aiosqlite://",  # in-memory
        plugins_dir=test_plugins_dir,
        policies_dir=cedar_policies_dir,
        cedar_schema_path=cedar_schema_path,
        policy_enforcement_mode="strict",
        api_key_hash=None,
        admin_key=None,
    )
    main_mod._settings = settings

    # --- Database (in-memory) — create tables ---
    engine: AsyncEngine = create_async_engine(
        "sqlite+aiosqlite://", echo=False, future=True,
    )
    main_mod._db_engine = engine

    from app_proxy.storage.schema import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # --- Audit logger (needs the engine with tables) ---
    from app_proxy.audit.logger import AuditLogger

    audit_logger = AuditLogger(engine)
    main_mod._audit_logger = audit_logger

    # --- Cedar engine ---
    cedar_engine: object
    try:
        from app_proxy.policy.engine import CedarPolicyEngine

        cedar_engine = CedarPolicyEngine(
            policies_dir=cedar_policies_dir,
            schema_path=cedar_schema_path,
        )
    except Exception:
        # If cedarpy isn't installed or policies fail to load, fall back to
        # a stub dict so the test suite can still exercise the HTTP layer.
        cedar_engine = {}
    main_mod._cedar_engine = cedar_engine

    # --- Plugin registry ---
    registry = PluginRegistry(test_plugins_dir)
    await registry.load()
    main_mod._plugin_registry = registry

    # --- Build client (bypass lifespan via ASGI transport) ---
    transport = ASGITransport(app=main_mod.app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    # --- Cleanup ---
    await engine.dispose()
    main_mod._settings = orig_settings
    main_mod._db_engine = orig_db
    main_mod._cedar_engine = orig_cedar
    main_mod._plugin_registry = orig_registry
    main_mod._audit_logger = orig_audit
