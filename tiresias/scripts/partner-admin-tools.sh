#!/usr/bin/env bash
# ============================================================================
# Tiresias Partner Admin Tools
# CLI for ongoing partner management against the live portal.
#
# Prerequisites:
#   - gcloud CLI authenticated with access to salucainfrastructure project
#   - curl, python3 available
#   - Network access to partners.tiresias.network
#
# Usage:
#   partner-admin-tools.sh <command> [args]
#
# Commands:
#   list                              List all partners (with optional filters)
#   detail <partner_id>               Show full partner details
#   invite <name> <email> [rate]      Create a partner invitation
#   onboard <token>                   Onboard using an invitation token
#   deactivate <partner_id> <reason>  Suspend a partner
#   reactivate <partner_id> [reason]  Reactivate a suspended partner
#   terms <partner_id> [--rate R] [--type T] [--payout P]
#                                     Update partner terms
#   audit <partner_id>                Show partner audit trail
#   invitations [--status S]          List partner invitations
#   revoke-invite <invitation_id> [reason]
#                                     Revoke a pending invitation
#
# Environment overrides:
#   INTERNAL_API_KEY   Skip GCP Secret Manager lookup
#   PORTAL_URL         Override portal base URL
# ============================================================================
set -euo pipefail

PORTAL_URL="${PORTAL_URL:-https://partners.tiresias.network}"
GCP_PROJECT="salucainfrastructure"
GCP_SECRET_NAME="tiresias-internal-api-key"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---- Utility functions -------------------------------------------------------

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

pretty_json() {
    python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin), indent=2))" 2>/dev/null || cat
}

# ---- Auth --------------------------------------------------------------------

get_api_key() {
    if [[ -n "${INTERNAL_API_KEY:-}" ]]; then
        echo "$INTERNAL_API_KEY"
        return
    fi
    gcloud secrets versions access latest \
        --secret="$GCP_SECRET_NAME" \
        --project="$GCP_PROJECT" 2>/dev/null \
        || fail "Could not retrieve API key from GCP Secret Manager. Set INTERNAL_API_KEY or authenticate gcloud."
}

# Lazy-load API key on first use
_API_KEY=""
api_key() {
    if [[ -z "$_API_KEY" ]]; then
        _API_KEY=$(get_api_key)
        [[ -z "$_API_KEY" ]] && fail "API key is empty."
    fi
    echo "$_API_KEY"
}

# ---- HTTP helpers ------------------------------------------------------------

# Usage: api_call METHOD PATH [body]
# Auth header: X-Internal-Key (for admin endpoints using require_permission)
# Soulkey header: X-SoulKey or Authorization Bearer (for partner endpoints)
# This tool uses X-Internal-Key for all admin operations.
api_call() {
    local method="$1" path="$2" body="${3:-}"
    local key
    key=$(api_key)

    local args=(
        -s -w "\n%{http_code}"
        -X "$method"
        "${PORTAL_URL}${path}"
        -H "Content-Type: application/json"
        -H "X-Internal-Key: ${key}"
    )

    if [[ -n "$body" ]]; then
        args+=(-d "$body")
    fi

    local response
    response=$(curl "${args[@]}")

    local http_code
    http_code=$(echo "$response" | tail -1)
    local body_out
    body_out=$(echo "$response" | sed '$d')

    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
        echo "$body_out" | pretty_json
    else
        echo -e "${RED}HTTP $http_code${NC}" >&2
        echo "$body_out" | pretty_json >&2
        return 1
    fi
}

# ---- Help --------------------------------------------------------------------

