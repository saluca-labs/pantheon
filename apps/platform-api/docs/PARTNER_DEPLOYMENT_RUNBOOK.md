# Partner Program Deployment Runbook

Operational guide for deploying the Tiresias partner program to GKE (tiresias-v2 cluster).

## Prerequisites

- `kubectl` configured for the `tiresias-v2` cluster in `us-central1`
- GCP Secret Manager access for `salucainfrastructure` project
- Stripe CLI authenticated (`stripe login`)
- Partner secrets provisioned in GCP Secret Manager
- Docker authenticated to Artifact Registry: `gcloud auth configure-docker us-central1-docker.pkg.dev`

## First-time Deployment

### 1. Provision partner secrets

Run the provisioning script to create all required secrets in GCP Secret Manager and sync them to the K8s cluster:

```bash
bash scripts/provision-partner-secrets.sh
```

This creates: `STRIPE_PARTNER_SECRET_KEY`, `STRIPE_PARTNER_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, and `PARTNER_JWT_SECRET`.

### 2. Run Stripe setup

Configure Stripe products, prices, and webhook endpoints for the partner program:

```bash
bash scripts/stripe-partner-setup.sh
```

Verify the webhook endpoint is active in the Stripe Dashboard under Developers > Webhooks.

### 3. Build and push the SoulAuth partner image

Trigger Cloud Build:

```bash
gcloud builds submit --config=cloudbuild-partner.yaml .
```

Or push to `main` with changes in `src/partner/` to trigger the GitHub Actions workflow automatically.

### 4. Apply partner overlay to SoulAuth deployment

Ensure the SoulAuth deployment manifest references the partner image tag:

```bash
kubectl apply -f k8s/soulauth-deployment.yaml
```

### 5. Run database migrations

Apply the partner program migration (002):

```bash
kubectl apply -f k8s/partner-migrate-job.yaml
kubectl wait --for=condition=complete job/partner-migrate -n tiresias --timeout=120s
```

### 6. Deploy

Run the full deployment script:

```bash
bash scripts/deploy-partner-program.sh
```

### 7. Verify

Run these checks to confirm the deployment is healthy:

```bash
# Health check
kubectl exec -n tiresias deploy/soulauth -- curl -s http://localhost:8000/health

# Partner API returns 401 without auth
curl -s -o /dev/null -w "%{http_code}" https://api.tiresias.saluca.com/v1/partners/me
# Expected: 401

# Admin API accessible with admin token
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://api.tiresias.saluca.com/v1/admin/partners | head -c 200

# Partner dashboard loads
curl -s -o /dev/null -w "%{http_code}" https://portal.tiresias.saluca.com/dashboard/partner
# Expected: 200
```

### 8. Enable tier enforcement

Once verified, switch tier guard from audit to enforce mode:

```bash
kubectl set env deployment/soulauth -n tiresias TIER_GUARD_ENABLED=enforce
kubectl rollout status deployment/soulauth -n tiresias --timeout=120s
```

## Routine Deployment (Updates)

For subsequent deployments after initial setup:

1. Push changes to `main` (paths: `src/partner/**`, `tests/test_partner_*`, `k8s/partner-*`)
2. GitHub Actions runs tests, builds, and deploys automatically
3. Monitor the workflow run in the Actions tab
4. Verify with the health checks above

## Rollback Procedure

### Roll back the deployment

```bash
kubectl rollout undo deployment/soulauth -n tiresias
kubectl rollout status deployment/soulauth -n tiresias --timeout=120s
```

### Roll back migrations (if needed)

If the database migration must be reverted, run alembic downgrade to the pre-partner revision:

```bash
kubectl exec -n tiresias deploy/soulauth -- \
  alembic downgrade 001
```

Replace `001` with the actual pre-partner revision ID from `alembic/versions/`.

## Monitoring

### Audit events

Watch for `tier_guard.constraint_violation` events in the SoulAuth audit log. These indicate partners hitting tier limits:

```bash
kubectl logs -n tiresias deploy/soulauth --since=1h | grep tier_guard
```

### Stripe webhooks

Monitor webhook delivery health in the Stripe Dashboard:
- Navigate to Developers > Webhooks
- Check for failed deliveries or signature mismatches
- Retry failed events if needed

### Slack notifications

The `#partner-ops` Slack channel receives notifications for:
- New partner registrations
- Tier upgrades/downgrades
- Stripe payment failures
- Connect onboarding completions

### Partner dashboard

Verify the partner dashboard is loading and displaying data correctly:
- `/dashboard/partner` should render the partner overview
- `/dashboard/partner/billing` should show Stripe subscription status

## Troubleshooting

### Missing secrets

**Symptom:** SoulAuth fails to start, logs show `KeyError` for partner config values.

**Fix:** Re-run the secret provisioning script and restart the deployment:

```bash
bash scripts/provision-partner-secrets.sh
kubectl rollout restart deployment/soulauth -n tiresias
```

### Stripe webhook signature mismatch

**Symptom:** Partner events not processing; logs show `stripe.error.SignatureVerificationError`.

**Fix:** The webhook signing secret in K8s does not match the Stripe endpoint. Retrieve the correct secret from Stripe Dashboard > Developers > Webhooks > Signing secret, then update:

```bash
kubectl create secret generic partner-stripe-secrets -n tiresias \
  --from-literal=webhook-secret=whsec_XXXXX \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart deployment/soulauth -n tiresias
```

### Migration conflicts

**Symptom:** Migration job fails with `alembic.util.exc.CommandError`.

**Fix:** Check the current migration head and resolve conflicts:

```bash
kubectl exec -n tiresias deploy/soulauth -- alembic current
kubectl exec -n tiresias deploy/soulauth -- alembic history
```

If heads have diverged, merge them locally and push a new migration before redeploying.

### Connect onboarding redirect errors

**Symptom:** Partners see "something went wrong" during Stripe Connect onboarding.

**Fix:** Verify the Connect redirect URIs are correctly configured:

1. Check the `STRIPE_CONNECT_REDIRECT_URI` environment variable on the SoulAuth deployment
2. Ensure the URI is allowlisted in Stripe Dashboard > Connect > Settings > Redirect URIs
3. Confirm the partner's `connect_account_id` exists and is in the correct state:

```bash
stripe accounts retrieve acct_XXXXX
```
