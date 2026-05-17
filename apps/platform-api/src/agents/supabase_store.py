"""Supabase implementation of AgentStore + PromptStore (W-H.2.b).

Backs the abstract surfaces with HTTPS calls to Supabase's auto-generated
PostgREST endpoints. The Supabase project MUST contain the same logical
tables (``_agos_agents``, ``_agos_prompts``) — operators can apply the
Alembic 0039 SQL against their Supabase database once, then point this
adapter at the project.

Auth: service-role key (admin), resolved via `env://` secret reference at
factory time and held in memory for the life of the store instance. The
service-role key bypasses RLS, which is appropriate here because tenant
scoping is enforced at the API layer above the store.

Network: uses ``httpx.AsyncClient`` (already a top-level dependency). No
new requirements added by this module.
"""

from __future__ import annotations

import time
import uuid as _uuid
from typing import Any, Optional
from uuid import UUID

import httpx

from src.agents.store import Agent, AgentStore, Prompt, PromptStore


_AGENTS_PATH = "/rest/v1/_agos_agents"
_PROMPTS_PATH = "/rest/v1/_agos_prompts"

# Default request timeout (seconds). Generous so Supabase cold-starts don't
# trip false negatives on health checks; per-call code paths may override.
_DEFAULT_TIMEOUT = 10.0


# ---------------------------------------------------------------------------
# Row ↔ dataclass adapters (mirrors local_pg_store but for JSON)
# ---------------------------------------------------------------------------


def _maybe_uuid(v: Any) -> Optional[UUID]:
    if v is None:
        return None
    if isinstance(v, UUID):
        return v
    return UUID(str(v))


def _agent_from_row(row: dict) -> Agent:
    return Agent(
        id=_maybe_uuid(row["id"]),
        tenant_id=_maybe_uuid(row.get("tenant_id")),
        persona_id=row["persona_id"],
        name=row["name"],
        description=row.get("description"),
        prompt_id=_maybe_uuid(row.get("prompt_id")),
        metadata=dict(row.get("metadata_") or {}),
        status=row.get("status") or "active",
        created_at=str(row.get("created_at") or ""),
        created_by=_maybe_uuid(row.get("created_by")),
        updated_at=str(row.get("updated_at") or ""),
    )


def _prompt_from_row(row: dict) -> Prompt:
    return Prompt(
        id=_maybe_uuid(row["id"]),
        tenant_id=_maybe_uuid(row.get("tenant_id")),
        name=row["name"],
        body=row["body"],
        version=int(row.get("version") or 1),
        supersedes_id=_maybe_uuid(row.get("supersedes_id")),
        status=row.get("status") or "active",
        metadata=dict(row.get("metadata_") or {}),
        created_at=str(row.get("created_at") or ""),
        created_by=_maybe_uuid(row.get("created_by")),
    )


def _agent_to_row(agent: Agent) -> dict:
    return {
        "id": str(agent.id) if agent.id else None,
        "tenant_id": str(agent.tenant_id) if agent.tenant_id else None,
        "persona_id": agent.persona_id,
        "name": agent.name,
        "description": agent.description,
        "prompt_id": str(agent.prompt_id) if agent.prompt_id else None,
        "metadata_": dict(agent.metadata or {}),
        "status": agent.status or "active",
        "created_by": str(agent.created_by) if agent.created_by else None,
    }


def _prompt_to_row(prompt: Prompt) -> dict:
    return {
        "id": str(prompt.id) if prompt.id else None,
        "tenant_id": str(prompt.tenant_id) if prompt.tenant_id else None,
        "name": prompt.name,
        "body": prompt.body,
        "version": int(prompt.version or 1),
        "supersedes_id": str(prompt.supersedes_id) if prompt.supersedes_id else None,
        "status": prompt.status or "active",
        "metadata_": dict(prompt.metadata or {}),
        "created_by": str(prompt.created_by) if prompt.created_by else None,
    }


# ---------------------------------------------------------------------------
# Shared HTTP base
# ---------------------------------------------------------------------------


