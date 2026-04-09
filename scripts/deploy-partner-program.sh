#!/usr/bin/env bash
# =============================================================================
# Deploy Tiresias Partner Program
# =============================================================================
# Orchestrates the partner program rollout in the correct order:
#   1. Validate prerequisites
#   2. Apply partner secrets
#   3. Run partner database migrations
#   4. Update SoulAuth deployment (with partner env vars)
#   5. Wait for rollout
#   6. Smoke test partner endpoints
#
# Prerequisites:
#   - kubectl configured with tiresias cluster context
#   - Partner secrets provisioned (tiresias-partner-secrets)
#   - SoulAuth image built with partner program code
#   - partner-overlay.yaml changes merged into soulauth-deployment.yaml
#
# Usage:
#   ./scripts/deploy-partner-program.sh [--dry-run] [--skip-migrate] [--skip-smoke]
# =============================================================================

set -euo pipefail

NAMESPACE="tiresias"
TIMEOUT="300s"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "${SCRIPT_DIR}/../k8s" && pwd)"

# Parse flags
DRY_RUN=false
SKIP_MIGRATE=false
SKIP_SMOKE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
    --skip-smoke)  SKIP_SMOKE=true ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--skip-migrate] [--skip-smoke]"
      echo ""
      echo "Flags:"
      echo "  --dry-run        Show what would be applied without making changes"
      echo "  --skip-migrate   Skip database migration step"
      echo "  --skip-smoke     Skip smoke tests after deployment"
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $arg" >&2
      echo "Run $0 --help for usage." >&2
      exit 1
      ;;
  esac
done

KUBECTL="kubectl"
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] No changes will be applied."
  KUBECTL="kubectl --dry-run=client"
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

