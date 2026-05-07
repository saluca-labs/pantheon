# Team Management & RBAC Implementation Plan

**Author:** Alfred  
**Date:** 2026-04-02  
**Status:** Draft  
**Scope:** Multi-user team management, invitation flow, team-level RBAC across all tenant tiers

---

## 1. Overview

Tiresias currently supports single-user tenants with portal-level roles (`owner`, `admin`, `operator`, `viewer`) on the `SoulUser.admin_role` field. This plan adds:

- **Teams** within tenants (grouping users by function, customer, or project)
- **Team-level roles** that layer on top of portal-level roles
- **Account admin / secondary admin** designation for tenant-wide user management
- **Invitation flow** for onboarding new users via email
- **Portal UI** for managing all of the above under Settings > Team

### Tenant Tier Mapping

| Tier | Behavior |
|------|----------|
| **Enterprise** | Multiple teams. Users/analysts/admins scoped within the tenant. |
| **MSSP** | Sub-tenants (already supported via `parent_tenant_id`). Each sub-tenant gets its own teams. MSSP parent can view/manage across sub-tenants. |
| **Pro** | Single default team. Multi-person, account admin + members. |
| **Community/Trial** | Single user, single implicit team. Team UI hidden or read-only. |

---

## 2. Database Models

### 2.1 New Table: `_soul_teams`

**File:** `src/database/models.py`

```python
class SoulTeam(Base):
    """_soul_teams - Logical team/group within a tenant."""
    __tablename__ = "_soul_teams"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(63), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False,
        comment="Exactly one default team per tenant; new users land here")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True
    )
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata_", JSON, default=dict, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_soul_teams_tenant_slug"),
        Index("idx_soul_teams_tenant", "tenant_id"),
    )
```

### 2.2 New Table: `_soul_team_members`

```python
class SoulTeamMember(Base):
    """_soul_team_members - User membership in a team with team-scoped role."""
    __tablename__ = "_soul_team_members"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_teams.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False
    )
    team_role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member",
        comment="Team-scoped role: team_admin, analyst, member"
    )
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    added_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_soul_team_members_team_user"),
        CheckConstraint("team_role IN ('team_admin', 'analyst', 'member')", name="ck_soul_team_members_role"),
        Index("idx_soul_team_members_team", "team_id"),
        Index("idx_soul_team_members_user", "user_id"),
    )
```

### 2.3 New Table: `_soul_user_invites`

```python
class SoulUserInvite(Base):
    """_soul_user_invites - Pending invitations to join a tenant/team."""
    __tablename__ = "_soul_user_invites"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_teams.id", ondelete="SET NULL"), nullable=True,
        comment="Target team; NULL = default team"
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    invited_role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="viewer",
        comment="Portal-level admin_role to assign on acceptance"
    )
    invited_team_role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member",
        comment="Team-level role to assign on acceptance"
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True,
        comment="SHA-256 hash of the invite token sent via email"
    )
    invited_by: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending",
        comment="pending | accepted | expired | revoked"
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'accepted', 'expired', 'revoked')", name="ck_soul_user_invites_status"),
        Index("idx_soul_user_invites_tenant", "tenant_id"),
        Index("idx_soul_user_invites_email", "email"),
        Index("idx_soul_user_invites_token", "token_hash"),
    )
```

### 2.4 Updated `SoulUser` Fields

Add two columns to `_soul_users`:

```python
# In SoulUser class:
is_account_admin: Mapped[bool] = mapped_column(
    Boolean, default=False, nullable=False,
    comment="Tenant-wide account admin; can manage all users/teams/billing"
)
is_secondary_admin: Mapped[bool] = mapped_column(
    Boolean, default=False, nullable=False,
    comment="Secondary admin; full user/team management but cannot remove primary admin"
)
primary_team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
    Uuid, ForeignKey("_soul_teams.id", ondelete="SET NULL"), nullable=True,
    comment="User's primary/default team for scoping dashboards"
)
```

