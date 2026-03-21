/**
 * GET /api/billing/session?session_id=XXX
 *
 * Retrieves Checkout Session data (plan, tenant_id, soulkey) for the
 * /checkout/success page. Clears raw_key from Stripe metadata after
 * first retrieval so it is only shown once (TRIAL-03).
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

    // Get soulkey from subscription metadata (stored by webhook on checkout.session.completed)
    let rawKey: string | null = null;
    let soulkeyId: string | null = null;
    let subscriptionId: string | null = null;

    if (session.subscription && typeof session.subscription !== "string") {
      const sub = session.subscription as Stripe.Subscription;
      subscriptionId = sub.id;
      rawKey = sub.metadata?.raw_key || null;
      soulkeyId = sub.metadata?.soulkey_id || null;

      // Clear raw_key from Stripe metadata after retrieval (shown once only)
      if (rawKey && subscriptionId) {
        try {
          await getStripe().subscriptions.update(subscriptionId, {
            metadata: {
              ...sub.metadata,
              raw_key: "",   // empty string clears it in Stripe
            },
          });
        } catch (e) {
          console.error("Failed to clear raw_key from subscription metadata:", e);
        }
      }
    }

    return NextResponse.json({
      plan_id: planId,
      tenant_id: tenantId || null,
      soulkey_id: soulkeyId,
      raw_key: rawKey,
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
