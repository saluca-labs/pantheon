/**
 * PATCH  /api/users/[userId] — Update user role or admin flags
 * DELETE /api/users/[userId] — Deactivate a user
 *
 * Proxies to SoulAuth user management endpoints.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const { userId } = await context.params;

  try {
    const body = await request.json();
    const res = await fetch(
      `${config.soulauth.url}/v1/users/${userId}`,
      {
        method: "PATCH",
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
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const { userId } = await context.params;

  try {
    const res = await fetch(
      `${config.soulauth.url}/v1/users/${userId}`,
      {
        method: "DELETE",
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
      const errBody = await res.text();
      return NextResponse.json({ error: errBody }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to deactivate user" },
      { status: 502 },
    );
  }
}
