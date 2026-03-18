# Tiresias Platform - Cloud & Infrastructure Security Assessment

**Date:** 2026-03-18
**Assessor:** Senior Cloud & Infrastructure Security Architect
**Scope:** Docker, Kubernetes, CI/CD, Secrets, Network, Supply Chain, Monitoring
**Platform:** Tiresias (SoulAuth + SoulGate + SoulWatch + Portal)

---

## Executive Summary

The Tiresias platform demonstrates a solid security foundation - non-root containers, structured logging, capability-based auth, and good separation of concerns. However, several findings require remediation before GA, particularly around CORS misconfigurations in two services, missing `.dockerignore` files, default database credentials, exposed debug endpoints in production, and absent Kubernetes network segmentation. The assessment identified **23 findings**: 3 critical, 6 high, 8 medium, 4 low, and 2 informational.

---

## Findings

### FINDING-01: SoulGate CORS Wildcard with Credentials

**Severity:** CRITICAL
**Files:** `/home/cris/soulAuth/soulGate/main.py` (lines 108-114)
**Description:** SoulGate sets `allow_origins=["*"]` combined with `allow_credentials=True`. Per the CORS spec (Fetch Standard), browsers will reject credentialed requests with wildcard origins, but misconfigured clients or proxies may not enforce this. For an API security gateway, this is especially dangerous - it undermines the very protection the gateway is supposed to provide.
**Attack Scenario:** An attacker hosts a malicious page that makes credentialed cross-origin requests to SoulGate endpoints. If any client or reverse proxy does not enforce CORS properly, the attacker can proxy authenticated API requests, exfiltrate data, or modify rate-limit/access-control policies.
**Recommended Fix:**
```python
# soulGate/main.py - Replace lines 108-114
_ALLOWED_ORIGINS = [
    "https://tiresias.saluca.com",
    "https://www.tiresias.saluca.com",
]
if settings.debug:
    _ALLOWED_ORIGINS += ["http://localhost:3000", "http://localhost:8002"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-SoulKey", "X-Tenant-ID"],
)
```

---

### FINDING-02: SoulWatch CORS Wildcard with Credentials

**Severity:** CRITICAL
**Files:** `/home/cris/soulAuth/soulWatch/main.py` (lines 241-247)
**Description:** Identical issue to FINDING-01. SoulWatch also uses `allow_origins=["*"]` with `allow_credentials=True`. SoulWatch handles behavioral analytics, detection rules, quarantine enforcement, and SIEM data - all sensitive operations. The existing test in `tests/test_security/test_cors_routes.py` validates that SoulAuth's `main.py` does NOT have wildcard CORS, but SoulGate and SoulWatch are not covered by this test.
**Attack Scenario:** Same as FINDING-01 but targeting detection rules, quarantine controls, and analytics data.
**Recommended Fix:** Same pattern as FINDING-01, applied to `soulWatch/main.py`.

---

### FINDING-03: Default Database Credentials in Docker Compose

**Severity:** CRITICAL
**Files:** `/home/cris/soulAuth/docker-compose.yml` (lines 10-12), `/home/cris/soulAuth/.env.example` (lines 7-9)
**Description:** Docker Compose falls back to `POSTGRES_USER=tiresias`, `POSTGRES_PASSWORD=tiresias` via `${POSTGRES_PASSWORD:-tiresias}`. The `.env.example` uses `changeme-in-production` as the password. If `.env` is not created or the password is not overridden, the database runs with trivially guessable credentials. Additionally, PostgreSQL port 5432 is published to the host (line 14), making the database directly accessible with default credentials.
**Attack Scenario:** An operator deploys via `docker compose up` without creating a `.env` file. The database is accessible on port 5432 with `tiresias/tiresias` credentials, granting full access to all identity data, SoulKeys, audit logs, and tenant information.
**Recommended Fix:**
```yaml
# docker-compose.yml - Remove default password fallback
environment:
  POSTGRES_USER: ${POSTGRES_USER:?POSTGRES_USER must be set}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}
  POSTGRES_DB: ${POSTGRES_DB:?POSTGRES_DB must be set}
# Remove the host port mapping or bind to localhost only
ports:
  - "127.0.0.1:5432:5432"  # For dev only; remove entirely in production
```

---

### FINDING-04: Missing .dockerignore Files

