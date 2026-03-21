"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, Upload } from "lucide-react";

interface ChildTenant {
  id: string;
  name: string;
  slug: string;
  tier: string;
  status: string;
}

interface PolicyPushResult {
  tenant_id: string;
  tenant_name: string | null;
  status: string;
  detail: string | null;
}

interface PolicyPushResponse {
  results: PolicyPushResult[];
  success_count: number;
  error_count: number;
}

function MsspPolicyPushContent() {
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set());
  const [policyYaml, setPolicyYaml] = useState("# Tool policy YAML\n# Push this policy to selected child tenants\n#\n# Example:\n# rules:\n#   - name: deny-shell\n#     command: bash\n#     verdict: deny\n#     reason: Shell access not permitted\n");
  const [pushResult, setPushResult] = useState<PolicyPushResponse | null>(null);
  const [pushing, setPushing] = useState(false);

  const { data: tenantsData, loading: tenantsLoading } = useWidgetData<ChildTenant[]>({
    endpoint: "/v1/mssp/tenants",
    refreshInterval: 60000,
  });

  const tenants: ChildTenant[] = Array.isArray(tenantsData) ? tenantsData : [];

  function toggleTenant(id: string) {
    setSelectedTenants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedTenants(new Set(tenants.map((t) => t.id)));
  }

  function deselectAll() {
    setSelectedTenants(new Set());
  }

  async function handlePush() {
    if (selectedTenants.size === 0 || !policyYaml.trim()) return;
    const confirmed = window.confirm(
      `Push policy to ${selectedTenants.size} tenant(s)? This will overwrite existing policies on selected tenants.`
    );
    if (!confirmed) return;

    setPushing(true);
    setPushResult(null);
    try {
      const result = await api.post("/v1/mssp/aletheia/policies/push", {
        target_tenant_ids: Array.from(selectedTenants),
        policy_yaml: policyYaml,
      });
      setPushResult(result as PolicyPushResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Push failed";
      setPushResult({
        results: [],
        success_count: 0,
        error_count: 1,
      });
      alert(message);
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Selector */}
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
              Select Target Tenants
            </p>
            <p className="text-xs text-of-on-surface-variant">
              {selectedTenants.size} of {tenants.length} selected
            </p>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={selectAll}
              className="h-7 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/10 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant hover:text-of-on-surface transition-colors"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="h-7 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/10 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant hover:text-of-on-surface transition-colors"
            >
              Deselect All
            </button>
          </div>

          {tenantsLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-of-surface-container-high animate-pulse" />
              ))}
            </div>
          )}

          {!tenantsLoading && tenants.length === 0 && (
            <div className="flex items-center justify-center py-8 text-of-on-surface-variant">
              <p className="text-xs">No child tenants found.</p>
            </div>
          )}

          {!tenantsLoading && tenants.length > 0 && (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto scrollbar-thin">
              {tenants.map((tenant) => {
                const isSelected = selectedTenants.has(tenant.id);
                return (
                  <label
                    key={tenant.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-of-primary/10 border border-of-primary/20"
                        : "bg-of-surface-container-high border border-transparent hover:border-of-outline-variant/10"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTenant(tenant.id)}
                      className="w-4 h-4 rounded border-of-outline-variant/30 text-of-primary focus:ring-of-primary/30"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-of-on-surface truncate">{tenant.name}</p>
                      <p className="text-[10px] font-mono text-of-on-surface-variant truncate">{tenant.id}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-of-primary/10 text-of-primary border border-of-primary/20 shrink-0">
                      {tenant.tier}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Policy YAML Editor */}
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
            Policy YAML
          </p>
          <textarea
            value={policyYaml}
            onChange={(e) => setPolicyYaml(e.target.value)}
            className="w-full min-h-[250px] bg-of-surface-container-high text-of-on-surface font-mono text-sm p-4 rounded-lg border border-of-outline-variant/10 resize-y focus:outline-none focus:border-of-primary/40 transition-colors"
            spellCheck={false}
          />

          <button
            onClick={handlePush}
            disabled={pushing || selectedTenants.size === 0 || !policyYaml.trim()}
            className="mt-4 flex items-center gap-2 bg-of-primary text-of-on-primary font-bold px-6 py-2.5 rounded-lg hover:bg-of-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload className="h-4 w-4" />
            {pushing ? "Pushing..." : `Push Policy to ${selectedTenants.size} Tenant(s)`}
          </button>

          <div className="bg-of-surface-container-high rounded-lg p-3 text-xs text-of-on-surface-variant mt-3">
            Policy YAML is stored in each child tenant&apos;s metadata. The tiresias-exec agent reads it on next reload.
          </div>
        </div>
      </div>

      {/* Push Results */}
      {pushResult && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
              Push Results
            </p>
            <p className="text-xs text-of-on-surface-variant">
              {pushResult.success_count} succeeded, {pushResult.error_count} failed
            </p>
          </div>

          {pushResult.results.length > 0 && (
            <div className="space-y-1.5">
              {pushResult.results.map((r) => (
                <div key={r.tenant_id} className="flex items-center gap-3 px-3 py-2.5 bg-of-surface-container-high rounded-lg">
                  {r.status === "success" ? (
                    <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-of-error shrink-0" />
                  )}
                  <span className="text-sm font-medium text-of-on-surface truncate">{r.tenant_name ?? r.tenant_id}</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                    r.status === "success"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "bg-of-error/15 text-of-error border border-of-error/20"
                  }`}>
                    {r.status}
                  </span>
                  {r.detail && (
                    <span className="text-xs text-of-on-surface-variant truncate max-w-xs">{r.detail}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MsspPolicyPushPage() {
  return (
    <TierGate requiredTier="mssp" featureLabel="MSSP Policy Management">
      <MsspPolicyPushContent />
    </TierGate>
  );
}
