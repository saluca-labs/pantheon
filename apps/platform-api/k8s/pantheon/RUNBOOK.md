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

## Day 3 — Fresh-deploy ACME chicken-and-egg (FrontendConfig HTTPS redirect)

**Problem (observed 2026-05-09):** On the first apply, `pantheon-cert` (ManagedCertificate)
got stuck in `Provisioning` and never moved to `Active`. Root cause: `pantheon-frontend`
(FrontendConfig) ships with `redirectToHttps.enabled: true`, so the GCE LB 301-redirected
the Let's Encrypt **HTTP-01** ACME challenge from `http://pantheon.saluca.com/.well-known/acme-challenge/...`
to `https://...` BEFORE the certificate that would terminate that HTTPS request existed.
ACME validation requires a 200 on the plaintext HTTP challenge URL; a 301 fails the check.
This is a documented GKE gotcha — see Google issue tracker for the GCE Ingress controller.

**Resolution flow (run on every fresh ingress + cert + frontendconfig stand-up):**

1. **Apply the bundle with the redirect disabled.** Either temporarily flip `enabled: false`
   in `ingress.yaml` (the FrontendConfig stanza at the bottom of the file) or apply with a
   patch:
   ```bash
   kubectl apply -k apps/platform-api/k8s/pantheon/
   kubectl patch frontendconfig pantheon-frontend -n pantheon --type=merge \
     -p '{"spec":{"redirectToHttps":{"enabled":false}}}'
   ```
2. **Confirm DNS resolves to the static IP.** ACME hits the apex `A` record:
   ```bash
   dig +short pantheon.saluca.com   # expect 136.110.201.212
   ```
3. **Poll for `ManagedCertificate` to reach `Active`.** Typical wall-clock: 15–60 min after
   DNS is correct; can take up to a few hours on first issuance.
   ```bash
   kubectl get managedcertificate pantheon-cert -n pantheon \
     -o jsonpath='{.status.certificateStatus}{"\n"}'
   # Loop until output is "Active":
   until [ "$(kubectl get managedcertificate pantheon-cert -n pantheon \
                -o jsonpath='{.status.certificateStatus}')" = "Active" ]; do
     echo "cert status: $(kubectl get managedcertificate pantheon-cert -n pantheon \
       -o jsonpath='{.status.certificateStatus}') — waiting 30s"
     sleep 30
   done
   ```
   Useful detail when stuck:
   ```bash
   kubectl describe managedcertificate pantheon-cert -n pantheon
   # look at status.domainStatus[].status — should be FailedNotVisible / Provisioning / Active
   ```
4. **Re-enable the HTTPS redirect.** Either revert the `enabled: false` edit in
   `ingress.yaml` and `kubectl apply -k ...` again, or patch in place:
   ```bash
   kubectl patch frontendconfig pantheon-frontend -n pantheon --type=merge \
     -p '{"spec":{"redirectToHttps":{"enabled":true,"responseCodeName":"MOVED_PERMANENTLY_DEFAULT"}}}'
   ```
5. **Verify end-to-end.** A plain `curl http://pantheon.saluca.com/` should now `301` to
   the `https://` equivalent and the HTTPS endpoint should serve a valid cert:
   ```bash
   curl -sSI http://pantheon.saluca.com/ | head -n1   # HTTP/1.1 301 Moved Permanently
   curl -sSI https://pantheon.saluca.com/ | head -n1  # HTTP/2 200 (or 3xx, but TLS valid)
   echo | openssl s_client -connect pantheon.saluca.com:443 -servername pantheon.saluca.com 2>/dev/null \
     | openssl x509 -noout -issuer -dates
   ```

**Why we didn't automate this in an apply script:** there is no apply script — `kubectl apply -k`
is the deploy primitive, and adding a wrapper just to handle the first-issuance window
introduces an orchestration layer that doesn't earn its keep. The two-step is rare (only on
a new cluster + new domain pair) and the manual flow above is unambiguous.

**When this section becomes obsolete:** if/when we migrate the LB to use a Google-issued
**Certificate Manager** cert (CCM, not the in-cluster `ManagedCertificate` CRD) or move to
DNS-01 validation via cert-manager + Cloudflare, the ACME-over-HTTP path goes away and the
redirect can be on from t=0. Until then, follow the flow above on every fresh stand-up.
