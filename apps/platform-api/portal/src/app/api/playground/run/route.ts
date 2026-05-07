/**
 * POST /api/playground/run
 *
 * Accepts a playground prompt request, verifies the user session,
 * forwards to the Tiresias proxy as an OpenAI-compatible chat completion,
 * and returns a normalized RunResult.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

/** Cost per 1K tokens by model family (rough estimates). */
const COST_PER_1K: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4":          { input: 0.003,  output: 0.015  },
  "claude-opus-4":            { input: 0.015,  output: 0.075  },
  "claude-haiku-4":           { input: 0.0008, output: 0.004  },
  "gpt-4o":                   { input: 0.005,  output: 0.015  },
  "gpt-4o-mini":              { input: 0.00015, output: 0.0006 },
  "llama":                    { input: 0.0,    output: 0.0    },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const key = Object.keys(COST_PER_1K).find((k) => model.includes(k)) ?? "";
  const rates = COST_PER_1K[key] ?? { input: 0.002, output: 0.002 };
  return (promptTokens / 1000) * rates.input + (completionTokens / 1000) * rates.output;
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  let body: {
    prompt: string;
    system_prompt?: string;
    model?: string;
    provider?: string;
    temperature?: number;
    max_tokens?: number;
    messages?: Array<{ role: string; content: string }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const model = body.model || "gpt-4o";
  const temperature = body.temperature ?? 0.7;
  const maxTokens = body.max_tokens ?? 1024;

  // Build messages array: support both single-prompt and multi-turn
  let messages: Array<{ role: string; content: string }> = [];
  if (body.system_prompt) {
    messages.push({ role: "system", content: body.system_prompt });
  }
  if (body.messages && body.messages.length > 0) {
    messages = messages.concat(body.messages);
  } else if (body.prompt) {
    messages.push({ role: "user", content: body.prompt });
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
  }

  const chatBody = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.proxy.apiKey) {
    headers["X-Tiresias-Api-Key"] = config.proxy.apiKey;
  }
  // Forward tenant context
  const tenantId = request.headers.get("x-tenant-id");
  if (tenantId) headers["X-Tenant-ID"] = tenantId;
  const soulkey = request.headers.get("x-soulkey");
  if (soulkey) headers["X-SoulKey"] = soulkey;

  const startMs = Date.now();

  try {
    const res = await fetch(`${config.proxy.url}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(chatBody),
      signal: AbortSignal.timeout(120_000),
    });

    const latencyMs = Date.now() - startMs;

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Proxy returned ${res.status}: ${errText}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    const completion =
      data.choices?.[0]?.message?.content ?? "(no response)";
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;
    const totalTokens = data.usage?.total_tokens ?? promptTokens + completionTokens;
    const cost = estimateCost(model, promptTokens, completionTokens);

    return NextResponse.json({
      completion,
      tokens: totalTokens,
      cost,
      latency_ms: latencyMs,
      model: data.model ?? model,
      usage: data.usage ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Proxy request failed: ${message}` },
      { status: 502 },
    );
  }
}
