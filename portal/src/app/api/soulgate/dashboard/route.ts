/**
 * GET /api/soulgate/dashboard
 *
 * Aggregates SoulGate data from the soulgate backend service.
 * Returns structured dashboard payload consumed by the SoulGate page.
 * Falls back to null fields when the backend is unreachable or returns errors.
 */
import { NextResponse } from "next/server";

const SOULGATE_URL =
  process.env.SOULGATE_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOULGATE_API_URL ||
  "http://localhost:8002";

async function tryFetch(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const [stats, logs, circuits] = await Promise.all([
    tryFetch(`${SOULGATE_URL}/gate/v1/audit/stats`),
    tryFetch(`${SOULGATE_URL}/gate/v1/audit/logs?blocked=true&limit=10`),
    tryFetch(`${SOULGATE_URL}/gate/v1/circuits`),
  ]);

  return NextResponse.json({
    metrics: stats ?? null,
    upstreams: circuits ?? null,
    blocks: logs ?? null,
    fetched_at: new Date().toISOString(),
  });
}
