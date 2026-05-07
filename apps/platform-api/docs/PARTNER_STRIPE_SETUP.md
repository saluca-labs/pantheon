# Partner Stripe Setup — Operational Runbook

Step-by-step guide for configuring Stripe to support the Tiresias Partner Program (MSSP channel). This covers product creation, Connect configuration, webhook registration, local testing, and live promotion.

## Prerequisites

Before starting, ensure you have:

1. **Stripe account** with admin access to the Tiresias platform account
2. **Stripe CLI** installed and authenticated
   ```bash
   # Install (macOS)
   brew install stripe/stripe-cli/stripe

   # Install (Windows, via scoop)
   scoop install stripe

   # Install (Linux, via apt)
   curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
   echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list
   sudo apt update && sudo apt install stripe

   # Authenticate
   stripe login
   ```
3. **Stripe Connect** enabled on the platform account (Dashboard > Connect > Get started)
4. **jq** installed (optional but recommended for output parsing)

## Step 1: Run the Setup Script

The script creates all products, prices, and webhook endpoints in Stripe Test Mode.

```bash
cd Z:/tiresias

# Test mode (default)
bash scripts/stripe-partner-setup.sh

# Live mode (after testing is complete)
STRIPE_LIVE=1 bash scripts/stripe-partner-setup.sh
```

The script will:
- Check that the Stripe CLI is installed and authenticated
- Skip product creation if a product with the same name already exists
- Create the MSSP Partner Base product and both price objects (monthly + annual)
- Create the Per-Tenant Add-on product and metered price
- Register the partner webhook endpoint with all 13 required event types
- Print all created IDs for you to copy into `.env`

## Step 2: Save Environment Variables

Copy the IDs printed by the script into your environment configuration.

For local development, merge the values into your `.env` file (using `.env.partner.example` as reference):

```bash
# Copy the template
cp .env.partner.example .env.partner

# Edit and fill in the IDs from the script output
# Then source it alongside your main .env, or merge the values in.
```

For staging/production, store each value in GCP Secret Manager:

```bash
# Example for one variable (repeat for each)
gcloud secrets create tiresias-stripe-partner-product-mssp \
  --replication-policy="automatic" \
  --data-file=<(echo -n "prod_xxxxx")

gcloud secrets create tiresias-stripe-partner-webhook-secret \
  --replication-policy="automatic" \
  --data-file=<(echo -n "whsec_xxxxx")
```

Secret naming convention: `tiresias-stripe-partner-{name}` (lowercase, hyphens).

## Step 3: Verify Products in Stripe Dashboard

Open the Stripe Dashboard and confirm:

1. **Products > Tiresias MSSP Partner**
   - Metadata: `tier=mssp`, `product_line=tiresias`, `partner_eligible=true`, `billing_model=partner_billed`
   - Two prices listed: $4,999/mo and $49,999/yr
   - Both prices have lookup keys (`tiresias_mssp_partner_monthly`, `tiresias_mssp_partner_annual`)

2. **Products > Tiresias MSSP Per-Tenant Add-on**
   - Metadata: `tier=mssp`, `product_line=tiresias`, `partner_eligible=true`, `billing_model=metered`, `usage_type=tenant_count`
   - Unit label: `tenant`
   - One metered price: $199/unit/mo
   - Lookup key: `tiresias_mssp_per_tenant`
   - Aggregate usage: `last_during_period`

Verify lookup keys via CLI:

```bash
stripe prices list --lookup-keys tiresias_mssp_partner_monthly
stripe prices list --lookup-keys tiresias_mssp_partner_annual
stripe prices list --lookup-keys tiresias_mssp_per_tenant
```

Each command should return exactly one price object.

## Step 4: Configure Stripe Connect Settings

Go to **Dashboard > Connect > Settings** and configure:

| Setting | Value |
|---------|-------|
| Account type | Express |
| Default business type | Company |
| Country support | US (Phase 1) |
| Business name | Tiresias by Saluca LLC |
| Brand color | `#1a1a2e` |
| Icon | Upload Tiresias logo |
| Return URL | `https://tiresias.network/partner/onboard/complete` |
| Refresh URL | `https://tiresias.network/partner/onboard/refresh` |
| Payout schedule | Manual (platform-controlled) |

These settings apply to all new Express accounts created through the platform.

## Step 5: Test Webhooks Locally

Use `stripe listen` to forward webhook events to your local development server:

```bash
# Terminal 1: Start your local server
# (however you normally run the Tiresias API locally)

# Terminal 2: Forward Stripe events to your local endpoint
stripe listen --forward-to localhost:8000/v1/stripe/partner-webhooks \
  --events account.updated,account.application.deauthorized,\
invoice.paid,invoice.payment_failed,invoice.finalized,\
customer.subscription.updated,customer.subscription.deleted,\
transfer.created,transfer.failed,payout.paid,payout.failed,\
charge.dispute.created,charge.dispute.closed
```

