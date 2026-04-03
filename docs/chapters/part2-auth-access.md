# Part II: Authentication & Access Control

> **Tiresias Administration Guide v3.0**
> Classification: Internal / Customer-Facing
> Audience: Security administrators, SOC managers, MSSPs, platform operators

---

## Chapter 5: SoulAuth -- Agent Identity Management

SoulAuth is the identity layer of the Tiresias platform. Every AI agent that interacts with Tiresias-protected resources must authenticate with a **SoulKey** -- a cryptographic credential that ties the agent to a tenant, a persona, and a set of authorization policies. This chapter covers the full lifecycle of SoulKey management: issuance, inspection, rotation, suspension, and permanent revocation.

### 5.1 Understanding SoulKeys

A SoulKey is a cryptographic bearer token that serves as the primary identity credential for AI agents in the Tiresias platform.

**Key properties:**

| Property | Detail |
|---|---|
| Format | `sk_agent_<tenant_short>_<persona_slug>_<hex64>` |
| Hash algorithm | SHA-512 |
| Storage | Only the SHA-512 hash is stored; the raw key is never persisted |
| Display | The raw key is shown exactly once at issuance and cannot be recovered |
| Transport | Passed via `X-SoulKey` header or `Authorization: Bearer <key>` |

**How SoulKey authentication works:**

1. The agent presents its raw SoulKey in the request header.
2. SoulAuth computes the SHA-512 hash of the presented key.
3. The hash is looked up in the `_soulauth_keys` table.
4. If matched and the key status is `active`, identity is resolved.
5. The `last_used_at` timestamp is updated on every successful resolution.
6. If the key has an `expires_at` value in the past, it is automatically revoked with reason `"Key expired"` and the request is denied.

**SoulKey states:**

```
                  +-----------+
    Issue ------> |  active   |
                  +-----+-----+
                        |
              +---------+---------+
              |                   |
         suspend()           revoke()
              |                   |
        +-----v-----+      +-----v-----+
        | suspended  |      |  revoked  |
        +-----+-----+      +-----------+
              |                (terminal)
         reinstate()
              |
        +-----v-----+
        |  active    |
        +-----------+
```

- **active** -- The key can authenticate requests.
- **suspended** -- Reversible deactivation. The agent receives DENY decisions. Can be reinstated.
- **revoked** -- Permanent, terminal state. Cannot be reinstated. Used for decommissioning and key compromise response.

> **Security note:** Expired keys are *revoked*, not suspended. This is intentional -- an expired credential should never be reinstated. A new key must be issued instead.

### 5.2 Issue and Revoke SoulKeys

#### Issue a New SoulKey

**Endpoint:** `POST /v1/soulauth/admin/keys`
**Required permission:** `keys:create`

```bash
curl -s -X POST https://tiresias.network/v1/soulauth/admin/keys \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "persona_id": "data-analyst-01",
    "label": "Data analyst agent - production",
    "expires_at": "2027-01-01T00:00:00Z",
    "metadata": {
      "admin_role": "viewer",
      "department": "analytics",
      "environment": "production"
    }
  }'
```

**Response (200 OK):**

```json
{
  "soulkey_id": "f7e6d5c4-b3a2-1098-7654-321fedcba098",
  "raw_key": "sk_agent_sal_data-analyst-01_a3f8c1d9e4b7...64hex...",
  "persona_id": "data-analyst-01",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "active",
  "issued_at": "2026-04-02T12:00:00Z",
  "expires_at": "2027-01-01T00:00:00Z"
}
```

> **CRITICAL:** The `raw_key` value is displayed exactly once. It is never stored in the database -- only its SHA-512 hash is persisted. Copy and store the raw key in a secrets manager immediately. If lost, issue a new key.

**Request fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `tenant_id` | UUID | Yes | The tenant this key belongs to |
| `persona_id` | string | Yes | The agent persona identifier (used in policy resolution) |
| `label` | string | No | Human-readable label for the key |
| `expires_at` | ISO 8601 | No | Expiration timestamp. Omit for non-expiring keys |
| `metadata` | object | No | Arbitrary metadata. Use `admin_role` to set RBAC role |

#### List SoulKeys

**Endpoint:** `GET /v1/soulauth/admin/keys`
**Required permission:** `keys:read`

```bash
# List all active keys for a tenant
curl -s "https://tiresias.network/v1/soulauth/admin/keys?tenant_id=$TENANT_ID&status=active" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

**Query parameters:**

| Parameter | Description |
|---|---|
| `tenant_id` (required) | Tenant UUID |
| `status` | Filter: `active`, `suspended`, `revoked` |
| `persona_id` | Filter by persona ID |

#### Get SoulKey Details

**Endpoint:** `GET /v1/soulauth/admin/keys/{key_id}`
**Required permission:** `keys:read`

```bash
curl -s "https://tiresias.network/v1/soulauth/admin/keys/$KEY_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

**Response includes:** `id`, `tenant_id`, `persona_id`, `label`, `status`, `issued_at`, `expires_at`, `last_used_at`, `suspended_at`, `suspended_by`, `revoked_at`, `revoked_by`, `revocation_reason`, `metadata`.

#### Suspend a SoulKey

Suspension is a reversible operation. Use it for temporary deactivation during investigation or maintenance.

**Endpoint:** `POST /v1/soulauth/admin/keys/{key_id}/suspend`
**Required permission:** `keys:update`

```bash
curl -s -X POST "https://tiresias.network/v1/soulauth/admin/keys/$KEY_ID/suspend" \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "suspended_by": "analyst@acme.com",
    "reason": "Anomalous behavior detected - investigating"
  }'
```

#### Reinstate a Suspended SoulKey

**Endpoint:** `POST /v1/soulauth/admin/keys/{key_id}/reinstate`
**Required permission:** `keys:update`

```bash
curl -s -X POST "https://tiresias.network/v1/soulauth/admin/keys/$KEY_ID/reinstate" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

#### Permanently Revoke a SoulKey

Revocation is a terminal operation. The key cannot be reinstated. Use this for key compromise, agent decommissioning, or compliance-driven removal.

**Endpoint:** `POST /v1/soulauth/admin/keys/{key_id}/revoke`
**Required permission:** `keys:delete`

```bash
curl -s -X POST "https://tiresias.network/v1/soulauth/admin/keys/$KEY_ID/revoke" \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "revoked_by": "security-team@acme.com",
    "reason": "Key compromised during incident INC-2026-0042"
  }'
