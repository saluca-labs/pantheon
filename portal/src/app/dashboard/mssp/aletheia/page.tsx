"use client";

import { useState, useMemo } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { Link2, Users, Clock } from "lucide-react";

interface CrossTenantCoTEntry {
  id: string;
  chain_id: string;
  entry_index: number;
  request_id: string;
  tenant_id: string;
  tenant_name: string | null;
  timestamp: string;
  model: string;
  provider: string;
  agent_id: string | null;
  cot_hash: string;
  cot_token_count: number;
  entry_hash: string;
  content_stored: boolean;
}

interface CrossTenantCoTResponse {
  entries: CrossTenantCoTEntry[];
  total: number;
  tenant_count: number;
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TENANT_COLORS = [
  "bg-of-primary/5",
  "bg-purple-500/5",
  "bg-amber-500/5",
  "bg-emerald-500/5",
  "bg-rose-500/5",
  "bg-cyan-500/5",
  "bg-indigo-500/5",
  "bg-orange-500/5",
];

function MsspAletheiaContent() {
  const [tenantFilter, setTenantFilter] = useState<string>("all");

  const { data, loading, error } = useWidgetData<CrossTenantCoTResponse>({
    endpoint: "/v1/mssp/aletheia/cot?limit=50",
    refreshInterval: 30000,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const tenantCount = data?.tenant_count ?? 0;

  const tenantOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (!seen.has(e.tenant_id)) {
        seen.set(e.tenant_id, e.tenant_name ?? e.tenant_id.slice(0, 8));
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [entries]);

  const tenantColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueIds = [...new Set(entries.map((e) => e.tenant_id))];
    uniqueIds.forEach((id, i) => {
      map.set(id, TENANT_COLORS[i % TENANT_COLORS.length]);
    });
    return map;
  }, [entries]);

  const filteredEntries = tenantFilter === "all"
    ? entries
    : entries.filter((e) => e.tenant_id === tenantFilter);

  const latestTimestamp = entries.length > 0 ? entries[0].timestamp : null;

  const distribution = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const e of entries) {
      const existing = counts.get(e.tenant_id);
      if (existing) {
        existing.count++;
      } else {
        counts.set(e.tenant_id, { name: e.tenant_name ?? e.tenant_id.slice(0, 8), count: 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [entries]);

  const maxCount = distribution.length > 0 ? distribution[0].count : 1;

  return (
    <div className="max-w-7xl space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-of-primary/10">
            <Link2 className="h-5 w-5 text-of-primary" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Total CoT Entries</p>
            <p className="text-2xl font-black tabular-nums text-of-on-surface mt-0.5">
              {loading ? <span className="inline-block w-10 h-6 bg-of-surface-container-high rounded animate-pulse" /> : total}
            </p>
          </div>
        </div>
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-500/10">
            <Users className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Active Tenants</p>
            <p className="text-2xl font-black tabular-nums text-of-on-surface mt-0.5">
              {loading ? <span className="inline-block w-10 h-6 bg-of-surface-container-high rounded animate-pulse" /> : tenantCount}
            </p>
          </div>
        </div>
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10">
            <Clock className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Latest Entry</p>
            <p className="text-lg font-bold text-of-on-surface mt-0.5">
              {loading ? <span className="inline-block w-16 h-5 bg-of-surface-container-high rounded animate-pulse" /> : latestTimestamp ? relativeTime(latestTimestamp) : "None"}
            </p>
          </div>
        </div>
      </div>

      {/* Cross-Tenant CoT Table */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-of-outline-variant/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
            Cross-Tenant CoT Entries
          </p>
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/10 rounded-lg text-xs text-of-on-surface focus:outline-none focus:border-of-primary/40"
          >
            <option value="all">All Tenants</option>
            {tenantOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[140px_1fr_120px_100px_80px_100px] gap-4 px-5 py-2.5 border-b border-of-outline-variant/10">
          {["Tenant", "Request ID", "Model", "Provider", "Tokens", "Time"].map((h) => (
            <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{h}</span>
          ))}
        </div>

        {loading && (
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 border-b border-of-outline-variant/5 animate-pulse bg-of-surface-container-high/30" />
            ))}
          </div>
        )}

        {!loading && filteredEntries.length === 0 && (
          <div className="flex items-center justify-center py-12 text-of-on-surface-variant">
            <p className="text-sm">No CoT entries found across child tenants.</p>
          </div>
        )}

        {!loading && filteredEntries.map((entry) => (
          <div
            key={entry.id}
            className={`grid grid-cols-[140px_1fr_120px_100px_80px_100px] gap-4 px-5 py-3 border-b border-of-outline-variant/5 items-center ${tenantColorMap.get(entry.tenant_id) ?? ""}`}
            title={`Tenant: ${entry.tenant_id}`}
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-of-on-surface truncate">{entry.tenant_name ?? "Unknown"}</p>
            </div>
            <p className="font-mono text-xs text-of-on-surface-variant truncate">{entry.request_id}</p>
            <p className="text-xs text-of-on-surface truncate">{entry.model}</p>
            <p className="text-xs text-of-on-surface-variant">{entry.provider}</p>
            <p className="text-xs font-mono tabular-nums text-of-on-surface">{entry.cot_token_count}</p>
            <p className="text-[10px] text-of-on-surface-variant">{relativeTime(entry.timestamp)}</p>
          </div>
        ))}
      </div>

      {/* Tenant Distribution */}
      {distribution.length > 0 && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-4">
            Tenant Distribution
          </p>
          <div className="space-y-2.5">
            {distribution.map((d) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="text-xs font-medium text-of-on-surface w-32 truncate">{d.name}</span>
                <div className="flex-1 h-5 bg-of-surface-container-high rounded-full overflow-hidden">
                  <div
                    className="h-full bg-of-primary/40 rounded-full transition-all duration-500"
                    style={{ width: `${(d.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono tabular-nums text-of-on-surface-variant w-10 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-of-error/10 border border-of-error/20 rounded-xl p-4">
          <p className="text-xs text-of-error">{error}</p>
        </div>
      )}
    </div>
  );
}

export default function MsspAletheiaAuditPage() {
  return (
    <TierGate requiredTier="mssp" featureLabel="MSSP Aletheia Audit">
      <MsspAletheiaContent />
    </TierGate>
  );
}
