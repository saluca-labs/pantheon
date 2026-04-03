"""
JIT (Just-In-Time) user provisioning for OIDC SSO.
Creates or updates _soul_users from validated OIDC claims.
"""

import structlog
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulUser, SoulIdPConfig, SoulUserInvite, SoulTeam, SoulTeamMember

logger = structlog.get_logger(__name__)

# Group-to-role claim key used in IdP tokens (common: "groups", "roles")
GROUP_CLAIMS = ["groups", "roles", "cognito:groups"]


def _resolve_role_from_groups(
    groups: list[str],
    group_role_map: dict,
    default_role: str = "viewer",
) -> str:
    """
    Map IdP groups to Tiresias admin roles using group_role_map.
    Returns the highest-ranked role found, or default_role.
    """
    rank = {"viewer": 0, "operator": 1, "admin": 2, "owner": 3}
    best_role = default_role
    best_rank = rank.get(default_role, 0)

    for group in groups:
        role = group_role_map.get(group)
        if role and rank.get(role, -1) > best_rank:
            best_role = role
            best_rank = rank[role]

    return best_role


def _extract_groups_from_claims(claims: dict) -> list[str]:
    """Extract group membership from OIDC claims."""
    for key in GROUP_CLAIMS:
        val = claims.get(key)
        if isinstance(val, list):
            return [str(g) for g in val]
        if isinstance(val, str):
            return [val]
    return []


async def jit_provision_user(
    db: AsyncSession,
    tenant_id: UUID,
    idp_config: SoulIdPConfig,
    claims: dict,
) -> SoulUser:
    """
    JIT provision or update a portal user from validated OIDC claims.

    Flow:
    1. Lookup by (tenant_id, idp_provider, idp_sub)
    2. If not found: create with default role 'viewer', apply group_role_map
    3. If found: update last_login, re-apply group_role_map
    4. Reject if user.status == 'suspended'

    Returns the SoulUser object.
    Raises HTTPException(403) for suspended users.
    """
    sub = claims.get("sub", "")
    email = claims.get("email", "")
    display_name = claims.get("name") or claims.get("display_name") or email
    provider_type = idp_config.provider_type
    group_role_map: dict = idp_config.group_role_map or {}
    now = datetime.now(timezone.utc)

    # Determine role from IdP groups
    groups = _extract_groups_from_claims(claims)
    new_role = _resolve_role_from_groups(groups, group_role_map, default_role="viewer")

    # Look up existing user
    result = await db.execute(
        select(SoulUser).where(
            SoulUser.tenant_id == tenant_id,
            SoulUser.idp_provider == provider_type,
            SoulUser.idp_sub == sub,
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        # JIT create
        logger.info(
            "jit.creating_user",
            tenant_id=str(tenant_id),
            email=email,
            provider=provider_type,
            role=new_role,
        )
        user = SoulUser(
            tenant_id=tenant_id,
            email=email,
            display_name=display_name,
            admin_role=new_role,
            idp_sub=sub,
            idp_provider=provider_type,
            status="active",
            last_login=now,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
    else:
        # Check suspension
        if user.status == "suspended":
            logger.warning(
                "jit.user_suspended",
                user_id=str(user.id),
                email=email,
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "account_suspended",
                    "message": "Your account has been suspended. Contact your administrator.",
                },
            )
        if user.status == "deactivated":
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "account_deactivated",
                    "message": "Your account has been deactivated.",
                },
            )

        # Update user attributes
        await db.execute(
            update(SoulUser)
            .where(SoulUser.id == user.id)
            .values(
                last_login=now,
                display_name=display_name,
                admin_role=new_role if group_role_map else user.admin_role,
                updated_at=now,
            )
        )
        user.last_login = now
        user.display_name = display_name
        if group_role_map:
            user.admin_role = new_role

        logger.info(
            "jit.updated_user",
            user_id=str(user.id),
            email=email,
            role=user.admin_role,
        )

    # --- Invite matching & default team assignment ---
    await _apply_invite_or_default_team(db, user, tenant_id, email, now)

    return user


async def _get_default_team_id(db: AsyncSession, tenant_id: UUID) -> Optional[UUID]:
    """Return the ID of the tenant's default team, or None."""
    result = await db.execute(
        select(SoulTeam.id).where(
            SoulTeam.tenant_id == tenant_id,
            SoulTeam.is_default == True,  # noqa: E712
        )
    )
    return result.scalar_one_or_none()


async def _add_to_team(
    db: AsyncSession,
    team_id: UUID,
    user_id: UUID,
    team_role: str,
    added_by: Optional[UUID] = None,
) -> None:
    """Add a user to a team if not already a member."""
    from sqlalchemy import select as _sel
    exists = await db.execute(
        _sel(SoulTeamMember.id).where(
            SoulTeamMember.team_id == team_id,
            SoulTeamMember.user_id == user_id,
        )
    )
    if exists.scalar_one_or_none():
        return  # already a member
    membership = SoulTeamMember(
        team_id=team_id,
        user_id=user_id,
        team_role=team_role,
        added_by=added_by,
    )
    db.add(membership)
    await db.flush()


async def _apply_invite_or_default_team(
    db: AsyncSession,
    user: SoulUser,
    tenant_id: UUID,
    email: str,
    now,
) -> None:
    """
    After JIT provisioning, check for a pending invite matching the user's email.
    If found: apply the invite's role/team settings and mark it accepted.
    If not found: add the user to the tenant's default team as 'member'.
    """
    from datetime import datetime as _dt, timezone as _tz

    invite_result = await db.execute(
        select(SoulUserInvite).where(
            SoulUserInvite.tenant_id == tenant_id,
            SoulUserInvite.email == email,
            SoulUserInvite.status == "pending",
            SoulUserInvite.expires_at > _dt.now(_tz.utc),
        )
    )
    invite = invite_result.scalar_one_or_none()

    if invite:
        # Apply invite's portal role (overrides group_role_map)
        await db.execute(
            update(SoulUser)
            .where(SoulUser.id == user.id)
            .values(admin_role=invite.invited_role, updated_at=now)
        )
        user.admin_role = invite.invited_role

        # Add to the invite's target team (or default)
        target_team_id = invite.team_id or await _get_default_team_id(db, tenant_id)
        if target_team_id:
            await _add_to_team(db, target_team_id, user.id, invite.invited_team_role, invite.invited_by)

        # Mark invite accepted
        await db.execute(
            update(SoulUserInvite)
            .where(SoulUserInvite.id == invite.id)
            .values(
                status="accepted",
                accepted_at=now,
                accepted_user_id=user.id,
            )
        )
        await db.flush()

        logger.info(
            "jit.invite_applied",
            user_id=str(user.id),
            invite_id=str(invite.id),
            role=invite.invited_role,
            team_role=invite.invited_team_role,
        )
    else:
        # No invite — add to default team as member
        default_team_id = await _get_default_team_id(db, tenant_id)
        if default_team_id:
            await _add_to_team(db, default_team_id, user.id, "member")
