#!/usr/bin/env bash
set -euo pipefail

# ── Tiresias Pentest Orchestrator ──────────────────────────────────────────
# Runs automated security scans against a Tiresias deployment.
# Requires: trivy, nuclei, zap-cli (or zaproxy), httpx, jq
# Usage: ./scan.sh --profile full --target 192.168.12.169

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_BASE="/repos/security/pentest-reports"
DATE_DIR="$(date +%Y-%m-%d_%H%M%S)"
REPORT_DIR="${REPORT_BASE}/${DATE_DIR}"
PROFILE="full"
TARGET="${PENTEST_TARGET:-192.168.12.169}"
TELEGRAM_URL="${TELEGRAM_NOTIFY_URL:-http://34.41.26.234:8080/notify/telegram}"
SUMMARY_FILE=""
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0

# ── Parse arguments ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --profile) PROFILE="$2"; shift 2 ;;
        --target) TARGET="$2"; shift 2 ;;
        --report-dir) REPORT_BASE="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 --profile (full|cve-only|api-auth|custom) --target <ip>"
            echo "  --profile   Scan profile (default: full)"
            echo "  --target    Target IP/hostname (default: 192.168.12.169)"
            echo "  --report-dir  Base report directory (default: /repos/security/pentest-reports)"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

DATE_DIR="$(date +%Y-%m-%d_%H%M%S)"
REPORT_DIR="${REPORT_BASE}/${DATE_DIR}"
mkdir -p "${REPORT_DIR}"
SUMMARY_FILE="${REPORT_DIR}/summary.json"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log_phase() { log "════ PHASE $1: $2 ════"; }

notify_telegram() {
    local msg="$1"
    curl -s -X POST "${TELEGRAM_URL}" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\":\"default\",\"text\":\"${msg}\"}" \
        >/dev/null 2>&1 || true
}

count_severity() {
    local file="$1"
    if [[ -f "$file" ]]; then
        local c h m l
        c=$(jq '[.[] | select(.info.severity == "critical")] | length' "$file" 2>/dev/null || echo 0)
        h=$(jq '[.[] | select(.info.severity == "high")] | length' "$file" 2>/dev/null || echo 0)
        m=$(jq '[.[] | select(.info.severity == "medium")] | length' "$file" 2>/dev/null || echo 0)
        l=$(jq '[.[] | select(.info.severity == "low")] | length' "$file" 2>/dev/null || echo 0)
        CRITICAL_COUNT=$((CRITICAL_COUNT + c))
        HIGH_COUNT=$((HIGH_COUNT + h))
        MEDIUM_COUNT=$((MEDIUM_COUNT + m))
        LOW_COUNT=$((LOW_COUNT + l))
    fi
}

count_trivy_severity() {
    local file="$1"
    if [[ -f "$file" ]]; then
        local c h m l
        c=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' "$file" 2>/dev/null || echo 0)
        h=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH")] | length' "$file" 2>/dev/null || echo 0)
        m=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "MEDIUM")] | length' "$file" 2>/dev/null || echo 0)
        l=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "LOW")] | length' "$file" 2>/dev/null || echo 0)
        CRITICAL_COUNT=$((CRITICAL_COUNT + c))
        HIGH_COUNT=$((HIGH_COUNT + h))
        MEDIUM_COUNT=$((MEDIUM_COUNT + m))
        LOW_COUNT=$((LOW_COUNT + l))
    fi
}

# ── Phase 1: Container Image Scanning (Trivy) ─────────────────────────────
phase_trivy() {
    log_phase 1 "Container Image Scanning (Trivy)"
    local images=(
        "us-central1-docker.pkg.dev/salucainfrastructure/tiresias/soulauth:v1.1.1"
        "us-central1-docker.pkg.dev/salucainfrastructure/tiresias/soulgate:v1.0.7"
        "us-central1-docker.pkg.dev/salucainfrastructure/tiresias/soulwatch:v1.0.7"
        "us-central1-docker.pkg.dev/salucainfrastructure/tiresias/portal:v1.0.1"
        "postgres:16-alpine"
    )

    mkdir -p "${REPORT_DIR}/trivy"
    for img in "${images[@]}"; do
        local name
        name=$(echo "$img" | awk -F'/' '{print $NF}' | tr ':' '_')
        log "Scanning image: ${img}"
        trivy image --format json --output "${REPORT_DIR}/trivy/${name}.json" \
            --severity CRITICAL,HIGH,MEDIUM \
            --ignore-unfixed \
            "$img" 2>&1 | tee "${REPORT_DIR}/trivy/${name}.log"

        # Also generate SBOM for feed correlation
        trivy image --format cyclonedx --output "${REPORT_DIR}/trivy/${name}.sbom.json" \
            "$img" 2>/dev/null || true

        count_trivy_severity "${REPORT_DIR}/trivy/${name}.json"
        log "Completed: ${name}"
    done
}

