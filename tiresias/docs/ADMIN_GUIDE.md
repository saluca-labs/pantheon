# Tiresias Administrator Guide

**Version:** v3.4.4
**Last Updated:** 2026-04-04
**Audience:** Platform administrators responsible for deploying, configuring, and operating Tiresias

---

## Table of Contents

1. [Deployment](#1-deployment)
2. [SoulKey Management](#2-soulkey-management)
3. [Tenant Administration](#3-tenant-administration)
4. [Policy Configuration](#4-policy-configuration)
5. [Detection & Response Configuration](#5-detection--response-configuration)
6. [SIEM Integration](#6-siem-integration)
7. [Notification Routing](#7-notification-routing)
8. [SoulGate Configuration](#8-soulgate-configuration)
9. [Monitoring & Observability](#9-monitoring--observability)
10. [Audit & Compliance](#10-audit--compliance)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Deployment

### System Requirements

| Component   | Minimum Version | Notes                                      |
|-------------|-----------------|---------------------------------------------|
| Python      | 3.12+           | Required for SoulAuth and SoulWatch         |
| PostgreSQL  | 16+             | Primary data store; SQLite available for dev |
| Node.js     | 20+             | Required for the Portal frontend            |
| Docker      | 24+             | Required for containerized deployment       |
| Compose     | v2.20+          | Docker Compose plugin                       |

**Hardware (minimum per service):**

| Service    | CPU    | Memory | Disk   |
|------------|--------|--------|--------|
| SoulAuth   | 1 vCPU | 1 GB   | 10 GB  |
| SoulGate   | 1 vCPU | 512 MB | 5 GB   |
| SoulWatch  | 1 vCPU | 512 MB | 5 GB   |
| Portal     | 0.5 vCPU | 256 MB | 1 GB |
| PostgreSQL | 2 vCPU | 4 GB   | 50 GB+ |
| Prometheus | 1 vCPU | 2 GB   | 50 GB+ |

### Docker Compose Quickstart

The standard `docker-compose.yml` runs all seven services:

| Service      | Port | Description                        |
|--------------|------|------------------------------------|
| `postgres`   | 5432 | PostgreSQL 16 database             |
| `soulauth`   | 8000 | Authentication and authorization   |
| `soulwatch`  | 8001 | Detection, SIEM, and notifications |
| `soulgate`   | 8002 | API gateway and proxy              |
| `portal`     | 3000 | Admin dashboard (React)            |
| `prometheus` | 9090 | Metrics collection                 |

**Quick start:**

```bash
# Clone the repository
git clone https://github.com/your-org/tiresias.git
cd tiresias

# Copy and edit the environment file
cp .env.example .env
# Edit .env with your configuration (see Environment Variables below)

# Generate ES256 key pair for JWT signing
openssl ecparam -genkey -name prime256v1 -noout -out keys/private.pem
openssl ec -in keys/private.pem -pubout -out keys/public.pem

# Start all services
docker compose up -d

# Run database migrations
docker compose exec soulauth alembic upgrade head

# Verify all services are healthy
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:3000/health
```

**Minimal `docker-compose.yml` example:**

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: tiresias
      POSTGRES_USER: tiresias
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tiresias"]
      interval: 5s
      retries: 5

  soulauth:
    image: tiresias/soulauth:latest
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./keys:/app/keys:ro

  soulgate:
    image: tiresias/soulgate:latest
    ports:
      - "8002:8002"
    env_file: .env
    depends_on:
      - soulauth

  soulwatch:
    image: tiresias/soulwatch:latest
    ports:
      - "8001:8001"
    env_file: .env
    depends_on:
      - soulauth

  portal:
    image: tiresias/portal:latest
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://soulauth:8000

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - promdata:/prometheus

volumes:
  pgdata:
  promdata:
```

### GKE Production Deployment

For production deployments on Google Kubernetes Engine:

**Architecture:**
- Cloud SQL for PostgreSQL (HA, automated backups)
- Cloud SQL Auth Proxy as a sidecar in each pod
- 2 replicas per service with rolling update strategy
- Ingress via Google Cloud Load Balancer with managed TLS

**Key Kubernetes configuration:**

```yaml
# Deployment template (SoulAuth example)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: soulauth
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
        - name: soulauth
          image: tiresias/soulauth:latest
          ports:
            - containerPort: 8000
          envFrom:
            - secretRef:
                name: tiresias-secrets
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: "2"
              memory: 2Gi

        - name: cloud-sql-proxy
          image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2
          args:
            - "--structured-logs"
            - "--auto-iam-authn"
            - "PROJECT:REGION:INSTANCE"
          securityContext:
            runAsNonRoot: true
```

**Deployment steps:**

```bash
# Create the GKE cluster
gcloud container clusters create tiresias-prod \
  --region us-central1 \
  --num-nodes 3 \
  --machine-type e2-standard-4

# Create Cloud SQL instance
gcloud sql instances create tiresias-db \
  --database-version POSTGRES_16 \
  --tier db-custom-2-8192 \
  --region us-central1 \
  --availability-type REGIONAL

# Create Kubernetes secrets
kubectl create secret generic tiresias-secrets \
  --from-env-file=.env.production

# Deploy services
kubectl apply -f k8s/

# Verify rollout
kubectl rollout status deployment/soulauth
kubectl rollout status deployment/soulgate
kubectl rollout status deployment/soulwatch
kubectl rollout status deployment/portal
```

### Environment Variables Reference

#### Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOULAUTH_MODE` | No | `"enterprise"` | `"enterprise"` for Postgres, `"local"` for SQLite zero-config |
| `SOULAUTH_DATABASE_URL` | Yes* | -- | Async PostgreSQL URL (e.g., `postgresql+asyncpg://user:pass@host:5432/tiresias`) |
| `SOULAUTH_DATABASE_URL_SYNC` | Yes* | -- | Sync PostgreSQL URL for Alembic (e.g., `postgresql+psycopg2://user:pass@host:5432/tiresias`) |
| `SOULAUTH_PUBLIC_URL` | Yes | -- | Public-facing URL (e.g., `https://tiresias.network`) |

*Required when `SOULAUTH_MODE=enterprise`.

#### JWT / Cryptography

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOULAUTH_JWT_PRIVATE_KEY_PATH` | Yes | -- | Path to ES256 private key PEM file |
| `SOULAUTH_JWT_PUBLIC_KEY_PATH` | Yes | -- | Path to ES256 public key PEM file |
| `SOULAUTH_JWT_KID` | Yes | -- | Key ID for key rotation (e.g., `kid-2026-03`) |

#### External Services

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | No | -- | API key for Resend transactional email |
| `STRIPE_SECRET_KEY` | No | -- | Stripe secret key for billing |
| `STRIPE_WEBHOOK_SECRET` | No | -- | Stripe webhook signing secret |

#### OIDC / SSO

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOULAUTH_OIDC_ENABLED` | No | `false` | Enable OIDC/SSO support |
| `SOULAUTH_OIDC_SECRET_KEY` | Cond. | -- | Symmetric key for OIDC token encryption (required if OIDC enabled) |
| `SOULAUTH_OIDC_STATE_SECRET` | Cond. | -- | Secret for OIDC state parameter HMAC (required if OIDC enabled) |

#### Feature Flags

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOULAUTH_DETECTION_ENABLED` | No | `true` | Enable anomaly detection engine |
| `SOULAUTH_SIEM_ENABLED` | No | `false` | Enable SIEM event forwarding |
| `SOULAUTH_NOTIFICATIONS_ENABLED` | No | `true` | Enable alert notification routing |

#### Monitoring

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `METRICS_AUTH_TOKEN` | No | -- | Bearer token for Prometheus scrape endpoint |

#### Database Tuning

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOULAUTH_DB_POOL_SIZE` | No | `10` | SQLAlchemy connection pool size |
| `SOULAUTH_DB_MAX_OVERFLOW` | No | `20` | Max overflow connections beyond pool size |
| `SOULAUTH_DB_POOL_TIMEOUT` | No | `30` | Seconds to wait for a connection from the pool |

### Database Migrations

Tiresias uses Alembic for database schema management.

```bash
# Apply all pending migrations
alembic upgrade head

# Check current migration revision
alembic current

# Generate a new migration after model changes
alembic revision --autogenerate -m "description of change"

# Downgrade one revision (use with caution in production)
alembic downgrade -1

# View migration history
alembic history --verbose
```

**Production migration checklist:**
1. Back up the database before applying migrations
2. Run migrations during a maintenance window
3. Test migrations against a staging database first
4. Monitor application logs after migration for errors
5. Verify with `alembic current` that the revision matches expectations

---

## 2. SoulKey Management

SoulKeys are the primary credentials for agent authentication. Each key is bound to a specific tenant and persona.

### Issuing Keys

```bash
curl -X POST https://tiresias.network/v1/soulauth/admin/soulkeys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "ab789b06-6624-4f92-a89b-fec960991d01",
    "persona_id": "oracle-research-01",
    "description": "Oracle research agent - production",
    "expires_at": "2027-03-22T00:00:00Z"
  }'
```

**Response (shown once, never retrievable again):**

```json
{
  "soulkey_id": "sk_id_a1b2c3d4",
  "raw_key": "sk_agent_saluca_oracle-research-01_e4f7a8b3c1d9e0f2a5b7c8d1e3f4a6b7",
  "tenant_id": "ab789b06-6624-4f92-a89b-fec960991d01",
  "persona_id": "oracle-research-01",
  "status": "active",
  "created_at": "2026-03-22T12:00:00Z",
  "expires_at": "2027-03-22T00:00:00Z"
}
```

### Key Format

SoulKeys follow a structured format for auditability:

```
sk_agent_<tenant_short>_<persona_slug>_<hex32>
```

| Segment | Description | Example |
|---------|-------------|---------|
| `sk_agent` | Fixed prefix | `sk_agent` |
| `<tenant_short>` | Abbreviated tenant identifier | `saluca` |
| `<persona_slug>` | Persona identifier slug | `oracle-research-01` |
| `<hex32>` | 32-character hex random string | `e4f7a8b3c1d9e0f2a5b7c8d1e3f4a6b7` |

### Storage Security

- The raw key is displayed **exactly once** at creation time
- Only the **SHA-512 hash** of the key is stored in the database
- There is no mechanism to recover a lost raw key; a new key must be issued
- All key operations are recorded in the tamper-evident audit log

### Key Lifecycle

SoulKeys follow a strict state machine:

```
                  suspend
    active  ──────────────►  suspended
      │                          │
      │                          │ reinstate
      │                          │
      │          revoke          ▼
      ├──────────────────►   revoked (terminal)
      │                          ▲
      │                          │ revoke
      │                          │
      └──── expired ─────►  auto-revoked (terminal)
             (auto)
```

| Transition | Reversible | API Call |
|------------|------------|----------|
| active -> suspended | Yes | `PATCH /v1/soulauth/admin/soulkeys/{id}/suspend` |
| suspended -> active | Yes | `PATCH /v1/soulauth/admin/soulkeys/{id}/reinstate` |
| active -> revoked | No | `DELETE /v1/soulauth/admin/soulkeys/{id}` |
| suspended -> revoked | No | `DELETE /v1/soulauth/admin/soulkeys/{id}` |
| active -> expired | Automatic | Triggered by `expires_at` timestamp |

**Suspend a key:**

```bash
curl -X PATCH https://tiresias.network/v1/soulauth/admin/soulkeys/{soulkey_id}/suspend \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Investigating anomalous access pattern"}'
```

**Revoke a key (permanent):**

```bash
curl -X DELETE https://tiresias.network/v1/soulauth/admin/soulkeys/{soulkey_id} \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Key compromised - rotating credentials"}'
```

### Key Rotation Procedure

1. **Issue a new key** for the same tenant and persona
2. **Distribute** the new key to all consuming agents/services
3. **Verify** the new key is in use (monitor auth logs for the old key ID)
4. **Suspend** the old key (grace period for stragglers)
5. **Revoke** the old key after confirming zero usage

```bash
# Step 1: Issue replacement key
curl -X POST https://tiresias.network/v1/soulauth/admin/soulkeys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "ab789b06-6624-4f92-a89b-fec960991d01",
    "persona_id": "oracle-research-01",
    "description": "Oracle research agent - rotated 2026-03-22"
  }'

# Step 3: Check old key usage (last 24h)
curl "https://tiresias.network/v1/soulauth/admin/audit?soulkey_id={old_key_id}&since=24h" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Step 4: Suspend old key
curl -X PATCH https://tiresias.network/v1/soulauth/admin/soulkeys/{old_key_id}/suspend \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason": "Rotation - new key issued"}'

# Step 5: Revoke old key
curl -X DELETE https://tiresias.network/v1/soulauth/admin/soulkeys/{old_key_id} \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason": "Rotation complete"}'
```

---

## 3. Tenant Administration

### Creating Tenants

```bash
curl -X POST https://tiresias.network/v1/soulauth/admin/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme",
    "tier": "pro",
    "contact_email": "admin@acme.com",
    "settings": {
      "max_agents": 50,
      "max_keys_per_persona": 3,
      "audit_retention_days": 30
    }
  }'
```

### Tier System

| Feature | Community (Free) | Starter | Pro | Enterprise |
|---------|-------------------|---------|-----|------------|
| Max Agents | 5 | 25 | 100 | Unlimited |
| Max SoulKeys | 10 | 50 | 500 | Unlimited |
| Audit Retention | 1 day | 7 days | 30 days | 90 days |
| Policy Sync | Manual | 5 min | 1 min | 30 sec |
| Detection Engine | Basic | Standard | Advanced | Advanced + Custom |
| SIEM Integration | -- | -- | 1 destination | Unlimited |
| Notifications | Email only | Email + Slack | All sinks | All sinks + custom |
| SSO / OIDC | -- | -- | Yes | Yes |
| SLA | Best effort | 99.5% | 99.9% | 99.99% |
| Support | Community | Email | Priority | Dedicated |

### Updating a Tenant

```bash
curl -X PATCH https://tiresias.network/v1/soulauth/admin/tenants/{tenant_id} \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "enterprise",
    "settings": {
      "max_agents": -1,
      "audit_retention_days": 90
    }
  }'
```

### Tenant Isolation

All database queries are filtered by `tenant_id` at the ORM level. This ensures:

- No tenant can access another tenant's keys, policies, audit logs, or configuration
- Admin API endpoints require explicit `tenant_id` parameters
- Cross-tenant queries are architecturally impossible through the API layer
- Database-level row security policies provide defense-in-depth

### Listing Tenants

```bash
curl "https://tiresias.network/v1/soulauth/admin/tenants?page=1&per_page=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## 4. Policy Configuration

### Policy-as-Code

Tiresias policies are defined as YAML files stored in a Git repository. This enables version control, peer review, and auditability for all access policy changes.

### Directory Structure

```
policies/
  tenants/
    acme/
      personas/
        analyst.yaml
        orchestrator.yaml
        researcher.yaml
    saluca/
      personas/
        alfred.yaml
        oracle.yaml
        nightwing.yaml
  shared/
    roles.yaml
    base-constraints.yaml
```

### Persona Policy Example

```yaml
# tenants/acme/personas/analyst.yaml
persona_id: analyst-prod-01
role: analyst
description: "Production data analyst agent"

capabilities:
  - read:metrics
  - read:reports
  - write:analysis
  - execute:queries

constraints:
  operating_window:
    timezone: "America/New_York"
    allowed_hours: "06:00-22:00"
    allowed_days: ["mon", "tue", "wed", "thu", "fri"]

  allowed_nodes:
    - "analytics-db.internal"
    - "metrics-api.internal"

  session:
    max_duration_minutes: 120
    bind_to_ip: true
    require_mfa: false

  concurrency:
    max_concurrent_sessions: 3
    max_requests_per_minute: 100

  data:
    max_response_size_mb: 50
    blocked_fields: ["ssn", "credit_card", "password_hash"]

escalation:
  allow_temporary_grants: true
  max_grant_duration_minutes: 30
  require_approval: true
  approvers:
    - "admin@acme.com"
    - "security@acme.com"
```

### Shared Role Template

```yaml
# shared/roles.yaml
roles:
  analyst:
    base_capabilities:
      - read:metrics
      - read:reports
    base_constraints:
      concurrency:
        max_concurrent_sessions: 3
      session:
        max_duration_minutes: 120

  orchestrator:
    base_capabilities:
      - read:*
      - write:tasks
      - execute:workflows
    base_constraints:
      concurrency:
        max_concurrent_sessions: 10
      session:
        max_duration_minutes: 480

  auditor:
    base_capabilities:
      - read:audit
      - read:metrics
      - read:policies
    base_constraints:
      data:
        read_only: true
      session:
        max_duration_minutes: 60
```

### Policy Resolution

When a SoulKey authenticates, the effective policy is computed by merging:

1. **Shared role template** (from `shared/roles.yaml`)
2. **Persona-specific policy** (from `tenants/<slug>/personas/<persona>.yaml`)
3. **Tenant-level overrides** (from tenant settings in database)

Persona policies take precedence over role templates. Tenant overrides take precedence over both.

### Git Sync Configuration

```bash
# Configure the policy repository
curl -X PUT https://tiresias.network/v1/soulauth/admin/policy-sync \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/acme/tiresias-policies.git",
    "branch": "main",
    "sync_interval_seconds": 60,
    "deploy_key_secret": "POLICY_REPO_DEPLOY_KEY",
    "path_prefix": "policies/"
  }'
```

- Sync runs automatically at the configured interval
- Changes are validated before applying (invalid YAML is rejected)
- Sync status is available via the admin API and health endpoint
- Failed syncs generate alerts through the notification system

### Policy Cache

Resolved policies are cached in the `_soulauth_policy_cache` table for performance:

| Column | Type | Description |
|--------|------|-------------|
| `tenant_id` | UUID | Tenant identifier |
| `persona_id` | TEXT | Persona identifier |
| `resolved_policy` | JSONB | Merged and validated policy document |
| `policy_hash` | TEXT | SHA-256 of the resolved policy |
| `synced_at` | TIMESTAMPTZ | Last successful sync |
| `source_commit` | TEXT | Git commit hash |

```bash
# Force a policy re-sync
curl -X POST https://tiresias.network/v1/soulauth/admin/policy-sync/trigger \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# View sync status
curl https://tiresias.network/v1/soulauth/admin/policy-sync/status \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### JIT Constraints

Just-In-Time constraints are evaluated at every authentication decision:

| Constraint | Description | Example |
|------------|-------------|---------|
| Operating window | Time-of-day and day-of-week restrictions | `06:00-22:00 Mon-Fri EST` |
| Allowed nodes | Whitelist of backend services the agent can access | `["analytics-db", "metrics-api"]` |
| Session binding | Bind session to originating IP address | `bind_to_ip: true` |
| Concurrency limits | Maximum simultaneous active sessions | `max_concurrent_sessions: 3` |
| Request rate | Maximum requests per time window | `max_requests_per_minute: 100` |

### Escalation Configuration

Temporary privilege escalation for agents that need access beyond their baseline:

```yaml
escalation:
  allow_temporary_grants: true
  max_grant_duration_minutes: 30
  require_approval: true
  approvers:
    - "admin@acme.com"
  auto_revoke_on_expiry: true
  audit_all_actions: true
```

**Requesting escalation via API:**

```bash
curl -X POST https://tiresias.network/v1/soulauth/escalation/request \
  -H "Authorization: Bearer $SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "requested_capabilities": ["write:production-db"],
    "justification": "Emergency data correction for incident INC-4521",
    "duration_minutes": 15
  }'
```

---

## 5. Detection & Response Configuration

### Sigma Rules

Tiresias uses Sigma-compatible YAML rules for threat detection. Rules can be loaded from a directory or stored in the database.

**Built-in detection rules:**

| Rule ID | Name | Description | Default Severity |
|---------|------|-------------|-----------------|
| `CRED-001` | Credential Stuffing | Multiple failed auth attempts from same source | Critical |
| `PRIV-001` | Privilege Escalation | Capability usage outside granted scope | High |
| `DATA-001` | Data Exfiltration | Abnormal data volume in responses | High |
| `TIME-001` | Off-Hours Access | Authentication outside operating window | Medium |
| `KEY-001` | Key Abuse | Single key used from multiple IPs simultaneously | High |
| `PROMPT-001` | Prompt Injection Signal | Known injection patterns in request payload | High |

### Sigma Rule Format

```yaml
# rules/custom/lateral-movement.yaml
title: Lateral Movement Detection
id: custom-lat-001
status: active
level: high
description: >
  Detects when an agent accesses more than 5 distinct backend
  services within a 10-minute window.

detection:
  condition: distinct_backends > 5
  timeframe: 10m
  aggregation:
    field: target_service
    function: count_distinct
    group_by: soulkey_id

response:
  actions:
    - alert
    - rate_limit
  playbook: lateral-movement-response
```

### Loading Custom Rules

```bash
# Upload a single rule
curl -X POST https://tiresias.network/v1/soulwatch/admin/rules \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/yaml" \
  --data-binary @rules/custom/lateral-movement.yaml

# Upload all rules from a directory
for f in rules/custom/*.yaml; do
  curl -X POST https://tiresias.network/v1/soulwatch/admin/rules \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/yaml" \
    --data-binary @"$f"
done

# List active rules
curl https://tiresias.network/v1/soulwatch/admin/rules \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Playbook Configuration

Playbooks define automated response workflows triggered by detection rules:

```yaml
# playbooks/credential-stuffing-response.yaml
playbook_id: cred-stuff-response
name: "Credential Stuffing Response"
description: "Automated response to credential stuffing attacks"

triggers:
  - rule_id: CRED-001
    min_severity: critical

actions:
  - type: suspend_key
    params:
      reason: "Automated: credential stuffing detected"

  - type: kill_sessions
    params:
      scope: all_active

  - type: notify
    params:
      severity: critical
      message: "Credential stuffing detected for key {soulkey_id}"

  - type: quarantine
    params:
      policy: credential-stuffing-default

cooldown:
  duration_minutes: 15
  per: source_ip
```

### Quarantine Policies

Quarantine policies are stored in the `_soulauth_quarantine_policies` table and define automated containment actions.

**Default quarantine policies:**

| Policy Name | Trigger | Actions | Duration | Release |
|-------------|---------|---------|----------|---------|
| Credential Stuffing | `CRED-001` | Suspend key + kill sessions | 1 hour | Auto-release |
| Scope Escalation | `PRIV-001` | Rate limit + force re-auth | 30 minutes | Auto-release |
| Rate Spike | Multiple | Suspend + kill + rate reset | Indefinite | Manual approval only |

**Configure a quarantine policy:**

```bash
curl -X POST https://tiresias.network/v1/soulwatch/admin/quarantine-policies \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "ab789b06-6624-4f92-a89b-fec960991d01",
    "name": "custom-data-exfil",
    "trigger_rules": ["DATA-001"],
    "actions": ["suspend_key", "kill_sessions", "notify"],
    "duration_minutes": 60,
    "auto_release": false,
    "require_approval": true,
    "approvers": ["security-team@acme.com"]
  }'
```

**Release a quarantined key:**

```bash
curl -X POST https://tiresias.network/v1/soulwatch/admin/quarantine/{quarantine_id}/release \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approved_by": "admin@acme.com",
    "reason": "Investigation complete - false positive confirmed"
  }'
```

---

## 6. SIEM Integration

### Supported Destinations

| Destination | Protocol | Configuration Key |
|-------------|----------|-------------------|
| Splunk HEC | HTTPS | `splunk_hec` |
| Elasticsearch / OpenSearch | HTTPS | `elasticsearch` |
| Azure Sentinel | HTTPS (Log Analytics API) | `azure_sentinel` |
| Syslog | TCP/UDP (RFC 5424) | `syslog` |
| Webhook | HTTPS POST | `webhook` |

### CEF Formatting

All events are formatted using the Common Event Format (CEF) with Saluca vendor fields:

```
CEF:0|Saluca|Tiresias|1.0|AUTH_DENY|Authentication Denied|7|
  src=10.0.1.50
  suser=sk_agent_acme_analyst-01_*****
  dhost=analytics-db.internal
  act=deny
  reason=operating_window_violation
  cs1Label=tenant_id cs1=ab789b06-6624-4f92-a89b-fec960991d01
  cs2Label=persona_id cs2=analyst-prod-01
  cs3Label=policy_hash cs3=sha256:a1b2c3d4...
  rt=2026-03-22T15:30:00Z
```

### Configuring a SIEM Destination

**Splunk HEC example:**

```bash
curl -X POST https://tiresias.network/v1/soulwatch/admin/siem/destinations \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Splunk",
    "type": "splunk_hec",
    "config": {
      "url": "https://splunk.acme.com:8088/services/collector/event",
      "token": "your-hec-token",
      "index": "tiresias_events",
      "source": "tiresias",
      "sourcetype": "tiresias:cef",
      "verify_ssl": true
    },
    "enabled": true,
    "event_filter": {
      "min_severity": "medium",
      "event_types": ["auth_deny", "key_suspended", "key_revoked", "quarantine_activated", "anomaly_detected"]
    }
  }'
```

**Elasticsearch example:**

```bash
curl -X POST https://tiresias.network/v1/soulwatch/admin/siem/destinations \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Elastic SIEM",
    "type": "elasticsearch",
    "config": {
      "url": "https://elastic.acme.com:9200",
      "index_pattern": "tiresias-events-%Y.%m.%d",
      "username": "tiresias_writer",
      "password": "your-password",
      "verify_ssl": true
    },
    "enabled": true
  }'
```

**Syslog (RFC 5424) example:**

```bash
curl -X POST https://tiresias.network/v1/soulwatch/admin/siem/destinations \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Syslog Collector",
    "type": "syslog",
    "config": {
      "host": "syslog.acme.com",
      "port": 514,
      "protocol": "tcp",
      "facility": "auth",
      "app_name": "tiresias"
    },
    "enabled": true
  }'
```

### Event Forwarder Behavior

The SIEM event forwarder uses a buffered, batched architecture:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Buffer size | 100 events | Events are buffered in memory before flush |
| Flush interval | 30 seconds | Maximum time between flushes |
| Dead-letter queue | 10,000 events max | Failed events are queued for retry |
| Retry strategy | Exponential backoff | 1s, 2s, 4s, 8s, 16s (max 5 retries) |
| Batch size | 50 events | Events per HTTP request |

If the dead-letter queue reaches capacity, oldest events are dropped and a critical alert is generated.

```bash
# View SIEM destination health
curl https://tiresias.network/v1/soulwatch/admin/siem/destinations/{destination_id}/health \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# View dead-letter queue stats
curl https://tiresias.network/v1/soulwatch/admin/siem/dlq/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Retry dead-letter queue
curl -X POST https://tiresias.network/v1/soulwatch/admin/siem/dlq/retry \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## 7. Notification Routing

### Supported Notification Sinks

| Sink | Type | Configuration Required |
|------|------|----------------------|
| PagerDuty | Incident management | Integration key (Events API v2) |
| Slack | Chat | Webhook URL or Bot token + channel |
| Microsoft Teams | Chat | Incoming webhook URL |
| OpsGenie | Incident management | API key + team |
| Email (SMTP) | Email | SMTP host, port, credentials |
| AWS SNS | Cloud messaging | Topic ARN, region, credentials |
| Telegram | Chat | Bot token + chat ID |
| Webhook | Generic HTTP | URL + optional headers |

### Default Severity Routing

| Severity | Default Destinations | Response Time Target |
|----------|---------------------|---------------------|
| Critical | PagerDuty + Slack + Email | Immediate (< 5 min) |
| High | Slack + Email | < 30 min |
| Medium | Slack | < 4 hours |
| Low | Log only | Best effort |

### Configuring Notification Sinks

**Slack example:**

```bash
curl -X POST https://tiresias.network/v1/soulwatch/admin/notifications/sinks \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Security Slack Channel",
    "type": "slack",
    "config": {
      "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx",
      "channel": "#tiresias-alerts",
      "username": "Tiresias",
      "icon_emoji": ":shield:"
    },
    "severity_filter": ["critical", "high", "medium"],
    "enabled": true
  }'
```

**PagerDuty example:**

```bash
curl -X POST https://tiresias.network/v1/soulwatch/admin/notifications/sinks \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PagerDuty On-Call",
    "type": "pagerduty",
    "config": {
      "integration_key": "your-events-api-v2-key",
      "severity_mapping": {
        "critical": "critical",
        "high": "error",
        "medium": "warning",
        "low": "info"
      }
    },
    "severity_filter": ["critical"],
    "enabled": true
  }'
```

### Per-Tenant Overrides

Override default routing for specific tenants:

```bash
curl -X PUT https://tiresias.network/v1/soulwatch/admin/notifications/routing/{tenant_id} \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "overrides": {
      "critical": ["pagerduty", "slack", "email", "telegram"],
      "high": ["slack", "email"],
      "medium": ["slack"],
      "low": ["log"]
    }
  }'
```

### Circuit Breaker

The notification system includes a circuit breaker to prevent cascading failures:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Failure threshold | 3 consecutive failures | Trips the circuit breaker |
| Recovery timeout | 5 minutes | Duration the sink is skipped |
| Half-open test | 1 request | Single test request after recovery timeout |
| Reset on success | Immediate | Counter resets after successful delivery |

When a circuit breaker trips, events are routed to remaining healthy sinks and a warning is logged.

### Rate Limiting

| Parameter | Value | Description |
|-----------|-------|-------------|
| Rate limit | 10 alerts / 60 seconds | Per sink rate limit |
| Burst allowance | 5 additional | Brief burst above steady-state |
| Dedup window | 5 minutes | Identical alerts are deduplicated |

Alerts that exceed the rate limit are queued and delivered when capacity is available, or dropped if the queue is full (with a summary alert sent).

---

## 8. SoulGate Configuration

SoulGate is the API gateway that sits in front of backend services, enforcing authentication, rate limiting, and content inspection.

### Upstream Registry

Register backend services that SoulGate proxies:

```bash
curl -X POST https://tiresias.network/v1/soulgate/admin/upstreams \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "analytics-api",
    "url": "https://analytics-api.internal:8080",
    "health_check": {
      "path": "/health",
      "interval_seconds": 10,
      "timeout_seconds": 5,
      "unhealthy_threshold": 3
    },
    "timeout": {
      "connect_seconds": 5,
      "read_seconds": 30,
      "write_seconds": 30
    },
    "retry": {
      "max_retries": 2,
      "retry_on": ["502", "503", "504"]
    }
  }'
```

### Rate Limit Policies

Rate limits can be applied at multiple granularities using sliding window counters:

```bash
curl -X POST https://tiresias.network/v1/soulgate/admin/rate-limits \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "standard-agent-limits",
    "rules": [
      {
        "scope": "per_soulkey",
        "limit": 100,
        "window_seconds": 60,
        "action": "reject",
        "response_code": 429
      },
      {
        "scope": "per_tenant",
        "limit": 1000,
        "window_seconds": 60,
        "action": "reject",
        "response_code": 429
      },
      {
        "scope": "per_endpoint",
        "match": "/v1/ai/completions",
        "limit": 20,
        "window_seconds": 60,
        "action": "queue",
        "queue_timeout_seconds": 30
      }
    ]
  }'
```

| Scope | Description |
|-------|-------------|
| `per_soulkey` | Limits applied to each individual SoulKey |
| `per_tenant` | Aggregate limit for all keys in a tenant |
| `per_endpoint` | Limits on specific API paths |
| `global` | System-wide limit across all tenants |

### Circuit Breaker Settings

SoulGate includes an intelligent circuit breaker with anti-weaponization protections:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `failure_threshold` | 5 | Consecutive failures to trip the breaker |
| `cooldown_seconds` | 30 | Duration in open state before half-open test |
| `min_requests` | 20 | Minimum requests before breaker can activate |
| `per_source_ratio` | true | Track failure ratio per source, not globally |

**Anti-weaponization:** The `min_requests` threshold (default: 20) prevents a malicious agent from deliberately sending a small number of failing requests to trip the circuit breaker and deny service to legitimate users. The `per_source_ratio` check ensures one agent's failures do not affect another's access.

```bash
curl -X PUT https://tiresias.network/v1/soulgate/admin/circuit-breaker \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "failure_threshold": 5,
    "cooldown_seconds": 30,
    "min_requests": 20,
    "per_source_ratio": true,
    "exclude_status_codes": [400, 401, 403, 404]
  }'
```

### Prompt Injection Detection

SoulGate inspects request payloads for prompt injection patterns:

| Parameter | Default | Description |
|-----------|---------|-------------|
| Pattern count | 40+ | Built-in regex and semantic patterns |
| Warn threshold | 0.3 | Risk score that generates a warning |
| Block threshold | 0.7 | Risk score that blocks the request |
| Custom patterns | Supported | Upload additional patterns via API |

```bash
# Update prompt injection thresholds
curl -X PUT https://tiresias.network/v1/soulgate/admin/prompt-injection \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "warn_threshold": 0.3,
    "block_threshold": 0.7,
    "custom_patterns": [
      {
        "name": "internal-system-prompt-leak",
        "pattern": "(?i)(show|reveal|print|output)\\s+(your|the)\\s+(system|initial)\\s+prompt",
        "weight": 0.5
      }
    ],
    "exempt_endpoints": ["/v1/admin/*"],
    "log_blocked_payloads": true
  }'
```

### IP/Geo Access Control

Configure IP allowlists and denylists per tenant:

```bash
curl -X PUT https://tiresias.network/v1/soulgate/admin/access-control/{tenant_id} \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ip_allowlist": [
      "10.0.0.0/8",
      "172.16.0.0/12",
      "203.0.113.50/32"
    ],
    "ip_denylist": [],
    "geo_allowlist": ["US", "CA", "GB", "DE"],
    "geo_denylist": [],
    "mode": "allowlist",
    "enforce": true
  }'
```

| Mode | Behavior |
|------|----------|
| `allowlist` | Only listed IPs/geos are permitted; all others denied |
| `denylist` | Only listed IPs/geos are blocked; all others permitted |
| `disabled` | No IP/geo restrictions (default) |

### Gateway API Key Management

SoulGate can issue its own API keys for external consumers (distinct from SoulKeys):

```bash
# Issue a gateway key
curl -X POST https://tiresias.network/v1/soulgate/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "partner-integration",
    "tenant_id": "ab789b06-6624-4f92-a89b-fec960991d01",
    "scopes": ["read:public-api"],
    "rate_limit_override": {
      "limit": 500,
      "window_seconds": 60
    },
    "expires_at": "2027-03-22T00:00:00Z"
  }'

# Rotate a gateway key
curl -X POST https://tiresias.network/v1/soulgate/admin/api-keys/{key_id}/rotate \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Revoke a gateway key
curl -X DELETE https://tiresias.network/v1/soulgate/admin/api-keys/{key_id} \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Action Pipeline Configuration

Agent actions flow through an inline pipeline before execution: the cognition layer (MiroShark) emits a structured action, SoulGate authenticates and evaluates policy, logs the decision, and forwards to the action execution layer (PicoClaw). This creates a single chokepoint for all agent-initiated actions across the platform.

```
MiroShark (cognition) ──> SoulGate (auth + policy + audit) ──> PicoClaw (execution)
```

The pipeline is currently deployed in **monitor-only mode**: all actions are permitted, every decision is logged, and behavioral baselines are built from production traffic. No enforcement rules are active.

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOULGATE_PICOCLAW_BASE_URL` | `http://picoclaw-saluca:18790` | Base URL of the PicoClaw action execution API |
| `SOULGATE_PICOCLAW_ACTION_TOKEN` | (empty) | Shared secret for authenticating forwarded action requests to PicoClaw |

Set these in the SoulGate environment. In Docker Compose, add them to the `soulgate` service `env_file` or inline under `environment`. The token value must match the `TIRESIAS_ACTION_TOKEN` configured on the PicoClaw side.

#### Endpoint Reference: POST /gate/v1/actions/submit

**Authentication:** Every request must include a valid SoulKey in the `X-SoulKey` header. SoulGate validates the key against SoulAuth before processing the action.

**Request Schema (TiresiasActionRequest):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action_id` | UUID | Yes | Unique identifier for this action |
| `tenant_id` | string | Yes | Tenant that owns the acting agent |
| `persona_id` | string | Yes | Persona performing the action |
| `action_type` | enum | Yes | One of the supported action types (see below) |
| `target` | object | Yes | Destination for the action |
| `target.platform` | string | Yes | Target platform (e.g., `slack`) |
| `target.channel` | string | Yes | Target channel identifier |
| `target.thread_ts` | string | No | Thread timestamp for threaded replies |
| `content` | object | Yes | Action payload |
| `content.text` | string | No | Message text |
| `content.emoji` | string | No | Emoji name (for reactions) |
| `content.link_url` | string | No | URL to share |
| `simulation_context` | object | No | Metadata for simulation runs (includes `simulation_id`) |
| `timestamp` | ISO 8601 | No | Defaults to current UTC time |

**Action Types:**

| Type | Description |
|------|-------------|
| `POST_MESSAGE` | Post a new message to a channel |
| `REPLY_IN_THREAD` | Reply within an existing thread |
| `REACT` | Add an emoji reaction |
| `DM` | Send a direct message |
| `SHARE_LINK` | Share a link in a channel |
| `PIN_MESSAGE` | Pin a message |
| `CREATE_CHANNEL` | Create a new channel |
| `DO_NOTHING` | No-op (used for logging cognition decisions that result in no action) |

**Response Schema (TiresiasActionResponse):**

| Field | Type | Description |
|-------|------|-------------|
| `action_id` | UUID | Echo of the submitted action ID |
| `status` | string | `executed`, `failed`, or `denied` |
| `result` | object | Downstream execution result (present on success) |
| `error` | string | Error message (present on failure) |
| `denied_by` | object | Denial details (present when policy denies the action) |
| `denied_by.policy_name` | string | Name of the policy that denied the action |
| `denied_by.rule_name` | string | Specific rule within the policy |
| `denied_by.policy_level` | string | Policy scope (e.g., `action`) |
| `denied_by.reason` | string | Human-readable denial reason |

**Error Codes:**

| Code | Meaning | Cause |
|------|---------|-------|
| 401 | Authentication failed | Missing or invalid SoulKey |
| 403 | Policy denied | Action blocked by an active policy rule |
| 429 | Rate limited | Agent or tenant exceeded rate limit; `Retry-After` header included |
| 502 | Action layer unreachable | PicoClaw is down or `SOULGATE_PICOCLAW_BASE_URL` is misconfigured |
| 504 | Action layer timeout | PicoClaw did not respond within 15 seconds |

**Example: Submit an action**

```bash
curl -X POST https://tiresias.network/gate/v1/actions/submit \
  -H "X-SoulKey: $AGENT_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "tenant_id": "ab789b06-6624-4f92-a89b-fec960991d01",
    "persona_id": "miroshark-analyst-01",
    "action_type": "POST_MESSAGE",
    "target": {
      "platform": "slack",
      "channel": "#soc-alerts"
    },
    "content": {
      "text": "ALERT: Anomalous login pattern detected for user jdoe@acme.com"
    }
  }'
```

**Example: Successful response**

```json
{
  "action_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "executed",
  "result": {
    "ok": true,
    "ts": "1711234567.890123",
    "channel": "C0123456789"
  }
}
```

**Example: Policy denial response**

```json
{
  "action_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "denied",
  "denied_by": {
    "policy_name": "channel-access",
    "rule_name": "restrict-exec-channel",
    "policy_level": "action",
    "reason": "Persona miroshark-analyst-01 is not authorized to post in #executive"
  }
}
```

#### Monitor-Only Mode

The action pipeline ships in monitor-only mode. Every action that passes authentication and rate limiting is **permitted** regardless of type, target, or content. The policy evaluator returns `allowed: true` with reason `monitor-only` for every request.

This is intentional. The monitor phase builds behavioral baselines from real production traffic before enforcement rules go live:

- Which personas submit the most actions and what types they use
- Which channels receive the most agent-originated traffic
- Typical response times from the execution layer
- Action volume patterns by time of day and tenant

All decisions are written to the `_soulgate_action_log` audit table (see below). Review this data to understand normal agent behavior before defining enforcement policies.

#### Action Audit Log

Every action processed through the pipeline is recorded in the `_soulgate_action_log` table, regardless of whether it was permitted, denied, or failed downstream.

**Table Schema:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Tenant that owns the acting agent |
| `soulkey_id` | UUID | SoulKey used for authentication |
| `persona_id` | string(128) | Persona that submitted the action |
| `action_id` | UUID | Action identifier from the request |
| `action_type` | string(64) | Action type enum value |
| `target_platform` | string(32) | Target platform |
| `target_channel` | string(128) | Target channel |
| `decision` | string(16) | `permit` or `deny` |
| `policy_name` | string(128) | Policy that produced the decision (null in monitor mode) |
| `rule_name` | string(128) | Specific rule within the policy (null in monitor mode) |
| `downstream_status` | integer | HTTP status code from PicoClaw |
| `response_time_ms` | float | End-to-end pipeline latency in milliseconds |
| `simulation_id` | string(128) | Simulation run identifier (null for live traffic) |
| `source_ip` | string(45) | Client IP address |
| `created_at` | timestamptz | When the log entry was written |

**Indexes:** `tenant_id`, `persona_id`, `created_at`, `action_type`

**Useful Queries:**

```sql
-- Actions by persona (last 24 hours)
SELECT persona_id, action_type, COUNT(*) AS action_count
FROM _soulgate_action_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY persona_id, action_type
ORDER BY action_count DESC;

-- Actions by type (last 7 days)
SELECT action_type, decision, COUNT(*) AS total
FROM _soulgate_action_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY action_type, decision
ORDER BY total DESC;

-- Denied actions (useful before enforcement goes live — should be empty in monitor mode)
SELECT action_id, persona_id, action_type, policy_name, rule_name, created_at
FROM _soulgate_action_log
WHERE decision = 'deny'
ORDER BY created_at DESC
LIMIT 50;

-- Response time percentiles (execution layer health)
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) AS p50,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY response_time_ms) AS p90,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) AS p99
FROM _soulgate_action_log
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND downstream_status IS NOT NULL;
```

#### Enforcement Mode (Future)

The `policy.py` module provides the seam where enforcement logic will plug in. When enforcement is enabled, the `evaluate_action` function will query policy rules from the database instead of returning `monitor-only` for every request.

Action policies use a three-level intersection model:

| Level | Scope | Example |
|-------|-------|---------|
| Organization | Org-wide rules that apply to every agent in the tenant | "No agent may create channels" |
| Project | Rules scoped to a project or department | "SOC agents may only post in `#soc-*` channels" |
| Agent | Per-persona rules | "miroshark-analyst-01 is limited to 10 POST_MESSAGE actions per minute" |

