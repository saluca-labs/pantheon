# Tiresias -- Quick Start Guide

**Version:** v3.4.4
**Platform URL:** `https://tiresias.network`

---

## Overview

Tiresias is a zero-trust security platform for AI agents. It provides cryptographic agent identity (SoulKeys), just-in-time authorization (PDP), behavioral monitoring, and gateway protection.

Tiresias runs in two modes:

| Mode | Database | Use case |
|------|----------|----------|
| **Local** | SQLite (zero-config) | Development, testing, single-developer use |
| **Enterprise** | PostgreSQL 16 | Production, multi-tenant, team deployment |

---

## 1. Local Mode (Quick Start)

Local mode uses SQLite and requires no external services. One command gets you running.

```bash
# Install from source
pip install -e .

# Initialize and start the local dev server
soulauth init
soulauth dev
```

`soulauth init` creates a local SQLite database, generates an ES256 key pair, and provisions a default tenant with a starter SoulKey. The output includes your SoulKey -- save it immediately.

```bash
# Check the local instance
soulauth status

# Verify the API is running
curl http://localhost:8000/health
```

**Interactive playground:**

```bash
soulauth playground
```

Opens an interactive REPL where you can test identity resolution, policy evaluation, and token issuance against your local instance.

---

## 2. Enterprise Mode (Docker Compose)

Enterprise mode uses PostgreSQL and runs all services via Docker Compose.

**Prerequisites:** Docker 24+, Docker Compose v2.20+

```bash
# Clone the repository
git clone <your-repo-url>
cd tiresias

# Copy and configure the environment file
cp .env.example .env
# Edit .env -- see Environment Variables below

# Generate ES256 key pair for JWT signing
mkdir -p keys
openssl ecparam -genkey -name prime256v1 -noout -out keys/private.pem
openssl ec -in keys/private.pem -pubout -out keys/public.pem

# Start all services
docker compose up -d

# Run database migrations (0001-0019)
docker compose exec soulauth alembic upgrade head

# Verify services
curl http://localhost:8000/health   # SoulAuth
curl http://localhost:3000          # Portal
```

The Docker Compose stack runs seven services:

| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 | PostgreSQL 16 database |
| `soulauth` | 8000 | Identity, authorization, billing, partners, contracts, teams |
| `soulwatch` | -- | Behavioral monitoring (internal network only) |
| `soulgate` | -- | API gateway (internal network only) |
| `portal` | 3000 | Next.js management dashboard |
| `prometheus` | -- | Metrics collection (internal network only) |
| `alertmanager` | -- | Alert routing (internal network only) |

SoulWatch, SoulGate, Prometheus, and Alertmanager are not exposed to the host by default. They communicate over the internal `tiresias-net` Docker network.

**Key environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `SOULAUTH_MODE` | No (default: `enterprise`) | `enterprise` for Postgres, `local` for SQLite |
| `SOULAUTH_DATABASE_URL` | Yes (enterprise) | Async PostgreSQL URL (`postgresql+asyncpg://...`) |
| `SOULAUTH_DATABASE_URL_SYNC` | Yes (enterprise) | Sync PostgreSQL URL for Alembic (`postgresql+psycopg2://...`) |
| `SOULAUTH_JWT_PRIVATE_KEY_PATH` | Yes | Path to ES256 private key PEM |
| `SOULAUTH_JWT_PUBLIC_KEY_PATH` | Yes | Path to ES256 public key PEM |
| `SOULAUTH_JWT_KID` | Yes | Key ID for rotation (e.g., `kid-2026-04`) |
| `SOULAUTH_PUBLIC_URL` | Yes | Public-facing URL (e.g., `https://tiresias.network`) |
| `POSTGRES_USER` | Yes | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `POSTGRES_DB` | Yes | PostgreSQL database name |

See the [Administrator Guide](docs/ADMIN_GUIDE.md) for the full environment variable reference.

---

## 3. Get a SoulKey

SoulKeys are agent identity credentials. Each key is bound to a tenant and persona, hashed with SHA-512 at rest, and shown exactly once at issuance.

**Format:**

```
sk_agent_<tenant_short>_<persona_slug>_<hex32>
```

**Admin endpoint** (requires an admin-role SoulKey):

```bash
curl -X POST https://tiresias.network/v1/soulauth/admin/keys \
  -H "Content-Type: application/json" \
  -H "X-SoulKey: <your-admin-soulkey>" \
  -d '{
    "tenant_id": "<your-tenant-uuid>",
    "persona_id": "my_agent",
    "label": "My Agent",
    "metadata": {"role": "agent", "admin_role": "viewer"}
  }'
```