show_help() {
    cat <<'HELP'
Tiresias Partner Admin Tools
============================

Usage: partner-admin-tools.sh <command> [args]

Commands:
  list [--status S] [--type T] [--search Q] [--page N]
      List all partners. Optional filters:
        --status   active, suspended, pending
        --type     reseller, mssp
        --search   Search name, email, or referral code
        --page     Page number (default: 1)

  detail <partner_id>
      Show full partner details including referrals and audit trail.

  invite <name> <email> [commission_rate]
      Create a new partner invitation. Commission rate defaults to 0.40.

  onboard <token>
      Complete onboarding using an invitation token.

  deactivate <partner_id> <reason>
      Suspend a partner. Freezes payouts and prevents new referrals.

  reactivate <partner_id> [reason]
      Reactivate a previously suspended partner.

  terms <partner_id> [--rate R] [--type T] [--payout P]
      Update partner terms:
        --rate     Commission rate (0.10 to 0.40)
        --type     Partner type: reseller or mssp
        --payout   Payout frequency: monthly or quarterly

  audit <partner_id> [--page N]
      Show the audit trail for a specific partner.

  invitations [--status S]
      List all partner invitations. Optional status filter:
        active, consumed, expired, revoked

  revoke-invite <invitation_id> [reason]
      Revoke a pending invitation.

Environment:
  INTERNAL_API_KEY   Provide API key directly (skips GCP Secret Manager)
  PORTAL_URL         Override portal URL (default: https://partners.tiresias.network)

Examples:
  ./partner-admin-tools.sh list
  ./partner-admin-tools.sh list --status active --search "Acme"
  ./partner-admin-tools.sh invite "Acme Security" "cto@acme.com" 0.35
  ./partner-admin-tools.sh detail 550e8400-e29b-41d4-a716-446655440000
  ./partner-admin-tools.sh deactivate 550e8400-... "Contract violation"
  ./partner-admin-tools.sh terms 550e8400-... --rate 0.35 --payout monthly
  ./partner-admin-tools.sh invitations --status active
HELP
    exit 0
}

# ============================================================================
# Commands
# ============================================================================

# ---- list --------------------------------------------------------------------

cmd_list() {
    local status="" ptype="" search="" page="1"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --status)  status="$2";  shift 2 ;;
            --type)    ptype="$2";   shift 2 ;;
            --search)  search="$2";  shift 2 ;;
            --page)    page="$2";    shift 2 ;;
            *)         warn "Unknown flag: $1"; shift ;;
        esac
    done

    local query="page=${page}&per_page=20"
    [[ -n "$status" ]] && query="${query}&status=${status}"
    [[ -n "$ptype" ]]  && query="${query}&partner_type=${ptype}"
    if [[ -n "$search" ]]; then
        local encoded
        encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${search}'))")
        query="${query}&search=${encoded}"
    fi

    info "Listing partners..."
    api_call GET "/v1/admin/partners?${query}"
}

# ---- detail ------------------------------------------------------------------

cmd_detail() {
    local partner_id="${1:-}"
    [[ -z "$partner_id" ]] && fail "Usage: partner-admin-tools.sh detail <partner_id>"

    info "Fetching partner detail: $partner_id"
    api_call GET "/v1/admin/partners/${partner_id}"
}

# ---- invite ------------------------------------------------------------------

cmd_invite() {
    local name="${1:-}" email="${2:-}" rate="${3:-0.40}"
    [[ -z "$name" || -z "$email" ]] && fail "Usage: partner-admin-tools.sh invite <name> <email> [commission_rate]"

    local body
    body=$(python3 -c "
import json
print(json.dumps({
    'partner_name': '''${name}''',
    'contact_email': '''${email}''',
    'commission_rate': float('${rate}'),
    'ttl_days': 30
}))
")

    info "Creating invitation for: $name ($email) at ${rate} commission..."
    api_call POST "/v1/partner/invitations" "$body"
}

# ---- onboard -----------------------------------------------------------------

cmd_onboard() {
    local token="${1:-}"
    [[ -z "$token" ]] && fail "Usage: partner-admin-tools.sh onboard <invitation_token>"

    local body
    body=$(python3 -c "import json; print(json.dumps({'invitation_token': '''${token}'''}))")

    info "Submitting onboard request..."
    # Note: /v1/partner/onboard does not require admin auth (token-based)
    local response
    response=$(curl -s -w "\n%{http_code}" \
        -X POST "${PORTAL_URL}/v1/partner/onboard" \
        -H "Content-Type: application/json" \
        -d "$body")

    local http_code
    http_code=$(echo "$response" | tail -1)
    local body_out
    body_out=$(echo "$response" | sed '$d')

    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
        success "Partner onboarded! (HTTP $http_code)"
        echo "$body_out" | pretty_json

        local raw_key
        raw_key=$(echo "$body_out" | python3 -c "import sys, json; print(json.load(sys.stdin).get('raw_key', ''))" 2>/dev/null || echo "")
        if [[ -n "$raw_key" ]]; then
            echo ""
            echo -e "${RED}${BOLD}IMPORTANT: Save this admin soulkey. It is shown only once.${NC}"
            echo -e "${YELLOW}${raw_key}${NC}"
        fi
    else
        echo -e "${RED}HTTP $http_code${NC}" >&2
        echo "$body_out" | pretty_json >&2
        return 1
    fi
}

# ---- deactivate --------------------------------------------------------------

cmd_deactivate() {
    local partner_id="${1:-}" reason="${2:-}"
    [[ -z "$partner_id" || -z "$reason" ]] && fail "Usage: partner-admin-tools.sh deactivate <partner_id> <reason>"

    local body
    body=$(python3 -c "import json; print(json.dumps({'reason': '''${reason}'''}))")

    info "Deactivating partner: $partner_id"
    warn "Reason: $reason"
    api_call POST "/v1/admin/partners/${partner_id}/deactivate" "$body"
}

# ---- reactivate --------------------------------------------------------------

cmd_reactivate() {
    local partner_id="${1:-}" reason="${2:-}"
    [[ -z "$partner_id" ]] && fail "Usage: partner-admin-tools.sh reactivate <partner_id> [reason]"

    local body
    body=$(python3 -c "import json; print(json.dumps({'reason': '''${reason}''' if '''${reason}''' else None}))")

    info "Reactivating partner: $partner_id"
    api_call POST "/v1/admin/partners/${partner_id}/reactivate" "$body"
}

# ---- terms -------------------------------------------------------------------

cmd_terms() {
    local partner_id="${1:-}"
    [[ -z "$partner_id" ]] && fail "Usage: partner-admin-tools.sh terms <partner_id> [--rate R] [--type T] [--payout P]"
    shift

    local rate="" ptype="" payout=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --rate)   rate="$2";   shift 2 ;;
            --type)   ptype="$2";  shift 2 ;;
            --payout) payout="$2"; shift 2 ;;
            *)        warn "Unknown flag: $1"; shift ;;
        esac
    done

    [[ -z "$rate" && -z "$ptype" && -z "$payout" ]] && fail "Provide at least one of: --rate, --type, --payout"

    local body
    body=$(python3 -c "
import json
d = {}
rate = '${rate}'
ptype = '${ptype}'
payout = '${payout}'
if rate:
    d['commission_rate'] = float(rate)
if ptype:
    d['partner_type'] = ptype
if payout:
    d['payout_frequency'] = payout
print(json.dumps(d))
")

    info "Updating terms for partner: $partner_id"
    api_call PATCH "/v1/admin/partners/${partner_id}/terms" "$body"
}