A request must be permitted by **all three levels** to proceed. If any level denies, the action is blocked and the denial is recorded with the specific policy and rule that triggered it.

Planned enforcement capabilities:

- **Channel access rules** -- restrict which channels each persona or role can target
- **Per-agent rate limits** -- cap action volume per persona independent of SoulKey rate limits
- **Content policies** -- block or flag actions containing specific patterns or exceeding length thresholds
- **Time-of-day restrictions** -- limit agent actions to business hours or maintenance windows

#### Troubleshooting

**502 -- PicoClaw unreachable:**
The SoulGate proxy cannot connect to the action execution layer. Verify that `SOULGATE_PICOCLAW_BASE_URL` is correct and that the PicoClaw container is running and healthy. Check network connectivity between the SoulGate and PicoClaw containers (they must share a Docker network or be routable via the configured URL).

```bash
# Check PicoClaw health from the SoulGate container
docker compose exec soulgate curl -sf http://picoclaw-saluca:18790/health
```

**504 -- PicoClaw timeout:**
The execution layer did not respond within 15 seconds. Check downstream latency and PicoClaw logs for slow operations. If actions consistently approach the timeout threshold, investigate the platform API (e.g., Slack) for rate limits or outages.

**401 -- Authentication failed:**
The `X-SoulKey` header is missing or contains an invalid key. Verify the SoulKey is active and not expired. Check SoulAuth connectivity from the SoulGate container.

