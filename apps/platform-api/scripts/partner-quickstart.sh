#!/usr/bin/env bash
# ============================================================================
# Tiresias Partner Quickstart
# Creates a partner invitation and walks through first partner onboarding.
# Designed to complete in under 5 minutes against the live portal.
#
# Prerequisites:
#   - gcloud CLI authenticated with access to salucainfrastructure project
#   - curl, python3 available
#   - Network access to partners.tiresias.network
#
# Usage:
#   ./partner-quickstart.sh [--help]
# ============================================================================
set -euo pipefail

PORTAL_URL="https://partners.tiresias.network"
GCP_PROJECT="salucainfrastructure"
GCP_SECRET_NAME="tiresias-internal-api-key"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---- Help -------------------------------------------------------------------

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat <<'USAGE'
Tiresias Partner Quickstart
===========================

Interactive script to onboard the first partner in under 5 minutes.

Steps performed:
  1. Prompt for partner details (name, email, commission rate)
  2. Pull admin API key from GCP Secret Manager
  3. Create an invitation via POST /v1/partner/invitations
  4. Display the invitation token and onboarding URL
  5. Optionally wait for the partner to complete onboarding
  6. Show the new partner's details

Prerequisites:
  - gcloud CLI authenticated (salucainfrastructure project)
  - curl, python3
  - Network access to partners.tiresias.network

Usage:
  ./partner-quickstart.sh          Run the interactive quickstart
  ./partner-quickstart.sh --help   Show this help

Environment overrides:
  INTERNAL_API_KEY   Skip GCP Secret Manager lookup
  PORTAL_URL         Override portal base URL (default: https://partners.tiresias.network)
USAGE
    exit 0
fi

# ---- Utility functions -------------------------------------------------------

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

pretty_json() {
    python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin), indent=2))" 2>/dev/null || cat
}

prompt() {
    local var_name="$1" prompt_text="$2" default="${3:-}"
    if [[ -n "$default" ]]; then
        read -rp "$(echo -e "${BOLD}$prompt_text${NC} [$default]: ")" value
        eval "$var_name=\"${value:-$default}\""
    else
        read -rp "$(echo -e "${BOLD}$prompt_text${NC}: ")" value
        [[ -z "$value" ]] && fail "Value required for: $prompt_text"
        eval "$var_name=\"$value\""
    fi
}

# ---- Portal override --------------------------------------------------------

PORTAL_URL="${PORTAL_URL:-https://partners.tiresias.network}"

