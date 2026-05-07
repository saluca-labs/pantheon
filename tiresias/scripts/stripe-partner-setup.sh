#!/usr/bin/env bash
# =============================================================================
# Tiresias Partner Program — Stripe Product & Price Setup
# =============================================================================
# Creates all Stripe products, prices, and webhook registrations required
# for the MSSP Partner Program.
#
# Usage:
#   bash scripts/stripe-partner-setup.sh          # Test mode (default)
#   STRIPE_LIVE=1 bash scripts/stripe-partner-setup.sh   # Live mode
#
# Prerequisites:
#   - Stripe CLI installed (https://stripe.com/docs/stripe-cli)
#   - Authenticated: stripe login
#   - For live mode: stripe login --live
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WEBHOOK_URL="${STRIPE_PARTNER_WEBHOOK_URL:-https://api.tiresias.network/v1/stripe/partner-webhooks}"

# All 13 event types for the partner webhook endpoint
WEBHOOK_EVENTS="account.updated,\
account.application.deauthorized,\
invoice.paid,\
invoice.payment_failed,\
invoice.finalized,\
customer.subscription.updated,\
customer.subscription.deleted,\
transfer.created,\
transfer.failed,\
payout.paid,\
payout.failed,\
charge.dispute.created,\
charge.dispute.closed"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m    $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
err()   { echo -e "\033[1;31m[ERROR]\033[0m $*"; exit 1; }

extract_id() {
    # Extract the "id" field from Stripe CLI JSON output
    grep -o '"id": *"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"'
}

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
info "Running preflight checks..."

if ! command -v stripe &>/dev/null; then
    err "Stripe CLI not found. Install: https://stripe.com/docs/stripe-cli#install"
fi

if ! command -v jq &>/dev/null; then
    warn "jq not found. Output parsing will use grep fallback."
    USE_JQ=0
else
    USE_JQ=1
fi

# Verify authentication
if ! stripe config --list &>/dev/null 2>&1; then
    err "Stripe CLI not authenticated. Run: stripe login"
fi

if [[ "${STRIPE_LIVE:-0}" == "1" ]]; then
    MODE_FLAG="--live"
    info "*** LIVE MODE *** All objects will be created in production."
    echo ""
    read -rp "Are you sure you want to create live products? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        info "Aborted."
        exit 0
    fi
else
    MODE_FLAG=""
    info "Test mode. Set STRIPE_LIVE=1 for production."
fi

ok "Preflight checks passed."
echo ""

# ---------------------------------------------------------------------------
# Helper: check if a product with a given name already exists
# ---------------------------------------------------------------------------
find_product_by_name() {
    local name="$1"
    local result
    if [[ "$USE_JQ" == "1" ]]; then
        result=$(stripe products list $MODE_FLAG --limit=100 2>/dev/null \
            | jq -r ".data[] | select(.name == \"$name\") | .id" 2>/dev/null | head -1)
    else
        result=$(stripe products list $MODE_FLAG --limit=100 2>/dev/null \
            | grep -B5 "\"$name\"" | grep '"id"' | head -1 | grep -o 'prod_[a-zA-Z0-9]*')
    fi
    echo "$result"
}

# ---------------------------------------------------------------------------
# Step 1: Create MSSP Partner Base Product
# ---------------------------------------------------------------------------
info "Step 1/5: Creating MSSP Partner Base product..."

EXISTING_MSSP=$(find_product_by_name "Tiresias MSSP Partner")
if [[ -n "$EXISTING_MSSP" ]]; then
    warn "Product 'Tiresias MSSP Partner' already exists: $EXISTING_MSSP (skipping)"
    MSSP_PRODUCT_ID="$EXISTING_MSSP"
else
    MSSP_OUTPUT=$(stripe products create $MODE_FLAG \
        --name="Tiresias MSSP Partner" \
        --description="MSSP Partner base subscription. Includes multi-tenant hierarchy, white-label branding, tenant provisioning API, and cross-tenant detection views." \
        --statement-descriptor="TIRESIAS MSSP" \
        --tax-code="txcd_10103001" \
        -d "metadata[tier]=mssp" \
        -d "metadata[product_line]=tiresias" \
        -d "metadata[partner_eligible]=true" \
        -d "metadata[billing_model]=partner_billed" \
        2>&1)

    if [[ "$USE_JQ" == "1" ]]; then
        MSSP_PRODUCT_ID=$(echo "$MSSP_OUTPUT" | jq -r '.id' 2>/dev/null)
    else
        MSSP_PRODUCT_ID=$(echo "$MSSP_OUTPUT" | extract_id)
    fi

    if [[ -z "$MSSP_PRODUCT_ID" || "$MSSP_PRODUCT_ID" == "null" ]]; then
        err "Failed to create MSSP Partner product. Output:\n$MSSP_OUTPUT"
    fi
    ok "Created MSSP Partner product: $MSSP_PRODUCT_ID"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 2: Create MSSP Monthly Price
