# Part I: Getting Started

> **Tiresias Administration Guide v3.0**
> **Classification:** Customer-Facing
> **Audience:** Security administrators, SOC managers, MSSPs, platform operators

---

## Chapter 1: Introduction to Tiresias

### 1.1 What Is Tiresias

Tiresias is a purpose-built security platform for AI agent infrastructure. It provides identity management, behavioral threat detection, API gateway enforcement, and observability for autonomous LLM agents operating across enterprise environments.

Traditional IAM and SIEM tools were designed for human users with predictable session patterns. AI agents operate at machine speed, with non-deterministic behavior, delegated authority chains, and opaque reasoning. Tiresias treats these properties as first-class security concerns, providing:

- **Cryptographic agent identity** via SoulKeys (SHA-512 hashed credentials with one-time display)
- **Behavioral anomaly detection** with per-agent baselines and Sigma rule evaluation
- **API gateway security** with rate limiting, prompt injection scanning, and circuit breakers
- **Tamper-evident audit logging** using SHA-256 hash-chained records
- **Policy-as-code authorization** with git-synced YAML policies and a Policy Decision Point (PDP)
- **Automated response playbooks** that quarantine, suspend, or throttle agents in real time

### 1.2 Platform Components

Tiresias consists of four core services, a management portal, and supporting infrastructure.

| Component | Service Name | Default Port | Purpose |
|-----------|-------------|-------------|---------|
| **SoulAuth** | `soulauth` | 8000 | Agent identity, authorization PDP, OIDC/SSO, RBAC, capability tokens, policy engine |
| **SoulWatch** | `soulwatch` | 8001 | Behavioral baselines, anomaly detection, Sigma rule engine, response playbooks, SIEM export |
| **SoulGate** | `soulgate` | 8002 | API gateway with rate limiting, prompt injection scanning, circuit breakers, upstream proxy |
| **Tiresias Proxy** | `tiresias-proxy` | -- | LLM request interception, audit trail, cost tracking, chain-of-thought integrity |
| **Portal** | `portal` | 3000 | Next.js management dashboard for administrators and analysts |
| **Database** | `postgres` | 5432 | PostgreSQL 16 shared database for all services |
| **Monitoring** | `prometheus` | 9090 | Prometheus metrics collection with Alertmanager |

All services are implemented in Python 3.12 (FastAPI) except the Portal (TypeScript, Next.js 14 with App Router). All services share a single PostgreSQL 16 database, namespaced by table prefix.

### 1.3 The Closed-Loop Security Model

Tiresias implements a closed-loop security architecture where detection feeds enforcement and enforcement generates audit events that feed back into detection.

```
 Agent Request
      |
      v
 +-----------+     +-----------+     +------------+
 | SoulGate  |---->| SoulAuth  |---->| SoulWatch  |
 | (enforce) |     | (identity)|     | (detect)   |
 +-----------+     +-----------+     +------------+
      ^                                    |
      |                                    |
      +-------- Quarantine / Suspend ------+
                 (automated response)
```

1. **SoulGate** enforces gateway policies: rate limits, IP access controls, prompt injection scanning, and circuit breakers.
2. **SoulAuth** validates agent identity, evaluates authorization policies, issues capability tokens, and writes audit events to a tamper-evident hash chain.
3. **SoulWatch** consumes audit events, compares agent behavior against learned baselines, evaluates Sigma detection rules, and triggers automated response playbooks.
4. Response actions (suspend key, revoke token, rate limit, quarantine) feed back into SoulAuth and SoulGate, completing the loop.

Every step produces audit records. No enforcement action occurs without a corresponding log entry.

### 1.4 Key Concepts and Terminology

#### SoulKey

A SoulKey is a durable, cryptographic credential that uniquely identifies an AI agent within a tenant. SoulKeys are the agent equivalent of API keys but carry identity semantics.

- **Format:** `sk_agent_<tenant_short>_<persona_slug>_<hex64>`
- **Storage:** Only the SHA-512 hash is stored in the database. The raw key is displayed exactly once at issuance and cannot be retrieved.
- **Lifecycle states:** `active` --> `suspended` --> `active` | `revoked` (terminal)

#### Tenant

A tenant is the top-level isolation boundary. All agents, policies, audit records, and configurations are scoped to a tenant. Tenants support hierarchical nesting for MSSP deployments via `parent_tenant_id`.

#### Persona

A persona is a logical identity for an AI agent within a tenant. A single persona may have one active SoulKey at a time. Personas are referenced by `persona_id` throughout the platform.

#### Capability Token

A short-lived ES256-signed JWT issued by the PDP when an agent is authorized. Capability tokens encode the granted resource, action, and scope. Default lifetime is 300-900 seconds. Revocation is tracked via JTI (JWT ID) in the `_soulauth_revoked_tokens` table.

#### Baseline

A behavioral profile computed per agent by SoulWatch. Baselines capture normal request rates, resource access patterns, timing profiles, and action distributions. Deviations from baseline trigger anomaly alerts.

#### Policy-as-Code

Authorization policies are defined in YAML and synced from a git repository. The PDP evaluates policies at request time using resource:action:scope triplets. Policies are cached in the `_soulauth_policy_cache` table.

#### Quarantine Policy

An automated response configuration stored in `_soulauth_quarantine_policies`. Quarantine policies define trigger conditions (anomaly type, severity threshold), response actions (suspend key, kill session, force re-auth), and cooldown parameters.

### 1.5 Licensing and Subscription Tiers