When `stripe listen` starts, it prints a webhook signing secret (`whsec_...`). Use this as `STRIPE_PARTNER_WEBHOOK_SECRET` in your local `.env`.

Trigger test events:

```bash
# In a third terminal
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.updated
stripe trigger charge.dispute.created
```

Verify your handler receives and processes each event. Check logs for the idempotency dedup table insert.

To test idempotency (duplicate delivery), resend a specific event:

```bash
stripe events resend evt_xxxxx
```

Your handler should return 200 without reprocessing.

## Step 6: End-to-End Test Flow

Run this full sequence in Test Mode before going live. Each step should pass before moving on.

1. **Create a Connect account**
   ```bash
   # Use the existing connect.py or call the API directly
   # Verify: account_id returned, account.updated webhook fires
   ```

2. **Complete Express onboarding** using the test onboarding flow (Stripe auto-fills test data)

3. **Create a subscription** with both MSSP Monthly and Per-Tenant metered prices
   ```bash
   stripe subscriptions create \
     --customer=cus_xxx \
     -d "items[0][price]=$STRIPE_PARTNER_PRICE_MSSP_MONTHLY" \
     -d "items[1][price]=$STRIPE_PARTNER_PRICE_PER_TENANT"
   ```

4. **Report tenant usage**
   ```bash
   stripe subscription_items list --subscription=sub_xxx
   # Get the metered subscription item ID, then:
   stripe usage_records create --subscription-item=si_xxx --quantity=5
   ```

5. **Advance the test clock** (or wait for next invoice) and verify the invoice includes $4,999 base + $995 (5 x $199)

6. **Test failed payment** using the decline card:
   ```bash
   # Attach test card 4000000000000341 to the customer
   # Verify invoice.payment_failed fires
   ```

## Step 7: Promote to Live Mode

Once all tests pass:

1. Authenticate the Stripe CLI for live mode:
   ```bash
   stripe login --live
   ```

2. Run the setup script in live mode:
   ```bash
   STRIPE_LIVE=1 bash scripts/stripe-partner-setup.sh
   ```

3. Update GCP Secret Manager with the live product/price IDs and webhook secret

4. Deploy the application with the live environment variables

5. Verify the live webhook endpoint is receiving events (Dashboard > Webhooks > partner endpoint > Recent deliveries)

**Important:** Live mode product/price IDs will differ from test mode IDs. The lookup keys (`tiresias_mssp_partner_monthly`, etc.) are the same across both modes and should be preferred over hardcoded IDs wherever possible.

## Troubleshooting

### "Stripe CLI not authenticated"

```bash
stripe login
# Follow the browser prompt to authenticate
# For live mode: stripe login --live
```

### Webhook endpoint returns 400 (signature mismatch)

The `STRIPE_PARTNER_WEBHOOK_SECRET` in your environment does not match the secret for the registered endpoint.

- For local dev: use the `whsec_...` secret printed by `stripe listen`
- For staging/production: retrieve the secret from Dashboard > Webhooks > your endpoint > Signing secret

### "Product already exists" warning

The setup script checks for existing products by name before creating. If you see this warning, the product was already created (possibly from a previous run). The script reuses the existing product ID and continues with price creation. Prices are always created fresh because lookup keys can be transferred.

### Metered usage not appearing on invoice

- Verify you are reporting usage on the correct subscription item (the one linked to the metered price, not the base price)
- Confirm aggregate usage is `last_during_period`. With this mode, the last reported quantity is used, not a sum. Report the total tenant count, not a delta.
- Usage must be reported before the invoice finalizes (before the billing period ends)

### Connect account stuck in "pending"

The partner has not completed the Express onboarding flow. Check:
- Was the onboarding link sent? Regenerate with `create_onboarding_link()` if expired.
- Does the partner have outstanding requirements? Check with `get_account_status()`.
- Send reminder emails at 24h, 72h, and 7d as specified in the onboarding flow.

### Transfer failed to Connect account

Common causes:
- Partner account is deactivated (`charges_enabled=false`)
- Partner has not completed onboarding (`payouts_enabled=false`)
- Partner's bank account was removed or invalidated

Check the account status and the `transfer.failed` webhook payload for the failure reason.

### Webhook events not arriving

- Verify the endpoint URL is correct and accessible from the internet (not localhost)
- Check Dashboard > Webhooks > your endpoint for delivery attempts and error codes
- Ensure the endpoint responds within 5 seconds (queue long processing and return 200 immediately)
- Check that the "Connect" toggle is enabled on the webhook endpoint (required for `account.updated` and other Connect events)
