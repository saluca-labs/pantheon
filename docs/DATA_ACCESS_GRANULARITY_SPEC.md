# Data Access Granularity Specification

**Version:** 1.0.0
**Date:** 2026-04-03
**Status:** To Build
**Author:** Cristian Ruvalcaba / Alfred

---

## 1. Problem Statement

Tiresias today enforces access at the **endpoint level** only. Once a user passes the RBAC permission gate (e.g., `audit:read`), they see the same data as every other user with that permission -- full field access, no masking, no dataset-level granularity.

Current gaps:

- All users with `audit:read` see identical audit log fields (including full context JSON).
- Team roles (`team_admin`, `analyst`, `member`) exist in the `_soul_team_members` table but are **not enforced** on data queries.
- Viewers see everything admins see once past the permission gate.
- No concept of hash-only, metadata-only, or export-controlled access.
- Investigation evidence has a 3-level model (`hashes` / `context` / `cleartext`) but this is hardcoded per endpoint, not configurable per user or team.

This spec defines a **per-dataset, per-level** access control system that tenant admins can configure for their users, teams, and roles.

---

## 2. Data Access Levels

Six access levels form a strict hierarchy. Higher levels include all capabilities of lower levels.

| Level | Name          | Description                                      |
|-------|---------------|--------------------------------------------------|
| 0     | `none`        | No access to the dataset                         |
| 1     | `metadata`    | Counts, summaries, aggregate stats only          |
| 2     | `hash_only`   | Hashes and metadata -- no plaintext fields       |
| 3     | `read`        | Full read access to all fields                   |
| 4     | `read_export` | Read + ability to export/download data           |
| 5     | `manage`      | Full CRUD + export                               |

The level integer is used for comparison: a user with level 3 can do everything levels 0-3 permit but not level 4 or 5 operations.

**To Build:** New enum in `src/auth/data_access.py`.

```python
from enum import IntEnum

class AccessLevel(IntEnum):
    NONE = 0
    METADATA = 1
    HASH_ONLY = 2
    READ = 3
    READ_EXPORT = 4
    MANAGE = 5
```

---

## 3. Datasets

These are the logical datasets that access levels apply to. Each dataset maps to one or more database tables and API endpoint groups.

| Dataset                    | Description                                   | Primary Table(s)                        | Router File                              |
|----------------------------|-----------------------------------------------|-----------------------------------------|------------------------------------------|
| `audit_logs`               | Immutable audit trail (hash-chained)          | `_soulauth_audit`                       | `src/audit/logger.py`                    |
| `detection_events`         | Sigma matches, anomalies, playbook executions | In-memory engine + match buffer         | `src/detection/router.py`                |
| `investigation_evidence`   | CoT chains, prompts, completions              | `tiresias_audit_log`                    | `src/investigation/router.py`            |
| `soulkeys`                 | Agent identity records                        | `_soulkeys`                             | `src/auth/soulkey.py`, key router        |
| `policies`                 | Policy-as-code YAML, quarantine policies      | `_quarantine_policies`, policy files    | `src/enforcement/router.py`              |
| `quarantine_records`       | Enforcement actions, quarantine history        | `_quarantine_records`                   | `src/enforcement/router.py`              |
| `analytics`                | Behavioral baselines, anomaly scores          | In-memory engine                        | `src/analytics/router.py`               |
| `team_data`                | Team membership, roles, invites               | `_soul_teams`, `_soul_team_members`     | `src/teams/router.py`                    |
| `billing`                  | Subscription, invoices, usage metering        | `_soul_tenants`, Stripe integration     | Portal settings backend                  |

**To Build:** Dataset registry constant in `src/auth/data_access.py`.

```python
DATASETS = {
    "audit_logs",
    "detection_events",
    "investigation_evidence",
    "soulkeys",
    "policies",
    "quarantine_records",
    "analytics",
    "team_data",
    "billing",
}
```

---

## 4. Field-Level Masking Per Dataset

For each dataset, the following tables define which fields are visible at each access level. Fields listed at a level are **additive** -- each level includes all fields from lower levels.

### 4.1 `audit_logs`

Source: `_soulauth_audit` table, queried via `src/audit/logger.py::query_audit_log`.

| Level         | Visible Fields                                                                                     |
|---------------|----------------------------------------------------------------------------------------------------|
| `metadata`    | `event_type`, `timestamp`, `decision` -- **aggregated only** (counts by type, counts by decision)  |
| `hash_only`   | + `id`, `soulkey_id` (SHA-256 truncated to 12 chars), `resource`, `action`, `scope`, `prev_hash`  |
| `read`        | + `persona_id`, `capability_id`, `reason`, `context` (full JSON)                                   |
| `read_export` | Same as `read` + downloadable as CSV/JSON                                                          |
| `manage`      | Same + cross-tenant query (MSSP parent can query child tenants)                                    |

**Masking example at `hash_only`:**

```json
{
  "id": "a1b2c3d4-...",
  "event_type": "auth_grant",
  "timestamp": "2026-04-03T14:22:00Z",
  "soulkey_id": "sha256:e3b0c4...",
  "resource": "llm/gpt-4",
  "action": "inference",
  "scope": "tenant",
  "decision": "allow",
  "prev_hash": "abc123def456..."
}
```

Fields stripped: `persona_id`, `capability_id`, `reason`, `context`.

**Masking example at `metadata`:**

```json
{
  "total_events": 1247,
  "by_event_type": {
    "auth_grant": 890,
    "auth_deny": 42,
    "key_issued": 15,
    "policy_violation": 3
  },
  "by_decision": {
    "allow": 1190,
    "deny": 57
  },
  "time_range": {
    "start": "2026-04-02T00:00:00Z",
    "end": "2026-04-03T00:00:00Z"
  }
}
```

No individual records returned.

### 4.2 `detection_events`

Source: Sigma engine match buffer, queried via `src/detection/router.py`.

