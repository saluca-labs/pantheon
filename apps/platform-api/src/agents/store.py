"""Agent + Prompt store interfaces (W-H.2.b).

Two abstract storage adapters that implementations realize against either:

  * LocalPg     — pantheon's in-container Postgres (default for OSS self-hosters)
  * Supabase    — PostgREST + service-role auth (managed-Postgres opt-in)

Both back the same logical tables (``_agos_agents``, ``_agos_prompts``) seeded
by Alembic migration 0039.

Locked decisions (HANDOFF_pantheon_agents_providers_routing_2026-05-17.md):
  * #2  persona_id is the natural key for agents.
  * #3  prompts are DB-canonical (append-only, supersedes_id chain).
  * #4  plain-text prompts only — no templating.
  * #9  agents are model-independent (routing lives in the policy YAML).

This module defines ONLY the abstract surface plus the dataclasses ferried
across it. Concrete implementations are in :mod:`local_pg_store` and
:mod:`supabase_store`. The runtime selector is :mod:`factory`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID


# ---------------------------------------------------------------------------
# Data carriers
# ---------------------------------------------------------------------------


@dataclass
class Agent:
    """An ``_agos_agents`` row materialized as a portable record.

    Mirrors the ORM model in :class:`src.database.models.AgosAgent` but
    decouples store callers from SQLAlchemy so a non-ORM backend
    (Supabase PostgREST) can produce the same shape.
    """

    id: UUID
    tenant_id: Optional[UUID]           # NULL = global template
    persona_id: str
    name: str
    description: Optional[str]
    prompt_id: Optional[UUID]
    metadata: dict = field(default_factory=dict)
    status: str = "active"              # active | draft | archived
    created_at: str = ""                # ISO 8601
    created_by: Optional[UUID] = None
    updated_at: str = ""                # ISO 8601


@dataclass
class Prompt:
    """An ``_agos_prompts`` row materialized as a portable record."""

    id: UUID
    tenant_id: Optional[UUID]           # NULL = global template
    name: str
    body: str                           # plain text (decision #4)
    version: int = 1
    supersedes_id: Optional[UUID] = None
    status: str = "active"              # draft | active | deprecated
    metadata: dict = field(default_factory=dict)
    created_at: str = ""
    created_by: Optional[UUID] = None


# ---------------------------------------------------------------------------
# AgentStore
# ---------------------------------------------------------------------------


class AgentStore(ABC):
    """Abstract CRUD surface for ``_agos_agents``.

    All methods are async. Implementations must be safe to instantiate per
    request OR cached as a process-wide singleton — they should NOT hold
    request-scoped state.

    Tenant scoping:
      * ``tenant_id=None`` and ``include_global=True`` returns global rows.
      * Tenant-supplied queries should pass the authenticated caller's
        tenant_id; the store does NOT enforce auth — that's the API layer.
    """

    @abstractmethod
    async def list_agents(
        self,
        tenant_id: Optional[UUID] = None,
        include_global: bool = True,
    ) -> list[Agent]:
        """List agents for ``tenant_id``.

        If ``include_global`` is True, also include rows where
        ``tenant_id IS NULL`` (global / marketplace templates).
        """

    @abstractmethod
    async def get_agent(self, agent_id: UUID) -> Optional[Agent]:
        """Fetch an agent by primary key. Returns None on miss."""

    @abstractmethod
    async def get_agent_by_persona(
        self, tenant_id: Optional[UUID], persona_id: str
    ) -> Optional[Agent]:
        """Look up an agent by its natural key ``(tenant_id, persona_id)``."""

    @abstractmethod
    async def create_agent(self, agent: Agent) -> Agent:
        """Insert a new agent row. ``agent.id`` may be a placeholder UUID;
        the store returns the persisted row (with server-generated fields
        like ``created_at`` populated).
        """

    @abstractmethod
    async def update_agent(
        self, agent_id: UUID, patch: dict
    ) -> Optional[Agent]:
        """Apply a partial update. Returns the updated row, or None if the
        row doesn't exist. The store decides which keys are accepted —
        unknown keys should be silently ignored to keep wire/store decoupled.
        """

    @abstractmethod
    async def delete_agent(self, agent_id: UUID) -> bool:
        """Hard delete. Returns True on success, False if the row was absent.
        Most callers should prefer ``update_agent(..., {'status': 'archived'})``.
        """

    @abstractmethod
    async def health_check(self) -> dict:
        """Return ``{'ok': bool, 'latency_ms': int, 'error': str?}``.

        Implementations should perform the cheapest round-trip that exercises
        the auth + connectivity path (e.g. ``SELECT 1`` for LocalPg, or
        ``HEAD /rest/v1/_agos_agents?limit=1`` for Supabase).
        """


# ---------------------------------------------------------------------------
# PromptStore
# ---------------------------------------------------------------------------


class PromptStore(ABC):
    """Abstract CRUD + versioning surface for ``_agos_prompts``.

    Prompt rows are append-only. ``create_prompt_version`` is the canonical
    way to evolve a prompt: it inserts a new row, marks the prior active
    row as ``deprecated``, sets ``supersedes_id``, and bumps ``version``.
    """

    @abstractmethod
    async def list_prompts(
        self,
        tenant_id: Optional[UUID] = None,
        name: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[Prompt]:
        """List prompts filtered by tenant, name, and/or status.

        Any combination of filters may be None to skip that filter.
        Returns rows in ``created_at DESC`` order.
        """

    @abstractmethod
    async def get_prompt(self, prompt_id: UUID) -> Optional[Prompt]:
        """Fetch a prompt by primary key."""

    @abstractmethod
    async def resolve_active_prompt(
        self, tenant_id: Optional[UUID], name: str
    ) -> Optional[Prompt]:
        """Resolve the currently-active prompt for ``name``.

        Lookup order:
          1. Tenant-owned active row (``tenant_id`` match, ``status='active'``)
          2. Global active row (``tenant_id IS NULL``, ``status='active'``)

        Returns None if no active row exists in either scope.
        """

    @abstractmethod
    async def create_prompt(self, prompt: Prompt) -> Prompt:
        """Insert a brand-new prompt (version 1, no supersedes chain)."""

    @abstractmethod
    async def create_prompt_version(
        self, prompt_id: UUID, new_body: str
    ) -> Prompt:
        """Append a new version that supersedes ``prompt_id``.

        Atomic sequence:
          1. Read the existing row (``prompt_id``).
          2. Insert a new row with ``body=new_body``, ``version=old.version+1``,
             ``supersedes_id=old.id``, ``status='active'``.
          3. Update the old row's ``status`` to ``deprecated``.

        Returns the newly-inserted row.
        """

    @abstractmethod
    async def health_check(self) -> dict:
        """Same contract as :meth:`AgentStore.health_check`."""
