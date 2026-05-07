# Tiresias Deploy Plan: Pricing + Platform Reconciliation
## Created: 2026-04-07
## Status: PENDING

---

## Context

In the 2026-04-07 session, pricing was reconciled to v3.0 across both repos and committed, but nothing has been deployed yet. Key findings:

- `tiresias.network` is served by `portal-marketing/` (the `marketing-portal` deployment), NOT by `portal/`. This is critical — any pricing changes visible on the marketing site require rebuilding and redeploying the `marketing-portal` image, not the `portal` image.
- The `portal` deployment (platform app at `platform.tiresias.network`) is running image `portal:v1.0.0` in production, but the manifest (`k8s/portal-deployment.yaml`) references `v2.4.5`. These are out of sync.
- `portal-deployment.yaml` has env vars that do NOT exist in the live deployment: `SOULAUTH_INTERNAL_URL`, `INTERNAL_API_KEY` (live as plaintext), `STRIPE_PRICE_ENTERPRISE_MONTHLY/ANNUAL`, `COOKIE_DOMAIN`.
- The Alembic migration tree has multiple multi-head conflicts: `0002`, `0020`, `0021`, `0022` all have duplicate revision IDs (`a` and `b` variants) that must be resolved before running `alembic upgrade head` in production.
- There is no `cloudbuild-marketing.yaml` — it needs to be created. The existing `cloudbuild-portal.yaml` builds the platform portal only (image tag `v2.5.0`). The main `cloudbuild.yaml` builds backend services at tag `v2.4.5`.
- Current live image for marketing: `us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing:v1.0.0`
- Current live image for portal: `us-central1-docker.pkg.dev/salucainfrastructure/tiresias/portal:v1.0.0`
- Pricing in the marketing site source (PricingContent.tsx): Starter $49/mo, $488/yr; Pro $199/mo, $1,982/yr; Enterprise $2,499/mo, $24,890/yr.

---

## Phase 1: Marketing Site Deploy (LOW RISK)
### Goal: Get correct pricing live on tiresias.network
### Risk: LOW — static Next.js site, no database, no auth, no sessions, no migrations
### Estimated time: 15 minutes
### Prerequisites: None

---

### Pre-flight Checks

Verify the cluster is reachable and current state before touching anything:

```bash
# 1. Confirm gcloud project
gcloud config get-value project
# Expected: salucainfrastructure

# 2. Confirm kubectl context is pointing at the right cluster
kubectl config current-context
# Should be something like: gke_salucainfrastructure_us-central1_tiresias-partner
# If wrong, run:
# gcloud container clusters get-credentials <cluster-name> --region us-central1 --project salucainfrastructure

# 3. Check current marketing-portal pod status
kubectl get pods -n tiresias -l app=marketing-portal
# Expected: 1 pod, STATUS=Running, RESTARTS low

# 4. Confirm currently running image tag
kubectl get deployment marketing-portal -n tiresias \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
# Expected: us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing:v1.0.0

# 5. Confirm pricing on live site (check raw HTML for the dollar amounts)
curl -s https://tiresias.network/pricing | grep -o '\$[0-9,]*' | head -20
# Current state (stale): will show whatever v1.0.0 had
# After deploy (expected): $49, $488, $199, $1,982, $2,499, $24,890

# 6. Confirm source file has correct values before building
grep -E 'priceMonthly|priceAnnual' /z/tiresias/portal-marketing/src/app/pricing/PricingContent.tsx
# Expected to see: "$49", "$488", "$199", "$1,982", "$2,499", "$24,890"
```

---

### Step 1.1: Create cloudbuild-marketing.yaml

This file does NOT exist yet. Create it at `/z/tiresias/cloudbuild-marketing.yaml`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    id: 'build-marketing'
    args:
      - 'build'
      - '--build-arg'
      - 'NEXT_PUBLIC_APP_URL=https://tiresias.network'
      - '--build-arg'
      - 'NEXT_PUBLIC_PLATFORM_URL=https://platform.tiresias.network'
      - '-t'
      - 'us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing:v1.1.0'
      - '-f'
      - 'portal-marketing/Dockerfile'
      - './portal-marketing'

  - name: 'gcr.io/cloud-builders/docker'
    id: 'push-marketing'
    args:
      - 'push'
      - 'us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing:v1.1.0'
    waitFor: ['build-marketing']

images:
  - 'us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing:v1.1.0'

options:
  machineType: 'E2_HIGHCPU_8'
  logging: GCS_ONLY