**Constraint updates** to `SoulUser.__table_args__`:
```python
# Update the admin_role CHECK to ensure the existing constraint still applies.
# No change needed — the four roles (owner/admin/operator/viewer) remain the portal-level roles.
```

**Migration note:** The first user registered for a tenant (or the tenant creator) gets `is_account_admin=True`. Existing `owner` role users get backfilled to `is_account_admin=True`.

---

## 3. Role Model: Two Layers

### 3.1 Portal-Level Roles (unchanged)

These live on `SoulUser.admin_role` and control what platform features the user can access.

| Role | Scope |
|------|-------|
| `owner` | Full platform access, billing, tenant deletion, wildcard `*` |
| `admin` | Key management, policy, detection, enforcement, analytics |
| `operator` | Read + sync/trigger actions |
| `viewer` | Read-only across all modules |

Defined in: `src/auth/rbac.py` -- `ROLE_PERMISSIONS` dict (no changes needed).

### 3.2 Team-Level Roles (new)

These live on `SoulTeamMember.team_role` and control what a user can do within a specific team.

| Role | Capabilities |
|------|-------------|
| `team_admin` | Add/remove team members, change team roles, rename team, view all team data |
| `analyst` | View team dashboards, create/edit investigations, manage team detections |
| `member` | View team dashboards, read-only on team resources |

### 3.3 Account Admin vs. Portal Roles

| Capability | Account Admin | Secondary Admin | owner role | admin role |
|-----------|:---:|:---:|:---:|:---:|
| Manage all users in tenant | Y | Y | N | N |
| Create/delete teams | Y | Y | N | N |
| Invite new users | Y | Y | N | N |
| Designate secondary admin | Y | N | N | N |
| Remove account admin | N (self only via transfer) | N | N | N |
| Manage billing/subscription | Y | N | Y | N |
| Delete tenant | Y | N | Y | N |

**Key principle:** `is_account_admin` and `is_secondary_admin` are orthogonal to `admin_role`. An account admin with `viewer` portal role can manage users but only see read-only dashboards. This separates "who manages people" from "what platform features they access."

### 3.4 Effective Permission Resolution

```
effective_permission(user, resource, action) =
    portal_role_allows(user.admin_role, resource:action)
    OR (user.is_account_admin AND resource IN account_management_resources)
    OR (user.is_secondary_admin AND resource IN account_management_resources AND resource != "admin:transfer")
    OR (team_role_allows(user.team_role_in(resource.team), resource:action))
```

**File:** `src/auth/rbac.py` -- add new permission entries:

```python
# New resource permissions for team/user management
ROLE_PERMISSIONS["owner"].append("*")  # already wildcard

# Account admin permissions (checked via is_account_admin flag, not role)
ACCOUNT_ADMIN_PERMISSIONS = [
    "users:create", "users:read", "users:update", "users:delete",
    "teams:create", "teams:read", "teams:update", "teams:delete",
    "invites:create", "invites:read", "invites:revoke",
    "account:secondary_admin",
]

SECONDARY_ADMIN_PERMISSIONS = [
    "users:create", "users:read", "users:update", "users:delete",
    "teams:create", "teams:read", "teams:update", "teams:delete",
    "invites:create", "invites:read", "invites:revoke",
]

# Team-level permissions
TEAM_ROLE_PERMISSIONS = {
    "team_admin": ["team_members:*", "team:update", "team:read"],
    "analyst": ["team:read", "investigations:*", "detections:create", "detections:update"],
    "member": ["team:read", "investigations:read", "detections:read"],
}
```

---

## 4. API Endpoints

All endpoints below are prefixed with `/v1` and require session auth (OIDC or local).

### 4.1 User Management — `/v1/users`

