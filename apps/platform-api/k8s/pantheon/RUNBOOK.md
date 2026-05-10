# Pantheon GCP Day 1 Runbook

This document captures the gcloud + kubectl commands run on **2026-05-10** to provision
the GCP foundations for `pantheon.saluca.com`. It is intentionally complete enough that a
future operator (or a green-field re-deploy of pantheon to a different project) can re-run
the provisioning end-to-end.

## Locked decisions (referenced throughout)

- **Project:** `salucainfrastructure`
- **Region:** `us-central1`
- **Cluster:** `tiresias-prod` (Autopilot)
- **Cloud SQL instance:** `tiresias-db` (existing) — adds new DB `pantheon`, ZONAL HA for now
- **Domain:** `pantheon.saluca.com`
- **Artifact Registry:** `us-central1-docker.pkg.dev/salucainfrastructure/pantheon/`
- **GCP SA:** `pantheon-sa@salucainfrastructure.iam.gserviceaccount.com`
- **k8s namespace:** `pantheon`
- **KSA:** `pantheon-sa` (Workload-Identity-bound to GCP SA)
- **Memory backend:** `MEMORY_BACKEND=postgres` (durability requirement; no emptyDir)
- **Stripe / OIDC / License:** all deferred from MVP
- **Static ingress IP:** `pantheon-ip` = **136.110.201.212**

## Step-by-step

### 1. Service account + project IAM

```bash
gcloud iam service-accounts create pantheon-sa \
  --display-name="Pantheon Workload Identity SA" \
  --project=salucainfrastructure

for role in roles/cloudsql.client roles/cloudsql.instanceUser \
            roles/artifactregistry.reader roles/logging.logWriter \
            roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding salucainfrastructure \
    --member="serviceAccount:pantheon-sa@salucainfrastructure.iam.gserviceaccount.com" \
    --role="$role" --condition=None
done
```

### 2. Artifact Registry

```bash
gcloud artifacts repositories create pantheon \
  --repository-format=docker --location=us-central1 \
  --description="Pantheon container images" \
  --project=salucainfrastructure
```

### 3. Cloud SQL — DB + two users

```bash
gcloud sql databases create pantheon --instance=tiresias-db --project=salucainfrastructure

# Built-in password user (used for cloud-sql-proxy without IAM authn)
PANTHEON_DB_PWD="$(openssl rand -base64 32)"  # captured to a 0600 tmp file, not stdout
gcloud sql users create pantheon \
  --instance=tiresias-db --password="$PANTHEON_DB_PWD" \
  --project=salucainfrastructure

# IAM-authn user (for KSA via cloud-sql-proxy --auto-iam-authn)
gcloud sql users create pantheon-sa@salucainfrastructure.iam \
  --instance=tiresias-db --type=cloud_iam_service_account \
  --project=salucainfrastructure
```

### 4. Static IP

```bash
gcloud compute addresses create pantheon-ip --global --project=salucainfrastructure
gcloud compute addresses describe pantheon-ip --global --format='value(address)'
# -> 136.110.201.212  (this is what Cloudflare DNS for pantheon.saluca.com must point to)
```

### 5. Namespace + KSA + Workload Identity binding

```bash
kubectl create namespace pantheon
kubectl create serviceaccount pantheon-sa --namespace=pantheon
kubectl annotate serviceaccount pantheon-sa --namespace=pantheon \
  iam.gke.io/gcp-service-account=pantheon-sa@salucainfrastructure.iam.gserviceaccount.com

gcloud iam service-accounts add-iam-policy-binding \
  pantheon-sa@salucainfrastructure.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="serviceAccount:salucainfrastructure.svc.id.goog[pantheon/pantheon-sa]" \
  --project=salucainfrastructure
```

WI verification (one-shot test pod):