timeout: '1200s'
```

NOTE: The Dockerfile at `portal-marketing/Dockerfile` uses `--build-arg` for `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_PLATFORM_URL`. These are baked into the static build at compile time — runtime env vars in the k8s manifest do NOT override them. The values above must match production exactly.

---

### Step 1.2: Submit Cloud Build

Run from the repo root (where `cloudbuild-marketing.yaml` lives):

```bash
cd /z/tiresias

gcloud builds submit \
  --config=cloudbuild-marketing.yaml \
  --project=salucainfrastructure \
  .
```

Expected: Build takes 3-8 minutes. Watch output for any npm ci or npm run build errors. The final line should read `SUCCESS`.

If the build fails on `npm ci`, the cause is usually a lock file mismatch. Fix:
```bash
cd /z/tiresias/portal-marketing
npm install   # regenerates package-lock.json
git add package-lock.json
git commit -m "chore: regenerate package-lock.json for marketing build"
# then re-run gcloud builds submit
```

---

### Step 1.3: Verify Image in Artifact Registry

```bash
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing \
  --project=salucainfrastructure \
  --include-tags
```

Confirm you see `v1.1.0` in the list with a recent CREATE_TIME. If you only see `v1.0.0`, the push failed — check Cloud Build logs:

```bash
gcloud builds list --project=salucainfrastructure --limit=5
# Get the build ID of the most recent one
gcloud builds log <BUILD_ID> --project=salucainfrastructure
```

---

### Step 1.4: Update marketing-deployment.yaml

File: `/z/tiresias/k8s/marketing-deployment.yaml`

Find line (currently line ~29):
```
          image: us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing:v1.0.0
```

Change to:
```
          image: us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing:v1.1.0
```

Do NOT change anything else in this file. The env vars (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PLATFORM_URL`, `NODE_ENV`) are runtime vars that the runner stage reads; they are correct as-is, but the pricing values are baked into the static build, so the image tag change is what actually delivers new prices.

---

### Step 1.5: Apply to GKE

```bash
kubectl apply -f /z/tiresias/k8s/marketing-deployment.yaml -n tiresias

# Watch the rollout (terminates when complete)
kubectl rollout status deployment/marketing-portal -n tiresias --timeout=120s
```

Expected output: `deployment "marketing-portal" successfully rolled out`

If rollout hangs beyond 2 minutes:
```bash
kubectl describe deployment marketing-portal -n tiresias
kubectl describe pods -n tiresias -l app=marketing-portal
# Look for ImagePullBackOff — means image tag doesn't exist in registry; go back to Step 1.3
# Look for CrashLoopBackOff — container starts then dies; check logs:
kubectl logs -n tiresias -l app=marketing-portal --tail=50
```

---

### Step 1.6: Verify Deployment

```bash
# 1. Pod is running with new image
kubectl get pods -n tiresias -l app=marketing-portal -o wide
# STATUS should be Running

# 2. Confirm new image tag is live
kubectl get deployment marketing-portal -n tiresias \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
# Expected: ...marketing:v1.1.0

# 3. Check pricing page HTML has correct dollar values
# (may need Cloudflare cache purge first — see Step 1.7)
curl -s https://tiresias.network/pricing | grep -o '\$[0-9,]*' | sort -u
# Expected: $1,982  $199  $24,890  $2,499  $488  $49

# 4. Also spot-check the page loads without JS errors (check for <title> tag)
curl -sI https://tiresias.network/pricing | grep -E "HTTP|content-type"
# Expected: HTTP/2 200, content-type: text/html
```

---

### Step 1.7: Purge Cloudflare Cache

tiresias.network is behind Cloudflare. After deploying, purge cache or pricing page may serve stale HTML.

**Option A — Dashboard (no token needed):**
1. Log into Cloudflare dashboard → tiresias.network zone
2. Caching → Cache Purge → Purge Everything (or Custom Purge → URL: `https://tiresias.network/pricing`)

**Option B — API (requires token with Cache Purge permission):**
```bash
# Get zone ID first
curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=tiresias.network" \
  -H "Authorization: Bearer <CF_TOKEN>" \
  -H "Content-Type: application/json" | python -c "import sys,json; z=json.load(sys.stdin); print(z['result'][0]['id'])"

# Then purge
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache" \
  -H "Authorization: Bearer <CF_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything": true}'
```

The CF_TOKEN for cache purge is NOT currently stored in tiresias-secrets. If Option A was not done manually, note this as a blocker and do it in the dashboard.