| Level         | Visible Fields                                                                                    |
|---------------|---------------------------------------------------------------------------------------------------|
| `metadata`    | `rules_loaded`, `rules_enabled`, `matches_last_hour`, `total_matches_buffered` (engine status)    |
| `hash_only`   | + `rule_id`, `rule_title`, `level`, `timestamp` -- per match, but `matched_fields` values hashed  |
| `read`        | + `matched_fields` (plaintext), `response_playbook`, full rule detail (detection logic, tags)      |
| `read_export` | Same as `read` + downloadable match history                                                       |
| `manage`      | Same + CRUD on rules and playbooks (`detection:write`)                                            |

**Masking example at `hash_only`:**

```json
{
  "rule_id": "sigma-credential-stuffing-01",
  "rule_title": "Credential Stuffing Attempt",
  "level": "high",
  "timestamp": "2026-04-03T14:30:00Z",
  "matched_fields": {
    "event_type": "sha256:a1b2c3...",
    "soulkey_id": "sha256:d4e5f6..."
  }
}
```

### 4.3 `investigation_evidence`

Source: `tiresias_audit_log` table, queried via `src/investigation/router.py`.

This dataset maps directly to the existing 3-level investigation model but extends it with the granularity framework.

| Level         | Visible Fields                                                                                             |
|---------------|------------------------------------------------------------------------------------------------------------|
| `none`        | No access. Investigation endpoints return 403.                                                             |
| `metadata`    | Record count, model distribution, token usage totals, cost totals -- no individual records.                |
| `hash_only`   | `record_id`, `request_hash`, `response_hash`, `model`, `created_at` (maps to existing Level 0 hashes)     |
| `read`        | + `provider`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `session_id` (maps to existing Level 1)   |
| `read_export` | + `prompt` (decrypted), `completion` (decrypted), `integrity_hash` -- **requires investigation token**     |
| `manage`      | Same + can issue investigation tokens (`audit:manage` permission)                                          |

The existing investigation token system remains as a **secondary gate** for `read_export` level. A user must have both `read_export` access level AND a valid one-time investigation token to retrieve cleartext.

### 4.4 `soulkeys`

Source: `_soulkeys` table.

| Level         | Visible Fields                                                                          |
|---------------|-----------------------------------------------------------------------------------------|
| `metadata`    | Count of keys, status distribution (`active: 12, suspended: 2, revoked: 1`)             |
| `hash_only`   | `key_hash` (truncated to 12 chars), `status`, `created_at`, `expires_at`                |
| `read`        | + `id`, `persona_id`, `tenant_id`, `metadata_`, `capabilities`                          |
| `read_export` | Same as `read` + downloadable key inventory report                                      |
| `manage`      | Same + issue, suspend, revoke, rotate, reinstate (`keys:*` operations)                  |

**Masking example at `hash_only`:**

```json
{
  "key_hash": "e3b0c44298fc...",
  "status": "active",
  "created_at": "2026-03-15T10:00:00Z",
  "expires_at": "2027-03-15T10:00:00Z"
}
```

### 4.5 `policies`

Source: Policy YAML files, `_quarantine_policies` table.

| Level         | Visible Fields                                                                           |
|---------------|------------------------------------------------------------------------------------------|
| `metadata`    | Count of policies, types loaded, last sync timestamp                                     |
| `hash_only`   | Policy IDs, trigger types, severity thresholds -- no action details                      |
| `read`        | + Full policy YAML, actions, cooldown, auto-release config, enabled state                |
| `read_export` | Same as `read` + downloadable policy bundle                                              |
| `manage`      | Same + create, update, delete, sync policies                                             |

### 4.6 `quarantine_records`

Source: `_quarantine_records` table, queried via `src/enforcement/router.py`.

| Level         | Visible Fields                                                                                          |
|---------------|---------------------------------------------------------------------------------------------------------|
| `metadata`    | Active quarantine count, count by status, count by trigger type                                         |
| `hash_only`   | + `id`, `soulkey_id` (hashed), `triggered_by_type`, `status`, `quarantined_at`, `released_at`          |
| `read`        | + `persona_id`, `actions_taken`, `reason`, `auto_release_at`, `released_by`                             |
| `read_export` | Same as `read` + `flagged_prompt`, `flagged_completion` (sensitive) + downloadable                      |
| `manage`      | Same + manual quarantine, release, modify quarantine parameters                                         |

**Note:** `flagged_prompt` and `flagged_completion` contain potentially sensitive content and are only visible at `read_export` and above. This is a change from today where `enforcement:read` exposes them.

### 4.7 `analytics`

Source: In-memory baseline engine and anomaly detector, queried via `src/analytics/router.py`.

| Level         | Visible Fields                                                                                   |
|---------------|--------------------------------------------------------------------------------------------------|
| `metadata`    | Anomaly count by type, anomaly count by severity, agent count with baselines                     |
| `hash_only`   | + `soulkey_id` (hashed), anomaly `type`, `severity`, `timestamp` -- no score or detail           |
| `read`        | + `anomaly_score`, full baseline profile, `matched_fields`, trend data                           |
| `read_export` | Same as `read` + downloadable anomaly/baseline reports                                           |
| `manage`      | Same + rebuild baselines, modify detection thresholds                                            |

### 4.8 `team_data`

Source: `_soul_teams`, `_soul_team_members`, `_soul_user_invites` tables, queried via `src/teams/router.py`.

| Level         | Visible Fields                                                                           |
|---------------|------------------------------------------------------------------------------------------|
| `metadata`    | Team count, member count per team, role distribution                                     |
| `hash_only`   | + Team names, slugs, `is_default` -- member list shows `user_id` (hashed), `team_role`   |
| `read`        | + Full member details (name, email), invite status, `joined_at`, `added_by`              |
| `read_export` | Same as `read` + downloadable team roster                                                |
| `manage`      | Same + create/delete teams, add/remove members, change roles, manage invites             |

### 4.9 `billing`

Source: `_soul_tenants` table + Stripe integration.

