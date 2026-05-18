"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWidgetData } from "@/lib/useWidgetData";
import { ArrowLeft, Key, Activity, AlertTriangle, HardDrive, X } from "lucide-react";

interface TenantDetail {
  tenant_id: string;
  name: string;
  slug?: string;
  tier: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface TenantsResponse {
  tenants?: TenantDetail[];
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

interface SoulKey {
  id: string;
  name: string;
  persona?: string;
  status: string;
  created_at: string;
  last_used?: string;
  metadata?: Record<string, unknown>;
}

interface KeysResponse {
  keys?: SoulKey[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TenantDetailContent() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.tenantId as string;
  const [selectedKey, setSelectedKey] = useState<SoulKey | null>(null);

  const { data: tenantsData, loading: tenantsLoading } = useWidgetData<TenantsResponse>({
    endpoint: "/api/mssp/tenants",
    refreshInterval: 30000,
  });

  const { data: usageData, loading: usageLoading } = useWidgetData<UsageResponse>({
    endpoint: `/api/mssp/usage`,
    refreshInterval: 60000,
  });

  const { data: keysData, loading: keysLoading } = useWidgetData<KeysResponse>({
    endpoint: `/api/mssp/keys?tenant_id=${tenantId}`,
    refreshInterval: 30000,
  });

  const tenants = tenantsData?.tenants ?? (Array.isArray(tenantsData) ? tenantsData as TenantDetail[] : []);
  const tenant = tenants.find((t) => t.tenant_id === tenantId);

  const usageList = usageData?.usage ?? (Array.isArray(usageData) ? usageData as UsageMetrics[] : []);
  const usage = usageList.find((u) => u.tenant_id === tenantId);

  const keys: SoulKey[] = keysData?.keys ?? (Array.isArray(keysData) ? keysData as SoulKey[] : []);

  const isLoading = tenantsLoading || usageLoading;

  return (
    <div className="max-w-5xl space-y-8">
      {/* Back navigation */}
      <button
        onClick={() => router.push("/dashboard/mssp/saas")}
        className="flex items-center gap-2 text-sm text-of-on-surface-variant hover:text-of-on-surface transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to SaaS Admin
      </button>

      {/* Tenant header */}
      {isLoading ? (
        <div className="h-20 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
      ) : tenant ? (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-of-on-surface">{tenant.name}</h2>
              <p className="text-xs font-mono text-of-on-surface-variant mt-1">{tenant.tenant_id}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-of-primary/15 text-of-primary border border-of-primary/20">
                {tenant.tier}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                  tenant.status === "suspended"
                    ? "bg-of-error/20 text-of-error border border-of-error/30"
                    : "bg-green-500/15 text-green-400 border border-green-500/20"
                }`}
              >
                {tenant.status}
              </span>
            </div>
          </div>
          {tenant.created_at && (
            <p className="text-[10px] text-of-on-surface-variant mt-2">
              Created {new Date(tenant.created_at).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6 text-sm text-of-on-surface-variant">
          Tenant not found: <span className="font-mono">{tenantId}</span>
        </div>
      )}

      {/* Usage metrics cards */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
          Usage Metrics
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Keys", value: usage?.requests ?? 0, icon: Key, fmt: (v: number) => v.toLocaleString() },
            { label: "Tokens", value: usage?.tokens ?? 0, icon: Activity, fmt: (v: number) => v.toLocaleString() },
            { label: "Anomalies", value: usage?.anomalies ?? 0, icon: AlertTriangle, fmt: (v: number) => v.toLocaleString(), warn: true },
            { label: "Storage", value: usage?.storage_bytes ?? 0, icon: HardDrive, fmt: formatBytes },
          ].map(({ label, value, icon: Icon, fmt, warn }) => (
            <div
              key={label}
              className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-3.5 w-3.5 text-of-on-surface-variant" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                  {label}
                </span>
              </div>
              <p className={`text-2xl font-bold font-mono tabular-nums ${warn && value > 0 ? "text-warning" : "text-of-on-surface"}`}>
                {usageLoading ? "\u2014" : fmt(value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* SoulKeys table */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
          SoulKeys
        </p>
        {keysLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6 text-sm text-of-on-surface-variant text-center">
            No keys found for this tenant.
          </div>
        ) : (
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_100px_160px] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
              {["Key Name", "Status", "ID (prefix)", "Created"].map((h) => (
                <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                  {h}
                </span>
              ))}
            </div>
            {keys.map((key) => (
              <React.Fragment key={key.id}>
                <div
                  className={`grid grid-cols-[1fr_120px_100px_160px] gap-4 px-5 py-3 border-b border-of-outline-variant/5 cursor-pointer transition-colors items-center ${
                    selectedKey?.id === key.id
                      ? "bg-of-primary/10 border-l-2 border-l-of-primary"
                      : "hover:bg-of-surface-container-high"
                  }`}
                  onClick={() => setSelectedKey(selectedKey?.id === key.id ? null : key)}
                >
                  <span className="text-sm font-bold text-of-on-surface truncate">{key.name || "Unnamed"}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                      key.status === "active"
                        ? "bg-green-500/15 text-green-400 border border-green-500/20"
                        : key.status === "revoked"
                          ? "bg-of-error/20 text-of-error border border-of-error/30"
                          : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                    }`}
                  >
                    {key.status}
                  </span>
                  <span className="text-xs font-mono text-of-on-surface-variant truncate">
                    {key.id.slice(0, 8)}...
                  </span>
                  <span className="text-xs text-of-on-surface-variant">
                    {new Date(key.created_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Inline detail panel */}
                {selectedKey?.id === key.id && (
                  <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-6 py-4">
                    <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/15 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-of-on-surface">
                          {key.persona || key.name || "Unnamed Agent"}
                        </p>
                        <button
                          className="p-1 rounded-md hover:bg-of-surface-container-high transition-colors text-of-on-surface-variant hover:text-of-on-surface"
                          onClick={(e) => { e.stopPropagation(); setSelectedKey(null); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                        {key.persona && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Persona</p>
                            <p className="text-of-on-surface">{key.persona}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Soulkey ID</p>
                          <p className="font-mono text-of-on-surface break-all">{key.id}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Status</p>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            key.status === "active"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                              : key.status === "revoked"
                              ? "bg-red-500/15 text-red-400 border border-red-500/20"
                              : key.status === "suspended"
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                              : "bg-gray-500/15 text-gray-400 border border-gray-500/20"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              key.status === "active" ? "bg-emerald-400" :
                              key.status === "revoked" ? "bg-red-400" :
                              key.status === "suspended" ? "bg-amber-400" : "bg-gray-400"
                            }`} />
                            {key.status}
                          </span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Created</p>
                          <p className="font-mono text-of-on-surface">
                            {new Date(key.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {key.last_used && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Last Used</p>
                            <p className="font-mono text-of-on-surface">
                              {new Date(key.last_used).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                        {key.metadata && Object.keys(key.metadata).length > 0 && (
                          <div className="col-span-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">Metadata</p>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(key.metadata).map(([k, v]) => (
                                <span key={k} className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-of-surface-container-high text-of-on-surface-variant border border-of-outline-variant/10">
                                  {k}: {String(v)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TenantDetailPage() {
  return (
      <TenantDetailContent />
  );
}