```bash
kubectl run pantheon-wi-test --rm --restart=Never --image=google/cloud-sdk:slim \
  --overrides='{"spec":{"serviceAccountName":"pantheon-sa","containers":[{"name":"pantheon-wi-test","image":"google/cloud-sdk:slim","command":["gcloud","auth","print-access-token"]}]}}' \
  --namespace=pantheon
# Expect: ya29.* token printed in logs.
```

### 6. Grant DB privileges to the IAM-authn user (and built-in pantheon user)

Run a one-shot psql Pod in `pantheon` namespace with cloud-sql-proxy sidecar; connect as
the `postgres` superuser (password from `/c/saluca-deploy/.env :: TIRESIAS_POSTGRES_SUPERUSER_PASSWORD`)
and grant on the `pantheon` DB only:

```sql
GRANT ALL PRIVILEGES ON DATABASE pantheon TO "pantheon-sa@salucainfrastructure.iam";
GRANT ALL ON SCHEMA public TO "pantheon-sa@salucainfrastructure.iam";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "pantheon-sa@salucainfrastructure.iam";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "pantheon-sa@salucainfrastructure.iam";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO "pantheon-sa@salucainfrastructure.iam";
GRANT ALL PRIVILEGES ON DATABASE pantheon TO pantheon;
GRANT ALL ON SCHEMA public TO pantheon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pantheon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO pantheon;
```

The superuser password is injected into the Pod via a transient `pantheon-superuser-pw`
k8s Secret that is deleted immediately after the grants succeed.

### 7. Secret Manager — 8 secrets

| Secret name                    | Source                                              |
|--------------------------------|-----------------------------------------------------|
| `pantheon-database-url`        | `postgresql+asyncpg://pantheon:$PWD@127.0.0.1:5432/pantheon` |
| `pantheon-database-url-sync`   | `postgresql://pantheon:$PWD@127.0.0.1:5432/pantheon`         |
| `pantheon-session-secret`      | `openssl rand -hex 32`                              |
| `pantheon-jwt-private-key`     | `openssl ecparam -name prime256v1 -genkey -noout`   |
| `pantheon-jwt-public-key`      | derived from private (`openssl ec -pubout`)         |
| `pantheon-jwt-kid`             | literal `pantheon-2026-05`                          |
| `pantheon-internal-api-key`    | `openssl rand -hex 32`                              |
| `pantheon-memory-service-key`  | `openssl rand -hex 32`                              |

Per secret:
```bash
gcloud secrets create $NAME --replication-policy=automatic --project=salucainfrastructure
gcloud secrets versions add $NAME --data-file=$LOCAL_FILE --project=salucainfrastructure
gcloud secrets add-iam-policy-binding $NAME \
  --member="serviceAccount:pantheon-sa@salucainfrastructure.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor --project=salucainfrastructure
```

### 8. Sync into k8s `pantheon-secrets`

```bash
./scripts/provision-pantheon-secrets.sh
```

The script is idempotent: if `pantheon-secrets` exists, it is deleted and recreated so a
rotation in Secret Manager flows through cleanly.

## Verification (post-Day-1)

```bash
kubectl get namespace pantheon
kubectl get sa pantheon-sa -n pantheon -o yaml          # WI annotation present
kubectl get secret pantheon-secrets -n pantheon         # 8 keys
kubectl apply --dry-run=server -k apps/platform-api/k8s/pantheon/   # clean
gcloud sql databases list --instance=tiresias-db
gcloud secrets list --project=salucainfrastructure --filter="name~pantheon-"
gcloud compute addresses describe pantheon-ip --global
```

## What Day 1 did NOT do (handed to Day 2/3)

- Push container images to `pantheon` Artifact Registry (Day 2; CD workflow update needed).
- `kubectl apply -k` the manifests for real (Day 2; after images exist).
- Run the `pantheon-migrate` Job (Day 2; after images exist).
- Create Cloudflare DNS A record `pantheon.saluca.com -> 136.110.201.212` (Day 3).
- Verify ManagedCertificate provisioning (Day 3; depends on DNS).
