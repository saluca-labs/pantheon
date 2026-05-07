/**
 * GET /v1/mssp/enforcement/quarantine
 * Returns quarantines across all child tenants from SoulWatch.
 */
import { NextRequest, NextResponse } from "next/server";

const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOULWATCH_API_URL ||
  "http://localhost:8001";
const SOULWATCH_KEY =
  process.env.SOULWATCH_INTERNAL_KEY || "";

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit") || "100";
  try {
    const res = await fetch(
      `${SOULWATCH_URL}/watch/v1/quarantines?page_size=${limit}`,
      {
        headers: { "X-Internal-Key": SOULWATCH_KEY },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return NextResponse.json({ quarantines: [] });
    const body = await res.json();
    // Normalize: SoulWatch returns { quarantines: [...] }
    const quarantines = body.quarantines ?? (Array.isArray(body) ? body : []);
    return NextResponse.json({ quarantines });
  } catch {
    return NextResponse.json({ quarantines: [] });
  }
}