Tiresias uses a tiered licensing model. The effective tier for any tenant is computed as:

```
effective_tier = min(install_license_tier, tenant_subscription_tier)
```

The install license (JWT, set via `TIRESIAS_LICENSE_KEY`) caps the ceiling. The tenant subscription sets what the customer paid for.

| Tier | Slug | Capabilities |
|------|------|-------------|
| **Community** | `community` | Basic agent identity, limited SoulKeys, read-only audit, community support |
| **Starter** | `starter` | SoulKey management, basic detection, email alerts, standard support |
| **Professional** | `pro` | Full detection engine, Sigma rules, playbooks, SIEM integration, OIDC/SSO |
| **Enterprise** | `enterprise` | Multi-tenancy, advanced RBAC, custom policies, delegation chains, priority support |
| **MSSP** | `mssp` | Hierarchical multi-tenancy, cross-tenant detection, partner revenue share, white-label reports |
| **SaaS** | `saas` | Full platform operator tier with all features enabled |

> **Note:** The `community` tier is the default for new tenants. Set `SOULAUTH_LICENSE_REQUIRED=false` in development to bypass license validation.

### 1.6 What's New in v3.0

**New features:**

- SaaS deployment on GCP Cloud Run with Stripe billing integration
- Hierarchical multi-tenancy with MSSP operations console
- Partner revenue share and promotional tooling
- Local authentication with LDAP support (in addition to OIDC/SSO)
- Usage-based billing with per-agent and per-request metering
- Sigma detection rule engine with custom rule authoring
- Response playbooks with automated quarantine actions
- SIEM forwarding to Splunk, Elasticsearch, Azure Sentinel, and Syslog
- Investigation tools with event correlation
- Contract management for enterprise customers
- Notification channels: email, Telegram, webhook
- Prometheus metrics with Alertmanager integration
- Feature gating middleware (tier-based access control for API endpoints)

**Breaking changes from v2.x:**

- Tier names changed: `free` is now `community`, `professional` is now `pro`
- Portal requires `--build-arg NEXT_PUBLIC_SOULAUTH_API_URL` at Docker build time
- Internal service communication now requires `INTERNAL_API_KEY` shared secret
- Database schema changes require Alembic migration (`alembic upgrade head`)

---

## Chapter 2: System Architecture

### 2.1 Architecture Overview

Tiresias follows a microservices architecture with stateless service design and a shared PostgreSQL database. All services communicate over an internal Docker bridge network (`tiresias-net`). Only SoulAuth (port 8000) and the Portal (port 3000) expose host ports in self-hosted deployments; SoulGate and SoulWatch are internal-only.

```
                              +------------------+
                              |   Cloudflare     |
                              |   (DNS / WAF)    |
                              +--------+---------+
                                       |
                        HTTPS (443)    |
                                       v
+-------------+          +-------------+-----------+
|             |  :3000   |                         |
|   Browser   +--------->+   Portal (Next.js)      |
|             |          |   Static + API Routes   |
+-------------+          +-----+-----+-----+------+
                               |     |     |
                +--------------+     |     +--------------+
                |                    |                    |
                v                    v                    v
      +---------+------+   +--------+-------+   +--------+-------+
      |   SoulAuth     |   |   SoulWatch    |   |   SoulGate     |
      |   :8000        |   |   :8001        |   |   :8002        |
      +-------+--------+   +-------+--------+   +-------+--------+
              |                    |                    |
              +----------+---------+----+--------------+
                         |              |
                         v              v
               +---------+------+  +----+-------------+
               |  PostgreSQL    |  |   LLM Providers   |
               |  (Cloud SQL)   |  |   (via proxy)     |
               +--------+------+  +-------------------+
                        |
                        v
               +--------+------+
               |  Prometheus   |
               |  + Alertmgr   |
               +---------------+
```

**Design principles:**

- **Stateless services.** All runtime state is stored in PostgreSQL. Any service instance can handle any request without session affinity.
- **Horizontal scaling.** Each service can scale independently. Cloud Run auto-scales based on request volume.
- **Defense in depth.** Multiple enforcement layers (gateway, PDP, detection) operate independently. Compromise of one layer does not bypass the others.
- **Tamper-evident logging.** The audit chain uses SHA-256 hashing to detect retroactive modification, reordering, or deletion.
- **Hierarchical multi-tenancy.** Tenants form a tree structure via `parent_tenant_id` references with a maximum depth of 3 levels. The SaaS master tier sits at the root. MSSP partners create enterprise/pro/community child tenants, and enterprise tenants can create sub-tenants for business units. Each level inherits isolation guarantees while enabling delegated administration from parent to child.

### 2.2 Component Interactions

Service-to-service calls use internal DNS names on the `tiresias-net` Docker bridge. No service-to-service traffic traverses the public internet.

| Source | Destination | Purpose | Auth Mechanism |
|--------|-------------|---------|---------------|
| Portal | SoulAuth (:8000) | All API calls (proxied through Next.js API routes) | Session cookie / X-Internal-Key |
| Portal | SoulWatch (:8001) | Dashboard data, anomaly feeds | X-Internal-Key |
| Portal | SoulGate (:8002) | Gateway configuration | X-Internal-Key |
| SoulGate | SoulAuth (:8000) | Token validation, policy checks | `INTERNAL_API_KEY` |
| SoulWatch | SoulAuth (:8000) | Audit event consumption, key suspension | `INTERNAL_API_KEY` |
| SoulGate | LLM Providers | Forward proxied requests | Upstream API keys |