---

### Rollback Plan (Phase 1)

If the new marketing build is broken (page 500s, renders blank, etc.):

```bash
# Revert image tag in the manifest
# Edit /z/tiresias/k8s/marketing-deployment.yaml
# Change v1.1.0 back to v1.0.0

kubectl apply -f /z/tiresias/k8s/marketing-deployment.yaml -n tiresias
kubectl rollout status deployment/marketing-portal -n tiresias --timeout=120s
```

The old `v1.0.0` image is still in Artifact Registry and will pull immediately. Rollback takes under 2 minutes.

---

## Phase 2: Platform App Deploy (HIGH RISK)
### Goal: Update portal deployment from running image v1.0.0 to current HEAD (build as v2.5.0)
### Risk: HIGH — Alembic multi-head conflicts, env var reconciliation, INTERNAL_API_KEY exposure, COOKIE_DOMAIN session-reset side-effect
### Estimated time: 2-3 hours with staging validation
### Prerequisites: Phase 1 complete; production DB backup taken (Step 2.2); Alembic conflicts resolved locally (Step 2.1)

**CRITICAL NOTE:** The live `portal` deployment is running `portal:v1.0.0`. The manifest file `k8s/portal-deployment.yaml` references `v2.4.5` but this was never applied. The manifest also contains `COOKIE_DOMAIN=.tiresias.network` which will force ALL users to re-login when applied. Read Step 2.4 carefully before proceeding.

---

### Step 2.1: Resolve Alembic Multi-Head Conflicts

**Current multi-head conflicts (confirmed from file listing):**

| Slot | File A | File B | Both claim |
|------|--------|--------|-----------|
| 0002 | `0002_add_waitlist_table.py` (Revises: 0001, Date: 2026-03-22) | `0002_mssp_tenant_hierarchy.py` (Revises: 0001, Date: 2026-03-21) | Revision ID: 0002 |
| 0020 | `0020_add_partner_type.py` (Revises: 0019, Date: 2026-04-06) | `0020_saas_proxy_mode.py` (Revises: 0019, Date: 2026-04-04) | Revision ID: 0020 |
| 0021 | `0021_add_partner_admin_columns.py` (Revises: 0020, Date: 2026-04-06) | `0021_policy_deploy_keys.py` (Revises: 0020, Date: 2026-04-04) | Revision ID: 0021 |
| 0022 | `0022_add_webhook_idempotency.py` (Revises: 0021, Date: 2026-04-06) | `0022_policy_history.py` (Revises: 0021, Date: 2026-04-04) | Revision ID: 0022 |

`0023_add_partner_applications.py` (Revises: 0022, Date: 2026-04-06) is a terminal leaf — it resolves correctly once 0022 is disambiguated.

**Strategy: Rename the older (saas_proxy_mode branch) files into a distinct chain.**

The `_mssp_tenant_hierarchy` / `_saas_proxy_mode` / `_policy_deploy_keys` / `_policy_history` chain appears to predate the partner channel additions. Treat the saas/policy branch as the "b" chain and renumber it so both chains coexist cleanly.

```bash
cd /z/tiresias/alembic/versions

# Step 2.1a — Assign new revision IDs to the saas/policy branch
# Rename files (DO NOT just mv — also edit revision ID and down_revision inside each file)

# 0002_mssp_tenant_hierarchy.py: rename to 0002b and set revision_id = "0002b"
cp 0002_mssp_tenant_hierarchy.py 0002b_mssp_tenant_hierarchy.py
# Edit 0002b_mssp_tenant_hierarchy.py:
#   revision: str = "0002b"
#   down_revision: Union[str, Sequence[str], None] = "0001"

# 0020_saas_proxy_mode.py: rename to 0020b and set revision_id = "0020b"
cp 0020_saas_proxy_mode.py 0020b_saas_proxy_mode.py
# Edit 0020b_saas_proxy_mode.py:
#   revision: str = "0020b"
#   down_revision: Union[str, Sequence[str], None] = "0019"

# 0021_policy_deploy_keys.py: rename to 0021b, revises 0020b
cp 0021_policy_deploy_keys.py 0021b_policy_deploy_keys.py
# Edit 0021b_policy_deploy_keys.py:
#   revision: str = "0021b"
#   down_revision: Union[str, Sequence[str], None] = "0020b"

# 0022_policy_history.py: rename to 0022b, revises 0021b
cp 0022_policy_history.py 0022b_policy_history.py
# Edit 0022b_policy_history.py:
#   revision: str = "0022b"
#   down_revision: Union[str, Sequence[str], None] = "0021b"

# Remove originals that caused conflicts
rm 0002_mssp_tenant_hierarchy.py 0020_saas_proxy_mode.py 0021_policy_deploy_keys.py 0022_policy_history.py
```