**Severity:** HIGH
**Files:** All Dockerfiles (root `Dockerfile`, `portal/Dockerfile`, `soulGate/Dockerfile`, `soulWatch/Dockerfile`)
**Description:** No `.dockerignore` file exists anywhere in the project. The root `Dockerfile` copies specific directories (`config/`, `src/`), which limits the blast radius, but the portal `Dockerfile` runs `COPY . .` (line 12) in the builder stage. Without `.dockerignore`, this copies `.env` files, `.git/` history, `node_modules/`, IDE configs, test files, and potentially any secrets present in the portal directory into the Docker build context and intermediate layers. Even though the final stage uses a multi-stage copy, the builder image layer retains everything.
**Attack Scenario:** If a developer has a `.env.local` with real API keys in the portal directory, it gets baked into the Docker image layer. Anyone with access to the image registry can extract secrets from intermediate layers via `docker history` or layer inspection.
**Recommended Fix:** Create `.dockerignore` at project root and in `portal/`:
```
# .dockerignore (root)
.env
.env.*
*.pem
keys/
.git/
.github/
.planning/
venv/
__pycache__/
*.pyc
tests/
monitoring/
portal/node_modules/
*.md
sales/

# portal/.dockerignore
.env
.env.*
.git
node_modules
.next
*.md
```

---

### FINDING-05: PostgreSQL Port Exposed to Host Network

**Severity:** HIGH
**Files:** `/home/cris/soulAuth/docker-compose.yml` (line 14)
**Description:** Port `5432:5432` is published to all host interfaces. Combined with FINDING-03, this exposes the database to any network the host is on (including the internet if the host has a public IP or is in a cloud VPC without restrictive security groups).
**Attack Scenario:** On a cloud VM with a public IP, port 5432 is reachable from the internet. Combined with default credentials, an attacker gains full database access.
**Recommended Fix:**
```yaml
ports:
  - "127.0.0.1:5432:5432"  # Dev only, bind to localhost
```
Or remove the port mapping entirely in production - services on the `tiresias-net` bridge can reach postgres by hostname without host port exposure.

---

### FINDING-06: Prometheus and All Service Ports Exposed to Host

**Severity:** HIGH
**Files:** `/home/cris/soulAuth/docker-compose.yml` (lines 69-70, 92-93, 125, 148-149)
**Description:** All services (SoulAuth:8000, SoulWatch:8001, SoulGate:8002, Portal:3000, Prometheus:9090) publish ports to all host interfaces. Prometheus (9090) is particularly dangerous - it exposes operational metrics, service topology, and alert configurations without authentication. Internal services (SoulWatch, SoulGate) should not be directly accessible from outside the Docker network in production.
**Attack Scenario:** An attacker accesses Prometheus at `host:9090` and enumerates all service endpoints, error rates, active tenants, soulkey counts, and internal architecture. This information enables targeted attacks against the platform.
**Recommended Fix:** For production, only expose the public-facing service (Portal or a reverse proxy). Internal services should communicate over the Docker network:
```yaml
# Remove ports from soulwatch, soulgate, prometheus
# Only expose the public entry point:
soulauth:
  ports:
    - "127.0.0.1:8000:8000"  # Or put behind a reverse proxy
portal:
  ports:
    - "127.0.0.1:3000:3000"
```

---

### FINDING-07: No Container Security Context in Docker Compose

**Severity:** HIGH
**Files:** `/home/cris/soulAuth/docker-compose.yml`
**Description:** While the Dockerfiles create non-root users and use `USER` directives (which is good), the `docker-compose.yml` does not set `read_only: true`, `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`, or `tmpfs` mounts. The K8s deployment has `runAsNonRoot` and `runAsUser`, but Docker Compose (the more likely dev/staging deployment) lacks equivalent hardening.
**Attack Scenario:** If an application vulnerability allows code execution, the attacker can write to the container filesystem, install tools, and pivot. Without `no-new-privileges`, privilege escalation via SUID binaries is possible.
**Recommended Fix:**
```yaml
# Apply to each service in docker-compose.yml
soulauth:
  security_opt:
    - no-new-privileges:true
  read_only: true
  tmpfs:
    - /tmp
  cap_drop:
    - ALL
```

---

### FINDING-08: Metrics Endpoint Unauthenticated