# ============================================================================
# Step 1: Collect partner details
# ============================================================================

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  Tiresias Partner Quickstart${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
info "This script creates a partner invitation and walks through onboarding."
info "Target portal: ${PORTAL_URL}"
echo ""

prompt PARTNER_NAME  "Partner company name"
prompt PARTNER_EMAIL "Contact email"
prompt COMMISSION    "Commission rate (0.0 to 1.0)" "0.40"
prompt TTL_DAYS      "Invitation TTL in days" "30"

echo ""
info "Partner:    $PARTNER_NAME"
info "Email:      $PARTNER_EMAIL"
info "Commission: $COMMISSION"
info "TTL:        $TTL_DAYS days"
echo ""

# ============================================================================
# Step 2: Get auth credentials
# ============================================================================

if [[ -n "${INTERNAL_API_KEY:-}" ]]; then
    info "Using INTERNAL_API_KEY from environment."
    API_KEY="$INTERNAL_API_KEY"
else
    info "Pulling API key from GCP Secret Manager..."
    info "  Project: $GCP_PROJECT"
    info "  Secret:  $GCP_SECRET_NAME"

    API_KEY=$(gcloud secrets versions access latest \
        --secret="$GCP_SECRET_NAME" \
        --project="$GCP_PROJECT" 2>/dev/null) \
        || fail "Could not retrieve secret '$GCP_SECRET_NAME' from GCP. Ensure gcloud is authenticated."

    success "API key retrieved from GCP Secret Manager."
fi

[[ -z "$API_KEY" ]] && fail "API key is empty. Check secret '$GCP_SECRET_NAME' in project '$GCP_PROJECT'."

# ============================================================================
# Step 3: Create invitation
# ============================================================================

info "Creating partner invitation..."
echo ""

INVITE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${PORTAL_URL}/v1/partner/invitations" \
    -H "Content-Type: application/json" \
    -H "X-Internal-Key: ${API_KEY}" \
    -d "$(python3 -c "
import json
print(json.dumps({
    'partner_name': '${PARTNER_NAME}',
    'contact_email': '${PARTNER_EMAIL}',
    'commission_rate': float('${COMMISSION}'),
    'ttl_days': int('${TTL_DAYS}')
}))
")")

HTTP_CODE=$(echo "$INVITE_RESPONSE" | tail -1)
INVITE_BODY=$(echo "$INVITE_RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
    success "Invitation created! (HTTP $HTTP_CODE)"
else
    fail "Invitation creation failed (HTTP $HTTP_CODE):\n$INVITE_BODY"
fi

# ============================================================================
# Step 4: Display invitation token and onboarding URL
# ============================================================================

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  Invitation Details${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

echo "$INVITE_BODY" | pretty_json

# Extract token for convenience
INVITE_TOKEN=$(echo "$INVITE_BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', ''))" 2>/dev/null || echo "")
TOKEN_ID=$(echo "$INVITE_BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('token_id', ''))" 2>/dev/null || echo "")
EXPIRES_AT=$(echo "$INVITE_BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('expires_at', ''))" 2>/dev/null || echo "")

if [[ -n "$INVITE_TOKEN" ]]; then
    echo ""
    echo -e "${BOLD}Invitation Token (send to partner securely):${NC}"
    echo -e "${YELLOW}${INVITE_TOKEN}${NC}"
    echo ""
    echo -e "${BOLD}Token ID:${NC}   $TOKEN_ID"
    echo -e "${BOLD}Expires:${NC}    $EXPIRES_AT"
    echo ""
    echo -e "${BOLD}Onboarding endpoint:${NC}"
    echo "  POST ${PORTAL_URL}/v1/partner/onboard"
    echo '  Body: {"invitation_token": "<token above>"}'
fi

# ============================================================================
# Step 5: Optionally trigger onboarding now (self-service)
# ============================================================================

echo ""
read -rp "$(echo -e "${BOLD}Onboard this partner now using the token? (y/N):${NC} ")" DO_ONBOARD

if [[ "${DO_ONBOARD,,}" == "y" ]]; then
    info "Submitting onboard request..."

    ONBOARD_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST "${PORTAL_URL}/v1/partner/onboard" \
        -H "Content-Type: application/json" \
        -d "$(python3 -c "import json; print(json.dumps({'invitation_token': '${INVITE_TOKEN}'}))")")

    OB_CODE=$(echo "$ONBOARD_RESPONSE" | tail -1)
    OB_BODY=$(echo "$ONBOARD_RESPONSE" | sed '$d')

    if [[ "$OB_CODE" -ge 200 && "$OB_CODE" -lt 300 ]]; then
        success "Partner onboarded! (HTTP $OB_CODE)"
        echo ""
        echo -e "${BOLD}============================================${NC}"
        echo -e "${BOLD}  Partner Onboarding Result${NC}"
        echo -e "${BOLD}============================================${NC}"
        echo ""
        echo "$OB_BODY" | pretty_json

        # Extract the key fields
        PARTNER_ID=$(echo "$OB_BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('partner_id', ''))" 2>/dev/null || echo "")
        TENANT_ID=$(echo "$OB_BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('tenant_id', ''))" 2>/dev/null || echo "")
        REFERRAL_CODE=$(echo "$OB_BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('referral_code', ''))" 2>/dev/null || echo "")
        RAW_KEY=$(echo "$OB_BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('raw_key', ''))" 2>/dev/null || echo "")
        NEXT_STEP=$(echo "$OB_BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('next_step', ''))" 2>/dev/null || echo "")

        echo ""
        echo -e "${RED}${BOLD}IMPORTANT: Save the admin soulkey below. It is shown only once.${NC}"
        echo -e "${YELLOW}${RAW_KEY}${NC}"
        echo ""
        echo -e "${BOLD}Partner ID:${NC}    $PARTNER_ID"
        echo -e "${BOLD}Tenant ID:${NC}     $TENANT_ID"
        echo -e "${BOLD}Referral Code:${NC} $REFERRAL_CODE"
        echo -e "${BOLD}Next Step:${NC}     $NEXT_STEP"
    else
        warn "Onboarding failed (HTTP $OB_CODE):"
        echo "$OB_BODY" | pretty_json
    fi
else
    info "Skipping onboarding. Send the invitation token to the partner to self-onboard."
fi

# ============================================================================
# Step 6: Optionally poll for partner in admin list
# ============================================================================

echo ""
read -rp "$(echo -e "${BOLD}Check admin partner list now? (y/N):${NC} ")" DO_CHECK

if [[ "${DO_CHECK,,}" == "y" ]]; then
    info "Fetching partner list from admin API..."

    LIST_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X GET "${PORTAL_URL}/v1/admin/partners?search=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${PARTNER_NAME}'))")" \
        -H "X-Internal-Key: ${API_KEY}")

    LIST_CODE=$(echo "$LIST_RESPONSE" | tail -1)
    LIST_BODY=$(echo "$LIST_RESPONSE" | sed '$d')

    if [[ "$LIST_CODE" -ge 200 && "$LIST_CODE" -lt 300 ]]; then
        success "Partner list retrieved (HTTP $LIST_CODE):"
        echo ""
        echo "$LIST_BODY" | pretty_json
    else
        warn "Could not fetch partner list (HTTP $LIST_CODE):"
        echo "$LIST_BODY" | pretty_json
    fi
fi

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${GREEN}${BOLD}  Quickstart complete.${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
info "Next steps for the partner:"
info "  1. Complete Stripe Connect onboarding (link above)"
info "  2. Use their referral code to refer customers"
info "  3. Access their dashboard at: ${PORTAL_URL}/v1/partner/me"
echo ""
info "Admin tools: ./partner-admin-tools.sh --help"
echo ""
