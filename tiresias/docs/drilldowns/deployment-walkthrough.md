# Deployment Walkthrough

> **Tiresias Administration Guide v3.0 -- L3 Drill-Down**
> **Classification:** Customer-Facing
> **Parent chapters:** Chapter 3 (Deployment Guide), Chapter 4 (Initial Configuration)
> **Audience:** Platform operators, DevOps engineers, security administrators

---

## 1. Pre-Deployment Checklist

Before starting any deployment, verify you have the following:

| Requirement | SaaS (GCP Cloud Run) | Self-Hosted (Docker Compose) | Kubernetes |
|---|---|---|---|
| Container runtime | N/A (managed) | Docker Engine 24+ with Compose v2 | containerd / CRI-O |
| PostgreSQL 16 | Cloud SQL or AlloyDB | Provided in docker-compose.yml | External or StatefulSet |
| Python 3.12 | N/A (baked into images) | N/A (baked into images) | N/A (baked into images) |
| Node.js 20 LTS | N/A (portal image) | N/A (portal image) | N/A (portal image) |
| TLS certificates | GCP-managed via Certificate Manager | Self-provisioned or Let's Encrypt | cert-manager recommended |
| DNS records | Required: `api.tiresias.network`, `portal.tiresias.network` | Optional: any hostname | Required for Ingress |
| Secrets | GCP Secret Manager (26 secrets) | `.env` file | Kubernetes Secrets or Vault |
| Stripe keys | Required for billing | Required for billing | Required for billing |
| INTERNAL_API_KEY | Required | Required | Required |
| TIRESIAS_LICENSE_KEY | Optional (bypass with `SOULAUTH_LICENSE_REQUIRED=false`) | Optional | Optional |
| Minimum RAM | N/A (per-instance) | 4 GB total (8 GB recommended) | 2 GB per pod |
| Minimum CPU | N/A (per-instance) | 2 vCPU (4 recommended) | 500m per pod |
| Disk | N/A (managed) | 20 GB for pgdata + promdata volumes | PVCs per StatefulSet |

---

## 2. Self-Hosted Deployment (Docker Compose) -- Step by Step

This is the most common deployment model for evaluation and single-tenant production.

### 2.1 Clone and Prepare the Repository

```bash
git clone https://github.com/salucallc/tiresias.git
cd tiresias
```

### 2.2 Create the Environment File

Create `.env` in the repository root. Every variable marked `REQUIRED` will cause a startup failure if missing.

```bash
# --- Database (REQUIRED) ---
POSTGRES_USER=tiresias
POSTGRES_PASSWORD=<generate-a-strong-password>
POSTGRES_DB=tiresias

# --- Inter-service authentication (REQUIRED) ---
INTERNAL_API_KEY=<generate-a-strong-random-string>

# --- SoulAuth configuration ---
SOULAUTH_MODE=enterprise            # Options: community, starter, pro, enterprise, mssp, saas
SOULAUTH_DEBUG=false                 # Set true only for development
SOULAUTH_LICENSE_REQUIRED=false      # Set true in production with a valid license JWT
TIRESIAS_LICENSE_KEY=                 # JWT license key (optional if LICENSE_REQUIRED=false)

# --- JWT signing keys (optional -- SoulAuth generates ephemeral keys if omitted) ---
SOULAUTH_JWT_PRIVATE_KEY_PATH=
SOULAUTH_JWT_PUBLIC_KEY_PATH=

# --- Trial and email (optional) ---
RESEND_API_KEY=
TRIAL_VERIFY_BASE_URL=https://api.tiresias.network

# --- SoulWatch ---
SOULWATCH_MODE=sidecar              # Options: sidecar, standalone

# --- Portal build arguments (CRITICAL) ---
# These are baked into the Next.js bundle at build time.
# Changing them requires a full portal rebuild.
NEXT_PUBLIC_SOULAUTH_API_URL=http://soulauth:8000
NEXT_PUBLIC_SOULWATCH_API_URL=http://soulwatch:8001
NEXT_PUBLIC_SOULGATE_API_URL=http://soulgate:8002
```

