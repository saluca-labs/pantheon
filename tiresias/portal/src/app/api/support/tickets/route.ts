/**
 * Support ticket API route — proxies to SoulAuth backend.
 *
 * GET  /api/support/tickets → GET  {soulauth}/v1/support/tickets
 * POST /api/support/tickets → POST {soulauth}/v1/support/tickets
 *
 * The backend handles Linear integration, Telegram alerts, and SLA tracking.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const BACKEND_URL = config.soulauth.url;

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const res = await fetch(`${BACKEND_URL}/v1/support/tickets`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
        "X-Tenant-ID": session.tenantId,
      },
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();

    // Backend returns { tickets: [...], total: N } — normalize for the frontend
    // which expects an array directly
    const tickets = data.tickets ?? data;
    return NextResponse.json(tickets, { status: res.status });
  } catch {
    return NextResponse.json(
      { detail: "Failed to fetch tickets from backend" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();

    // Backend expects lowercase severity (p0, p1, p2, p3)
    const payload = {
      ...body,
      severity: body.severity?.toLowerCase(),
    };

    const res = await fetch(`${BACKEND_URL}/v1/support/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
        "X-Tenant-ID": session.tenantId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    // Normalize response for frontend: it expects { ticket_id, sla_deadline }
    return NextResponse.json(
      {
        ticket_id: data.ticket_id,
        sla_deadline: data.sla_deadline,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { detail: "Failed to create ticket in backend" },
      { status: 502 },
    );
  }
}
