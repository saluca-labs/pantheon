/**
 * Stripe Webhook handler.
 * POST /api/billing/webhook
 *
 * Events handled (BILL-03, TRIAL-02):
 *   checkout.session.completed       -> provision new tenant OR upgrade existing
 *   customer.subscription.created    -> set tier from plan
 *   customer.subscription.updated    -> update tier on plan changes
 *   customer.subscription.deleted    -> downgrade to community
 *   invoice.paid                     -> log receipt, forward to SoulAuth
 *   invoice.payment_failed           -> log warning, flag tenant for grace period
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { storePendingKey } from "../_keystore";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });
}

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SOULAUTH_INTERNAL_URL =
  process.env.SOULAUTH_INTERNAL_URL || "http://localhost:8000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

const PRICE_TO_TIER: Record<string, string> = {
  [process.env.STRIPE_PRICE_STARTER_MONTHLY || ""]: "starter",
  [process.env.STRIPE_PRICE_STARTER_ANNUAL || ""]: "starter",
  [process.env.STRIPE_PRICE_PRO_MONTHLY || ""]: "pro",
  [process.env.STRIPE_PRICE_PRO_ANNUAL || ""]: "pro",
  [process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || ""]: "enterprise",
  [process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL || ""]: "enterprise",
};

const LOOKUP_KEY_TO_TIER: Record<string, string> = {
  tiresias_starter_monthly: "starter",
  tiresias_starter_annual: "starter",
  tiresias_pro_monthly: "pro",
  tiresias_pro_annual: "pro",
  tiresias_enterprise_monthly: "enterprise",
  tiresias_enterprise_annual: "enterprise",
};

function resolveTier(subscription: Stripe.Subscription): string {
  const item = subscription.items.data[0];
  if (!item) return "community";
  const priceId = item.price.id;
  const lookupKey = item.price.lookup_key;
  if (priceId && PRICE_TO_TIER[priceId]) return PRICE_TO_TIER[priceId];
  if (lookupKey && LOOKUP_KEY_TO_TIER[lookupKey]) return LOOKUP_KEY_TO_TIER[lookupKey];
  const metaTier = subscription.metadata?.tiresias_tier;
  if (metaTier) return metaTier.toLowerCase();
  console.warn("Could not resolve tier for price " + priceId + ", defaulting to starter");
  return "starter";
}

async function forwardToSoulAuth(eventType: string, eventData: object) {
  try {
    const response = await fetch(SOULAUTH_INTERNAL_URL + "/v1/saas/billing/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({ type: eventType, data: eventData }),
    });
    if (!response.ok) {
      console.error("SoulAuth webhook forward failed: " + response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to forward to SoulAuth:", error);
    return false;
  }
}

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
      console.error("Failed to update tenant " + tenantId + " to tier " + tier);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Tenant tier update failed:", error);
    return false;
  }
}

/**
 * Provision a new tenant via SoulAuth and return the raw_key + tenant_id.
 * raw_key is stored in an ephemeral in-memory keystore (not Stripe metadata)
 * and retrieved once by the /api/billing/claim-key endpoint on the success page.
 */
async function provisionTenant(
  companyName: string,
  tier: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  email?: string
): Promise<{ tenant_id: string; soulkey_id: string; raw_key: string } | null> {
  const slug =
    (companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "tenant") +
    "-" +
    Date.now().toString(36);

  try {
    const response = await fetch(SOULAUTH_INTERNAL_URL + "/v1/saas/provision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SoulKey": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        company_name: companyName,
        slug,
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

    const result = await response.json();
    return {
      tenant_id: result.tenant_id,
      soulkey_id: result.soulkey_id,
      raw_key: result.raw_key,
    };
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
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const email =
          session.metadata?.contact_email ||
          session.customer_email ||
          session.customer_details?.email ||
          undefined;

        if (tenantId) {
          // Existing tenant upgrading
          const tier =
            planId === "enterprise"
              ? "enterprise"
              : planId === "pro"
              ? "pro"
              : "starter";
          await updateTenantTier(tenantId, tier, {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_id: planId || "",
          });
          console.log("Checkout: existing tenant " + tenantId + " upgraded to " + tier);
        } else {
          // New customer — provision atomically
          const tier =
            planId === "enterprise"
              ? "enterprise"
              : planId === "pro"
              ? "pro"
              : "starter";
          const companyName =
            session.customer_details?.name ||
            (email ? email.split("@")[1] : "") ||
            "Customer";
          const result = await provisionTenant(
            companyName,
            tier,
            customerId,
            subscriptionId,
            email
          );
          if (result) {
            // Store raw_key in ephemeral in-memory keystore for one-time retrieval
            // via /api/billing/claim-key (never stored in Stripe metadata)
            storePendingKey(session.id, {
              raw_key: result.raw_key,
              tenant_id: result.tenant_id,
              soulkey_id: result.soulkey_id,
            });

            // Store non-sensitive IDs in subscription metadata for lifecycle management
            if (subscriptionId) {
              try {
                await getStripe().subscriptions.update(subscriptionId, {
                  metadata: {
                    tenant_id: result.tenant_id,
                    soulkey_id: result.soulkey_id,
                  },
                });
              } catch (e) {
                console.error("Failed to update subscription metadata:", e);
              }
            }
            console.log(
              "Checkout: provisioned new tenant " +
                result.tenant_id +
                " (" +
                tier +
                ")"
            );
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;
        const tier = resolveTier(subscription);

        if (tenantId) {
          await updateTenantTier(tenantId, tier, {
            stripe_subscription_status: subscription.status,
          });
          console.log(
            "Subscription " +
              event.type +
              ": tenant " +
              tenantId +
              " -> " +
              tier
          );
        } else {
          await forwardToSoulAuth(event.type, event.data);
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
          console.log("Subscription canceled: tenant " + tenantId + " -> community");
        } else {
          await forwardToSoulAuth(event.type, event.data);
        }
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // Stripe 2026-02-25 API: subscription lives under invoice.parent.subscription_details.subscription
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId =
          typeof subRef === "string" ? subRef : (subRef as Stripe.Subscription)?.id;
        console.log(
          "Invoice paid: customer=" +
            invoice.customer +
            " amount=" +
            invoice.amount_paid +
            " subscription=" +
            subscriptionId
        );
        // Forward to SoulAuth for audit log + partner commission processing
        await forwardToSoulAuth("invoice.paid", event.data);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.error(
          "Payment failed: customer=" +
            invoice.customer +
            " amount=" +
            invoice.amount_due +
            " attempt=" +
            invoice.attempt_count
        );
        await forwardToSoulAuth(event.type, event.data);
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