**File:** `src/api/users_router.py` (new)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/users` | account_admin or secondary_admin | List all users in caller's tenant |
| `GET` | `/v1/users/{user_id}` | account_admin or self | Get user details |
| `PATCH` | `/v1/users/{user_id}` | account_admin | Update user role, status, display_name |
| `DELETE` | `/v1/users/{user_id}` | account_admin | Deactivate user (soft delete) |
| `POST` | `/v1/users/{user_id}/make-secondary-admin` | account_admin only | Toggle secondary admin |

**Request/Response schemas:**

```python
# GET /v1/users response
class UserListItem(BaseModel):
    id: str
    email: str
    display_name: str | None
    admin_role: str                # portal role
    is_account_admin: bool
    is_secondary_admin: bool
    primary_team_id: str | None
    status: str
    last_login: str | None
    created_at: str | None
    teams: list[TeamMembershipBrief]  # [{team_id, team_name, team_role}]

class UserListResponse(BaseModel):
    users: list[UserListItem]
    total: int

# PATCH /v1/users/{user_id}
class UpdateUserRequest(BaseModel):
    admin_role: str | None = None     # owner/admin/operator/viewer
    display_name: str | None = None
    status: str | None = None         # active/suspended/deactivated
    primary_team_id: str | None = None
```

### 4.2 Team Management — `/v1/teams`

**File:** `src/api/teams_router.py` (new)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/teams` | any authenticated user | List teams in caller's tenant |
| `POST` | `/v1/teams` | account_admin or secondary_admin | Create team |
| `GET` | `/v1/teams/{team_id}` | team member or account_admin | Get team details |
| `PATCH` | `/v1/teams/{team_id}` | team_admin or account_admin | Update team name/description |
| `DELETE` | `/v1/teams/{team_id}` | account_admin | Delete team (cannot delete default team) |

```python
# POST /v1/teams
class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    slug: str | None = None  # auto-generated from name if omitted

class TeamResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    is_default: bool
    member_count: int
    created_at: str | None
```

### 4.3 Team Membership — `/v1/teams/{team_id}/members`

**File:** `src/api/teams_router.py` (same file)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/teams/{team_id}/members` | team member or account_admin | List members |
| `POST` | `/v1/teams/{team_id}/members` | team_admin or account_admin | Add existing user to team |
| `PATCH` | `/v1/teams/{team_id}/members/{user_id}` | team_admin or account_admin | Change team role |
| `DELETE` | `/v1/teams/{team_id}/members/{user_id}` | team_admin or account_admin | Remove from team |

```python
# POST /v1/teams/{team_id}/members
class AddTeamMemberRequest(BaseModel):
    user_id: str
    team_role: str = "member"  # team_admin | analyst | member

# GET response item
class TeamMemberItem(BaseModel):
    user_id: str
    email: str
    display_name: str | None
    team_role: str
    admin_role: str       # portal-level, for badge display
    joined_at: str | None
```

### 4.4 Invitations — `/v1/invites`

**File:** `src/api/invites_router.py` (new)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/invites` | account_admin or secondary_admin | List pending invites |
| `POST` | `/v1/invites` | account_admin or secondary_admin | Send invitation |
| `DELETE` | `/v1/invites/{invite_id}` | account_admin or inviter | Revoke pending invite |
| `POST` | `/v1/invites/accept` | unauthenticated (token-based) | Accept invite, create user |

```python
# POST /v1/invites
class CreateInviteRequest(BaseModel):
    email: str
    admin_role: str = "viewer"           # portal role for new user
    team_id: str | None = None           # NULL = default team
    team_role: str = "member"            # team role
    expires_hours: int = Field(default=72, le=168)  # max 7 days

class InviteResponse(BaseModel):
    id: str
    email: str
    invited_role: str
    team_id: str | None
    team_name: str | None
    status: str
    expires_at: str
    created_at: str

# POST /v1/invites/accept
class AcceptInviteRequest(BaseModel):
    token: str                  # raw invite token from email link
    display_name: str | None = None
    password: str | None = None  # required if tenant uses local auth
```