```

> **Audit trail:** Every issuance, suspension, reinstatement, and revocation generates an immutable audit event in the tamper-evident hash chain, including the actor, timestamp, and reason.

### 5.3 Configure Agent Scopes

Agent scopes are defined through the **authorization policy** system (Chapter 6). Each persona's YAML policy specifies which resources the agent can access, which actions it can perform, and under what conditions.

The `metadata` field on a SoulKey controls the agent's **admin role** within the RBAC system:

```json
{
  "metadata": {
    "admin_role": "operator",
    "department": "security-ops",
    "cost_center": "CC-1234"
  }
}
```

The `admin_role` value determines what the agent (or the human using the key) can do via the Admin API. See Chapter 6 for the full permission matrix.

### 5.4 Manage Agent Groups

Agent grouping is achieved through a combination of:

1. **Persona ID conventions** -- Use hierarchical persona IDs (e.g., `soc/tier1-analyst-01`, `devops/deployer-03`) and filter with the `persona_id` query parameter.
2. **Metadata labels** -- Store department, environment, and risk-level tags in the `metadata` field.
3. **Policy role templates** -- Define shared role templates in `shared/roles.yaml` and assign them via the `metadata.role` field in persona policies.

**Example: List all agents in the security department:**

```bash
# Use metadata filtering at the application layer
curl -s "https://tiresias.network/v1/soulauth/admin/keys?tenant_id=$TENANT_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY" | \
  jq '[.[] | select(.metadata.department == "security-ops")]'
```

### 5.5 Configure Key Rotation Policies

Key rotation replaces an existing SoulKey with a new one atomically. The old key is revoked and a new key is issued for the same persona in a single transaction.

**Endpoint:** `POST /v1/soulauth/admin/keys/{key_id}/rotate`
**Required permission:** `keys:update`

```bash
curl -s -X POST "https://tiresias.network/v1/soulauth/admin/keys/$KEY_ID/rotate" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

**Response (200 OK):**

```json
{
  "soulkey_id": "new-uuid-here",
  "raw_key": "sk_agent_sal_data-analyst-01_b4c9d2e5f6a8...",
  "persona_id": "data-analyst-01",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "active",
  "issued_at": "2026-04-02T14:30:00Z",
  "expires_at": null
}
```

**What happens during rotation:**

1. The existing key's persona, tenant, label, and metadata are preserved.
2. A new key is generated with a fresh cryptographic secret.
3. The old key is immediately revoked with reason `"Key rotation"`.
4. Both events (issuance and revocation) are written to the audit log.
5. The new label is set to `"Rotated from <old_label_or_id>"`.

**Automatic expiry-based rotation:**

Set `expires_at` when issuing keys to enforce maximum key lifetime. When a key expires, it is automatically revoked by the system with reason `"Key expired"`. The agent must request a new key or the administrator must issue one.

**Recommended rotation schedule:**

| Environment | Rotation interval | `expires_at` setting |
|---|---|---|
| Production | 90 days | 90 days from issuance |
| Staging | 30 days | 30 days from issuance |
| Development | No expiry | Omit `expires_at` |
| High-security | 30 days | 30 days, with monitoring |

### 5.6 View Agent Identity Audit Trail

All SoulKey lifecycle events are recorded in the immutable audit log. Query the audit API to inspect identity-related events.

**Endpoint:** `GET /v1/soulauth/admin/audit/report`
**Required permission:** `audit:read`

