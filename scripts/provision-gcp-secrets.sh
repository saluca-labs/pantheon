#!/usr/bin/env bash
# provision-gcp-secrets.sh — One-time migration of Tiresias secrets
# into GCP Secret Manager.
#
# Prerequisites:
#   - Secret Manager API enabled: gcloud services enable secretmanager.googleapis.com
#   - gcloud authenticated with secretmanager.admin role
#   - Run ONCE after enabling the API; subsequent runs update existing secrets.
#
# Usage:
#   SECRET_VALUES_FILE=/path/to/secrets.env ./scripts/provision-gcp-secrets.sh
#
# secrets.env format (never commit this file):
#   TIRESIAS_DATABASE_URL=postgresql+asyncpg://...
#   TIRESIAS_DATABASE_URL_SYNC=postgresql://...
#   TIRESIAS_JWT_PRIVATE_KEY_FILE=/path/to/ec-private.pem
#   TIRESIAS_JWT_PUBLIC_KEY_FILE=/path/to/ec-public.pem
#   TIRESIAS_JWT_KID=soulauth-2026-04
#   TIRESIAS_STRIPE_SECRET_KEY=sk_live_...
#   TIRESIAS_STRIPE_WEBHOOK_SECRET=whsec_...
#   TIRESIAS_RESEND_API_KEY=re_...
#   TIRESIAS_INTERNAL_API_KEY=<64-char-hex>
#   TIRESIAS_METRICS_AUTH_TOKEN=<64-char-hex>
#   TIRESIAS_LICENSE_SECRET=<64-char-hex>
#   TIRESIAS_LICENSE_KEY=<jwt>
set -euo pipefail

PROJECT="salucainfrastructure"
VALUES_FILE="${SECRET_VALUES_FILE:-}"

if [[ -z "${VALUES_FILE}" || ! -f "${VALUES_FILE}" ]]; then
  echo "ERROR: Set SECRET_VALUES_FILE to a local env file with secret values." >&2
  echo "  Example: SECRET_VALUES_FILE=~/secrets.env $0" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${VALUES_FILE}"

upsert_secret() {
  local name="$1"
  local value="$2"

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

echo "==> Provisioning Tiresias secrets to GCP Secret Manager (project: ${PROJECT})"

upsert_secret "tiresias-database-url"       "${TIRESIAS_DATABASE_URL}"
upsert_secret "tiresias-database-url-sync"  "${TIRESIAS_DATABASE_URL_SYNC}"
upsert_secret "tiresias-jwt-kid"            "${TIRESIAS_JWT_KID}"
upsert_secret "tiresias-stripe-secret-key"  "${TIRESIAS_STRIPE_SECRET_KEY}"
upsert_secret "tiresias-stripe-webhook-secret" "${TIRESIAS_STRIPE_WEBHOOK_SECRET}"
upsert_secret "tiresias-resend-api-key"     "${TIRESIAS_RESEND_API_KEY}"
upsert_secret "tiresias-internal-api-key"   "${TIRESIAS_INTERNAL_API_KEY}"
upsert_secret "tiresias-metrics-auth-token" "${TIRESIAS_METRICS_AUTH_TOKEN}"
upsert_secret "tiresias-license-secret"     "${TIRESIAS_LICENSE_SECRET}"
upsert_secret "tiresias-license-key"        "${TIRESIAS_LICENSE_KEY}"
upsert_secret "tiresias-oidc-secret-key"  "${SOULAUTH_OIDC_SECRET_KEY}"
upsert_secret "tiresias-oidc-state-secret" "${SOULAUTH_OIDC_STATE_SECRET}"
upsert_secret "tiresias-linear-api-key"   "${TIRESIAS_LINEAR_API_KEY}"
upsert_secret "tiresias-openrouter-api-key" "${TIRESIAS_OPENROUTER_API_KEY}"

# Keys from files
if [[ -n "${TIRESIAS_JWT_PRIVATE_KEY_FILE:-}" ]]; then
  value=$(cat "${TIRESIAS_JWT_PRIVATE_KEY_FILE}")
  upsert_secret "tiresias-jwt-private-key" "${value}"
fi
if [[ -n "${TIRESIAS_JWT_PUBLIC_KEY_FILE:-}" ]]; then
  value=$(cat "${TIRESIAS_JWT_PUBLIC_KEY_FILE}")
  upsert_secret "tiresias-jwt-public-key" "${value}"
fi

echo "==> All secrets provisioned. Next step:"
echo "    Enable Workload Identity on tiresias-sa service account and run:"
echo "    ./scripts/provision-k8s-secrets.sh"
