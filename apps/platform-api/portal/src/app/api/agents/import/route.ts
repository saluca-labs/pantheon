/**
 * POST /api/agents/import → bulk-import agents from agent.yaml
 *
 * Wave H.2.f — proxy in front of platform-api `POST /v1/agents/import`.
 * Forwards multipart file uploads, raw YAML bodies, or inline JSON
 * untouched (sans the auth context, which we inject from the session).
 *
 * Supported body shapes (mirrors the backend):
 *   1. multipart/form-data   — `files=...` attachments, one or many
 *   2. text/yaml (raw body)  — single or multi-document YAML stream
 *   3. application/json      — { agents: [...] } | { metadata, spec } | [{...}]
 *
 * `?dry_run=true` is forwarded so the preview pane can request a
 * validation-only run without writing.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const BACKEND_PATH = "/v1/agents/import";

// Pre-flight + import calls can be heavy (multi-file, validation, atomic
// per-agent transactions). 30s gives enough headroom even for bulk
// imports of 20+ agents while still bounding the route.
const PROXY_TIMEOUT_MS = 30_000;

function authHeaders(
  tenantId: string,
  sessionToken: string,
  soulKey: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Internal-Key": config.internalApiKey,
    "X-Tenant-ID": tenantId,
    Authorization: `Bearer ${sessionToken}`,
  };
  if (soulKey) headers["X-SoulKey"] = soulKey;
  return headers;
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const soulKey = request.headers.get("x-soulkey");
  const dryRun = request.nextUrl.searchParams.get("dry_run");
  const qs = dryRun ? `?dry_run=${encodeURIComponent(dryRun)}` : "";
  const url = `${config.soulauth.url}${BACKEND_PATH}${qs}`;

  const ctypeRaw = (request.headers.get("content-type") ?? "").toLowerCase();
  const ctype = ctypeRaw.split(";", 1)[0].trim();

  // Build headers — preserve the original Content-Type so multipart
  // boundary tokens etc. survive the hop.
  const headers = authHeaders(session.tenantId, session.token, soulKey);
  if (ctypeRaw) {
    headers["Content-Type"] = ctypeRaw;
  }

  try {
    let backendRes: Response;

    if (ctype.startsWith("multipart/form-data")) {
      // For multipart we must NOT touch the body — re-stream the raw bytes
      // and let the platform-api parse the parts. Node 18+/Next 14 lets us
      // pass the request's body stream directly.
      // We strip Content-Type from our headers map and let fetch repopulate
      // it from the FormData, OR forward the original raw body bytes.
      const formData = await request.formData();
      const outgoing = new FormData();
      for (const [key, value] of formData.entries()) {
        outgoing.append(key, value as Blob | string);
      }
      // When body is a FormData, fetch sets the multipart Content-Type +
      // boundary for us — remove our copy so it doesn't conflict.
      delete headers["Content-Type"];
      backendRes = await fetch(url, {
        method: "POST",
        headers,
        body: outgoing,
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      });
    } else if (
      ctype === "text/yaml" ||
      ctype === "application/yaml" ||
      ctype === "application/x-yaml" ||
      ctype === "text/x-yaml"
    ) {
      // Raw YAML — forward bytes verbatim.
      const raw = await request.text();
      backendRes = await fetch(url, {
        method: "POST",
        headers,
        body: raw,
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      });
    } else {
      // Default: JSON.
      let parsed: unknown;
      try {
        parsed = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body — expected an agent payload" },
          { status: 400 },
        );
      }
      headers["Content-Type"] = "application/json";
      backendRes = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(parsed),
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      });
    }

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Failed to import agents: ${msg}` },
      { status: 502 },
    );
  }
}
