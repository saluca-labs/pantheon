/**
 * BFF proxy for deploy key management.
 *
 * GET  /api/tiresias/policies/deploy-keys  -- list keys  (SESSIONS_VIEW)
 * POST /api/tiresias/policies/deploy-keys  -- create key (POLICIES_EDIT)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const BACKEND_PATH = "/v1/portal/policies/deploy-keys";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const url = `${config.proxy.url}${BACKEND_PATH}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-SoulKey": session.token,
      "X-Tenant-ID": session.tenantId,
      "X-Required-Permission": "SESSIONS_VIEW",
    };
    if (config.proxy.apiKey) {
      headers["X-Tiresias-Api-Key"] = config.proxy.apiKey;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: body }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch deploy keys" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const url = `${config.proxy.url}${BACKEND_PATH}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-SoulKey": session.token,
      "X-Tenant-ID": session.tenantId,
      "X-Required-Permission": "POLICIES_EDIT",
    };
    if (config.proxy.apiKey) {
      headers["X-Tiresias-Api-Key"] = config.proxy.apiKey;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json({ error: errorBody }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to create deploy key" },
      { status: 502 },
    );
  }
}