After the above, you have two linear chains both rooted at 0001:
- Chain A (partner/waitlist): 0001 -> 0002 -> 0003 -> ... -> 0019 -> 0020 -> 0021 -> 0022 -> 0023
- Chain B (mssp/proxy/policy): 0001 -> 0002b -> 0020b -> 0021b -> 0022b

Alembic supports multiple heads. Verify:

```bash
cd /z/tiresias
python -m alembic heads
# Should show two heads: 0023 and 0022b
# If it shows errors about duplicate revision IDs, check the file edits above
```

**Test migrations on a local or staging database before running in prod:**

```bash
# Using a local postgres (adjust DATABASE_URL as needed)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tiresias_test"
createdb tiresias_test  # if it doesn't exist

python -m alembic upgrade heads
# Should apply all migrations from both chains

# Verify tables were created
psql tiresias_test -c "\dt _soul*" | head -30
```

If `alembic upgrade heads` fails, read the error carefully — it will name the exact revision that failed and why (usually a column already exists or a table constraint mismatch).

---

### Step 2.2: Take Production Database Backup

**Before running any migration in production, take a full backup.**

```bash
# Get the Cloud SQL instance name
gcloud sql instances list --project=salucainfrastructure
# Expected: something like tiresias-db or tiresias-postgres

# Take an on-demand backup
gcloud sql backups create \
  --instance=<CLOUD_SQL_INSTANCE_NAME> \
  --project=salucainfrastructure \
  --description="pre-deploy-2026-04-07"

# Verify backup completed
gcloud sql backups list --instance=<CLOUD_SQL_INSTANCE_NAME> --project=salucainfrastructure | head -5
```

Alternatively, use `pg_dump` via Cloud SQL Auth Proxy if you need a portable backup:

```bash
# In a separate terminal, start Cloud SQL Auth Proxy
./cloud-sql-proxy <PROJECT:REGION:INSTANCE> --port=5432 &

# Then dump
pg_dump -h 127.0.0.1 -U <DB_USER> -d <DB_NAME> \
  -F c -f /z/tiresias/backups/prod_backup_2026-04-07.dump

# Stop the proxy after
kill %1
```

Do not proceed to Step 2.3 until backup is confirmed.

---

### Step 2.3: Run Migrations on Production

Get the current migration state of production first:

```bash
# Exec into the running portal pod to run alembic
PORTAL_POD=$(kubectl get pods -n tiresias -l app=portal -o jsonpath='{.items[0].metadata.name}')
echo "Pod: $PORTAL_POD"

kubectl exec -n tiresias $PORTAL_POD -- python -m alembic current
# This shows which revision ID the production DB is currently at
```

If the portal pod doesn't have alembic installed, use a Cloud SQL Proxy approach instead — start the proxy, run alembic locally against the prod DB URL. Get the prod DB URL from the running pod env:

```bash
kubectl exec -n tiresias $PORTAL_POD -- env | grep DATABASE_URL
```

Once you have the prod DB URL:

```bash
# Run alembic upgrade (dry-run with --sql first to review SQL)
export DATABASE_URL="<PROD_DB_URL>"
cd /z/tiresias

python -m alembic upgrade heads --sql > /tmp/migration-preview.sql 2>&1
# Review /tmp/migration-preview.sql carefully before applying

# If the SQL looks correct, apply for real
python -m alembic upgrade heads
```

**Verification queries after migration:**

```bash
psql $DATABASE_URL -c "SELECT version_num FROM alembic_version;"
# Should show both terminal heads (0023 and 0022b)

psql $DATABASE_URL -c "\dt _soul*" | head -30
# Should include tables from all migrations: _soul_partners, _partner_applications, _stripe_webhook_events, etc.
```

---

### Step 2.4: Reconcile k8s/portal-deployment.yaml Env Vars

**Current state discrepancy (confirmed from kubectl output vs manifest):**