```bash
# Query key lifecycle events for a tenant
curl -s "https://tiresias.network/v1/soulauth/admin/audit/report?\
tenant_id=$TENANT_ID&\
event_type=key_issued&\
start_date=2026-03-01T00:00:00Z&\
end_date=2026-04-01T00:00:00Z&\
limit=100" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

**Key lifecycle event types:**

| Event type | Trigger |
|---|---|
| `key_issued` | New key created or key rotated |
| `key_suspended` | Key suspended by administrator or playbook |
| `key_reinstated` | Suspended key restored to active |
| `key_revoked` | Key permanently revoked |
| `auth_grant` | Authentication succeeded |
| `auth_deny` | Authentication denied (invalid/expired/suspended key) |

### 5.7 Troubleshoot Agent Authentication Failures

**Common failure scenarios and resolution:**

| Symptom | HTTP Status | Cause | Resolution |
|---|---|---|---|
| `"Authentication required"` | 401 | No `X-SoulKey` or `Authorization` header | Add the header to the request |
| `"Invalid or inactive soulkey"` | 401 | Key hash not found, or key not `active` | Verify the raw key value; check key status |
| Requests suddenly rejected | 401 | Key expired and was auto-revoked | Issue a new key; check `expires_at` |
| `"permission_denied"` | 403 | Key's `admin_role` lacks required permission | Update `metadata.admin_role` or use a higher-privilege key |
| Intermittent failures | 401 | Clock skew causing premature expiry | Sync server clocks with NTP; check `expires_at` timezone |

**Diagnostic steps:**

1. Verify the key exists and is active:
   ```bash
   curl -s "https://tiresias.network/v1/soulauth/admin/keys/$KEY_ID" \
     -H "X-SoulKey: $ADMIN_SOULKEY" | jq '{status, expires_at, last_used_at}'
   ```

2. Check the audit log for denial events:
   ```bash
   curl -s "https://tiresias.network/v1/soulauth/admin/audit/report?\
   tenant_id=$TENANT_ID&event_type=auth_deny&limit=10" \
     -H "X-SoulKey: $ADMIN_SOULKEY"
   ```

3. Verify the key hash matches by computing it locally:
   ```bash
   echo -n "$RAW_KEY" | sha512sum
   ```

---

## Chapter 6: Authorization Policies

Tiresias uses a dual-layer authorization model. The first layer -- **Admin RBAC** -- controls who can manage the platform itself (issue keys, sync policies, view audit logs). The second layer -- **Policy-as-Code** -- defines what each agent persona can do at runtime (access resources, invoke models, delegate authority). This chapter covers both.

### 6.1 Authorization Policy Model

#### Admin RBAC: The Resource-Action Model

Admin RBAC uses a `resource:action` permission format. Permissions are checked by the `require_permission()` FastAPI dependency on every Admin API endpoint.

**Permission format:** `<resource>:<action>`

Where:
- `resource` is one of: `keys`, `policy`, `audit`, `tenants`, `detection`, `enforcement`, `analytics`, `aletheia`, `licenses`, `encryption`
- `action` is one of: `create`, `read`, `update`, `delete`, `sync`, `manage`, or `*` (wildcard)

**Wildcard matching rules:**
- `"*"` matches any permission.
- `"keys:*"` matches `keys:create`, `keys:read`, `keys:update`, `keys:delete`.
- Matching is prefix-based: granted `"keys:*"` satisfies required `"keys:create"`.

#### Agent Policy: The Resource-Action-Scope Triplet

Agent authorization policies use a three-dimensional model:

```
Resource  x  Action  x  Scope  =  Decision
```

For example: agent `alfred` requesting `read` on resource `memory` with scope `*` is evaluated against the persona's policy YAML file.

**Evaluation order:**

1. Resolve the agent's persona from the SoulKey.
2. Load the cached policy for that persona (from `_soulauth_policy_cache`).
3. Find the resource block in the policy.
4. Match the requested action and scope against the rules.
5. If matched, issue a capability token (ALLOW). If not, deny.
6. Log the decision to the audit trail.

### 6.2 Admin RBAC Roles and Permissions

Tiresias defines four admin roles in a strict hierarchy. Each higher role inherits all permissions of lower roles.

**Role hierarchy (lowest to highest):**

```
viewer  <  operator  <  admin  <  owner
```

#### Permission Matrix

| Permission | Owner | Admin | Operator | Viewer |
|---|---|---|---|---|
| `*` (all permissions) | Yes | -- | -- | -- |
| `keys:create` | Yes | Yes | -- | -- |
| `keys:read` | Yes | Yes | Yes | Yes |
| `keys:update` | Yes | Yes | -- | -- |
| `keys:delete` | Yes | Yes | -- | -- |
| `policy:read` | Yes | Yes | Yes | Yes |
| `policy:sync` | Yes | Yes | Yes | -- |
| `policy:create` | Yes | Yes | -- | -- |
| `policy:update` | Yes | Yes | -- | -- |
| `policy:delete` | Yes | Yes | -- | -- |
| `audit:read` | Yes | Yes | Yes | Yes |
| `tenants:create` | Yes | -- | -- | -- |
| `tenants:read` | Yes | Yes | Yes | Yes |
| `tenants:update` | Yes | Yes | -- | -- |
| `tenants:delete` | Yes | -- | -- | -- |
| `detection:read` | Yes | Yes | Yes | Yes |
| `detection:create` | Yes | Yes | -- | -- |
| `detection:update` | Yes | Yes | -- | -- |
| `detection:delete` | Yes | Yes | -- | -- |
| `enforcement:read` | Yes | Yes | Yes | Yes |
| `enforcement:create` | Yes | Yes | -- | -- |
| `enforcement:update` | Yes | Yes | -- | -- |
| `analytics:read` | Yes | Yes | Yes | Yes |
| `analytics:create` | Yes | Yes | -- | -- |
| `aletheia:read` | Yes | Yes | Yes | Yes |
| `aletheia:create` | Yes | Yes | -- | -- |
| `multi_tenant` | Yes | Yes | -- | -- |
| `licenses:create` | Yes | -- | -- | -- |
| `licenses:read` | Yes | -- | -- | -- |
| `licenses:revoke` | Yes | -- | -- | -- |
| `encryption:manage` | Yes | -- | -- | -- |

#### Raw Permission Definitions (from source)

```python
ROLE_PERMISSIONS = {
    "owner": ["*"],
    "admin": [
        "keys:*",
        "policy:*",
        "audit:read",
        "tenants:read",
        "tenants:update",
        "detection:*",
        "enforcement:*",
        "analytics:*",
        "aletheia:*",
        "multi_tenant",
        "users:*",
        "teams:*",
        "invites:*",
    ],
    "operator": [
        "keys:read",
        "policy:read",
        "policy:sync",
        "audit:read",
        "tenants:read",
        "detection:read",
        "enforcement:read",
        "analytics:read",
        "aletheia:read",
        "users:read",
        "teams:read",
        "invites:read",
    ],
    "viewer": [
        "audit:read",
        "tenants:read",
        "policy:read",
        "detection:read",
        "analytics:read",
        "aletheia:read",
        "keys:read",
        "enforcement:read",
        "users:read",
        "teams:read",
    ],
}
```

### 6.2.1 Team-Level Roles and Permissions (v3.3.0)

In addition to portal-level Admin RBAC, Tiresias v3.3.0 introduces a **team-level role model** that controls access within team-scoped operations. Team roles operate as a second authorization layer that further restricts what a user can do within a specific team context.

#### Team Role Hierarchy

```
team_admin  >  analyst  >  member
```

| Team Role | Description | Team-Scoped Permissions |
|-----------|-------------|------------------------|
| `team_admin` | Full control of the team. Can manage members, edit team settings, and perform all team-scoped operations. | `team:*`, `team_members:*`, `team_settings:*` |
| `analyst` | Operational team access. Can investigate incidents, manage quarantines, and modify detection rules within the team scope. | `team:read`, `team_members:read`, `team_investigations:*`, `team_detections:*` |
| `member` | Read-only team access. Can view team dashboards, shared resources, and team activity. | `team:read`, `team_members:read` |

#### Permission Resolution

A user's effective permissions for a team-scoped operation are determined by the **intersection** of their portal-level role and their team-level role. The portal-level role sets the maximum ceiling; the team-level role cannot grant permissions beyond what the portal role allows.

**Example:** A user with portal role `operator` and team role `team_admin` can manage team members (granted by `team_admin`) but cannot issue SoulKeys (blocked by `operator` portal role, which lacks `keys:create`).

#### Account Admin and Secondary Admin (v3.3.0)

Two special designations on the `_soul_users` record provide elevated tenant-wide authority independent of the standard role hierarchy:

| Designation | Field | Authority |
|-------------|-------|-----------|
| **Account Admin** | `is_account_admin` | Full administrative authority over the tenant. Can designate secondary admins, manage all users and teams across the tenant, access billing, and override team-level restrictions. Only one user per tenant should hold this designation. |
| **Secondary Admin** | `is_secondary_admin` | Delegated administrative authority. Can manage users and teams but cannot modify account admin settings or designate other secondary admins. Useful for large tenants where admin responsibilities are distributed. |

These designations are checked before standard RBAC evaluation. An account admin bypasses team-level role checks for administrative operations.

#### Assigning Roles

Roles are assigned via the `metadata.admin_role` field on a SoulKey:

```bash
curl -s -X POST https://tiresias.network/v1/soulauth/admin/keys \
  -H "X-SoulKey: $OWNER_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT_ID'",
    "persona_id": "soc-operator-01",
    "label": "SOC tier-1 operator",
    "metadata": {
      "admin_role": "operator"
    }
  }'
```

For OIDC-authenticated portal users, the role is resolved from IdP group claims via the `group_role_map` on the IdP configuration (see Chapter 7).

### 6.3 Write Authorization Policies in YAML

Agent authorization policies are stored as YAML files in a git repository. Each persona has its own policy file under the tenant directory.

**Repository structure:**

```
policies/
  shared/
    roles.yaml                 # Shared role templates
  tenants/
    <tenant_slug>/
      personas/
        <persona_id>.yaml      # Per-persona policy
```

#### Policy YAML Schema

```yaml
# policies/tenants/acme/personas/data-analyst.yaml
metadata:
  tenant: acme
  persona: data-analyst
  role: analyst                # References shared/roles.yaml template
  description: "Read-only analyst with model access"

spec:
  # Just-In-Time capability token settings
  jit:
    max_capability_ttl: 900          # Max token lifetime (seconds)
    default_capability_ttl: 300      # Default token lifetime
    require_active_session: true     # Require active session for tokens
    allowed_nodes: ["*"]             # Nodes this persona can operate on
    operating_window: "24/7"         # Time-based access restriction
    max_concurrent_capabilities: 5   # Max simultaneous active tokens

  # Privilege escalation configuration
  escalation:
    can_grant_temporary_access: false
    can_suspend_agents: false
    approval_required_for:
      - "vault:write"
      - "mesh:execute"

  # Resource access rules
  resources:
    memory:
      - actions: [read]
        scopes: ["analytics:*"]
    vault:
      - actions: [read]
        scopes: ["reports:*"]
        conditions:
          - type: time_window
            hours: "08:00-18:00"
            timezone: "America/Chicago"
    mesh:
      - actions: [read]
        scopes: ["status"]
        nodes: ["analytics-node-*"]

  # Model routing policy (optional)
  model_policies:
    default_models: ["claude-sonnet-4-20250514"]
    task_routing:
      reasoning:
        required: ["claude-opus-4-20250514"]
        description: "Complex analysis requiring deep reasoning"
      summarization:
        allowed: ["claude-haiku-4-5-20251001", "gpt-4o-mini"]
        preferred: "claude-haiku-4-5-20251001"
        description: "Report summaries and data compression"
    forbidden_models: ["gpt-3.5-turbo"]
    cost_budget:
      daily_limit_usd: 10.0
      per_request_max_usd: 0.50
    enforcement: "strict"      # "strict" rejects violations; "permissive" logs only