class _SupabaseBase:
    """Shared connection + header machinery for both stores."""

    def __init__(
        self,
        url: str,
        service_role_key: str,
        timeout: float = _DEFAULT_TIMEOUT,
    ) -> None:
        if not url:
            raise ValueError("Supabase URL is required")
        if not service_role_key:
            raise ValueError("Supabase service-role key is required")
        # Strip trailing slash so path concat is predictable.
        self._base = url.rstrip("/")
        self._key = service_role_key
        self._timeout = timeout

    def _headers(self, prefer: Optional[str] = None) -> dict:
        h = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if prefer:
            h["Prefer"] = prefer
        return h

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self._base, timeout=self._timeout)

    async def _health(self, path: str) -> dict:
        """Cheap connectivity probe: limit=1 GET against the table."""
        t0 = time.perf_counter()
        try:
            async with self._client() as client:
                resp = await client.get(
                    path,
                    headers=self._headers(),
                    params={"select": "id", "limit": 1},
                )
            latency = int((time.perf_counter() - t0) * 1000)
            if resp.status_code >= 400:
                return {
                    "ok": False,
                    "latency_ms": latency,
                    "error": f"HTTP {resp.status_code}: {resp.text[:200]}",
                }
            return {"ok": True, "latency_ms": latency}
        except Exception as e:
            return {
                "ok": False,
                "latency_ms": int((time.perf_counter() - t0) * 1000),
                "error": str(e),
            }


# ---------------------------------------------------------------------------
# SupabaseAgentStore
# ---------------------------------------------------------------------------


_AGENT_UPDATABLE = frozenset({
    "name", "description", "prompt_id", "metadata", "status", "persona_id",
})


class SupabaseAgentStore(_SupabaseBase, AgentStore):
    async def list_agents(
        self,
        tenant_id: Optional[UUID] = None,
        include_global: bool = True,
    ) -> list[Agent]:
        params: dict = {"select": "*", "order": "created_at.desc.nullslast"}
        if tenant_id is not None and include_global:
            # PostgREST `or` filter: tenant_id=eq.<id> OR tenant_id IS NULL
            params["or"] = f"(tenant_id.eq.{tenant_id},tenant_id.is.null)"
        elif tenant_id is not None:
            params["tenant_id"] = f"eq.{tenant_id}"
        async with self._client() as client:
            resp = await client.get(
                _AGENTS_PATH, headers=self._headers(), params=params
            )
            resp.raise_for_status()
            return [_agent_from_row(r) for r in resp.json()]

    async def get_agent(self, agent_id: UUID) -> Optional[Agent]:
        async with self._client() as client:
            resp = await client.get(
                _AGENTS_PATH,
                headers=self._headers(),
                params={"id": f"eq.{agent_id}", "select": "*", "limit": 1},
            )
            resp.raise_for_status()
            rows = resp.json()
            return _agent_from_row(rows[0]) if rows else None

    async def get_agent_by_persona(
        self, tenant_id: Optional[UUID], persona_id: str
    ) -> Optional[Agent]:
        params: dict = {
            "persona_id": f"eq.{persona_id}",
            "select": "*",
            "limit": 1,
        }
        if tenant_id is None:
            params["tenant_id"] = "is.null"
        else:
            params["tenant_id"] = f"eq.{tenant_id}"
        async with self._client() as client:
            resp = await client.get(
                _AGENTS_PATH, headers=self._headers(), params=params
            )
            resp.raise_for_status()
            rows = resp.json()
            return _agent_from_row(rows[0]) if rows else None

    async def create_agent(self, agent: Agent) -> Agent:
        if not agent.id:
            agent.id = _uuid.uuid4()
        body = _agent_to_row(agent)
        async with self._client() as client:
            resp = await client.post(
                _AGENTS_PATH,
                headers=self._headers(prefer="return=representation"),
                json=body,
            )
            resp.raise_for_status()
            rows = resp.json()
            return _agent_from_row(rows[0] if isinstance(rows, list) else rows)

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
        if not clean:
            # Nothing to update; return current row for caller convenience.
            return await self.get_agent(agent_id)
        async with self._client() as client:
            resp = await client.patch(
                _AGENTS_PATH,
                headers=self._headers(prefer="return=representation"),
                params={"id": f"eq.{agent_id}"},
                json=clean,
            )
            resp.raise_for_status()
            rows = resp.json()
            if not rows:
                return None
            return _agent_from_row(rows[0])

    async def delete_agent(self, agent_id: UUID) -> bool:
        async with self._client() as client:
            resp = await client.delete(
                _AGENTS_PATH,
                headers=self._headers(prefer="return=representation"),
                params={"id": f"eq.{agent_id}"},
            )
            resp.raise_for_status()
            rows = resp.json()
            return bool(rows)

    async def health_check(self) -> dict:
        return await self._health(_AGENTS_PATH)


