"""LocalPg implementation of AgentStore + PromptStore.

Backs the abstract surfaces with the SQLAlchemy ORM models seeded by
Alembic migration 0039 (``AgosAgent`` / ``AgosPrompt``). Sessions come
from the standard async session factory in
:mod:`src.database.connection`, so this also works against the SQLite
test harness used by ``alembic upgrade head`` + pytest.

This is the default backend — selected when ``_pantheon_config`` has
``agents_store.kind = 'local'`` (or when the row is missing entirely).
"""

from __future__ import annotations

import time
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, text, update, delete

from src.agents.store import Agent, AgentStore, Prompt, PromptStore
from src.database.connection import async_session_factory
from src.database.models import AgosAgent, AgosPrompt


# ---------------------------------------------------------------------------
# Row ↔ dataclass adapters
# ---------------------------------------------------------------------------


def _iso(dt: Optional[datetime]) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _agent_from_row(row: AgosAgent) -> Agent:
    return Agent(
        id=row.id if isinstance(row.id, UUID) else UUID(str(row.id)),
        tenant_id=row.tenant_id if (row.tenant_id is None or isinstance(row.tenant_id, UUID))
                  else UUID(str(row.tenant_id)),
        persona_id=row.persona_id,
        name=row.name,
        description=row.description,
        prompt_id=row.prompt_id if (row.prompt_id is None or isinstance(row.prompt_id, UUID))
                  else UUID(str(row.prompt_id)),
        metadata=dict(row.metadata_ or {}),
        status=row.status,
        created_at=_iso(row.created_at),
        created_by=row.created_by if (row.created_by is None or isinstance(row.created_by, UUID))
                   else UUID(str(row.created_by)),
        updated_at=_iso(row.updated_at),
    )


def _prompt_from_row(row: AgosPrompt) -> Prompt:
    return Prompt(
        id=row.id if isinstance(row.id, UUID) else UUID(str(row.id)),
        tenant_id=row.tenant_id if (row.tenant_id is None or isinstance(row.tenant_id, UUID))
                  else UUID(str(row.tenant_id)),
        name=row.name,
        body=row.body,
        version=row.version,
        supersedes_id=row.supersedes_id if (row.supersedes_id is None or isinstance(row.supersedes_id, UUID))
                      else UUID(str(row.supersedes_id)),
        status=row.status,
        metadata=dict(row.metadata_ or {}),
        created_at=_iso(row.created_at),
        created_by=row.created_by if (row.created_by is None or isinstance(row.created_by, UUID))
                   else UUID(str(row.created_by)),
    )


# ---------------------------------------------------------------------------
# LocalPgAgentStore
# ---------------------------------------------------------------------------


# Whitelist of columns accepted by update_agent's `patch` dict. Anything
# else is silently dropped (keeps wire/store decoupled).
_AGENT_UPDATABLE = frozenset({
    "name", "description", "prompt_id", "metadata", "status", "persona_id",
})