**Severity:** HIGH
**Files:** `/home/cris/soulAuth/src/monitoring/metrics.py` (lines 239-261), `/home/cris/soulAuth/src/middleware/pep.py` (line 30-37)
**Description:** The `/metrics` endpoint is excluded from all authentication middleware (PEP, TenantContext, FeatureGate) and returns full Prometheus metrics including tenant counts, active soulkeys, auth decision rates, error rates, anomaly counts, and rate-limit statistics. This is a significant information disclosure vector.
**Attack Scenario:** An attacker hits `/metrics` on the public API and learns: number of tenants (business intelligence), active soulkeys (attack surface), auth denial rates (attack effectiveness), and token minting failures (system weaknesses).
**Recommended Fix:** Either:
1. Require authentication on `/metrics` via a bearer token or basic auth
2. Bind the metrics endpoint to a separate internal-only port
3. Use Prometheus service discovery within the Docker/K8s network and do not expose metrics externally

---

### FINDING-09: OpenAPI/Swagger Docs Exposed in Production

**Severity:** HIGH
**Files:** `/home/cris/soulAuth/src/main.py` (line 247), `/home/cris/soulAuth/src/middleware/pep.py` (lines 35-37)
**Description:** The `/docs`, `/redoc`, and `/openapi.json` endpoints are unconditionally available and explicitly listed in the PEP middleware's `OPEN_PREFIXES`. In production, this exposes the full API schema including all endpoints, request/response models, parameter types, and example values. This is a comprehensive reconnaissance tool for attackers.
**Attack Scenario:** An attacker reads `/openapi.json` and maps every endpoint, learns the exact request format for trial registration, admin operations, quarantine management, and detection rule CRUD.
**Recommended Fix:**
```python
# In src/main.py, disable docs in production
app = FastAPI(
    ...
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)
```

---

### FINDING-10: Settings Contains Hardcoded Default Database URL with Credentials

**Severity:** MEDIUM
**Files:** `/home/cris/soulAuth/config/settings.py` (lines 34-40)
**Description:** The `Settings` class has default values for `database_url` and `database_url_sync` that include `postgres:postgres@localhost:5432/soulauth`. If the `SOULAUTH_DATABASE_URL` environment variable is not set, the application silently falls back to these defaults. In a misconfigured deployment, this could cause the application to connect to an unintended database or leak credentials in error messages.
**Recommended Fix:**
```python
database_url: str = Field(
    default="",
    description="Async database connection URL (required for enterprise mode)",
)
```
Then validate in `get_settings()` that the URL is set when `mode == "enterprise"`.

---

### FINDING-11: CI Pipeline Ignores Security Audit Failures

**Severity:** MEDIUM
**Files:** `/home/cris/soulAuth/.github/workflows/ci.yml` (line 116)
**Description:** The `pip-audit` step uses `|| true` to suppress all failures and `--ignore-vuln PYSEC-2024-*` to blanket-ignore an entire year of Python security advisories. This means known CVEs in dependencies will never block a deployment.
**Attack Scenario:** A dependency with a known critical CVE (e.g., RCE in `cryptography` or `jinja2`) passes CI without any warning. The vulnerable code ships to production.
**Recommended Fix:**
```yaml
- name: Run pip-audit
  run: pip-audit -r requirements.txt
  # Only ignore specific, reviewed vulnerabilities with justification:
  # --ignore-vuln PYSEC-2024-XXXX  # Justification: not exploitable because...
```

---

### FINDING-12: Outdated Dependencies with Known CVEs

**Severity:** MEDIUM
**Files:** `/home/cris/soulAuth/requirements.txt`
**Description:** Several dependencies are pinned to versions from late 2023:
- `cryptography==41.0.7` - Multiple CVEs fixed in 42.x and 43.x (including denial of service and memory safety issues)
- `jinja2==3.1.2` - CVE-2024-22195 (XSS in `xmlattr` filter)
- `python-jose==3.3.0` - This library is effectively abandoned; `PyJWT` (already a dependency) should be used exclusively
- `python-multipart==0.0.6` - CVE-2024-24762 (ReDoS)
- `passlib==1.7.4` - Unmaintained since 2020
**Recommended Fix:** Update all dependencies to latest stable versions. Remove `python-jose` in favor of the already-included `PyJWT`. Replace `passlib` with direct `bcrypt` usage.

---

### FINDING-13: No Kubernetes NetworkPolicy

**Severity:** MEDIUM
**Files:** `/home/cris/soulAuth/k8s/deployment.yaml`
**Description:** The K8s deployment defines a namespace and service but no `NetworkPolicy` resources. Without NetworkPolicies, any pod in the cluster can communicate with the SoulAuth pods. In a shared cluster, this means a compromised workload in another namespace can directly access the identity service.
**Attack Scenario:** An attacker compromises a low-privilege pod in another namespace. Without NetworkPolicies, they connect directly to `soulauth:80` and attempt to exploit admin endpoints or enumerate identities.
**Recommended Fix:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: soulauth-allow-ingress
  namespace: soulauth