> **Note:** SoulGate and SoulWatch authenticate to SoulAuth using the `INTERNAL_API_KEY` environment variable (shared secret). A future release will replace this with derived SoulKeys per service with per-node identity.

### 2.3 Deployment Models

Tiresias supports three deployment models.

#### SaaS (GCP Cloud Run)

The fully managed deployment. Saluca operates the infrastructure on Google Cloud Platform.

- **Compute:** Four Cloud Run services (portal, soulauth, soulwatch, soulgate), each auto-scaling independently
- **Database:** Cloud SQL PostgreSQL 16 (`db-g1-small`, `us-central1-a`)
- **DNS:** `tiresias.network` with Google-managed TLS certificates, Cloudflare proxied A records
- **Container registry:** `us-central1-docker.pkg.dev/salucainfrastructure/tiresias/`
- **Build:** Cloud Build on `E2_HIGHCPU_8` machines with 30-minute timeout

| Service | Production URL |
|---------|---------------|
| Portal | `https://tiresias.network` |
| SoulAuth | `https://tiresias-soulauth-253892677982.us-central1.run.app` |
| SoulWatch | `https://tiresias-soulwatch-253892677982.us-central1.run.app` |
| SoulGate | `https://tiresias-soulgate-zsnoaggk6q-uc.a.run.app` |

#### Self-Hosted (Docker Compose)

For organizations that require on-premises deployment or air-gapped environments. All services run as containers orchestrated by Docker Compose.

- All host-bound ports listen on `127.0.0.1` only (not `0.0.0.0`)
- SoulGate and SoulWatch have no host port mappings (internal-only)
- Database volume is persisted via Docker named volume (`pgdata`)

#### Hybrid

Combine SaaS portal with on-premises SoulGate for gateway enforcement at the network edge. The Portal and SoulAuth run in Cloud Run while SoulGate and SoulWatch run within the customer network, connecting to a Cloud SQL database over private networking.

### 2.4 Network Requirements

#### Ports and Protocols

| Service | Port | Protocol | Direction | Exposure |
|---------|------|----------|-----------|----------|
| Portal | 3000 | HTTPS | Inbound | Public (via reverse proxy) |
| SoulAuth | 8000 | HTTP | Inbound | Public API or internal only |
| SoulWatch | 8001 | HTTP | Internal | `tiresias-net` only |
| SoulGate | 8002 | HTTP | Internal | `tiresias-net` only |
| PostgreSQL | 5432 | TCP | Internal | `127.0.0.1` or Cloud SQL socket |
| Prometheus | 9090 | HTTP | Internal | `tiresias-net` only |
| Alertmanager | 9093 | HTTP | Internal | `tiresias-net` only |

#### Firewall Rules

For self-hosted deployments, the following outbound connections are required:

| Destination | Port | Purpose |
|-------------|------|---------|
| IdP provider (Google, Okta, Azure AD) | 443 | OIDC authentication for portal users |
| Stripe API (`api.stripe.com`) | 443 | Billing and subscription management |
| LLM providers (OpenAI, Anthropic, etc.) | 443 | Upstream API forwarding (SoulGate) |
| SIEM receivers (Splunk HEC, Elasticsearch) | Varies | Security event forwarding |
| Resend API (`api.resend.com`) | 443 | Transactional email (trial verification) |

> **Caution:** Do not expose SoulWatch (:8001), SoulGate (:8002), Prometheus (:9090), or Alertmanager (:9093) host ports to untrusted networks. These services are designed for internal-only communication.

### 2.5 Tenant Isolation Architecture

Tiresias enforces tenant isolation at three layers:

1. **Database level.** All tables include a `tenant_id` column. Queries are scoped by tenant at the ORM layer. Cross-tenant queries are rejected by middleware before reaching the database.

2. **API level.** Every authenticated request resolves to a tenant context via `TenantContextMiddleware`. Cross-tenant access is denied by default. The RBAC model restricts which users can view or modify tenant resources.

3. **Network level.** SoulGate and SoulWatch have no host port bindings. They are accessible only within the `tiresias-net` Docker bridge network.

Tenants support hierarchical nesting up to 3 levels deep. The `_soul_tenants` table includes `parent_tenant_id` and `hierarchy_depth` columns. The hierarchy follows a fixed structure:

```
Level 0: SaaS Master (tier = saas)
  └── Level 1: MSSP Partner or Enterprise tenant
        └── Level 2: Customer tenants (enterprise, pro, or community)
              └── Level 3: Sub-tenants (business units, departments)
```

A parent tenant operator can manage child tenants without cross-tenant data leakage. The SaaS master tier at level 0 has platform-wide visibility and can create or manage tenants at any level. Delegated admins at each level can only see and manage their own subtree. See Chapter 21 for the full tenant hierarchy model and Chapter 25 for MSSP-specific provisioning workflows.

### 2.6 High Availability and Fault Tolerance

#### Cloud Run (SaaS)

- Each service auto-scales from 0 to N instances based on request concurrency
- Cloud SQL provides automated backups, point-in-time recovery, and failover replicas
- Cloudflare provides edge caching, DDoS protection, and geographic load balancing

#### Self-Hosted

- Deploy multiple replicas behind a load balancer for each stateless service (SoulAuth, SoulGate, SoulWatch, Portal)
- PostgreSQL requires a separate HA strategy (streaming replication, Patroni, or managed database service)
- Prometheus and Alertmanager support native clustering

#### Graceful Degradation