```bash
# Verify SoulAuth is reachable from SoulGate
docker compose exec soulgate curl -sf http://soulauth:8000/health
```

**Token mismatch (actions forwarded but rejected by PicoClaw):**
The `SOULGATE_PICOCLAW_ACTION_TOKEN` on SoulGate must match the `TIRESIAS_ACTION_TOKEN` on the PicoClaw side. A mismatch results in PicoClaw rejecting forwarded requests. Rotate both values simultaneously and restart both containers.

> **Customer deployment:** For step-by-step installation of the action pipeline in production, see `deploy/INSTALL.md` Section 5 (Action Pipeline Setup) and `deploy/TROUBLESHOOTING.md` Section 4 (Action Pipeline Issues).

---

## 9. Monitoring & Observability

### Health Endpoint

All services expose a `/health` endpoint:

```bash
# Basic health check
curl https://tiresias.network/health

# Detailed component breakdown
curl "https://tiresias.network/health?detail=true"
```

**Detailed response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 86400,
  "components": {
    "database": {
      "status": "healthy",
      "latency_ms": 2.3,
      "pool_size": 10,
      "active_connections": 3
    },
    "jwt_keys": {
      "status": "healthy",
      "kid": "kid-2026-03",
      "algorithm": "ES256",
      "public_key_loaded": true,
      "private_key_loaded": true
    },
    "policy_sync": {
      "status": "healthy",
      "last_sync": "2026-03-22T14:55:00Z",
      "source_commit": "a1b2c3d4",
      "cached_policies": 47
    },
    "detection_engine": {
      "status": "healthy",
      "active_rules": 12,
      "events_processed_1h": 15420
    }
  }
}
```

**Component statuses:**

| Status | Meaning |
|--------|---------|
| `healthy` | Component is operating normally |
| `degraded` | Component is functional but experiencing issues |
| `unhealthy` | Component has failed; service may be impaired |

### Prometheus Metrics

The `/metrics` endpoint exposes 20+ metrics in Prometheus format:

```bash
# Scrape metrics (with optional auth)
curl https://tiresias.network/metrics \
  -H "Authorization: Bearer $METRICS_AUTH_TOKEN"
