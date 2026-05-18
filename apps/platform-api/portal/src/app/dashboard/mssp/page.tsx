"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWidgetData } from "@/lib/useWidgetData";
import { api } from "@/lib/api";
import { Building2, Users, AlertTriangle, ShieldAlert, ChevronRight, Bot, X } from "lucide-react";

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
  status: "quarantined" | "active" | "released";
}

interface MsspQuarantineResponse {
  quarantines?: MsspQuarantineEntry[];
}

interface TenantAgent {
  soulkey_id: string;
  persona: string;
  status: string;
  created_at: string;
  mode?: string;
  type?: string;
}

/** Raw shape returned by SoulAuth GET /v1/soulauth/admin/keys */
interface RawSoulkey {
  id: string;
  persona_id: string;
  status: string;
  issued_at: string;
  [key: string]: unknown;
}

/** Normalize a raw soulkey from the API into the TenantAgent shape the UI expects. */
function toTenantAgent(raw: RawSoulkey): TenantAgent {
  return {
    soulkey_id: raw.id ?? "",
    persona: raw.persona_id ?? raw.id ?? "",
    status: raw.status ?? "unknown",
    created_at: raw.issued_at ?? "",
    mode: (raw.mode as string) ?? undefined,
    type: (raw.type as string) ?? undefined,
  };
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  accent,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  loading: boolean;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5 flex items-center gap-4 ${onClick ? "cursor-pointer hover:bg-of-surface-container-high hover:border-of-outline-variant/15 transition-colors" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
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
  const router = useRouter();
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<TenantAgent | null>(null);
  const [selectedAgentTenant, setSelectedAgentTenant] = useState<MsspTenant | null>(null);
  const [agentsForTenant, setAgentsForTenant] = useState<Record<string, TenantAgent[]>>({});
  const [agentsLoading, setAgentsLoading] = useState<Record<string, boolean>>({});

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
  const activeQuarantines = quarantines.filter((q) => q.status === "quarantined" || q.status === "active").length;

  const fetchAgentsForTenant = async (tenantId: string) => {
    if (agentsForTenant[tenantId] || agentsLoading[tenantId]) return;
    setAgentsLoading((prev) => ({ ...prev, [tenantId]: true }));
    try {
      const json = await api.get<RawSoulkey[] | { keys?: RawSoulkey[] }>(
        `/v1/soulauth/admin/keys?tenant_id=${tenantId}`,
      );
      const rawKeys: RawSoulkey[] = Array.isArray(json)
        ? json
        : (json as { keys?: RawSoulkey[] })?.keys ?? [];
      const agents: TenantAgent[] = rawKeys.map(toTenantAgent);
      setAgentsForTenant((prev) => ({ ...prev, [tenantId]: agents }));
    } catch {
      setAgentsForTenant((prev) => ({ ...prev, [tenantId]: [] }));
    } finally {
      setAgentsLoading((prev) => ({ ...prev, [tenantId]: false }));
    }
  };

  const handleTenantToggle = (tenantId: string) => {
    const isSelected = selectedTenant === tenantId;
    setSelectedTenant(isSelected ? null : tenantId);
    if (!isSelected) {
      fetchAgentsForTenant(tenantId);
    }
  };

  const scrollToTenantList = () => {
    document.getElementById("tenant-hierarchy")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="max-w-7xl space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Child Tenants"
          value={tenants.length}
          icon={Building2}
          loading={tenantsLoading}
          onClick={scrollToTenantList}
        />
        <StatCard
          label="Total Agents"
          value={totalAgents}
          icon={Users}
          loading={tenantsLoading}
          onClick={() => router.push("/dashboard/agents")}
        />
        <StatCard
          label="Active Anomalies"
          value={totalAnomalies}
          icon={AlertTriangle}
          loading={tenantsLoading}
          accent="bg-warning/15 text-warning"
          onClick={() => router.push("/dashboard/soulwatch/anomalies")}
        />
        <StatCard
          label="Active Quarantines"
          value={activeQuarantines}
          icon={ShieldAlert}
          loading={quarantineLoading}
          accent="bg-of-error/15 text-of-error"
          onClick={() => router.push("/dashboard/quarantine")}
        />
      </div>

      {/* Tenant hierarchy table */}
      <div id="tenant-hierarchy">
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
                (q) => q.tenant_id === tenant.tenant_id && (q.status === "quarantined" || q.status === "active")
              );
              return (
                <div key={tenant.tenant_id}>
                  <div
                    className="grid grid-cols-[1fr_120px_80px_100px_100px_32px] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center cursor-pointer"
                    onClick={() => handleTenantToggle(tenant.tenant_id)}
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

                  {/* Expanded: tenant detail panel */}
                  {isSelected && (
                    <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-8 py-4 space-y-5">
                      {/* Agent list */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-of-primary mb-3 flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5" /> Agents ({tenant.agent_count})
                        </p>
                        {agentsLoading[tenant.tenant_id] ? (
                          <div className="space-y-1.5">
                            {[1, 2].map((i) => (
                              <div key={i} className="h-8 rounded-lg bg-of-surface-container animate-pulse" />
                            ))}
                          </div>
                        ) : (agentsForTenant[tenant.tenant_id] ?? []).length === 0 ? (
                          <p className="text-xs text-of-on-surface-variant">No agents found for this tenant.</p>
                        ) : (
                          <div className="space-y-1">
                            {/* Column headers */}
                            <div className="grid grid-cols-[1fr_120px_140px] gap-3 text-xs px-2 pb-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Persona</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Status</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Created</span>
                            </div>
                            {(agentsForTenant[tenant.tenant_id] ?? []).map((agent) => (
                              <React.Fragment key={agent.soulkey_id}>
                                <div
                                  className={`grid grid-cols-[1fr_120px_140px] gap-3 text-xs px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                                    selectedAgent?.soulkey_id === agent.soulkey_id
                                      ? "bg-of-primary/10 border border-of-primary/20"
                                      : "hover:bg-of-surface-container-high border border-transparent"
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedAgent?.soulkey_id === agent.soulkey_id) {
                                      setSelectedAgent(null);
                                      setSelectedAgentTenant(null);
                                    } else {
                                      setSelectedAgent(agent);
                                      setSelectedAgentTenant(tenant);
                                    }
                                  }}
                                >
                                  <span className="text-of-on-surface font-medium truncate" title={agent.soulkey_id}>{agent.persona || agent.soulkey_id.slice(0, 12)}</span>
                                  <span className={`${agent.status === "active" ? "text-emerald-400" : "text-of-on-surface-variant"}`}>{agent.status}</span>
                                  <span className="font-mono text-of-on-surface-variant">{agent.created_at ? new Date(agent.created_at).toLocaleDateString() : "\u2014"}</span>
                                </div>

                                {/* Inline agent detail panel */}
                                {selectedAgent?.soulkey_id === agent.soulkey_id && (
                                  <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/15 p-4 ml-2 mt-1 mb-2 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-bold text-of-on-surface">{agent.persona || agent.soulkey_id.slice(0, 12)}</p>
                                      <button
                                        className="p-1 rounded-md hover:bg-of-surface-container-high transition-colors text-of-on-surface-variant hover:text-of-on-surface"
                                        onClick={(e) => { e.stopPropagation(); setSelectedAgent(null); setSelectedAgentTenant(null); }}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Soulkey ID</p>
                                        <p className="font-mono text-of-on-surface break-all">{agent.soulkey_id}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Status</p>
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                          agent.status === "active"
                                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                            : agent.status === "suspended"
                                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                                            : agent.status === "revoked"
                                            ? "bg-red-500/15 text-red-400 border border-red-500/20"
                                            : "bg-gray-500/15 text-gray-400 border border-gray-500/20"
                                        }`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${
                                            agent.status === "active" ? "bg-emerald-400" :
                                            agent.status === "suspended" ? "bg-amber-400" :
                                            agent.status === "revoked" ? "bg-red-400" : "bg-gray-400"
                                          }`} />
                                          {agent.status}
                                        </span>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Tenant</p>
                                        <p className="text-of-on-surface">{selectedAgentTenant?.name ?? tenant.name}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Created</p>
                                        <p className="font-mono text-of-on-surface">{agent.created_at ? new Date(agent.created_at).toLocaleDateString() : "\u2014"}</p>
                                      </div>
                                      {(agent.mode || agent.type) && (
                                        <>
                                          {agent.mode && (
                                            <div>
                                              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Mode</p>
                                              <p className="text-of-on-surface">{agent.mode}</p>
                                            </div>
                                          )}
                                          {agent.type && (
                                            <div>
                                              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Type</p>
                                              <p className="text-of-on-surface">{agent.type}</p>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>

                                    <div className="pt-2 border-t border-of-outline-variant/10">
                                      <Link
                                        href={`/dashboard/agents?expand=${encodeURIComponent(agent.soulkey_id)}`}
                                        className="text-xs font-semibold text-of-primary hover:text-of-primary/80 transition-colors inline-flex items-center gap-1"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View in Agents <span aria-hidden="true">&rarr;</span>
                                      </Link>
                                    </div>
                                  </div>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Quarantines */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-of-error mb-3">
                          Active Quarantines
                        </p>
                        {tenantQuarantines.length === 0 ? (
                          <p className="text-xs text-of-on-surface-variant">No active quarantines for this tenant.</p>
                        ) : (
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
                        )}
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
      <MsspContent />
  );
}