**Invitation flow:**

1. Account admin creates invite via `POST /v1/invites`
2. Backend generates a 32-byte random token, stores SHA-256 hash in `_soul_user_invites`
3. Backend sends email to invitee with link: `https://portal.tiresias.network/invite?token={raw_token}`
4. Invitee clicks link, lands on accept page
5. If tenant uses OIDC: invitee authenticates via IdP, JIT provisioning matches invite by email
6. If tenant uses local auth: invitee sets password on accept page
7. Backend creates `SoulUser`, adds to `SoulTeamMember`, marks invite as `accepted`

---

## 5. Portal Changes

### 5.1 New "Team" Tab in Settings

**File:** `portal/src/app/dashboard/settings/page.tsx`

Add to the `Tab` type and `TABS` array:

```typescript
// Update type
type Tab = "general" | "api-keys" | "siem" | "notifications" | "billing" 
         | "white-label" | "sso" | "preferences" | "team";

// Add to TABS array (position after "general")
{ id: "team", label: "Team" },
```

**Visibility rules:**
- Hidden for `community` tier (single user)
- Visible for `pro`, `enterprise`, `mssp` tiers
- Only account admins and secondary admins see management controls
- Regular users see read-only team list

### 5.2 TeamSettingsTab Component

**File:** `portal/src/components/team/TeamSettingsTab.tsx` (new)

```
TeamSettingsTab
  |-- UserListSection
  |     |-- UserRow (email, role badge, status, actions dropdown)
  |     |-- RoleChangeModal
  |     |-- DeactivateConfirmDialog
  |
  |-- TeamListSection
  |     |-- TeamCard (name, member count, expand to see members)
  |     |-- CreateTeamModal
  |     |-- TeamMemberList
  |
  |-- InviteSection
  |     |-- InviteModal (email input, role selectors, team picker)
  |     |-- PendingInvitesList (with revoke action)
  |
  |-- AdminSection (only for account admin)
        |-- SecondaryAdminToggle
        |-- TransferOwnershipButton (future)
```

### 5.3 User List with Role Badges

Each user row displays:

```
[Avatar/Initial] | Email + Display Name | Portal Role Badge | Team Role Badge | Status | [Actions ...]
```

Badge colors:
- `owner` = purple
- `admin` = red
- `operator` = blue  
- `viewer` = gray
- `team_admin` = orange
- `analyst` = green
- `member` = default

Actions dropdown (visible to account admin / secondary admin):
- Change portal role
- Change team role
- Move to different team
- Suspend user
- Deactivate user

### 5.4 Invite Modal

```
+--------------------------------------------+
| Invite Team Member                         |
|--------------------------------------------|
| Email:          [________________________] |
| Portal Role:    [viewer       v]           |
| Team:           [Default Team v]           |
| Team Role:      [member       v]           |
| Expires:        [72 hours     v]           |
|                                            |
|        [Cancel]          [Send Invite]     |
+--------------------------------------------+
```

### 5.5 Role Change UI

Inline dropdown or modal for changing roles. Constraints enforced:
- Cannot change own account admin status
- Cannot elevate to a role higher than your own portal role
- Secondary admin cannot remove the account admin
- At least one account admin must exist at all times

### 5.6 Secondary Admin Designation

Account admin sees a toggle next to each user:
```
[User Row] ... [Make Secondary Admin] toggle
```

Secondary admin badge appears next to the user's name. Max 2 secondary admins per tenant (configurable in tenant metadata).

---

## 6. Permission Enforcement

### 6.1 New RBAC Dependency

**File:** `src/auth/rbac.py` -- add alongside `require_permission`:

```python
def require_account_admin():
    """FastAPI dependency: require is_account_admin or is_secondary_admin on the session user."""
    async def _check(request: Request, db: AsyncSession = Depends(get_db)):
        # Resolve OIDC/local session user
        user = await _resolve_session_user(request, db)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if not (user.is_account_admin or user.is_secondary_admin):
            raise HTTPException(status_code=403, detail="Account admin access required")
        request.state.admin_user = user
    return _check


def require_team_role(min_role: str = "member"):
    """FastAPI dependency: require membership in the team referenced by path param team_id."""
    role_rank = {"member": 0, "analyst": 1, "team_admin": 2}
    async def _check(request: Request, db: AsyncSession = Depends(get_db)):
        user = await _resolve_session_user(request, db)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        # Account admin bypasses team role check
        if user.is_account_admin or user.is_secondary_admin:
            request.state.team_user = user
            return
        team_id = request.path_params.get("team_id")
        if not team_id:
            raise HTTPException(status_code=400, detail="team_id path parameter required")
        # Look up membership
        membership = await db.execute(
            select(SoulTeamMember).where(
                SoulTeamMember.team_id == team_id,
                SoulTeamMember.user_id == user.id,
            )
        )
        member = membership.scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=403, detail="Not a member of this team")
        if role_rank.get(member.team_role, -1) < role_rank.get(min_role, 0):
            raise HTTPException(status_code=403, detail=f"Requires team role: {min_role}")
        request.state.team_user = user
        request.state.team_membership = member
    return _check
```

### 6.2 Helper: Resolve Session User

**File:** `src/auth/rbac.py`

```python
async def _resolve_session_user(request: Request, db: AsyncSession) -> Optional[SoulUser]:
    """Extract authenticated SoulUser from session token in Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    raw_token = auth_header[7:]
    result = await validate_session(db, raw_token)
    if not result:
        return None
    _session, user = result
    return user
```

### 6.3 Tenant Scoping

All queries MUST be scoped to the caller's `tenant_id`. The router extracts `tenant_id` from the authenticated user's record, never from request parameters. This prevents IDOR:

```python
# In every endpoint handler:
current_user: SoulUser = request.state.admin_user
tenant_id = current_user.tenant_id
# All queries: .where(Model.tenant_id == tenant_id)
```

---

## 7. JIT Provisioning Integration

**File:** `src/auth/jit_provisioning.py`

When a user logs in via OIDC and is JIT-provisioned, the flow needs to:

1. Check if a pending invite exists for the user's email in the tenant
2. If invite exists and is valid:
   - Use the invite's `invited_role` as `admin_role` (instead of group_role_map default)
   - Add user to the invite's `team_id` with `invited_team_role`
   - Mark invite as `accepted`
3. If no invite exists:
   - Use existing group_role_map logic
   - Add user to the tenant's default team as `member`

```python
# In jit_provision_user(), after creating/updating the user:

# Check for pending invite
invite_result = await db.execute(
    select(SoulUserInvite).where(
        SoulUserInvite.tenant_id == tenant_id,
        SoulUserInvite.email == email,
        SoulUserInvite.status == "pending",
        SoulUserInvite.expires_at > datetime.now(timezone.utc),
    )
)
invite = invite_result.scalar_one_or_none()

if invite:
    user.admin_role = invite.invited_role
    target_team_id = invite.team_id or await _get_default_team_id(db, tenant_id)
    await _add_to_team(db, target_team_id, user.id, invite.invited_team_role)
    invite.status = "accepted"
    invite.accepted_at = now
    invite.accepted_user_id = user.id
else:
    # Add to default team
    default_team_id = await _get_default_team_id(db, tenant_id)
    if default_team_id:
        await _add_to_team(db, default_team_id, user.id, "member")
```

---

## 8. Local Registration Integration

**File:** `src/auth/local_router.py`

Update `register_user` endpoint:
- Accept optional `team_id` and `team_role` fields in `RegisterRequest`
- After creating the user, add to specified team (or default team)
- This endpoint is currently gated by `require_permission("keys:create")` -- change to `require_account_admin()`