| Level         | Visible Fields                                                                           |
|---------------|------------------------------------------------------------------------------------------|
| `metadata`    | Current plan name, billing cycle, next invoice date                                      |
| `hash_only`   | + Invoice count, total spend (no line items)                                             |
| `read`        | + Invoice line items, usage breakdown, payment method (last 4 only), plan limits         |
| `read_export` | Same as `read` + downloadable invoices (PDF)                                             |
| `manage`      | Same + change plan, update payment method, manage seats                                  |

---

## 5. Data Access Policy Table

**To Build:** New Alembic migration (next available revision after current head).

```sql
CREATE TABLE _data_access_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES _soul_tenants(id) ON DELETE CASCADE,
    target_type     VARCHAR(20) NOT NULL,       -- 'role', 'team', 'user'
    target_id       VARCHAR(255) NOT NULL,       -- role name (e.g. 'viewer'), team UUID, or user UUID
    dataset         VARCHAR(50) NOT NULL,        -- e.g. 'audit_logs', 'soulkeys'
    access_level    VARCHAR(20) NOT NULL,        -- 'none', 'metadata', 'hash_only', 'read', 'read_export', 'manage'
    created_by      UUID REFERENCES _soul_users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dap_tenant_target_dataset
        UNIQUE (tenant_id, target_type, target_id, dataset),
    CONSTRAINT ck_dap_target_type
        CHECK (target_type IN ('role', 'team', 'user')),
    CONSTRAINT ck_dap_access_level
        CHECK (access_level IN ('none', 'metadata', 'hash_only', 'read', 'read_export', 'manage')),
    CONSTRAINT ck_dap_dataset
        CHECK (dataset IN (
            'audit_logs', 'detection_events', 'investigation_evidence',
            'soulkeys', 'policies', 'quarantine_records',
            'analytics', 'team_data', 'billing'
        ))
);

CREATE INDEX idx_dap_tenant ON _data_access_policies(tenant_id);
CREATE INDEX idx_dap_lookup ON _data_access_policies(tenant_id, target_type, target_id);
```

**SQLAlchemy model** in `src/database/models.py`:

```python
class DataAccessPolicy(Base):
    __tablename__ = "_data_access_policies"

    id = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    tenant_id = Column(Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False)
    target_type = Column(VARCHAR(20), nullable=False)     # 'role', 'team', 'user'
    target_id = Column(VARCHAR(255), nullable=False)       # role name, team UUID, or user UUID
    dataset = Column(VARCHAR(50), nullable=False)
    access_level = Column(VARCHAR(20), nullable=False)
    created_by = Column(Uuid, ForeignKey("_soul_users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        UniqueConstraint("tenant_id", "target_type", "target_id", "dataset",
                         name="uq_dap_tenant_target_dataset"),
    )
```

---

## 6. Default Access Policies

When no explicit `_data_access_policies` row exists for a target + dataset, the system falls back to these defaults. These are **not stored in the database** -- they are hardcoded constants used by the resolution logic.

### 6.1 Admin Role Defaults

| Role       | audit_logs    | detection_events | investigation_evidence | soulkeys      | policies      | quarantine_records | analytics     | team_data     | billing   |
|------------|---------------|------------------|------------------------|---------------|---------------|--------------------|---------------|---------------|-----------|
| `owner`    | `manage`      | `manage`         | `manage`               | `manage`      | `manage`      | `manage`           | `manage`      | `manage`      | `manage`  |
| `admin`    | `read_export` | `read_export`    | `read`                 | `manage`      | `manage`      | `manage`           | `read_export` | `manage`      | `read`    |
| `operator` | `read`        | `read`           | `hash_only`            | `read`        | `read`        | `read`             | `read`        | `read`        | `none`    |
| `viewer`   | `metadata`    | `metadata`       | `none`                 | `metadata`    | `read`        | `metadata`         | `metadata`    | `metadata`    | `none`    |

### 6.2 Team Role Defaults

Team role defaults apply only to datasets that support team scoping. For datasets not listed, the team role does not grant any access -- the admin role default is used instead.

| Team Role    | detection_events | investigation_evidence | quarantine_records | analytics     |
|--------------|------------------|------------------------|--------------------|---------------|
| `team_admin` | `read_export`    | `read`                 | `manage`           | `read_export` |
| `analyst`    | `read`           | `hash_only`            | `read`             | `read`        |
| `member`     | `metadata`       | `none`                 | `metadata`         | `metadata`    |

**To Build:** Default policy constants in `src/auth/data_access.py`.

```python
ADMIN_ROLE_DEFAULTS: dict[str, dict[str, str]] = {
    "owner": {ds: "manage" for ds in DATASETS},
    "admin": {
        "audit_logs": "read_export",
        "detection_events": "read_export",
        "investigation_evidence": "read",
        "soulkeys": "manage",
        "policies": "manage",
        "quarantine_records": "manage",
        "analytics": "read_export",
        "team_data": "manage",
        "billing": "read",
    },
    "operator": {
        "audit_logs": "read",
        "detection_events": "read",
        "investigation_evidence": "hash_only",
        "soulkeys": "read",
        "policies": "read",
        "quarantine_records": "read",
        "analytics": "read",
        "team_data": "read",
        "billing": "none",
    },
    "viewer": {
        "audit_logs": "metadata",
        "detection_events": "metadata",
        "investigation_evidence": "none",
        "soulkeys": "metadata",
        "policies": "read",
        "quarantine_records": "metadata",
        "analytics": "metadata",
        "team_data": "metadata",
        "billing": "none",
    },
}

TEAM_ROLE_DEFAULTS: dict[str, dict[str, str]] = {
    "team_admin": {
        "detection_events": "read_export",
        "investigation_evidence": "read",
        "quarantine_records": "manage",
        "analytics": "read_export",
    },
    "analyst": {
        "detection_events": "read",
        "investigation_evidence": "hash_only",
        "quarantine_records": "read",
        "analytics": "read",
    },
    "member": {
        "detection_events": "metadata",
        "investigation_evidence": "none",
        "quarantine_records": "metadata",
        "analytics": "metadata",
    },
}
```

