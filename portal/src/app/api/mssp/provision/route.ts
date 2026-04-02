/**
 * POST /api/mssp/provision
 *
 * Provisions a new tenant via SoulAuth admin API.
 */
import { NextRequest, NextResponse } from "next/server";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL ||
  process.env.SOULAUTH_INTERNAL_URL ||
  "http://soulauth:8000";

async function verifySession(
  request: NextRequest,
): Promise<NextResponse | null> {
  const sessionToken =
    request.cookies.get("tiresias_session")?.value ||
    request.cookies.get("tiresias_oidc_session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  try {
    const res = await fetch(`${SOULAUTH_URL}/v1/auth/local/session/verify`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (!data.valid) {
      return NextResponse.json(
        { error: data.reason || "Invalid session" },
        { status: 401 },
      );
    }

    return null;
  } catch {
    return NextResponse.json(
      { error: "Session verification failed" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await verifySession(request);
  if (denied) return denied;

  try {
    const body = await request.json();

    // SoulAuth requires a `slug` field (lowercase alphanumeric + hyphens, 3-63 chars).
    // Auto-generate from tenant name if not provided.
    if (!body.slug && body.name) {
      body.slug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")   // non-alphanumeric -> hyphen
        .replace(/^-+|-+$/g, "")        // trim leading/trailing hyphens
        .slice(0, 63);
      // Slug must be at least 3 chars per SoulAuth regex ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$
      if (body.slug.length < 3) {
        body.slug = body.slug.padEnd(3, "0");
      }
    }

    // Map portal field names to SoulAuth schema
    // Portal sends `email`/`contact_email`, SoulAuth expects `metadata.contact_email`
    if (body.email || body.contact_email) {
      body.metadata = {
        ...(body.metadata || {}),
        contact_email: body.email || body.contact_email,
      };
      delete body.email;
      delete body.contact_email;
    }

    const res = await fetch(
      `${SOULAUTH_URL}/v1/soulauth/admin/tenants`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json({ error: errorBody }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to provision tenant" },
      { status: 502 },
    );
  }
}
