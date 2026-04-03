/**
 * POST /api/mssp/provision
 *
 * Provisions a new tenant via SoulAuth admin API.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

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
      `${config.soulauth.url}/v1/mssp/tenants`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": session.tenantId,
        },
        body: JSON.stringify({
          name: body.name,
          slug: body.slug,
          tier: body.tier || "enterprise",
          metadata: body.metadata || {},
          feature_overrides: {},
        }),
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