spec:
  podSelector:
    matchLabels:
      app: soulauth
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx  # Only from ingress controller
      ports:
        - port: 8000
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: soulauth  # Only to own namespace (postgres)
      ports:
        - port: 5432
    - to:  # DNS
        - namespaceSelector: {}
      ports:
        - port: 53
          protocol: UDP
```

---

### FINDING-14: Missing Container-Level Security Context in K8s

**Severity:** MEDIUM
**Files:** `/home/cris/soulAuth/k8s/deployment.yaml` (lines 30-33)
**Description:** The pod-level `securityContext` sets `runAsNonRoot` and `runAsUser`, which is good. However, the container-level security context is missing: no `readOnlyRootFilesystem`, no `allowPrivilegeEscalation: false`, no `capabilities` drop. The K8s deployment also lacks `seccompProfile` configuration.
**Recommended Fix:**
```yaml
containers:
  - name: soulauth
    securityContext:
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
      capabilities:
        drop:
          - ALL
      seccompProfile:
        type: RuntimeDefault
```

---

### FINDING-15: K8s Deployment Uses `latest` Tag

**Severity:** MEDIUM
**Files:** `/home/cris/soulAuth/k8s/deployment.yaml` (line 36)
**Description:** `image: gcr.io/saluca-infra/soulauth:latest` uses the mutable `latest` tag. This makes deployments non-reproducible, allows unintended image updates on pod restarts, and defeats rollback capabilities.
**Attack Scenario:** An attacker who gains push access to the container registry overwrites the `latest` tag with a malicious image. On next pod restart, the malicious image is pulled automatically.
**Recommended Fix:** Use immutable image tags based on git SHA or semver:
```yaml
image: gcr.io/saluca-infra/soulauth:v1.0.0@sha256:<digest>
```

---

### FINDING-16: No TLS Between Services

**Severity:** MEDIUM
**Files:** `/home/cris/soulAuth/docker-compose.yml` (lines 75, 102)
**Description:** Inter-service communication uses plain HTTP: `SOULGATE_SOULAUTH_URL: http://soulauth:8000` and `SOULWATCH_SOULAUTH_URL: http://soulauth:8000`. In the Docker bridge network this is acceptable for dev, but in production (especially K8s or multi-node Docker), traffic between services is unencrypted. SoulKeys and capability tokens traverse these connections in cleartext.
**Attack Scenario:** In a K8s cluster without a service mesh, an attacker with network access (e.g., via a compromised pod) can sniff traffic between SoulGate and SoulAuth, capturing SoulKeys and capability tokens.
**Recommended Fix:** Deploy a service mesh (Istio/Linkerd) for automatic mTLS, or configure each service with TLS certificates for service-to-service communication.

---

### FINDING-17: No Secret Rotation Mechanism

**Severity:** MEDIUM
**Files:** `/home/cris/soulAuth/config/settings.py`, `/home/cris/soulAuth/k8s/deployment.yaml`
**Description:** JWT signing keys and database credentials are loaded once at startup via environment variables or Kubernetes secrets. There is no mechanism for key rotation without service restart. The `@lru_cache()` on `get_settings()` means settings are cached for the process lifetime.
**Recommended Fix:** Implement a key rotation mechanism:
1. Support loading keys from a secrets manager (GCP Secret Manager, Vault) with periodic refresh
2. Support key versioning in JWT tokens (via `kid` header) so old tokens remain valid during rotation
3. Add a `/admin/rotate-keys` endpoint or support SIGHUP for config reload

---

### FINDING-18: SoulWatch Event Ingestion Endpoint Unauthenticated

**Severity:** MEDIUM
**Files:** `/home/cris/soulAuth/soulWatch/main.py` (lines 264-285)
**Description:** The `POST /watch/v1/events` endpoint accepts arbitrary dict payloads with no authentication. Anyone who can reach SoulWatch can inject fabricated audit events into the detection pipeline, potentially triggering false quarantines, overwhelming the detection engine, or poisoning behavioral baselines.
**Attack Scenario:** An attacker sends thousands of fabricated "suspicious activity" events for a legitimate agent, causing it to be auto-quarantined. Alternatively, they flood benign events to train the baseline to accept malicious patterns.
**Recommended Fix:** Add SoulKey or mTLS authentication to the event ingestion endpoint. At minimum, validate the request against a shared secret:
```python
@app.post("/watch/v1/events", dependencies=[Depends(verify_internal_api_key)])
```