fail() {
  echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Step 0: Validate prerequisites
# ---------------------------------------------------------------------------

echo "=== Tiresias Partner Program Deployment ==="
echo ""

log "[0/5] Validating prerequisites..."

# Check kubectl connectivity
if ! kubectl cluster-info --request-timeout=5s > /dev/null 2>&1; then
  fail "Cannot connect to Kubernetes cluster. Check your kubeconfig."
fi

# Check namespace exists
if ! kubectl get namespace "$NAMESPACE" > /dev/null 2>&1; then
  fail "Namespace '$NAMESPACE' does not exist."
fi

# Check required files exist
for f in partner-migrate-job.yaml soulauth-deployment.yaml; do
  if [ ! -f "${K8S_DIR}/${f}" ]; then
    fail "Required file not found: k8s/${f}"
  fi
done

# Check that partner secrets file exists (if we need to apply it)
if [ -f "${K8S_DIR}/partner-secrets.yaml" ]; then
  SECRETS_FILE="${K8S_DIR}/partner-secrets.yaml"
  log "  Found partner-secrets.yaml"
else
  log "  WARNING: k8s/partner-secrets.yaml not found."
  log "  Assuming tiresias-partner-secrets already exists in cluster."
  SECRETS_FILE=""
fi

# Verify the secret exists or will be created
if [ -z "$SECRETS_FILE" ]; then
  if ! kubectl get secret tiresias-partner-secrets -n "$NAMESPACE" > /dev/null 2>&1; then
    fail "Secret tiresias-partner-secrets does not exist and no partner-secrets.yaml found."
  fi
  log "  Confirmed: tiresias-partner-secrets exists in cluster."
fi

log "  Prerequisites OK."
echo ""

# ---------------------------------------------------------------------------
# Step 1: Apply partner secrets
# ---------------------------------------------------------------------------

log "[1/5] Applying partner secrets..."

if [ -n "$SECRETS_FILE" ]; then
  $KUBECTL apply -f "$SECRETS_FILE" -n "$NAMESPACE"
  log "  Partner secrets applied."
else
  log "  Skipped (secret already exists in cluster)."
fi

echo ""

# ---------------------------------------------------------------------------
# Step 2: Run partner database migrations
# ---------------------------------------------------------------------------

if [ "$SKIP_MIGRATE" = true ]; then
  log "[2/5] Skipping database migrations (--skip-migrate)."
else
  log "[2/5] Running partner database migrations..."

  # Delete previous job run if it exists (jobs are immutable)
  if kubectl get job tiresias-partner-migrate -n "$NAMESPACE" > /dev/null 2>&1; then
    log "  Deleting previous migration job..."
    kubectl delete job tiresias-partner-migrate -n "$NAMESPACE" --wait=true
  fi

  $KUBECTL apply -f "${K8S_DIR}/partner-migrate-job.yaml" -n "$NAMESPACE"

  if [ "$DRY_RUN" = false ]; then
    log "  Waiting for migration to complete (timeout: ${TIMEOUT})..."
    if ! kubectl wait --for=condition=complete job/tiresias-partner-migrate -n "$NAMESPACE" --timeout="$TIMEOUT"; then
      log "  Migration job did not complete. Fetching logs..."
      kubectl logs job/tiresias-partner-migrate -n "$NAMESPACE" -c migrate --tail=50 || true
      fail "Partner migration failed. Review logs above."
    fi
    log "  Migrations completed successfully."
  fi
fi

echo ""

# ---------------------------------------------------------------------------
# Step 3: Apply updated SoulAuth deployment
# ---------------------------------------------------------------------------

log "[3/5] Updating SoulAuth deployment..."
log "  IMPORTANT: Ensure partner-overlay.yaml env vars have been merged into"
log "  soulauth-deployment.yaml before this step."

$KUBECTL apply -f "${K8S_DIR}/soulauth-deployment.yaml" -n "$NAMESPACE"
log "  SoulAuth deployment applied."

echo ""

# ---------------------------------------------------------------------------
# Step 4: Wait for rollout
# ---------------------------------------------------------------------------

log "[4/5] Waiting for SoulAuth rollout..."

if [ "$DRY_RUN" = false ]; then
  if ! kubectl rollout status deployment/soulauth -n "$NAMESPACE" --timeout="$TIMEOUT"; then
    log "  Rollout did not complete within timeout. Current status:"
    kubectl get pods -n "$NAMESPACE" -l app=soulauth -o wide || true
    fail "SoulAuth rollout failed. Consider rolling back with: kubectl rollout undo deployment/soulauth -n $NAMESPACE"
  fi
  log "  SoulAuth rollout complete."
else
  log "  Skipped (dry run)."
fi

echo ""

# ---------------------------------------------------------------------------
# Step 5: Smoke tests
# ---------------------------------------------------------------------------

if [ "$SKIP_SMOKE" = true ]; then
  log "[5/5] Skipping smoke tests (--skip-smoke)."
elif [ "$DRY_RUN" = true ]; then
  log "[5/5] Skipping smoke tests (dry run)."
else
  log "[5/5] Running partner smoke tests..."

  SMOKE_PASS=0
  SMOKE_FAIL=0

  # Test 1: Health check
  if curl -sf --max-time 10 "https://tiresias.network/health" > /dev/null 2>&1; then
    log "  Health check: OK"
    ((SMOKE_PASS++))
  else
    log "  Health check: FAILED"
    ((SMOKE_FAIL++))
  fi

  # Test 2: Partner API returns 401 (not 404) without auth
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "https://tiresias.network/v1/partner/me" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    log "  Partner API (/v1/partner/me): OK (${HTTP_CODE} = auth required)"
    ((SMOKE_PASS++))
  elif [ "$HTTP_CODE" = "404" ]; then
    log "  Partner API (/v1/partner/me): FAILED (404 = route not found, partner code may not be deployed)"
    ((SMOKE_FAIL++))
  else
    log "  Partner API (/v1/partner/me): UNEXPECTED (HTTP ${HTTP_CODE})"
    ((SMOKE_FAIL++))
  fi

  # Test 3: Partner webhook endpoint accepts POST (returns 400 without signature, not 404)
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 -X POST "https://tiresias.network/v1/partner/webhooks" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    log "  Webhook endpoint (/v1/partner/webhooks): OK (${HTTP_CODE} = reachable, rejects unsigned)"
    ((SMOKE_PASS++))
  elif [ "$HTTP_CODE" = "404" ]; then
    log "  Webhook endpoint (/v1/partner/webhooks): FAILED (404 = route not found)"
    ((SMOKE_FAIL++))
  else
    log "  Webhook endpoint (/v1/partner/webhooks): UNEXPECTED (HTTP ${HTTP_CODE})"
    ((SMOKE_FAIL++))
  fi

  echo ""
  log "  Smoke tests: ${SMOKE_PASS} passed, ${SMOKE_FAIL} failed"

  if [ "$SMOKE_FAIL" -gt 0 ]; then
    log "  WARNING: Some smoke tests failed. Review output above."
  fi
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "  1. Run scripts/stripe-partner-setup.sh to configure Stripe products"
echo "  2. Verify partner endpoints in staging before production"
echo "  3. Set TIER_GUARD_ENABLED=enforce after validation period"
echo "  4. Create first partner invitation via admin API:"
echo "     curl -X POST https://tiresias.network/v1/partner/invitations \\"
echo "       -H 'Authorization: Bearer <admin-token>' \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"email\": \"partner@example.com\", \"tier\": \"mssp\"}'"
