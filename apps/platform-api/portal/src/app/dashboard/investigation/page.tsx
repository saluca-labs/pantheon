"use client";

import { useState } from "react";
import { Search, Eye, Lock, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

interface HashResult {
  record_id: string;
  request_hash: string | null;
  response_hash: string | null;
  model: string | null;
  created_at: string;
}

interface ContextResult extends HashResult {
  provider: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  session_id: string | null;
}

function InvestigationContent() {
  const [tenantId, setTenantId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [level, setLevel] = useState<"hashes" | "context">("hashes");
  const [results, setResults] = useState<(HashResult | ContextResult)[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    if (!tenantId || !startTime || !endTime) return;
    setSearching(true);
    setError("");
    try {
      const endpoint = level === "hashes" ? "/api/investigation/evidence/hashes" : "/api/investigation/evidence/context";
      const res = await api.post<(HashResult | ContextResult)[]>(endpoint, {
        tenant_id: tenantId,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        limit: 100,
      });
      setResults(Array.isArray(res) ? res : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
    setSearching(false);
  };

  return (
    <div className="max-w-7xl space-y-6">
      {/* Search Form */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Search className="h-4 w-4 text-of-primary" />
          <h3 className="text-sm font-bold text-of-on-surface">Evidence Query</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Tenant ID</label>
            <input type="text" placeholder="UUID" value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Start Time</label>
            <input type="datetime-local" value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface focus:outline-none focus:border-of-primary/40 transition-colors" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">End Time</label>
            <input type="datetime-local" value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface focus:outline-none focus:border-of-primary/40 transition-colors" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Access Level</label>
            <div className="flex gap-2">
              {(["hashes", "context"] as const).map((l) => (
                <button key={l} onClick={() => setLevel(l)}
                  className={`px-3 h-9 rounded-lg text-[11px] font-bold uppercase transition-colors flex items-center gap-1.5 ${
                    level === l ? "bg-of-primary/20 text-of-primary border border-of-primary/30" : "bg-of-surface-container-high text-of-on-surface-variant border border-of-outline-variant/20 hover:text-of-on-surface"
                  }`}>
                  {l === "hashes" ? <Lock className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  L{l === "hashes" ? "0" : "1"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={search} disabled={searching || !tenantId || !startTime || !endTime}
            className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {searching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Search Evidence
          </button>
          {error && <span className="text-xs text-of-error">{error}</span>}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
            {results.length} Records Found
          </p>
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
            <div className="grid grid-cols-[1fr_180px_180px_100px_140px] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
              {["Record ID", "Request Hash", "Response Hash", "Model", "Created"].map((h) => (
                <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{h}</span>
              ))}
            </div>
            {results.map((r) => (
              <div key={r.record_id} className="grid grid-cols-[1fr_180px_180px_100px_140px] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center">
                <span className="text-xs font-mono text-of-on-surface truncate">{r.record_id}</span>
                <span className="text-xs font-mono text-of-on-surface-variant truncate">{r.request_hash?.slice(0, 16) || "—"}...</span>
                <span className="text-xs font-mono text-of-on-surface-variant truncate">{r.response_hash?.slice(0, 16) || "—"}...</span>
                <span className="text-xs text-of-on-surface">{r.model || "—"}</span>
                <span className="text-xs text-of-on-surface-variant">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvestigationPage() {
  return (
      <InvestigationContent />
  );
}