```

**Prometheus scrape configuration:**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: "soulauth"
    scheme: https
    bearer_token: "your-metrics-auth-token"
    static_configs:
      - targets: ["tiresias.network:443"]
    metrics_path: /metrics
    scrape_interval: 15s
```

### Key Metrics Reference

#### Authentication Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `soulauth_auth_requests_total` | Counter | `decision`, `tenant_id` | Total auth decisions (grant/deny) |
| `soulauth_auth_latency_seconds` | Histogram | `decision` | Auth decision latency |
| `soulauth_active_sessions` | Gauge | `tenant_id` | Currently active sessions |
| `soulauth_token_issued_total` | Counter | `tenant_id`, `type` | Tokens issued |
| `soulauth_token_refreshed_total` | Counter | `tenant_id` | Token refresh operations |

#### SoulKey Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `soulauth_soulkeys_active` | Gauge | `tenant_id` | Active SoulKeys |
| `soulauth_soulkey_operations_total` | Counter | `operation` | Key lifecycle operations |

#### Policy Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `soulauth_policy_syncs_total` | Counter | `status` | Policy sync attempts (success/failure) |
| `soulauth_policy_sync_latency_seconds` | Histogram | -- | Sync duration |
| `soulauth_cached_policies` | Gauge | -- | Policies in cache |

