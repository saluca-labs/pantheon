/**
 * Stripe Checkout Session creation endpoint.
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for the selected plan, then returns
 * the session URL for client-side redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });
}

const SOULAUTH_API_URL =
  process.env.SOULAUTH_API_URL || "http://localhost:8000";

// Pricing plans mapped to Stripe price IDs.
// In production, set these via env vars. IDs below are placeholders
// until Stripe products are created in the dashboard.
const PLANS: Record<
  string,
  { name: string; stripe_price_id: string; price_cents: number; type: string }
> = {
  // Individual products
  soulauth_community: {
    name: "SoulAuth Community",
    stripe_price_id: process.env.STRIPE_PRICE_SOULAUTH_COMMUNITY || "price_soulauth_community",
    price_cents: 0,
    type: "free",
  },
  soulauth_pro: {
    name: "SoulAuth Pro",
    stripe_price_id: process.env.STRIPE_PRICE_SOULAUTH_PRO || "price_soulauth_pro",
    price_cents: 1500, // $15/agent/mo
    type: "recurring",
  },
  soulwatch_starter: {
    name: "SoulWatch Starter",
    stripe_price_id: process.env.STRIPE_PRICE_SOULWATCH_STARTER || "price_soulwatch_starter",
    price_cents: 1000, // $10/agent/mo
    type: "recurring",
  },
  soulwatch_pro: {
    name: "SoulWatch Pro",
    stripe_price_id: process.env.STRIPE_PRICE_SOULWATCH_PRO || "price_soulwatch_pro",
    price_cents: 2000, // $20/agent/mo
    type: "recurring",
  },
  soulgate_starter: {
    name: "SoulGate Starter",
    stripe_price_id: process.env.STRIPE_PRICE_SOULGATE_STARTER || "price_soulgate_starter",
    price_cents: 1000, // $10/agent/mo
    type: "recurring",
  },
  soulgate_pro: {
    name: "SoulGate Pro",
    stripe_price_id: process.env.STRIPE_PRICE_SOULGATE_PRO || "price_soulgate_pro",
    price_cents: 2000, // $20/agent/mo
    type: "recurring",
  },
  // Platform bundles
  bundle_starter: {
    name: "Platform Starter Bundle",
    stripe_price_id: process.env.STRIPE_PRICE_BUNDLE_STARTER || "price_bundle_starter",
    price_cents: 2900, // $29/agent/mo
    type: "recurring",
  },
  bundle_pro: {
    name: "Platform Pro Bundle",
    stripe_price_id: process.env.STRIPE_PRICE_BUNDLE_PRO || "price_bundle_pro",
    price_cents: 4500, // $45/agent/mo
    type: "recurring",
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { plan_id, quantity, tenant_id, soulkey, billing_period } = body;

    // Validate plan
    const plan = PLANS[plan_id];
    if (!plan) {
      return NextResponse.json(
        { error: "invalid_plan", detail: `Unknown plan: ${plan_id}` },
        { status: 400 }
      );
    }

    // Free plans don't need Stripe checkout
    if (plan.type === "free") {
      return NextResponse.json(
        {
          error: "free_plan",
          detail: "Community plan is free. No checkout required.",
          redirect_url: "/billing/success?plan=community",
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

    const agentCount = Math.max(1, Math.min(quantity || 1, 10000));

    // Determine price ID based on billing period
    const priceId =
      billing_period === "annual"
        ? `${plan.stripe_price_id}_annual`
        : plan.stripe_price_id;

    // Create Stripe Checkout Session
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: agentCount,
        },
      ],
      metadata: {
        tenant_id,
        plan_id,
        agent_count: String(agentCount),
        soulauth_api_url: SOULAUTH_API_URL,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://tiresias.saluca.com"}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://tiresias.saluca.com"}/pricing`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      customer_email: body.email || undefined,
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