| Env Var | Live in production | In k8s/portal-deployment.yaml | Action |
|---------|-------------------|-------------------------------|--------|
| `NEXT_PUBLIC_SOULAUTH_API_URL` | `https://tiresias.network` | `http://soulauth.tiresias.svc.cluster.local` | CONFLICT — see note below |
| `NEXT_PUBLIC_SOULWATCH_API_URL` | `http://soulwatch.tiresias.svc.cluster.local` | same | OK |
| `NEXT_PUBLIC_SOULGATE_API_URL` | `http://soulgate.tiresias.svc.cluster.local` | same | OK |
| `SOULAUTH_INTERNAL_URL` | `http://soulauth.tiresias.svc.cluster.local` | missing | ADD |
| `INTERNAL_API_KEY` | `316a52620817d15ed1d76bea783a26497aeb2b45124c11f838da75d1724587d0` (plaintext!) | missing | ADD as secretKeyRef (Step 2.5) |
| `STRIPE_PRICE_STARTER_MONTHLY` | `price_1TDMSlBkXMYmrc2L29W09pQl` | same | OK |
| `STRIPE_PRICE_STARTER_ANNUAL` | `price_1TDMSlBkXMYmrc2LuuaUN5Cp` | same | OK |
| `STRIPE_PRICE_PRO_MONTHLY` | `price_1TDMT2BkXMYmrc2Lhf1whQpi` | same | OK |
| `STRIPE_PRICE_PRO_ANNUAL` | `price_1TDMT2BkXMYmrc2LnBUoJEww` | same | OK |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | missing from live | `price_1TDjH4BkXMYmrc2LBA1vL1qs` | ADD |
| `STRIPE_PRICE_ENTERPRISE_ANNUAL` | missing from live | `""` (empty — contact-sales only) | ADD as empty string |
| `COOKIE_DOMAIN` | missing from live | `.tiresias.network` | DANGER — causes forced re-login of ALL users; defer |
| `NODE_ENV` | `production` | `production` | OK |
| `NEXT_PUBLIC_APP_URL` | `https://tiresias.network` | `https://tiresias.network` | OK |

**NEXT_PUBLIC_SOULAUTH_API_URL conflict:** The manifest has the internal cluster URL (`http://soulauth.tiresias.svc.cluster.local`) but live has the public URL (`https://tiresias.network`). This is a NEXT_PUBLIC_ var baked at build time in Next.js — the runtime env override has no effect on already-built pages. The build arg in `cloudbuild.yaml` uses the internal cluster URL (`--build-arg NEXT_PUBLIC_SOULAUTH_API_URL=http://soulauth.tiresias.svc.cluster.local`), which is what the new image will be built with. The k8s manifest value is therefore irrelevant for the built bundle but should match for consistency. Leave it as the internal URL in the manifest.

**COOKIE_DOMAIN decision:** Setting `.tiresias.network` will break every user's active session. This is a one-time cost that enables cross-subdomain cookie sharing (tiresias.network + platform.tiresias.network same session). Confirm with Cristian before applying. For this deploy, **remove COOKIE_DOMAIN from the manifest** — it can be added in a dedicated follow-up with advance user notice.

Edit `/z/tiresias/k8s/portal-deployment.yaml`:

1. Remove these lines entirely (currently near the bottom of the env block):
```yaml
            # Phase 3 — Portal Split Spec: cross-domain cookies for tiresias.network + platform.tiresias.network
            # Setting this causes a one-time session reset: all users must re-login.
            - name: COOKIE_DOMAIN
              value: ".tiresias.network"
```

2. Add `SOULAUTH_INTERNAL_URL` after `NODE_ENV`:
```yaml
            - name: SOULAUTH_INTERNAL_URL
              value: "http://soulauth.tiresias.svc.cluster.local"
```

3. Add `INTERNAL_API_KEY` as a secretKeyRef (after SOULAUTH_INTERNAL_URL):
```yaml
            - name: INTERNAL_API_KEY
              valueFrom:
                secretKeyRef:
                  name: tiresias-secrets
                  key: internal-api-key
```

4. Confirm `STRIPE_PRICE_ENTERPRISE_MONTHLY` and `STRIPE_PRICE_ENTERPRISE_ANNUAL` are already present in the manifest (they are — verified in the file read above). No change needed.

---

### Step 2.5: Add INTERNAL_API_KEY to tiresias-secrets

The key `316a52620817d15ed1d76bea783a26497aeb2b45124c11f838da75d1724587d0` is currently a plaintext env var in production. It must be moved to the k8s Secret before the new manifest is applied.