```

#### Policy YAML Field Reference

**metadata section:**

| Field | Required | Description |
|---|---|---|
| `tenant` | Yes | Tenant slug (must match directory name) |
| `persona` | Yes | Persona ID (must match filename stem) |
| `role` | Yes | Role template name from `shared/roles.yaml` |
| `description` | No | Human-readable description |

**spec.jit section:**

| Field | Default | Description |
|---|---|---|
| `max_capability_ttl` | 300 | Maximum capability token TTL in seconds (ceiling: 900) |
| `default_capability_ttl` | 120 | Default TTL when not specified in request |
| `require_active_session` | true | Require an active session before issuing tokens |
| `allowed_nodes` | `[]` | Mesh nodes this persona can target. `["*"]` = all |
| `operating_window` | `"24/7"` | Time-of-day access restriction |
| `max_concurrent_capabilities` | 5 | Maximum concurrent active capability tokens |

**spec.resources section:**

Each resource contains a list of rules. Each rule supports:

| Field | Default | Description |
|---|---|---|
| `actions` | (required) | List of allowed actions: `read`, `write`, `delete`, `execute`, `reveal`, `ssh`, `transfer`, or `*` |
| `scopes` | `["*"]` | Scope patterns. Supports `*` wildcard and prefix matching (`analytics:*`) |
| `nodes` | `["*"]` | Target nodes for mesh operations. Supports `*` glob patterns |
| `services` | `["*"]` | Target services for service-mesh routing |
| `conditions` | `[]` | List of condition objects (time windows, IP restrictions, etc.) |

#### Real-World Example: Production Orchestrator Policy

This example is from the Tiresias reference deployment:

```yaml
# policies/tenants/saluca/personas/alfred.yaml
metadata:
  tenant: saluca
  persona: alfred
  role: orchestrator
spec:
  jit:
    max_capability_ttl: 900
    default_capability_ttl: 300
    require_active_session: true
    allowed_nodes: ["*"]
    operating_window: "24/7"
    max_concurrent_capabilities: 10
  model_policies:
    default_models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514"]
    task_routing:
      reasoning:
        required: ["claude-opus-4-20250514"]
        description: "Architectural decisions, complex analysis"
      code_generation:
        allowed: ["claude-sonnet-4-20250514", "claude-opus-4-20250514"]
        preferred: "claude-sonnet-4-20250514"
        description: "Code writing, refactoring"
      code_review:
        allowed: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"]
        preferred: "claude-haiku-4-5-20251001"
        description: "Linting, style checks"
      summarization:
        allowed: ["claude-haiku-4-5-20251001", "gpt-4o-mini"]
        preferred: "claude-haiku-4-5-20251001"
        description: "Session summaries, compression"
    forbidden_models: ["gpt-3.5-turbo"]
    cost_budget:
      daily_limit_usd: 50.0
      per_request_max_usd: 2.0
    enforcement: "strict"
  resources:
    memory:
      - actions: [read, write, delete]
        scopes: ["*"]
    vault:
      - actions: [read, reveal]
        scopes: ["*"]
    mesh:
      - actions: [ssh, execute, transfer]
        nodes: ["*"]
```

### 6.4 Configure Policy Sync from Git

Tiresias implements policy-as-code by syncing YAML policy files from a git repository to the database policy cache. This enables version-controlled, auditable policy management with full rollback capability.

#### Environment Configuration

Set the following environment variables to enable policy sync:

```bash
# Path to the local clone of the policy repository
SOULAUTH_POLICY_REPO_PATH=/opt/tiresias/policies

# Cache TTL in seconds (how long cached policies remain valid)
SOULAUTH_POLICY_CACHE_TTL=300
```

#### Manual Policy Sync

**Endpoint:** `POST /v1/soulauth/admin/policy/sync`
**Required permission:** `policy:sync`

```bash
curl -s -X POST "https://tiresias.network/v1/soulauth/admin/policy/sync?\
tenant_id=$TENANT_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

**Response (200 OK -- success):**

```json
{
  "status": "synced",
  "policies_updated": 3,
  "policy_version": "a1b2c3d4"
}
```

**Response (200 OK -- validation failure):**

```json
{
  "status": "validation_failed",
  "policies_updated": 0,
  "validation_errors": [
    "data-analyst.yaml: missing 'metadata' section",
    "deployer.yaml: resource 'mesh' rule 0 missing 'actions'"
  ]
}
```

> **Important:** Policy sync validates all YAML files before applying any changes. If any file fails validation, zero policies are updated. Fix all errors and re-sync.

#### Validate Policies Without Applying

**Endpoint:** `POST /v1/soulauth/admin/policy/validate`
**Required permission:** `policy:read`

```bash
curl -s -X POST "https://tiresias.network/v1/soulauth/admin/policy/validate?\
tenant_id=$TENANT_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

**Response:**

```json
{
  "valid": true,
  "errors": [],
  "tenant_slug": "acme"
}
```

#### View Current Resolved Policy

**Endpoint:** `GET /v1/soulauth/admin/policy/current`
**Required permission:** `policy:read`

```bash
curl -s "https://tiresias.network/v1/soulauth/admin/policy/current?\
tenant_id=$TENANT_ID&persona_id=data-analyst" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

Returns the fully resolved policy (after merging with role templates) as JSON.

#### Automatic Background Sync

Tiresias supports automatic background policy sync using the `AsyncPolicySyncManager`. When configured, it periodically pulls from the remote git repository and reloads policies.

**Configuration:**

| Setting | Default | Description |
|---|---|---|
| `repo_path` | (required) | Local path to policy git repository |
| `sync_interval` | 300 | Seconds between automatic sync cycles |
| `branch` | `main` | Git branch to pull from |

**Sync lifecycle:**

1. On startup, an initial sync runs immediately.
2. Every `sync_interval` seconds, the manager runs `git pull origin <branch>`.
3. If the pull succeeds, the new commit hash is recorded.
4. Prometheus metrics are updated: `policy_sync_last_success` gauge, `policy_syncs_total` counter (with `status` label).
5. If the pull fails, the error is logged and the previous policy cache remains active.

**Sync status endpoint:**

The sync manager exposes status via the health check system:

```json
{
  "last_sync_time": "2026-04-02T14:30:00Z",
  "last_sync_status": "success",
  "last_error": null,
  "last_commit_hash": "a1b2c3d4e5f6",
  "sync_interval": 300,
  "repo_path": "/opt/tiresias/policies"
}
```