class LocalPgAgentStore(AgentStore):
    async def list_agents(
        self,
        tenant_id: Optional[UUID] = None,
        include_global: bool = True,
    ) -> list[Agent]:
        async with async_session_factory() as session:
            stmt = select(AgosAgent)
            if tenant_id is not None and include_global:
                stmt = stmt.where(
                    (AgosAgent.tenant_id == tenant_id) | (AgosAgent.tenant_id.is_(None))
                )
            elif tenant_id is not None:
                stmt = stmt.where(AgosAgent.tenant_id == tenant_id)
            elif not include_global:
                # tenant_id None, exclude global → empty set is logically correct
                # but a more useful interpretation is "list ALL". We keep the
                # plain semantics: no tenant filter, no global filter ⇒ all rows.
                pass
            stmt = stmt.order_by(AgosAgent.created_at.desc().nulls_last())
            result = await session.execute(stmt)
            return [_agent_from_row(r) for r in result.scalars()]

    async def get_agent(self, agent_id: UUID) -> Optional[Agent]:
        async with async_session_factory() as session:
            row = await session.get(AgosAgent, agent_id)
            return _agent_from_row(row) if row else None

    async def get_agent_by_persona(
        self, tenant_id: Optional[UUID], persona_id: str
    ) -> Optional[Agent]:
        async with async_session_factory() as session:
            stmt = select(AgosAgent).where(AgosAgent.persona_id == persona_id)
            if tenant_id is None:
                stmt = stmt.where(AgosAgent.tenant_id.is_(None))
            else:
                stmt = stmt.where(AgosAgent.tenant_id == tenant_id)
            row = (await session.execute(stmt)).scalar_one_or_none()
            return _agent_from_row(row) if row else None

    async def create_agent(self, agent: Agent) -> Agent:
        async with async_session_factory() as session:
            row = AgosAgent(
                id=agent.id or _uuid.uuid4(),
                tenant_id=agent.tenant_id,
                persona_id=agent.persona_id,
                name=agent.name,
                description=agent.description,
                prompt_id=agent.prompt_id,
                metadata_=dict(agent.metadata or {}),
                status=agent.status or "active",
                created_by=agent.created_by,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _agent_from_row(row)

    async def update_agent(
        self, agent_id: UUID, patch: dict
    ) -> Optional[Agent]:
        clean: dict = {}
        for k, v in (patch or {}).items():
            if k not in _AGENT_UPDATABLE:
                continue
            if k == "metadata":
                clean["metadata_"] = dict(v or {})
            else:
                clean[k] = v
        async with async_session_factory() as session:
            row = await session.get(AgosAgent, agent_id)
            if row is None:
                return None
            for k, v in clean.items():
                setattr(row, k, v)
            row.updated_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(row)
            return _agent_from_row(row)

    async def delete_agent(self, agent_id: UUID) -> bool:
        async with async_session_factory() as session:
            row = await session.get(AgosAgent, agent_id)
            if row is None:
                return False
            await session.delete(row)
            await session.commit()
            return True

    async def health_check(self) -> dict:
        t0 = time.perf_counter()
        try:
            async with async_session_factory() as session:
                await session.execute(text("SELECT 1"))
            return {
                "ok": True,
                "latency_ms": int((time.perf_counter() - t0) * 1000),
            }
        except Exception as e:
            return {
                "ok": False,
                "latency_ms": int((time.perf_counter() - t0) * 1000),
                "error": str(e),
            }


# ---------------------------------------------------------------------------
# LocalPgPromptStore
# ---------------------------------------------------------------------------


class LocalPgPromptStore(PromptStore):
    async def list_prompts(
        self,
        tenant_id: Optional[UUID] = None,
        name: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[Prompt]:
        async with async_session_factory() as session:
            stmt = select(AgosPrompt)
            if tenant_id is not None:
                stmt = stmt.where(AgosPrompt.tenant_id == tenant_id)
            if name is not None:
                stmt = stmt.where(AgosPrompt.name == name)
            if status is not None:
                stmt = stmt.where(AgosPrompt.status == status)
            stmt = stmt.order_by(AgosPrompt.created_at.desc().nulls_last())
            result = await session.execute(stmt)
            return [_prompt_from_row(r) for r in result.scalars()]

    async def get_prompt(self, prompt_id: UUID) -> Optional[Prompt]:
        async with async_session_factory() as session:
            row = await session.get(AgosPrompt, prompt_id)
            return _prompt_from_row(row) if row else None

    async def resolve_active_prompt(
        self, tenant_id: Optional[UUID], name: str
    ) -> Optional[Prompt]:
        async with async_session_factory() as session:
            # 1. Tenant row first
            if tenant_id is not None:
                stmt = select(AgosPrompt).where(
                    AgosPrompt.tenant_id == tenant_id,
                    AgosPrompt.name == name,
                    AgosPrompt.status == "active",
                ).order_by(AgosPrompt.version.desc()).limit(1)
                row = (await session.execute(stmt)).scalar_one_or_none()
                if row is not None:
                    return _prompt_from_row(row)
            # 2. Global fallback
            stmt = select(AgosPrompt).where(
                AgosPrompt.tenant_id.is_(None),
                AgosPrompt.name == name,
                AgosPrompt.status == "active",
            ).order_by(AgosPrompt.version.desc()).limit(1)
            row = (await session.execute(stmt)).scalar_one_or_none()
            return _prompt_from_row(row) if row else None

    async def create_prompt(self, prompt: Prompt) -> Prompt:
        async with async_session_factory() as session:
            row = AgosPrompt(
                id=prompt.id or _uuid.uuid4(),
                tenant_id=prompt.tenant_id,
                name=prompt.name,
                body=prompt.body,
                version=prompt.version or 1,
                supersedes_id=prompt.supersedes_id,
                status=prompt.status or "active",
                metadata_=dict(prompt.metadata or {}),
                created_by=prompt.created_by,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _prompt_from_row(row)

    async def create_prompt_version(
        self, prompt_id: UUID, new_body: str
    ) -> Prompt:
        async with async_session_factory() as session:
            old = await session.get(AgosPrompt, prompt_id)
            if old is None:
                raise LookupError(f"prompt {prompt_id} not found")
            new_row = AgosPrompt(
                id=_uuid.uuid4(),
                tenant_id=old.tenant_id,
                name=old.name,
                body=new_body,
                version=(old.version or 1) + 1,
                supersedes_id=old.id,
                status="active",
                metadata_=dict(old.metadata_ or {}),
                created_by=old.created_by,
            )
            old.status = "deprecated"
            session.add(new_row)
            await session.commit()
            await session.refresh(new_row)
            return _prompt_from_row(new_row)

    async def health_check(self) -> dict:
        t0 = time.perf_counter()
        try:
            async with async_session_factory() as session:
                await session.execute(text("SELECT 1"))
            return {
                "ok": True,
                "latency_ms": int((time.perf_counter() - t0) * 1000),
            }
        except Exception as e:
            return {
                "ok": False,
                "latency_ms": int((time.perf_counter() - t0) * 1000),
                "error": str(e),
            }
