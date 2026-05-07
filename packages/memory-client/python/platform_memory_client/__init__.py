"""platform_memory_client — async Python client for @platform/memory-service.

Speaks HTTP to the Node sidecar that wraps @platform/memory (vendored elysium).
See docs/decisions/ADR-003-elysium-internal-package.md.
"""

from .client import MemoryClient, Memory, MemoryClientError

__all__ = ["MemoryClient", "Memory", "MemoryClientError"]
