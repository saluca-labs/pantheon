/**
 * GET /v1/mssp/detection/matches
 * Proxies SoulWatch detections and reshapes them into the MsspDetectionMatch
 * format the portal detection page expects.
 *
 * Query params forwarded: level, limit (mapped to page_size).
 */
import { NextRequest, NextResponse } from "next/server";

const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOULWATCH_API_URL ||
  "http://soulwatch-mssp:8001";

const SOULWATCH_KEY =
  process.env.SOULWATCH_INTERNAL_KEY || "";

interface SoulWatchDetection {
  id: string;
  rule_id: string;
  rule_title: string;
  description?: string;
  level: string;
  soulkey_id: string | null;
  tenant_id?: string;
  event_data?: { tenant_id?: string; persona_id?: string; [key: string]: unknown };
  matched_fields?: string[];
  created_at: string;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const level = searchParams.get("level") || "";
    const limit = searchParams.get("limit") || "100";

    const qs = new URLSearchParams({ page_size: limit });
    if (level) qs.set("level", level);

    const res = await fetch(
      `${SOULWATCH_URL}/watch/v1/detections?${qs.toString()}`,
      {
        headers: { "X-Internal-Key": SOULWATCH_KEY },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      return NextResponse.json({ matches: [] });
    }

    const data = await res.json();
    const detections: SoulWatchDetection[] = data.detections ?? [];

    // Reshape into the MsspDetectionMatch schema the page component expects
    const matches = detections.map((d) => ({
      id: d.id,
      tenant_id: d.tenant_id ?? d.event_data?.tenant_id ?? "unknown",
      rule_id: d.rule_id,
      rule_name: d.rule_title,
      description: d.description ?? "",
      level: d.level,
      soulkey_id: d.soulkey_id ?? "",
      persona_id: d.event_data?.persona_id ?? "",
      matched_fields: d.matched_fields ?? [],
      event_data: d.event_data ?? {},
      timestamp: d.created_at,
    }));

    return NextResponse.json({ matches });
  } catch {
    return NextResponse.json({ matches: [] });
  }
}