# ── Phase 2: Infrastructure Scanning (Nuclei) ─────────────────────────────
phase_nuclei_infra() {
    log_phase 2 "Infrastructure Scanning (Nuclei)"
    mkdir -p "${REPORT_DIR}/nuclei"

    local ports="3000,8000,8001,8002,5432"
    local targets="${TARGET}"

    log "Running Nuclei infrastructure templates against ${targets}"
    nuclei -u "http://${targets}" \
        -t cves/ -t misconfiguration/ -t exposed-panels/ -t default-logins/ \
        -severity critical,high,medium \
        -json -output "${REPORT_DIR}/nuclei/infra.json" \
        -silent 2>&1 | tee "${REPORT_DIR}/nuclei/infra.log"

    # Port-specific scans
    for port in 8000 8001 8002 3000; do
        log "Scanning port ${port}"
        nuclei -u "http://${targets}:${port}" \
            -t http/ -t technologies/ \
            -severity critical,high,medium \
            -json -output "${REPORT_DIR}/nuclei/port_${port}.json" \
            -silent 2>&1 | tee -a "${REPORT_DIR}/nuclei/infra.log"
    done

    # Postgres-specific checks
    nuclei -u "${targets}:5432" \
        -t network/ \
        -severity critical,high,medium \
        -json -output "${REPORT_DIR}/nuclei/postgres.json" \
        -silent 2>&1 || true

    count_severity "${REPORT_DIR}/nuclei/infra.json"
}

# ── Phase 3: Web Application Scanning (ZAP) ───────────────────────────────
phase_zap() {
    log_phase 3 "Web Application Scanning (ZAP)"
    mkdir -p "${REPORT_DIR}/zap"

    local portal_url="http://${TARGET}:3000"
    local soulauth_url="http://${TARGET}:8000"

    # Check if ZAP is running as daemon, start if not
    if ! curl -s "http://localhost:8080/JSON/core/view/version/" >/dev/null 2>&1; then
        log "Starting ZAP daemon..."
        zap.sh -daemon -port 8080 -config api.disablekey=true &
        local zap_pid=$!
        # Wait for ZAP to start
        for i in $(seq 1 30); do
            if curl -s "http://localhost:8080/JSON/core/view/version/" >/dev/null 2>&1; then
                break
            fi
            sleep 2
        done
    fi

    # Spider and active scan the portal
    log "Spidering portal at ${portal_url}"
    curl -s "http://localhost:8080/JSON/spider/action/scan/?url=${portal_url}&maxChildren=10&recurse=true" >/dev/null 2>&1 || true
    sleep 5

    # Wait for spider to complete
    local spider_status="0"
    while [[ "$spider_status" != "100" ]]; do
        spider_status=$(curl -s "http://localhost:8080/JSON/spider/view/status/" 2>/dev/null | jq -r '.status // "100"')
        sleep 2
    done

    # Active scan
    log "Active scanning portal"
    curl -s "http://localhost:8080/JSON/ascan/action/scan/?url=${portal_url}&recurse=true&inScopeOnly=false" >/dev/null 2>&1 || true

    local scan_status="0"
    while [[ "$scan_status" != "100" ]]; do
        scan_status=$(curl -s "http://localhost:8080/JSON/ascan/view/status/" 2>/dev/null | jq -r '.status // "100"')
        log "ZAP scan progress: ${scan_status}%"
        sleep 10
    done

    # Export results
    curl -s "http://localhost:8080/JSON/core/view/alerts/?baseurl=${portal_url}" \
        > "${REPORT_DIR}/zap/portal_alerts.json" 2>/dev/null || true

    # Scan SoulAuth API docs endpoint
    log "Scanning SoulAuth OpenAPI surface"
    curl -s "http://localhost:8080/JSON/openapi/action/importUrl/?url=${soulauth_url}/openapi.json" >/dev/null 2>&1 || true
    sleep 3
    curl -s "http://localhost:8080/JSON/ascan/action/scan/?url=${soulauth_url}&recurse=true" >/dev/null 2>&1 || true

    local api_status="0"
    while [[ "$api_status" != "100" ]]; do
        api_status=$(curl -s "http://localhost:8080/JSON/ascan/view/status/" 2>/dev/null | jq -r '.status // "100"')
        sleep 10
    done

    curl -s "http://localhost:8080/JSON/core/view/alerts/?baseurl=${soulauth_url}" \
        > "${REPORT_DIR}/zap/soulauth_alerts.json" 2>/dev/null || true

    # Generate HTML report
    curl -s "http://localhost:8080/OTHER/core/other/htmlreport/" \
        > "${REPORT_DIR}/zap/full_report.html" 2>/dev/null || true

    # Count ZAP findings
    if [[ -f "${REPORT_DIR}/zap/portal_alerts.json" ]]; then
        local zc zh zm
        zc=$(jq '[.alerts[]? | select(.risk == "3")] | length' "${REPORT_DIR}/zap/portal_alerts.json" 2>/dev/null || echo 0)
        zh=$(jq '[.alerts[]? | select(.risk == "2")] | length' "${REPORT_DIR}/zap/portal_alerts.json" 2>/dev/null || echo 0)
        zm=$(jq '[.alerts[]? | select(.risk == "1")] | length' "${REPORT_DIR}/zap/portal_alerts.json" 2>/dev/null || echo 0)
        CRITICAL_COUNT=$((CRITICAL_COUNT + zc))
        HIGH_COUNT=$((HIGH_COUNT + zh))
        MEDIUM_COUNT=$((MEDIUM_COUNT + zm))
    fi

    log "ZAP scan complete"
}

