/**
 * GET /api/billing/session?session_id=XXX
 *
 * Retrieves Checkout Session data (plan, tenant_id) for the
 * /checkout/success page. Does NOT return raw_key — use
 * POST /api/billing/claim-key for one-time key retrieval. (TRIAL-03)
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const planId = session.metadata?.plan_id || "starter";
    const tenantId = session.metadata?.tenant_id;

    let soulkeyId: string | null = null;

    if (session.subscription && typeof session.subscription !== "string") {
      const sub = session.subscription as Stripe.Subscription;
      soulkeyId = sub.metadata?.soulkey_id || null;
    }

    return NextResponse.json({
      plan_id: planId,
      tenant_id: tenantId || null,
      soulkey_id: soulkeyId,
      customer_email: session.customer_email || session.customer_details?.email || null,
      payment_status: session.payment_status,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Session retrieval error:", message);
    return NextResponse.json(
      { error: "session_not_found", detail: message },
      { status: 404 }
    );
  }
}