| Failure | Impact | Mitigation |
|---------|--------|-----------|
| SoulWatch down | Detection stops; enforcement and identity continue | SoulGate and SoulAuth operate independently |
| SoulGate down | Gateway enforcement stops; agents bypass gateway | Direct access to SoulAuth PDP still available |
| PostgreSQL down | All services unavailable | Capability tokens remain valid until expiry (300-900s) |
| Prometheus down | Metrics collection stops; no impact on security functions | Services continue without metrics; alerts resume on recovery |

### 2.7 Security Properties

#### Zero-Trust Evaluation

Every agent request is evaluated by the PDP. There is no implicit trust based on network location or prior authentication. Each request must present a valid SoulKey, pass policy evaluation, and receive a scoped capability token.

#### Tamper-Evident Logging

The `_soulauth_audit` table maintains a SHA-256 hash chain:

- Each audit row includes a `prev_hash` column containing the hex digest of the previous row
- Genesis rows use the sentinel string `"genesis"`
- Chain verification detects gaps, reordering, or retroactive modification

#### Deterministic Enforcement

Policy evaluation is deterministic: the same request with the same policy state always produces the same authorization decision. Policies are version-controlled in git and cached in the database with version tracking.

#### Container Hardening

All containers in the Docker Compose deployment are hardened:

- `security_opt: no-new-privileges:true`
- `read_only: true` filesystem
- `cap_drop: ALL` (all Linux capabilities dropped)
- `tmpfs` mounts for `/tmp` and other writable paths
- Non-root user execution (`soulauth`, `nextjs`)

---

## Chapter 3: Deployment Guide

### 3.1 Prerequisites and System Requirements

#### Hardware Requirements

| Deployment | CPU | Memory | Disk |
|-----------|-----|--------|------|
| Evaluation / Development | 2 vCPU | 4 GB RAM | 20 GB SSD |
| Production (single-tenant) | 4 vCPU | 8 GB RAM | 100 GB SSD |
| Production (MSSP, multi-tenant) | 8+ vCPU | 16+ GB RAM | 250+ GB SSD |

#### Software Requirements

| Dependency | Minimum Version | Notes |
|-----------|----------------|-------|
| Docker Engine | 24.0+ | With Docker Compose V2 |
| PostgreSQL | 16 | Alpine image used in Docker Compose |
| Node.js | 20 LTS | For Portal builds only |
| Python | 3.12 | For backend services (included in container images) |
| OpenSSL | 3.0+ | For ES256 key generation |
| Git | 2.40+ | For policy repository sync |

#### Container Images

| Image | Base | Size |
|-------|------|------|
| `soulauth` | `python:3.12-slim` | ~250 MB |
| `soulwatch` | `python:3.12-slim` | ~250 MB |
| `soulgate` | `python:3.12-slim` | ~200 MB |
| `portal` | `node:20-alpine` | ~150 MB |
| `postgres` | `postgres:16-alpine` | ~80 MB |
| `prometheus` | `prom/prometheus:v2.51.0` | ~200 MB |
| `alertmanager` | `prom/alertmanager:v0.27.0` | ~60 MB |

### 3.2 Deploy Tiresias on GCP Cloud Run

#### Before You Begin

- A GCP project with billing enabled
- `gcloud` CLI installed and authenticated
- Cloud SQL Admin API, Cloud Run Admin API, Cloud Build API, and Artifact Registry API enabled
- A Cloudflare account (for DNS and WAF, optional)

#### Step 1: Create the Artifact Registry Repository

```bash
gcloud artifacts repositories create tiresias \
  --repository-format=docker \
  --location=us-central1 \
  --description="Tiresias container images"
```

#### Step 2: Create the Cloud SQL Instance

```bash
gcloud sql instances create tiresias-db \
  --database-version=POSTGRES_16 \
  --tier=db-g1-small \
  --region=us-central1 \
  --root-password=<SECURE_PASSWORD> \
  --storage-type=SSD \
  --storage-size=20GB \
  --backup-start-time=03:00 \
  --availability-type=zonal
```

Create the database and user:

```bash
gcloud sql databases create tiresias --instance=tiresias-db

gcloud sql users create tiresias \
  --instance=tiresias-db \
  --password=<SECURE_PASSWORD>
```

#### Step 3: Configure Secrets in Secret Manager

```bash
# Database credentials
echo -n "<DB_PASSWORD>" | gcloud secrets create tiresias-db-password --data-file=-

# Internal API key (shared secret for service-to-service auth)
openssl rand -hex 32 | gcloud secrets create tiresias-internal-api-key --data-file=-

# License key (JWT)
echo -n "<LICENSE_JWT>" | gcloud secrets create tiresias-license-key --data-file=-
```

#### Step 4: Build and Push Container Images

Use Cloud Build to build all four images in parallel:

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --timeout=1800s \
  --machine-type=E2_HIGHCPU_8
```

> **Note:** The `cloudbuild.yaml` builds all four images in parallel and pushes them to the Artifact Registry at `us-central1-docker.pkg.dev/salucainfrastructure/tiresias/`.

#### Step 5: Deploy Cloud Run Services

Deploy SoulAuth first (other services depend on it):

```bash
gcloud run deploy tiresias-soulauth \
  --image=us-central1-docker.pkg.dev/<PROJECT>/tiresias/soulauth:v3.0.18 \
  --region=us-central1 \
  --platform=managed \
  --set-env-vars="SOULAUTH_MODE=enterprise,SOULAUTH_DEBUG=false" \
  --set-secrets="SOULAUTH_DATABASE_URL=tiresias-db-url:latest" \
  --set-secrets="INTERNAL_API_KEY=tiresias-internal-api-key:latest" \
  --set-secrets="TIRESIAS_LICENSE_KEY=tiresias-license-key:latest" \
  --min-instances=1 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --port=8000 \
  --allow-unauthenticated