---

### FINDING-19: CI Pipeline Missing Container Image Scanning

**Severity:** LOW
**Files:** `/home/cris/soulAuth/.github/workflows/ci.yml` (lines 78-96)
**Description:** The CI pipeline builds Docker images but does not scan them for OS-level vulnerabilities. The `security` job only audits Python packages via `pip-audit`, not the base image (`python:3.12-slim`) which may contain vulnerable system packages.
**Recommended Fix:** Add Trivy or Grype image scanning:
```yaml
- name: Scan Docker image
  uses: aquasecurity/trivy-action@0.28.0
  with:
    image-ref: soulauth:${{ github.sha }}
    format: table
    exit-code: 1
    severity: CRITICAL,HIGH
```

---

### FINDING-20: Git Installed in Production Containers

**Severity:** LOW
**Files:** `/home/cris/soulAuth/Dockerfile` (line 7), `soulGate/Dockerfile` (line 7), `soulWatch/Dockerfile` (line 7)
**Description:** All three Python service Dockerfiles install `git` in the production image. Git is needed for policy repo sync functionality, but in containers that don't use it (SoulGate, SoulWatch), it increases the attack surface unnecessarily. Additionally, `curl` is installed in SoulGate and SoulWatch Dockerfiles but not used at runtime.
**Recommended Fix:** Use multi-stage builds. Only install git in images that need it (SoulAuth with policy sync), and remove curl:
```dockerfile
# Only in Dockerfile (root) where git is needed for policy sync:
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
# Remove git from soulGate/Dockerfile and soulWatch/Dockerfile
```

---

### FINDING-21: Portal package.json Uses Caret Version Ranges

**Severity:** LOW
**Files:** `/home/cris/soulAuth/portal/package.json`
**Description:** Dependencies use caret ranges (e.g., `"next": "16.1.7"` is exact but `"@tailwindcss/postcss": "^4"` and `"react": "19.2.3"` are mixed). While `package-lock.json` exists (which is good), the caret ranges in `package.json` mean `npm install` (without `--ci`) could pull different versions. The lock file mitigates this in CI (which uses `npm ci`), but developer machines may diverge.
**Recommended Fix:** Pin all dependencies to exact versions in `package.json` or ensure all developers use `npm ci`.

---

### FINDING-22: No Prometheus Alertmanager Configuration

**Severity:** LOW
**Files:** `/home/cris/soulAuth/monitoring/prometheus.yml`, `/home/cris/soulAuth/docker-compose.yml`
**Description:** Prometheus alert rules are defined (`alert_rules.yml`, `alerts.yml`) but there is no Alertmanager service in the Docker Compose stack and no `alerting` configuration in `prometheus.yml`. This means alerts fire but are never delivered - no one gets notified of security events like high auth denial rates, error spikes, or service downtime.
**Recommended Fix:** Add Alertmanager to docker-compose.yml and configure notification routing:
```yaml
# In prometheus.yml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

# In docker-compose.yml
alertmanager:
  image: prom/alertmanager:v0.27.0
  volumes:
    - ./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
  networks:
    - tiresias-net
```

---

### FINDING-23: Duplicate Alert Rules with Inconsistent Metric Names

**Severity:** INFO
**Files:** `/home/cris/soulAuth/monitoring/alerts.yml`, `/home/cris/soulAuth/monitoring/alert_rules.yml`
**Description:** Two alert rule files exist with overlapping alerts (e.g., `SoulAuthDown` appears in both). They also reference different metric names: `alert_rules.yml` uses `soulauth_request_duration_seconds_count` while `alerts.yml` uses `soulauth_http_requests_total`. Only one set of metrics is actually exported by the application. This creates confusion about which alerts actually fire.
**Recommended Fix:** Consolidate into a single `alert_rules.yml` that references the actual exported metric names from `src/monitoring/metrics.py`.

---

### FINDING-24: Database Credentials in Docker Compose Environment

**Severity:** INFO
**Files:** `/home/cris/soulAuth/docker-compose.yml` (lines 39-40, 74, 100)
**Description:** Database connection strings containing credentials are constructed inline in the `environment` section via variable interpolation. While they reference env vars, the pattern `postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}` means credentials appear in `docker inspect` output and process environment listings. Docker Secrets or external secrets managers would be more secure.
**Recommended Fix:** Use Docker Secrets for sensitive values:
```yaml
secrets:
  db_password:
    file: ./secrets/db_password.txt
services:
  postgres:
    secrets:
      - db_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
```

