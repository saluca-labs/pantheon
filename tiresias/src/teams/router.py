"""
Team and user management router.

Endpoints for managing users, teams, team membership, and invitations
within a tenant. All queries are tenant-scoped via the authenticated
session user to prevent IDOR.

Prefix: /v1/teams  (teams + members)
        /v1/users  (user management)
        /v1/invites (invitation flow)
"""

import hashlib
import re
import secrets
import uuid
import structlog
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import (
    SoulTeam,
    SoulTeamMember,
    SoulUser,
    SoulUserInvite,
)
from src.auth.rbac import require_permission
from src.auth.oidc_session import validate_session
from src.audit.logger import log_auth_event

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Teams"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _resolve_session_user(request: Request, db: AsyncSession) -> Optional[SoulUser]:
    """Extract authenticated SoulUser from session token or OIDC state."""
    # Try OIDC user already resolved by PEP middleware
    oidc_user = getattr(request.state, "oidc_user", None)
    if oidc_user is not None:
        return oidc_user

    # Try session token from Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        raw_token = auth_header[7:]
        result = await validate_session(db, raw_token)
        if result:
            _session, user = result
            return user

    # Fallback: try rbac_soulkey (soulkey-based auth puts user.id on the mock)
    rbac_sk = getattr(request.state, "rbac_soulkey", None)
    if rbac_sk is not None:
        sk_id = getattr(rbac_sk, "id", None)
        if sk_id:
            result = await db.execute(select(SoulUser).where(SoulUser.id == sk_id))
            user = result.scalar_one_or_none()
            if user:
                return user

    return None


def _require_account_admin(user: SoulUser) -> None:
    """Raise 403 if user is not an account admin or secondary admin."""
    if not (user.is_account_admin or user.is_secondary_admin):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "permission_denied",
                "message": "Account admin access required.",
            },
        )


def _require_primary_admin(user: SoulUser) -> None:
    """Raise 403 if user is not the primary account admin."""
    if not user.is_account_admin:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "permission_denied",
                "message": "Primary account admin access required.",
            },
        )


def _slugify(name: str) -> str:
    """Generate a URL-safe slug from a team name."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:63] if slug else "team"


async def _get_default_team(db: AsyncSession, tenant_id: uuid.UUID) -> Optional[SoulTeam]:
    """Return the default team for a tenant, or None."""
    result = await db.execute(
        select(SoulTeam).where(
            SoulTeam.tenant_id == tenant_id,
            SoulTeam.is_default == True,  # noqa: E712
        )
    )
    return result.scalar_one_or_none()


async def _ensure_authenticated(request: Request, db: AsyncSession) -> SoulUser:
    """Resolve session user or raise 401."""
    user = await _resolve_session_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

# -- Users --

class TeamMembershipBrief(BaseModel):
    team_id: str
    team_name: str
    team_role: str


class UserListItem(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    admin_role: str
    is_account_admin: bool
    is_secondary_admin: bool
    primary_team_id: Optional[str] = None
    status: str
    last_login: Optional[str] = None
    created_at: Optional[str] = None
    teams: list[TeamMembershipBrief] = []


class UserListResponse(BaseModel):
    users: list[UserListItem]
    total: int


class CreateUserRequest(BaseModel):
    email: str = Field(..., min_length=3)
    display_name: Optional[str] = None
    admin_role: str = Field(default="viewer")
    password: Optional[str] = Field(default=None, min_length=8)
    team_id: Optional[str] = None
    team_role: str = "member"


class UpdateUserRequest(BaseModel):
    admin_role: Optional[str] = None
    display_name: Optional[str] = None
    status: Optional[str] = None
    primary_team_id: Optional[str] = None
    is_secondary_admin: Optional[bool] = None


class UserDetailResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    admin_role: str
    is_account_admin: bool
    is_secondary_admin: bool
    primary_team_id: Optional[str] = None
    status: str
    last_login: Optional[str] = None
    created_at: Optional[str] = None
    teams: list[TeamMembershipBrief] = []


# -- Teams --

class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    slug: Optional[str] = None


class UpdateTeamRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None


class TeamResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    is_default: bool
    member_count: int
    created_at: Optional[str] = None


class TeamListResponse(BaseModel):
    teams: list[TeamResponse]
    total: int


# -- Team Members --

class AddTeamMemberRequest(BaseModel):
    user_id: str
    team_role: str = "member"


class UpdateTeamMemberRequest(BaseModel):
    team_role: str


class TeamMemberItem(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
    team_role: str
    admin_role: str
    joined_at: Optional[str] = None


class TeamMemberListResponse(BaseModel):
    members: list[TeamMemberItem]
    total: int


# -- Invites --

class CreateInviteRequest(BaseModel):
    email: str = Field(..., min_length=3)
    admin_role: str = "viewer"
    team_id: Optional[str] = None
    team_role: str = "member"
    expires_hours: int = Field(default=72, ge=1, le=168)


class InviteResponse(BaseModel):
    id: str
    email: str
    invited_role: str
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    status: str
    expires_at: str
    created_at: Optional[str] = None


class InviteListResponse(BaseModel):
    invites: list[InviteResponse]
    total: int


class AcceptInviteRequest(BaseModel):
    display_name: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)


# ---------------------------------------------------------------------------
# Helpers for building response objects
# ---------------------------------------------------------------------------

async def _user_teams(db: AsyncSession, user_id: uuid.UUID) -> list[TeamMembershipBrief]:
    """Fetch team memberships for a user."""
    result = await db.execute(
        select(SoulTeamMember, SoulTeam.name).join(
            SoulTeam, SoulTeamMember.team_id == SoulTeam.id
        ).where(SoulTeamMember.user_id == user_id)
    )
    return [
        TeamMembershipBrief(
            team_id=str(row[0].team_id),
            team_name=row[1],
            team_role=row[0].team_role,
        )
        for row in result.all()
    ]


def _ts(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime to ISO string or None."""
    return dt.isoformat() if dt else None


