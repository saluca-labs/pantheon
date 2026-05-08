"""User and agent account provisioning against Synapse.

PR A status: stub. The class shape and pure-function helpers are defined so
PR D can drop in a real Synapse admin client without touching call sites.

License: Apache-2.0.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

UserScope = Literal["primary", "sub", "agent"]


_AGENT_LOCALPART = re.compile(r"^@agent-[a-z0-9][-a-z0-9]{0,62}:[A-Za-z0-9.-]+$")
_USER_LOCALPART = re.compile(r"^@user-(primary|sub-[a-z0-9][-a-z0-9]{0,62}):[A-Za-z0-9.-]+$")


def is_valid_agent_id(matrix_id: str) -> bool:
    """Return True if ``matrix_id`` is a well-formed agent localpart."""
    return bool(_AGENT_LOCALPART.match(matrix_id))


def is_valid_user_id(matrix_id: str) -> bool:
    """Return True if ``matrix_id`` is a well-formed primary or sub user id."""
    return bool(_USER_LOCALPART.match(matrix_id))


def derive_agent_matrix_id(*, agent_role: str, server_name: str) -> str:
    """Construct the canonical Matrix id for an agent."""
    return f"@agent-{agent_role}:{server_name}"


def derive_user_matrix_id(*, scope: UserScope, sub_id: str | None, server_name: str) -> str:
    """Construct the canonical Matrix id for a primary or sub user."""
    if scope == "agent":
        raise ValueError("Use derive_agent_matrix_id for agent ids")
    if scope == "primary":
        return f"@user-primary:{server_name}"
    if scope == "sub":
        if not sub_id:
            raise ValueError("sub scope requires a sub_id")
        return f"@user-sub-{sub_id}:{server_name}"
    raise ValueError(f"unknown scope: {scope}")


@dataclass(frozen=True)
class ProvisioningRequest:
    """A request to bring a Matrix account into existence."""

    matrix_id: str
    scope: UserScope
    tenant_id: str
    agent_role: str | None = None
    display_name: str | None = None


class UserProvisioner:
    """Stub provisioner. PR D will replace ``ensure`` with real Synapse calls."""

    async def ensure(self, request: ProvisioningRequest) -> None:  # pragma: no cover — stub
        """Idempotently ensure the account exists in Synapse.

        Currently a no-op. PR D wires this to Synapse's admin API.
        """
        return None
