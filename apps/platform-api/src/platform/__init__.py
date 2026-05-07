"""platform — V2 unification submodule.

Hosts the canonical BFF→API integration surface added in
``platform/unification-v2``:

  * ``identity_router`` — echo endpoint for the BFF identity headers
  * ``memory`` — FastAPI dependency exposing a shared MemoryClient
  * ``health_router`` — readiness aggregator that fans out to deps

These routers are intentionally additive: they do not modify existing
SoulAuth/SoulGate/SoulWatch business logic and can be removed wholesale
without affecting the rest of the API.
"""

from .memory import (
    get_memory_client,
    init_memory_client,
    shutdown_memory_client,
)

# Submodules ``identity_router`` and ``health_router`` are imported directly
# by callers (see main.py) to avoid name-collisions between the submodule
# and the APIRouter instance it exports.

__all__ = [
    "get_memory_client",
    "init_memory_client",
    "shutdown_memory_client",
]