#### Git Repository Best Practices

**Branch strategy:**

| Branch | Purpose |
|---|---|
| `main` | Production policies (auto-synced) |
| `staging` | Pre-production validation |
| `feature/*` | Policy development branches |

**Recommended workflow:**

1. Create a feature branch for policy changes.
2. Edit YAML files and commit.
3. Open a pull request.
4. CI validates YAML syntax and runs policy tests.
5. Merge to `main` after review.
6. Tiresias auto-syncs within `sync_interval` seconds, or trigger manual sync.

**Validation in CI:**

The `validate_policy_yaml()` function checks:
- Presence of `metadata` and `spec` sections.
- Required fields: `metadata.persona`, `metadata.role`.
- All `resources` entries are lists of rules.
- Each rule has an `actions` field.

#### Policy Version and Rollback

Every sync records the git commit hash as the `policy_version`. To roll back:

1. Identify the last-known-good commit:
   ```bash
   git log --oneline policies/tenants/acme/
   ```

2. Revert to that commit:
   ```bash
   git revert HEAD
   git push origin main
   ```

3. Trigger a manual sync or wait for the auto-sync interval.

4. Verify the rollback:
   ```bash
   curl -s -X POST "https://tiresias.network/v1/soulauth/admin/policy/sync?\
   tenant_id=$TENANT_ID" \
     -H "X-SoulKey: $ADMIN_SOULKEY" | jq .policy_version
   ```

### 6.5 Test Policies with Dry-Run Mode

Use the validate endpoint before syncing to catch errors without impacting production:

```bash
# Step 1: Validate
RESULT=$(curl -s -X POST "https://tiresias.network/v1/soulauth/admin/policy/validate?\
tenant_id=$TENANT_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY")

VALID=$(echo "$RESULT" | jq -r '.valid')

if [ "$VALID" = "true" ]; then
  echo "Validation passed. Syncing..."
  curl -s -X POST "https://tiresias.network/v1/soulauth/admin/policy/sync?\
  tenant_id=$TENANT_ID" \
    -H "X-SoulKey: $ADMIN_SOULKEY"
else
  echo "Validation failed:"
  echo "$RESULT" | jq '.errors[]'
  exit 1
fi
```

You can also test policy evaluation against real traffic by querying the auth evaluation endpoint with test parameters:

```bash
curl -s -X POST "https://tiresias.network/v1/auth/evaluate" \
  -H "X-SoulKey: $AGENT_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "memory",
    "action": "write",
    "scope": "analytics:reports",
    "context": {}
  }'
```

The response indicates whether the request would be allowed or denied under the current policy.

### 6.6 Manage Policy Versions and Rollback

Policy versioning is tied directly to git history. Every policy sync records the commit hash, enabling precise version tracking.

**Compare policy versions:**

```bash
# Show what changed between the current and previous sync
git diff HEAD~1 policies/tenants/acme/personas/

# Show full history for a specific persona
git log --oneline policies/tenants/acme/personas/data-analyst.yaml
```

**Audit policy sync history:**

```bash
curl -s "https://tiresias.network/v1/soulauth/admin/audit/report?\
tenant_id=$TENANT_ID&event_type=policy_synced&limit=20" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

Each `policy_synced` audit event records the `count` of policies updated, the `tenant_slug`, and the `policy_version` (commit hash).

### 6.7 Troubleshoot Authorization Denials

**Endpoint for decision inspection:**

```bash
# Query recent deny events
curl -s "https://tiresias.network/v1/soulauth/admin/audit/report?\
tenant_id=$TENANT_ID&\
event_type=auth_deny&\
persona_id=data-analyst&\
limit=10" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

**Common authorization denial causes:**

| Symptom | Cause | Resolution |
|---|---|---|
| `"permission_denied"` on Admin API | RBAC role too low | Assign higher `admin_role` in key metadata |
| `DENY` on resource access | No matching rule in persona policy | Add a rule for the resource/action/scope to the YAML |
| `DENY` despite matching rule | Scope mismatch (e.g., `analytics:reports` vs `analytics:*`) | Check scope patterns in the policy rule |
| `DENY` after policy change | Policy not synced | Trigger `POST /v1/soulauth/admin/policy/sync` |
| `DENY` with valid policy | Cached stale policy | Wait for cache TTL to expire (default: 300s) or re-sync |

**RBAC permission check logic (from source):**

```python
def _permission_matches(granted: str, required: str) -> bool:
    if granted == "*":
        return True
    granted_parts = granted.split(":")
    required_parts = required.split(":")
    for i, gp in enumerate(granted_parts):
        if gp == "*":
            return True
        if i >= len(required_parts):
            return False
        if gp != required_parts[i]:
            return False
    return len(granted_parts) >= len(required_parts)
```

This means:
- `keys:*` matches `keys:create` (wildcard in second segment).
- `keys:read` does NOT match `keys:create` (exact mismatch).
- `*` matches everything.

---

## Chapter 7: Identity Federation

Tiresias supports OpenID Connect (OIDC) for federating portal user authentication to external identity providers. This enables single sign-on (SSO) for security administrators, SOC analysts, and operators accessing the Tiresias Portal. When a user authenticates via SSO, Tiresias performs Just-In-Time (JIT) provisioning -- creating or updating the user account automatically from IdP claims.

### 7.1 OIDC/SSO Architecture

The Tiresias OIDC implementation follows the Authorization Code Flow with PKCE (Proof Key for Code Exchange), which is the recommended flow for web applications.

**Flow overview:**

```
User          Portal         SoulAuth          IdP (Google/Okta/Azure)
  |               |               |                      |
  |-- Login ----->|               |                      |
  |               |-- /authorize->|                      |
  |               |               |-- Generate PKCE -----|
  |               |               |-- Sign state (HMAC) -|
  |               |<-- auth_url --|                      |
  |<-- Redirect --|               |                      |
  |                               |                      |
  |------------- Browser redirect to IdP auth_url ------>|
  |                               |                      |
  |<------------ Redirect with ?code=...&state=... ------|
  |               |               |                      |
  |-- callback -->|               |                      |
  |               |-- /callback ->|                      |
  |               |               |-- Verify state HMAC--|
  |               |               |-- Verify nonce ------|
  |               |               |-- Exchange code ---->|
  |               |               |<-- id_token ---------|
  |               |               |-- Validate JWT ------|
  |               |               |-- JIT provision -----|
  |               |               |-- Create session ----|
  |               |<-- session -->|                      |
  |<-- Logged in--|               |                      |
```

**Security controls in the flow:**

| Control | Purpose |
|---|---|
| PKCE (S256) | Prevents authorization code interception attacks |
| HMAC-SHA256 state | Prevents CSRF; binds tenant_id, IdP ID, nonce, and PKCE verifier |
| Nonce validation | Prevents ID token replay attacks |
| Origin allowlist | Prevents open redirect via `redirect_uri` |
| JWKS validation | Verifies ID token signature against IdP public keys |
| Nonce store | In-memory nonce tracking (use Redis for multi-instance deployments) |

