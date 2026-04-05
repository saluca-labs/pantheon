/**
 * Stripe Checkout Session creation endpoint.
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for the selected plan.
 * Supports both new-user flow (email only) and existing-tenant upgrade flow.
 * Flat-rate pricing — no per-agent billing.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });
}

const PLANS: Record<
  string,
  {
    name: string;
    stripe_price_id: string;
    stripe_price_id_annual: string;
    price_cents: number;
    type: string;
  }
> = {
  open: {
    name: "Tiresias Open",
    stripe_price_id: "",
    stripe_price_id_annual: "",
    price_cents: 0,
    type: "free",
  },
  community: {
    // Legacy alias — maps to "open"
    name: "Tiresias Open",
    stripe_price_id: "",
    stripe_price_id_annual: "",
    price_cents: 0,
    type: "free",
  },
  starter: {
    name: "Tiresias Starter",
    stripe_price_id:
      process.env.STRIPE_PRICE_STARTER_MONTHLY || "price_1TDMSlBkXMYmrc2L29W09pQl",
    stripe_price_id_annual:
      process.env.STRIPE_PRICE_STARTER_ANNUAL || "price_1TDMSlBkXMYmrc2LuuaUN5Cp",
    price_cents: 4900,
    type: "recurring",
  },
  pro: {
    name: "Tiresias Pro",
    stripe_price_id:
      process.env.STRIPE_PRICE_PRO_MONTHLY || "price_1TDMT2BkXMYmrc2Lhf1whQpi",
    stripe_price_id_annual:
      process.env.STRIPE_PRICE_PRO_ANNUAL || "price_1TDMT2BkXMYmrc2LnBUoJEww",
    price_cents: 19900,
    type: "recurring",
  },
  enterprise: {
    // Custom invoicing ($999-4,999/mo) — not self-serve
    name: "Tiresias Enterprise",
    stripe_price_id: "",
    stripe_price_id_annual: "",
    price_cents: 0,
    type: "sales",
  },
};

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://tiresias.network";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      plan_id,
      tenant_id,   // optional — omit for new-user checkout flow
      billing_period,
      email,       // used as customer_email in Stripe and stored in session metadata
    }: {
      plan_id: string;
      tenant_id?: string;
      billing_period?: "monthly" | "annual";
      email?: string;
    } = body;

    const plan = PLANS[plan_id];
    if (!plan) {
      return NextResponse.json(
        {
          error: "invalid_plan",
          detail: `Unknown plan: ${plan_id}. Valid plans: ${Object.keys(PLANS).join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Free/open plans skip Stripe — redirect straight to trial page
    if (plan.type === "free") {
      return NextResponse.json(
        {
          error: "free_plan",
          detail: "Open plan is free. No checkout required.",
          redirect_url: "/trial",
        },
        { status: 400 }
      );
    }

    // Enterprise uses custom invoicing — redirect to sales
    if (plan.type === "sales") {
      return NextResponse.json(
        {
          error: "enterprise_contact_sales",
          detail:
            "Enterprise plans ($999-4,999/mo) require custom invoicing. Contact sales.",
          redirect_url: "mailto:contact@tiresias.network?subject=Tiresias%20Enterprise%20Inquiry",
        },
        { status: 400 }
      );
    }

    const priceId =
      billing_period === "annual"
        ? plan.stripe_price_id_annual
        : plan.stripe_price_id;

    if (!priceId) {
      return NextResponse.json(
        { error: "price_not_configured", detail: `Price ID for ${plan_id} not configured` },
        { status: 500 }
      );
    }

    // Build session metadata — tenant_id may be absent for new users
    const metadata: Record<string, string> = { plan_id };
    if (tenant_id) metadata.tenant_id = tenant_id;
    if (email) metadata.contact_email = email;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      success_url: `${APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      subscription_data: {
        trial_period_days: 14,
        metadata: { plan_id, ...(tenant_id ? { tenant_id } : {}) },
      },
    };

    // Pre-fill email if provided (reduces friction for new users)
    if (email) {
      sessionParams.customer_email = email;
    }

    const session = await getStripe().checkout.sessions.create(sessionParams);

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Stripe checkout error:", message);
    return NextResponse.json(
      { error: "checkout_failed", detail: message },
      { status: 500 }
    );
  }
}