#### Rate Limiting Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `soulauth_rate_limit_hits_total` | Counter | `tenant_id`, `scope` | Rate limit rejections |
| `soulauth_rate_limit_remaining` | Gauge | `tenant_id`, `scope` | Remaining quota |

#### Detection Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `soulauth_anomalies_total` | Counter | `rule_id`, `severity` | Anomalies detected |
| `soulauth_quarantine_active` | Gauge | `tenant_id` | Active quarantines |
| `soulauth_detection_latency_seconds` | Histogram | -- | Detection pipeline latency |

#### System Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `soulauth_health_check_status` | Gauge | `component` | Component health (1=healthy, 0=unhealthy) |
| `soulauth_db_pool_active` | Gauge | -- | Active database connections |
| `soulauth_db_pool_overflow` | Gauge | -- | Overflow connections in use |
| `soulauth_siem_events_forwarded_total` | Counter | `destination` | Events sent to SIEM |
| `soulauth_siem_dlq_size` | Gauge | `destination` | Dead-letter queue depth |
| `soulauth_notifications_sent_total` | Counter | `sink`, `severity` | Notifications dispatched |

### Recommended Alert Rules

```yaml
# Prometheus alerting rules
groups:
  - name: tiresias-critical
    rules:
      - alert: HighAuthDenyRate
        expr: |
          rate(soulauth_auth_requests_total{decision="deny"}[5m])
          / rate(soulauth_auth_requests_total[5m]) > 0.2
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Auth deny rate exceeds 20% over 5 minutes"

      - alert: AnomalySpike
        expr: rate(soulauth_anomalies_total[5m]) > 10
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Anomaly detection rate exceeds 10/min"

      - alert: ServiceUnhealthy
        expr: soulauth_health_check_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.component }} health check failing"

      - alert: DatabasePoolExhaustion
        expr: soulauth_db_pool_active / soulauth_db_pool_active + soulauth_db_pool_overflow > 0.9
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "Database connection pool >90% utilized"

      - alert: SIEMDeadLetterQueueGrowing
        expr: soulauth_siem_dlq_size > 5000
        for: 10m
        labels:
          severity: high
        annotations:
          summary: "SIEM dead-letter queue exceeds 5000 events"

      - alert: PolicySyncFailure
        expr: soulauth_policy_syncs_total{status="failure"} > 0
        for: 15m
        labels:
          severity: high
        annotations:
          summary: "Policy sync has been failing for 15+ minutes"
```