**CRITICAL:** The `NEXT_PUBLIC_*` variables are compiled into the Next.js client bundle at Docker build time via `--build-arg`. Changing them after the image is built has no effect. You must rebuild the portal image.

### 2.3 Build All Services

```bash
docker compose build
```

**Expected output:**

```
[+] Building 4/4
 => [postgres] ... (pulled from registry)
 => [soulauth] ... (built from Dockerfile)
 => [soulgate] ... (built from soulGate/Dockerfile)
 => [soulwatch] ... (built from soulWatch/Dockerfile)
 => [portal] ... (built from portal/Dockerfile with build-arg NEXT_PUBLIC_SOULAUTH_API_URL)
```

If the portal build fails with `NEXT_PUBLIC_SOULAUTH_API_URL is undefined`, verify your `.env` file is in the repo root and `docker compose` is reading it (run `docker compose config` to confirm).

### 2.4 Start the Stack

```bash
docker compose up -d
```

**Expected startup order** (enforced by `depends_on` with health checks):

1. `postgres` -- starts first, must pass `pg_isready` health check
2. `soulauth` -- starts after postgres is healthy, must pass `/health` check
3. `soulgate` -- starts after soulauth is healthy
4. `soulwatch` -- starts after soulauth is healthy
5. `portal` -- starts after soulauth is healthy
6. `prometheus` -- starts after soulauth, soulgate, soulwatch
7. `alertmanager` -- starts after prometheus

### 2.5 Verify All Services Are Healthy

```bash
docker compose ps
```

**Expected output (all services showing "healthy"):**

```
NAME          SERVICE       STATUS          PORTS
tiresias-postgres-1     postgres     running (healthy)   127.0.0.1:5432->5432/tcp
tiresias-soulauth-1     soulauth     running (healthy)   127.0.0.1:8000->8000/tcp
tiresias-soulgate-1     soulgate     running (healthy)
tiresias-soulwatch-1    soulwatch    running (healthy)
tiresias-portal-1       portal       running (healthy)   127.0.0.1:3000->3000/tcp
tiresias-prometheus-1   prometheus   running (healthy)
tiresias-alertmanager-1 alertmanager running (healthy)
```

If any service shows `starting` for more than 60 seconds, check its logs:

```bash
docker compose logs <service-name> --tail 50
```

### 2.6 Run the Database Schema Migration

```bash
docker compose exec soulauth alembic upgrade head
```

**Expected output:**

```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 001, Initial schema
...
```

### 2.7 Verify Health Endpoints

```bash
# SoulAuth
curl -s http://localhost:8000/health | python -m json.tool

# Portal
curl -s http://localhost:3000/health

# Prometheus
curl -s http://localhost:9090/-/healthy
```

**Expected SoulAuth health response:**

```json
{
  "status": "ok",
  "version": "3.0.0",
  "database": "connected",
  "uptime_seconds": 42
}
```

### 2.8 Create the First Tenant and Admin SoulKey

```bash
# Create root tenant
curl -s -X POST http://localhost:8000/v1/soulauth/admin/tenants \
  -H "X-Internal-Key: ${INTERNAL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Organization",
    "tier": "enterprise",
    "slug": "myorg"
  }' | python -m json.tool
```

**Expected output:**

```json
{
  "tenant_id": "tn_myorg_<uuid>",
  "name": "My Organization",
  "tier": "enterprise",
  "created_at": "2026-04-02T..."
}
```

```bash
# Issue admin SoulKey
curl -s -X POST http://localhost:8000/v1/soulauth/admin/keys \
  -H "X-Internal-Key: ${INTERNAL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<tenant_id_from_above>",
    "persona_id": "admin",
    "label": "root-admin"
  }' | python -m json.tool
```

**CRITICAL:** The response includes the raw SoulKey **exactly once**. Copy it immediately. It cannot be retrieved again.

