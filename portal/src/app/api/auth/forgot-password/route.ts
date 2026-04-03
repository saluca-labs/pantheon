/**
 * POST /api/auth/forgot-password
 * Proxies to SoulAuth POST /v1/auth/local/forgot-password
 */
import { NextRequest, NextResponse } from "next/server";

function getSoulAuthUrl(): string {
  return (
    process.env.SOULAUTH_INTERNAL_URL ||
    "http://soulauth.tiresias.svc.cluster.local"
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${getSoulAuthUrl()}/v1/auth/local/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: request.headers.get("origin") || "",
        Referer: request.headers.get("referer") || "",
      },
      body: JSON.stringify({ email: body.email }),
    });

    const data = await res.json().catch(() => ({}));

    // Always return 200 to prevent account enumeration
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[forgot-password] error:", err);
    return NextResponse.json({ status: "ok" });
  }
}
