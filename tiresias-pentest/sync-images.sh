#!/usr/bin/env bash
set -euo pipefail

# ── Sync Production Image Tags to Pentest Target ──────────────────────────
# Pulls current image tags from GKE, transfers to pentest VM, restarts stack.
# Usage: ./sync-images.sh [--target 192.168.12.169] [--ssh-key ~/.ssh/alfred_id_ed25519]

TARGET="${PENTEST_TARGET:-192.168.12.169}"
SSH_KEY="${HOME}/.ssh/alfred_id_ed25519"
SSH_USER="cristian"
GKE_CONTEXT="tiresias-v2"
COMPOSE_FILE="docker-compose.pentest.yaml"
REGISTRY="us-central1-docker.pkg.dev/salucainfrastructure/tiresias"
TEMP_DIR="/tmp/tiresias-images"

while [[ $# -gt 0 ]]; do
    case $1 in
        --target) TARGET="$2"; shift 2 ;;
        --ssh-key) SSH_KEY="$2"; shift 2 ;;
        --ssh-user) SSH_USER="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--target IP] [--ssh-key KEY] [--ssh-user USER]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Step 1: Get current tags from GKE ─────────────────────────────────────
log "Fetching current image tags from GKE context: ${GKE_CONTEXT}"

declare -A IMAGE_TAGS

for service in soulauth soulgate soulwatch portal; do
    tag=$(kubectl --context="${GKE_CONTEXT}" get deployment "${service}" \
        -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null | \
        awk -F: '{print $NF}')

    if [[ -z "$tag" ]]; then
        log "WARNING: Could not get tag for ${service} from GKE, using 'latest'"
        tag="latest"
    fi

    IMAGE_TAGS[$service]="$tag"
    log "  ${service}: ${tag}"
done

# ── Step 2: Pull images locally ───────────────────────────────────────────
log "Pulling images..."
mkdir -p "${TEMP_DIR}"

IMAGES_TO_TRANSFER=()
for service in soulauth soulgate soulwatch portal; do
    full_image="${REGISTRY}/${service}:${IMAGE_TAGS[$service]}"
    log "Pulling ${full_image}"
    docker pull "${full_image}"
    IMAGES_TO_TRANSFER+=("${full_image}")
done

# Also pull postgres
docker pull postgres:16-alpine
IMAGES_TO_TRANSFER+=("postgres:16-alpine")

# ── Step 3: Save and transfer ─────────────────────────────────────────────
log "Saving images to tar archive..."
ARCHIVE="${TEMP_DIR}/tiresias-images.tar"
docker save -o "${ARCHIVE}" "${IMAGES_TO_TRANSFER[@]}"

ARCHIVE_SIZE=$(du -h "${ARCHIVE}" | awk '{print $1}')
log "Archive size: ${ARCHIVE_SIZE}"

log "Transferring to ${TARGET}..."
scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no \
    "${ARCHIVE}" "${SSH_USER}@${TARGET}:/tmp/tiresias-images.tar"

# ── Step 4: Load on target and restart ────────────────────────────────────
log "Loading images on target..."
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${SSH_USER}@${TARGET}" bash <<REMOTE
set -euo pipefail
echo "Loading images..."
docker load -i /tmp/tiresias-images.tar
rm -f /tmp/tiresias-images.tar

echo "Updating compose file with new tags..."
cd ~/tiresias-pentest 2>/dev/null || cd /opt/tiresias-pentest

# Update image tags in compose file
$(for service in soulauth soulgate soulwatch portal; do
    echo "sed -i 's|${REGISTRY}/${service}:[^ ]*|${REGISTRY}/${service}:${IMAGE_TAGS[$service]}|g' ${COMPOSE_FILE}"
done)

echo "Restarting stack..."
docker compose -f ${COMPOSE_FILE} down
docker compose -f ${COMPOSE_FILE} up -d

echo "Waiting for services to be healthy..."
sleep 10
docker compose -f ${COMPOSE_FILE} ps
REMOTE

# ── Step 5: Verify services are up ────────────────────────────────────────
log "Verifying services on target..."
sleep 5

SERVICES_OK=true
for port in 8000 8001 8002 3000; do
    if curl -s --connect-timeout 5 "http://${TARGET}:${port}/health" >/dev/null 2>&1 || \
       curl -s --connect-timeout 5 "http://${TARGET}:${port}/" >/dev/null 2>&1; then
        log "  Port ${port}: OK"
    else
        log "  Port ${port}: UNREACHABLE"
        SERVICES_OK=false
    fi
done

if $SERVICES_OK; then
    log "All services synced and running on ${TARGET}"
else
    log "WARNING: Some services may not be ready yet. Check manually."
fi

# Cleanup
rm -rf "${TEMP_DIR}"
log "Sync complete"