# ── Phase 4: API Security Testing (Nuclei + Custom) ───────────────────────
phase_api() {
    log_phase 4 "API Security Testing"
    mkdir -p "${REPORT_DIR}/api"

    # Nuclei API-specific templates
    log "Running Nuclei API templates"
    for port in 8000 8001 8002; do
        nuclei -u "http://${TARGET}:${port}" \
            -t http/vulnerabilities/ -t http/exposures/ \
            -t http/misconfiguration/ \
            -severity critical,high,medium \
            -json -output "${REPORT_DIR}/api/nuclei_port_${port}.json" \
            -silent 2>&1 | tee "${REPORT_DIR}/api/nuclei.log"
        count_severity "${REPORT_DIR}/api/nuclei_port_${port}.json"
    done

    # Custom auth bypass tests
    log "Running custom auth bypass tests"
    python3 "${SCRIPT_DIR}/custom-tests/auth-bypass.py" \
        --target "${TARGET}" \
        --output "${REPORT_DIR}/api/auth_bypass.json" 2>&1 | tee "${REPORT_DIR}/api/auth_bypass.log"

    # JWT confusion tests
    log "Running JWT confusion tests"
    python3 "${SCRIPT_DIR}/custom-tests/jwt-confusion.py" \
        --target "${TARGET}" \
        --output "${REPORT_DIR}/api/jwt_confusion.json" 2>&1 | tee "${REPORT_DIR}/api/jwt_confusion.log"
}

# ── Phase 5: Tiresias-Specific Testing ─────────────────────────────────────
phase_tiresias() {
    log_phase 5 "Tiresias-Specific Security Testing"
    mkdir -p "${REPORT_DIR}/tiresias"

    # Tenant isolation tests
    log "Running tenant isolation tests"
    python3 "${SCRIPT_DIR}/custom-tests/tenant-isolation.py" \
        --target "${TARGET}" \
        --output "${REPORT_DIR}/tiresias/tenant_isolation.json" 2>&1 | tee "${REPORT_DIR}/tiresias/tenant_isolation.log"

    # Encryption verification
    log "Running encryption verification"
    python3 "${SCRIPT_DIR}/custom-tests/encryption-verify.py" \
        --target "${TARGET}" \
        --output "${REPORT_DIR}/tiresias/encryption_verify.json" 2>&1 | tee "${REPORT_DIR}/tiresias/encryption_verify.log"
}

