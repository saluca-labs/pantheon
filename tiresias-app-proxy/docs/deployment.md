# Tiresias App Proxy -- Deployment Guide

**Version:** 0.1.0
**Last updated:** 2026-04-05
**Audience:** Infrastructure engineers, DevOps teams, site reliability engineers

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Docker Deployment](#2-docker-deployment)
3. [Kubernetes Deployment](#3-kubernetes-deployment)
4. [Environment Variables](#4-environment-variables)
5. [Database Configuration](#5-database-configuration)
6. [TLS and HTTPS](#6-tls-and-https)
7. [Monitoring](#7-monitoring)
8. [Backup and Disaster Recovery](#8-backup-and-disaster-recovery)
9. [Upgrading](#9-upgrading)
10. [Air-Gapped and On-Premises Deployment](#10-air-gapped-and-on-premises-deployment)

---

## 1. Prerequisites

| Requirement         | Minimum Version | Notes                                          |
|---------------------|-----------------|-------------------------------------------------|
| Python              | 3.12+           | 3.11 supported but 3.12 is the build target     |
| Docker              | 24.0+           | Required for container deployment                |
| Docker Compose      | 2.20+           | Required for multi-service local deployment      |
| PostgreSQL          | 15+             | Production database (SQLite for development)     |
| Kubernetes          | 1.28+           | Optional; required for Helm-based deployment     |
| Helm                | 3.14+           | Optional; for Kubernetes chart installation      |

**Python dependencies** (installed automatically via wheel):

- FastAPI >= 0.111.0
- Uvicorn >= 0.30.0 (with standard extras)
- Pydantic Settings >= 2.3.0
- SQLAlchemy >= 2.0.30 (with async extras)
- aiosqlite >= 0.20.0
- httpx >= 0.27.0
- cedarpy >= 4.8.0
- APScheduler >= 3.10.0
- structlog >= 24.1.0

Optional runtime dependency:

- `wasmtime` Python package or `wasmtime` CLI binary -- required only if deploying Wasm-based plugins.

---

## 2. Docker Deployment

### 2.1 Single Container

Build the image from the repository root:

```bash
docker build -t tiresias-app-proxy:0.1.0 .
```

Run the container:

```bash
docker run -d \
  --name app-proxy \
  -p 8081:8081 \
  -e APP_PROXY_API_KEY_HASH="<sha256-hex-of-your-api-key>" \
  -e APP_PROXY_ADMIN_KEY="<your-admin-key>" \
  -e APP_PROXY_TENANT_ID="<your-uuid>" \
  -v app-proxy-data:/app/data \
  tiresias-app-proxy:0.1.0
```

The container:

- Runs as the unprivileged `appproxy` user (UID/GID created at build time).
- Exposes port 8081 (configurable via `APP_PROXY_PROXY_PORT`).
- Stores SQLite data in `/app/data/` (mount a volume for persistence).
- Loads Cedar policies from `/app/policies/cedar/`.
- Loads plugin manifests from `/app/plugins/`.

### 2.2 Docker Compose with PostgreSQL

Create a `docker-compose.yml`:

```yaml
version: "3.9"

services:
  app-proxy:
    build: .
    ports:
      - "8081:8081"
    environment:
      APP_PROXY_DATABASE_URL: "postgresql+asyncpg://appproxy:${DB_PASSWORD}@postgres:5432/appproxy"
      APP_PROXY_API_KEY_HASH: "${API_KEY_HASH}"
      APP_PROXY_ADMIN_KEY: "${ADMIN_KEY}"
      APP_PROXY_TENANT_ID: "${TENANT_ID}"
      APP_PROXY_POLICY_ENFORCEMENT_MODE: "strict"
      APP_PROXY_RETENTION_DAYS: "90"
      APP_PROXY_ENABLE_APPROVAL_QUEUE: "true"
      APP_PROXY_APPROVAL_TIMEOUT_MINUTES: "30"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8081/health')"]
      interval: 30s
      timeout: 5s
      retries: 3

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: appproxy
      POSTGRES_USER: appproxy
      POSTGRES_PASSWORD: "${DB_PASSWORD}"
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appproxy"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pg-data:
```

Create a `.env` file (never commit this to version control):

```bash
DB_PASSWORD=<strong-random-password>
API_KEY_HASH=<sha256-hex-digest-of-your-bearer-token>
ADMIN_KEY=<strong-random-admin-key>
TENANT_ID=<your-uuid>
```

Start services:

```bash
docker compose up -d
```

### 2.3 Generating the API Key Hash

The `APP_PROXY_API_KEY_HASH` value is the SHA-256 hex digest of your chosen API key. Generate it as follows:

```bash
echo -n "your-api-key-here" | sha256sum | awk '{print $1}'
```

Or in Python:

```python
import hashlib
print(hashlib.sha256(b"your-api-key-here").hexdigest())
```

Store the raw API key securely. The App Proxy never stores the raw key -- only the hash is configured.

---

## 3. Kubernetes Deployment

### 3.1 Helm Chart Structure

A recommended Helm chart layout:

```
charts/tiresias-app-proxy/
  Chart.yaml
  values.yaml
  templates/
    deployment.yaml
    service.yaml
    configmap.yaml
    secret.yaml
    hpa.yaml
    pdb.yaml
```

### 3.2 Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tiresias-app-proxy
  labels:
    app.kubernetes.io/name: tiresias-app-proxy
    app.kubernetes.io/version: "0.1.0"
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: tiresias-app-proxy
  template:
    metadata:
      labels:
        app.kubernetes.io/name: tiresias-app-proxy
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: app-proxy
          image: tiresias-app-proxy:0.1.0
          ports:
            - containerPort: 8081
              name: http
              protocol: TCP
          envFrom:
            - secretRef:
                name: tiresias-app-proxy-secrets
            - configMapRef:
                name: tiresias-app-proxy-config
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 2
          startupProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 3
            periodSeconds: 5
            failureThreshold: 10
          volumeMounts:
            - name: cedar-policies
              mountPath: /app/policies/cedar
              readOnly: true
      volumes:
        - name: cedar-policies
          configMap:
            name: tiresias-cedar-policies
```

### 3.3 Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: tiresias-app-proxy
spec:
  selector:
    app.kubernetes.io/name: tiresias-app-proxy
  ports:
    - port: 8081
      targetPort: http
      protocol: TCP
  type: ClusterIP
```

### 3.4 Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: tiresias-app-proxy
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: tiresias-app-proxy
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### 3.5 Pod Disruption Budget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: tiresias-app-proxy
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: tiresias-app-proxy
```

### 3.6 Health Probes

The `/health` endpoint returns:

```json
{
  "status": "ok",
  "plugins": 5,
  "policy_enforcement": "strict"
}
```

- **Liveness probe:** Confirms the FastAPI process is responsive. Failure triggers pod restart.
- **Readiness probe:** Confirms the proxy is ready to accept traffic (database connected, policies loaded).
- **Startup probe:** Allows extra time during initial boot for database migration and plugin loading.

---

## 4. Environment Variables

All settings use the `APP_PROXY_` prefix. Every field listed below can be set via environment variable.

| Variable | Type | Default | Description |
|---|---|---|---|
| `APP_PROXY_TENANT_ID` | UUID | Auto-generated | Unique tenant identifier for multi-tenant isolation |
| `APP_PROXY_PROXY_PORT` | int | `8081` | Port the proxy listens on |
| `APP_PROXY_DATABASE_URL` | string | `sqlite+aiosqlite:///app_proxy.db` | Async SQLAlchemy database URL |
| `APP_PROXY_PLUGINS_DIR` | path | `plugins` | Directory containing MCP plugin manifests |
| `APP_PROXY_POLICIES_DIR` | path | `policies/cedar` | Directory containing `.cedar` policy files |
| `APP_PROXY_CEDAR_SCHEMA_PATH` | path | `src/app_proxy/policy/schema.json` | Path to Cedar JSON schema |
| `APP_PROXY_MCP_SERVER_TIMEOUT_SECONDS` | int | `30` | Timeout for MCP server calls |
| `APP_PROXY_POLICY_ENFORCEMENT_MODE` | `strict` or `advisory` | `strict` | `strict` denies failed policy checks; `advisory` logs but permits |
| `APP_PROXY_API_KEY_HASH` | string | None | SHA-256 hex digest of the bearer API key |
| `APP_PROXY_ADMIN_KEY` | string | None | Admin key for privileged endpoints (X-Admin-Key header) |
| `APP_PROXY_RETENTION_DAYS` | int | `30` | Days to retain audit logs |
| `APP_PROXY_ENABLE_APPROVAL_QUEUE` | bool | `true` | Enable human-in-the-loop approval for high-risk actions |
| `APP_PROXY_APPROVAL_TIMEOUT_MINUTES` | int | `30` | Minutes before a pending approval auto-denies |
| `APP_PROXY_APPROVAL_NOTIFY_URL` | string | None | Webhook URL for approval notifications (POST) |
| `APP_PROXY_APPROVAL_SWEEPER_INTERVAL_SECONDS` | int | `300` | Seconds between approval sweeper runs |
| `CEDAR_RELOAD_INTERVAL_SECONDS` | float | `30.0` | Seconds between Cedar policy hot-reload checks |

**Production checklist:**

- [ ] `APP_PROXY_API_KEY_HASH` is set (disables dev mode)
- [ ] `APP_PROXY_ADMIN_KEY` is set (protects admin endpoints)
- [ ] `APP_PROXY_DATABASE_URL` points to PostgreSQL
- [ ] `APP_PROXY_POLICY_ENFORCEMENT_MODE` is `strict`
- [ ] `APP_PROXY_RETENTION_DAYS` meets your compliance requirements (minimum 90 for SOC 2)

---

## 5. Database Configuration

### 5.1 Development: SQLite

The default `sqlite+aiosqlite:///app_proxy.db` works for local development and single-instance deployments. The Docker image writes to `/app/data/app_proxy.db` by default.

**Limitations:** No concurrent write support. Do not use SQLite with multiple replicas.

### 5.2 Production: PostgreSQL

Set the database URL to an asyncpg connection string:

```
APP_PROXY_DATABASE_URL=postgresql+asyncpg://user:password@host:5432/appproxy
```

**Requirements:**

- PostgreSQL 15 or later.
- The `asyncpg` driver (included in the wheel's dependencies via SQLAlchemy async extras).
- Create the database before first run; tables are created automatically at startup via `create_tables()`.

**Connection pooling:** SQLAlchemy's built-in pool handles connection management. For high-throughput deployments, place PgBouncer in front of PostgreSQL in transaction mode.

### 5.3 Schema Migrations

Tables are created at application startup. For schema changes between versions, run migrations before deploying the new version. Migration tooling (Alembic) will be provided in future releases. For v0.1.0, the schema is created fresh.

---

## 6. TLS and HTTPS

The App Proxy serves plain HTTP on port 8081. **Do not expose port 8081 directly to the internet.** Terminate TLS at a reverse proxy.

### 6.1 nginx

```nginx
server {
    listen 443 ssl;
    server_name app-proxy.example.com;

    ssl_certificate     /etc/ssl/certs/app-proxy.crt;
    ssl_certificate_key /etc/ssl/private/app-proxy.key;
    ssl_protocols       TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

### 6.2 Traefik (Docker Labels)

```yaml
services:
  app-proxy:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.app-proxy.rule=Host(`app-proxy.example.com`)"
      - "traefik.http.routers.app-proxy.tls=true"
      - "traefik.http.routers.app-proxy.tls.certresolver=letsencrypt"
      - "traefik.http.services.app-proxy.loadbalancer.server.port=8081"
```

### 6.3 Kubernetes Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tiresias-app-proxy
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - app-proxy.example.com
      secretName: tiresias-app-proxy-tls
  rules:
    - host: app-proxy.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: tiresias-app-proxy
                port:
                  number: 8081
```

---

## 7. Monitoring

### 7.1 Health Endpoint

`GET /health` returns HTTP 200 with:

```json
{
  "status": "ok",
  "plugins": 5,
  "policy_enforcement": "strict"
}
```

Use this for load balancer health checks, uptime monitors, and synthetic probes.

### 7.2 Structured Logging

All logs are emitted via `structlog` in JSON format. Each log event includes:

- `event` -- the log event name (e.g., `cedar_engine.authorize`)
- `level` -- log level (info, warning, error)
- Contextual fields: `agent_id`, `tenant_id`, `plugin_id`, `action`, `allowed`, `risk_score`

Pipe logs to your SIEM or log aggregation platform (Elasticsearch, Datadog, Splunk, Loki).

Example log entry:

```json
{
  "event": "cedar_engine.authorize",
  "level": "info",
  "agent_id": "alfred-minipc",
  "tenant_id": "a1b2c3d4-...",
  "plugin_id": "slack",
  "action": "tool_call",
  "allowed": true,
  "needs_approval": false,
  "timestamp": "2026-04-05T14:30:00Z"
}
```

### 7.3 Prometheus Integration

Expose a `/metrics` endpoint using `prometheus-fastapi-instrumentator` or export structlog counters to a Prometheus pushgateway. Recommended metrics to track:

- `app_proxy_tool_calls_total` (counter) -- labeled by plugin, action, decision
- `app_proxy_policy_decisions_total` (counter) -- labeled by allowed/denied
- `app_proxy_risk_score_histogram` (histogram) -- distribution of risk scores
- `app_proxy_approval_queue_depth` (gauge)
- `app_proxy_behavioral_alerts_total` (counter) -- labeled by pattern name

### 7.4 Alerting Recommendations

| Condition | Severity | Action |
|---|---|---|
| `/health` returns non-200 | Critical | Page on-call |
| `behavioral.alert` with severity `critical` | High | Notify security team |
| `approval_queue_depth > 50` | Warning | Investigate backlog |
| `policy_decisions{allowed=false} / total > 0.3` | Warning | Review policy configuration |
| `risk_score_histogram p99 > 75` | High | Investigate agent behavior |

---

## 8. Backup and Disaster Recovery

### 8.1 Database Backups

**PostgreSQL:**

```bash
# Daily logical backup
pg_dump -Fc -f appproxy_$(date +%Y%m%d).dump appproxy

# Restore
pg_restore -d appproxy appproxy_20260405.dump
```

Schedule via cron or your orchestrator's CronJob resource. Retain backups per your compliance requirements (minimum 90 days for SOC 2).

**SQLite (development only):**

```bash
sqlite3 /app/data/app_proxy.db ".backup /backups/app_proxy_$(date +%Y%m%d).db"
```

### 8.2 Policy Version Control

Cedar policy files (`policies/cedar/*.cedar`) must be stored in version control (Git). This provides:

- Full change history for audit purposes (SOC 2 CC8.1).
- Rollback capability by reverting to a prior commit.
- Code review before policy changes reach production.

**Never edit policies directly in a running container.** Deploy updated policies via image rebuild or ConfigMap update.

### 8.3 Recovery Procedure

1. Deploy a fresh App Proxy instance with the same configuration.
2. Restore the PostgreSQL database from the most recent backup.
3. Verify Cedar policies are loaded: `GET /health`.
4. Verify plugin connectivity: check structured logs for `plugin.registry.ready`.
5. Validate policy evaluation: call `POST /admin/policies/validate` with the admin key.

### 8.4 Recovery Time Objective (RTO)

With a pre-built container image and PostgreSQL backup available, recovery takes under 10 minutes. The application creates tables automatically at startup -- no manual migration step is needed for v0.1.0.

---

## 9. Upgrading

### 9.1 Rolling Updates (Kubernetes)

The default Kubernetes deployment strategy (`RollingUpdate`) works without modification:

1. Build and push the new container image.
2. Update the image tag in your Deployment manifest or Helm values.
3. Apply the change. Kubernetes replaces pods one at a time, verifying readiness before proceeding.

The PodDisruptionBudget ensures at least one pod remains available during the rollout.

### 9.2 Docker Compose Updates

```bash
docker compose build
docker compose up -d --no-deps app-proxy
```

### 9.3 Database Migrations

For v0.1.0, tables are created automatically at startup. Future releases will include Alembic migration scripts. The upgrade procedure will be:

1. Back up the database.
2. Run `alembic upgrade head` against the production database.
3. Deploy the new container image.

**Always back up the database before upgrading.**

### 9.4 Policy Compatibility

Cedar policies are forward-compatible within the same schema version. If a new release changes the Cedar schema (`schema.json`), the release notes will include migration instructions. The policy engine validates policies against the schema at startup and refuses to start with invalid policies.

---

## 10. Air-Gapped and On-Premises Deployment

### 10.1 Building Offline

On a machine with internet access:

```bash
# Build the wheel
pip install build
python -m build --wheel --outdir dist/

# Save the Docker image
docker build -t tiresias-app-proxy:0.1.0 .
docker save tiresias-app-proxy:0.1.0 | gzip > tiresias-app-proxy-0.1.0.tar.gz
```

Transfer `tiresias-app-proxy-0.1.0.tar.gz` to the air-gapped environment.

### 10.2 Loading Offline

```bash
docker load < tiresias-app-proxy-0.1.0.tar.gz
```

### 10.3 Dependency Vendoring

If installing from source (without Docker):

```bash
# On the connected machine
pip download -d vendor/ tiresias-app-proxy-0.1.0-py3-none-any.whl

# On the air-gapped machine
pip install --no-index --find-links=vendor/ tiresias-app-proxy-0.1.0-py3-none-any.whl
```

### 10.4 On-Premises Considerations

- **No outbound network required.** The App Proxy does not phone home, check for updates, or send telemetry.
- **Plugin MCP servers** may require network access to their backends (e.g., Slack API). Configure firewall rules per plugin requirements.
- **Approval webhook** (`APP_PROXY_APPROVAL_NOTIFY_URL`) must be reachable from the proxy if configured.
- **Time synchronization** is important for Cedar business-hours policies. Ensure NTP is configured on the host.
- **Cedar policy hot-reload** reads from the local filesystem every 30 seconds. No network access is needed for policy updates.