```python
class RegisterRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=8)
    display_name: str | None = None
    tenant_id: str
    admin_role: str = Field(default="viewer")
    team_id: str | None = None         # NEW
    team_role: str = "member"          # NEW
```

---

## 9. Default Team Bootstrapping

When a new tenant is created, a default team must be created automatically.

**File:** `src/api/tenant_router.py` (or wherever tenants are provisioned)

```python
async def _bootstrap_default_team(db: AsyncSession, tenant_id: uuid.UUID, creator_user_id: uuid.UUID):
    """Create the default team for a newly provisioned tenant."""
    team = SoulTeam(
        tenant_id=tenant_id,
        name="Default",
        slug="default",
        description="Default team for all members",
        is_default=True,
        created_by=creator_user_id,
    )
    db.add(team)
    await db.flush()
    
    # Add creator as team_admin
    membership = SoulTeamMember(
        team_id=team.id,
        user_id=creator_user_id,
        team_role="team_admin",
    )
    db.add(membership)
    return team
```

**Backfill for existing tenants:** The migration creates a "Default" team for every existing tenant and adds all existing users as members.

---

## 10. Alembic Migration

**File:** `alembic/versions/0019_add_teams_and_invites.py`

```python
"""Add team management tables and user admin fields.

Revision ID: 0019
Revises: 0018
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0019"
down_revision = "0018"

def upgrade():
    # 1. Create _soul_teams
    op.create_table(
        "_soul_teams",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(63), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_default", sa.Boolean, default=False, nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("metadata_", sa.JSON, default=dict, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_soul_teams_tenant_slug"),
    )
    op.create_index("idx_soul_teams_tenant", "_soul_teams", ["tenant_id"])

    # 2. Create _soul_team_members
    op.create_table(
        "_soul_team_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("_soul_teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_role", sa.String(50), nullable=False, server_default="member"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("added_by", UUID(as_uuid=True), sa.ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("team_id", "user_id", name="uq_soul_team_members_team_user"),
        sa.CheckConstraint("team_role IN ('team_admin', 'analyst', 'member')", name="ck_soul_team_members_role"),
    )
    op.create_index("idx_soul_team_members_team", "_soul_team_members", ["team_id"])
    op.create_index("idx_soul_team_members_user", "_soul_team_members", ["user_id"])

    # 3. Create _soul_user_invites
    op.create_table(
        "_soul_user_invites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("_soul_teams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("invited_role", sa.String(50), nullable=False, server_default="viewer"),
        sa.Column("invited_team_role", sa.String(50), nullable=False, server_default="member"),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("invited_by", UUID(as_uuid=True), sa.ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_user_id", UUID(as_uuid=True), sa.ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'expired', 'revoked')", name="ck_soul_user_invites_status"),
    )
    op.create_index("idx_soul_user_invites_tenant", "_soul_user_invites", ["tenant_id"])
    op.create_index("idx_soul_user_invites_email", "_soul_user_invites", ["email"])
    op.create_index("idx_soul_user_invites_token", "_soul_user_invites", ["token_hash"])

    # 4. Add columns to _soul_users
    op.add_column("_soul_users", sa.Column("is_account_admin", sa.Boolean, server_default="false", nullable=False))
    op.add_column("_soul_users", sa.Column("is_secondary_admin", sa.Boolean, server_default="false", nullable=False))
    op.add_column("_soul_users", sa.Column("primary_team_id", UUID(as_uuid=True),
                  sa.ForeignKey("_soul_teams.id", ondelete="SET NULL"), nullable=True))

    # 5. Backfill: set is_account_admin=true for existing owner users
    op.execute("""
        UPDATE _soul_users SET is_account_admin = true WHERE admin_role = 'owner'
    """)

    # 6. Backfill: create default team for each existing tenant, add all users
    op.execute("""
        INSERT INTO _soul_teams (id, tenant_id, name, slug, is_default, created_at, updated_at)
        SELECT gen_random_uuid(), id, 'Default', 'default', true, now(), now()
        FROM _soul_tenants
        WHERE NOT EXISTS (
            SELECT 1 FROM _soul_teams WHERE _soul_teams.tenant_id = _soul_tenants.id AND is_default = true
        )
    """)
    op.execute("""
        INSERT INTO _soul_team_members (id, team_id, user_id, team_role, joined_at)
        SELECT gen_random_uuid(), t.id, u.id,
               CASE WHEN u.admin_role IN ('owner', 'admin') THEN 'team_admin' ELSE 'member' END,
               now()
        FROM _soul_users u
        JOIN _soul_teams t ON t.tenant_id = u.tenant_id AND t.is_default = true
        WHERE NOT EXISTS (
            SELECT 1 FROM _soul_team_members tm WHERE tm.user_id = u.id AND tm.team_id = t.id
        )
    """)
    # Set primary_team_id to default team
    op.execute("""
        UPDATE _soul_users u
        SET primary_team_id = t.id
        FROM _soul_teams t
        WHERE t.tenant_id = u.tenant_id AND t.is_default = true AND u.primary_team_id IS NULL
    """)


def downgrade():
    op.drop_column("_soul_users", "primary_team_id")
    op.drop_column("_soul_users", "is_secondary_admin")
    op.drop_column("_soul_users", "is_account_admin")
    op.drop_table("_soul_user_invites")
    op.drop_table("_soul_team_members")
    op.drop_table("_soul_teams")
```

