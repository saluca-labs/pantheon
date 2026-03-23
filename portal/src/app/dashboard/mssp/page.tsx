"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { Building2, Users, AlertTriangle, ShieldAlert, ChevronRight } from "lucide-react";

/** MSSP overview -- multi-tenant management console for managed security providers. Uses live API via useWidgetData. */

interface MsspTenant {
  tenant_id: string;
  name: string;
  tier: string;
  agent_count: number;
  anomaly_count: number;
  quarantine_count: number;
  created_at: string;
}

interface MsspTenantsResponse {
  tenants?: MsspTenant[];
}

interface MsspQuarantineEntry {
  soulkey_id: string;
  tenant_id: string;
  reason: string;
  quarantined_at: string;
  status: "quarantined" | "released";
}

interface MsspQuarantineResponse {
  quarantines?: MsspQuarantineEntry[];
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  loading: boolean;
  accent?: string;
}) {
  return (
    <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${accent ?? "bg-of-primary/10"}`}>
        <Icon className={`h-5 w-5 ${accent ? "text-current" : "text-of-primary"}`} />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
          {label}
        </p>
        <p className="text-2xl font-black tabular-nums text-of-on-surface mt-0.5">
          {loading ? <span className="inline-block w-10 h-6 bg-of-surface-container-high rounded animate-pulse" /> : value}
        </p>
      </div>
    </div>
  );
}

function MsspContent() {
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);

  const { data: tenantsData, loading: tenantsLoading } = useWidgetData<MsspTenantsResponse>({
    endpoint: "/v1/mssp/tenants",
    refreshInterval: 30000,
  });

  const { data: quarantineData, loading: quarantineLoading } = useWidgetData<MsspQuarantineResponse>({
    endpoint: "/v1/mssp/enforcement/quarantine?limit=100",
    refreshInterval: 30000,
  });

  const tenants: MsspTenant[] =
    tenantsData?.tenants ??
    (Array.isArray(tenantsData) ? (tenantsData as MsspTenant[]) : []);

  const quarantines: MsspQuarantineEntry[] =
    quarantineData?.quarantines ??
    (Array.isArray(quarantineData) ? (quarantineData as MsspQuarantineEntry[]) : []);

  const totalAgents = tenants.reduce((s, t) => s + t.agent_count, 0);
  const totalAnomalies = tenants.reduce((s, t) => s + t.anomaly_count, 0);
  const activeQuarantines = quarantines.filter((q) => q.status === "quarantined").length;

  return (
    <div className="max-w-7xl space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Child Tenants"
          value={tenants.length}
          icon={Building2}
          loading={tenantsLoading}
        />
        <StatCard
          label="Total Agents"
          value={totalAgents}
          icon={Users}
          loading={tenantsLoading}
        />
        <StatCard
          label="Active Anomalies"
          value={totalAnomalies}
          icon={AlertTriangle}
          loading={tenantsLoading}
          accent="bg-warning/15 text-warning"
        />
        <StatCard
          label="Active Quarantines"
          value={activeQuarantines}
          icon={ShieldAlert}
          loading={quarantineLoading}
          accent="bg-of-error/15 text-of-error"
        />
      </div>

      {/* Tenant hierarchy table */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
          Child Tenant Hierarchy
        </p>

        {tenantsLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
            ))}
          </div>
        )}

        {!tenantsLoading && tenants.length === 0 && (
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 flex items-center justify-center py-12 text-of-on-surface-variant">
            <p className="text-sm">No child tenants provisioned yet.</p>
          </div>
        )}

        {!tenantsLoading && tenants.length > 0 && (
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_80px_100px_100px_32px] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
              {["Tenant", "Tier", "Agents", "Anomalies", "Quarantined", ""].map((h, i) => (
                <span key={i} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                  {h}
                </span>
              ))}
            </div>

            {tenants.map((tenant) => {
              const isSelected = selectedTenant === tenant.tenant_id;
              const tenantQuarantines = quarantines.filter(
                (q) => q.tenant_id === tenant.tenant_id && q.status === "quarantined"
              );
              return (
                <div key={tenant.tenant_id}>
                  <div
                    className="grid grid-cols-[1fr_120px_80px_100px_100px_32px] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center cursor-pointer"
                    onClick={() => setSelectedTenant(isSelected ? null : tenant.tenant_id)}
                  >
                    {/* Tenant name + id */}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-of-on-surface truncate">{tenant.name}</p>
                      <p className="text-[10px] font-mono text-of-on-surface-variant mt-0.5 truncate">
                        {tenant.tenant_id}
                      </p>
                    </div>

                    {/* Tier badge */}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-of-primary/10 text-of-primary border border-of-primary/20 w-fit">
                      {tenant.tier}
                    </span>

                    {/* Counts */}
                    <span className="text-sm font-mono tabular-nums text-of-on-surface">{tenant.agent_count}</span>
                    <span className={`text-sm font-mono tabular-nums ${tenant.anomaly_count > 0 ? "text-warning font-bold" : "text-of-on-surface"}`}>
                      {tenant.anomaly_count}
                    </span>
                    <span className={`text-sm font-mono tabular-nums ${tenant.quarantine_count > 0 ? "text-of-error font-bold" : "text-of-on-surface"}`}>
                      {tenant.quarantine_count}
                    </span>

                    {/* Expand chevron */}
                    <ChevronRight
                      className={`h-4 w-4 text-of-on-surface-variant transition-transform ${isSelected ? "rotate-90" : ""}`}
                    />
                  </div>

                  {/* Expanded: tenant quarantine detail */}
                  {isSelected && tenantQuarantines.length > 0 && (
                    <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-8 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-of-error mb-3">
                        Active Quarantines
                      </p>
                      <div className="space-y-2">
                        {tenantQuarantines.map((q) => (
                          <div key={q.soulkey_id} className="flex items-center gap-4 text-xs text-of-on-surface-variant">
                            <span className="font-mono truncate max-w-xs">{q.soulkey_id}</span>
                            <span className="text-of-on-surface">{q.reason}</span>
                            <span className="font-mono ml-auto shrink-0">
                              {new Date(q.quarantined_at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MsspOverviewPage() {
  return (
    <TierGate requiredTier="mssp" featureLabel="MSSP Multi-Tenant Overview">
      <MsspContent />
    </TierGate>
  );
}
