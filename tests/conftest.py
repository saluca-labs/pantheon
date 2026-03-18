"""
Shared test fixtures for SoulAuth test suite.
Uses SQLite in-memory for fast isolated tests.
"""

import os

# Set test environment BEFORE any soulauth imports trigger settings loading.
# SOULAUTH_MODE=local  → SQLite, no Postgres dependency
# SOULAUTH_TESTING=true → bypass RBAC checks in require_permission()
# SOULAUTH_DEBUG=true   → allow ephemeral JWT keys for token tests
os.environ.setdefault("SOULAUTH_MODE", "local")
os.environ.setdefault("SOULAUTH_TESTING", "true")
os.environ.setdefault("SOULAUTH_DEBUG", "true")

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import pytest_asyncio
import yaml
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from src.database.connection import Base
from src.database.models import SoulTenant, Soulkey, PolicyCache


# Use SQLite for testing (no PostgreSQL dependency)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    """Create a test database session."""
    session_factory = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def sample_tenant(db_session):
    """Create a sample tenant for testing."""
    tenant = SoulTenant(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        name="Saluca LLC",
        slug="saluca",
        tier="enterprise",
        status="active",
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


@pytest_asyncio.fixture
async def sample_policy_cache(db_session, sample_tenant):
    """Seed a PolicyCache entry for 'alfred' under the sample tenant.

    This is needed by delegation tests which verify that the grantor
    actually possesses the permissions being delegated.
    """
    policy = PolicyCache(
        tenant_id=sample_tenant.id,
        persona_id="alfred",
        policy_version="test",
        resolved_policy={
            "metadata": {"tenant": "saluca", "persona": "alfred", "role": "orchestrator"},
            "spec": {
                "jit": {
                    "max_capability_ttl": 900,
                    "default_capability_ttl": 300,
                    "require_active_session": False,
                    "allowed_nodes": ["*"],
                    "operating_window": "24/7",
                    "max_concurrent_capabilities": 10,
                },
                "escalation": {
                    "can_grant_temporary_access": True,
                    "can_suspend_agents": True,
                    "approval_required_for": [],
                },
                "resources": {
                    "memory": [{"actions": ["read", "write", "delete"], "scopes": ["*"], "conditions": []}],
                    "vault": [{"actions": ["read", "reveal"], "scopes": ["*"], "conditions": []}],
                    "mesh": [{"actions": ["ssh", "execute", "transfer"], "scopes": ["*"], "conditions": []}],
                },
            },
        },
    )
    db_session.add(policy)
    await db_session.flush()
    return policy


@pytest.fixture
def policy_repo(tmp_path):
    """Create a temporary policy repository structure for testing."""
    shared_dir = tmp_path / "shared"
    shared_dir.mkdir()
    roles = {
        "apiVersion": "soulauth/v1",
        "kind": "RoleTemplates",
        "roles": {
            "orchestrator": {
                "description": "Unrestricted agent",
                "defaults": {
                    "jit": {"max_capability_ttl": 900, "allowed_nodes": ["*"]},
                    "escalation": {"can_grant_temporary_access": True, "can_suspend_agents": True},
                },
            },
            "domain_specialist": {
                "description": "Scoped specialist",
                "defaults": {
                    "jit": {"max_capability_ttl": 300, "allowed_nodes": []},
                    "escalation": {"can_grant_temporary_access": False, "can_suspend_agents": False},
                },
            },
        },
    }
    with open(shared_dir / "roles.yaml", "w") as f:
        yaml.dump(roles, f)

    tenant_dir = tmp_path / "tenants" / "saluca" / "personas"
    tenant_dir.mkdir(parents=True)

    alfred_policy = {
        "apiVersion": "soulauth/v1",
        "kind": "PersonaPolicy",
        "metadata": {"tenant": "saluca", "persona": "alfred", "role": "orchestrator", "description": "AI chief of staff"},
        "spec": {
            "jit": {
                "max_capability_ttl": 900, "default_capability_ttl": 300,
                "require_active_session": False, "allowed_nodes": ["*"],
                "operating_window": "24/7", "max_concurrent_capabilities": 10,
            },
            "resources": {
                "memory": [{"actions": ["read", "write", "delete"], "scopes": ["*"], "conditions": []}],
                "vault": [{"actions": ["read", "reveal"], "scopes": ["*"], "conditions": [{"require_approval": False}]}],
            },
            "escalation": {"can_grant_temporary_access": True, "can_suspend_agents": True, "approval_required_for": []},
        },
    }
    with open(tenant_dir / "alfred.yaml", "w") as f:
        yaml.dump(alfred_policy, f)

    oracle_policy = {
        "apiVersion": "soulauth/v1",
        "kind": "PersonaPolicy",
        "metadata": {"tenant": "saluca", "persona": "oracle", "role": "domain_specialist", "description": "CS specialist"},
        "spec": {
            "jit": {
                "default_capability_ttl": 120, "require_active_session": True,
                "allowed_nodes": ["claude-code-gcp", "ai-lab"], "operating_window": "24/7",
                "max_concurrent_capabilities": 5,
            },
            "resources": {
                "memory": [
                    {"actions": ["read", "write"], "scopes": ["cs:*", "math:*"], "conditions": []},
                    {"actions": ["read"], "scopes": ["*"], "conditions": [{"require_approval": True, "approver_role": "orchestrator"}]},
                ],
            },
        },
    }
    with open(tenant_dir / "oracle.yaml", "w") as f:
        yaml.dump(oracle_policy, f)

    return tmp_path


@pytest_asyncio.fixture
async def sample_policy_data():
    """Sample resolved policy data for testing."""
    return {
        "metadata": {
            "tenant": "saluca",
            "persona": "alfred",
            "role": "orchestrator",
            "description": "AI chief of staff",
        },
        "spec": {
            "jit": {
                "max_capability_ttl": 900,
                "default_capability_ttl": 300,
                "require_active_session": False,
                "allowed_nodes": ["*"],
                "operating_window": "24/7",
                "max_concurrent_capabilities": 10,
            },
            "escalation": {
                "can_grant_temporary_access": True,
                "can_suspend_agents": True,
                "approval_required_for": [],
            },
            "resources": {
                "memory": [
                    {
                        "actions": ["read", "write", "delete"],
                        "scopes": ["*"],
                        "nodes": ["*"],
                        "services": ["*"],
                        "conditions": [],
                    }
                ],
                "vault": [
                    {
                        "actions": ["read", "reveal"],
                        "scopes": ["*"],
                        "nodes": ["*"],
                        "services": ["*"],
                        "conditions": [{"require_approval": False}],
                    }
                ],
                "mesh": [
                    {
                        "actions": ["ssh", "execute", "transfer"],
                        "scopes": ["*"],
                        "nodes": ["*"],
                        "services": ["*"],
                        "conditions": [],
                    }
                ],
            },
        },
    }
