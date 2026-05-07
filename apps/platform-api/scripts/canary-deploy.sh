#!/usr/bin/env bash
#
# Tiresias Canary Deployment Script
#
# Rolls out a new proxy image to a single pod first, verifies health,
# then proceeds with full rollout. Rolls back on failure.
#
# Usage:
#   ./scripts/canary-deploy.sh <new-image-tag>
#   ./scripts/canary-deploy.sh v0.6.1
#
# For per-tenant canary (Enterprise/MSSP):
#   TENANT_SLUG=acme ./scripts/canary-deploy.sh v0.6.1
#
# Environment:
#   NAMESPACE      — K8s namespace (default: tiresias)
#   DEPLOYMENT     — Deployment name (default: tiresias-proxy or tiresias-proxy-$TENANT_SLUG)
#   HEALTH_URL     — Health check URL (default: auto-detected from service)
#   CANARY_WAIT    — Seconds to observe canary (default: 120)
#   ERROR_THRESHOLD — Max error rate % to proceed (default: 1)

set -euo pipefail

TAG="${1:?Usage: canary-deploy.sh <image-tag>}"

NAMESPACE="${NAMESPACE:-tiresias}"
TENANT_SLUG="${TENANT_SLUG:-}"
CANARY_WAIT="${CANARY_WAIT:-120}"
ERROR_THRESHOLD="${ERROR_THRESHOLD:-1}"

if [ -n "$TENANT_SLUG" ]; then
    DEPLOYMENT="${DEPLOYMENT:-tiresias-proxy-$TENANT_SLUG}"
else
    DEPLOYMENT="${DEPLOYMENT:-tiresias-proxy}"
fi

IMAGE_REPO="us-central1-docker.pkg.dev/salucainfrastructure/tiresias/tiresias-proxy"
NEW_IMAGE="${IMAGE_REPO}:${TAG}"

echo "=== Tiresias Canary Deploy ==="
echo "  Namespace:  $NAMESPACE"
echo "  Deployment: $DEPLOYMENT"
echo "  New image:  $NEW_IMAGE"
echo "  Canary wait: ${CANARY_WAIT}s"
echo ""

# 1. Record current state for rollback
CURRENT_IMAGE=$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" \
    -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)
CURRENT_REPLICAS=$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" \
    -o jsonpath='{.spec.replicas}' 2>/dev/null)

echo "Current image:    $CURRENT_IMAGE"
echo "Current replicas: $CURRENT_REPLICAS"
echo ""

if [ "$CURRENT_IMAGE" = "$NEW_IMAGE" ]; then
    echo "Already running $NEW_IMAGE — nothing to do."
    exit 0
fi

# 2. Scale down to 1 replica (canary)
echo ">>> Scaling to 1 replica for canary..."
kubectl scale deployment "$DEPLOYMENT" -n "$NAMESPACE" --replicas=1
kubectl rollout status deployment "$DEPLOYMENT" -n "$NAMESPACE" --timeout=120s

# 3. Update image on the single pod
echo ">>> Updating image to $NEW_IMAGE..."
kubectl set image deployment/"$DEPLOYMENT" -n "$NAMESPACE" \
    tiresias-proxy="$NEW_IMAGE"
kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE" --timeout=180s

# 4. Verify health
echo ">>> Canary pod running. Observing for ${CANARY_WAIT}s..."

CANARY_POD=$(kubectl get pods -n "$NAMESPACE" -l "app=$DEPLOYMENT" \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

echo "  Canary pod: $CANARY_POD"

# Health check loop
CHECKS=0
FAILURES=0
INTERVAL=10
TOTAL_CHECKS=$((CANARY_WAIT / INTERVAL))

for i in $(seq 1 $TOTAL_CHECKS); do
    HEALTH=$(kubectl exec "$CANARY_POD" -n "$NAMESPACE" -- \
        curl -sf http://localhost:8080/health 2>/dev/null || echo '{"status":"error"}')

    STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null || echo "error")

    if [ "$STATUS" = "ok" ]; then
        echo "  [$i/$TOTAL_CHECKS] Health: OK"
        CHECKS=$((CHECKS + 1))
    else
        echo "  [$i/$TOTAL_CHECKS] Health: FAIL ($STATUS)"
        FAILURES=$((FAILURES + 1))
    fi

    sleep "$INTERVAL"
done

# 5. Evaluate canary
ERROR_RATE=0
if [ "$CHECKS" -gt 0 ]; then
    ERROR_RATE=$(( (FAILURES * 100) / (CHECKS + FAILURES) ))
fi

echo ""
echo "Canary results: $CHECKS OK, $FAILURES FAIL, ${ERROR_RATE}% error rate"

if [ "$ERROR_RATE" -gt "$ERROR_THRESHOLD" ]; then
    echo ""
    echo "!!! CANARY FAILED — error rate ${ERROR_RATE}% exceeds threshold ${ERROR_THRESHOLD}%"
    echo ">>> Rolling back to $CURRENT_IMAGE..."
    kubectl set image deployment/"$DEPLOYMENT" -n "$NAMESPACE" \
        tiresias-proxy="$CURRENT_IMAGE"
    kubectl scale deployment "$DEPLOYMENT" -n "$NAMESPACE" --replicas="$CURRENT_REPLICAS"
    kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE" --timeout=180s
    echo "Rollback complete."
    exit 1
fi

# 6. Full rollout
echo ">>> Canary passed. Scaling to $CURRENT_REPLICAS replicas..."
kubectl scale deployment "$DEPLOYMENT" -n "$NAMESPACE" --replicas="$CURRENT_REPLICAS"
kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE" --timeout=300s

echo ""
echo "=== Deploy complete ==="
echo "  Image:    $NEW_IMAGE"
echo "  Replicas: $CURRENT_REPLICAS"
echo "  Status:   HEALTHY"
