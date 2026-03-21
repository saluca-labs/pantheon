/**
 * Stripe Webhook handler.
 * POST /api/billing/webhook
 *
 * Handles Stripe events to keep SoulAuth tier/subscription state in sync.
 * Flat-rate pricing model — Tiresias is ONE platform.
 *
 * Canonical pricing: Z:\saluca-corp\PRICING_POLICY.md v2.0
 *
 * Events:
 *   - checkout.session.completed: provision tenant or upgrade tier
 *   - customer.subscription.updated: update tier on plan changes
 *   - customer.subscription.deleted: downgrade to open
 *   - invoice.payment_failed: log warning, flag tenant
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });
}

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// SoulAuth internal cluster URL (not public-facing)
const SOULAUTH_INTERNAL_URL =
  process.env.SOULAUTH_INTERNAL_URL || "http://soulauth.tiresias.svc.cluster.local";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

// Flat-rate price ID -> tier mapping (PRICING_POLICY.md v2.0)
const PRICE_TO_TIER: Record<string, string> = {
  // Starter (monthly + annual)
  [process.env.STRIPE_PRICE_STARTER_MONTHLY || ""]: "starter",
  [process.env.STRIPE_PRICE_STARTER_ANNUAL || ""]: "starter",
  // Pro (monthly + annual)
  [process.env.STRIPE_PRICE_PRO_MONTHLY || ""]: "pro",
  [process.env.STRIPE_PRICE_PRO_ANNUAL || ""]: "pro",
};

// Lookup key fallback (if price ID env vars not set)
const LOOKUP_KEY_TO_TIER: Record<string, string> = {
  tiresias_starter_monthly: "starter",
  tiresias_starter_annual: "starter",
  tiresias_pro_monthly: "pro",
  tiresias_pro_annual: "pro",
};

/**
 * Resolve tier from a Stripe subscription's price.
 */
function resolveTier(subscription: Stripe.Subscription): string {
  const item = subscription.items.data[0];
  if (!item) return "open";

  const priceId = item.price.id;
  const lookupKey = item.price.lookup_key;

  // Try direct price ID match
  if (priceId && PRICE_TO_TIER[priceId]) return PRICE_TO_TIER[priceId];

  // Try lookup key match
  if (lookupKey && LOOKUP_KEY_TO_TIER[lookupKey]) return LOOKUP_KEY_TO_TIER[lookupKey];

  // Fallback: check metadata
  const metaTier = subscription.metadata?.tiresias_tier;
  if (metaTier) return metaTier.toLowerCase();

  console.warn("Could not resolve tier for price " + priceId + ", defaulting to starter");
  return "starter";
}

/**
 * Forward billing event to SoulAuth's internal SaaS webhook.
 * SoulAuth handles tenant tier updates in its own transaction.
 */
async function forwardToSoulAuth(eventType: string, eventData: object) {
  try {
    const response = await fetch(SOULAUTH_INTERNAL_URL + "/v1/saas/billing/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        type: eventType,
        data: eventData,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("SoulAuth webhook forward failed: " + response.status + " " + text);
      return false;
    }

    const result = await response.json();
    console.log("SoulAuth webhook result: " + JSON.stringify(result));
    return true;
  } catch (error) {
    console.error("Failed to forward to SoulAuth:", error);
    return false;
  }
}

/**
 * Update tenant tier directly via SoulAuth admin API.
 */
async function updateTenantTier(
  tenantId: string,
  tier: string,
  metadata?: Record<string, string>
) {
  try {
    const response = await fetch(
      SOULAUTH_INTERNAL_URL + "/v1/soulauth/admin/tenants/" + tenantId,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-SoulKey": INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          tier,
          metadata: {
            stripe_synced: "true",
            stripe_synced_at: new Date().toISOString(),
            ...metadata,
          },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Failed to update tenant " + tenantId + " to tier " + tier + ": " + response.status + " " + text);
      return false;
    }

    console.log("Tenant " + tenantId + " updated to tier " + tier);
    return true;
  } catch (error) {
    console.error("Tenant tier update failed:", error);
    return false;
  }
}

/**
 * Provision a new tenant via SoulAuth SaaS provision API.
 * Used when a checkout completes for a user who registered through Stripe
 * (not through the trial flow).
 */
async function provisionTenant(
  companyName: string,
  tier: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  email?: string
) {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63) || "tenant";

  try {
    const response = await fetch(SOULAUTH_INTERNAL_URL + "/v1/saas/provision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SoulKey": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        company_name: companyName,
        slug: slug + "-" + Date.now().toString(36),
        tier,
        admin_persona_id: "admin",
        metadata: {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          provisioned_via: "stripe_checkout",
          contact_email: email || "",
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("SaaS provision failed: " + response.status + " " + text);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("SaaS provision error:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: "invalid_signature", detail: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const planId = session.metadata?.plan_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const email = session.customer_email || session.customer_details?.email || undefined;

        if (tenantId) {
          // Existing tenant upgrading — update their tier
          const tier = planId === "pro" ? "pro" : "starter";
          await updateTenantTier(tenantId, tier, {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_id: planId || "",
          });
          console.log("Checkout: existing tenant " + tenantId + " upgraded to " + tier);
        } else {
          // New customer from Stripe checkout (no trial flow) — provision tenant
          const tier = planId === "pro" ? "pro" : "starter";
          const companyName = session.customer_details?.name || (email ? email.split("@")[1] : "") || "Customer";
          const result = await provisionTenant(companyName, tier, customerId, subscriptionId, email);
          if (result) {
            console.log("Checkout: provisioned new tenant " + result.tenant_id + " (" + tier + ")");
            // Store tenant_id in subscription metadata for future webhook events
            if (subscriptionId) {
              try {
                await getStripe().subscriptions.update(subscriptionId, {
                  metadata: { tenant_id: result.tenant_id },
                });
              } catch (e) {
                console.error("Failed to update subscription metadata:", e);
              }
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;
        const tier = resolveTier(subscription);

        if (tenantId) {
          await updateTenantTier(tenantId, tier, {
            stripe_subscription_status: subscription.status,
          });
          console.log("Subscription updated: tenant " + tenantId + " -> " + tier + " (" + subscription.status + ")");
        } else {
          // Forward to SoulAuth which can do customer_id lookup
          await forwardToSoulAuth(event.type, event.data);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;

        if (tenantId) {
          await updateTenantTier(tenantId, "open", {
            stripe_subscription_status: "canceled",
            canceled_at: new Date().toISOString(),
          });
          console.log("Subscription canceled: tenant " + tenantId + " downgraded to open");
        } else {
          await forwardToSoulAuth(event.type, event.data);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.error(
          "Payment failed: customer=" + invoice.customer + " amount=" + invoice.amount_due + " attempt=" + invoice.attempt_count
        );
        // TODO: Send notification via Telegram to alert Cristian
        // TODO: Start grace period before downgrade
        break;
      }

      default:
        console.log("Unhandled Stripe event: " + event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook processing error:", message);
    return NextResponse.json(
      { error: "webhook_processing_failed", detail: message },
      { status: 500 }
    );
  }
}