---

## 7. Team Scoping

When a user accesses data through a team context, queries MUST be scoped to the team's assigned soulkeys. This prevents analysts on Team A from seeing Team B's detection events or investigations.

### 7.1 Soulkey-to-Team Assignment

A new junction table links soulkeys to teams.

**To Build:** New table in the same migration as `_data_access_policies`.

```sql
CREATE TABLE _team_soulkey_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID NOT NULL REFERENCES _soul_teams(id) ON DELETE CASCADE,
    soulkey_id  UUID NOT NULL REFERENCES _soulkeys(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES _soul_users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_team_soulkey UNIQUE (team_id, soulkey_id)
);

CREATE INDEX idx_tsa_team ON _team_soulkey_assignments(team_id);
CREATE INDEX idx_tsa_soulkey ON _team_soulkey_assignments(soulkey_id);
```

A soulkey can be assigned to multiple teams. When unassigned from all teams, only admin-role users (not team-role users) can see its data.

### 7.2 Team-Scoped Query Filters

For datasets that support team scoping, queries add a filter:

```sql
-- Detection events: filter by team's soulkeys
WHERE soulkey_id IN (
    SELECT soulkey_id FROM _team_soulkey_assignments
    WHERE team_id = :user_team_id
)

-- Investigation evidence: filter by tenant_id from team's soulkeys
WHERE tenant_id = :tenant_id
  AND session_id IN (
      SELECT DISTINCT session_id FROM tiresias_audit_log
      WHERE soulkey_id IN (
          SELECT soulkey_id FROM _team_soulkey_assignments
          WHERE team_id = :user_team_id
      )
  )

-- Quarantine records: filter by team's soulkeys
WHERE soulkey_id IN (
    SELECT soulkey_id FROM _team_soulkey_assignments
    WHERE team_id = :user_team_id
)

-- Analytics baselines/anomalies: filter by team's soulkeys
WHERE soulkey_id IN (
    SELECT soulkey_id FROM _team_soulkey_assignments
    WHERE team_id = :user_team_id
)
```

### 7.3 Scope Resolution Rules

1. If the user has an **admin role** (`owner`, `admin`, `operator`, `viewer`), they see **all tenant data** (no team scoping). Their access level is determined by admin role defaults or explicit policy.
2. If the user is accessing via a **team role** (`team_admin`, `analyst`, `member`), queries are scoped to the team's assigned soulkeys.
3. If the user has both an admin role AND a team role, the **higher access level** wins, but team scoping is removed (admin role grants tenant-wide visibility).

---

## 8. Access Level Resolution

The system resolves a user's effective access level for a given dataset using a priority cascade.

### 8.1 Resolution Order

```
1. Explicit user-level policy   (target_type='user',  target_id=user.id)
2. Explicit team-level policy   (target_type='team',  target_id=user.primary_team_id)
3. Explicit role-level policy   (target_type='role',  target_id=user.admin_role)
4. Team role default            (TEAM_ROLE_DEFAULTS[team_role][dataset])
5. Admin role default           (ADMIN_ROLE_DEFAULTS[admin_role][dataset])
```

The first match wins. If step 1 exists, steps 2-5 are not evaluated.

The **effective access level** is the resolved level from the cascade above. However, the system enforces a ceiling: an explicit policy can never grant MORE access than the admin role default for `owner`. In practice, this means custom policies can restrict but never escalate beyond what the role hierarchy already permits.

### 8.2 Resolution Function

**To Build:** `src/auth/data_access.py::resolve_access_level`.

```python
async def resolve_access_level(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    admin_role: str,
    team_id: Optional[uuid.UUID],
    team_role: Optional[str],
    dataset: str,
) -> AccessLevel:
    """
    Resolve the effective access level for a user on a dataset.
    Returns the AccessLevel enum value.
    """
    # 1. Check explicit user policy
    result = await db.execute(
        select(DataAccessPolicy.access_level).where(
            DataAccessPolicy.tenant_id == tenant_id,
            DataAccessPolicy.target_type == "user",
            DataAccessPolicy.target_id == str(user_id),
            DataAccessPolicy.dataset == dataset,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        return AccessLevel[row.upper()]

    # 2. Check explicit team policy
    if team_id:
        result = await db.execute(
            select(DataAccessPolicy.access_level).where(
                DataAccessPolicy.tenant_id == tenant_id,
                DataAccessPolicy.target_type == "team",
                DataAccessPolicy.target_id == str(team_id),
                DataAccessPolicy.dataset == dataset,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            return AccessLevel[row.upper()]

    # 3. Check explicit role policy
    result = await db.execute(
        select(DataAccessPolicy.access_level).where(
            DataAccessPolicy.tenant_id == tenant_id,
            DataAccessPolicy.target_type == "role",
            DataAccessPolicy.target_id == admin_role,
            DataAccessPolicy.dataset == dataset,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        return AccessLevel[row.upper()]

    # 4. Team role default
    if team_role and team_role in TEAM_ROLE_DEFAULTS:
        team_defaults = TEAM_ROLE_DEFAULTS[team_role]
        if dataset in team_defaults:
            return AccessLevel[team_defaults[dataset].upper()]

    # 5. Admin role default
    admin_defaults = ADMIN_ROLE_DEFAULTS.get(admin_role, ADMIN_ROLE_DEFAULTS["viewer"])
    level_name = admin_defaults.get(dataset, "none")
    return AccessLevel[level_name.upper()]
```

---

## 9. Enforcement Architecture

### 9.1 Middleware / Dependency

A new FastAPI dependency `require_data_access` replaces or wraps `require_permission` for data-serving endpoints.

**To Build:** `src/auth/data_access.py::require_data_access`.

