/**
 * Stripe Checkout Session creation endpoint.
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for the selected plan.
 * Flat-rate pricing — no per-agent billing.
 *
 * Canonical pricing source: Z:\saluca-corp\PRICING_POLICY.md v2.0
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });
}

// Flat-rate pricing plans — one platform, not three products.
// Stripe price IDs are set via env vars. Fallbacks are descriptive placeholders.
const PLANS: Record<
  string,
  { name: string; stripe_price_id: string; stripe_price_id_annual: string; price_cents: number; type: string }
> = {
  open: {
    name: "Tiresias Open",
    stripe_price_id: "",
    stripe_price_id_annual: "",
    price_cents: 0,
    type: "free",
  },
  starter: {
    name: "Tiresias Starter",
    stripe_price_id: process.env.STRIPE_PRICE_STARTER_MONTHLY || "price_tiresias_starter_monthly",
    stripe_price_id_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL || "price_tiresias_starter_annual",
    price_cents: 4900, // $49/mo flat
    type: "recurring",
  },
  pro: {
    name: "Tiresias Pro",
    stripe_price_id: process.env.STRIPE_PRICE_PRO_MONTHLY || "price_tiresias_pro_monthly",
    stripe_price_id_annual: process.env.STRIPE_PRICE_PRO_ANNUAL || "price_tiresias_pro_annual",
    price_cents: 19900, // $199/mo flat
    type: "recurring",
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { plan_id, tenant_id, soulkey, billing_period, email } = body;

    // Validate plan
    const plan = PLANS[plan_id];
    if (!plan) {
      return NextResponse.json(
        { error: "invalid_plan", detail: `Unknown plan: ${plan_id}. Valid plans: open, starter, pro` },
        { status: 400 }
      );
    }

    // Free plans don't need Stripe checkout
    if (plan.type === "free") {
      return NextResponse.json(
        {
          error: "free_plan",
          detail: "Open plan is free. No checkout required.",
          redirect_url: "/billing/success?plan=open",
        },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!tenant_id || !soulkey) {
      return NextResponse.json(
        { error: "missing_fields", detail: "tenant_id and soulkey are required" },
        { status: 400 }
      );
    }

    // Flat-rate — quantity is always 1, no per-agent multiplier
    const priceId =
      billing_period === "annual"
        ? plan.stripe_price_id_annual
        : plan.stripe_price_id;

    // Create Stripe Checkout Session
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1, // Flat-rate: always 1
        },
      ],
      metadata: {
        tenant_id,
        plan_id,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://tiresias.network"}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://tiresias.network"}/pricing`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      customer_email: email || undefined,
    });

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Stripe checkout error:", message);
    return NextResponse.json(
      { error: "checkout_failed", detail: message },
      { status: 500 }
    );
  }
}
