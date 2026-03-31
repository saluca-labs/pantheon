/**
 * GET /api/soulwatch/dashboard
 *
 * Aggregates SoulWatch data from the soulwatch backend service.
 * Returns structured dashboard payload consumed by the SoulWatch page.
 * Falls back to null fields when the backend is unreachable or returns errors.
 */
import { NextResponse } from "next/server";

const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOULWATCH_API_URL ||
  "http://localhost:8001";

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
  const [detections, anomalies, quarantines] = await Promise.all([
    tryFetch(`${SOULWATCH_URL}/watch/v1/detections?page_size=10`),
    tryFetch(`${SOULWATCH_URL}/watch/v1/anomalies?status=open&page_size=50`),
    tryFetch(`${SOULWATCH_URL}/watch/v1/enforcement/quarantines?status=active`),
  ]);

  return NextResponse.json({
    detections: detections ?? null,
    anomalies: anomalies ?? null,
    quarantines: quarantines ?? null,
    fetched_at: new Date().toISOString(),
  });
}
