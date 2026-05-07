#!/usr/bin/env bash
# provision-partner-secrets.sh — Provision partner program secrets to
# GCP Secret Manager and Kubernetes.
#
# Prerequisites:
#   - Secret Manager API enabled: gcloud services enable secretmanager.googleapis.com
#   - gcloud authenticated with secretmanager.admin role (for GCP upsert)
#     OR secretmanager.secretAccessor role (for K8s-only provisioning)
#   - kubectl configured for the tiresias-v2 cluster
#   - Sensitive partner secrets already in GCP Secret Manager, OR provided
#     via PARTNER_VALUES_FILE for initial provisioning.
#
# Usage:
#
#   # Step 1: Upsert sensitive secrets to GCP Secret Manager
#   PARTNER_VALUES_FILE=/path/to/partner-secrets.env ./scripts/provision-partner-secrets.sh --gcp
#
#   # Step 2: Create K8s secret from GCP Secret Manager + product/price IDs
#   ./scripts/provision-partner-secrets.sh --k8s \
#     --product-mssp=prod_xxx \
#     --price-mssp-monthly=price_xxx \
#     --price-mssp-annual=price_xxx \
#     --product-tenant=prod_xxx \
#     --price-tenant=price_xxx
#
#   # Both steps at once
#   PARTNER_VALUES_FILE=/path/to/partner-secrets.env ./scripts/provision-partner-secrets.sh --all \
#     --product-mssp=prod_xxx \
#     --price-mssp-monthly=price_xxx \
#     --price-mssp-annual=price_xxx \
#     --product-tenant=prod_xxx \
#     --price-tenant=price_xxx
#
#   # Dry run (prints what would happen without making changes)
#   ./scripts/provision-partner-secrets.sh --k8s --dry-run \
#     --product-mssp=prod_xxx ...
#
# partner-secrets.env format (never commit this file):
#   STRIPE_PARTNER_WEBHOOK_SECRET=whsec_...
#   STRIPE_CONNECT_CLIENT_ID=ca_...
#   PARTNER_OPS_SLACK_WEBHOOK=https://hooks.slack.com/services/...
set -euo pipefail

PROJECT="salucainfrastructure"
NAMESPACE="tiresias"
K8S_SECRET_NAME="tiresias-partner-secrets"

# --------------------------------------------------------------------------
# Argument parsing
# --------------------------------------------------------------------------
DRY_RUN=false
DO_GCP=false
DO_K8S=false
PRODUCT_MSSP=""
PRICE_MSSP_MONTHLY=""
PRICE_MSSP_ANNUAL=""
PRODUCT_TENANT=""
PRICE_TENANT=""

for arg in "$@"; do
  case "${arg}" in
    --dry-run)       DRY_RUN=true ;;
    --gcp)           DO_GCP=true ;;
    --k8s)           DO_K8S=true ;;
    --all)           DO_GCP=true; DO_K8S=true ;;
    --product-mssp=*)          PRODUCT_MSSP="${arg#*=}" ;;
    --price-mssp-monthly=*)    PRICE_MSSP_MONTHLY="${arg#*=}" ;;
    --price-mssp-annual=*)     PRICE_MSSP_ANNUAL="${arg#*=}" ;;
    --product-tenant=*)        PRODUCT_TENANT="${arg#*=}" ;;
    --price-tenant=*)          PRICE_TENANT="${arg#*=}" ;;
    *)
      echo "ERROR: Unknown argument: ${arg}" >&2
      echo "Usage: $0 --gcp | --k8s | --all [--dry-run] [--product-mssp=...] ..." >&2
      exit 1
      ;;
  esac
done

if ! ${DO_GCP} && ! ${DO_K8S}; then
  echo "ERROR: Specify --gcp, --k8s, or --all." >&2
  echo "Usage: $0 --gcp | --k8s | --all [--dry-run] [--product-mssp=...] ..." >&2
  exit 1
fi

# --------------------------------------------------------------------------
# GCP Secret Manager upsert
# --------------------------------------------------------------------------
upsert_secret() {
  local name="$1"
  local value="$2"

  if ${DRY_RUN}; then
    echo "  (dry-run) Would upsert: ${name}"
    return
  fi

  if gcloud secrets describe "${name}" --project="${PROJECT}" &>/dev/null; then
    echo "  Updating version: ${name}"
    echo -n "${value}" | gcloud secrets versions add "${name}" \
      --project="${PROJECT}" \
      --data-file=-
  else
    echo "  Creating: ${name}"
    echo -n "${value}" | gcloud secrets create "${name}" \
      --project="${PROJECT}" \
      --replication-policy=automatic \
      --data-file=-
  fi
}

if ${DO_GCP}; then
  VALUES_FILE="${PARTNER_VALUES_FILE:-}"

  if [[ -z "${VALUES_FILE}" || ! -f "${VALUES_FILE}" ]]; then
    echo "ERROR: Set PARTNER_VALUES_FILE to a local env file with partner secret values." >&2
    echo "  Example: PARTNER_VALUES_FILE=~/partner-secrets.env $0 --gcp" >&2
    exit 1
  fi

  # shellcheck disable=SC1090
  source "${VALUES_FILE}"

  echo "==> Provisioning partner secrets to GCP Secret Manager (project: ${PROJECT})"

  upsert_secret "tiresias-stripe-partner-webhook-secret" "${STRIPE_PARTNER_WEBHOOK_SECRET}"
  upsert_secret "tiresias-stripe-connect-client-id"      "${STRIPE_CONNECT_CLIENT_ID}"
  upsert_secret "tiresias-partner-ops-slack-webhook"     "${PARTNER_OPS_SLACK_WEBHOOK}"

  echo "==> GCP Secret Manager provisioning complete."