# ---------------------------------------------------------------------------
info "Step 2/5: Creating MSSP Monthly price (\$4,999/mo)..."

MSSP_MONTHLY_OUTPUT=$(stripe prices create $MODE_FLAG \
    --product="$MSSP_PRODUCT_ID" \
    --unit-amount=499900 \
    --currency=usd \
    --recurring-interval=month \
    --lookup-key="tiresias_mssp_partner_monthly" \
    -d "metadata[tier]=mssp" \
    -d "metadata[product_line]=tiresias" \
    -d "metadata[partner_eligible]=true" \
    -d "metadata[includes]=base_platform" \
    2>&1)

if [[ "$USE_JQ" == "1" ]]; then
    MSSP_MONTHLY_PRICE_ID=$(echo "$MSSP_MONTHLY_OUTPUT" | jq -r '.id' 2>/dev/null)
else
    MSSP_MONTHLY_PRICE_ID=$(echo "$MSSP_MONTHLY_OUTPUT" | extract_id)
fi

if [[ -z "$MSSP_MONTHLY_PRICE_ID" || "$MSSP_MONTHLY_PRICE_ID" == "null" ]]; then
    err "Failed to create MSSP Monthly price. Output:\n$MSSP_MONTHLY_OUTPUT"
fi
ok "Created MSSP Monthly price: $MSSP_MONTHLY_PRICE_ID"
echo ""

# ---------------------------------------------------------------------------
# Step 3: Create MSSP Annual Price
# ---------------------------------------------------------------------------
info "Step 3/5: Creating MSSP Annual price (\$49,999/yr)..."

MSSP_ANNUAL_OUTPUT=$(stripe prices create $MODE_FLAG \
    --product="$MSSP_PRODUCT_ID" \
    --unit-amount=4999900 \
    --currency=usd \
    --recurring-interval=year \
    --lookup-key="tiresias_mssp_partner_annual" \
    -d "metadata[tier]=mssp" \
    -d "metadata[product_line]=tiresias" \
    -d "metadata[partner_eligible]=true" \
    -d "metadata[includes]=base_platform" \
    2>&1)

if [[ "$USE_JQ" == "1" ]]; then
    MSSP_ANNUAL_PRICE_ID=$(echo "$MSSP_ANNUAL_OUTPUT" | jq -r '.id' 2>/dev/null)
else
    MSSP_ANNUAL_PRICE_ID=$(echo "$MSSP_ANNUAL_OUTPUT" | extract_id)
fi

if [[ -z "$MSSP_ANNUAL_PRICE_ID" || "$MSSP_ANNUAL_PRICE_ID" == "null" ]]; then
    err "Failed to create MSSP Annual price. Output:\n$MSSP_ANNUAL_OUTPUT"
fi
ok "Created MSSP Annual price: $MSSP_ANNUAL_PRICE_ID"
echo ""

# ---------------------------------------------------------------------------
# Step 4: Create Per-Tenant Add-on Product + Metered Price
# ---------------------------------------------------------------------------
info "Step 4/5: Creating Per-Tenant Add-on product..."

EXISTING_TENANT=$(find_product_by_name "Tiresias MSSP Per-Tenant Add-on")
if [[ -n "$EXISTING_TENANT" ]]; then
    warn "Product 'Tiresias MSSP Per-Tenant Add-on' already exists: $EXISTING_TENANT (skipping)"
    TENANT_PRODUCT_ID="$EXISTING_TENANT"
else
    TENANT_OUTPUT=$(stripe products create $MODE_FLAG \
        --name="Tiresias MSSP Per-Tenant Add-on" \
        --description="Per-tenant metered billing for MSSP partners. Each active sub-tenant counts as one unit." \
        --statement-descriptor="TIRESIAS TENANT" \
        --unit-label="tenant" \
        --tax-code="txcd_10103001" \
        -d "metadata[tier]=mssp" \
        -d "metadata[product_line]=tiresias" \
        -d "metadata[partner_eligible]=true" \
        -d "metadata[billing_model]=metered" \
        -d "metadata[usage_type]=tenant_count" \
        2>&1)

    if [[ "$USE_JQ" == "1" ]]; then
        TENANT_PRODUCT_ID=$(echo "$TENANT_OUTPUT" | jq -r '.id' 2>/dev/null)
    else
        TENANT_PRODUCT_ID=$(echo "$TENANT_OUTPUT" | extract_id)
    fi

    if [[ -z "$TENANT_PRODUCT_ID" || "$TENANT_PRODUCT_ID" == "null" ]]; then
        err "Failed to create Per-Tenant product. Output:\n$TENANT_OUTPUT"
    fi
    ok "Created Per-Tenant Add-on product: $TENANT_PRODUCT_ID"
