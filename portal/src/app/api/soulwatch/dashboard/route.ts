/**
 * GET /api/soulwatch/dashboard
 *
 * Aggregates SoulWatch data from the soulwatch backend service.
 * Returns structured dashboard payload consumed by the SoulWatch page.
 * Falls back to null fields when the backend is unreachable or returns errors.
 *
 * The SoulWatch API returns paginated envelopes like:
 *   { detections: [...], total: N, page: 1, page_size: 10 }
 * This route unwraps those envelopes so the frontend receives flat arrays
 * plus _total counts for accurate dashboard widgets.
 */
import { NextResponse } from "next/server";

const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL ||
  process.env.SOULWATCH_INTERNAL_URL ||
  "http://localhost:8001";

const SOULWATCH_KEY =
  process.env.SOULWATCH_INTERNAL_KEY || "sw_metrics_scrape_2026";

async function tryFetch(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": SOULWATCH_KEY,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const [detectionsRes, anomaliesRes, quarantinesRes] = await Promise.all([
    tryFetch(`${SOULWATCH_URL}/watch/v1/detections?page_size=10`),
    tryFetch(`${SOULWATCH_URL}/watch/v1/anomalies?status=open&page_size=50`),
    tryFetch(`${SOULWATCH_URL}/watch/v1/quarantines?status=active`),
  ]);

  // Unwrap paginated envelopes into flat arrays + totals
  const detections = detectionsRes?.detections ?? null;
  const anomalies = anomaliesRes?.anomalies ?? null;
  const quarantines = quarantinesRes?.quarantines ?? null;

  return NextResponse.json({
    detections,
    anomalies,
    quarantines,
    // Totals from the API -- use these for counts instead of array.length
    anomalies_total: anomaliesRes?.total ?? null,
    quarantines_total: quarantinesRes?.total ?? null,
    detections_total: detectionsRes?.total ?? null,
    fetched_at: new Date().toISOString(),
  });
}
