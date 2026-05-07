/**
 * POST /v1/mssp/aletheia/policies/push
 *
 * Fans out a policy YAML push to one or more child tenants via
 * SoulAuth's /v1/soulauth/admin/policy/sync endpoint.
 *
 * Request body:
 *   { target_tenant_ids: string[], policy_yaml: string }
 *
 * Response:
 *   { results: PolicyPushResult[], success_count: number, error_count: number }
 */
import { NextRequest, NextResponse } from "next/server";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL || "http://soulauth-mssp:8000";

interface PushRequestBody {
  target_tenant_ids: string[];
  policy_yaml: string;
}

interface PolicyPushResult {
  tenant_id: string;
  tenant_name: string | null;
  status: "success" | "error";
  detail: string | null;
}

export async function POST(request: NextRequest) {
  let body: PushRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { target_tenant_ids, policy_yaml } = body;

  if (
    !Array.isArray(target_tenant_ids) ||
    target_tenant_ids.length === 0 ||
    typeof policy_yaml !== "string" ||
    !policy_yaml.trim()
  ) {
    return NextResponse.json(
      { error: "target_tenant_ids (non-empty array) and policy_yaml (non-empty string) are required" },
      { status: 400 }
    );
  }

  // Fan out to SoulAuth policy sync for each tenant in parallel
  const results: PolicyPushResult[] = await Promise.all(
    target_tenant_ids.map(async (tenantId): Promise<PolicyPushResult> => {
      try {
        const res = await fetch(
          `${SOULAUTH_URL}/v1/soulauth/admin/policy/sync?tenant_id=${encodeURIComponent(tenantId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ policy_yaml }),
            signal: AbortSignal.timeout(10000),
          }
        );

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            tenant_id: tenantId,
            tenant_name: data.tenant_name ?? null,
            status: "success",
            detail: data.detail ?? null,
          };
        }

        const errText = await res.text().catch(() => "Unknown error");
        return {
          tenant_id: tenantId,
          tenant_name: null,
          status: "error",
          detail: `SoulAuth returned ${res.status}: ${errText.slice(0, 200)}`,
        };
      } catch (err) {
        return {
          tenant_id: tenantId,
          tenant_name: null,
          status: "error",
          detail: err instanceof Error ? err.message : "Unknown error",
        };
      }
    })
  );

  const success_count = results.filter((r) => r.status === "success").length;
  const error_count = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ results, success_count, error_count });
}
