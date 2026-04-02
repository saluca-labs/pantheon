/**
 * GET /v1/enforcement/quarantine
 *
 * Proxies active quarantines from SoulWatch for the dashboard
 * QuarantineStatus widget. Returns an array of quarantined agents
 * shaped for the widget's transform function.
 */
import { NextResponse } from "next/server";

const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOULWATCH_API_URL ||
  "http://localhost:8001";

const SOULWATCH_KEY =
  process.env.SOULWATCH_INTERNAL_KEY || "sw_metrics_scrape_2026";

export async function GET() {
  try {
    const res = await fetch(
      `${SOULWATCH_URL}/watch/v1/quarantines?status=active`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": SOULWATCH_KEY,
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return NextResponse.json({ quarantined: [] });
    const data = await res.json();
    // Map SoulWatch quarantine records to the shape the widget expects
    const quarantined = (data.quarantines || []).map(
      (q: {
        soulkey_id: string;
        reason: string;
        quarantined_at: string;
        actions_taken?: string[];
      }) => ({
        soulkey_id: q.soulkey_id,
        soulkey: q.soulkey_id,
        reason: q.reason || "Quarantined by SoulWatch",
        quarantined_at: q.quarantined_at,
        action: q.actions_taken?.[0]?.replace(/_/g, "_") || "suspended",
      }),
    );
    return NextResponse.json({ quarantined });
  } catch {
    return NextResponse.json({ quarantined: [] });
  }
}