The response includes `raw_key`. Save it immediately -- it cannot be retrieved again.

**Self-service trial** (no auth required):

```bash
curl -X POST https://tiresias.network/v1/trial/register \
  -H "Content-Type: application/json" \
  -d '{
    "contact_name": "Your Name",
    "contact_email": "you@company.com",
    "company_name": "Your Company",
    "company_domain": "company.com"
  }'
```

---

## 4. Verify Your Identity

```bash
curl https://tiresias.network/v1/auth/whoami \
  -H "X-Soulkey: <your-soulkey>"
```

Returns your persona, tenant, status, and policy summary.

---

## 5. Evaluate Access (PDP)

Request a capability token for a specific resource, action, and scope:

```bash
curl -X POST https://tiresias.network/v1/auth/evaluate \
  -H "Content-Type: application/json" \
  -H "X-Soulkey: <your-soulkey>" \
  -d '{
    "resource": "memory",
    "action": "read",
    "scope": "global"
  }'
```

**Response (grant):**

```json
{
  "decision": "grant",
  "capability_token": "eyJhbGciOi...",
  "expires_in": 120,
  "granted_scopes": ["memory:read:global"]
}
```

**Response (deny):**

```json
{
  "decision": "deny",
  "reason": "no matching scope in policy"
}
```

The capability token is an ES256-signed JWT valid for the policy-defined TTL (typically 300--900 seconds).

---

## 6. Authentication

Tiresias v3.4.4 supports three authentication modes for portal users and two for API agents.

### Agent authentication

Agents authenticate using SoulKeys via the `X-SoulKey` header on API requests. There is no session -- every request is independently evaluated against policy.

### Portal authentication -- Local accounts

Local authentication uses email/password with bcrypt hashing. On first startup, a bootstrap admin account is created automatically. Users can reset passwords via the self-service password reset flow.

```bash
# Local login endpoint
POST https://tiresias.network/v1/auth/local/login
Content-Type: application/json
{"email": "admin@example.com", "password": "..."}
```

### Portal authentication -- LDAP / Active Directory

LDAP authentication connects to an enterprise directory. Supports LDAPS with self-signed certificates. Users are JIT-provisioned on first login.

Enable with environment variables:
- `SOULAUTH_LDAP_ENABLED=true`
- `SOULAUTH_LDAP_URL=ldaps://ad.company.com:636`
- `SOULAUTH_LDAP_BIND_DN`, `SOULAUTH_LDAP_BIND_PASSWORD`
- `SOULAUTH_LDAP_USER_BASE_DN`, `SOULAUTH_LDAP_USER_FILTER`

```bash
# LDAP login endpoint
POST https://tiresias.network/v1/auth/ldap/login
Content-Type: application/json
{"username": "jdoe", "password": "..."}
```

### Portal authentication -- OIDC / Google

SoulAuth includes a generic OIDC provider backend for integrating with Google Workspace or any OIDC-compliant identity provider. Supports PKCE, JIT provisioning, and domain-based IdP resolution.

Enable with `SOULAUTH_OIDC_ENABLED=true` and configure the IdP via the `/v1/idp/` management API.

---

## 7. Team RBAC

Tiresias supports 7 team roles with granular permissions:

| Role | Description |
|------|-------------|
| `owner` | Full platform control, billing, tenant management |
| `admin` | User and SoulKey management, policy editing |
| `operator` | Day-to-day operations, quarantine management |
| `viewer` | Read-only access to dashboards and audit logs |
| `team_admin` | Team membership and role assignment |
| `analyst` | Detection rules, investigation, reporting |
| `member` | Basic team member access |

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **SoulKey** | SHA-512-hashed agent credential. Shown once at issuance. Format: `sk_agent_<tenant>_<persona>_<hex32>` |
| **Tenant** | Isolated namespace (organization). Each has its own keys, policies, and audit trail. |
| **Persona** | Agent identity within a tenant (e.g., `alfred`, `researcher`). |
| **PDP** | Policy Decision Point. Evaluates access requests against YAML policies. |
| **Capability Token** | Short-lived ES256 JWT granting specific resource/action/scope access. |
| **JIT Access** | Just-in-time: tokens are ephemeral, not persistent permissions. |
| **Team** | Group of users with role-based access within a tenant. |

---

## API Reference

