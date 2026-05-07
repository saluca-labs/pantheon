"""DEPRECATED — in-memory approval store replaced by DB-backed ApprovalService.

This module is retained only to avoid import errors in any code that has not
yet been migrated.  The dict is no longer used by the tools or approval
routers; all approval state is now managed by
``app_proxy.approval.service.ApprovalService``.
"""

from __future__ import annotations

from typing import Any

# Kept as an empty dict so stale imports don't crash on attribute access.
approval_store: dict[str, dict[str, Any]] = {}