```

Deploy SoulWatch, SoulGate, and Portal similarly. See the Configuration Reference (Chapter 32) for the complete set of environment variables for each service.

#### Step 6: Configure DNS

Map your domain to the Cloud Run services:

```bash
gcloud run domain-mappings create \
  --service=tiresias-portal \
  --domain=tiresias.network \
  --region=us-central1
```

If using Cloudflare, create proxied A records pointing to the Google-managed IP addresses (e.g., `216.239.{32,34,36,38}.21`).

| Domain | Target | Purpose |
|--------|--------|---------|
| `tiresias.network` | Cloud Run (portal) | Management dashboard |
| `tiresias.network` | Cloud Run (soulauth) | Public API endpoint |
| `portal.tiresias.network` | Cloud Run (portal) | Alternative portal URL |

### 3.3 Deploy Tiresias with Docker Compose

#### Before You Begin

- Docker Engine 24.0+ with Docker Compose V2
- At least 4 GB of available RAM
- A copy of the Tiresias repository

#### Step 1: Create the Environment File

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` and set the following required values:

```ini
# Database
POSTGRES_USER=tiresias
POSTGRES_PASSWORD=<GENERATE_SECURE_PASSWORD>
POSTGRES_DB=tiresias

# SoulAuth
SOULAUTH_MODE=enterprise
SOULAUTH_DEBUG=false

# Internal API key (generate with: openssl rand -hex 32)
INTERNAL_API_KEY=<GENERATE_SECURE_KEY>

# License (set to false for evaluation)
SOULAUTH_LICENSE_REQUIRED=false
```

> **Caution:** Never use the default password `changeme-in-production` in any environment other than local development.

#### Step 2: Generate ES256 JWT Signing Keys

```bash
mkdir -p keys
openssl ecparam -genkey -name prime256v1 -noout -out keys/private.pem
openssl ec -in keys/private.pem -pubout -out keys/public.pem
```

Set the key paths in `.env`:

```ini
SOULAUTH_JWT_PRIVATE_KEY_PATH=./keys/private.pem
SOULAUTH_JWT_PUBLIC_KEY_PATH=./keys/public.pem
```

#### Step 3: Build and Start Services

```bash
docker compose up -d --build
```

> **Caution:** The Portal Docker build requires `--build-arg` for `NEXT_PUBLIC_*` variables. These are baked into the Next.js static build at compile time and cannot be changed at runtime. The `docker-compose.yml` configures this automatically, but if you build the Portal image manually, you must pass:
>
> ```bash
> docker build \
>   --build-arg NEXT_PUBLIC_SOULAUTH_API_URL=http://soulauth:8000 \
>   -t portal:latest \
>   -f portal/Dockerfile \
>   ./portal
> ```

The services start in dependency order:

1. `postgres` (healthcheck: `pg_isready`)
2. `soulauth` (depends on postgres, healthcheck: HTTP GET `/health`)
3. `soulgate` (depends on soulauth)
4. `soulwatch` (depends on soulauth)
5. `portal` (depends on soulauth)
6. `prometheus` (depends on all backend services)
7. `alertmanager` (depends on prometheus)

#### Step 4: Verify Service Health

```bash
# Check all containers are healthy
docker compose ps

# Verify SoulAuth
curl -s http://127.0.0.1:8000/health | python -m json.tool

# Verify Portal
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/
```

All services should report `healthy` status. The SoulAuth `/health` endpoint returns a JSON object with service status, database connectivity, and license state.

### 3.4 Deploy Tiresias on Kubernetes

> **Note:** Kubernetes deployment via Helm chart is planned for a future release. For Kubernetes deployments today, adapt the Docker Compose configuration to Kubernetes manifests. The key considerations are:
>
> - Use Kubernetes Secrets for all sensitive environment variables
> - Configure liveness and readiness probes using the `/health` endpoints
> - Set resource requests and limits matching the values in Section 3.1
> - Use a NetworkPolicy to restrict SoulWatch and SoulGate to cluster-internal traffic only
> - Deploy PostgreSQL using a managed database service or a Kubernetes operator (e.g., CloudNativePG)

### 3.5 Configure TLS Certificates

#### SaaS (Cloud Run)

TLS is managed automatically by Google Cloud Run. No manual certificate configuration is required. If using Cloudflare, the edge TLS certificate is managed by Cloudflare and the origin connection uses Google-managed certificates.

#### Self-Hosted

Place a reverse proxy (nginx, Caddy, or Traefik) in front of the Portal and SoulAuth to terminate TLS:

```nginx
# Example nginx configuration
server {
    listen 443 ssl;
    server_name tiresias.example.com;

    ssl_certificate     /etc/ssl/certs/tiresias.crt;
    ssl_certificate_key /etc/ssl/private/tiresias.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

> **Tip:** Use Let's Encrypt with Certbot or Caddy's automatic HTTPS for zero-cost, auto-renewing TLS certificates.

#### Database TLS

For production PostgreSQL connections, enable TLS by appending `?sslmode=require` to the database URL:

```ini
SOULAUTH_DATABASE_URL=postgresql+asyncpg://tiresias:<password>@db-host:5432/tiresias?sslmode=require
```

Cloud SQL connections via the Auth Proxy use an encrypted Unix socket and do not require explicit `sslmode` configuration.

### 3.6 Configure the Database

#### Schema Initialization

For Docker Compose deployments, the schema is automatically applied on first start via the init script mount:

```yaml
volumes:
  - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