---

## 11. MSSP-Specific Considerations

MSSP tenants use `parent_tenant_id` on `SoulTenant` to create a hierarchy. For MSSP:

- **MSSP parent tenant** users with `is_account_admin=True` can list and manage users across all child tenants
- Each child tenant (customer) has its own independent teams and users
- MSSP parent users do NOT appear in child tenant team lists
- Cross-tenant access is read-only unless the MSSP user has explicit delegation

**API behavior:** When `GET /v1/users` is called by an MSSP parent admin:
- Query param `?include_children=true` returns users from all child tenants
- Default behavior: only return parent tenant users
- Response includes `tenant_id` and `tenant_name` for disambiguation

---

## 12. Audit Trail

All team/user management actions emit audit events to `_soulauth_audit`:

| Event Type | Logged When |
|-----------|-------------|
| `user.invited` | Invite created |
| `user.invite_accepted` | Invite accepted, user created |
| `user.invite_revoked` | Invite cancelled |
| `user.role_changed` | Portal role updated |
| `user.suspended` | User suspended |
| `user.deactivated` | User deactivated |
| `user.reactivated` | User status set back to active |
| `team.created` | New team created |
| `team.updated` | Team name/description changed |
| `team.deleted` | Team removed |
| `team.member_added` | User added to team |
| `team.member_removed` | User removed from team |
| `team.role_changed` | Team role updated |
| `admin.secondary_granted` | Secondary admin flag set |
| `admin.secondary_revoked` | Secondary admin flag removed |

---

## 13. Implementation Phases

### Phase 1: Database & Models (1-2 days)
- [ ] Add `SoulTeam`, `SoulTeamMember`, `SoulUserInvite` to `src/database/models.py`
- [ ] Add `is_account_admin`, `is_secondary_admin`, `primary_team_id` to `SoulUser`
- [ ] Write and test Alembic migration `0019`
- [ ] Run migration against staging DB
- [ ] Add default team bootstrapping to tenant creation flow

### Phase 2: RBAC Layer (1 day)
- [ ] Add `ACCOUNT_ADMIN_PERMISSIONS`, `TEAM_ROLE_PERMISSIONS` to `src/auth/rbac.py`
- [ ] Implement `require_account_admin()` dependency
- [ ] Implement `require_team_role()` dependency
- [ ] Implement `_resolve_session_user()` helper
- [ ] Unit tests for permission resolution