```bash
# Check what keys are already in tiresias-secrets
kubectl get secret tiresias-secrets -n tiresias -o jsonpath='{.data}' | \
  python -c "import sys,json; [print(k) for k in json.loads(sys.stdin.read()).keys()]"
# Expected keys: stripe-secret-key, stripe-webhook-secret
# If internal-api-key is already there, skip the kubectl patch below

# Add internal-api-key to the secret
# The value must be base64 encoded
echo -n "316a52620817d15ed1d76bea783a26497aeb2b45124c11f838da75d1724587d0" | base64
# Output: MzE2YTUyNjIwODE3ZDE1ZWQxZDc2YmVhNzgzYTI2NDk3YWViMmI0NTEyNGMxMWY4MzhkYTc1ZDE3MjQ1ODdkMA==

kubectl patch secret tiresias-secrets -n tiresias \
  --type='json' \
  -p='[{"op":"add","path":"/data/internal-api-key","value":"MzE2YTUyNjIwODE3ZDE1ZWQxZDc2YmVhNzgzYTI2NDk3YWViMmI0NTEyNGMxMWY4MzhkYTc1ZDE3MjQ1ODdkMA=="}]'

# Verify
kubectl get secret tiresias-secrets -n tiresias -o jsonpath='{.data.internal-api-key}' | base64 -d
# Expected: 316a52620817d15ed1d76bea783a26497aeb2b45124c11f838da75d1724587d0
```

---

### Step 2.6: Build Portal Image

The new portal image will be tagged `v2.5.0` (matching `cloudbuild-portal.yaml` which already exists). Review the file at `/z/tiresias/cloudbuild-portal.yaml` — it builds with:

```
--build-arg NEXT_PUBLIC_SOULAUTH_API_URL=http://partner-api.partner-portal.svc.cluster.local
```

**WARNING:** This build arg URL (`http://partner-api.partner-portal.svc.cluster.local`) points to the partner-portal namespace service, NOT the tiresias namespace. The main `cloudbuild.yaml` uses `http://soulauth.tiresias.svc.cluster.local`. These are different. The current live portal was built with `https://tiresias.network` (per the kubectl env output, though this is runtime-only for NEXT_PUBLIC_ vars).

Before building, confirm which `NEXT_PUBLIC_SOULAUTH_API_URL` value the new portal should use. The auth API in the portal app calls this URL from the browser. It should be a URL reachable by end-user browsers, not a cluster-internal URL. The correct value is almost certainly `https://tiresias.network` or `https://platform.tiresias.network`.

Edit `cloudbuild-portal.yaml` build arg accordingly before submitting:

```bash
# If NEXT_PUBLIC_SOULAUTH_API_URL should be https://tiresias.network:
# Change the --build-arg line in cloudbuild-portal.yaml from:
#   'NEXT_PUBLIC_SOULAUTH_API_URL=http://partner-api.partner-portal.svc.cluster.local'
# to:
#   'NEXT_PUBLIC_SOULAUTH_API_URL=https://tiresias.network'
```

Submit the build:

```bash
cd /z/tiresias
gcloud builds submit \
  --config=cloudbuild-portal.yaml \
  --project=salucainfrastructure \
  .
```

Expected: 8-15 minutes (E2_HIGHCPU_8). Watch for TypeScript compile errors or test failures.

---

### Step 2.7: Update portal-deployment.yaml Image Tag

File: `/z/tiresias/k8s/portal-deployment.yaml`

Find (around line 20):
```yaml
          image: us-central1-docker.pkg.dev/salucainfrastructure/tiresias/portal:v2.4.5
```

Change to:
```yaml
          image: us-central1-docker.pkg.dev/salucainfrastructure/tiresias/portal:v2.5.0
```

---

### Step 2.8: Apply to GKE

```bash
# Apply the updated manifest
kubectl apply -f /z/tiresias/k8s/portal-deployment.yaml -n tiresias

# Watch rollout (2 replicas, RollingUpdate with maxUnavailable: 1)
kubectl rollout status deployment/portal -n tiresias --timeout=300s
```

The rollout creates 1 new pod, waits for it to pass readiness probe, then terminates the old pod, then creates the 2nd new pod. Total time: 2-4 minutes assuming the image pulls fast.

If rollout stalls:
```bash
# Check events
kubectl describe deployment portal -n tiresias | tail -30

# Check pod status
kubectl get pods -n tiresias -l app=portal

# Check logs of the new pod
NEW_POD=$(kubectl get pods -n tiresias -l app=portal --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}')
kubectl logs -n tiresias $NEW_POD --tail=100
```

---