async def _build_user_item(db: AsyncSession, u: SoulUser) -> UserListItem:
    teams = await _user_teams(db, u.id)
    return UserListItem(
        id=str(u.id),
        email=u.email,
        display_name=u.display_name,
        admin_role=u.admin_role,
        is_account_admin=u.is_account_admin,
        is_secondary_admin=u.is_secondary_admin,
        primary_team_id=str(u.primary_team_id) if u.primary_team_id else None,
        status=u.status,
        last_login=_ts(u.last_login),
        created_at=_ts(u.created_at),
        teams=teams,
    )


async def _team_member_count(db: AsyncSession, team_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(SoulTeamMember).where(
            SoulTeamMember.team_id == team_id
        )
    )
    return result.scalar() or 0


# ═══════════════════════════════════════════════════════════════════════════
# USER ENDPOINTS — /v1/users
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/v1/users",
    response_model=UserListResponse,
    summary="List users in caller's tenant",
    dependencies=[Depends(require_permission("users:read"))],
)
async def list_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List all users belonging to the caller's tenant."""
    current_user = await _ensure_authenticated(request, db)
    tenant_id = current_user.tenant_id

    q = select(SoulUser).where(SoulUser.tenant_id == tenant_id)
    if status:
        q = q.where(SoulUser.status == status)

    count_q = select(func.count()).select_from(SoulUser).where(SoulUser.tenant_id == tenant_id)
    if status:
        count_q = count_q.where(SoulUser.status == status)

    total = (await db.execute(count_q)).scalar() or 0
    rows = (await db.execute(q.order_by(SoulUser.created_at).offset(offset).limit(limit))).scalars().all()

    users = [await _build_user_item(db, u) for u in rows]
    return UserListResponse(users=users, total=total)


