#!/usr/bin/env bash
# validate-refs.sh — Pre-apply validation for ExternalSecret remoteRef keys.
#
# Walks every ExternalSecret manifest under k8s/pantheon/external-secrets/,
# extracts each remoteRef.key, resolves the source project via the manifest's
# secretStoreRef → ClusterSecretStore → spec.provider.gcpsm.projectID, and
# verifies the secret exists in GCP Secret Manager.
#
# Exit codes:
#   0   all refs exist
#   1   one or more refs missing (lists them on stderr)
#   2   gcloud / yq / jq missing, or manifest parse error
#
# Reason this exists: in ESO v0.9.11, a single missing remoteRef.key fails
# the ENTIRE ExternalSecret sync — every key in the secret stops syncing.
# That happened 2026-05-18 when gemini-api-key was added to the manifest
# before being created in GCP SM. Pantheon-secrets (11 working keys) stopped
# syncing until the missing key was created. This script is the pre-flight
# guard so we catch the gap before kubectl apply.
#
# Usage:
#   ./validate-refs.sh                          # scans all *.externalsecret.yaml
#   ./validate-refs.sh path/to/foo.yaml         # scans one file
#
# Suggested wiring: invoke from the Makefile / CI / pre-commit before any
# kubectl apply -f *.externalsecret.yaml.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── dep checks ────────────────────────────────────────────────────────────────
for bin in gcloud yq jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: '$bin' not found in PATH. Install it and retry." >&2
    exit 2
  fi
done

# ── argv ──────────────────────────────────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  TARGETS=("$@")
else
  mapfile -t TARGETS < <(find "$SCRIPT_DIR" -maxdepth 2 -type f -name '*externalsecret*.yaml')
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "No ExternalSecret manifests found under $SCRIPT_DIR" >&2
  exit 2
fi

# Cache ClusterSecretStore name → GCP projectID resolution. The store manifests
# live next to the ExternalSecrets in this directory, so we can resolve locally
# rather than hitting the cluster.
declare -A STORE_TO_PROJECT
for store_file in "$SCRIPT_DIR"/*.yaml; do
  kind=$(yq -r '.kind // ""' "$store_file" 2>/dev/null || echo "")
  if [[ "$kind" == "ClusterSecretStore" || "$kind" == "SecretStore" ]]; then
    name=$(yq -r '.metadata.name' "$store_file")
    project=$(yq -r '.spec.provider.gcpsm.projectID // ""' "$store_file")
    if [[ -n "$name" && -n "$project" ]]; then
      STORE_TO_PROJECT["$name"]="$project"
    fi
  fi
done

if [[ ${#STORE_TO_PROJECT[@]} -eq 0 ]]; then
  echo "ERROR: no ClusterSecretStore/SecretStore manifests found alongside the ExternalSecrets." >&2
  echo "       Add one or pass it explicitly. Looked in $SCRIPT_DIR" >&2
  exit 2
fi

# ── scan each manifest ────────────────────────────────────────────────────────
MISSING=()
CHECKED=0

for manifest in "${TARGETS[@]}"; do
  kind=$(yq -r '.kind // ""' "$manifest")
  if [[ "$kind" != "ExternalSecret" ]]; then
    continue
  fi

  store_name=$(yq -r '.spec.secretStoreRef.name' "$manifest")
  project="${STORE_TO_PROJECT[$store_name]:-}"
  if [[ -z "$project" ]]; then
    echo "ERROR: ExternalSecret $(basename "$manifest") references store '$store_name' but no matching store manifest found locally." >&2
    exit 2
  fi

  # Extract every remoteRef.key from spec.data[].remoteRef.key
  mapfile -t keys < <(yq -r '.spec.data[]?.remoteRef.key' "$manifest" | grep -v '^null$' | grep -v '^$')

  if [[ ${#keys[@]} -eq 0 ]]; then
    echo "(skipping $(basename "$manifest") — no spec.data[].remoteRef.key entries)"
    continue
  fi

  echo "Checking $(basename "$manifest") → project=$project (${#keys[@]} keys)"
  for k in "${keys[@]}"; do
    if gcloud secrets describe "$k" --project="$project" --quiet >/dev/null 2>&1; then
      :  # ok
    else
      MISSING+=("$project/$k  (referenced by $(basename "$manifest"))")
    fi
    CHECKED=$((CHECKED + 1))
  done
done

# ── report ────────────────────────────────────────────────────────────────────
echo ""
echo "Validated $CHECKED ExternalSecret refs across ${#TARGETS[@]} file(s)."

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
  echo "MISSING in GCP Secret Manager (would break ESO sync if applied):" >&2
  for m in "${MISSING[@]}"; do
    echo "  - $m" >&2
  done
  echo "" >&2
  echo "Create the missing secrets first, then re-run this check." >&2
  exit 1
fi

echo "All refs OK."
exit 0