fi

# --------------------------------------------------------------------------
# Kubernetes secret
# --------------------------------------------------------------------------
if ${DO_K8S}; then
  # Validate product/price IDs are provided
  MISSING=()
  [[ -z "${PRODUCT_MSSP}" ]]       && MISSING+=("--product-mssp")
  [[ -z "${PRICE_MSSP_MONTHLY}" ]] && MISSING+=("--price-mssp-monthly")
  [[ -z "${PRICE_MSSP_ANNUAL}" ]]  && MISSING+=("--price-mssp-annual")
  [[ -z "${PRODUCT_TENANT}" ]]     && MISSING+=("--product-tenant")
  [[ -z "${PRICE_TENANT}" ]]       && MISSING+=("--price-tenant")

  if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo "ERROR: Missing required product/price arguments:" >&2
    for m in "${MISSING[@]}"; do
      echo "  ${m}" >&2
    done
    echo "" >&2
    echo "These are Stripe product and price IDs (not secrets). Pass them as arguments:" >&2
    echo "  $0 --k8s --product-mssp=prod_xxx --price-mssp-monthly=price_xxx \\" >&2
    echo "    --price-mssp-annual=price_xxx --product-tenant=prod_xxx --price-tenant=price_xxx" >&2
    exit 1
  fi

  echo "==> Fetching partner secrets from GCP Secret Manager (project: ${PROJECT})"

  # Fetch sensitive values from GCP Secret Manager
  declare -A GCP_SECRET_MAP=(
    ["stripe-partner-webhook-secret"]="tiresias-stripe-partner-webhook-secret"
    ["stripe-connect-client-id"]="tiresias-stripe-connect-client-id"
    ["partner-ops-slack-webhook"]="tiresias-partner-ops-slack-webhook"
  )

  LITERAL_ARGS=()
  for k8s_key in "${!GCP_SECRET_MAP[@]}"; do
    gcp_secret="${GCP_SECRET_MAP[$k8s_key]}"
    echo "  Fetching: ${gcp_secret} -> ${k8s_key}"

    if ${DRY_RUN}; then
      LITERAL_ARGS+=("--from-literal=${k8s_key}=<fetched-from-gcp>")
      continue
    fi

    value=$(gcloud secrets versions access latest \
      --secret="${gcp_secret}" \
      --project="${PROJECT}" 2>/dev/null) || {
      echo "  ERROR: Could not fetch secret ${gcp_secret}" >&2
      echo "  Have you run: $0 --gcp  (to provision GCP secrets first)?" >&2
      exit 1
    }
    LITERAL_ARGS+=("--from-literal=${k8s_key}=${value}")
  done

  # Add non-secret product/price config
  echo "  Adding product/price IDs (from arguments)"
  LITERAL_ARGS+=("--from-literal=stripe-partner-product-mssp=${PRODUCT_MSSP}")
  LITERAL_ARGS+=("--from-literal=stripe-partner-price-mssp-monthly=${PRICE_MSSP_MONTHLY}")
  LITERAL_ARGS+=("--from-literal=stripe-partner-price-mssp-annual=${PRICE_MSSP_ANNUAL}")
  LITERAL_ARGS+=("--from-literal=stripe-partner-product-tenant=${PRODUCT_TENANT}")
  LITERAL_ARGS+=("--from-literal=stripe-partner-price-tenant=${PRICE_TENANT}")

  echo "==> Applying Kubernetes secret: ${K8S_SECRET_NAME} in namespace: ${NAMESPACE}"

  if ${DRY_RUN}; then
    echo "(dry-run: generating manifest without applying)"
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

  echo "==> K8s secret provisioning complete."
fi

# --------------------------------------------------------------------------
# Next steps
# --------------------------------------------------------------------------
echo ""
echo "=== Next Steps ==="
if ${DO_GCP} && ! ${DO_K8S}; then
  echo "  1. Run with --k8s to create the Kubernetes secret:"
  echo "     $0 --k8s \\"
  echo "       --product-mssp=prod_xxx \\"
  echo "       --price-mssp-monthly=price_xxx \\"
  echo "       --price-mssp-annual=price_xxx \\"
  echo "       --product-tenant=prod_xxx \\"
  echo "       --price-tenant=price_xxx"
fi
echo "  - Verify the K8s secret exists:"
echo "      kubectl get secret ${K8S_SECRET_NAME} -n ${NAMESPACE}"
echo "  - Update partner deployment to reference ${K8S_SECRET_NAME}:"
echo "      envFrom:"
echo "        - secretRef:"
echo "            name: ${K8S_SECRET_NAME}"
echo "  - The partner webhook endpoint should be configured at:"
echo "      https://api.tiresias.network/v1/stripe/partner-webhooks"
echo ""
echo "==> Done."