```

For Cloud SQL or external PostgreSQL, apply the schema manually:

```bash
psql -h <DB_HOST> -U tiresias -d tiresias -f database/schema.sql
```

#### Database Connection URLs

Each service uses an async database URL (`postgresql+asyncpg://`) for runtime and a sync URL (`postgresql://`) for migrations:

| Variable | Service | Format |
|----------|---------|--------|
| `SOULAUTH_DATABASE_URL` | SoulAuth | `postgresql+asyncpg://user:pass@host:5432/db` |
| `SOULAUTH_DATABASE_URL_SYNC` | SoulAuth (migrations) | `postgresql://user:pass@host:5432/db` |
| `SOULGATE_DATABASE_URL` | SoulGate | `postgresql+asyncpg://user:pass@host:5432/db` |
| `SOULWATCH_DATABASE_URL` | SoulWatch | `postgresql+asyncpg://user:pass@host:5432/db` |

#### Run Alembic Migrations

After deploying a new version, run database migrations:

```bash
# From the SoulAuth container or project root
alembic upgrade head
```

> **Note:** Always back up the database before running migrations. See Chapter 28 for backup procedures.

#### Connection Pooling

SoulAuth uses SQLAlchemy async with connection pooling. Default pool settings are appropriate for most deployments. For high-traffic environments, tune the pool size via SQLAlchemy engine options in the application configuration.

### 3.7 Validate the Deployment

After deploying all services, run the following verification steps.

#### Step 1: Check Service Health

```bash
# SoulAuth
curl -s http://127.0.0.1:8000/health

# Portal (should return 200)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/

# SoulGate (internal, from within the Docker network)
docker compose exec soulgate python -c \
  "import httpx; print(httpx.get('http://localhost:8002/health').json())"

# SoulWatch (internal)
docker compose exec soulwatch python -c \
  "import httpx; print(httpx.get('http://localhost:8001/health').json())"
```

#### Step 2: Verify Database Connectivity

```bash
docker compose exec postgres pg_isready -U tiresias -d tiresias
```

#### Step 3: Verify Inter-Service Communication

```bash
# From soulgate, verify it can reach soulauth
docker compose exec soulgate python -c \
  "import httpx; r = httpx.get('http://soulauth:8000/health'); print(r.status_code)"

# From portal, verify it can reach all backends
docker compose exec portal wget -q -O- http://soulauth:8000/health
```

#### Step 4: Run the Smoke Test

If a `smoke-test.sh` script is available in the repository, execute it:

```bash
./smoke-test.sh
```

> **Tip:** Always run the smoke test after any rebuild, especially after changing `NEXT_PUBLIC_*` build arguments for the Portal.

#### Step 5: Access the Portal

Open a browser and navigate to:

- **Self-hosted:** `http://127.0.0.1:3000`
- **SaaS:** `https://tiresias.network`

You should see the Tiresias landing page. Proceed to Chapter 4 for initial configuration.

### 3.8 Upgrade and Rollback Procedures

#### Upgrade

1. **Back up the database** (see Chapter 28).
2. **Pull or build new images:**
   ```bash
   docker compose build --pull
   ```
3. **Run database migrations:**
   ```bash
   docker compose exec soulauth alembic upgrade head
   ```
4. **Restart services:**
   ```bash
   docker compose up -d
   ```
5. **Validate** using the procedures in Section 3.7.

#### Rollback

1. **Stop services:**
   ```bash
   docker compose down
   ```
2. **Restore the database** from backup (see Chapter 28).
3. **Revert to previous image tags** in `docker-compose.yml` or rebuild from the previous git tag.
4. **Run downgrade migration** (if available):
   ```bash
   docker compose exec soulauth alembic downgrade -1
   ```
5. **Start services:**
   ```bash
   docker compose up -d
   ```

> **Caution:** Database migrations may not be reversible. Always test the downgrade path in a staging environment before applying to production.

---

## Chapter 4: Initial Configuration

### 4.1 Create the Root Tenant

#### Before You Begin

- All services are running and healthy (verified in Section 3.7)
- You have access to the SoulAuth API (port 8000)
- You have the `INTERNAL_API_KEY` value from your `.env` file

#### Step 1: Create the Tenant via API

```bash
curl -s -X POST http://127.0.0.1:8000/v1/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>" \
  -d '{
    "name": "My Organization",
    "slug": "my-org",
    "tier": "enterprise"
  }' | python -m json.tool
```

The response includes the tenant `id` (UUID). Save this value.

```json
{
    "id": "7f561f93-8a90-46c3-a757-dad9ce1fdb23",
    "name": "My Organization",
    "slug": "my-org",
    "tier": "enterprise",
    "status": "active",
    "created_at": "2026-04-01T00:00:00Z"
}
```

#### Step 2: Create the Admin User

For OIDC/SSO deployments, the admin user is provisioned automatically on first login (JIT provisioning). The first user to authenticate is assigned the `owner` role.

For local authentication, SoulAuth bootstraps a local admin user on startup if configured. Set the following environment variables before starting the service:

