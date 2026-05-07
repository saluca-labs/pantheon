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
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";
import { tryFetch } from "@/lib/server-fetch";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const swHeaders = config.soulwatch.key
    ? { "X-Internal-Key": config.soulwatch.key }
    : undefined;

  const [detectionsRes, anomaliesRes, quarantinesRes] = await Promise.all([
    tryFetch(`${config.soulwatch.url}/watch/v1/detections?page_size=10`, swHeaders, 5000),
    tryFetch(`${config.soulwatch.url}/watch/v1/anomalies?status=open&page_size=50`, swHeaders, 5000),
    tryFetch(`${config.soulwatch.url}/watch/v1/quarantines?status=active`, swHeaders, 5000),
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
