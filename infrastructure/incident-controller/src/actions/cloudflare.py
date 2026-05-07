"""Tiresias Incident Controller — Cloudflare DNS action executor.

Manages DNS record updates for failover/swap operations via the
Cloudflare API v4, with rollback support.
"""

from __future__ import annotations

import logging

import httpx

from src.actions.base import ActionExecutor
from src.models.incident import ActionRecord

log = logging.getLogger(__name__)


class CloudflareAction(ActionExecutor):
    """Manage Cloudflare DNS records for incident response."""

    def __init__(self, api_token: str, zone_id: str) -> None:
        super().__init__()
        self.api_token = api_token
        self.zone_id = zone_id
        self.base_url = (
            f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records"
        )
        self._headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        url: str,
        *,
        params: dict | None = None,
        json_body: dict | None = None,
    ) -> dict:
        """Issue an authenticated request to the Cloudflare API."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(
                method,
                url,
                headers=self._headers,
                params=params,
                json=json_body,
            )
            resp.raise_for_status()
            return resp.json()

    # ------------------------------------------------------------------
    # DNS operations
    # ------------------------------------------------------------------

    async def get_dns_record(
        self, record_name: str, record_type: str
    ) -> dict:
        """Fetch a DNS record by name and type.

        Returns the first matching record dict from the Cloudflare API.
        """
        data = await self._request(
            "GET",
            self.base_url,
            params={"name": record_name, "type": record_type},
        )
        results = data.get("result", [])
        if not results:
            raise LookupError(
                f"DNS record not found: {record_type} {record_name}"
            )
        return results[0]

    async def swap_dns(
        self,
        record_name: str,
        record_type: str,
        new_value: str,
        proxied: bool = True,
    ) -> dict:
        """Update a DNS record to a new value (failover swap).

        Returns a dict with old_value and new_value for rollback tracking.
        """
        record = await self.get_dns_record(record_name, record_type)
        old_value = record["content"]
        record_id = record["id"]

        self.log.info(
            f"Swapping {record_type} {record_name}: {old_value} -> {new_value}"
        )

        await self._request(
            "PATCH",
            f"{self.base_url}/{record_id}",
            json_body={
                "content": new_value,
                "proxied": proxied,
            },
        )

        return {
            "record_name": record_name,
            "record_type": record_type,
            "old_value": old_value,
            "new_value": new_value,
            "proxied": proxied,
        }

    async def rollback_dns(
        self,
        record_name: str,
        record_type: str,
        old_value: str,
        proxied: bool = True,
    ) -> dict:
        """Restore a DNS record to its previous value."""
        self.log.info(
            f"Rolling back {record_type} {record_name} to {old_value}"
        )
        return await self.swap_dns(record_name, record_type, old_value, proxied)

    # ------------------------------------------------------------------
    # ActionExecutor interface
    # ------------------------------------------------------------------

    async def _execute(self, action: ActionRecord, **kwargs) -> dict | None:
        """Dispatch to the correct method based on action_type."""
        dispatch = {
            "swap_dns": self.swap_dns,
            "get_dns_record": self.get_dns_record,
            "rollback_dns": self.rollback_dns,
        }
        handler = dispatch.get(action.action_type)
        if handler is None:
            raise ValueError(f"Unknown action_type: {action.action_type}")
        return await handler(**kwargs)

    async def rollback(self, action: ActionRecord) -> ActionRecord:
        """Rollback a completed DNS swap using stored old_value."""
        if action.action_type != "swap_dns":
            self.log.warning(f"No rollback defined for {action.action_type}")
            return action

        details = action.details or {}
        old_value = details.get("old_value")
        if not old_value:
            self.log.error("Cannot rollback swap_dns: old_value not recorded")
            action.status = "rollback_failed"
            action.error = "old_value not available for rollback"
            return action

        action.status = "rolling_back"
        try:
            await self.rollback_dns(
                record_name=details["record_name"],
                record_type=details["record_type"],
                old_value=old_value,
                proxied=details.get("proxied", True),
            )
            action.status = "rolled_back"
            self.log.info(f"Rolled back DNS for {action.target}")
        except Exception as e:
            action.status = "rollback_failed"
            action.error = f"Rollback failed: {e}"
            self.log.error(f"DNS rollback failed: {e}")
        return action