---

## 10. Audit & Compliance

### Hash-Chained Audit Log

Every administrative action and authentication decision is recorded in a tamper-evident audit log. Each entry is linked to the previous entry via a SHA-256 hash chain.

**Hash chain structure:**

```
entry_hash = SHA-256(
  previous_hash +
  timestamp +
  event_type +
  actor +
  tenant_id +
  payload_json
)
```

If any historical entry is modified, the chain breaks and all subsequent hashes become invalid. Chain integrity is verified automatically during audit queries.

### Event Types

| Event Type | Category | Description |
|------------|----------|-------------|
| `key_issued` | Key Management | New SoulKey created |
| `key_suspended` | Key Management | SoulKey suspended |
| `key_reinstated` | Key Management | SoulKey reinstated from suspension |
| `key_revoked` | Key Management | SoulKey permanently revoked |
| `key_expired` | Key Management | SoulKey auto-expired |
| `auth_grant` | Authentication | Authentication request approved |
| `auth_deny` | Authentication | Authentication request denied |
| `token_issued` | Token Operations | JWT token issued |
| `token_refreshed` | Token Operations | JWT token refreshed |
| `capability_issued` | Authorization | Capability grant issued |
| `capability_escalated` | Authorization | Temporary privilege escalation |
| `policy_synced` | Policy | Policy sync completed |
| `policy_failed` | Policy | Policy sync failed |
| `quarantine_activated` | Detection | Quarantine policy triggered |
| `quarantine_released` | Detection | Quarantine released |
| `anomaly_detected` | Detection | Anomaly rule matched |
| `playbook_executed` | Detection | Response playbook triggered |
| `tenant_created` | Administration | New tenant created |
| `tenant_updated` | Administration | Tenant settings changed |
| `siem_forwarded` | Integration | Event forwarded to SIEM |
| `config_changed` | Administration | System configuration modified |