> **Production warning:** The in-memory nonce store is NOT safe for horizontally scaled deployments. If you run multiple SoulAuth instances behind a load balancer, requests may hit different instances, breaking nonce replay protection. Use a Redis or database-backed nonce store with TTL expiry in production.

### 7.2 Enable OIDC Authentication

#### Environment Variables

Configure the following environment variables to enable OIDC:

```bash
# Enable the OIDC feature flag (required)
SOULAUTH_OIDC_ENABLED=true

# Authentication mode (set to "oidc" or "local,oidc" for multi-mode)
SOULAUTH_AUTH_MODE=oidc

# HMAC secret for signing the OIDC state parameter
# MUST be a cryptographically random value in production
SOULAUTH_OIDC_STATE_SECRET=<random-64-char-hex>

# Fernet key for encrypting IdP client secrets at rest
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
SOULAUTH_OIDC_SECRET_KEY=<fernet-key>

# Portal session TTL in seconds (default: 28800 = 8 hours)
SOULAUTH_OIDC_SESSION_TTL=28800

# JWKS cache TTL in seconds (default: 3600 = 1 hour)
SOULAUTH_OIDC_JWKS_CACHE_TTL=3600

# Public URL for constructing redirect_uri
SOULAUTH_PUBLIC_URL=https://tiresias.network

# Allowed origins for redirect_uri validation
SOULAUTH_ALLOWED_ORIGINS='["https://tiresias.network"]'
```

#### Settings Reference

| Setting | Default | Description |
|---|---|---|
| `oidc_enabled` | `false` | Feature flag to enable OIDC endpoints |
| `auth_mode` | `"oidc"` | Authentication mode. Options: `oidc`, `local`, `ldap`, or comma-separated for multi-mode |
| `oidc_state_secret` | (none) | HMAC-SHA256 secret for state parameter signing |
| `oidc_secret_key` | (none) | Fernet key for encrypting IdP `client_secret` at rest |
| `oidc_session_ttl` | 28800 | Session lifetime in seconds (8 hours) |
| `oidc_jwks_cache_ttl` | 3600 | JWKS public key cache TTL in seconds |
| `public_url` | `https://tiresias.network` | Base URL for OAuth `redirect_uri` construction |
| `allowed_origins` | `["https://tiresias.network"]` | Allowlist of valid portal origins for redirect |

### 7.3 Configure Identity Providers

Tiresias stores IdP configurations in the `_soul_idp_configs` table. Each tenant can have multiple IdP configurations, enabling multi-provider SSO.

#### Create an IdP Configuration

**Endpoint:** `POST /v1/idp`
**Required permission:** `keys:*` (admin or owner role)

```bash
curl -s -X POST https://tiresias.network/v1/idp \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_type": "google",
    "display_name": "Acme Corp Google Workspace",
    "is_default": true,
    "client_id": "123456789.apps.googleusercontent.com",
    "client_secret": "GOCSPX-abc123def456...",
    "discovery_url": "https://accounts.google.com/.well-known/openid-configuration",
    "scopes": ["openid", "email", "profile"],
    "claim_mapping": {
      "email": "email",
      "name": "name"
    },
    "domain_hint": "acme.com",
    "group_role_map": {
      "tiresias-admins@acme.com": "admin",
      "tiresias-operators@acme.com": "operator",
      "tiresias-viewers@acme.com": "viewer"
    }
  }'
```

**Response:**

```json
{
  "id": "c1d2e3f4-a5b6-7890-cdef-123456789abc",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "provider_type": "google",
  "display_name": "Acme Corp Google Workspace",
  "is_default": true,
  "client_id": "123456789.apps.googleusercontent.com",
  "client_secret_masked": "sk_***f456",
  "discovery_url": "https://accounts.google.com/.well-known/openid-configuration",
  "issuer": null,
  "scopes": ["openid", "email", "profile"],
  "claim_mapping": {"email": "email", "name": "name"},
  "domain_hint": "acme.com",
  "group_role_map": {
    "tiresias-admins@acme.com": "admin",
    "tiresias-operators@acme.com": "operator"
  },
  "status": "active"
}
```

> **Security:** The `client_secret` is Fernet-encrypted at rest. API responses always return a masked version (`sk_***xxxx`). The plaintext secret is never exposed after creation.

#### IdP Configuration Fields

| Field | Required | Description |
|---|---|---|
| `provider_type` | Yes | One of: `google`, `okta`, `azure_ad`, `oidc` (generic) |
| `display_name` | No | Human-readable name shown in the Portal login page |
| `is_default` | No | If true, used as the default provider for the tenant |
| `client_id` | Yes | OAuth 2.0 client ID from the IdP |
| `client_secret` | Yes | OAuth 2.0 client secret (encrypted at rest) |
| `discovery_url` | No | OIDC discovery endpoint URL (auto-configures endpoints) |
| `issuer` | No | Token issuer URL (auto-discovered if `discovery_url` is set) |
| `scopes` | No | OIDC scopes to request. Default: `["openid", "email", "profile"]` |
| `claim_mapping` | No | Maps IdP claim names to Tiresias fields. Default: `{"email": "email", "name": "name"}` |
| `domain_hint` | No | Email domain for auto-selecting this IdP (e.g., `acme.com`) |
| `group_role_map` | No | Maps IdP group names to Tiresias admin roles |

#### List IdP Configurations

**Endpoint:** `GET /v1/idp`
**Required permission:** `keys:read`

```bash
curl -s https://tiresias.network/v1/idp \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

#### Update an IdP Configuration

**Endpoint:** `PUT /v1/idp/{config_id}`
**Required permission:** `keys:*`

```bash
curl -s -X PUT "https://tiresias.network/v1/idp/$CONFIG_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "group_role_map": {
      "tiresias-admins@acme.com": "admin",
      "tiresias-operators@acme.com": "operator",
      "soc-team@acme.com": "operator",
      "tiresias-viewers@acme.com": "viewer"
    }
  }'
```

#### Delete an IdP Configuration

**Endpoint:** `DELETE /v1/idp/{config_id}`
**Required permission:** `keys:*`

```bash
curl -s -X DELETE "https://tiresias.network/v1/idp/$CONFIG_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

#### Test an IdP Connection

Verify that the discovery document is reachable and the client_id is valid:

**Endpoint:** `POST /v1/idp/{config_id}/test`
**Required permission:** `keys:read`

```bash
curl -s -X POST "https://tiresias.network/v1/idp/$CONFIG_ID/test" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

### 7.4 Provider-Specific Configuration

#### Google Workspace

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials.
2. Create an OAuth 2.0 Client ID (Web application type).
3. Add the authorized redirect URI: `https://tiresias.network/api/auth/callback`
4. Note the Client ID and Client Secret.

```bash
curl -s -X POST https://tiresias.network/v1/idp \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_type": "google",
    "display_name": "Google Workspace SSO",
    "client_id": "123456789.apps.googleusercontent.com",
    "client_secret": "GOCSPX-your-secret-here",
    "discovery_url": "https://accounts.google.com/.well-known/openid-configuration",
    "domain_hint": "yourcompany.com",
    "scopes": ["openid", "email", "profile"],
    "claim_mapping": {"email": "email", "name": "name"},
    "group_role_map": {
      "tiresias-admins@yourcompany.com": "admin",
      "security-ops@yourcompany.com": "operator"
    }
  }'
```

