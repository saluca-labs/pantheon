# Tiresias On-Premises Packaging Plan

**Version:** 1.0
**Date:** 2026-04-03
**Status:** Draft
**Author:** Saluca Labs Engineering

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Image Strategy](#2-image-strategy)
3. [Master Tenant Removal](#3-master-tenant-removal)
4. [License Activation Flow](#4-license-activation-flow)
5. [First-Run Setup Wizard](#5-first-run-setup-wizard)
6. [Packaging Formats](#6-packaging-formats)
7. [Configuration](#7-configuration)
8. [Update Mechanism](#8-update-mechanism)
9. [Data Persistence](#9-data-persistence)
10. [Telemetry and Support](#10-telemetry-and-support)
11. [Security Considerations](#11-security-considerations)
12. [Build Pipeline](#12-build-pipeline)
13. [Implementation Phases](#13-implementation-phases)
14. [Pricing Alignment](#14-pricing-alignment)

---

## 1. Executive Summary

Tiresias ships as a single codebase that powers both the SaaS platform (tiresias.network) and on-premises installations. The SaaS version runs as the master tenant with Stripe billing, multi-tenant provisioning, and partner management. The on-prem version is the same Docker image minus master-tenant privileges, activated by a license key.

**Target install experience:**

```bash
# Linux
curl -fsSL https://get.tiresias.network | bash
tiresias activate --license=XXXXX
tiresias start

# Windows
# Download tiresias-installer.exe, run it
# First-run UI: paste license key -> activate -> dashboard opens

# Docker (power users)
docker run -e TIRESIAS_LICENSE_KEY=XXXXX -p 8000:8000 -p 3000:3000 tiresias/tiresias:latest
```

---

## 2. Image Strategy

### 2.1 Current Architecture

The `docker-compose.yml` defines six services:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | `postgres:16-alpine` | 5432 | Shared database |
| `soulauth` | Custom (`Dockerfile`) | 8000 | Core identity/authz engine (FastAPI, uvicorn) |
| `soulgate` | Custom (`soulGate/Dockerfile`) | 8002 (internal) | API gateway, rate limiting, prompt injection detection |
| `soulwatch` | Custom (`soulWatch/Dockerfile`) | 8001 (internal) | Behavioral analytics sidecar, detection engine |
| `portal` | Custom (`portal/Dockerfile`) | 3000 | Next.js management dashboard |
| `prometheus` | `prom/prometheus:v2.51.0` | 9090 (internal) | Metrics collection |
| `alertmanager` | `prom/alertmanager:v0.27.0` | 9093 (internal) | Alert routing |

### 2.2 All-in-One Image Design

Build a single `tiresias/tiresias:latest` image that bundles all required services into one container. This is the primary distribution for on-prem.

**Base image:** `python:3.12-slim` with Node.js 20 added for the portal.

**Process manager:** Use **s6-overlay** (v3). Rationale:
- Designed for containers (unlike systemd)
- Proper PID 1 behavior with zombie reaping (unlike supervisord)
- Lightweight (~2MB), no Python/Ruby dependency
- Graceful shutdown propagation to all services
- Service dependency ordering (soulauth starts before soulgate/soulwatch/portal)
- Battle-tested in Alpine/s6-based images (linuxserver.io, etc.)

**Alternative considered:** `supervisord` is simpler to configure but does not handle PID 1 correctly without tini, and lacks native service dependency graphs. `tini+bash` is too primitive for 4+ services.

**Service layout inside the all-in-one image:**

```
/app/
  soulauth/          # FastAPI backend (copied from Dockerfile)
  soulgate/          # API gateway
  soulwatch/         # Analytics sidecar
  portal/            # Next.js standalone build
  s6/
    soulauth/run     # uvicorn src.main:app --host 0.0.0.0 --port 8000
    soulgate/run     # uvicorn soulGate.main:app --host 0.0.0.0 --port 8002
    soulwatch/run    # uvicorn soulWatch.main:app --host 0.0.0.0 --port 8001
    portal/run       # node server.js (port 3000)
    postgres/run     # (optional, see below)
```

### 2.3 Database Strategy

**Default: Embedded SQLite.** The existing `SOULAUTH_MODE=local` path in `config/settings.py` (lines 22-26, 287-313) already configures SQLite with aiosqlite. For on-prem, this becomes the default. The database file lives at a mounted volume path (`/data/tiresias.db`).

**Optional: External Postgres.** If `TIRESIAS_POSTGRES_URL` is set, the container starts in enterprise mode with Postgres. This is the recommended configuration for production on-prem with >50 agents.

**No embedded Postgres inside the all-in-one image.** Embedding Postgres adds 100MB+ and operational complexity. Instead, the Docker Compose variant (`docker-compose.onprem.yml`) includes a Postgres sidecar for customers who want it.

### 2.4 Mandatory vs Optional Services

| Service | All-in-One | Mandatory | Notes |
|---------|-----------|-----------|-------|
| soulauth | Yes | Yes | Core engine. Always runs. |
| portal | Yes | Yes | Dashboard + setup wizard. |
| soulgate | Yes | No | Start only if `TIRESIAS_GATEWAY_ENABLED=true`. Omitted for small deployments. |
| soulwatch | Yes | No | Start only if detection/analytics features are licensed (Pro+). |
| prometheus | No | No | Available via `docker-compose.onprem.yml` for monitoring add-on. |
| alertmanager | No | No | Same as above. |

### 2.5 All-in-One Dockerfile

```dockerfile
# ---- Stage 1: Python backend ----
FROM python:3.12-slim AS backend-builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt
COPY config/ config/
COPY src/ src/
COPY policies/ policies/
COPY alembic/ alembic/
COPY alembic.ini .
COPY soulGate/ soulGate/
COPY soulWatch/ soulWatch/

# ---- Stage 2: Portal ----
FROM node:20-alpine AS portal-builder
WORKDIR /app
COPY portal/package.json portal/package-lock.json ./
RUN npm ci
COPY portal/ .
ARG NEXT_PUBLIC_SOULAUTH_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_SOULAUTH_API_URL=$NEXT_PUBLIC_SOULAUTH_API_URL
RUN rm -rf .next && npm run build

# ---- Stage 3: Runtime ----
FROM python:3.12-slim AS runtime

# Install s6-overlay
ADD https://github.com/just-containers/s6-overlay/releases/download/v3.2.0.2/s6-overlay-noarch.tar.xz /tmp
ADD https://github.com/just-containers/s6-overlay/releases/download/v3.2.0.2/s6-overlay-x86_64.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz && \
    tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz && \
    rm /tmp/s6-overlay-*.tar.xz

# Install Node.js for portal
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Copy Python packages
COPY --from=backend-builder /install /usr/local
COPY --from=backend-builder /build /app

# Copy portal
COPY --from=portal-builder /app/public /app/portal/public
COPY --from=portal-builder /app/.next/standalone /app/portal
COPY --from=portal-builder /app/.next/static /app/portal/.next/static

# s6 service definitions
COPY docker/s6/soulauth /etc/s6-overlay/s6-rc.d/soulauth
COPY docker/s6/soulgate /etc/s6-overlay/s6-rc.d/soulgate
COPY docker/s6/soulwatch /etc/s6-overlay/s6-rc.d/soulwatch
COPY docker/s6/portal /etc/s6-overlay/s6-rc.d/portal

# Data volume
RUN mkdir -p /data && chown 1000:1000 /data
VOLUME /data

# Non-root user
RUN groupadd -r tiresias && useradd -r -g tiresias -u 1000 tiresias
USER tiresias

EXPOSE 8000 3000

ENTRYPOINT ["/init"]
```

### 2.6 Image Size Budget

| Component | Estimated Size |
|-----------|---------------|
| python:3.12-slim base | ~150MB |
| Python dependencies | ~200MB |
| Node.js runtime | ~60MB |
| Portal static build | ~30MB |
| s6-overlay | ~2MB |
| Application code | ~10MB |
| **Total** | **~450MB** |

Target: keep under 500MB compressed. The multi-service compose approach remains available for customers who prefer separate containers.

---

## 3. Master Tenant Removal

### 3.1 Current Behavior

The SaaS codebase includes master-tenant functionality via two routers registered in `src/main.py`:

- **`saas_router`** (`src/saas/router.py`) — SaaS-specific endpoints for tenant self-service
- **`saas_master_router`** (`src/saas/master.py`) — Master tenant endpoints for provisioning child tenants, managing the platform

The master router is gated by `saas_management` feature which requires the `saas` tier (see `feature_gate.py` line 48). The `bootstrap_local_admin` function in `src/auth/local_bootstrap.py` creates an admin user on first run if `SOULAUTH_LOCAL_ADMIN_EMAIL` and `SOULAUTH_LOCAL_ADMIN_PASSWORD` are set.

### 3.2 On-Prem Mode Changes

Introduce a new deployment mode flag: `TIRESIAS_DEPLOYMENT=onprem` (alternatives: `saas`, `dev`).

**What changes in on-prem mode:**

1. **Skip SaaS router registration.** In `src/main.py`, conditionally include `saas_router` and `saas_master_router` only when `TIRESIAS_DEPLOYMENT != "onprem"`:

```python
# In main.py, after settings = get_settings()
if settings.deployment_mode != "onprem":
    app.include_router(saas_router)
    app.include_router(saas_master_router)
```

2. **Skip Stripe billing endpoints.** The `billing_router` (`src/billing/router.py`) includes Stripe webhook handlers and checkout session creation. In on-prem mode, billing is handled by the license key, not Stripe. Conditionally exclude or replace with a stub that returns 404.

3. **Skip waitlist router.** The `waitlist_router` is SaaS-only.

4. **Skip trial router.** On-prem doesn't need self-service trials. The license key replaces the trial flow.

5. **No master tenant creation.** The lifespan function in `src/main.py` does not create a master tenant by default (it calls `bootstrap_local_admin` which creates a user, not a tenant). The `_ensure_default_tenant` in `src/database/local.py` creates a "local" tenant with tier "id". For on-prem, this is replaced by the setup wizard flow.

### 3.3 Router Registry for On-Prem

Create `src/routers.py` that returns the appropriate router list based on deployment mode:

```python
def get_routers(deployment_mode: str) -> list:
    """Return the router list for the current deployment mode."""
    # Core routers (always included)
    core = [
        auth_router, admin_router, local_auth_router,
        ldap_auth_router, oidc_router, metrics_router,
        analytics_router, enforcement_router, detection_router,
        investigation_router, siem_router, idp_router,
        notifications_router, usage_router, teams_router,
        aletheia_cot_router, aletheia_sanitize_router,
        aletheia_tool_evaluate_router, keys_router,
        mssp_router, prh_router, tenant_router,
        support_router, chatbot_router,
    ]

    if deployment_mode == "onprem":
        # On-prem: add setup wizard, exclude SaaS-only
        from src.setup.router import router as setup_router
        return core + [setup_router]

    # SaaS: include everything
    return core + [
        trial_router, trial_verify_router,
        waitlist_router, billing_router,
        saas_router, saas_master_router,
        partner_router, contracts_router,
    ]
```

### 3.4 Settings Addition

Add to `config/settings.py`:

```python
deployment_mode: str = Field(
    default="saas",
    description="Deployment mode: 'saas' (tiresias.network), 'onprem' (customer install), 'dev' (local development)",
    validation_alias="TIRESIAS_DEPLOYMENT",
)
```

---

## 4. License Activation Flow

### 4.1 Current Implementation

The license system is already mature:

- **Validator** (`src/license/validator.py`): Decodes HS256 JWTs, checks expiry, enforces grace period (default 72 hours). Returns `LicenseToken` with status (VALID/GRACE/INVALID/MISSING), tier, features, NFR flag.
- **Issuer** (`scripts/issue_license.py`): CLI tool to generate license JWTs signed with `TIRESIAS_LICENSE_SECRET`.
- **Relay** (`src/license/relay.py`): Phone-home to `https://license.tiresias.network/v1/relay/renew` on startup for non-NFR licenses. Refreshes expiry or marks as revoked (403). Failure is non-fatal.
- **Lifespan** (`src/main.py` lines 99-178): Validates license from env var, falls back to DB-stored license, checks relay, stores in `app.state.license`.
- **Feature gate** (`src/middleware/feature_gate.py`): Computes `effective_tier = min(install_tier, tenant_tier)` and returns HTTP 402 for unlicensed features.
- **Watchdog** (`src/license/watchdog.py`): Runs every 300s to detect runtime tier tampering.

### 4.2 On-Prem License Flow

#### First-run (no license in DB or env):

1. Container starts. Lifespan detects `LicenseStatus.MISSING`.
2. Since `license_required` defaults to `true`, the app would normally exit. **Change:** In on-prem mode, if no license is found, the app starts in **setup mode** instead of exiting. Only the `/health`, `/setup/*`, and static portal routes are available.
3. User opens `http://localhost:3000/setup` in browser.
4. User pastes license key into the setup wizard.
5. Backend validates the JWT via `LicenseValidator.validate()`.
6. On success: license JWT and decoded claims are persisted to `_soul_licenses` table (via `src/license/issuer.py`'s `persist_license` function, which already exists).
7. App restarts internal state (reloads `app.state.license`) without container restart.

#### Subsequent startups:

1. Lifespan checks `TIRESIAS_LICENSE_KEY` env var first (for Docker/env-based activation).
2. Falls back to DB-stored license (this path already exists, lines 112-138 of `main.py`).
3. Phone-home relay runs for non-NFR licenses (already implemented).
4. Normal operation begins.

#### License entered via CLI (headless):

```bash
tiresias activate --license=eyJhbGciOiJIUzI1NiJ9...
```

This writes the license to the local DB (or config file at `/data/tiresias/config.yaml`). The activate command validates the JWT locally before persisting.

### 4.3 Phone-Home Relay

The existing relay (`src/license/relay.py`) handles this well. Adjustments for on-prem:

| Behavior | Current | On-Prem Change |
|----------|---------|----------------|
| Frequency | Startup only | Startup + every 24 hours (background task) |
| Failure | Non-fatal, grace period | Same, but extend grace to 168 hours (7 days) for on-prem |
| Payload | tenant_id, tier, expiry | Add: device_fingerprint, agent_count, version |
| Response | New expiry, tier | Same + update_available flag |
| NFR skip | Yes | Same |

**Device fingerprint** (for license sharing prevention): SHA-256 of `(machine-id + hostname + MAC address)`. Generated on first run, stored in `/data/tiresias/device.id`. The relay server tracks fingerprints per license. If a license is used on more than N devices (configurable per tier, default 1 for Starter, 3 for Enterprise), the relay returns 409 and the license enters grace period.

### 4.4 Offline / Air-Gapped Mode

For air-gapped deployments (common in defense, healthcare, classified environments):

1. **License JWT includes `offline_days` claim.** Default: 0 (phone-home required). Air-gap licenses are issued with `offline_days: 90` (or 365 for annual contracts).
2. **Validator checks:** If `offline_days > 0`, skip relay entirely. License is valid as long as `now < exp` or within grace period.
3. **No telemetry, no update checks.** The container is fully self-contained.
4. **License renewal:** Customer receives a new JWT (via email, USB, etc.) and enters it via the portal settings page or CLI: `tiresias activate --license=NEW_JWT`.
5. **Issue command extension:**

```bash
python3 scripts/issue_license.py issue \
  --tenant acme-corp \
  --tier enterprise \
  --expires 2027-04-03 \
  --offline-days 365 \
  --secret $TIRESIAS_LICENSE_SECRET
```

This adds `"offline_days": 365` to the JWT claims. The validator skips relay when this claim is present and positive.

---

## 5. First-Run Setup Wizard

### 5.1 Portal Route: `/setup`

A new page in the Next.js portal at `portal/src/app/setup/page.tsx`. This page is only accessible when no tenant exists in the database (i.e., the `_soul_tenants` table is empty or contains only the placeholder "local" tenant).

### 5.2 Setup Flow

**Step 1: License Activation**
- Input field for license key (JWT string)
- "Activate" button sends `POST /v1/setup/activate` with `{ "license_key": "..." }`
- Backend validates JWT, returns tier info and feature list
- Display: "License valid. Tier: Enterprise. Expires: 2027-04-03."

**Step 2: Admin Account Creation**
- Fields: email, password, confirm password, full name
- Password requirements: 12+ chars, complexity check
- Sends `POST /v1/setup/admin` with credentials
- Backend creates the admin user with role `tenant_admin`

**Step 3: Tenant Configuration**
- Fields: organization name, slug (auto-generated from name, editable)
- Optional: timezone, notification email
- Sends `POST /v1/setup/tenant` with org details
- Backend creates tenant in `_soul_tenants` with the license tier

**Step 4: Completion**
- Generates initial SoulKey for the admin
- Displays the SoulKey (shown once, with copy button)
- "Go to Dashboard" button redirects to `/dashboard`
- Marks setup as complete (writes `setup_complete=true` to a config row in DB)

### 5.3 Backend: `/v1/setup/*` Router

New file: `src/setup/router.py`

```python
router = APIRouter(prefix="/v1/setup", tags=["Setup"])

@router.get("/status")
async def setup_status():
    """Returns whether setup has been completed."""
    # Check if any non-placeholder tenant exists
    return {"setup_complete": bool, "version": settings.app_version}

@router.post("/activate")
async def activate_license(body: ActivateLicenseRequest):
    """Validate and store a license key."""
    # 1. Validate JWT
    # 2. Persist to _soul_licenses
    # 3. Update app.state.license
    # 4. Return tier info

@router.post("/admin")
async def create_admin(body: CreateAdminRequest):
    """Create the initial admin account."""
    # Only works if setup is not complete
    # Creates user with tenant_admin role

@router.post("/tenant")
async def create_tenant(body: CreateTenantRequest):
    """Create the customer's tenant."""
    # Only works if setup is not complete
    # Creates tenant, initial SoulKey
    # Marks setup as complete

@router.post("/finalize")
async def finalize_setup():
    """Lock setup and transition to normal operation."""
    # Writes setup_complete flag
    # Returns initial SoulKey
```

### 5.4 Setup Lock

After setup completes, the `/v1/setup/*` endpoints return HTTP 403 with `{"error": "setup_already_complete"}`. The setup page in the portal redirects to `/dashboard` if setup is complete.

Implementation: A `_soul_config` table (or a row in `_soul_tenants` metadata) stores `setup_complete_at` timestamp. All setup endpoints check this before proceeding.

### 5.5 Portal Middleware

In the portal's Next.js middleware (`portal/src/middleware.ts`), add a check:

```typescript
// If setup is not complete, redirect ALL routes to /setup
// except /setup itself, /api/*, and static assets
if (!setupComplete && !pathname.startsWith('/setup')) {
  return NextResponse.redirect(new URL('/setup', request.url))
}
```

The portal fetches `/v1/setup/status` on initial load and caches the result.

---

## 6. Packaging Formats

### 6.1 Docker Hub: `tiresias/tiresias:latest`

**Image tags:**
- `tiresias/tiresias:latest` — latest stable
- `tiresias/tiresias:3.4.4` — specific version
- `tiresias/tiresias:3.4` — minor version (floats to latest patch)
- `tiresias/tiresias:3` — major version

**Usage:**

```bash
docker run -d \
  --name tiresias \
  -p 8000:8000 \
  -p 3000:3000 \
  -v tiresias-data:/data \
  -e TIRESIAS_LICENSE_KEY=eyJhbGciOiJIUzI1NiJ9... \
  tiresias/tiresias:latest
```

SQLite database, keys, and config are persisted to `/data` volume.

### 6.2 Docker Compose: Multi-Service with Postgres

File: `docker-compose.onprem.yml` (distributed alongside the image)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: tiresias
      POSTGRES_PASSWORD: ${TIRESIAS_DB_PASSWORD:-changeme}
      POSTGRES_DB: tiresias
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tiresias"]
      interval: 5s
      timeout: 3s
      retries: 10

  tiresias:
    image: tiresias/tiresias:latest
    ports:
      - "8000:8000"
      - "3000:3000"
    environment:
      TIRESIAS_LICENSE_KEY: ${TIRESIAS_LICENSE_KEY}
      TIRESIAS_DEPLOYMENT: onprem
      TIRESIAS_POSTGRES_URL: postgresql+asyncpg://tiresias:${TIRESIAS_DB_PASSWORD:-changeme}@postgres:5432/tiresias
      TIRESIAS_GATEWAY_ENABLED: "true"
    volumes:
      - tiresias-data:/data
    depends_on:
      postgres:
        condition: service_healthy

  prometheus:
    image: prom/prometheus:v2.51.0
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    profiles:
      - monitoring

volumes:
  pgdata:
  tiresias-data:
```

### 6.3 Linux Installer Script

**URL:** `https://get.tiresias.network`

The script:

1. Detects OS (Ubuntu/Debian, RHEL/CentOS, Fedora, Alpine)
2. Checks for Docker. If missing, installs Docker CE via official script
3. Pulls `tiresias/tiresias:latest`
4. Creates `/etc/tiresias/` config directory and `/var/lib/tiresias/` data directory
5. Writes `/etc/tiresias/config.yaml` with placeholder license key
6. Creates systemd service file at `/etc/systemd/system/tiresias.service`
7. Enables and starts the service
8. Prints the URL to access the setup wizard

```bash
#!/bin/bash
set -euo pipefail

TIRESIAS_VERSION="${TIRESIAS_VERSION:-latest}"
DATA_DIR="/var/lib/tiresias"
CONFIG_DIR="/etc/tiresias"

echo "=== Tiresias On-Premises Installer ==="

# 1. Check/install Docker
if ! command -v docker &>/dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi

# 2. Pull image
echo "Pulling tiresias/tiresias:${TIRESIAS_VERSION}..."
docker pull tiresias/tiresias:${TIRESIAS_VERSION}

# 3. Create directories
mkdir -p ${DATA_DIR} ${CONFIG_DIR}

# 4. Write systemd service
cat > /etc/systemd/system/tiresias.service <<EOF
[Unit]
Description=Tiresias Agent Identity Platform
After=docker.service
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
ExecStartPre=-/usr/bin/docker stop tiresias
ExecStartPre=-/usr/bin/docker rm tiresias
ExecStart=/usr/bin/docker run --rm \
    --name tiresias \
    -p 8000:8000 \
    -p 3000:3000 \
    -v ${DATA_DIR}:/data \
    --env-file ${CONFIG_DIR}/tiresias.env \
    tiresias/tiresias:${TIRESIAS_VERSION}
ExecStop=/usr/bin/docker stop tiresias

[Install]
WantedBy=multi-user.target
EOF

# 5. Create env file
cat > ${CONFIG_DIR}/tiresias.env <<EOF
TIRESIAS_DEPLOYMENT=onprem
TIRESIAS_LICENSE_KEY=
EOF

# 6. Start
systemctl daemon-reload
systemctl enable tiresias

echo ""
echo "=== Tiresias installed ==="
echo ""
echo "Next steps:"
echo "  1. Add your license key to ${CONFIG_DIR}/tiresias.env"
echo "  2. sudo systemctl start tiresias"
echo "  3. Open http://localhost:3000/setup in your browser"
echo ""
echo "Or activate directly:"
echo "  tiresias activate --license=YOUR_LICENSE_KEY"
echo "  sudo systemctl start tiresias"
```

### 6.4 Windows Installer

**Approach:** NSIS-based `.exe` installer (not MSI; NSIS is simpler for Docker-dependent apps).

**Dependency:** Docker Desktop for Windows. The installer checks for Docker Desktop and offers to download it if missing.

**Alternative for native Windows (no Docker):** Package as a standalone Python + Node.js bundle using PyInstaller for the backend and the portal standalone build. This is a Phase 4 stretch goal. For Phase 4, Docker Desktop is the requirement.

**Installer flow:**

1. Check for Docker Desktop. If missing: download and install, prompt for restart.
2. Pull `tiresias/tiresias:latest`
3. Create `C:\ProgramData\Tiresias\` for data
4. Create `C:\Program Files\Tiresias\` with CLI wrapper (`tiresias.bat`)
5. Add to PATH
6. Create Start Menu shortcut that opens `http://localhost:3000`
7. Register as a Windows Service (using `nssm` or `docker compose` with restart policy)
8. First-run: open browser to `http://localhost:3000/setup`

**CLI wrapper (`tiresias.bat`):**

```batch
@echo off
docker exec tiresias python -m src.cli %*
```

### 6.5 Helm Chart

**Chart name:** `tiresias/tiresias`
**Repository:** `https://charts.tiresias.network`

```yaml
# values.yaml
replicaCount: 1

image:
  repository: tiresias/tiresias
  tag: latest
  pullPolicy: IfNotPresent

license:
  key: ""                    # Required
  secretName: ""             # Alternative: reference existing K8s secret

deployment: onprem

database:
  type: sqlite               # sqlite or postgres
  postgres:
    host: ""
    port: 5432
    database: tiresias
    existingSecret: ""       # K8s secret with username/password

persistence:
  enabled: true
  size: 10Gi
  storageClass: ""

service:
  type: ClusterIP
  apiPort: 8000
  portalPort: 3000

ingress:
  enabled: false
  className: nginx
  hosts:
    - host: tiresias.example.com
      paths:
        - path: /
          pathType: Prefix
```

The chart includes:
- Deployment with the all-in-one image
- PersistentVolumeClaim for `/data`
- Service (ClusterIP by default)
- Optional Ingress
- Optional PostgreSQL subchart (Bitnami)
- ConfigMap for non-secret configuration
- Secret for license key
- ServiceAccount with minimal RBAC

### 6.6 APT/YUM Repository (Stretch Goal)

**Deferred to Phase 6.** These would be thin wrapper packages that:
- Depend on `docker-ce`
- Install the systemd service file
- Install the `tiresias` CLI wrapper
- Pull the Docker image on install

---

## 7. Configuration

### 7.1 Configuration Hierarchy (Precedence Order)

1. **Environment variables** (highest precedence) — `TIRESIAS_*` prefix
2. **Config file** — `/data/tiresias/config.yaml` (container) or `/etc/tiresias/config.yaml` (host)
3. **Setup wizard values** (stored in DB)
4. **Built-in defaults** (lowest precedence)

### 7.2 Minimal Configuration

Only one value is required: the license key.

```yaml
# /etc/tiresias/config.yaml (minimal)
license_key: "eyJhbGciOiJIUzI1NiJ9..."
```

Everything else has sensible defaults:
- Database: SQLite at `/data/tiresias.db`
- Ports: 8000 (API), 3000 (portal)
- Auth mode: local (email/password)

### 7.3 Full Configuration Reference

```yaml
# Tiresias On-Premises Configuration
# All values can be overridden with TIRESIAS_* environment variables

# License (required)
license_key: ""

# Deployment
deployment: onprem                  # onprem | saas | dev

# Database
database:
  type: sqlite                      # sqlite | postgres
  sqlite_path: /data/tiresias.db
  postgres_url: ""                  # postgresql+asyncpg://user:pass@host:5432/db

# Server
server:
  host: 0.0.0.0
  api_port: 8000
  portal_port: 3000
  debug: false

# Authentication
auth:
  mode: local                       # local | ldap | oidc | local,ldap
  local_admin_email: ""             # Bootstrap admin (first run only)
  local_admin_password: ""          # Bootstrap admin (first run only)

# LDAP (optional)
ldap:
  url: ""                           # ldap://dc.example.com:389
  bind_dn: ""
  bind_password: ""
  search_base: ""
  user_filter: "(sAMAccountName={username})"
  group_role_map: {}

# OIDC / SSO (optional)
oidc:
  enabled: false
  # Configured via portal UI after setup

# Email / SMTP (optional)
smtp:
  host: ""
  port: 587
  user: ""
  password: ""
  from_address: ""

# SIEM Integration (optional, requires Pro+)
siem:
  enabled: false
  destinations: []                  # Array of {type, url, ...} objects

# Detection Engine (optional, requires Pro+)
detection:
  enabled: true
  rules_dir: /data/tiresias/rules
  playbooks_dir: /data/tiresias/playbooks

# Telemetry
telemetry:
  enabled: true                     # Anonymous usage stats
  phone_home: true                  # License relay

# Gateway (optional)
gateway:
  enabled: false                    # Enable SoulGate API gateway

# Analytics sidecar (optional, auto-enabled for Pro+)
analytics:
  enabled: auto                     # auto | true | false
```

### 7.4 Environment Variable Mapping

All YAML keys map to environment variables with `TIRESIAS_` prefix and underscore nesting:

| YAML Path | Environment Variable |
|-----------|---------------------|
| `license_key` | `TIRESIAS_LICENSE_KEY` |
| `database.type` | `TIRESIAS_DATABASE_TYPE` |
| `database.postgres_url` | `TIRESIAS_POSTGRES_URL` |
| `auth.mode` | `TIRESIAS_AUTH_MODE` |
| `ldap.url` | `TIRESIAS_LDAP_URL` |

The existing `SOULAUTH_*` prefix (from `config/settings.py` line 263: `env_prefix = "SOULAUTH_"`) continues to work for backward compatibility. The new `TIRESIAS_*` prefix takes precedence. A mapping layer in settings translates between the two.

---

## 8. Update Mechanism

### 8.1 Docker-Based Updates

```bash
# Pull new version
docker pull tiresias/tiresias:latest

# Restart (systemd-managed)
sudo systemctl restart tiresias

# Or manual
docker stop tiresias && docker rm tiresias
docker run -d ... tiresias/tiresias:latest
```

### 8.2 Automatic Update Check

On startup, the phone-home relay already contacts `license.tiresias.network`. Extend the relay response to include:

```json
{
  "expires_at": 1744243200,
  "tier": "enterprise",
  "update_available": true,
  "latest_version": "3.5.0",
  "release_notes_url": "https://tiresias.network/releases/3.5.0",
  "security_update": false
}
```

The portal dashboard displays an update banner when `update_available` is true. Security updates show a red warning banner.

### 8.3 Database Migrations

Migrations run automatically on startup. The lifespan function in `main.py` calls `init_db()` which creates tables. For schema changes, Alembic migrations (already present in `alembic/`) run before the app starts.

**Add to the all-in-one entrypoint** (s6 soulauth `run` script):

```bash
#!/bin/bash
cd /app
# Run migrations before starting the app
python -m alembic upgrade head 2>&1 || echo "Migration warning (non-fatal for SQLite)"
exec uvicorn src.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 8.4 Rollback

```bash
# Roll back to previous version
docker run -d ... tiresias/tiresias:3.4.3

# Database rollback (if needed)
docker exec tiresias python -m alembic downgrade -1
```

The installer script keeps the previous image tag in `/etc/tiresias/previous_version` for easy rollback.

---

## 9. Data Persistence

### 9.1 Data Directory Layout

```
/data/
  tiresias.db              # SQLite database (default mode)
  keys/
    private.pem            # ES256 signing key (generated on first run)
    public.pem             # ES256 verification key
  config.yaml              # Runtime config (license, settings overrides)
  device.id                # Device fingerprint for license binding
  rules/                   # Custom Sigma detection rules
  playbooks/               # Custom response playbooks
  backups/                 # Automatic pre-upgrade backups
```

### 9.2 Encryption Keys

- Generated on first run by `_generate_keypair_if_missing()` in `src/database/local.py` (lines 176-198).
- ES256 (ECDSA P-256) keypair for JWT signing.
- Private key stored with mode 0600.
- **Never transmitted** to Tiresias servers. The phone-home relay sends only license and usage data, never keys.

### 9.3 Backup and Restore

**Backup CLI:**

```bash
tiresias backup
# Creates: /data/backups/tiresias-backup-2026-04-03T17-00-00.tar.gz
# Contains: tiresias.db, keys/, config.yaml

tiresias backup --output /mnt/nfs/tiresias-backup.tar.gz
```

**Restore CLI:**

```bash
tiresias restore /data/backups/tiresias-backup-2026-04-03T17-00-00.tar.gz
# Stops services, restores DB + keys, restarts
```

**Implementation:** New CLI commands in `src/cli.py`:

```python
@cli.command("backup")
@click.option("--output", default=None, help="Output path for backup archive")
def backup(output):
    """Create a backup of the Tiresias database, keys, and config."""
    # tar.gz of /data directory (excluding backups/ to avoid recursion)

@cli.command("restore")
@click.argument("archive")
def restore(archive):
    """Restore Tiresias from a backup archive."""
    # Validate archive, extract, overwrite /data contents
```

### 9.4 Postgres Mode Persistence

When using Postgres (`TIRESIAS_POSTGRES_URL` set):
- Database is managed by the customer's Postgres instance
- Keys are still stored locally at `/data/keys/`
- Config is still at `/data/config.yaml`
- Backup command exports Postgres via `pg_dump` + local key files

---

## 10. Telemetry and Support

### 10.1 Anonymous Usage Telemetry

**Opt-in by default.** The setup wizard includes a checkbox: "Send anonymous usage statistics to help improve Tiresias" (checked by default). Customers can disable via config:

```yaml
telemetry:
  enabled: false
```

**What is collected (anonymized):**

| Field | Example | Purpose |
|-------|---------|---------|
| `install_id` | SHA-256 hash | Unique install (not device fingerprint) |
| `version` | `3.4.4` | Version distribution |
| `tier` | `enterprise` | Tier distribution |
| `agent_count` | `47` | Usage patterns |
| `feature_usage` | `["analytics", "siem"]` | Feature adoption |
| `os` | `linux/amd64` | Platform support priorities |
| `db_type` | `sqlite` | Infrastructure patterns |
| `uptime_hours` | `720` | Stability metrics |

**What is never collected:**
- Agent names, persona IDs, or SoulKeys
- Audit log contents
- Policy definitions
- Customer data of any kind
- IP addresses (telemetry endpoint strips client IP)

**Transport:** Piggybacked on the license relay request. No separate telemetry endpoint needed.

### 10.2 Support Bundle

```bash
tiresias diagnostics
# Generates: tiresias-diagnostics-2026-04-03.tar.gz
```

**Contents:**

- System info (OS, CPU, RAM, disk, Docker version)
- Tiresias version and config (secrets redacted)
- License status (tier, expiry, relay status; NOT the JWT itself)
- Service health check results
- Last 1000 log lines (secrets auto-scrubbed)
- Database stats (table sizes, row counts; NOT row contents)
- Network connectivity test (can reach license.tiresias.network?)
- Docker container stats

**Implementation:** New CLI command that collects the above into a tar.gz, with a prominent message: "This bundle does NOT contain customer data, secrets, or audit logs."

### 10.3 Crash Reporting

**Not included in initial release.** Sentry or similar can be added later as opt-in. For now, the diagnostics bundle and structured logs provide sufficient troubleshooting data.

---

## 11. Security Considerations

### 11.1 License Tamper Detection

**Already implemented:**
- JWT signature verification via HMAC-SHA256 (`src/license/validator.py` lines 107-118)
- Tier fingerprint at startup (`main.py` lines 174-178) — SHA-256 of license key + tier env var
- Runtime watchdog every 300s (`src/license/watchdog.py`) — detects `app.state.license` mutation

**Additional for on-prem:**
- Environment variable hash comparison on each relay check
- If `TIRESIAS_LICENSE_KEY` env var changes at runtime (e.g., via Docker exec), the watchdog detects the mismatch and forces re-validation

### 11.2 Tier Upgrade Prevention

License tier is encoded in the JWT and signed. Cannot be changed without:
1. The `TIRESIAS_LICENSE_SECRET` (never distributed to customers)
2. Issuing a new JWT via `scripts/issue_license.py`

The feature gate middleware (`src/middleware/feature_gate.py`) enforces tier access on every request. Even if a customer modifies `app.state.license.tier` in memory, the watchdog detects the change within 300s and reverts to the JWT-validated tier.

### 11.3 License Sharing Prevention

**Device fingerprint** (new):
- Generated on first activation: `SHA-256(machine-id + hostname + primary-MAC)`
- Stored locally in `/data/device.id`
- Sent with every relay check
- Server tracks fingerprints per license key
- Limits:
  - Community/Starter: 1 device
  - Pro: 3 devices
  - Enterprise: 10 devices (for staging/DR)
  - MSSP: 50 devices

Exceeding the device limit triggers a warning on relay check. After 7 days, the license enters grace period. After grace expiry, the license becomes INVALID.

### 11.4 Air-Gap Security

- License JWT includes `offline_days` claim (see section 4.4)
- No network egress required when `offline_days > 0`
- License expiry is the only enforcement mechanism (no relay)
- Renewal: customer contacts sales, receives new JWT, enters via CLI or portal

### 11.5 Encryption at Rest

- SQLite database: not encrypted by default. **Phase 6 stretch goal:** support SQLCipher for encrypted-at-rest SQLite. Customer provides the encryption passphrase via `TIRESIAS_DB_PASSPHRASE`.
- Postgres: encryption at rest is the customer's responsibility (standard Postgres TDE or disk encryption)
- JWT signing keys: stored with filesystem permissions (0600). Not encrypted at rest unless the customer uses full-disk encryption.

### 11.6 Network Security

- The all-in-one container binds API (8000) and portal (3000) to `0.0.0.0` by default
- SoulGate (8002) and SoulWatch (8001) are internal-only (not exposed)
- TLS termination is the customer's responsibility (reverse proxy: nginx, Caddy, Traefik)
- The installer documentation includes an nginx TLS configuration example

---

## 12. Build Pipeline

### 12.1 CI Job: Build All-in-One Image

**Trigger:** Tag push matching `v*` (e.g., `v3.5.0`)

```yaml
# .github/workflows/release-onprem.yml
name: Release On-Prem Image
on:
  push:
    tags: ["v*"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile.onprem
          push: true
          tags: |
            tiresias/tiresias:latest
            tiresias/tiresias:${{ github.ref_name }}
          platforms: linux/amd64,linux/arm64
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 12.2 Multi-Architecture Support

Build for both `linux/amd64` and `linux/arm64` (Apple Silicon, AWS Graviton, Raspberry Pi). The Node.js and Python base images both support ARM64 natively.

### 12.3 SaaS-Only Code Stripping

Rather than maintaining two codebases, the on-prem image includes all code but gates it at runtime:

- SaaS master router: not registered (see section 3.2)
- Stripe billing endpoints: return 404 in on-prem mode
- Waitlist/trial: not registered
- Partner revenue share: not registered

**No build-time stripping.** The code is ~10KB total for these routers. The runtime gating approach is simpler, avoids divergent builds, and means the same image can theoretically run in SaaS mode with the right environment variables (useful for testing).

### 12.4 Image Signing

Sign published images with cosign (Sigstore):

```bash
cosign sign --key cosign.key tiresias/tiresias:3.5.0
```

Customers can verify:

```bash
cosign verify --key tiresias-cosign.pub tiresias/tiresias:3.5.0
```

Public key published at `https://tiresias.network/.well-known/cosign.pub`.

### 12.5 SBOM Generation

Generate Software Bill of Materials (SBOM) with each release:

```bash
syft tiresias/tiresias:3.5.0 -o spdx-json > sbom.spdx.json
```

Published alongside the image for enterprise compliance requirements.

---

## 13. Implementation Phases

### Phase 1: All-in-One Docker Image + Env-Based Activation (3 days)

**Deliverables:**
1. `Dockerfile.onprem` — multi-stage build combining soulauth + portal + soulgate + soulwatch
2. s6-overlay service definitions for all four processes
3. `TIRESIAS_DEPLOYMENT=onprem` mode flag in `config/settings.py`
4. Conditional router registration in `src/main.py` (exclude SaaS-only routers)
5. On-prem lifespan behavior: start in setup mode when no license, instead of `SystemExit(2)`
6. Docker volume mount at `/data` with SQLite default
7. Smoke test: `docker run -e TIRESIAS_LICENSE_KEY=... tiresias/tiresias:latest` boots and serves health endpoint

**Files modified:**
- `config/settings.py` — add `deployment_mode` field
- `src/main.py` — conditional router registration, setup-mode lifespan branch
- New: `Dockerfile.onprem`
- New: `docker/s6/soulauth/run`, `docker/s6/portal/run`, etc.

**Exit criteria:** All-in-one image boots, accepts license via env var, portal loads, API serves requests.

---

### Phase 2: First-Run Setup Wizard (3 days)

**Deliverables:**
1. `src/setup/router.py` — `/v1/setup/status`, `/v1/setup/activate`, `/v1/setup/admin`, `/v1/setup/tenant`, `/v1/setup/finalize`
2. `portal/src/app/setup/page.tsx` — multi-step setup wizard UI
3. Portal middleware to redirect to `/setup` when setup is incomplete
4. `_soul_config` table (or metadata column) for `setup_complete_at`
5. License persistence to `_soul_licenses` table via setup flow
6. Runtime license reload without container restart

**Files modified:**
- New: `src/setup/router.py`, `src/setup/models.py`
- New: `portal/src/app/setup/page.tsx`, `portal/src/app/setup/layout.tsx`
- `portal/src/middleware.ts` — setup redirect logic
- `src/main.py` — register setup router
- `src/database/local_schema.py` — add `_soul_config` table

**Exit criteria:** Fresh container boot shows setup wizard. Complete wizard flow: license, admin, tenant, first SoulKey. Dashboard loads after setup.

---

### Phase 3: Linux Installer + CLI Enhancements (2 days)

**Deliverables:**
1. `scripts/install.sh` — the `curl | bash` installer
2. Hosted at `https://get.tiresias.network` (CDN/static hosting)
3. systemd service file generation
4. `tiresias activate --license=XXX` CLI command
5. `tiresias backup` and `tiresias restore` CLI commands
6. `tiresias diagnostics` support bundle generator
7. `tiresias update` command (pulls latest image, restarts service)

**Files modified:**
- New: `scripts/install.sh`
- `src/cli.py` — add `activate`, `backup`, `restore`, `diagnostics`, `update` commands

**Exit criteria:** Clean Ubuntu 22.04 VM, run `curl -fsSL https://get.tiresias.network | bash`, paste license, Tiresias running behind systemd.

---

### Phase 4: Windows Installer (3 days)

**Deliverables:**
1. NSIS installer script (`installer/windows/tiresias.nsi`)
2. Docker Desktop detection and download prompt
3. `tiresias.bat` CLI wrapper
4. Windows Service registration via nssm
5. Start Menu shortcut
6. Uninstaller
7. Code signing certificate for the `.exe`

**Files modified:**
- New: `installer/windows/tiresias.nsi`
- New: `installer/windows/tiresias.bat`
- New: `installer/windows/tiresias.ico`

**Exit criteria:** Download `.exe`, install on Windows 11, Docker Desktop pulls image, setup wizard opens in browser.

---

### Phase 5: Helm Chart + K8s Guide (3 days)

**Deliverables:**
1. Helm chart at `charts/tiresias/`
2. `values.yaml` with all configuration options
3. Templates: Deployment, Service, Ingress, PVC, ConfigMap, Secret, ServiceAccount
4. Optional PostgreSQL subchart dependency (Bitnami)
5. Helm chart tests (`helm test`)
6. Chart published to `https://charts.tiresias.network`
7. Installation guide for EKS, GKE, AKS, and bare-metal K8s

**Files created:**
- `charts/tiresias/Chart.yaml`
- `charts/tiresias/values.yaml`
- `charts/tiresias/templates/*.yaml`
- `charts/tiresias/README.md`

**Exit criteria:** `helm install tiresias tiresias/tiresias --set license.key=XXX` works on a fresh K8s cluster. Portal accessible via Ingress.

---

### Phase 6: APT/YUM + Auto-Updates + Stretch Goals (ongoing)

**Deliverables (stretch):**
1. APT repository at `https://apt.tiresias.network`
2. YUM repository at `https://rpm.tiresias.network`
3. Auto-update daemon (checks daily, applies on configurable schedule)
4. SQLCipher support for encrypted SQLite
5. Native Windows build (no Docker dependency) using PyInstaller
6. `tiresias doctor` command for self-diagnosis
7. Offline installer bundle (Docker image + installer in single `.tar.gz`)

---

## 14. Pricing Alignment

### 14.1 Tier Matrix

| Tier | Price | License Required | Agent Limit | Key Features |
|------|-------|-----------------|-------------|--------------|
| **Community** | Free | No | 25 | Identity resolution, PDP evaluation, local auth, SQLite |
| **Starter** | $49/mo | Yes | 50 | + Team management, billing dashboard, email support |
| **Pro** | $199/mo | Yes | 250 | + Analytics, detection rules, delegation, SIEM, investigation |
| **Enterprise** | $2,499/mo | Yes | Unlimited | + Enforcement, multi-tenant, audit export, custom detection, LDAP/OIDC, SLA |
| **MSSP** | Custom | Yes | Unlimited | + Partner channels, child tenant provisioning, white-label |

### 14.2 Community Tier (No License)

When no license key is provided and `license_required=false`:
- The system runs in Community tier
- 25 agent limit enforced by `src/usage/limits.py` (`TIER_LIMITS["community"]`)
- Core features only (auth, identity, basic admin)
- No phone-home, no telemetry
- Portal shows "Community Edition" badge with upgrade CTA

This enables a frictionless try-before-you-buy experience:

```bash
docker run -p 8000:8000 -p 3000:3000 tiresias/tiresias:latest
# No license needed. Setup wizard skips license step.
# Community tier with 25 agents. Upgrade whenever ready.
```

### 14.3 License Issuance

Licenses are issued via the existing `scripts/issue_license.py`:

```bash
# Generate HMAC secret (one-time)
python3 scripts/issue_license.py keygen

# Issue a license
python3 scripts/issue_license.py issue \
  --tenant acme-corp \
  --tier enterprise \
  --expires 2027-04-03 \
  --secret $TIRESIAS_LICENSE_SECRET

# Issue air-gap license
python3 scripts/issue_license.py issue \
  --tenant dod-project \
  --tier enterprise \
  --expires 2027-04-03 \
  --offline-days 365 \
  --secret $TIRESIAS_LICENSE_SECRET
```

**Enhancement needed:** Add `--offline-days` and `--max-devices` flags to the issuer script. Add a `--partner-id` flag for MSSP licenses. Add a web-based license management portal at `https://license.tiresias.network/admin` (internal tool, not customer-facing).

### 14.4 License Key Format

The license key is a standard JWT (3 dot-separated base64url segments). Customers paste it as a single string. For convenience, the activation UI also accepts:
- Raw JWT: `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOi...`
- Base64-wrapped: `ZXlKaGJHY2lPaUpJVXpJMU5pSjkuZXlK...`
- With or without whitespace/newlines

The validator trims whitespace and detects base64 wrapping automatically.

---

## Appendix A: File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `config/settings.py` | Modify | Add `deployment_mode` field |
| `src/main.py` | Modify | Conditional router registration, setup-mode lifespan |
| `src/setup/router.py` | Create | Setup wizard API endpoints |
| `src/setup/models.py` | Create | Pydantic models for setup requests |
| `src/cli.py` | Modify | Add `activate`, `backup`, `restore`, `diagnostics`, `update` |
| `src/license/relay.py` | Modify | Add device fingerprint, periodic relay, update_available |
| `src/license/validator.py` | Modify | Support `offline_days` claim |
| `src/database/local_schema.py` | Modify | Add `_soul_config` table |
| `scripts/issue_license.py` | Modify | Add `--offline-days`, `--max-devices` flags |
| `Dockerfile.onprem` | Create | All-in-one multi-service image |
| `docker-compose.onprem.yml` | Create | Multi-service with Postgres |
| `docker/s6/*/run` | Create | s6 service scripts |
| `scripts/install.sh` | Create | Linux installer |
| `installer/windows/tiresias.nsi` | Create | Windows NSIS installer |
| `charts/tiresias/*` | Create | Helm chart |
| `portal/src/app/setup/*` | Create | Setup wizard UI |
| `portal/src/middleware.ts` | Modify | Setup redirect logic |

## Appendix B: Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| All-in-one image too large (>1GB) | Slow download, disk usage | Aggressive multi-stage build, .dockerignore, alpine base for Node |
| SQLite performance at scale (>100 agents) | Slow queries, lock contention | Document Postgres recommendation for >50 agents; WAL mode by default |
| License key leaked by customer | Unauthorized usage | Device fingerprint binding, relay-based revocation |
| Air-gap licenses shared across orgs | Revenue loss | Device fingerprint baked into JWT at issuance time (future enhancement) |
| Windows Docker Desktop licensing | Enterprise customers need Docker Business license | Document requirement; long-term: native Windows build (Phase 6) |
| s6-overlay complexity | Debugging difficulty | Extensive logging in run scripts; `tiresias diagnostics` captures s6 state |
| Customer cannot reach license server | License enters grace period | 7-day grace for on-prem (extended from 72h); clear error messages |