# ---------------------------------------------------------------------------
# SupabasePromptStore
# ---------------------------------------------------------------------------


class SupabasePromptStore(_SupabaseBase, PromptStore):
    async def list_prompts(
        self,
        tenant_id: Optional[UUID] = None,
        name: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[Prompt]:
        params: dict = {"select": "*", "order": "created_at.desc.nullslast"}
        if tenant_id is not None:
            params["tenant_id"] = f"eq.{tenant_id}"
        if name is not None:
            params["name"] = f"eq.{name}"
        if status is not None:
            params["status"] = f"eq.{status}"
        async with self._client() as client:
            resp = await client.get(
                _PROMPTS_PATH, headers=self._headers(), params=params
            )
            resp.raise_for_status()
            return [_prompt_from_row(r) for r in resp.json()]

    async def get_prompt(self, prompt_id: UUID) -> Optional[Prompt]:
        async with self._client() as client:
            resp = await client.get(
                _PROMPTS_PATH,
                headers=self._headers(),
                params={"id": f"eq.{prompt_id}", "select": "*", "limit": 1},
            )
            resp.raise_for_status()
            rows = resp.json()
            return _prompt_from_row(rows[0]) if rows else None

    async def resolve_active_prompt(
        self, tenant_id: Optional[UUID], name: str
    ) -> Optional[Prompt]:
        # 1. Tenant row
        if tenant_id is not None:
            async with self._client() as client:
                resp = await client.get(
                    _PROMPTS_PATH,
                    headers=self._headers(),
                    params={
                        "tenant_id": f"eq.{tenant_id}",
                        "name": f"eq.{name}",
                        "status": "eq.active",
                        "select": "*",
                        "order": "version.desc",
                        "limit": 1,
                    },
                )
                resp.raise_for_status()
                rows = resp.json()
                if rows:
                    return _prompt_from_row(rows[0])
        # 2. Global fallback
        async with self._client() as client:
            resp = await client.get(
                _PROMPTS_PATH,
                headers=self._headers(),
                params={
                    "tenant_id": "is.null",
                    "name": f"eq.{name}",
                    "status": "eq.active",
                    "select": "*",
                    "order": "version.desc",
                    "limit": 1,
                },
            )
            resp.raise_for_status()
            rows = resp.json()
            return _prompt_from_row(rows[0]) if rows else None

    async def create_prompt(self, prompt: Prompt) -> Prompt:
        if not prompt.id:
            prompt.id = _uuid.uuid4()
        body = _prompt_to_row(prompt)
        async with self._client() as client:
            resp = await client.post(
                _PROMPTS_PATH,
                headers=self._headers(prefer="return=representation"),
                json=body,
            )
            resp.raise_for_status()
            rows = resp.json()
            return _prompt_from_row(rows[0] if isinstance(rows, list) else rows)

    async def create_prompt_version(
        self, prompt_id: UUID, new_body: str
    ) -> Prompt:
        # 1. Read old row
        old = await self.get_prompt(prompt_id)
        if old is None:
            raise LookupError(f"prompt {prompt_id} not found")
        # 2. Insert new active row
        new_prompt = Prompt(
            id=_uuid.uuid4(),
            tenant_id=old.tenant_id,
            name=old.name,
            body=new_body,
            version=(old.version or 1) + 1,
            supersedes_id=old.id,
            status="active",
            metadata=dict(old.metadata or {}),
            created_by=old.created_by,
        )
        inserted = await self.create_prompt(new_prompt)
        # 3. Deprecate the old row
        async with self._client() as client:
            resp = await client.patch(
                _PROMPTS_PATH,
                headers=self._headers(prefer="return=minimal"),
                params={"id": f"eq.{prompt_id}"},
                json={"status": "deprecated"},
            )
            resp.raise_for_status()
        return inserted

    async def health_check(self) -> dict:
        return await self._health(_PROMPTS_PATH)
