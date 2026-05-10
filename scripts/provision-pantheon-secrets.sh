#!/usr/bin/env bash
# scripts/provision-pantheon-secrets.sh
#
# Idempotently sync the 8 pantheon-* secrets from GCP Secret Manager into the
# `pantheon` k8s namespace as a single Secret named `pantheon-secrets`.
#
# Usage:
#   ./scripts/provision-pantheon-secrets.sh
#
# Requirements:
#   - gcloud auth'd to project salucainfrastructure with secretmanager.secretAccessor on pantheon-*
#   - kubectl context pointing at tiresias-prod (or whichever cluster runs `pantheon` namespace)
#
# Safety:
#   - Secret values are streamed via `--from-file=key=/dev/stdin` style with temp files in
#     a 0700 dir, never echoed.
#   - If the k8s secret already exists, it is deleted first so that a stale rotation is replaced.
#   - Temp dir is cleared via `trap` on exit (success OR failure).

set -euo pipefail

PROJECT="${PROJECT:-salucainfrastructure}"
NAMESPACE="${NAMESPACE:-pantheon}"
SECRET_NAME="${SECRET_NAME:-pantheon-secrets}"

# Mapping: k8s key -> GCP secret name
declare -A KEYS=(
  ["database-url"]="pantheon-database-url"
  ["database-url-sync"]="pantheon-database-url-sync"
  ["session-secret"]="pantheon-session-secret"
  ["jwt-private-key"]="pantheon-jwt-private-key"
  ["jwt-public-key"]="pantheon-jwt-public-key"
  ["jwt-kid"]="pantheon-jwt-kid"
  ["internal-api-key"]="pantheon-internal-api-key"
  ["memory-service-key"]="pantheon-memory-service-key"
)

TMPDIR_SECRET="$(mktemp -d)"
chmod 700 "$TMPDIR_SECRET"
cleanup() { rm -rf "$TMPDIR_SECRET"; }
trap cleanup EXIT

echo ">>> Fetching ${#KEYS[@]} secrets from Secret Manager (project: $PROJECT)..."
for key in "${!KEYS[@]}"; do
  sm_name="${KEYS[$key]}"
  out="$TMPDIR_SECRET/$key"
  gcloud secrets versions access latest --secret="$sm_name" --project="$PROJECT" --out-file="$out" >/dev/null
  if [ ! -s "$out" ]; then
    echo "!!! ERROR: $sm_name returned empty value; aborting" >&2
    exit 1
  fi
done
echo "    fetched: $(ls "$TMPDIR_SECRET" | wc -l) keys"

# Build --from-file args without exposing values
FROM_FILE_ARGS=()
for key in "${!KEYS[@]}"; do
  FROM_FILE_ARGS+=("--from-file=$key=$TMPDIR_SECRET/$key")
done

# Make idempotent: delete-then-recreate (safer than `kubectl apply` which can leak old keys)
if kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
  echo ">>> Existing secret $NAMESPACE/$SECRET_NAME found; deleting before recreate."
  kubectl delete secret "$SECRET_NAME" -n "$NAMESPACE"
fi

echo ">>> Creating $NAMESPACE/$SECRET_NAME..."
kubectl create secret generic "$SECRET_NAME" -n "$NAMESPACE" "${FROM_FILE_ARGS[@]}"

# Verify keys present (without printing values)
echo ">>> Verifying keys..."
ACTUAL_KEYS="$(kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" -o jsonpath='{.data}' | python -c 'import json,sys; print(",".join(sorted(json.load(sys.stdin).keys())))')"
EXPECTED_KEYS="$(printf '%s\n' "${!KEYS[@]}" | sort | paste -sd, -)"
if [ "$ACTUAL_KEYS" = "$EXPECTED_KEYS" ]; then
  echo "    OK: all 8 keys present in $NAMESPACE/$SECRET_NAME"
  echo "    keys: $ACTUAL_KEYS"
else
  echo "!!! MISMATCH: expected '$EXPECTED_KEYS' got '$ACTUAL_KEYS'" >&2
  exit 2
fi

echo ">>> Done."