> **Google Groups for role mapping:** To include Google Groups in ID tokens, configure the "Groups" claim in Google Admin Console > Directory > Groups. Ensure your OAuth consent screen includes the groups scope.

#### Okta

1. In the Okta Admin Console, go to Applications > Create App Integration.
2. Select OIDC - OpenID Connect, then Web Application.
3. Set the sign-in redirect URI to: `https://tiresias.network/api/auth/callback`
4. Under Assignments, assign the application to the appropriate groups.

```bash
curl -s -X POST https://tiresias.network/v1/idp \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_type": "okta",
    "display_name": "Okta Enterprise SSO",
    "client_id": "0oa1b2c3d4e5f6g7h8i9",
    "client_secret": "your-okta-client-secret",
    "discovery_url": "https://yourcompany.okta.com/.well-known/openid-configuration",
    "domain_hint": "yourcompany.com",
    "scopes": ["openid", "email", "profile", "groups"],
    "claim_mapping": {"email": "email", "name": "name"},
    "group_role_map": {
      "Tiresias-Admins": "admin",
      "Tiresias-Operators": "operator",
      "Security-Analysts": "operator",
      "Tiresias-Viewers": "viewer"
    }
  }'
```

> **Okta groups claim:** By default, Okta does not include groups in the ID token. You must add a "groups" claim to the authorization server: Security > API > Authorization Servers > Claims > Add Claim. Set the claim name to `groups`, value type to `Groups`, filter to `Matches regex .*` (or filter to specific groups), and include in the ID token.

#### Microsoft Entra ID (Azure AD)

1. In the Azure Portal, go to Microsoft Entra ID > App registrations > New registration.
2. Set the redirect URI to: `https://tiresias.network/api/auth/callback` (Web platform).
3. Under Certificates & secrets, create a new client secret.
4. Under API permissions, add Microsoft Graph > `User.Read` and `GroupMember.Read.All`.
5. Under Token configuration, add the `groups` optional claim to the ID token.

```bash
curl -s -X POST https://tiresias.network/v1/idp \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_type": "azure_ad",
    "display_name": "Microsoft Entra ID SSO",
    "client_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "client_secret": "your-azure-client-secret",
    "discovery_url": "https://login.microsoftonline.com/{tenant-id}/v2.0/.well-known/openid-configuration",
    "domain_hint": "yourcompany.onmicrosoft.com",
    "scopes": ["openid", "email", "profile"],
    "claim_mapping": {"email": "email", "name": "name"},
    "group_role_map": {
      "b1c2d3e4-f5a6-7890-bcde-f12345678901": "admin",
      "c2d3e4f5-a6b7-8901-cdef-234567890123": "operator"
    }
  }'
```

> **Azure AD group IDs:** Azure AD sends group object IDs (UUIDs) in the `groups` claim, not group names. Use the Object ID from Entra ID > Groups for the `group_role_map` keys.

#### Generic OIDC Provider

For any OIDC-compliant provider not listed above:

```bash
curl -s -X POST https://tiresias.network/v1/idp \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_type": "oidc",
    "display_name": "Custom OIDC Provider",
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "discovery_url": "https://idp.yourcompany.com/.well-known/openid-configuration",
    "domain_hint": "yourcompany.com",
    "scopes": ["openid", "email", "profile"],
    "claim_mapping": {
      "email": "email",
      "name": "preferred_username"
    },
    "group_role_map": {}
  }'
```

### 7.5 Just-In-Time User Provisioning

When a user authenticates via OIDC for the first time, Tiresias automatically creates a portal user account -- this is **JIT provisioning**. On subsequent logins, the user's attributes are updated from the latest IdP claims.

#### JIT Provisioning Flow

1. User authenticates at the IdP and is redirected back to Tiresias with an authorization code.
2. Tiresias exchanges the code for tokens and validates the ID token.
3. User claims are extracted: `sub`, `email`, `name` (or `display_name`), and group memberships.
4. Tiresias looks up the user by `(tenant_id, idp_provider, idp_sub)`.
5. **If not found:** A new `SoulUser` record is created:
   - **Step 5a:** Check `_soul_user_invites` for a pending invite matching the user's email and tenant.
   - **Step 5b (invite found):** Create the user with the pre-assigned portal role and team membership from the invite. Set the invite status to `accepted`. Add the user to the designated team with the pre-assigned team role.
   - **Step 5c (no invite):** Create the user with the default role determined by `group_role_map` (default: `viewer`). No team assignment.
   - Status: `active`
   - Timestamps: `last_login` set to current time
6. **If found and active:** The user record is updated:
   - `display_name` is refreshed from IdP claims
   - `admin_role` is re-evaluated from group claims (if `group_role_map` is configured)
   - `last_login` is updated
7. **If found and suspended:** Login is rejected with HTTP 403:
   ```json
   {
     "error": "account_suspended",
     "message": "Your account has been suspended. Contact your administrator."
   }
   ```
8. **If found and deactivated:** Login is rejected with HTTP 403:
   ```json
   {
     "error": "account_deactivated",
     "message": "Your account has been deactivated."
   }
   ```

#### Invite-Aware JIT Provisioning (v3.3.0)

When an administrator creates an invitation via `POST /v1/invites`, the invite record stores the target email, portal role, team assignment, and team role. When the invited user authenticates for the first time via OIDC, the JIT provisioning system automatically honors the pending invite:

```bash
# Step 1: Admin creates an invite
curl -s -X POST https://tiresias.network/v1/invites \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "analyst@acme.com",
    "portal_role": "operator",
    "team_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "team_role": "analyst"
  }'

# Step 2: User authenticates via SSO for the first time
# JIT provisioning detects the pending invite and:
#   - Creates the user with portal_role = "operator"
#   - Adds the user to the specified team with team_role = "analyst"
#   - Sets the invite status to "accepted"
```

**Invite precedence:** When both a pending invite and a `group_role_map` configuration exist, the invite's pre-assigned role takes precedence for the initial login. Subsequent logins re-evaluate the role from group claims if `group_role_map` is configured.

#### Group-to-Role Mapping

Tiresias extracts group memberships from the following claim keys (checked in order):
- `groups`
- `roles`
- `cognito:groups`

The `group_role_map` on the IdP configuration maps group names to Tiresias admin roles. When multiple groups match, the **highest-ranked role** wins:

```
viewer (0)  <  operator (1)  <  admin (2)  <  owner (3)
```

**Example:** If a user belongs to both `security-viewers` (mapped to `viewer`) and `soc-team` (mapped to `operator`), they receive the `operator` role.

If no groups match and no `group_role_map` is configured, the default role is `viewer`.

> **Role refresh behavior:** If `group_role_map` is configured, the user's role is re-evaluated on every login. If a user is removed from all mapped groups at the IdP, their role reverts to `viewer` on next login. If `group_role_map` is empty, the user's existing role is preserved.

#### Domain-Based IdP Resolution

