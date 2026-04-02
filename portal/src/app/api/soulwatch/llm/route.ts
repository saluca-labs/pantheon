/**
 * GET /api/soulwatch/llm
 *
 * Proxies the SoulWatch LLM dashboard endpoint.
 * Returns LLM usage metrics: total_calls_24h, total_tokens_24h,
 * total_cost_24h, by_model, by_provider, hourly_trend.
 * Falls back to null on backend failure.
 */
import { NextResponse } from "next/server";

const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL ||
  process.env.SOULWATCH_INTERNAL_URL ||
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
  const llm = await tryFetch(`${SOULWATCH_URL}/watch/v1/dashboard/llm`);

  return NextResponse.json({
    llm: llm ?? null,
    fetched_at: new Date().toISOString(),
  });
}
