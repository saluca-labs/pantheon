/**
 * /api/soulwatch/syslog — Proxy syslog configuration CRUD to SoulWatch.
 *
 * GET  — current syslog config and status
 * PUT  — create or update syslog config
 * POST — send a test syslog message
 * DELETE — remove syslog config
 */
import { NextRequest, NextResponse } from "next/server";

const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL || "http://localhost:8001";

const SOULWATCH_KEY =
  process.env.SOULWATCH_INTERNAL_KEY || "sw_metrics_scrape_2026";

const UPSTREAM = `${SOULWATCH_URL}/watch/v1/integrations/syslog`;

async function upstream(
  method: string,
  body?: unknown,
): Promise<NextResponse> {
  try {
    const opts: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": SOULWATCH_KEY,
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

export async function GET() {
  return upstream("GET");
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  return upstream("PUT", body);
}

export async function POST() {
  return upstream("POST");
}

export async function DELETE() {
  return upstream("DELETE");
}
