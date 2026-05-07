/**
 * GET  /api/users — List users for the current tenant
 * POST /api/users — Create a new user
 *
 * Proxies to SoulAuth user management endpoints.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const res = await fetch(
      `${config.soulauth.url}/v1/users`,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.token}`,
          "X-Internal-Key": config.internalApiKey,
          "X-Tenant-ID": session.tenantId,
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: body }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch users from SoulAuth" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const res = await fetch(
      `${config.soulauth.url}/v1/users`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.token}`,
          "X-Internal-Key": config.internalApiKey,
          "X-Tenant-ID": session.tenantId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json({ error: errBody }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 502 },
    );
  }
}