```json
{
  "id": "sk_<id>",
  "raw_key": "sk_agent_myorg_admin_<64-hex-chars>",
  "tenant_id": "tn_myorg_<uuid>",
  "persona_id": "admin",
  "status": "active",
  "issued_at": "2026-04-02T..."
}
```

### 2.9 Log In to the Portal

1. Open `http://localhost:3000` in your browser.
2. Paste the raw SoulKey from step 2.8 into the login field.
3. The portal validates via `/v1/auth/whoami`, creates an HttpOnly session cookie, and redirects to `/dashboard/welcome`.
4. Complete the welcome onboarding flow. A `tiresias_welcomed=1` cookie is set.

---

## 3. SaaS Deployment (GCP Cloud Run) -- Step by Step

### 3.1 GCP Project Setup

```bash
# Set project
gcloud config set project tiresias-prod

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

### 3.2 Create Secrets in Secret Manager

The production deployment uses 26 secrets. The critical ones:

```bash
# Database
echo -n "postgresql+asyncpg://..." | gcloud secrets create SOULAUTH_DATABASE_URL --data-file=-
echo -n "postgresql://..." | gcloud secrets create SOULAUTH_DATABASE_URL_SYNC --data-file=-

# Inter-service key
echo -n "<random-key>" | gcloud secrets create INTERNAL_API_KEY --data-file=-

# Stripe
echo -n "sk_live_..." | gcloud secrets create STRIPE_SECRET_KEY --data-file=-
echo -n "whsec_..." | gcloud secrets create STRIPE_WEBHOOK_SECRET --data-file=-

# JWT signing
gcloud secrets create SOULAUTH_JWT_PRIVATE_KEY --data-file=private_key.pem
gcloud secrets create SOULAUTH_JWT_PUBLIC_KEY --data-file=public_key.pem

# License
echo -n "<jwt-license>" | gcloud secrets create TIRESIAS_LICENSE_KEY --data-file=-
```

### 3.3 Build and Push Container Images

```bash
# Build SoulAuth
gcloud builds submit --tag gcr.io/tiresias-prod/soulauth:3.0.0 .

# Build SoulGate
gcloud builds submit --tag gcr.io/tiresias-prod/soulgate:3.0.0 -f soulGate/Dockerfile .

# Build SoulWatch
gcloud builds submit --tag gcr.io/tiresias-prod/soulwatch:3.0.0 -f soulWatch/Dockerfile .

# Build Portal (CRITICAL: pass build-arg)
gcloud builds submit --tag gcr.io/tiresias-prod/portal:3.0.0 \
  --build-arg NEXT_PUBLIC_SOULAUTH_API_URL=https://api.tiresias.network \
  portal/
```

### 3.4 Deploy Cloud Run Services

Deploy in dependency order:

```bash
# SoulAuth
gcloud run deploy soulauth \
  --image gcr.io/tiresias-prod/soulauth:3.0.0 \
  --region us-central1 \
  --port 8000 \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --set-secrets "SOULAUTH_DATABASE_URL=SOULAUTH_DATABASE_URL:latest,INTERNAL_API_KEY=INTERNAL_API_KEY:latest,TIRESIAS_LICENSE_KEY=TIRESIAS_LICENSE_KEY:latest" \
  --set-env-vars "SOULAUTH_MODE=saas,SOULAUTH_LICENSE_REQUIRED=true"

# SoulGate
gcloud run deploy soulgate \
  --image gcr.io/tiresias-prod/soulgate:3.0.0 \
  --region us-central1 \
  --port 8002 \
  --memory 512Mi \
  --cpu 1 \
  --set-secrets "SOULGATE_DATABASE_URL=SOULGATE_DATABASE_URL:latest,SOULGATE_INTERNAL_API_KEY=INTERNAL_API_KEY:latest" \
  --set-env-vars "SOULGATE_SOULAUTH_URL=https://soulauth-<hash>-uc.a.run.app"

