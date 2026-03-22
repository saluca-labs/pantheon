"""Tiresias Incident Controller — Credential management action executor.

Handles emergency suspension and reactivation of SoulKeys, and flags
manual credential rotation steps during incident response.
"""

from __future__ import annotations

import logging

import asyncpg

from src.actions.base import ActionExecutor
from src.models.incident import ActionRecord

log = logging.getLogger(__name__)


class CredentialAction(ActionExecutor):
    """Manage SoulKey credentials during security incidents."""

    # ------------------------------------------------------------------
    # SoulKey suspension
    # ------------------------------------------------------------------

    async def suspend_all_soulkeys(self, db_url: str, reason: str) -> dict:
        """Suspend all active SoulKeys in the database.

        Sets status='suspended', records the timestamp and reason.
        Returns the count of suspended keys.
        """
        conn = await asyncpg.connect(db_url)
        try:
            result = await conn.execute(
                """
                UPDATE _soulkeys
                SET status = 'suspended',
                    suspended_at = NOW(),
                    suspended_by = 'incident-controller',
                    suspended_reason = $1
                WHERE status = 'active'
                """,
                reason,
            )
            count = int(result.split()[-1]) if result else 0
            self.log.info(f"Suspended {count} SoulKeys: {reason}")
            return {"suspended_count": count, "reason": reason}
        finally:
            await conn.close()

    async def reactivate_soulkeys(
        self, db_url: str, incident_id: str
    ) -> dict:
        """Reactivate SoulKeys that were suspended by a specific incident.

        Only reactivates keys suspended by the incident-controller with the
        matching incident ID in the reason field.
        """
        conn = await asyncpg.connect(db_url)
        try:
            result = await conn.execute(
                """
                UPDATE _soulkeys
                SET status = 'active',
                    suspended_at = NULL,
                    suspended_by = NULL,
                    suspended_reason = NULL
                WHERE status = 'suspended'
                  AND suspended_by = 'incident-controller'
                  AND suspended_reason LIKE $1
                """,
                f"%{incident_id}%",
            )
            count = int(result.split()[-1]) if result else 0
            self.log.info(
                f"Reactivated {count} SoulKeys for incident {incident_id}"
            )
            return {"reactivated_count": count, "incident_id": incident_id}
        finally:
            await conn.close()

    # ------------------------------------------------------------------
    # JWT key rotation (manual step)
    # ------------------------------------------------------------------

    async def rotate_jwt_key(self) -> dict:
        """Flag JWT key rotation as a manual action.

        JWT key rotation requires coordinated service restarts and cannot
        be safely automated. This method logs the requirement and returns
        a flag for the operator.
        """
        self.log.warning(
            "JWT key rotation flagged — this is a MANUAL step. "
            "Rotate the signing key in Vault, then restart all "
            "services that validate JWTs."
        )
        return {
            "action": "rotate_jwt_key",
            "automated": False,
            "manual_steps": [
                "Rotate signing key in HashiCorp Vault",
                "Update JWKS endpoint",
                "Restart soulauth, api-gateway, and webhook services",
                "Verify token validation with smoke tests",
            ],
        }

    # ------------------------------------------------------------------
    # ActionExecutor interface
    # ------------------------------------------------------------------

    async def _execute(self, action: ActionRecord, **kwargs) -> dict | None:
        """Dispatch to the correct credential management method."""
        dispatch = {
            "suspend_all_soulkeys": self.suspend_all_soulkeys,
            "reactivate_soulkeys": self.reactivate_soulkeys,
            "rotate_jwt_key": self.rotate_jwt_key,
        }
        handler = dispatch.get(action.action_type)
        if handler is None:
            raise ValueError(f"Unknown action_type: {action.action_type}")
        return await handler(**kwargs)

    async def rollback(self, action: ActionRecord) -> ActionRecord:
        """Rollback a suspend_all_soulkeys action by reactivating keys."""
        if action.action_type != "suspend_all_soulkeys":
            self.log.warning(f"No rollback defined for {action.action_type}")
            return action

        details = action.details or {}
        action.status = "rolling_back"
        try:
            # The reason field should contain the incident ID
            reason = details.get("reason", "")
            # Extract incident ID from reason if present
            incident_id = reason if reason else action.target
            db_url = details.get("db_url", "")
            if not db_url:
                raise RuntimeError("db_url not available for rollback")
            await self.reactivate_soulkeys(db_url, incident_id)
            action.status = "rolled_back"
            self.log.info(f"Rolled back SoulKey suspension for {action.target}")
        except Exception as e:
            action.status = "rollback_failed"
            action.error = f"Rollback failed: {e}"
            self.log.error(f"Credential rollback failed: {e}")
        return action
