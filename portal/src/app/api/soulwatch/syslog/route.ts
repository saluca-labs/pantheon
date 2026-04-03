/**
 * /api/soulwatch/syslog — Proxy syslog configuration CRUD to SoulWatch.
 *
 * GET  — current syslog config and status
 * PUT  — create or update syslog config
 * POST — send a test syslog message
 * DELETE — remove syslog config
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const UPSTREAM = `${config.soulwatch.url}/watch/v1/integrations/syslog`;

async function upstream(
  method: string,
  body?: unknown,
): Promise<NextResponse> {
  try {
    const opts: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": config.soulwatch.key,
      },
      signal: AbortSignal.timeout(10_000),
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(UPSTREAM + (method === "POST" ? "/test" : ""), opts);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "SoulWatch unreachable", detail: String(err) },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;
  return upstream("GET");
}

export async function PUT(req: NextRequest) {
  const session = await verifySession(req);
  if (isAuthError(session)) return session;
  const body = await req.json();
  return upstream("PUT", body);
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;
  return upstream("POST");
}

export async function DELETE(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;
  return upstream("DELETE");
}