### Step 2.9: Verify Platform App

```bash
# 1. Confirm image tag
kubectl get deployment portal -n tiresias \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
# Expected: ...portal:v2.5.0

# 2. Check dashboard root loads (expect redirect to login if not authed)
curl -sI https://platform.tiresias.network/ | head -5
# Expected: HTTP/2 200 or 302 redirect to /login

# 3. Verify SoulAuth health (auth flow dependency)
curl -s https://platform.tiresias.network/health | python -m json.tool
# Expected: {"status": "ok"} or similar

# 4. Verify billing webhook endpoint is still reachable (critical — on tiresias.network, not platform)
curl -sI https://tiresias.network/api/billing/webhook
# Expected: 405 Method Not Allowed (POST required) or 400 — NOT 404

# 5. Verify INTERNAL_API_KEY is now available as env var (not plaintext)
PORTAL_POD=$(kubectl get pods -n tiresias -l app=portal -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n tiresias $PORTAL_POD -- env | grep INTERNAL_API_KEY
# Expected: INTERNAL_API_KEY=316a52620817d15ed1d76bea783a26497aeb2b45124c11f838da75d1724587d0
# (value is correct, now sourced from k8s secret instead of plaintext manifest)

# 6. Verify SOULAUTH_INTERNAL_URL is present
kubectl exec -n tiresias $PORTAL_POD -- env | grep SOULAUTH_INTERNAL_URL
# Expected: SOULAUTH_INTERNAL_URL=http://soulauth.tiresias.svc.cluster.local

# 7. Verify STRIPE_PRICE_ENTERPRISE_MONTHLY is present
kubectl exec -n tiresias $PORTAL_POD -- env | grep STRIPE_PRICE_ENTERPRISE
# Expected:
# STRIPE_PRICE_ENTERPRISE_MONTHLY=price_1TDjH4BkXMYmrc2LBA1vL1qs
# STRIPE_PRICE_ENTERPRISE_ANNUAL=

# 8. Verify COOKIE_DOMAIN is NOT set (we intentionally removed it)
kubectl exec -n tiresias $PORTAL_POD -- env | grep COOKIE_DOMAIN
# Expected: (empty output — variable should not exist)
```

---

### Step 2.10: Post-Deploy Verification Checklist

Run through this manually in a browser with a fresh incognito window:

```
[ ] tiresias.network loads without errors
[ ] tiresias.network/pricing shows correct pricing:
      Starter $49/mo | $488/yr
      Pro $199/mo | $1,982/yr
      Enterprise $2,499/mo | $24,890/yr
[ ] platform.tiresias.network/ redirects to login (not 500, not blank)
[ ] Login with a test account works (SoulAuth handshake completes)
[ ] Dashboard loads after login (not blank, no console errors about missing env vars)
[ ] Billing page loads (Stripe price IDs are being read correctly)
[ ] Enterprise tier shows "Contact Sales" (no self-serve checkout button)
[ ] Existing user sessions are NOT invalidated (COOKIE_DOMAIN not applied)
[ ] Stripe webhook test: send test event from Stripe dashboard -> 200 response
[ ] kubectl get pods -n tiresias -> all pods Running, low restarts
[ ] kubectl top pods -n tiresias -> memory not spiking above limits
```

---

### Rollback Plan (Phase 2)

**If portal pods crash or auth is broken:**

```bash
# Revert image tag in manifest
# Edit /z/tiresias/k8s/portal-deployment.yaml
# Change image back to: portal:v1.0.0

kubectl apply -f /z/tiresias/k8s/portal-deployment.yaml -n tiresias
kubectl rollout status deployment/portal -n tiresias --timeout=300s
```

**If migrations broke the database:**

```bash
# Check what migration version prod is at
python -m alembic current

# Roll back to the last known-good revision
# (use the revision ID from `alembic current` output before the failed migration)
python -m alembic downgrade <LAST_GOOD_REVISION_ID>

# If alembic downgrade fails (e.g. migration has no downgrade path),
# restore from the Cloud SQL backup taken in Step 2.2:
gcloud sql backups restore <BACKUP_ID> \
  --restore-instance=<CLOUD_SQL_INSTANCE_NAME> \
  --project=salucainfrastructure
# WARNING: This overwrites the entire database. Only use as last resort.
```

---

## Phase 3: CI/CD Fix (MEDIUM)
### Goal: Fix the broken deploy workflow so future changes auto-deploy
### Estimated time: 1-2 hours
### Prerequisites: Phases 1 and 2 complete