@router.post(
    "/v1/users",
    response_model=UserDetailResponse,
    summary="Create a local user (account admin only)",
    dependencies=[Depends(require_permission("users:create"))],
    status_code=201,
)
async def create_user(
    body: CreateUserRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new local-auth user. Requires account admin."""
    current_user = await _ensure_authenticated(request, db)
    _require_account_admin(current_user)
    tenant_id = current_user.tenant_id

    # Validate role
    if body.admin_role not in ("owner", "admin", "operator", "viewer"):
        raise HTTPException(status_code=422, detail="Invalid admin_role")

    # Check duplicate
    exists = await db.execute(
        select(SoulUser.id).where(
            SoulUser.tenant_id == tenant_id,
            SoulUser.email == body.email,
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User with this email already exists in tenant")

    # Hash password if provided
    password_hash = None
    if body.password:
        import bcrypt
        password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()

    user = SoulUser(
        tenant_id=tenant_id,
        email=body.email,
        display_name=body.display_name or body.email,
        admin_role=body.admin_role,
        password_hash=password_hash,
        auth_provider="local" if body.password else "oidc",
        status="active",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    # Add to team
    target_team_id = uuid.UUID(body.team_id) if body.team_id else None
    if not target_team_id:
        default_team = await _get_default_team(db, tenant_id)
        target_team_id = default_team.id if default_team else None

    if target_team_id:
        membership = SoulTeamMember(
            team_id=target_team_id,
            user_id=user.id,
            team_role=body.team_role,
            added_by=current_user.id,
        )
        db.add(membership)

    await db.commit()

    # Audit
    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="key_issued",
        soulkey_id=None,
        persona_id="teams-router",
        resource="users",
        action="create",
        decision="allow",
        context={"created_user_id": str(user.id), "email": user.email, "admin_role": user.admin_role},
    )

    logger.info("teams.user_created", user_id=str(user.id), email=user.email, tenant_id=str(tenant_id))

    teams = await _user_teams(db, user.id)
    return UserDetailResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        admin_role=user.admin_role,
        is_account_admin=user.is_account_admin,
        is_secondary_admin=user.is_secondary_admin,
        primary_team_id=str(user.primary_team_id) if user.primary_team_id else None,
        status=user.status,
        last_login=_ts(user.last_login),
        created_at=_ts(user.created_at),
        teams=teams,
    )


@router.get(
    "/v1/users/{user_id}",
    response_model=UserDetailResponse,
    summary="Get user detail",
    dependencies=[Depends(require_permission("users:read"))],
)
async def get_user(
    user_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get details for a specific user. Tenant-scoped."""
    current_user = await _ensure_authenticated(request, db)
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(SoulUser).where(SoulUser.id == user_id, SoulUser.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    teams = await _user_teams(db, user.id)
    return UserDetailResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        admin_role=user.admin_role,
        is_account_admin=user.is_account_admin,
        is_secondary_admin=user.is_secondary_admin,
        primary_team_id=str(user.primary_team_id) if user.primary_team_id else None,
        status=user.status,
        last_login=_ts(user.last_login),
        created_at=_ts(user.created_at),
        teams=teams,
    )


@router.patch(
    "/v1/users/{user_id}",
    response_model=UserDetailResponse,
    summary="Update user role/status (account admin only)",
    dependencies=[Depends(require_permission("users:update"))],
)
async def update_user(
    user_id: uuid.UUID,
    body: UpdateUserRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update a user's role, status, or display name. Requires account admin."""
    current_user = await _ensure_authenticated(request, db)
    _require_account_admin(current_user)
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(SoulUser).where(SoulUser.id == user_id, SoulUser.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent removing the only account admin
    if user.is_account_admin and body.status in ("suspended", "deactivated"):
        raise HTTPException(status_code=400, detail="Cannot deactivate the account admin")

    # Prevent secondary admin from modifying primary admin
    if user.is_account_admin and not current_user.is_account_admin:
        raise HTTPException(status_code=403, detail="Secondary admin cannot modify the primary account admin")

    changes: dict = {}
    if body.admin_role is not None:
        if body.admin_role not in ("owner", "admin", "operator", "viewer"):
            raise HTTPException(status_code=422, detail="Invalid admin_role")
        changes["admin_role"] = body.admin_role
    if body.display_name is not None:
        changes["display_name"] = body.display_name
    if body.status is not None:
        if body.status not in ("active", "suspended", "deactivated"):
            raise HTTPException(status_code=422, detail="Invalid status")
        changes["status"] = body.status
    if body.primary_team_id is not None:
        changes["primary_team_id"] = uuid.UUID(body.primary_team_id)
    if body.is_secondary_admin is not None:
        # Only primary account admin can toggle secondary admin
        _require_primary_admin(current_user)
        changes["is_secondary_admin"] = body.is_secondary_admin

    if changes:
        changes["updated_at"] = datetime.now(timezone.utc)
        await db.execute(
            update(SoulUser).where(SoulUser.id == user_id).values(**changes)
        )
        await db.commit()

        await log_auth_event(
            db,
            tenant_id=tenant_id,
            event_type="key_issued",
            soulkey_id=None,
            persona_id="teams-router",
            resource="users",
            action="update",
            decision="allow",
            context={"target_user_id": str(user_id), "changes": {k: str(v) for k, v in changes.items()}},
        )

    # Re-fetch
    result = await db.execute(
        select(SoulUser).where(SoulUser.id == user_id, SoulUser.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    teams = await _user_teams(db, user.id)
    return UserDetailResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        admin_role=user.admin_role,
        is_account_admin=user.is_account_admin,
        is_secondary_admin=user.is_secondary_admin,
        primary_team_id=str(user.primary_team_id) if user.primary_team_id else None,
        status=user.status,
        last_login=_ts(user.last_login),
        created_at=_ts(user.created_at),
        teams=teams,
    )


@router.delete(
    "/v1/users/{user_id}",
    summary="Deactivate user (account admin only)",
    dependencies=[Depends(require_permission("users:delete"))],
    status_code=200,
)
async def deactivate_user(
    user_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete (deactivate) a user. Requires account admin."""
    current_user = await _ensure_authenticated(request, db)
    _require_account_admin(current_user)
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(SoulUser).where(SoulUser.id == user_id, SoulUser.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_account_admin:
        raise HTTPException(status_code=400, detail="Cannot deactivate the account admin")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    await db.execute(
        update(SoulUser).where(SoulUser.id == user_id).values(
            status="deactivated",
            updated_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()

    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="key_revoked",
        soulkey_id=None,
        persona_id="teams-router",
        resource="users",
        action="deactivate",
        decision="allow",
        context={"target_user_id": str(user_id), "email": user.email},
    )

    logger.info("teams.user_deactivated", user_id=str(user_id), tenant_id=str(tenant_id))
    return {"status": "deactivated", "user_id": str(user_id)}


# ═══════════════════════════════════════════════════════════════════════════
# TEAM ENDPOINTS — /v1/teams
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/v1/teams",
    response_model=TeamListResponse,
    summary="List teams in caller's tenant",
    dependencies=[Depends(require_permission("teams:read"))],
)
async def list_teams(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List all teams in the caller's tenant."""
    current_user = await _ensure_authenticated(request, db)
    tenant_id = current_user.tenant_id

    rows = (
        await db.execute(
            select(SoulTeam).where(SoulTeam.tenant_id == tenant_id).order_by(SoulTeam.created_at)
        )
    ).scalars().all()

    teams = []
    for t in rows:
        mc = await _team_member_count(db, t.id)
        teams.append(TeamResponse(
            id=str(t.id),
            name=t.name,
            slug=t.slug,
            description=t.description,
            is_default=t.is_default,
            member_count=mc,
            created_at=_ts(t.created_at),
        ))

    return TeamListResponse(teams=teams, total=len(teams))


@router.post(
    "/v1/teams",
    response_model=TeamResponse,
    summary="Create team (account admin only)",
    dependencies=[Depends(require_permission("teams:create"))],
    status_code=201,
)
async def create_team(
    body: CreateTeamRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new team within the caller's tenant. Requires account admin."""
    current_user = await _ensure_authenticated(request, db)
    _require_account_admin(current_user)
    tenant_id = current_user.tenant_id

    slug = body.slug or _slugify(body.name)

    # Check duplicate slug
    exists = await db.execute(
        select(SoulTeam.id).where(
            SoulTeam.tenant_id == tenant_id,
            SoulTeam.slug == slug,
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Team slug '{slug}' already exists in this tenant")

    team = SoulTeam(
        tenant_id=tenant_id,
        name=body.name,
        slug=slug,
        description=body.description,
        is_default=False,
        created_by=current_user.id,
    )
    db.add(team)
    await db.flush()
    await db.refresh(team)

    # Add creator as team_admin
    membership = SoulTeamMember(
        team_id=team.id,
        user_id=current_user.id,
        team_role="team_admin",
        added_by=current_user.id,
    )
    db.add(membership)
    await db.commit()

    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="key_issued",
        soulkey_id=None,
        persona_id="teams-router",
        resource="teams",
        action="create",
        decision="allow",
        context={"team_id": str(team.id), "name": team.name, "slug": team.slug},
    )

    logger.info("teams.team_created", team_id=str(team.id), name=team.name, tenant_id=str(tenant_id))

    return TeamResponse(
        id=str(team.id),
        name=team.name,
        slug=team.slug,
        description=team.description,
        is_default=team.is_default,
        member_count=1,
        created_at=_ts(team.created_at),
    )


@router.patch(
    "/v1/teams/{team_id}",
    response_model=TeamResponse,
    summary="Update team (name, description)",
    dependencies=[Depends(require_permission("teams:update"))],
)
async def update_team(
    team_id: uuid.UUID,
    body: UpdateTeamRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update a team's name or description. Requires team_admin or account admin."""
    current_user = await _ensure_authenticated(request, db)
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(SoulTeam).where(SoulTeam.id == team_id, SoulTeam.tenant_id == tenant_id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Check: account admin or team_admin of this team
    if not (current_user.is_account_admin or current_user.is_secondary_admin):
        mem_result = await db.execute(
            select(SoulTeamMember).where(
                SoulTeamMember.team_id == team_id,
                SoulTeamMember.user_id == current_user.id,
                SoulTeamMember.team_role == "team_admin",
            )
        )
        if not mem_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Requires team_admin or account admin")

    changes: dict = {}
    if body.name is not None:
        changes["name"] = body.name
    if body.description is not None:
        changes["description"] = body.description

    if changes:
        changes["updated_at"] = datetime.now(timezone.utc)
        await db.execute(
            update(SoulTeam).where(SoulTeam.id == team_id).values(**changes)
        )
        await db.commit()

    # Re-fetch
    result = await db.execute(
        select(SoulTeam).where(SoulTeam.id == team_id, SoulTeam.tenant_id == tenant_id)
    )
    team = result.scalar_one_or_none()
    mc = await _team_member_count(db, team.id)

    return TeamResponse(
        id=str(team.id),
        name=team.name,
        slug=team.slug,
        description=team.description,
        is_default=team.is_default,
        member_count=mc,
        created_at=_ts(team.created_at),
    )


@router.delete(
    "/v1/teams/{team_id}",
    summary="Delete team (cannot delete default)",
    dependencies=[Depends(require_permission("teams:delete"))],
    status_code=200,
)
async def delete_team(
    team_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete a team. Cannot delete the default team. Requires account admin."""
    current_user = await _ensure_authenticated(request, db)
    _require_account_admin(current_user)
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(SoulTeam).where(SoulTeam.id == team_id, SoulTeam.tenant_id == tenant_id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if team.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default team")

    # Remove all memberships first, then the team
    await db.execute(
        delete(SoulTeamMember).where(SoulTeamMember.team_id == team_id)
    )
    await db.execute(
        delete(SoulTeam).where(SoulTeam.id == team_id)
    )
    await db.commit()

    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="key_revoked",
        soulkey_id=None,
        persona_id="teams-router",
        resource="teams",
        action="delete",
        decision="allow",
        context={"team_id": str(team_id), "name": team.name},
    )

    logger.info("teams.team_deleted", team_id=str(team_id), tenant_id=str(tenant_id))
    return {"status": "deleted", "team_id": str(team_id)}


# ═══════════════════════════════════════════════════════════════════════════
# TEAM MEMBER ENDPOINTS — /v1/teams/{team_id}/members
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/v1/teams/{team_id}/members",
    response_model=TeamMemberListResponse,
    summary="List team members",
    dependencies=[Depends(require_permission("teams:read"))],
)
async def list_team_members(
    team_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List all members of a team. Tenant-scoped."""
    current_user = await _ensure_authenticated(request, db)
    tenant_id = current_user.tenant_id

    # Verify team belongs to tenant
    team_result = await db.execute(
        select(SoulTeam).where(SoulTeam.id == team_id, SoulTeam.tenant_id == tenant_id)
    )
    if not team_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Team not found")

    rows = (
        await db.execute(
            select(SoulTeamMember, SoulUser).join(
                SoulUser, SoulTeamMember.user_id == SoulUser.id
            ).where(SoulTeamMember.team_id == team_id)
        )
    ).all()

    members = [
        TeamMemberItem(
            user_id=str(row[0].user_id),
            email=row[1].email,
            display_name=row[1].display_name,
            team_role=row[0].team_role,
            admin_role=row[1].admin_role,
            joined_at=_ts(row[0].joined_at),
        )
        for row in rows
    ]

    return TeamMemberListResponse(members=members, total=len(members))


@router.post(
    "/v1/teams/{team_id}/members",
    response_model=TeamMemberItem,
    summary="Add user to team",
    dependencies=[Depends(require_permission("teams:update"))],
    status_code=201,
)
async def add_team_member(
    team_id: uuid.UUID,
    body: AddTeamMemberRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Add an existing user to a team. Requires team_admin or account admin."""
    current_user = await _ensure_authenticated(request, db)
    tenant_id = current_user.tenant_id

    # Verify team belongs to tenant
    team_result = await db.execute(
        select(SoulTeam).where(SoulTeam.id == team_id, SoulTeam.tenant_id == tenant_id)
    )
    if not team_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Team not found")

    # Check caller permission: account admin or team_admin
    if not (current_user.is_account_admin or current_user.is_secondary_admin):
        mem_result = await db.execute(
            select(SoulTeamMember).where(
                SoulTeamMember.team_id == team_id,
                SoulTeamMember.user_id == current_user.id,
                SoulTeamMember.team_role == "team_admin",
            )
        )
        if not mem_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Requires team_admin or account admin")

    target_user_id = uuid.UUID(body.user_id)

    # Verify target user is in the same tenant
    user_result = await db.execute(
        select(SoulUser).where(SoulUser.id == target_user_id, SoulUser.tenant_id == tenant_id)
    )
    target_user = user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found in tenant")

    # Validate team_role
    if body.team_role not in ("team_admin", "analyst", "member"):
        raise HTTPException(status_code=422, detail="Invalid team_role. Must be: team_admin, analyst, member")

    # Check if already a member
    exists = await db.execute(
        select(SoulTeamMember.id).where(
            SoulTeamMember.team_id == team_id,
            SoulTeamMember.user_id == target_user_id,
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member of this team")

    membership = SoulTeamMember(
        team_id=team_id,
        user_id=target_user_id,
        team_role=body.team_role,
        added_by=current_user.id,
    )
    db.add(membership)
    await db.commit()

    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="key_issued",
        soulkey_id=None,
        persona_id="teams-router",
        resource="team_members",
        action="add",
        decision="allow",
        context={"team_id": str(team_id), "user_id": body.user_id, "team_role": body.team_role},
    )

    return TeamMemberItem(
        user_id=str(target_user_id),
        email=target_user.email,
        display_name=target_user.display_name,
        team_role=body.team_role,
        admin_role=target_user.admin_role,
        joined_at=_ts(membership.joined_at),
    )


@router.patch(
    "/v1/teams/{team_id}/members/{user_id}",
    response_model=TeamMemberItem,
    summary="Change member's team_role",
    dependencies=[Depends(require_permission("teams:update"))],
)
async def update_team_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    body: UpdateTeamMemberRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Change a team member's role. Requires team_admin or account admin."""
    current_user = await _ensure_authenticated(request, db)
    tenant_id = current_user.tenant_id

    # Verify team in tenant
    team_result = await db.execute(
        select(SoulTeam).where(SoulTeam.id == team_id, SoulTeam.tenant_id == tenant_id)
    )
    if not team_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Team not found")

    # Check caller permission
    if not (current_user.is_account_admin or current_user.is_secondary_admin):
        mem_result = await db.execute(
            select(SoulTeamMember).where(
                SoulTeamMember.team_id == team_id,
                SoulTeamMember.user_id == current_user.id,
                SoulTeamMember.team_role == "team_admin",
            )
        )
        if not mem_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Requires team_admin or account admin")

    if body.team_role not in ("team_admin", "analyst", "member"):
        raise HTTPException(status_code=422, detail="Invalid team_role. Must be: team_admin, analyst, member")

    # Find existing membership
    mem_result = await db.execute(
        select(SoulTeamMember).where(
            SoulTeamMember.team_id == team_id,
            SoulTeamMember.user_id == user_id,
        )
    )
    membership = mem_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="User is not a member of this team")

    await db.execute(
        update(SoulTeamMember)
        .where(SoulTeamMember.team_id == team_id, SoulTeamMember.user_id == user_id)
        .values(team_role=body.team_role)
    )
    await db.commit()

    # Get user for response
    user_result = await db.execute(select(SoulUser).where(SoulUser.id == user_id))
    target_user = user_result.scalar_one_or_none()

    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="key_issued",
        soulkey_id=None,
        persona_id="teams-router",
        resource="team_members",
        action="update_role",
        decision="allow",
        context={"team_id": str(team_id), "user_id": str(user_id), "new_role": body.team_role},
    )

    return TeamMemberItem(
        user_id=str(user_id),
        email=target_user.email if target_user else "",
        display_name=target_user.display_name if target_user else None,
        team_role=body.team_role,
        admin_role=target_user.admin_role if target_user else "viewer",
        joined_at=_ts(membership.joined_at),
    )


@router.delete(
    "/v1/teams/{team_id}/members/{user_id}",
    summary="Remove user from team",
    dependencies=[Depends(require_permission("teams:update"))],
    status_code=200,
)
async def remove_team_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from a team. Requires team_admin or account admin."""
    current_user = await _ensure_authenticated(request, db)
    tenant_id = current_user.tenant_id

    # Verify team in tenant
    team_result = await db.execute(
        select(SoulTeam).where(SoulTeam.id == team_id, SoulTeam.tenant_id == tenant_id)
    )
    if not team_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Team not found")

    # Check caller permission
    if not (current_user.is_account_admin or current_user.is_secondary_admin):
        mem_result = await db.execute(
            select(SoulTeamMember).where(
                SoulTeamMember.team_id == team_id,
                SoulTeamMember.user_id == current_user.id,
                SoulTeamMember.team_role == "team_admin",
            )
        )
        if not mem_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Requires team_admin or account admin")

    result = await db.execute(
        delete(SoulTeamMember).where(
            SoulTeamMember.team_id == team_id,
            SoulTeamMember.user_id == user_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="User is not a member of this team")

    await db.commit()

    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="key_revoked",
        soulkey_id=None,
        persona_id="teams-router",
        resource="team_members",
        action="remove",
        decision="allow",
        context={"team_id": str(team_id), "user_id": str(user_id)},
    )

    logger.info("teams.member_removed", team_id=str(team_id), user_id=str(user_id))
    return {"status": "removed", "team_id": str(team_id), "user_id": str(user_id)}


# ═══════════════════════════════════════════════════════════════════════════
# INVITE ENDPOINTS — /v1/invites
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/v1/invites",
    response_model=InviteResponse,
    summary="Create invitation (email, role, optional team)",
    dependencies=[Depends(require_permission("invites:create"))],
    status_code=201,
)
async def create_invite(
    body: CreateInviteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create an invitation to join the tenant. Returns invite metadata (token sent via email)."""
    current_user = await _ensure_authenticated(request, db)
    _require_account_admin(current_user)
    tenant_id = current_user.tenant_id

    # Validate role
    if body.admin_role not in ("owner", "admin", "operator", "viewer"):
        raise HTTPException(status_code=422, detail="Invalid admin_role for invite")
    if body.team_role not in ("team_admin", "analyst", "member"):
        raise HTTPException(status_code=422, detail="Invalid team_role for invite")

    # Check if user already exists in tenant
    exists = await db.execute(
        select(SoulUser.id).where(
            SoulUser.tenant_id == tenant_id,
            SoulUser.email == body.email,
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User with this email already exists in tenant")

    # Check for existing pending invite
    exists_invite = await db.execute(
        select(SoulUserInvite.id).where(
            SoulUserInvite.tenant_id == tenant_id,
            SoulUserInvite.email == body.email,
            SoulUserInvite.status == "pending",
        )
    )
    if exists_invite.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A pending invitation already exists for this email")

    # Resolve team_id
    target_team_id = uuid.UUID(body.team_id) if body.team_id else None
    if target_team_id:
        team_check = await db.execute(
            select(SoulTeam).where(SoulTeam.id == target_team_id, SoulTeam.tenant_id == tenant_id)
        )
        if not team_check.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Team not found in tenant")

    # Generate token
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=body.expires_hours)

    invite = SoulUserInvite(
        tenant_id=tenant_id,
        team_id=target_team_id,
        email=body.email,
        invited_role=body.admin_role,
        invited_team_role=body.team_role,
        token_hash=token_hash,
        invited_by=current_user.id,
        status="pending",
        expires_at=expires_at,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="key_issued",
        soulkey_id=None,
        persona_id="teams-router",
        resource="invites",
        action="create",
        decision="allow",
        context={"invite_id": str(invite.id), "email": body.email, "role": body.admin_role},
    )

    # Resolve team name for response
    team_name = None
    if invite.team_id:
        t_result = await db.execute(select(SoulTeam.name).where(SoulTeam.id == invite.team_id))
        row = t_result.scalar_one_or_none()
        team_name = row if row else None

    logger.info(
        "teams.invite_created",
        invite_id=str(invite.id),
        email=body.email,
        tenant_id=str(tenant_id),
        # NOTE: raw_token should be sent via email, not logged
    )

    return InviteResponse(
        id=str(invite.id),
        email=invite.email,
        invited_role=invite.invited_role,
        team_id=str(invite.team_id) if invite.team_id else None,
        team_name=team_name,
        status=invite.status,
        expires_at=invite.expires_at.isoformat(),
        created_at=_ts(invite.created_at),
    )


@router.get(
    "/v1/invites",
    response_model=InviteListResponse,
    summary="List pending invitations",
    dependencies=[Depends(require_permission("invites:read"))],
)
async def list_invites(
    request: Request,
    db: AsyncSession = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
):
    """List invitations for the caller's tenant."""
    current_user = await _ensure_authenticated(request, db)
    _require_account_admin(current_user)
    tenant_id = current_user.tenant_id

    q = select(SoulUserInvite).where(SoulUserInvite.tenant_id == tenant_id)
    if status_filter:
        q = q.where(SoulUserInvite.status == status_filter)
    else:
        q = q.where(SoulUserInvite.status == "pending")

    rows = (await db.execute(q.order_by(SoulUserInvite.created_at.desc()))).scalars().all()

    invites = []
    for inv in rows:
        team_name = None
        if inv.team_id:
            t_result = await db.execute(select(SoulTeam.name).where(SoulTeam.id == inv.team_id))
            team_name = t_result.scalar_one_or_none()
        invites.append(InviteResponse(
            id=str(inv.id),
            email=inv.email,
            invited_role=inv.invited_role,
            team_id=str(inv.team_id) if inv.team_id else None,
            team_name=team_name,
            status=inv.status,
            expires_at=inv.expires_at.isoformat(),
            created_at=_ts(inv.created_at),
        ))

    return InviteListResponse(invites=invites, total=len(invites))


@router.delete(
    "/v1/invites/{invite_id}",
    summary="Revoke invitation",
    dependencies=[Depends(require_permission("invites:revoke"))],
    status_code=200,
)
async def revoke_invite(
    invite_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Revoke a pending invitation. Requires account admin or the original inviter."""
    current_user = await _ensure_authenticated(request, db)
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(SoulUserInvite).where(
            SoulUserInvite.id == invite_id,
            SoulUserInvite.tenant_id == tenant_id,
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invite.status != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot revoke invitation with status '{invite.status}'")

    # Must be account admin or the inviter
    if not (current_user.is_account_admin or current_user.is_secondary_admin or invite.invited_by == current_user.id):
        raise HTTPException(status_code=403, detail="Must be account admin or the original inviter")

    await db.execute(
        update(SoulUserInvite).where(SoulUserInvite.id == invite_id).values(status="revoked")
    )
    await db.commit()

    await log_auth_event(
        db,
        tenant_id=tenant_id,
        event_type="key_revoked",
        soulkey_id=None,
        persona_id="teams-router",
        resource="invites",
        action="revoke",
        decision="allow",
        context={"invite_id": str(invite_id), "email": invite.email},
    )

    return {"status": "revoked", "invite_id": str(invite_id)}


@router.post(
    "/v1/invites/{token}/accept",
    summary="Accept invitation (creates user or links OIDC)",
    status_code=200,
)
async def accept_invite(
    token: str,
    body: AcceptInviteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Accept an invitation using the raw token from the email link.
    Creates a new local-auth user or links to an existing OIDC session.
    No authentication required (the token itself is the credential).
    """
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(SoulUserInvite).where(
            SoulUserInvite.token_hash == token_hash,
            SoulUserInvite.status == "pending",
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation token")

    if invite.expires_at < now:
        # Mark as expired
        await db.execute(
            update(SoulUserInvite).where(SoulUserInvite.id == invite.id).values(status="expired")
        )
        await db.commit()
        raise HTTPException(status_code=410, detail="Invitation has expired")

    # Check if user already exists
    exists = await db.execute(
        select(SoulUser).where(
            SoulUser.tenant_id == invite.tenant_id,
            SoulUser.email == invite.email,
        )
    )
    existing_user = exists.scalar_one_or_none()

    if existing_user:
        # Link existing user — update role per invite
        user = existing_user
        await db.execute(
            update(SoulUser).where(SoulUser.id == user.id).values(
                admin_role=invite.invited_role,
                updated_at=now,
            )
        )
    else:
        # Create new user
        password_hash = None
        if body.password:
            import bcrypt
            password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()

        user = SoulUser(
            tenant_id=invite.tenant_id,
            email=invite.email,
            display_name=body.display_name or invite.email,
            admin_role=invite.invited_role,
            password_hash=password_hash,
            auth_provider="local" if password_hash else "oidc",
            status="active",
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

    # Add to team
    target_team_id = invite.team_id
    if not target_team_id:
        default_team = await _get_default_team(db, invite.tenant_id)
        target_team_id = default_team.id if default_team else None

    if target_team_id:
        # Check if already a member
        mem_check = await db.execute(
            select(SoulTeamMember.id).where(
                SoulTeamMember.team_id == target_team_id,
                SoulTeamMember.user_id == user.id,
            )
        )
        if not mem_check.scalar_one_or_none():
            membership = SoulTeamMember(
                team_id=target_team_id,
                user_id=user.id,
                team_role=invite.invited_team_role,
                added_by=invite.invited_by,
            )
            db.add(membership)

    # Mark invite as accepted
    await db.execute(
        update(SoulUserInvite).where(SoulUserInvite.id == invite.id).values(
            status="accepted",
            accepted_at=now,
            accepted_user_id=user.id,
        )
    )
    await db.commit()

    await log_auth_event(
        db,
        tenant_id=invite.tenant_id,
        event_type="key_issued",
        soulkey_id=None,
        persona_id="teams-router",
        resource="invites",
        action="accept",
        decision="allow",
        context={"invite_id": str(invite.id), "user_id": str(user.id), "email": invite.email},
    )

    logger.info(
        "teams.invite_accepted",
        invite_id=str(invite.id),
        user_id=str(user.id),
        email=invite.email,
    )

    return {
        "status": "accepted",
        "user_id": str(user.id),
        "email": user.email,
        "admin_role": invite.invited_role,
        "team_id": str(target_team_id) if target_team_id else None,
        "team_role": invite.invited_team_role,
    }