```python
def require_data_access(dataset: str, min_level: AccessLevel = AccessLevel.METADATA):
    """
    FastAPI dependency that resolves and enforces data access level.

    Usage:
        @router.get("/audit", dependencies=[Depends(require_data_access("audit_logs"))])
        async def list_audit(request: Request):
            level = request.state.data_access_level  # AccessLevel enum
            ...
    """
    async def _check(request: Request, db: AsyncSession = Depends(get_db)):
        # Resolve user identity from existing RBAC state
        soulkey = getattr(request.state, "rbac_soulkey", None)
        role = getattr(request.state, "rbac_role", "viewer")

        if soulkey is None:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Resolve team context
        user_id = soulkey.id
        tenant_id = soulkey.tenant_id
        team_id = getattr(request.state, "team_id", None)
        team_role = getattr(request.state, "team_role", None)

        level = await resolve_access_level(
            db, tenant_id, user_id, role, team_id, team_role, dataset
        )

        if level < min_level:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "insufficient_data_access",
                    "message": f"Access level '{level.name.lower()}' insufficient for dataset '{dataset}'. Minimum required: '{min_level.name.lower()}'.",
                    "dataset": dataset,
                    "current_level": level.name.lower(),
                    "required_level": min_level.name.lower(),
                },
            )

        # Store on request for downstream handlers
        request.state.data_access_level = level
        request.state.data_access_dataset = dataset
        request.state.data_access_team_scoped = (
            team_id is not None and role not in ("owner", "admin")
        )

    return _check
```

### 9.2 Response Masking Utility

**To Build:** `src/auth/data_access.py::mask_response`.

```python
import hashlib
from typing import Any

# Per-dataset field visibility at each access level
FIELD_VISIBILITY: dict[str, dict[str, list[str]]] = {
    "audit_logs": {
        "hash_only": ["id", "event_type", "timestamp", "soulkey_id", "resource",
                       "action", "scope", "decision", "prev_hash"],
        "read":      ["id", "event_type", "timestamp", "soulkey_id", "resource",
                       "action", "scope", "decision", "prev_hash",
                       "persona_id", "capability_id", "reason", "context"],
    },
    "soulkeys": {
        "hash_only": ["key_hash", "status", "created_at", "expires_at"],
        "read":      ["id", "key_hash", "status", "created_at", "expires_at",
                       "persona_id", "tenant_id", "metadata_", "capabilities"],
    },
    # ... (defined for all 9 datasets)
}

# Fields that should be hashed (not stripped) at hash_only level
HASH_FIELDS: dict[str, list[str]] = {
    "audit_logs": ["soulkey_id"],
    "detection_events": ["matched_fields"],
    "quarantine_records": ["soulkey_id"],
    "analytics": ["soulkey_id"],
    "team_data": ["user_id"],
}


def _hash_value(value: Any) -> str:
    """SHA-256 hash a value, truncated to 12 hex chars."""
    return f"sha256:{hashlib.sha256(str(value).encode()).hexdigest()[:12]}"


def mask_response(
    data: dict | list[dict],
    dataset: str,
    access_level: AccessLevel,
) -> dict | list[dict]:
    """
    Filter response data based on access level.

    - NONE: should not reach here (403 upstream)
    - METADATA: return aggregate counts only (caller must handle)
    - HASH_ONLY: keep allowed fields, hash sensitive fields
    - READ / READ_EXPORT / MANAGE: return all fields
    """
    if access_level >= AccessLevel.READ:
        return data  # No masking needed

    if access_level == AccessLevel.METADATA:
        # Caller should use a separate aggregation query
        raise ValueError("metadata level requires aggregation, not row masking")

    if access_level == AccessLevel.HASH_ONLY:
        allowed = set(FIELD_VISIBILITY.get(dataset, {}).get("hash_only", []))
        hash_fields = set(HASH_FIELDS.get(dataset, []))

        def _mask_row(row: dict) -> dict:
            masked = {}
            for key in allowed:
                if key in row:
                    if key in hash_fields:
                        masked[key] = _hash_value(row[key])
                    else:
                        masked[key] = row[key]
            return masked

        if isinstance(data, list):
            return [_mask_row(r) for r in data]
        return _mask_row(data)

    return data
```

### 9.3 Export Control

At `read_export` and above, endpoints may offer CSV/JSON/PDF download. At `read` and below, download buttons are hidden and export API calls return 403.

**To Build:** Export check utility.

```python
def check_export_allowed(request: Request) -> None:
    """Raise 403 if user does not have read_export or manage level."""
    level = getattr(request.state, "data_access_level", AccessLevel.NONE)
    if level < AccessLevel.READ_EXPORT:
        raise HTTPException(
            status_code=403,
            detail="Export requires read_export or manage access level.",
        )
```

---

## 10. API Endpoints for Access Policy Management

All endpoints require `owner` or `admin` role. Scoped to the caller's tenant.

**To Build:** New router at `src/auth/access_policy_router.py`.

### 10.1 List Policies

```
GET /v1/admin/access-policies
```

Query parameters:
- `target_type` (optional): Filter by `role`, `team`, or `user`
- `dataset` (optional): Filter by dataset name

**Response:**

```json
{
  "policies": [
    {
      "id": "a1b2c3d4-...",
      "tenant_id": "t1t2t3t4-...",
      "target_type": "role",
      "target_id": "viewer",
      "dataset": "audit_logs",
      "access_level": "hash_only",
      "created_by": "u1u2u3u4-...",
      "created_at": "2026-04-03T10:00:00Z",
      "updated_at": "2026-04-03T10:00:00Z"
    }
  ],
  "count": 1
}
```

### 10.2 Create Policy

```
POST /v1/admin/access-policies
```

**Request:**

```json
{
  "target_type": "team",
  "target_id": "b5c6d7e8-...",
  "dataset": "detection_events",
  "access_level": "read"
}
```

**Response:** `201 Created` with the created policy object.

