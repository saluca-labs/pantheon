/**
 * Stripe Webhook handler.
 * POST /api/billing/webhook
 *
 * Handles Stripe events to keep SoulAuth tier/subscription state in sync.
 * Events:
 *   - checkout.session.completed: activate subscription, update tier
 *   - customer.subscription.updated: update tier on plan changes
 *   - customer.subscription.deleted: downgrade to community
 *   - invoice.payment_failed: log warning, send notification
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });
}

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SOULAUTH_API_URL =
  process.env.SOULAUTH_API_URL || "http://localhost:8000";
const SOULAUTH_ADMIN_KEY = process.env.SOULAUTH_ADMIN_KEY || "";

// Map Stripe price IDs back to Tiresias tiers
const PRICE_TO_TIER: Record<string, string> = {
  [process.env.STRIPE_PRICE_SOULAUTH_PRO || "price_soulauth_pro"]: "pro",
  [process.env.STRIPE_PRICE_SOULWATCH_STARTER || "price_soulwatch_starter"]: "starter",
  [process.env.STRIPE_PRICE_SOULWATCH_PRO || "price_soulwatch_pro"]: "pro",
  [process.env.STRIPE_PRICE_SOULGATE_STARTER || "price_soulgate_starter"]: "starter",
  [process.env.STRIPE_PRICE_SOULGATE_PRO || "price_soulgate_pro"]: "pro",
  [process.env.STRIPE_PRICE_BUNDLE_STARTER || "price_bundle_starter"]: "pro",
  [process.env.STRIPE_PRICE_BUNDLE_PRO || "price_bundle_pro"]: "pro",
};

/**
 * Update the tenant tier in SoulAuth via admin API.
 */
async function updateTenantTier(
  tenantId: string,
  tier: string,
  metadata?: Record<string, string>
) {
  const response = await fetch(
    `${SOULAUTH_API_URL}/v1/soulauth/admin/tenants/${tenantId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-SoulKey": SOULAUTH_ADMIN_KEY,
      },
      body: JSON.stringify({
        tier,
        metadata: {
          stripe_synced: true,
          ...metadata,
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error(
      `Failed to update tenant ${tenantId} tier to ${tier}: ${response.status} ${text}`
    );
  }

  return response.ok;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "missing_signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json(
      { error: "invalid_signature", detail: message },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const planId = session.metadata?.plan_id;

        if (tenantId && planId) {
          const tier = PRICE_TO_TIER[planId] || "pro";
          await updateTenantTier(tenantId, tier, {
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            plan_id: planId,
            agent_count: session.metadata?.agent_count || "1",
          });
          console.log(
            `Checkout completed: tenant=${tenantId} plan=${planId} tier=${tier}`
          );
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = priceId ? PRICE_TO_TIER[priceId] || "pro" : "pro";

        // Find tenant by Stripe customer ID
        // The tenant_id is stored in subscription metadata during checkout
        const tenantId = subscription.metadata?.tenant_id;
        if (tenantId) {
          await updateTenantTier(tenantId, tier, {
            stripe_subscription_status: subscription.status,
          });
          console.log(
            `Subscription updated: tenant=${tenantId} tier=${tier} status=${subscription.status}`
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;
        if (tenantId) {
          await updateTenantTier(tenantId, "community", {
            stripe_subscription_status: "canceled",
            canceled_at: new Date().toISOString(),
          });
          console.log(
            `Subscription canceled: tenant=${tenantId} downgraded to community`
          );
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.error(
          `Payment failed: customer=${invoice.customer} amount=${invoice.amount_due} attempt=${invoice.attempt_count}`
        );
        // In production, send email notification to tenant admin
        // and potentially start a grace period before downgrading.
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook processing error:", message);
    return NextResponse.json(
      { error: "webhook_processing_failed", detail: message },
      { status: 500 }
    );
  }
}
