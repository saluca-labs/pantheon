"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { api } from "@/lib/api";
import { Plus, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";

interface MsspTenant {
  tenant_id: string;
  name: string;
  tier: string;
  status: "active" | "suspended";
  created_at: string;
}

interface MsspTenantsResponse {
  tenants?: MsspTenant[];
}

interface UsageMetrics {
  tenant_id: string;
  requests: number;
  tokens: number;
  anomalies: number;
  storage_bytes: number;
  period_start: string;
  period_end: string;
}

interface UsageResponse {
  usage?: UsageMetrics[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SaasAdminContent() {
  const [provisionForm, setProvisionForm] = useState({ name: "", email: "", tier: "starter" });
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ tenant_id?: string; error?: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState("7d");

  const fromDate = (() => {
    const d = new Date();
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 1;
    d.setDate(d.getDate() - days);
    return d.toISOString();
  })();

  const { data: tenantsData, loading: tenantsLoading, error: tenantsError } = useWidgetData<MsspTenantsResponse>({
    endpoint: "/v1/mssp/tenants",
    refreshInterval: 30000,
  });

  const { data: usageData, loading: usageLoading } = useWidgetData<UsageResponse>({
    endpoint: `/v1/saas/usage?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(new Date().toISOString())}`,
    refreshInterval: 60000,
  });

  const tenants: MsspTenant[] =
    tenantsData?.tenants ??
    (Array.isArray(tenantsData) ? (tenantsData as MsspTenant[]) : []);

  const usage: UsageMetrics[] =
    usageData?.usage ??
    (Array.isArray(usageData) ? (usageData as UsageMetrics[]) : []);

  const usageByTenantId = Object.fromEntries(usage.map((u) => [u.tenant_id, u]));

  async function handleProvision() {
    if (!provisionForm.name || !provisionForm.email) return;
    setProvisioning(true);
    setProvisionResult(null);
    try {
      const result = await api.post<{ tenant_id: string }>("/v1/saas/provision", provisionForm);
      setProvisionResult({ tenant_id: result.tenant_id });
      setProvisionForm({ name: "", email: "", tier: "starter" });
    } catch (e) {
      setProvisionResult({ error: e instanceof Error ? e.message : "Provisioning failed" });
    } finally {
      setProvisioning(false);
    }
  }

  async function handleSuspend(tenantId: string) {
    setActionLoading(tenantId + ":suspend");
    try {
      await api.post(`/v1/saas/tenants/${tenantId}/suspend`, {});
    } catch {
      // Ignore — tenant list will refresh
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReactivate(tenantId: string) {
    setActionLoading(tenantId + ":reactivate");
    try {
      await api.post(`/v1/saas/tenants/${tenantId}/reactivate`, {});
    } catch {
      // Ignore
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="max-w-7xl space-y-8">

      {/* Provisioning form */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Plus className="h-4 w-4 text-of-primary" />
          <h3 className="text-sm font-bold text-of-on-surface">Provision New Tenant</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">
              Company Name
            </label>
            <input
              type="text"
              value={provisionForm.name}
              onChange={(e) => setProvisionForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Acme Corp"
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">
              Admin Email
            </label>
            <input
              type="email"
              value={provisionForm.email}
              onChange={(e) => setProvisionForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="admin@acme.com"
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">
              Initial Tier
            </label>
            <select
              value={provisionForm.tier}
              onChange={(e) => setProvisionForm((f) => ({ ...f, tier: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface focus:outline-none focus:border-of-primary/40 transition-colors"
            >
              {["community", "starter", "pro", "enterprise"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleProvision}
            disabled={provisioning || !provisionForm.name || !provisionForm.email}
            className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {provisioning && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Provision Tenant
          </button>
          {provisionResult?.tenant_id && (
            <span className="text-xs text-green-400">
              Provisioned: <span className="font-mono">{provisionResult.tenant_id}</span>
            </span>
          )}
          {provisionResult?.error && (
            <span className="text-xs text-of-error">{provisionResult.error}</span>
          )}
        </div>
      </div>

      {/* Usage table with time-range filter */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
            Usage Metrics
          </p>
          <div className="flex items-center gap-1">
            {(["1d", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 h-7 rounded-full text-[11px] font-bold transition-colors ${
                  timeRange === r
                    ? "bg-of-primary/20 text-of-primary"
                    : "text-of-on-surface-variant hover:text-of-on-surface"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {(tenantsLoading || usageLoading) && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
            ))}
          </div>
        )}

        {!tenantsLoading && !tenantsError && tenants.length > 0 && (
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_100px_100px_100px_120px_120px] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
              {["Tenant", "Status", "Requests", "Tokens", "Anomalies", "Storage", "Actions"].map((h) => (
                <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                  {h}
                </span>
              ))}
            </div>

            {tenants.map((tenant) => {
              const u = usageByTenantId[tenant.tenant_id];
              const isSuspended = tenant.status === "suspended";
              const isActing = actionLoading?.startsWith(tenant.tenant_id);

              return (
                <div
                  key={tenant.tenant_id}
                  className="grid grid-cols-[1fr_100px_100px_100px_100px_120px_120px] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center"
                >
                  {/* Tenant name */}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-of-on-surface truncate">{tenant.name}</p>
                    <p className="text-[10px] font-mono text-of-on-surface-variant mt-0.5 truncate">{tenant.tenant_id}</p>
                  </div>

                  {/* Status badge */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                      isSuspended
                        ? "bg-of-error/20 text-of-error border border-of-error/30"
                        : "bg-green-500/15 text-green-400 border border-green-500/20"
                    }`}
                  >
                    {tenant.status}
                  </span>

                  {/* Usage metrics */}
                  <span className="text-sm font-mono tabular-nums text-of-on-surface">
                    {usageLoading ? "\u2014" : (u?.requests?.toLocaleString() ?? "0")}
                  </span>
                  <span className="text-sm font-mono tabular-nums text-of-on-surface">
                    {usageLoading ? "\u2014" : (u?.tokens?.toLocaleString() ?? "0")}
                  </span>
                  <span className={`text-sm font-mono tabular-nums ${(u?.anomalies ?? 0) > 0 ? "text-warning font-bold" : "text-of-on-surface"}`}>
                    {usageLoading ? "\u2014" : (u?.anomalies?.toLocaleString() ?? "0")}
                  </span>
                  <span className="text-sm font-mono tabular-nums text-of-on-surface">
                    {usageLoading ? "\u2014" : formatBytes(u?.storage_bytes ?? 0)}
                  </span>

                  {/* Suspend / Reactivate */}
                  <div className="flex items-center gap-2">
                    {isSuspended ? (
                      <button
                        onClick={() => handleReactivate(tenant.tenant_id)}
                        disabled={!!isActing}
                        className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                      >
                        {isActing ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <PlayCircle className="h-3 w-3" />
                        )}
                        Reactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSuspend(tenant.tenant_id)}
                        disabled={!!isActing}
                        className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-bold text-of-error bg-of-error/10 border border-of-error/20 hover:bg-of-error/20 disabled:opacity-50 transition-colors"
                      >
                        {isActing ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <PauseCircle className="h-3 w-3" />
                        )}
                        Suspend
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Billing status card */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
          Billing Status
        </p>
        <p className="text-xs text-of-on-surface-variant">
          Billing is managed via{" "}
          <a
            href="https://billing.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-of-primary hover:underline"
          >
            Stripe hosted portal
          </a>
          . Subscription events are received at{" "}
          <span className="font-mono text-of-on-surface">/v1/saas/billing/webhook</span> and update
          tenant tiers automatically.
        </p>
      </div>
    </div>
  );
}

export default function SaasAdminPage() {
  return (
    <TierGate requiredTier="mssp" featureLabel="SaaS Admin">
      <SaasAdminContent />
    </TierGate>
  );
}