# SoulWatch
gcloud run deploy soulwatch \
  --image gcr.io/tiresias-prod/soulwatch:3.0.0 \
  --region us-central1 \
  --port 8001 \
  --memory 512Mi \
  --cpu 1 \
  --set-secrets "SOULWATCH_DATABASE_URL=SOULWATCH_DATABASE_URL:latest,SOULWATCH_INTERNAL_API_KEY=INTERNAL_API_KEY:latest" \
  --set-env-vars "SOULWATCH_MODE=sidecar,SOULWATCH_SOULAUTH_URL=https://soulauth-<hash>-uc.a.run.app"

# Portal
gcloud run deploy portal \
  --image gcr.io/tiresias-prod/portal:3.0.0 \
  --region us-central1 \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars "NEXT_PUBLIC_SOULAUTH_API_URL=https://api.tiresias.network"
```

### 3.5 Configure Custom Domain and TLS

```bash
# Map custom domain
gcloud run domain-mappings create \
  --service soulauth \
  --domain api.tiresias.network \
  --region us-central1

gcloud run domain-mappings create \
  --service portal \
  --domain portal.tiresias.network \
  --region us-central1
```

GCP automatically provisions managed TLS certificates. DNS verification is required.

### 3.6 Post-Deployment Validation

```bash
# Health check
curl -s https://api.tiresias.network/health | python -m json.tool

# Metrics endpoint
curl -s https://api.tiresias.network/metrics | head -20

# Portal
curl -s -o /dev/null -w "%{http_code}" https://portal.tiresias.network/
# Expected: 200
```

---

## 4. Configuration Decision Matrix

Use this matrix to select the right configuration for your deployment model.

### 4.1 Deployment Model Selection

| Factor | Choose SaaS | Choose Self-Hosted | Choose Kubernetes |
|---|---|---|---|
| Operational overhead | Minimal (managed) | Moderate (you manage) | High (you manage K8s) |
| Data residency | GCP regions | Full control | Full control |
| Compliance (air-gapped) | Not supported | Supported | Supported |
| Scaling | Automatic (Cloud Run) | Manual (more containers) | HPA / VPA |
| Cost (< 10 agents) | Free/Starter tier | Infrastructure cost | Infrastructure cost |
| Cost (> 100 agents) | Enterprise tier | Fixed infrastructure | Fixed infrastructure |
| Time to production | < 1 hour | 2-4 hours | 4-8 hours |
| Customization | Limited | Full | Full |

### 4.2 Environment Variable Reference by Service

| Variable | Service | Required | Default | Notes |
|---|---|---|---|---|
| `POSTGRES_USER` | postgres | Yes | -- | Database superuser |
| `POSTGRES_PASSWORD` | postgres | Yes | -- | Database password |
| `POSTGRES_DB` | postgres | Yes | -- | Database name |
| `SOULAUTH_DATABASE_URL` | soulauth | Yes | -- | asyncpg connection string |
| `SOULAUTH_DATABASE_URL_SYNC` | soulauth | No | -- | Sync connection for Alembic |
| `SOULAUTH_MODE` | soulauth | No | `enterprise` | Tier mode |
| `SOULAUTH_DEBUG` | soulauth | No | `false` | Debug logging |
| `INTERNAL_API_KEY` | all services | Yes | -- | Inter-service shared secret |
| `SOULGATE_SOULAUTH_URL` | soulgate | Yes | -- | SoulAuth internal URL |
| `SOULWATCH_SOULAUTH_URL` | soulwatch | Yes | -- | SoulAuth internal URL |
| `SOULWATCH_MODE` | soulwatch | No | `sidecar` | `sidecar` or `standalone` |
| `NEXT_PUBLIC_SOULAUTH_API_URL` | portal | Yes (build-arg) | `http://soulauth.tiresias.svc.cluster.local` | **Must be set at build time** |
| `NEXT_PUBLIC_SOULWATCH_API_URL` | portal | No | -- | SoulWatch API for portal |
| `NEXT_PUBLIC_SOULGATE_API_URL` | portal | No | -- | SoulGate API for portal |
| `TIRESIAS_PROXY_URL` | portal | No | `http://tiresias-proxy:8080` | LLM proxy URL |
| `TIRESIAS_LICENSE_KEY` | soulauth | No | -- | JWT license key |
| `SOULAUTH_LICENSE_REQUIRED` | soulauth | No | `false` | Enforce license validation |
| `RESEND_API_KEY` | soulauth | No | -- | Email delivery (Resend) |
| `TRIAL_VERIFY_BASE_URL` | soulauth | No | `https://api.tiresias.network` | Trial email verification URL |
| `STRIPE_SECRET_KEY` | billing | No | -- | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | billing | No | -- | Stripe webhook verification |