### Querying the Audit Log

```bash
# Query by tenant
curl "https://tiresias.network/v1/soulauth/admin/audit?tenant_id={tenant_id}&page=1&per_page=50" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Query by event type
curl "https://tiresias.network/v1/soulauth/admin/audit?event_type=auth_deny&since=24h" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Query by SoulKey
curl "https://tiresias.network/v1/soulauth/admin/audit?soulkey_id={soulkey_id}&since=7d" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Query by date range
curl "https://tiresias.network/v1/soulauth/admin/audit?from=2026-03-01T00:00:00Z&to=2026-03-22T23:59:59Z" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Verify chain integrity
curl -X POST "https://tiresias.network/v1/soulauth/admin/audit/verify-integrity" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "ab789b06-6624-4f92-a89b-fec960991d01",
    "from": "2026-03-01T00:00:00Z",
    "to": "2026-03-22T23:59:59Z"
  }'
```

**Integrity verification response:**

```json
{
  "status": "valid",
  "entries_checked": 15420,
  "chain_start": "2026-03-01T00:00:01Z",
  "chain_end": "2026-03-22T23:58:30Z",
  "first_hash": "sha256:a1b2c3...",
  "last_hash": "sha256:d4e5f6...",
  "breaks_found": 0
}
```

### Retention Policies

