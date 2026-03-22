#!/usr/bin/env bash
# provision-k8s-secrets.sh — Pull Tiresias secrets from GCP Secret Manager
# and apply them to the Kubernetes cluster as a single Opaque secret.
#
# Prerequisites:
#   - gcloud authenticated with an account that has secretmanager.secretAccessor role
#   - kubectl configured for the tiresias-v2 cluster
#   - GCP Secret Manager API enabled on salucainfrastructure project
#   - All secrets created in Secret Manager (run provision-gcp-secrets.sh first)
#
# Usage:
#   ./scripts/provision-k8s-secrets.sh [--dry-run]
set -euo pipefail

PROJECT="salucainfrastructure"
NAMESPACE="tiresias"
K8S_SECRET_NAME="tiresias-secrets"
DRY_RUN="${1:-}"

# Mapping: <kubernetes-key> <gcp-secret-name>
declare -A SECRET_MAP=(
  ["database-url"]="tiresias-database-url"
  ["database-url-sync"]="tiresias-database-url-sync"
  ["jwt-private-key"]="tiresias-jwt-private-key"
  ["jwt-public-key"]="tiresias-jwt-public-key"
  ["jwt-kid"]="tiresias-jwt-kid"
  ["stripe-secret-key"]="tiresias-stripe-secret-key"
  ["stripe-webhook-secret"]="tiresias-stripe-webhook-secret"
  ["resend-api-key"]="tiresias-resend-api-key"
  ["internal-api-key"]="tiresias-internal-api-key"
  ["metrics-auth-token"]="tiresias-metrics-auth-token"
  ["tiresias-license-secret"]="tiresias-license-secret"
  ["tiresias-license-key"]="tiresias-license-key"
)

echo "==> Fetching secrets from GCP Secret Manager (project: ${PROJECT})"

KUBECTL_ARGS=("create" "secret" "generic" "${K8S_SECRET_NAME}"
  "--namespace=${NAMESPACE}"
  "--save-config"
  "--dry-run=client"
  "-o" "yaml"
)

if [[ "${DRY_RUN}" != "--dry-run" ]]; then
  KUBECTL_ARGS=("create" "secret" "generic" "${K8S_SECRET_NAME}"
    "--namespace=${NAMESPACE}"
    "--save-config"
    "--dry-run=client"
    "-o" "yaml"
  )
fi

LITERAL_ARGS=()
for k8s_key in "${!SECRET_MAP[@]}"; do
  gcp_secret="${SECRET_MAP[$k8s_key]}"
  echo "  Fetching: ${gcp_secret} -> ${k8s_key}"
  value=$(gcloud secrets versions access latest \
    --secret="${gcp_secret}" \
    --project="${PROJECT}" 2>/dev/null) || {
    echo "  ERROR: Could not fetch secret ${gcp_secret}" >&2
    exit 1
  }
  LITERAL_ARGS+=("--from-literal=${k8s_key}=${value}")
done

echo "==> Applying Kubernetes secret: ${K8S_SECRET_NAME} in namespace: ${NAMESPACE}"

if [[ "${DRY_RUN}" == "--dry-run" ]]; then
  echo "(dry-run: would apply kubectl create secret generic ${K8S_SECRET_NAME})"
  kubectl create secret generic "${K8S_SECRET_NAME}" \
    --namespace="${NAMESPACE}" \
    --dry-run=client \
    "${LITERAL_ARGS[@]}" \
    -o yaml
else
  kubectl create secret generic "${K8S_SECRET_NAME}" \
    --namespace="${NAMESPACE}" \
    --save-config \
    "${LITERAL_ARGS[@]}" \
    -o yaml | kubectl apply -f -
fi

echo "==> Done."
