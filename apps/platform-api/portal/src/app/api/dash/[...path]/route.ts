/**
 * Server-side proxy for /dash/* Tiresias dashboard endpoints.
 * Injects X-Tiresias-Api-Key server-side so the secret never reaches the browser.
 * Verifies the user's portal session via SoulAuth before proxying.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const result = await verifySession(request);
  if (isAuthError(result)) return result;

  // result is the verified session — use token as X-SoulKey
  const sessionToken = result.token;

  const { path } = await params;
  const subpath = path.join("/");
  const search = request.nextUrl.searchParams.toString();
  const url = `${config.proxy.url}/dash/${subpath}${search ? `?${search}` : ""}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.proxy.apiKey) {
      headers["X-Tiresias-Api-Key"] = config.proxy.apiKey;
    }

    // Forward the verified session token as X-SoulKey for proxy auth
    headers["X-SoulKey"] = sessionToken;

    // Forward tenant header from the browser
    const tenantId = request.headers.get("x-tenant-id");
    if (tenantId) headers["X-Tenant-ID"] = tenantId;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: body },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 502 },
    );
  }
}
