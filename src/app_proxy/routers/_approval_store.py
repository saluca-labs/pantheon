"""Shared in-memory approval queue store.

Separated into its own module to avoid circular imports between the
tools and approval routers.  A production deployment would back this
with the database.
"""

from __future__ import annotations

from typing import Any

# approval_id -> {status, request, plugin_name, timeout_seconds, audit_ref, created_at, result}
approval_store: dict[str, dict[str, Any]] = {}