**Validation rules:**
- `target_type` must be `role`, `team`, or `user`.
- `target_id` for `team` or `user` must be a valid UUID referencing an entity in the caller's tenant.
- `target_id` for `role` must be one of `viewer`, `operator`, `admin` (not `owner` -- owner is always `manage`).
- `dataset` must be in the `DATASETS` set.
- `access_level` must be a valid level name.
- Cannot set `access_level` higher than the admin role default for the target. (A viewer-targeted policy cannot grant `manage`.)

### 10.3 Update Policy

```
PUT /v1/admin/access-policies/{id}
```

**Request:**

```json
{
  "access_level": "read_export"
}
```

**Response:** `200 OK` with the updated policy object.

Same validation rules as create. The `id` must belong to the caller's tenant.

### 10.4 Delete Policy

```
DELETE /v1/admin/access-policies/{id}
```

**Response:** `204 No Content`.

Deleting a policy causes the target to fall back to the default access level.

### 10.5 Preview Effective Access

```
GET /v1/admin/access-policies/preview?target_type=role&target_id=viewer&dataset=audit_logs
```

Returns the effective access level after resolving the cascade, plus what fields would be visible.

**Response:**

```json
{
  "target_type": "role",
  "target_id": "viewer",
  "dataset": "audit_logs",
  "effective_level": "hash_only",
  "source": "explicit_role_policy",
  "visible_fields": [
    "id", "event_type", "timestamp", "soulkey_id", "resource",
    "action", "scope", "decision", "prev_hash"
  ],
  "hashed_fields": ["soulkey_id"],
  "hidden_fields": ["persona_id", "capability_id", "reason", "context"],
  "can_export": false
}
```

### 10.6 Bulk Preview (all datasets for a target)

```
GET /v1/admin/access-policies/preview-all?target_type=user&target_id=u1u2u3u4-...
```

**Response:**

```json
{
  "target_type": "user",
  "target_id": "u1u2u3u4-...",
  "datasets": {
    "audit_logs": { "effective_level": "read", "source": "admin_role_default" },
    "detection_events": { "effective_level": "read", "source": "team_role_default" },
    "investigation_evidence": { "effective_level": "hash_only", "source": "explicit_team_policy" },
    "soulkeys": { "effective_level": "read", "source": "admin_role_default" },
    "policies": { "effective_level": "read", "source": "admin_role_default" },
    "quarantine_records": { "effective_level": "read", "source": "admin_role_default" },
    "analytics": { "effective_level": "read", "source": "team_role_default" },
    "team_data": { "effective_level": "read", "source": "admin_role_default" },
    "billing": { "effective_level": "none", "source": "admin_role_default" }
  }
}
```

---

## 11. Admin Configuration UI

**To Build:** Portal pages (Next.js) under `/dashboard/settings/access-policies`.

### 11.1 Policy Table View

- Table columns: Target Type, Target Name, Dataset, Access Level, Last Modified
- Filters: by target type, by dataset
- Inline edit for access level (dropdown)
- Delete with confirmation dialog

### 11.2 Create/Edit Policy Modal

- Select target type (Role / Team / User) -- radio buttons
- Select target:
  - Role: dropdown with `viewer`, `operator`, `admin`
  - Team: dropdown populated from tenant's teams
  - User: searchable dropdown populated from tenant's users
- Select dataset: dropdown from `DATASETS`
- Select access level: dropdown with visual indicator showing what each level means
- Preview panel: shows "This user/team/role will see these fields" based on selected level

### 11.3 Access Matrix View

A grid view showing all targets (rows) vs. all datasets (columns), with colored cells indicating access level:

| Color   | Level         |
|---------|---------------|
| Red     | `none`        |
| Orange  | `metadata`    |
| Yellow  | `hash_only`   |
| Green   | `read`        |
| Blue    | `read_export` |
| Purple  | `manage`      |

Cells with explicit policies are bold. Default-fallback cells are dimmed. Click to edit.

---

## 12. Audit Logging of Policy Changes

All policy CRUD operations are logged to the audit trail via `src/audit/logger.py::log_auth_event`.

```python
await log_auth_event(
    db=db,
    tenant_id=tenant_id,
    event_type="policy_synced",      # reuse existing event type
    soulkey_id=caller_soulkey_id,
    persona_id="access-policy-admin",
    resource="data_access_policy",
    action="create",                  # or "update", "delete"
    scope="tenant",
    decision="allow",
    reason=f"Set {dataset} access for {target_type}:{target_id} to {access_level}",
    context={
        "policy_id": str(policy.id),
        "target_type": target_type,
        "target_id": target_id,
        "dataset": dataset,
        "access_level": access_level,
        "previous_level": previous_level,  # for updates
    },
)
```

---

## 13. Implementation Phases

### Phase 1: Core Framework + Audit Logs + Soulkeys

**Target files to modify:**
- `src/auth/data_access.py` (NEW) -- AccessLevel enum, defaults, resolve function, mask utility
- `src/database/models.py` -- Add `DataAccessPolicy` model
- `alembic/versions/00XX_data_access_policies.py` (NEW) -- Migration
- `src/audit/logger.py` -- Modify `query_audit_log` to accept and apply `AccessLevel`
- `src/auth/rbac.py` -- Extend `require_permission` to set team context on `request.state`

**Deliverables:**
- `_data_access_policies` table deployed
- `resolve_access_level()` function
- `mask_response()` utility
- `require_data_access()` dependency
- Audit log endpoints return masked data based on access level
- Soulkey list/detail endpoints return masked data based on access level

### Phase 2: Team Scoping + Investigation Evidence

**Target files to modify:**
- `alembic/versions/00XX_team_soulkey_assignments.py` (NEW) -- Migration for junction table
- `src/investigation/router.py` -- Integrate `require_data_access("investigation_evidence")`
- `src/detection/router.py` -- Integrate `require_data_access("detection_events")` + team scoping
- `src/enforcement/router.py` -- Integrate `require_data_access("quarantine_records")` + team scoping
- `src/analytics/router.py` -- Integrate `require_data_access("analytics")` + team scoping
- `src/teams/router.py` -- Add soulkey assignment endpoints

