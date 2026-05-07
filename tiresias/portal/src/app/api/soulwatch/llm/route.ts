/**
 * GET /api/soulwatch/llm
 *
 * Proxies the SoulWatch LLM dashboard endpoint.
 * Returns LLM usage metrics: total_calls_24h, total_tokens_24h,
 * total_cost_24h, by_model, by_provider, hourly_trend.
 * Falls back to null on backend failure.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";
import { tryFetch } from "@/lib/server-fetch";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const llm = await tryFetch(`${config.soulwatch.url}/watch/v1/dashboard/llm`, undefined, 5000);

  return NextResponse.json({
    llm: llm ?? null,
    fetched_at: new Date().toISOString(),
  });
}