---

## Summary Table

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| 01 | SoulGate CORS wildcard + credentials | CRITICAL | Network |
| 02 | SoulWatch CORS wildcard + credentials | CRITICAL | Network |
| 03 | Default DB credentials in Docker Compose | CRITICAL | Secrets |
| 04 | Missing .dockerignore files | HIGH | Docker |
| 05 | PostgreSQL port exposed to host | HIGH | Network |
| 06 | All service/monitoring ports exposed | HIGH | Network |
| 07 | No container security hardening in Compose | HIGH | Docker |
| 08 | Metrics endpoint unauthenticated | HIGH | Network |
| 09 | Swagger/OpenAPI docs exposed in production | HIGH | Network |
| 10 | Hardcoded default DB URL in settings | MEDIUM | Secrets |
| 11 | CI ignores security audit failures | MEDIUM | Pipeline |
| 12 | Outdated dependencies with known CVEs | MEDIUM | Supply Chain |
| 13 | No Kubernetes NetworkPolicy | MEDIUM | Kubernetes |
| 14 | Missing container-level securityContext in K8s | MEDIUM | Kubernetes |
| 15 | K8s deployment uses `latest` tag | MEDIUM | Kubernetes |
| 16 | No TLS between services | MEDIUM | Network |
| 17 | No secret rotation mechanism | MEDIUM | Secrets |
| 18 | SoulWatch event ingestion unauthenticated | MEDIUM | Network |
| 19 | No container image scanning in CI | LOW | Pipeline |
| 20 | Git/curl installed in production containers | LOW | Docker |
| 21 | Caret version ranges in portal deps | LOW | Supply Chain |
| 22 | No Alertmanager for Prometheus | LOW | Monitoring |
| 23 | Duplicate/inconsistent alert rules | INFO | Monitoring |
| 24 | DB credentials in Compose environment | INFO | Secrets |

---

## Priority Remediation Order

### Before GA (blockers)
1. Fix CORS in SoulGate and SoulWatch (FINDING-01, 02)
2. Remove default DB credentials / require explicit config (FINDING-03)
3. Create .dockerignore files (FINDING-04)
4. Restrict port exposure in Docker Compose (FINDING-05, 06)
5. Disable docs/OpenAPI in production (FINDING-09)
6. Authenticate metrics endpoint (FINDING-08)

### Before enterprise deployment
7. Container hardening in Compose (FINDING-07)
8. Update dependencies (FINDING-12)
9. Fix CI security audit (FINDING-11)
10. K8s NetworkPolicy + container securityContext (FINDING-13, 14)
11. Pin K8s image tags (FINDING-15)
12. Authenticate SoulWatch event ingestion (FINDING-18)
13. Enable inter-service TLS (FINDING-16)

### Post-GA hardening
14. Secret rotation support (FINDING-17)
15. Container image scanning (FINDING-19)
16. Remove unnecessary packages from images (FINDING-20)
17. Set up Alertmanager (FINDING-22)
18. Consolidate alert rules (FINDING-23)

---

## Positive Observations

The following security practices are already well-implemented:

1. **Non-root containers** - All four Dockerfiles create dedicated users and switch via `USER` directive
2. **SoulAuth CORS** - Properly restricts origins to production domains with debug-conditional dev origins
3. **K8s secrets** - Database URL and JWT keys loaded from Kubernetes Secrets (not ConfigMaps)
4. **Structured logging** - JSON-formatted logs via structlog prevent log injection
5. **Health checks** - All services have proper Docker and K8s health checks
6. **Pod security** - K8s deployment uses `runAsNonRoot: true` and dedicated service account
7. **systemd hardening** - PEP agent unit file uses `NoNewPrivileges`, `ProtectSystem=strict`, capability bounding, namespace restrictions
8. **Resource limits** - K8s deployment has proper CPU/memory requests and limits
9. **`.gitignore`** - Properly excludes `.env`, `*.pem`, and `keys/` from version control
10. **Trial anti-abuse** - Rate limiting, disposable email blocking, domain-unique trials
11. **Multi-stage Docker build** - Portal uses proper multi-stage build avoiding node_modules in production
12. **Pip no-cache** - All pip installs use `--no-cache-dir`
