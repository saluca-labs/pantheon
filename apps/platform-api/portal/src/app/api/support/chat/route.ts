/**
 * Support chat API route — proxies SSE stream to SoulAuth backend chatbot.
 *
 * POST /api/support/chat → POST {soulauth}/v1/support/chat
 *
 * Passes through the SSE stream response from the backend.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const BACKEND_URL = config.soulauth.url;

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();

    const backendRes = await fetch(`${BACKEND_URL}/v1/support/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
        "X-Tenant-ID": session.tenantId,
      },
      body: JSON.stringify(body),
    });

    if (!backendRes.ok) {
      const errBody = await backendRes.text().catch(() => "");
      return NextResponse.json(
        { detail: `Backend error: ${backendRes.status}`, raw: errBody },
        { status: backendRes.status },
      );
    }

    // Stream the SSE response through
    if (!backendRes.body) {
      return NextResponse.json(
        { detail: "No response stream from backend" },
        { status: 502 },
      );
    }

    return new Response(backendRes.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "Failed to connect to chat backend" },
      { status: 502 },
    );
  }
}
