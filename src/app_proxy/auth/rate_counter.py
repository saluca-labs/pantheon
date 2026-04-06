"""In-memory sliding-window counter for tool-call rate limiting.

Tracks calls per (agent_id, plugin_name) key within a configurable time
window.  All operations are O(1) amortised and thread-safe via a
:class:`threading.Lock`.
"""

from __future__ import annotations

import threading
import time
from collections import deque


class RateCounter:
    """Sliding-window counter keyed by ``(agent_id, plugin_name)``."""

    def __init__(self, window_seconds: int = 3600) -> None:
        self._window_seconds = window_seconds
        self._windows: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Helpers (caller must hold lock)
    # ------------------------------------------------------------------
    @staticmethod
    def _key(agent_id: str, plugin_name: str) -> str:
        return f"{agent_id}::{plugin_name}"

    def _prune(self, key: str) -> None:
        """Drop timestamps older than the window.  Caller holds lock."""
        q = self._windows.get(key)
        if q is None:
            return
        cutoff = time.monotonic() - self._window_seconds
        while q and q[0] < cutoff:
            q.popleft()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def get_count(self, agent_id: str, plugin_name: str) -> int:
        """Return the number of calls in the current window."""
        key = self._key(agent_id, plugin_name)
        with self._lock:
            self._prune(key)
            q = self._windows.get(key)
            return len(q) if q else 0

    def record(self, agent_id: str, plugin_name: str) -> None:
        """Record a new call at the current instant."""
        key = self._key(agent_id, plugin_name)
        with self._lock:
            q = self._windows.setdefault(key, deque())
            q.append(time.monotonic())
            self._prune(key)

    def cleanup(self) -> int:
        """Remove fully-stale keys.  Call periodically (e.g. from a timer).

        Returns the number of keys removed.
        """
        removed = 0
        with self._lock:
            stale_keys: list[str] = []
            for key in self._windows:
                self._prune(key)
                if not self._windows[key]:
                    stale_keys.append(key)
            for key in stale_keys:
                del self._windows[key]
                removed += 1
        return removed
