"""decrypt_content — STUBBED.

Per CESO 2026-04-15: deferred to Phase G.1. Requires Tier 4 MFA step-up
(FIDO/WebAuthn) to be live before this tool can safely decrypt any audit
row content.
"""
from __future__ import annotations

from typing import Any

from ..core.tenant import TenantContext


async def handle(ctx: TenantContext, params: dict[str, Any]) -> dict[str, Any]:
    return {
        "error": "not_implemented",
        "reason": "requires_mfa_step_up",
        "eta": "G.1_after_tier4",
        "tenant_id": str(ctx.tenant_id),
    }