Audit log retention is configured per tier:

| Tier | Retention Period | Archival |
|------|-----------------|----------|
| Community | 1 day | None |
| Starter | 7 days | Optional export |
| Pro | 30 days | Automatic cold storage |
| Enterprise | 90 days | Automatic cold storage + compliance hold |

**Configure custom retention:**

```bash
curl -X PUT https://tiresias.network/v1/soulauth/admin/audit/retention/{tenant_id} \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "retention_days": 90,
    "archive_to": "gcs://tiresias-audit-archive/acme/",
    "compliance_hold": true
  }'
```

### Compliance Reports

Generate compliance-ready reports for standard frameworks:

```bash
# SOC 2 Type II report
curl -X POST "https://tiresias.network/v1/soulauth/admin/compliance/reports" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "framework": "soc2",
    "tenant_id": "ab789b06-6624-4f92-a89b-fec960991d01",
    "period": {
      "from": "2026-01-01T00:00:00Z",
      "to": "2026-03-22T23:59:59Z"
    },
    "format": "pdf"
  }'
```

**Supported frameworks:**

| Framework | Report Contents |
|-----------|----------------|
| SOC 2 | Access controls, key management, audit trail integrity, incident response |
| ISO 27001 | Information security controls, risk assessment, policy compliance |
| NIST 800-53 | Security and privacy controls mapping, continuous monitoring evidence |

Reports include: audit chain integrity verification, access pattern analysis, policy change history, incident response timelines, and key lifecycle documentation.

---

## 11. Troubleshooting

### Connection Pool Exhaustion

**Symptoms:**
- Increasing response latency
- `TimeoutError` or `QueuePool limit` in logs
- `soulauth_db_pool_overflow` metric at maximum

**Resolution:**

1. Check current pool usage:
   ```bash
   curl "https://tiresias.network/health?detail=true" | jq '.components.database'
   ```

2. Increase pool size (restart required):
   ```bash
   # In .env or Kubernetes secret
   SOULAUTH_DB_POOL_SIZE=20
   SOULAUTH_DB_MAX_OVERFLOW=40
   ```

3. If using Cloud SQL, increase `max_connections`:
   ```bash
   gcloud sql instances patch tiresias-db \
     --database-flags max_connections=200
   ```

4. Investigate connection leaks: check for long-running queries in PostgreSQL:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
   AND state != 'idle'
   ORDER BY duration DESC;
   ```

### Anomaly Detection Baseline Cold Start

**Symptoms:**
- High false-positive rate for new agents
- Anomaly alerts for normal behavior patterns

**Explanation:** The anomaly detection engine requires approximately 7 days of baseline data per agent to establish normal behavior patterns. During this period, detection sensitivity is intentionally reduced.

**Resolution:**
- This is expected behavior. No action required.
- Optionally suppress alerts for new agents during the baseline period:
  ```bash
  curl -X PUT https://tiresias.network/v1/soulwatch/admin/detection/baseline-config \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "cold_start_days": 7,
      "cold_start_severity_floor": "high",
      "notify_on_baseline_complete": true
    }'
  ```

### Policy Sync Failures

**Symptoms:**
- `soulauth_policy_syncs_total{status="failure"}` incrementing
- Stale `synced_at` timestamps in `_soulauth_policy_cache`
- Policy changes not taking effect

**Diagnostic steps:**

1. Check sync status:
   ```bash
   curl https://tiresias.network/v1/soulauth/admin/policy-sync/status \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

2. Verify Git repository access:
   ```bash
   # From within the container or pod
   git ls-remote https://github.com/your-org/tiresias-policies.git
   ```

3. Validate YAML syntax:
   ```bash
   # Install yamllint if not present
   pip install yamllint
   yamllint policies/
   ```

4. Check the `_soulauth_policy_cache` table:
   ```sql
   SELECT tenant_id, persona_id, synced_at, source_commit,
          LENGTH(resolved_policy::text) AS policy_size
   FROM _soulauth_policy_cache
   ORDER BY synced_at DESC
   LIMIT 20;
   ```

5. Force a manual re-sync:
   ```bash
   curl -X POST https://tiresias.network/v1/soulauth/admin/policy-sync/trigger \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

### Token Validation Errors

**Symptoms:**
- `401 Unauthorized` responses with valid SoulKeys
- `invalid_token` or `token_expired` error codes
- JWT verification failures in logs

**Diagnostic steps:**

1. **Verify the ES256 key pair** -- confirm the private and public keys are a matching pair:
   ```bash
   # Extract public key from private key and compare
   openssl ec -in keys/private.pem -pubout 2>/dev/null | diff - keys/public.pem
   ```

2. **Check clock skew** -- JWT validation is sensitive to time differences between services:
   ```bash
   # On each service host/container
   date -u
   # Ensure all clocks are within 30 seconds of each other
   # Use NTP if not already configured
   ```

3. **Verify JWT_KID matches** -- the key ID in the token must match the server's current KID:
   ```bash
   # Decode a token header (without validation)
   echo "$TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq .

   # Should show: {"alg":"ES256","kid":"kid-2026-03","typ":"JWT"}
   # The "kid" must match SOULAUTH_JWT_KID
   ```

4. **Check key file permissions** -- key files must be readable by the service user:
   ```bash
   ls -la keys/private.pem keys/public.pem
   # Should be readable by the service process (e.g., 0400 or 0440)
   ```

### Common Error Codes

| HTTP Code | Error | Cause | Resolution |
|-----------|-------|-------|------------|
| 401 | `invalid_soulkey` | SoulKey not found or revoked | Verify key status, re-issue if needed |
| 401 | `expired_token` | JWT has expired | Client should refresh the token |
| 401 | `invalid_signature` | JWT signature verification failed | Check ES256 key pair and KID |
| 403 | `insufficient_scope` | Action not in granted capabilities | Update persona policy |
| 403 | `operating_window` | Request outside allowed hours | Adjust policy or wait |
| 403 | `quarantined` | Key is under quarantine | Check detection alerts, release if appropriate |
| 429 | `rate_limited` | Rate limit exceeded | Back off and retry, or request limit increase |
| 503 | `circuit_open` | Circuit breaker tripped for upstream | Wait for cooldown, check upstream health |

### Getting Support

- **Documentation:** [https://docs.tiresias.network](https://docs.tiresias.network)
- **Community:** GitHub Discussions
- **Starter/Pro:** Email support with 24-hour response SLA
- **Enterprise:** Dedicated support channel with 4-hour response SLA

---

*This document is maintained by the Tiresias platform team. For corrections or additions, open a pull request against the documentation repository.*