# ---- audit -------------------------------------------------------------------

cmd_audit() {
    local partner_id="${1:-}" page="1"
    [[ -z "$partner_id" ]] && fail "Usage: partner-admin-tools.sh audit <partner_id> [--page N]"
    shift || true

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --page) page="$2"; shift 2 ;;
            *)      shift ;;
        esac
    done

    info "Fetching audit trail for partner: $partner_id (page $page)"
    api_call GET "/v1/admin/partners/${partner_id}/audit?page=${page}&per_page=50"
}

# ---- invitations -------------------------------------------------------------

cmd_invitations() {
    local status=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --status) status="$2"; shift 2 ;;
            *)        warn "Unknown flag: $1"; shift ;;
        esac
    done

    local query=""
    [[ -n "$status" ]] && query="?status=${status}"

    info "Listing partner invitations..."
    api_call GET "/v1/admin/invitations${query}"
}

# ---- revoke-invite -----------------------------------------------------------

cmd_revoke_invite() {
    local invitation_id="${1:-}" reason="${2:-}"
    [[ -z "$invitation_id" ]] && fail "Usage: partner-admin-tools.sh revoke-invite <invitation_id> [reason]"

    local body=""
    if [[ -n "$reason" ]]; then
        body=$(python3 -c "import json; print(json.dumps({'reason': '''${reason}'''}))")
    fi

    info "Revoking invitation: $invitation_id"
    # DELETE with optional body
    local key
    key=$(api_key)

    local args=(
        -s -w "\n%{http_code}"
        -X DELETE
        "${PORTAL_URL}/v1/admin/invitations/${invitation_id}"
        -H "Content-Type: application/json"
        -H "X-Internal-Key: ${key}"
    )
    [[ -n "$body" ]] && args+=(-d "$body")

    local response
    response=$(curl "${args[@]}")

    local http_code
    http_code=$(echo "$response" | tail -1)
    local body_out
    body_out=$(echo "$response" | sed '$d')

    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
        success "Invitation revoked."
        echo "$body_out" | pretty_json
    else
        echo -e "${RED}HTTP $http_code${NC}" >&2
        echo "$body_out" | pretty_json >&2
        return 1
    fi
}

# ============================================================================
# Dispatcher
# ============================================================================

COMMAND="${1:-}"
shift || true

case "$COMMAND" in
    list)           cmd_list "$@" ;;
    detail)         cmd_detail "$@" ;;
    invite)         cmd_invite "$@" ;;
    onboard)        cmd_onboard "$@" ;;
    deactivate)     cmd_deactivate "$@" ;;
    reactivate)     cmd_reactivate "$@" ;;
    terms)          cmd_terms "$@" ;;
    audit)          cmd_audit "$@" ;;
    invitations)    cmd_invitations "$@" ;;
    revoke-invite)  cmd_revoke_invite "$@" ;;
    --help|-h|help) show_help ;;
    "")             show_help ;;
    *)              fail "Unknown command: $COMMAND. Run with --help for usage." ;;
esac