# ── Phase 6: Self-Monitoring Analysis ──────────────────────────────────────
phase_selfmon() {
    log_phase 6 "Self-Monitoring Analysis"
    mkdir -p "${REPORT_DIR}/self-monitoring"

    local scan_start
    scan_start=$(cat "${REPORT_DIR}/.scan_start" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

    log "Extracting SoulWatch audit data"
    python3 "${SCRIPT_DIR}/self-monitoring/extract-soulwatch.py" \
        --target "${TARGET}" \
        --scan-start "${scan_start}" \
        --output "${REPORT_DIR}/self-monitoring/soulwatch_audit.json" 2>&1 | tee "${REPORT_DIR}/self-monitoring/extract.log"

    log "Comparing detection rates"
    python3 "${SCRIPT_DIR}/self-monitoring/compare-detection.py" \
        --scan-dir "${REPORT_DIR}" \
        --audit-file "${REPORT_DIR}/self-monitoring/soulwatch_audit.json" \
        --output "${REPORT_DIR}/self-monitoring/detection_rate.json" 2>&1 | tee "${REPORT_DIR}/self-monitoring/compare.log"
}

# ── Generate Summary ──────────────────────────────────────────────────────
generate_summary() {
    log "Generating summary..."
    local scan_end
    scan_end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local scan_start
    scan_start=$(cat "${REPORT_DIR}/.scan_start" 2>/dev/null || echo "$scan_end")

    cat > "${SUMMARY_FILE}" <<ENDJSON
{
    "scan_id": "${DATE_DIR}",
    "profile": "${PROFILE}",
    "target": "${TARGET}",
    "scan_start": "${scan_start}",
    "scan_end": "${scan_end}",
    "findings": {
        "critical": ${CRITICAL_COUNT},
        "high": ${HIGH_COUNT},
        "medium": ${MEDIUM_COUNT},
        "low": ${LOW_COUNT},
        "total": $((CRITICAL_COUNT + HIGH_COUNT + MEDIUM_COUNT + LOW_COUNT))
    },
    "report_dir": "${REPORT_DIR}",
    "phases_run": "$(echo "${PHASES_RUN[@]}" | tr ' ' ',')"
}
ENDJSON

    log "Summary written to ${SUMMARY_FILE}"
    log "Findings: Critical=${CRITICAL_COUNT} High=${HIGH_COUNT} Medium=${MEDIUM_COUNT} Low=${LOW_COUNT}"
}

# ── Send Alerts ───────────────────────────────────────────────────────────
send_alerts() {
    if [[ $CRITICAL_COUNT -gt 0 ]] || [[ $HIGH_COUNT -gt 0 ]]; then
        local msg="Tiresias Pentest Alert\nProfile: ${PROFILE}\nTarget: ${TARGET}\nCritical: ${CRITICAL_COUNT} | High: ${HIGH_COUNT} | Medium: ${MEDIUM_COUNT}\nReport: ${REPORT_DIR}"
        notify_telegram "$msg"
        log "Telegram alert sent (Critical/High findings detected)"
    else
        log "No Critical/High findings — skipping alert"
    fi
}

# ── Profile Execution ─────────────────────────────────────────────────────
PHASES_RUN=()

# Record scan start time
date -u +%Y-%m-%dT%H:%M:%SZ > "${REPORT_DIR}/.scan_start"

log "Starting Tiresias pentest scan"
log "Profile: ${PROFILE} | Target: ${TARGET} | Report: ${REPORT_DIR}"

case "${PROFILE}" in
    full)
        phase_trivy;      PHASES_RUN+=(trivy)
        phase_nuclei_infra; PHASES_RUN+=(nuclei_infra)
        phase_zap;         PHASES_RUN+=(zap)
        phase_api;         PHASES_RUN+=(api)
        phase_tiresias;    PHASES_RUN+=(tiresias)
        phase_selfmon;     PHASES_RUN+=(selfmon)
        ;;
    cve-only)
        phase_trivy;       PHASES_RUN+=(trivy)
        # Also run nuclei with only CVE templates
        log_phase 2 "CVE-Only Nuclei Scan"
        mkdir -p "${REPORT_DIR}/nuclei"
        nuclei -u "http://${TARGET}" \
            -t cves/ -tags cve \
            -new-templates \
            -severity critical,high \
            -json -output "${REPORT_DIR}/nuclei/cve_only.json" \
            -silent 2>&1 | tee "${REPORT_DIR}/nuclei/cve_only.log"
        count_severity "${REPORT_DIR}/nuclei/cve_only.json"
        PHASES_RUN+=(nuclei_cve)
        ;;
    api-auth)
        phase_api;         PHASES_RUN+=(api)
        phase_tiresias;    PHASES_RUN+=(tiresias)
        ;;
    custom)
        # Run only custom Tiresias tests
        phase_tiresias;    PHASES_RUN+=(tiresias)
        phase_selfmon;     PHASES_RUN+=(selfmon)
        ;;
    *)
        log "ERROR: Unknown profile '${PROFILE}'. Use: full|cve-only|api-auth|custom"
        exit 1
        ;;
esac

generate_summary
send_alerts

log "Scan complete. Report: ${REPORT_DIR}"
