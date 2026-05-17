"""Wave H.2.b — Agent + Prompt store adapter layer.

Provides pluggable storage backends (LocalPg / Supabase) for `_agos_agents`
and `_agos_prompts`. Selection is config-driven via `_pantheon_config` rows
(see migration 0041). Factory lives in :mod:`src.agents.factory`.
"""

from src.agents.store import (
    Agent,
    AgentStore,
    Prompt,
    PromptStore,
)

__all__ = ["Agent", "AgentStore", "Prompt", "PromptStore"]