### 4.3 Port Mapping Reference

| Service | Container Port | Host Binding | External Access |
|---|---|---|---|
| postgres | 5432 | `127.0.0.1:5432` | Localhost only (hardened) |
| soulauth | 8000 | `127.0.0.1:8000` | Localhost only (hardened) |
| soulgate | 8002 | None | Internal network only |
| soulwatch | 8001 | None | Internal network only |
| portal | 3000 | `127.0.0.1:3000` | Localhost only (hardened) |
| prometheus | 9090 | None | Internal network only |
| alertmanager | 9093 | None | Internal network only |

All services communicate over the `tiresias-net` bridge network. Only postgres, soulauth, and portal bind to the host, and only on `127.0.0.1`.

---

## 5. Container Security Hardening (Applied by Default)

Every service in the Docker Compose stack ships with these security controls:

| Control | Setting | Purpose |
|---|---|---|
| `security_opt: no-new-privileges` | All services | Prevents privilege escalation via setuid/setgid |
| `read_only: true` | All services | Read-only root filesystem |
| `tmpfs: /tmp` | All services | Writable temp only in tmpfs (no persistent writes) |
| `cap_drop: ALL` | All services | Drop all Linux capabilities |
| `127.0.0.1` bind | postgres, soulauth, portal | No external network exposure |
| No host port | soulgate, soulwatch, prometheus, alertmanager | Network-isolated, internal only |
| Health checks | All services | Automatic restart on failure |

---

## 6. Upgrade Procedures

### 6.1 Zero-Downtime Upgrade (Docker Compose)

```bash
# 1. Pull or build new images
docker compose build

# 2. Run database migrations BEFORE restarting services
docker compose exec soulauth alembic upgrade head

# 3. Rolling restart (one service at a time)
docker compose up -d --no-deps soulauth
docker compose up -d --no-deps soulgate
docker compose up -d --no-deps soulwatch
docker compose up -d --no-deps portal

# 4. Verify all healthy
docker compose ps
```

### 6.2 Rollback Procedure

```bash
# 1. Stop the failing service
docker compose stop <service>

# 2. Rollback database if needed
docker compose exec soulauth alembic downgrade -1

# 3. Rebuild with previous image tag
docker compose build --build-arg VERSION=2.9.0

# 4. Restart
docker compose up -d <service>
```

---

## 7. Smoke Test Procedure

After every deployment or rebuild, run the smoke test:

```bash
# 1. Health endpoints
curl -sf http://localhost:8000/health || echo "FAIL: soulauth"
curl -sf http://localhost:3000/ || echo "FAIL: portal"

# 2. Auth flow
SOULKEY="<your-admin-soulkey>"
curl -sf http://localhost:8000/v1/auth/whoami \
  -H "Authorization: Bearer ${SOULKEY}" \
  -H "X-SoulKey: ${SOULKEY}" | python -m json.tool || echo "FAIL: auth"

# 3. Portal proxy (v1 routes should reach soulauth)
curl -sf http://localhost:3000/v1/auth/whoami \
  -H "Authorization: Bearer ${SOULKEY}" \
  -H "X-SoulKey: ${SOULKEY}" | python -m json.tool || echo "FAIL: portal proxy"

# 4. Metrics
curl -sf http://localhost:8000/metrics | head -5 || echo "FAIL: metrics"
```

All four checks must pass for the deployment to be considered healthy.
