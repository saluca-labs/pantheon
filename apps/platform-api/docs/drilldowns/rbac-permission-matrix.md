# RBAC Permission Matrix

> **Pantheon Administrator Guide — Drilldown**
> **Parent:** [`chapters/part2-auth-access.md`](../chapters/part2-auth-access.md)
> **Source of truth:** [`apps/platform-api/src/auth/rbac.py`](../../src/auth/rbac.py)

Pantheon's RBAC is defined in `src/auth/rbac.py` as a per-role
permission map, with optional per-tenant overrides in
`_role_permissions`. This drilldown reflects that source exactly. If
this document drifts from the source, trust the source.

---

## 1. Roles

Five default roles, in hierarchy order from highest to lowest privilege:

| Role | Slug | Powers |
|---|---|---|
| **Owner** | `owner` | `*` — full access including billing / delete tenant |
| **Admin** | `admin` | Tenant administration + agent platform CRUD |
| **Operator** | `operator` | Read + write agent platform; no destructive ops |
| **Viewer** | `viewer` | Read-only across the dashboard |
| **Auditor** | `auditor` | Read everything + MFA-gated decrypt scope |

Roles are assigned per SoulKey (for agents) and per user (for humans).
The user's role is resolved from `_soulauth_users.role`; the SoulKey's
role from `_soulauth_soulkeys.metadata->>'role'` (defaults to
`operator`).

## 2. Permission strings

Permissions follow `<resource>:<action>`. The wildcard `*` matches all
actions for that resource. `*` alone (used only by `owner`) matches
all resources.

### Wave-H agent platform (most relevant for current work)

| Permission | What it gates | Roles |
|---|---|---|
| `agents:read` | `GET /v1/agents`, `GET /v1/agents/{id}` | viewer, auditor, operator, admin, owner |
| `agents:write` | `POST`, `PATCH`, `DELETE`, `POST /import` | operator, admin, owner |
| `prompts:read` | `GET /v1/prompts*` | viewer, auditor, operator, admin, owner |
| `prompts:write` | `POST`, `PATCH`, `DELETE`, append version | operator, admin, owner |
| `providers:read` | `GET /v1/provider-keys` (masked) | viewer, auditor, operator, admin, owner |
| `providers:write` | `POST`, `PATCH`, `DELETE`, `/test` | operator, admin, owner |
| `policy:read` | `GET /v1/agents-store/*` | operator, admin, owner |

### Auth + tenant + user admin

| Permission | Roles |
|---|---|
| `keys:read` | viewer, auditor, operator, admin, owner |
| `keys:*` | admin, owner |
| `tenants:read` | viewer, auditor, operator, admin, owner |
| `tenants:create` | admin, owner |
| `tenants:update` | admin, owner |
| `users:read` | viewer, auditor, operator, admin, owner |
| `users:*` | admin, owner |
| `teams:read` | viewer, auditor, operator, admin, owner |
| `teams:*` | admin, owner |
| `invites:*` | admin, owner |
| `policy:*` | admin, owner |

### Observability + audit

| Permission | Roles |
|---|---|
| `audit:read` | viewer, auditor, operator, admin, owner |
| `aletheia:read` | viewer, auditor, operator, admin, owner |
| `aletheia:decrypt` | **auditor only** (MFA-gated) |
| `aletheia:*` | admin, owner |
| `analytics:read` | viewer, auditor, operator, admin, owner |
| `analytics:*` | admin, owner |

### Legacy / extended (still present, not foregrounded in Pantheon UX)

| Permission | Notes |
|---|---|
| `detection:*` | SoulWatch rule management; admin / owner |
| `enforcement:*` | Quarantine policy management; admin / owner |
| `multi_tenant` | Cross-tenant view flag; admin only |
| `hierarchy:manage` | Tenant hierarchy management; admin only |

The detection / enforcement permission set governs the SoulWatch and
SoulGate subsystems, which remain in `src/soulwatch/` and
`src/soulgate/` but are not surfaced in the current Pantheon
dashboard. See [`ANALYST_GUIDE.md`](../ANALYST_GUIDE.md) for the
"out of scope for Pantheon" note.

## 3. Account admin designations

Two boolean flags on `_soulauth_users` provide tenant-wide
administrative authority independent of role:

| Flag | Purpose |
|---|---|
| `is_account_admin` | Full tenant administrative authority. Bypasses team-level role checks. Can designate secondary admins. |
| `is_secondary_admin` | Delegated tenant administrative authority. Can manage users + teams but cannot modify account admin settings. |

Account-admin permissions cover user / team / invite CRUD plus a
`account:secondary_admin` designation grant.

## 4. Team-level roles

Pantheon supports teams as a second authorization layer within a
tenant. Team roles further restrict the user's tenant-level role
within team-scoped operations:

| Team role | Slug | Powers |
|---|---|---|
| Team admin | `team_admin` | Full control of the team |
| Analyst | `analyst` | Investigate + modify within team scope |
| Member | `member` | Read-only team view |

Team roles compose with tenant roles: the effective permission set
for a team-scoped operation is the intersection of the user's tenant
role permissions and the team role's permissions.

## 5. Database overrides

`_role_permissions` accepts per-tenant override rows that extend
(not replace) the defaults in `DEFAULT_ROLE_PERMISSIONS`. To add a
permission to a role for a specific tenant:

```sql
INSERT INTO _role_permissions (tenant_id, role_name, permission)
VALUES ('<tenant-uuid>', 'operator', 'tenants:create');
```

Then invalidate the cache via the `POST /v1/auth/rbac/invalidate`
endpoint (admin only) or restart platform-api.

Defaults are never modified; overrides only extend. To remove a
default permission from a role, you must edit `src/auth/rbac.py` and
rebuild.

## 6. Verifying a role's effective permissions

```bash
curl -s "http://localhost:8000/v1/auth/whoami" \
  -H "X-SoulKey: $SOULKEY" | jq '.role, .permissions'
```

Or in Python:

```python
from src.auth.rbac import get_role_permissions
perms = get_role_permissions('operator')
print(perms)
```

## See also

- [`apps/platform-api/src/auth/rbac.py`](../../src/auth/rbac.py) — source of truth
- [`chapters/part2-auth-access.md`](../chapters/part2-auth-access.md) — auth chapter
- [`ADMIN_GUIDE.md`](../ADMIN_GUIDE.md) — user management overview