### Step 3.1: Fix ModuleNotFoundError in test_database_isolation.py

```bash
# Find the test file
grep -rn "ModuleNotFoundError\|import.*database_isolation\|from.*database_isolation" \
  /z/tiresias/tests/ 2>/dev/null | head -20

# Also check CI logs to get exact error
# Look at .github/workflows/ for the failing workflow
ls /z/tiresias/.github/workflows/
cat /z/tiresias/.github/workflows/deploy.yml  # or whatever the CI file is named
```

Common cause: a module moved or was renamed without updating the test import. Fix the import path, then verify:

```bash
cd /z/tiresias
python -m pytest tests/test_database_isolation.py -v
```

### Step 3.2: Add portal-marketing Path Trigger to Deploy Workflow

Edit the deploy workflow YAML (path TBD — check `.github/workflows/`). Add a path trigger so pushes to `portal-marketing/**` trigger the marketing build:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'portal-marketing/**'   # ADD THIS
      - 'portal/**'
      - 'k8s/**'
      - 'alembic/**'
      - 'src/**'
```

Also add a job that runs `cloudbuild-marketing.yaml` when the `portal-marketing/**` path is matched.

### Step 3.3: Reconcile Version Numbering

Current version chaos:
- `cloudbuild.yaml` builds everything at `v2.4.5`
- `cloudbuild-portal.yaml` builds portal at `v2.5.0`
- `cloudbuild-marketing.yaml` (new) builds marketing at `v1.1.0`
- `k8s/portal-deployment.yaml` references `v2.4.5` (stale)
- `k8s/marketing-deployment.yaml` references `v1.0.0` (stale after Phase 1)

Decide on a versioning strategy: either a single mono-version for all images, or independent version bumps per component. The latter is cleaner given the split into marketing vs platform. Add a `VERSION` file per component or use git SHA tags in CI.

### Step 3.4: Add Cloudflare Cache Purge Step to Deploy Workflow

After a successful marketing deploy job:

```yaml
- name: Purge Cloudflare cache
  run: |
    curl -s -X POST \
      "https://api.cloudflare.com/client/v4/zones/${{ secrets.CF_ZONE_ID }}/purge_cache" \
      -H "Authorization: Bearer ${{ secrets.CF_CACHE_PURGE_TOKEN }}" \
      -H "Content-Type: application/json" \
      --data '{"purge_everything": true}'
```

Required GitHub Actions secrets to add:
- `CF_ZONE_ID` — the tiresias.network Cloudflare zone ID
- `CF_CACHE_PURGE_TOKEN` — a Cloudflare API token scoped to Cache Purge only

To create the token in Cloudflare: Dashboard -> My Profile -> API Tokens -> Create Token -> Cache Purge template -> select tiresias.network zone.

Store the token value in GitHub repo secrets AND add its location to the Credential Vault Map memory file.

---

## Open Questions (Require Cristian's Input Before Executing)

1. **COOKIE_DOMAIN timing:** When should `COOKIE_DOMAIN=.tiresias.network` be activated? It will log out all current users. Is there a planned maintenance window or user notice to send first?

2. **NEXT_PUBLIC_SOULAUTH_API_URL in portal build:** `cloudbuild-portal.yaml` currently uses `http://partner-api.partner-portal.svc.cluster.local` as the build arg. This looks wrong for the main portal. Should it be `https://tiresias.network`? Confirm before building the new image in Step 2.6.

3. **Alembic multi-head strategy:** The `0002_mssp_tenant_hierarchy` / `0020_saas_proxy_mode` / `0021_policy_deploy_keys` / `0022_policy_history` chain — has production ever run these migrations? If production DB is already at revision 0002 (waitlist) and has never run the mssp/proxy branch, the `0002b` rename approach is safe. If the saas_proxy_mode migration has already been applied, the rename would break alembic's tracking. Confirm current production `alembic_version` rows before proceeding with Step 2.1.

4. **Cloud SQL instance name:** Used in Step 2.2 and the rollback plan. Find it with `gcloud sql instances list --project=salucainfrastructure` — confirm before starting Phase 2.

5. **Marketing site image repo:** Confirm the Artifact Registry repo `tiresias/marketing` already exists (or if only `tiresias/portal` exists and the marketing image needs a new repo created):
   ```bash
   gcloud artifacts repositories list --project=salucainfrastructure --location=us-central1
   ```
   If `tiresias` repo exists and is Docker format, the marketing image push will work without extra setup.
