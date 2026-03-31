/**
 * POST /api/auth/reset-password
 * Proxies to SoulAuth POST /v1/auth/local/reset-password
 */
import { NextRequest, NextResponse } from "next/server";

function getSoulAuthUrl(): string {
  return (
    process.env.SOULAUTH_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_SOULAUTH_API_URL ||
    "http://soulauth.tiresias.svc.cluster.local"
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${getSoulAuthUrl()}/v1/auth/local/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: body.token,
        new_password: body.new_password,
      }),
    });

    const data = await res.json().catch(() => ({ detail: "Reset failed" }));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail || "Reset failed" },
        { status: res.status }
      );
    }

    return NextResponse.json({ status: "password_reset" });
  } catch (err) {
    console.error("[reset-password] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