```ini
SOULAUTH_LOCAL_ADMIN_EMAIL=admin@example.com
SOULAUTH_LOCAL_ADMIN_PASSWORD=<SECURE_PASSWORD>
```

> **Caution:** Change the default admin password immediately after first login. Local admin credentials should only be used as a fallback when OIDC/SSO is unavailable.

### 4.2 Configure the Portal

#### Portal Environment Variables

The Portal uses two categories of environment variables:

**Build-time variables** (baked into the Next.js build, require rebuild to change):

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SOULAUTH_API_URL` | `http://soulauth.tiresias.svc.cluster.local` | SoulAuth API URL for client-side requests |

**Runtime variables** (can be changed without rebuild):

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SOULAUTH_API_URL` | (from build) | SoulAuth backend URL (server-side) |
| `NEXT_PUBLIC_SOULWATCH_API_URL` | `http://soulwatch:8001` | SoulWatch backend URL |
| `NEXT_PUBLIC_SOULGATE_API_URL` | `http://soulgate:8002` | SoulGate backend URL |
| `NEXT_PUBLIC_APP_URL` | `https://tiresias.network` | Public-facing application URL (used in OIDC callbacks) |
| `SOULAUTH_INTERNAL_URL` | -- | Internal SoulAuth URL for server-side API calls |
| `SOULWATCH_INTERNAL_URL` | -- | Internal SoulWatch URL for server-side API calls |
| `SOULGATE_INTERNAL_URL` | -- | Internal SoulGate URL for server-side API calls |

> **Caution:** If you change any `NEXT_PUBLIC_*` variable, you must rebuild the Portal container image. These variables are embedded in the JavaScript bundle at build time. Always run the smoke test after rebuilding.

#### Portal Proxy Configuration

The Portal proxies API requests to backend services through Next.js API routes. The middleware injects `X-SoulKey` headers for `/v1/*` and `/dash/*` paths. Session data is stored in two HttpOnly cookies:

- `tiresias_oidc_session` -- session identifier
- `tiresias_oidc_data` -- encrypted session payload

### 4.3 Register Your First Agent

#### Before You Begin

- A tenant exists (Section 4.1)
- You have the tenant ID
- You are authenticated as an `owner` or `admin` role user

#### Step 1: Issue a SoulKey

```bash
curl -s -X POST http://127.0.0.1:8000/v1/keys/issue \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: <TENANT_ID>" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>" \
  -d '{
    "persona_id": "my-first-agent",
    "label": "Production Agent - Primary"
  }' | python -m json.tool
```

The response contains the raw SoulKey:

```json
{
    "key_id": "a1b2c3d4-...",
    "raw_key": "sk_agent_myorg_my-first-agent_8f3a1b2c4d5e6f7a...",
    "persona_id": "my-first-agent",
    "status": "active",
    "issued_at": "2026-04-01T00:00:00Z"
}
```

> **Caution:** The `raw_key` value is displayed exactly once. Copy it immediately and store it securely. The platform stores only the SHA-512 hash; the raw key cannot be retrieved after this response.

#### Step 2: Verify Agent Authentication

Test the SoulKey by making an authenticated request:

```bash
curl -s http://127.0.0.1:8000/v1/auth/verify \
  -H "Authorization: Bearer sk_agent_myorg_my-first-agent_8f3a1b2c4d5e6f7a..."
```

A successful response confirms the agent identity, tenant context, and active status.

#### Step 3: Configure Agent Scopes (Optional)

Define what resources and actions the agent is authorized to access by creating a policy. See Chapter 6 for detailed policy authoring instructions.

### 4.4 Configure Alerting Channels

#### Before You Begin

- A tenant exists with at least one registered agent
- You are authenticated as an `owner` or `admin` role user

#### Email Notifications

Set the Resend API key for transactional email:

```ini
RESEND_API_KEY=re_<your_api_key>
TRIAL_VERIFY_BASE_URL=https://tiresias.network
```

#### Telegram Alerts

For critical alerts via Telegram:

```ini
SOULAUTH_TELEGRAM_BOT_TOKEN=<BOT_TOKEN>
SOULAUTH_TELEGRAM_CHAT_ID=<CHAT_ID>
```

#### Webhook Notifications

Configure webhook endpoints through the Portal at **Dashboard > Settings > Notifications**, or via the notifications API:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/notifications/channels \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: <TENANT_ID>" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>" \
  -d '{
    "type": "webhook",
    "name": "SOC Webhook",
    "config": {
      "url": "https://soc.example.com/webhook/tiresias",
      "secret": "<HMAC_SECRET>"
    }
  }'
```

### 4.5 Set Up SIEM Integration

#### Before You Begin

- SoulWatch is running and healthy
- Your SIEM receiver endpoint is accessible from the Tiresias network
- You have the receiver credentials (HEC token, API key, etc.)

#### Enable SIEM Forwarding

Set the following environment variables:

```ini
SOULAUTH_SIEM_ENABLED=true
SOULAUTH_SIEM_BUFFER_SIZE=1000
SOULAUTH_SIEM_FLUSH_INTERVAL=5
```

#### Configure Destinations

SIEM destinations are configured as a JSON array in `SOULAUTH_SIEM_DESTINATIONS`:

**Splunk (HEC):**

```ini
SOULAUTH_SIEM_DESTINATIONS=[{"type":"splunk","hec_url":"https://splunk.example.com:8088","hec_token":"<TOKEN>","index":"tiresias","sourcetype":"tiresias:audit"}]
```

**Elasticsearch:**

```ini
SOULAUTH_SIEM_DESTINATIONS=[{"type":"elasticsearch","url":"https://elastic.example.com:9200","index":"tiresias-events","api_key":"<API_KEY>"}]
```

**Syslog (RFC 5424):**

```ini
SOULAUTH_SIEM_DESTINATIONS=[{"type":"syslog","host":"syslog.example.com","port":514,"protocol":"tcp"}]
```

**Webhook:**

```ini
SOULAUTH_SIEM_DESTINATIONS=[{"type":"webhook","url":"https://webhook.example.com/events","secret":"<HMAC_SECRET>"}]
```

> **Tip:** You can configure multiple destinations by including multiple objects in the JSON array. Events are forwarded to all configured destinations in parallel.

#### Verify SIEM Connectivity

```bash
curl -s http://127.0.0.1:8000/v1/siem/health \
  -H "X-Tenant-ID: <TENANT_ID>" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>"
