/**
 * POST /api/billing/claim-key
 *
 * One-time retrieval of the raw SoulKey after Stripe checkout.
 * The key is stored in an ephemeral in-memory store by the webhook handler
 * and deleted immediately after this first (and only) retrieval.
 *
 * Request:  { session_id: string }
 * Response: { raw_key, tenant_id, soulkey_id } on success
 *           404 if already claimed or expired
 */

import { NextRequest, NextResponse } from "next/server";
import { claimPendingKey } from "../_keystore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = body?.session_id;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "missing_session_id", detail: "session_id is required" },
        { status: 400 }
      );
    }

    const entry = claimPendingKey(sessionId);

    if (!entry) {
      return NextResponse.json(
        {
          error: "key_not_found",
          detail:
            "Key not found. It may have already been claimed or expired. " +
            "Contact support if you need your key resent.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      raw_key: entry.raw_key,
      tenant_id: entry.tenant_id,
      soulkey_id: entry.soulkey_id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("claim-key error:", message);
    return NextResponse.json(
      { error: "claim_failed", detail: message },
      { status: 500 }
    );
  }
}
