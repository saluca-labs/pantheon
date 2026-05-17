/**
 * GET /api/provider-keys/status
 *
 * Returns the BOOLEAN presence of each LLM-provider API key env var on the
 * running pod. ONLY booleans are returned — the raw key values are never
 * exposed to the browser.
 *
 * This surfaces the platform-wide provider config that Tiresias's
 * `build_provider()` reads from process env (see
 * apps/platform-api/src/tiresias/providers/__init__.py). Per-tenant BYOK
 * is Wave H.2 scope.
 *
 * Response shape:
 *   { anthropic: true, openai: false, gemini: true, groq: false, ollama: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";

/**
 * Map of provider slug → env var name. Mirrors Tiresias's `_ENV_KEY_MAP`.
 * `ollama` uses `OLLAMA_HOST` in the platform-web deployment but
 * `OLLAMA_API_KEY` in Tiresias — check both so the tab is honest about
 * either being configured.
 */
const PROVIDER_ENV_VARS: Record<string, readonly string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  gemini: ["GOOGLE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  ollama: ["OLLAMA_API_KEY", "OLLAMA_HOST"],
};

/**
 * A value counts as "configured" when the env var is set to a non-empty
 * string. We deliberately do NOT enforce a length threshold (the registry
 * uses `>= 32 chars` for sanity but we want to show even short/test values
 * as configured so operators can see exactly what the pod sees).
 */
function isConfigured(envVarNames: readonly string[]): boolean {
  return envVarNames.some((name) => {
    const v = process.env[name];
    return typeof v === "string" && v.trim().length > 0;
  });
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const status: Record<string, boolean> = {};
  for (const [provider, envVars] of Object.entries(PROVIDER_ENV_VARS)) {
    status[provider] = isConfigured(envVars);
  }

  return NextResponse.json(status);
}