### Phase 3: API Endpoints (2-3 days)
- [ ] Create `src/api/users_router.py` with user CRUD
- [ ] Create `src/api/teams_router.py` with team + membership CRUD
- [ ] Create `src/api/invites_router.py` with invitation flow
- [ ] Register all routers in `src/main.py`
- [ ] Integration tests for all endpoints
- [ ] Wire audit logging for all mutations

### Phase 4: JIT & Registration Integration (1 day)
- [ ] Update `src/auth/jit_provisioning.py` to check invites and assign teams
- [ ] Update `src/auth/local_router.py` register endpoint
- [ ] Update tenant creation to bootstrap default team
- [ ] Test OIDC login with pending invite
- [ ] Test local registration with team assignment

### Phase 5: Portal UI (3-4 days)
- [ ] Create `portal/src/components/team/TeamSettingsTab.tsx`
- [ ] Create `portal/src/components/team/UserListSection.tsx`
- [ ] Create `portal/src/components/team/InviteModal.tsx`
- [ ] Create `portal/src/components/team/RoleChangeModal.tsx`
- [ ] Create `portal/src/components/team/TeamListSection.tsx`
- [ ] Create `portal/src/components/team/AdminSection.tsx`
- [ ] Add "Team" tab to settings page type and TABS array
- [ ] Add API client methods in `portal/src/lib/api.ts`
- [ ] Tier-gate the Team tab (hidden for community)
- [ ] Role-gate management controls (read-only for non-admins)

### Phase 6: Invite Accept Page (1 day)
- [ ] Create `portal/src/app/invite/page.tsx` -- public invite acceptance page
- [ ] Token validation UI
- [ ] Password setup form (for local auth tenants)
- [ ] OIDC redirect (for SSO tenants)
- [ ] Success/error states

### Phase 7: Email Integration (1 day)
- [ ] Invite email template (HTML)
- [ ] Email sending via notification channel (or direct SMTP)
- [ ] Invite link generation with portal URL

### Phase 8: Testing & Hardening (1-2 days)
- [ ] IDOR testing: ensure tenant scoping on all queries
- [ ] Permission escalation testing: users cannot self-elevate
- [ ] Invite token brute-force protection (rate limiting)
- [ ] Expired invite cleanup (cron or on-read)
- [ ] E2E test: full invite flow from send to acceptance to team membership

**Total estimated effort:** 10-14 days

---

## 14. File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/database/models.py` | Modify | Add SoulTeam, SoulTeamMember, SoulUserInvite; update SoulUser |
| `src/auth/rbac.py` | Modify | Add account admin permissions, team role permissions, new dependencies |
| `src/auth/jit_provisioning.py` | Modify | Check invites on JIT, assign to teams |
| `src/auth/local_router.py` | Modify | Add team fields to register, change auth guard |
| `src/api/users_router.py` | Create | User CRUD for tenant admins |
| `src/api/teams_router.py` | Create | Team + membership CRUD |
| `src/api/invites_router.py` | Create | Invitation flow |
| `alembic/versions/0019_add_teams_and_invites.py` | Create | Migration for 3 new tables + SoulUser columns + backfill |
| `portal/src/app/dashboard/settings/page.tsx` | Modify | Add "Team" tab |
| `portal/src/components/team/TeamSettingsTab.tsx` | Create | Main team settings component |
| `portal/src/components/team/UserListSection.tsx` | Create | User list with role badges |
| `portal/src/components/team/InviteModal.tsx` | Create | Invitation form modal |
| `portal/src/components/team/RoleChangeModal.tsx` | Create | Role change modal |
| `portal/src/components/team/TeamListSection.tsx` | Create | Team list with member expansion |
| `portal/src/components/team/AdminSection.tsx` | Create | Secondary admin controls |
| `portal/src/app/invite/page.tsx` | Create | Public invite acceptance page |
| `portal/src/lib/api.ts` | Modify | Add team/user/invite API methods |