**Deliverables:**
- `_team_soulkey_assignments` table deployed
- Team-scoped queries on all four team-scopable datasets
- Investigation evidence respects access level (investigation tokens remain as secondary gate for cleartext)
- Soulkey assignment CRUD: `POST/DELETE /v1/teams/{team_id}/soulkeys/{soulkey_id}`

### Phase 3: Admin Configuration UI + Custom Policies

**Target files to modify:**
- `src/auth/access_policy_router.py` (NEW) -- API endpoints for policy CRUD + preview
- Portal: `pages/dashboard/settings/access-policies.tsx` (NEW)
- Portal: `components/AccessPolicyMatrix.tsx` (NEW)
- Portal: `components/AccessPolicyModal.tsx` (NEW)

**Deliverables:**
- All 6 API endpoints (list, create, update, delete, preview, preview-all)
- Portal settings page with table view, create/edit modal, matrix view
- Audit logging of all policy changes

### Phase 4: Export Controls + Rate Limiting

**Target files to modify:**
- All routers with export functionality -- add `check_export_allowed()` guard
- `src/auth/data_access.py` -- Add rate limiting for export operations
- Portal -- conditionally show/hide export buttons based on access level

**Deliverables:**
- Export endpoints enforce `read_export` minimum
- Rate limiting: max 10 exports per hour per user (configurable per tenant)
- Portal hides export UI elements when user lacks `read_export`
- CSV, JSON, and PDF export formats where applicable

---

## 14. Security Considerations

### 14.1 Tenant Isolation

- Access policies are strictly tenant-scoped. The `tenant_id` column + index ensures no cross-tenant leakage.
- All policy CRUD endpoints extract `tenant_id` from the authenticated session, never from request body.
- MSSP parent tenants can view child tenant policies via hierarchy permission check (`src/auth/rbac.py::check_hierarchy_permission`), but cannot modify them.

### 14.2 Owner Immutability

- The `owner` role ALWAYS has `manage` on all datasets. This is enforced in code, not by policy rows.
- No policy row can target `owner` -- the API rejects `target_type='role', target_id='owner'` with 400.
- If an owner is downgraded to a lower role, their data access follows the new role's defaults.

### 14.3 Escalation Prevention

- A custom policy can **restrict** access below the role default but can **never escalate** above it.
- Example: A tenant admin can set `viewer` from `metadata` (default) down to `none` on `audit_logs`, but cannot set `viewer` to `read_export` on `audit_logs`.
- Exception: team-level policies CAN grant up to the `team_admin` default for the dataset, since team admins may want to promote specific teams.
- The enforcement ceiling is: `min(requested_level, max_level_for_role_or_team_role)`.

### 14.4 Server-Side Enforcement

