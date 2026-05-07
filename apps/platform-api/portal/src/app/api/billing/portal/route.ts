/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Billing Portal session so the customer can manage
 * their subscription, payment methods, and invoices.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });
}

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL || "http://soulauth:8000";

export async function POST(request: NextRequest) {
  // Verify session
  const sessionToken =
    request.cookies.get("tiresias_session")?.value ||
    request.cookies.get("tiresias_oidc_session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  try {
    const verifyRes = await fetch(
      `${SOULAUTH_URL}/v1/auth/local/session/verify`,
      {
        headers: { Authorization: `Bearer ${sessionToken}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    const verifyData = await verifyRes.json();
    if (!verifyData.valid) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
  } catch {
    return NextResponse.json(
      { error: "Session verification failed" },
      { status: 502 },
    );
  }

  // Get tenant's stripe_customer_id from request body
  const body = await request.json().catch(() => ({}));
  const stripeCustomerId = body.stripe_customer_id;

  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer ID. Complete checkout first." },
      { status: 422 },
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: body.return_url || `${request.nextUrl.origin}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Portal session creation failed";
    console.error("Stripe billing portal error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
