# Part II: Authentication & Access Control

> **Pantheon Administrator Guide — Chapter**
> **Audience:** Self-hosters configuring auth, federated IdPs, RBAC

Pantheon has two distinct authentication paths, and the distinction
matters: **SoulAuth federated** for users (production), and
**SoulKeys** for agents (the X-SoulKey header). The single-page
explainer is
[`docs/operations/soulauth-integration.md`](../../../../docs/operations/soulauth-integration.md);
this chapter is the deeper admin-guide version.

---

## 2.1 The three paths

| Path | For | Header / cookie | Hash | Notes |
|---|---|---|---|---|
| **SoulAuth federated** | Human users | `tiresias_session` | bcrypt | Primary user-auth path when configured. Separate service, separate user DB. Adds LDAP / OIDC. |
| **`@platform/auth`** | Human users | `platform_session` | Argon2id | OSS / fallback user-auth path. Fires when no SoulAuth session is present; default for deployments without SoulAuth. Local accounts only. |
| **SoulKey** | Agents / machines | `X-SoulKey: sk_agent_…` | SHA-512 | Issued per persona; scoped to a tenant. Independent of user-auth. |

Both user-auth paths are live; the BFF helpers accept either cookie.
SoulAuth is preferred when you need federated identity (LDAP /
OIDC / JIT provisioning); `@platform/auth` is the supported default
for OSS deployments and the no-cookie fallback in any deployment.
See [`docs/security/auth-model.md`](../../../../docs/security/auth-model.md)
for the full posture write-up.

## 2.2 Local user auth (default)

Out of the box, SoulAuth runs in local mode. Users sign in with
email + password against the `_soulauth_users` table.

Adding a new user from the dashboard:

1. Sign in as admin.
2. `/dashboard/settings` → Users → Invite User.
3. Send the email; the invitee sets their own password on first login.

Adding a user directly (e.g. for automation):

```bash
docker compose exec platform-api python scripts/seed-user.py \
  --email alice@example.com --tenant-id <your-tenant-uuid> --role admin
```

## 2.3 LDAP / Active Directory

Set on the platform-api container:

```
SOULAUTH_LDAP_ENABLED=true
SOULAUTH_LDAP_URL=ldaps://ad.example.com:636
SOULAUTH_LDAP_BIND_DN=cn=ldap-service,ou=service,dc=example,dc=com
SOULAUTH_LDAP_BIND_PASSWORD=…
SOULAUTH_LDAP_USER_BASE_DN=ou=people,dc=example,dc=com
SOULAUTH_LDAP_USER_FILTER=(uid={username})
```

Restart platform-api. The portal login form accepts LDAP creds; users
are JIT-provisioned on first successful bind. Self-signed LDAPS
certs are accepted.

## 2.4 OIDC (Google / generic)

Set `SOULAUTH_OIDC_ENABLED=true`, then configure the IdP via the
`/v1/idp/` management API:

```bash
curl -X POST http://localhost:8000/v1/idp/ \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{
    "name": "Google Workspace",
    "type": "oidc",
    "client_id": "…",
    "client_secret": "…",
    "discovery_url": "https://accounts.google.com/.well-known/openid-configuration",
    "tenant_mapping": {"claim": "hd", "value": "example.com", "tenant_id": "<uuid>"}
  }'
```

PKCE is enabled by default. JIT provisioning maps the OIDC `email`
claim to a SoulAuth user and the configured `groups` claim to tenant
membership.

## 2.5 Agent auth (SoulKey)

Every agent presents `X-SoulKey: sk_agent_<tenant>_<persona>_<hex>`
to platform-api. The key is SHA-512 hashed at rest; the raw value is
shown once at issuance and never recoverable.

Issue a new SoulKey:

```bash
curl -X POST http://localhost:8000/v1/soulauth/admin/keys \
  -H "X-SoulKey: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<your-tenant-uuid>",
    "persona_id": "research-coach",
    "label": "research-coach prod runtime",
    "metadata": {"role": "agent"}
  }'
```

Or from the dashboard: Settings → Agents → click an agent → New
SoulKey. **Save the raw value immediately** — there is no way to
recover it.

## 2.6 RBAC

Pantheon defines five roles in [`src/auth/rbac.py`](../../src/auth/rbac.py):

| Role | Powers |
|---|---|
| `owner` | `*` (full access including billing / delete tenant) |
| `admin` | Keys, policy, audit read, RBAC, **agents:\***, **prompts:\***, **providers:\*** |
| `operator` | Read everything; write agents / prompts / providers (no delete) |
| `viewer` | Read-only |
| `auditor` | Read everything + decrypt scope (MFA-gated) |

The full per-permission matrix including the new W-H surfaces
(`agents:*`, `prompts:*`, `providers:*`) lives in
[`drilldowns/rbac-permission-matrix.md`](../drilldowns/rbac-permission-matrix.md).

## 2.7 Request path summary

```
Browser → /login (SoulAuth: local | LDAP | OIDC)
   ↓ session cookie set
Browser → /dashboard/*
   ↓ cookie forwarded
platform-web BFF → platform-api with cookie
   ↓ platform-api validates via SoulAuth
   ↓ user + tenant pinned into request.state
   ↓ RBAC check against the user's role
Result returned
```

Agents skip the user-cookie path entirely:

```
Agent → platform-api with X-SoulKey
   ↓ SoulKey lookup in _soulauth_soulkeys (SHA-512 match)
   ↓ persona + tenant + role resolved
   ↓ RBAC check against the SoulKey's role
Result returned
```

## See also

- [`soulauth-integration.md`](../../../../docs/operations/soulauth-integration.md) — the single-page explainer
- [`drilldowns/rbac-permission-matrix.md`](../drilldowns/rbac-permission-matrix.md) — full per-role permission breakdown
- [`docs/security/audit-trail.md`](../../../../docs/security/audit-trail.md) — what gets logged