Tiresias can automatically select the correct IdP based on the user's email domain. When a user enters their email on the login page, the `domain_hint` field on IdP configurations is used to find the matching provider.

**Example flow:**

1. User enters `analyst@acme.com` on the Portal login page.
2. Portal calls `GET /v1/auth/oidc/authorize?email=analyst@acme.com`.
3. SoulAuth extracts the domain `acme.com`.
4. SoulAuth queries `_soul_idp_configs` for a row where `domain_hint = 'acme.com'`.
5. The matching IdP configuration is used to construct the authorization URL.

This enables a single Portal deployment to serve multiple tenants with different IdPs.

### 7.6 OIDC API Endpoints

#### Initiate Authorization Flow

**Endpoint:** `GET /v1/auth/oidc/authorize`

```bash
# By email (domain-based IdP resolution)
curl -s "https://tiresias.network/v1/auth/oidc/authorize?email=user@acme.com"

# By tenant slug
curl -s "https://tiresias.network/v1/auth/oidc/authorize?tenant_slug=acme"

# By provider type (public sign-in)
curl -s "https://tiresias.network/v1/auth/oidc/authorize?provider_type=google"
```

**Query parameters:**

| Parameter | Description |
|---|---|
| `email` | User's email address (domain used for IdP resolution) |
| `tenant_slug` | Tenant slug for direct tenant lookup |
| `provider_type` | Provider type for public sign-in (`google`, `okta`, `azure_ad`, `oidc`) |
| `portal_base_url` | Override the redirect URI base (must be in `allowed_origins`) |

**Response:**

```json
{
  "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=...&state=...&code_challenge=...",
  "state": "eyJ0ZW5hbnRfaWQ..."
}
```

The caller must redirect the user's browser to the `authorization_url`.

#### Complete Authorization (Callback)

**Endpoint:** `POST /v1/auth/oidc/callback`

```bash
curl -s -X POST https://tiresias.network/v1/auth/oidc/callback \
  -H "Content-Type: application/json" \
  -d '{
    "code": "4/0AeanS0...",
    "state": "eyJ0ZW5hbnRfaWQ...",
    "redirect_uri": "https://tiresias.network/api/auth/callback"
  }'
```

**Response:**

```json
{
  "session_token": "sess_a1b2c3d4e5f6...",
  "user_id": "f7e6d5c4-b3a2-1098-7654-321fedcba098",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "analyst@acme.com",
  "display_name": "Jane Analyst",
  "admin_role": "operator",
  "expires_in": 28800,
  "tier": "enterprise",
  "tenant_name": "Acme Corporation"
}
```

The `session_token` is used for subsequent authenticated requests to the Portal API.

#### Get Current User Info

**Endpoint:** `GET /v1/auth/oidc/userinfo`

```bash
curl -s https://tiresias.network/v1/auth/oidc/userinfo \
  -H "X-OIDC-Session: $SESSION_TOKEN"
```

**Response:**

```json
{
  "user_id": "f7e6d5c4-b3a2-1098-7654-321fedcba098",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "analyst@acme.com",
  "display_name": "Jane Analyst",
  "admin_role": "operator",
  "idp_provider": "google",
  "status": "active"
}
```

#### Revoke Session (Logout)

**Endpoint:** `DELETE /v1/auth/oidc/session`

```bash
curl -s -X DELETE https://tiresias.network/v1/auth/oidc/session \
  -H "X-OIDC-Session: $SESSION_TOKEN"
```

Returns HTTP 204 on success.

### 7.7 Multi-Mode Authentication

Tiresias supports running multiple authentication backends simultaneously. Set the `auth_mode` to a comma-separated list:

```bash
# Enable both local password auth and OIDC SSO
SOULAUTH_AUTH_MODE=local,oidc
SOULAUTH_OIDC_ENABLED=true
```

**Available modes:**

| Mode | Description |
|---|---|
| `oidc` | OIDC/SSO with external IdPs (Google, Okta, Azure AD) |
| `local` | Local username/password with bcrypt hashing |
| `ldap` | LDAP/Active Directory bind authentication |

**Local auth bootstrap:**

For initial setup or environments without an external IdP, bootstrap a local admin account:

```bash
SOULAUTH_AUTH_MODE=local
SOULAUTH_LOCAL_ADMIN_EMAIL=admin@yourcompany.com
SOULAUTH_LOCAL_ADMIN_PASSWORD=<strong-password>
```

The admin account is created on first startup only. The password is bcrypt-hashed before storage.

**Login rate limiting:**

All authentication modes enforce rate limiting:

| Setting | Default | Description |
|---|---|---|
| `login_max_attempts` | 5 | Failed attempts before lockout |
| `login_lockout_minutes` | 15 | Lockout duration in minutes |

### 7.8 Troubleshoot SSO Login Failures

| Symptom | Cause | Resolution |
|---|---|---|
| `"OIDC SSO is not enabled"` (404) | `oidc_enabled` is false | Set `SOULAUTH_OIDC_ENABLED=true` |
| `"No SSO provider for this email domain"` (404) | No IdP config with matching `domain_hint` | Create an IdP config with the correct `domain_hint` |
| `"Tenant not found"` (404) | Invalid `tenant_slug` | Verify the tenant exists and the slug is correct |
| `"Invalid state"` (400) | CSRF state verification failed | Check `oidc_state_secret` is consistent across instances |
| `"Nonce mismatch"` (400) | Nonce replay or instance restart | May occur after rolling deploys; user should retry |
| `"IdP did not return id_token"` (502) | Token exchange succeeded but no ID token | Check IdP scopes include `openid`; verify client configuration |
| `"account_suspended"` (403) | User account suspended in Tiresias | Administrator must unsuspend the user account |
| Redirect URI mismatch at IdP | `redirect_uri` does not match IdP config | Ensure `https://tiresias.network/api/auth/callback` is registered at the IdP |
| `oidc.rejected_origin` in logs | `portal_base_url` not in `allowed_origins` | Add the origin to `SOULAUTH_ALLOWED_ORIGINS` |

**Diagnostic steps:**

1. Test the IdP connection:
   ```bash
   curl -s -X POST "https://tiresias.network/v1/idp/$CONFIG_ID/test" \
     -H "X-SoulKey: $ADMIN_SOULKEY"
   ```

2. Verify the discovery document is reachable:
   ```bash
   curl -s "https://accounts.google.com/.well-known/openid-configuration" | jq .issuer
   ```

3. Check SoulAuth logs for OIDC events:
   ```bash
   # Look for oidc.* log entries
   docker logs soulauth 2>&1 | grep "oidc\."
   ```

4. Verify clock synchronization (JWT validation is time-sensitive):
   ```bash
   # On the SoulAuth container
   date -u
   ```

5. Verify the redirect URI matches exactly (including trailing slashes and protocol):
   - Registered at IdP: `https://tiresias.network/api/auth/callback`
   - Constructed by SoulAuth: `<public_url>/api/auth/callback`
   - These must match character-for-character.

---

*End of Part II. Continue to Part III: Agent Security for agent lifecycle management, behavioral baselines, and agent-to-agent trust configuration.*