### SoulAuth (port 8000)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Service health check |
| GET | `/health?detail=true` | None | Detailed component health |
| GET | `/docs` | None | Swagger UI (debug mode only) |
| GET | `/metrics` | Bearer token | Prometheus metrics |
| GET | `/v1/auth/identity` | X-SoulKey | Resolve agent identity |
| GET | `/v1/auth/whoami` | X-SoulKey | Self-inspection with policy summary |
| POST | `/v1/auth/evaluate` | X-SoulKey | PDP: evaluate access request |
| POST | `/v1/auth/escalate` | X-SoulKey | Request temporary privilege escalation |
| POST | `/v1/auth/delegate` | X-SoulKey | Approve/deny a delegation request |
| POST | `/v1/auth/local/login` | None | Local email/password login |
| POST | `/v1/auth/local/reset-password` | None | Self-service password reset |
| POST | `/v1/auth/ldap/login` | None | LDAP/AD login |
| GET | `/v1/auth/oidc/authorize` | None | OIDC authorization redirect |
| GET | `/v1/auth/oidc/callback` | None | OIDC callback handler |
| POST | `/v1/soulauth/admin/tenants` | X-SoulKey (owner) | Create tenant |
| GET | `/v1/soulauth/admin/tenants` | X-SoulKey (viewer+) | List tenants |
| POST | `/v1/soulauth/admin/keys` | X-SoulKey (admin+) | Issue SoulKey |
| GET | `/v1/soulauth/admin/keys` | X-SoulKey (viewer+) | List SoulKeys |
| GET | `/v1/soulauth/admin/audit/report` | X-SoulKey (viewer+) | Query audit log |
| POST | `/v1/trial/register` | None | Self-service trial registration |
| GET | `/v1/trial/verify` | None | Email verification |
| GET | `/v1/trial/status` | None | Trial status check |
| GET | `/v1/analytics/*` | X-SoulKey | Anomaly queries and baselines |
| GET | `/v1/detection/*` | X-SoulKey | Sigma rules and matches |
| GET | `/v1/enforcement/quarantine` | X-SoulKey | Quarantine management |
| GET | `/v1/partner/*` | X-SoulKey | Partner program, commissions, invitations |
| GET | `/v1/contracts/*` | X-SoulKey | Contract management and verification |
| GET | `/v1/teams/*` | X-SoulKey | Team RBAC management |
| GET | `/v1/siem/*` | X-SoulKey | SIEM connector configuration |
| GET | `/v1/notifications/*` | X-SoulKey | Notification channel management |
| GET | `/v1/investigation/*` | X-SoulKey | Investigation token management |

### SoulWatch (port 8001)

| Endpoint | Description |
|----------|-------------|
| `/health` | Service health check |
| `/metrics` | Prometheus metrics |
| `/v1/aletheia/cot/*` | CoT audit chains, proof export, verification |

### SoulGate (port 8002)

| Endpoint | Description |
|----------|-------------|
| `/health` | Service health check |
| `/metrics` | Prometheus metrics |

### Portal (port 3000)

| Endpoint | Description |
|----------|-------------|
| `/` | Dashboard landing page |
| `/api/auth/*` | Authentication endpoints |
| `/api/billing/*` | Stripe webhook handlers |

---

## CLI Quick Reference

The `soulauth` CLI is installed with the Python package:

```bash
pip install -e .
```

| Command | Description |
|---------|-------------|
| `soulauth health` | Check API health |
| `soulauth register --tenant-id UUID --agent-id NAME --type TYPE` | Register an agent |
| `soulauth token request --soulkey KEY --resource R --action A --scope S` | Request a capability token |
| `soulauth token validate --soulkey KEY` | Validate a token |
| `soulauth audit --tenant-id UUID --limit N` | Query audit log |
| `soulauth policy test --soulkey KEY --action A --resource R` | Test a policy evaluation |
| `soulauth whoami` | Self-inspection |
| `soulauth init` | Initialize local mode (SQLite + keys + starter tenant) |
| `soulauth dev` | Start local dev server |
| `soulauth playground` | Interactive agent REPL |
| `soulauth status` | Show local instance status |

---

## Next Steps

- [Administrator Guide](docs/ADMIN_GUIDE.md) -- deployment, configuration, tenant and key management
- [User Guide](docs/USER_GUIDE.md) -- SDK, CLI, policy authoring, monitoring
- [Platform Overview](docs/PLATFORM_OVERVIEW.md) -- product descriptions, pricing, use cases
- [Architecture](ARCHITECTURE.md) -- technical architecture and data flows

---

*Tiresias by Saluca LLC -- Zero-trust authorization for AI agents.*