fi

info "Creating Per-Tenant metered price (\$199/unit/mo)..."

TENANT_PRICE_OUTPUT=$(stripe prices create $MODE_FLAG \
    --product="$TENANT_PRODUCT_ID" \
    --unit-amount=19900 \
    --currency=usd \
    --recurring-interval=month \
    --recurring-usage-type=metered \
    --recurring-aggregate-usage=last_during_period \
    --lookup-key="tiresias_mssp_per_tenant" \
    -d "metadata[tier]=mssp" \
    -d "metadata[product_line]=tiresias" \
    -d "metadata[partner_eligible]=true" \
    -d "metadata[unit_type]=tenant" \
    2>&1)

if [[ "$USE_JQ" == "1" ]]; then
    TENANT_PRICE_ID=$(echo "$TENANT_PRICE_OUTPUT" | jq -r '.id' 2>/dev/null)
else
    TENANT_PRICE_ID=$(echo "$TENANT_PRICE_OUTPUT" | extract_id)
fi

if [[ -z "$TENANT_PRICE_ID" || "$TENANT_PRICE_ID" == "null" ]]; then
    err "Failed to create Per-Tenant metered price. Output:\n$TENANT_PRICE_OUTPUT"
fi
ok "Created Per-Tenant metered price: $TENANT_PRICE_ID"
echo ""

# ---------------------------------------------------------------------------
# Step 5: Register Webhook Endpoint
# ---------------------------------------------------------------------------
info "Step 5/5: Registering partner webhook endpoint..."
info "URL: $WEBHOOK_URL"

WEBHOOK_OUTPUT=$(stripe webhook_endpoints create $MODE_FLAG \
    --url="$WEBHOOK_URL" \
    --enabled-events="$WEBHOOK_EVENTS" \
    -d "api_version=2025-12-18.acacia" \
    -d "metadata[purpose]=partner_program" \
    -d "metadata[product_line]=tiresias" \
    -d "connect=true" \
    2>&1)

if [[ "$USE_JQ" == "1" ]]; then
    WEBHOOK_ID=$(echo "$WEBHOOK_OUTPUT" | jq -r '.id' 2>/dev/null)
    WEBHOOK_SECRET=$(echo "$WEBHOOK_OUTPUT" | jq -r '.secret // empty' 2>/dev/null)
else
    WEBHOOK_ID=$(echo "$WEBHOOK_OUTPUT" | extract_id)
    WEBHOOK_SECRET=$(echo "$WEBHOOK_OUTPUT" | grep -o '"secret": *"[^"]*"' | grep -o 'whsec_[a-zA-Z0-9]*' || true)
fi

if [[ -z "$WEBHOOK_ID" || "$WEBHOOK_ID" == "null" ]]; then
    warn "Webhook creation may have failed. Output:\n$WEBHOOK_OUTPUT"
    warn "You may need to register the webhook manually in the Stripe Dashboard."
else
    ok "Created webhook endpoint: $WEBHOOK_ID"
fi
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "============================================================================="
echo " Tiresias Partner Program — Stripe Setup Complete"
echo "============================================================================="
echo ""
echo " Copy the following into your .env (or .env.partner):"
echo ""
echo "   STRIPE_PARTNER_PRODUCT_MSSP=$MSSP_PRODUCT_ID"
echo "   STRIPE_PARTNER_PRICE_MSSP_MONTHLY=$MSSP_MONTHLY_PRICE_ID"
echo "   STRIPE_PARTNER_PRICE_MSSP_ANNUAL=$MSSP_ANNUAL_PRICE_ID"
echo "   STRIPE_PARTNER_PRODUCT_TENANT_ADDON=$TENANT_PRODUCT_ID"
echo "   STRIPE_PARTNER_PRICE_PER_TENANT=$TENANT_PRICE_ID"
if [[ -n "${WEBHOOK_SECRET:-}" ]]; then
echo "   STRIPE_PARTNER_WEBHOOK_SECRET=$WEBHOOK_SECRET"
else
echo "   STRIPE_PARTNER_WEBHOOK_SECRET=<retrieve from Dashboard>"
fi
echo ""
echo " Verify lookup keys:"
echo "   stripe prices list --lookup-keys tiresias_mssp_partner_monthly $MODE_FLAG"
echo "   stripe prices list --lookup-keys tiresias_mssp_partner_annual $MODE_FLAG"
echo "   stripe prices list --lookup-keys tiresias_mssp_per_tenant $MODE_FLAG"
echo ""
echo "============================================================================="