- Team scoping filters are applied server-side in SQL queries. The `team_id` used for scoping comes from the authenticated session (user's `primary_team_id` or explicit team context), never from a client-supplied parameter.
- The `mask_response()` utility runs server-side before serialization. No masked fields are ever sent over the wire.

### 14.5 Cache Invalidation

- Access level resolution may be cached per-request (stored on `request.state`) but is NOT cached across requests.
- If policy caching is added later (e.g., Redis), cache TTL must be <= 60 seconds, and policy CRUD must invalidate the cache for the affected tenant.

### 14.6 Backward Compatibility

- Existing endpoints continue to work without modification until each is migrated to use `require_data_access`.
- During the transition, endpoints using only `require_permission` behave as today (full field access once past the gate).
- Migration is per-endpoint, per-phase. No big-bang cutover.

---

## 15. Migration Path from Current RBAC

### 15.1 Current State (Pre-Implementation)

```
User --> require_permission("audit:read") --> Full field access
```

### 15.2 Target State (Post-Implementation)

```
User --> require_permission("audit:read")
     --> require_data_access("audit_logs")
         --> resolve_access_level()
             --> Check explicit policy (user > team > role)
             --> Fall back to defaults
         --> mask_response(data, "audit_logs", level)
     --> Return masked response
```

### 15.3 Endpoint Migration Checklist

Each endpoint migration follows this pattern:

1. Add `Depends(require_data_access("dataset_name"))` to the endpoint decorator.
2. Read `request.state.data_access_level` in the handler.
3. If level is `METADATA`, switch to an aggregation query and return counts.
4. If level is `HASH_ONLY` or higher, run the normal query but pass through `mask_response()`.
5. If the endpoint supports export, add `check_export_allowed()`.

**Endpoints to migrate (by phase):**

Phase 1:
- `GET /v1/audit` (audit log query)
- `GET /v1/keys` (soulkey list)
- `GET /v1/keys/{id}` (soulkey detail)

Phase 2:
- `POST /v1/investigation/evidence/hashes`
- `POST /v1/investigation/evidence/context`
- `POST /v1/investigation/evidence/cleartext`
- `GET /v1/detection/rules`
- `GET /v1/detection/matches`
- `GET /v1/detection/status`
- `GET /v1/enforcement/quarantine`
- `GET /v1/analytics/anomalies`
- `GET /v1/analytics/baseline/{soulkey_id}`
- `GET /v1/analytics/dashboard`

Phase 3:
- `GET /v1/teams` (team list)
- `GET /v1/teams/{id}/members` (member list)
- Billing endpoints (portal backend)

---

## 16. Testing Strategy

### 16.1 Unit Tests

- `test_resolve_access_level`: Verify cascade resolution (user > team > role > default).
- `test_mask_response`: Verify field stripping and hashing at each level.
- `test_escalation_prevention`: Verify that policies cannot exceed role ceiling.
- `test_owner_immutability`: Verify owner always resolves to `manage`.

### 16.2 Integration Tests

- Create a tenant with users at each role. Set explicit policies. Verify each endpoint returns correctly masked data.
- Create two teams with different soulkey assignments. Verify team members only see their team's data.
- Verify that deleting a policy causes fallback to defaults.

### 16.3 Security Tests

- Attempt cross-tenant policy manipulation (should 403).
- Attempt to set owner access level (should 400).
- Attempt to escalate viewer to manage (should 400).
- Attempt to bypass team scoping by supplying `team_id` in query params (should be ignored).
- Verify that `mask_response` never leaks fields at `hash_only` level even if the handler forgets to check.

---

## Appendix A: Full Field Visibility Reference

Comprehensive mapping of every dataset field to its minimum required access level.

### audit_logs (_soulauth_audit)

| Field            | metadata | hash_only | read | read_export | manage |
|------------------|----------|-----------|------|-------------|--------|
| (aggregates)     | Y        | Y         | Y    | Y           | Y      |
| id               |          | Y         | Y    | Y           | Y      |
| event_type       |          | Y         | Y    | Y           | Y      |
| timestamp        |          | Y         | Y    | Y           | Y      |
| soulkey_id       |          | hashed    | Y    | Y           | Y      |
| resource         |          | Y         | Y    | Y           | Y      |
| action           |          | Y         | Y    | Y           | Y      |
| scope            |          | Y         | Y    | Y           | Y      |
| decision         |          | Y         | Y    | Y           | Y      |
| prev_hash        |          | Y         | Y    | Y           | Y      |
| persona_id       |          |           | Y    | Y           | Y      |
| capability_id    |          |           | Y    | Y           | Y      |
| reason           |          |           | Y    | Y           | Y      |
| context          |          |           | Y    | Y           | Y      |

### soulkeys (_soulkeys)

| Field            | metadata | hash_only | read | read_export | manage |
|------------------|----------|-----------|------|-------------|--------|
| (aggregates)     | Y        | Y         | Y    | Y           | Y      |
| key_hash         |          | truncated | Y    | Y           | Y      |
| status           |          | Y         | Y    | Y           | Y      |
| created_at       |          | Y         | Y    | Y           | Y      |
| expires_at       |          | Y         | Y    | Y           | Y      |
| id               |          |           | Y    | Y           | Y      |
| persona_id       |          |           | Y    | Y           | Y      |
| tenant_id        |          |           | Y    | Y           | Y      |
| metadata_        |          |           | Y    | Y           | Y      |
| capabilities     |          |           | Y    | Y           | Y      |

### investigation_evidence (tiresias_audit_log)

| Field               | metadata | hash_only | read | read_export | manage |
|---------------------|----------|-----------|------|-------------|--------|
| (aggregates)        | Y        | Y         | Y    | Y           | Y      |
| record_id           |          | Y         | Y    | Y           | Y      |
| request_hash        |          | Y         | Y    | Y           | Y      |
| response_hash       |          | Y         | Y    | Y           | Y      |
| model               |          | Y         | Y    | Y           | Y      |
| created_at          |          | Y         | Y    | Y           | Y      |
| provider            |          |           | Y    | Y           | Y      |
| prompt_tokens       |          |           | Y    | Y           | Y      |
| completion_tokens   |          |           | Y    | Y           | Y      |
| cost_usd            |          |           | Y    | Y           | Y      |
| session_id          |          |           | Y    | Y           | Y      |
| prompt (decrypted)  |          |           |      | Y + token   | Y      |
| completion (decrypt)|          |           |      | Y + token   | Y      |
| integrity_hash      |          |           |      | Y + token   | Y      |

### quarantine_records (_quarantine_records)

| Field                | metadata | hash_only | read | read_export | manage |
|----------------------|----------|-----------|------|-------------|--------|
| (aggregates)         | Y        | Y         | Y    | Y           | Y      |
| id                   |          | Y         | Y    | Y           | Y      |
| soulkey_id           |          | hashed    | Y    | Y           | Y      |
| triggered_by_type    |          | Y         | Y    | Y           | Y      |
| status               |          | Y         | Y    | Y           | Y      |
| quarantined_at       |          | Y         | Y    | Y           | Y      |
| released_at          |          | Y         | Y    | Y           | Y      |
| persona_id           |          |           | Y    | Y           | Y      |
| actions_taken        |          |           | Y    | Y           | Y      |
| reason               |          |           | Y    | Y           | Y      |
| auto_release_at      |          |           | Y    | Y           | Y      |
| released_by          |          |           | Y    | Y           | Y      |
| flagged_prompt       |          |           |      | Y           | Y      |
| flagged_completion   |          |           |      | Y           | Y      |

### detection_events (match buffer)

| Field              | metadata | hash_only | read | read_export | manage |
|--------------------|----------|-----------|------|-------------|--------|
| (engine status)    | Y        | Y         | Y    | Y           | Y      |
| rule_id            |          | Y         | Y    | Y           | Y      |
| rule_title         |          | Y         | Y    | Y           | Y      |
| level              |          | Y         | Y    | Y           | Y      |
| timestamp          |          | Y         | Y    | Y           | Y      |
| matched_fields     |          | hashed    | Y    | Y           | Y      |
| response_playbook  |          |           | Y    | Y           | Y      |
| (rule CRUD)        |          |           |      |             | Y      |

### analytics (baseline engine + anomaly detector)

| Field              | metadata | hash_only | read | read_export | manage |
|--------------------|----------|-----------|------|-------------|--------|
| (summary counts)   | Y        | Y         | Y    | Y           | Y      |
| soulkey_id         |          | hashed    | Y    | Y           | Y      |
| anomaly type       |          | Y         | Y    | Y           | Y      |
| severity           |          | Y         | Y    | Y           | Y      |
| timestamp          |          | Y         | Y    | Y           | Y      |
| anomaly_score      |          |           | Y    | Y           | Y      |
| baseline profile   |          |           | Y    | Y           | Y      |
| matched_fields     |          |           | Y    | Y           | Y      |
| trend data         |          |           | Y    | Y           | Y      |
| (rebuild)          |          |           |      |             | Y      |
