#!/usr/bin/env bash
set -euo pipefail

# ── CISA KEV Catalog Sync ────────────────────────────────────────────────
# Downloads the Known Exploited Vulnerabilities catalog, diffs against
# previous download, and outputs new entries.
# Usage: ./kev-sync.sh [--output new_kev_entries.json] [--data-dir ./data]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/../data"
OUTPUT="new_kev_entries.json"
KEV_URL="https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"

while [[ $# -gt 0 ]]; do
    case $1 in
        --output) OUTPUT="$2"; shift 2 ;;
        --data-dir) DATA_DIR="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--output FILE] [--data-dir DIR]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

mkdir -p "${DATA_DIR}"

CURRENT_FILE="${DATA_DIR}/kev_current.json"
PREVIOUS_FILE="${DATA_DIR}/kev_previous.json"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Download current catalog ─────────────────────────────────────────────
log "Downloading CISA KEV catalog..."
curl -sS --fail --max-time 60 -o "${CURRENT_FILE}.tmp" "${KEV_URL}"

# Validate JSON
if ! jq empty "${CURRENT_FILE}.tmp" 2>/dev/null; then
    log "ERROR: Downloaded file is not valid JSON"
    rm -f "${CURRENT_FILE}.tmp"
    exit 1
fi

TOTAL=$(jq '.vulnerabilities | length' "${CURRENT_FILE}.tmp")
log "Downloaded catalog: ${TOTAL} total vulnerabilities"

# ── Diff against previous ────────────────────────────────────────────────
if [[ -f "${PREVIOUS_FILE}" ]]; then
    log "Comparing against previous download..."

    PREV_IDS=$(jq -r '.vulnerabilities[].cveID' "${PREVIOUS_FILE}" | sort)
    CURR_IDS=$(jq -r '.vulnerabilities[].cveID' "${CURRENT_FILE}.tmp" | sort)

    NEW_IDS=$(comm -13 <(echo "$PREV_IDS") <(echo "$CURR_IDS"))

    if [[ -z "$NEW_IDS" ]]; then
        log "No new KEV entries since last sync"
        NEW_COUNT=0
        echo '{"sync_date":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","new_entries":0,"entries":[]}' | jq . > "${OUTPUT}"
    else
        NEW_COUNT=$(echo "$NEW_IDS" | wc -l | tr -d ' ')
        log "Found ${NEW_COUNT} new KEV entries"

        NEW_IDS_JSON=$(echo "$NEW_IDS" | jq -R -s 'split("\n") | map(select(length > 0))')
        jq --argjson new_ids "${NEW_IDS_JSON}" '{
            sync_date: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
            new_entries: ($new_ids | length),
            entries: [.vulnerabilities[] | select(.cveID as $id | $new_ids | index($id))]
        }' "${CURRENT_FILE}.tmp" > "${OUTPUT}"

        log "New KEV entries:"
        echo "$NEW_IDS" | while read -r cve_id; do
            [[ -z "$cve_id" ]] && continue
            vendor=$(jq -r --arg id "$cve_id" '.vulnerabilities[] | select(.cveID == $id) | .vendorProject' "${CURRENT_FILE}.tmp")
            product=$(jq -r --arg id "$cve_id" '.vulnerabilities[] | select(.cveID == $id) | .product' "${CURRENT_FILE}.tmp")
            due=$(jq -r --arg id "$cve_id" '.vulnerabilities[] | select(.cveID == $id) | .dueDate' "${CURRENT_FILE}.tmp")
            log "  ${cve_id}: ${vendor} ${product} (due: ${due})"
        done
    fi
else
    log "No previous catalog found — treating all as baseline"
    NEW_COUNT="${TOTAL}"

    jq '{
        sync_date: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
        new_entries: (.vulnerabilities | length),
        note: "Initial sync — all entries included as baseline",
        entries: .vulnerabilities
    }' "${CURRENT_FILE}.tmp" > "${OUTPUT}"
fi

# ── Rotate files ─────────────────────────────────────────────────────────
if [[ -f "${CURRENT_FILE}" ]]; then
    mv "${CURRENT_FILE}" "${PREVIOUS_FILE}"
fi
mv "${CURRENT_FILE}.tmp" "${CURRENT_FILE}"

log "Output: ${OUTPUT} (${NEW_COUNT} new entries)"
log "KEV sync complete"