```

The response shows the connectivity status for each configured SIEM destination.

### 4.6 Configure Baseline Learning Period

#### Before You Begin

- At least one agent is registered and actively making requests
- SoulWatch is running and consuming audit events from SoulAuth

#### How Baselines Work

SoulWatch automatically begins learning behavioral baselines for each agent on first observation. The baseline captures:

- **Request rate** -- normal requests per minute/hour
- **Resource access patterns** -- which resources the agent typically accesses
- **Action distribution** -- ratio of read vs. write vs. delete operations
- **Timing profile** -- when the agent is normally active (time-of-day, day-of-week)
- **Denial rate** -- normal rate of authorization denials
- **Burst patterns** -- typical burst size and frequency

#### Configure the Observation Window

The default learning period is 7 days. During this period, SoulWatch observes agent behavior without generating anomaly alerts. After the learning period, deviations from the established baseline trigger alerts.

Configure detection parameters through the Portal at **Dashboard > SoulWatch > Settings**, or by adjusting quarantine policy thresholds:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/enforcement/quarantine-policies \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: <TENANT_ID>" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>" \
  -d '{
    "trigger_type": "anomaly_score",
    "threshold": 0.8,
    "severity_threshold": "high",
    "action": "suspend_key",
    "cooldown_minutes": 15,
    "auto_release_hours": 1.0,
    "enabled": true
  }'
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `trigger_type` | `anomaly_score` | Anomaly type: `anomaly_score`, `credential_stuffing`, `scope_escalation`, `rate_spike`, or `any` |
| `threshold` | `0.8` | Numeric threshold for triggering (0.0 - 1.0) |
| `severity_threshold` | `high` | Minimum anomaly severity: `low`, `medium`, `high`, `critical` |
| `action` | `suspend_key` | Comma-separated actions: `suspend_key`, `revoke_key`, `kill_session`, `force_reauth`, `rate_limit`, `isolate`, `reset_context` |
| `cooldown_minutes` | `15` | Minimum time between repeated triggers |
| `auto_release_hours` | `1.0` | Automatically release suspended keys after N hours |

> **Tip:** Start with conservative thresholds (high severity, 0.8+ score) to avoid false positives during initial deployment. Lower thresholds gradually as you tune the system to your environment.

### 4.7 Verify End-to-End Security Pipeline

This procedure tests the complete closed-loop security pipeline: agent request through detection to enforcement.

#### Step 1: Make an Authenticated Request

Using the SoulKey issued in Section 4.3:

```bash
curl -s http://127.0.0.1:8000/v1/auth/verify \
  -H "Authorization: Bearer <SOULKEY>"
```

#### Step 2: Verify the Audit Trail

Check that the request was logged:

```bash
curl -s "http://127.0.0.1:8000/v1/audit?limit=5" \
  -H "X-Tenant-ID: <TENANT_ID>" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>"
```

You should see an `auth.grant` event for your agent.

#### Step 3: Verify Hash Chain Integrity

The audit log uses SHA-256 hash chaining. Each record's `prev_hash` field should contain the hex digest of the previous record. The first record in the chain uses the sentinel value `"genesis"`.

#### Step 4: Check Detection Pipeline

After sufficient activity, verify that SoulWatch is processing events:

```bash
curl -s "http://127.0.0.1:8001/v1/dashboard/summary" \
  -H "X-Tenant-ID: <TENANT_ID>" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>"
```

#### Step 5: Test the Portal Dashboard

1. Navigate to the Portal (`http://127.0.0.1:3000` or `https://tiresias.network`)
2. Log in using OIDC/SSO or local credentials
3. Navigate to **Dashboard > Overview** -- verify widget data is populating
4. Navigate to **Dashboard > Agents** -- verify your registered agent appears
5. Navigate to **Dashboard > Audit** -- verify audit events are visible
6. Navigate to **Dashboard > SoulWatch** -- verify the detection dashboard loads

If all steps complete successfully, the platform is operational. Proceed to Part II (Chapter 5) to configure agent identity management and authorization policies.

---

> **Cross-Reference Index for Part I**
>
> - SoulKey management procedures: Chapter 5
> - Authorization policy authoring: Chapter 6
> - Capability token configuration: Chapter 7
> - Behavioral baselines deep dive: Chapter 9
> - Sigma detection rules: Chapter 12
> - Automated response playbooks: Chapter 13
> - Portal dashboard navigation: Chapter 18
> - Complete environment variable reference: Chapter 32
> - Docker Compose reference: Chapter 32, Section 32.6
> - Security hardening checklist: Chapter 33
> - Troubleshooting: Chapter 30
