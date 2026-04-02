"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { api } from "@/lib/api";
import { Download, CheckCircle, XCircle, ChevronDown, ChevronRight, Link2 } from "lucide-react";

/** CoT audit log -- detailed chain-of-thought inspection with export. Uses live API via useWidgetData. */

interface ChainEntry {
  request_id: string;
  model: string;
  provider: string;
  cot_token_count: number;
  timestamp: string;
  chain_hash: string;
  prev_hash?: string;
}

interface ChainData {
  entries?: ChainEntry[];
  total?: number;
}

interface VerifyResult {
  valid: boolean;
  broken_at?: number;
  checked_entries?: number;
}

interface ContentData {
  content?: string;
  encrypted?: boolean;
}

function Skeleton() {
  return <span className="inline-block w-16 h-5 bg-of-surface-container-high rounded animate-pulse" />;
}

export default function CoTAuditPage() {
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [proofLoading, setProofLoading] = useState(false);

  const { data: chainData, loading, error } = useWidgetData<ChainData>({
    endpoint: "/api/watch/v1/aletheia/cot/chain?limit=50",
    refreshInterval: 30000,
  });

  const { data: contentData, loading: contentLoading } = useWidgetData<ContentData>({
    endpoint: expandedRequestId ? `/api/watch/v1/aletheia/cot/chain/${expandedRequestId}/content` : "",
    skip: !expandedRequestId,
  });

  const entries: ChainEntry[] = chainData?.entries ?? (Array.isArray(chainData) ? (chainData as ChainEntry[]) : []);

  async function handleVerify() {
    setVerifyLoading(true);
    try {
      const result = await api.post("/api/watch/v1/aletheia/cot/chain/verify", { start_index: 0, end_index: -1 });
      setVerifyResult(result as VerifyResult);
    } catch {
      setVerifyResult({ valid: false, broken_at: -1 });
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleExportProof() {
    setProofLoading(true);
    try {
      const data = await api.post("/api/watch/v1/aletheia/cot/chain/proof", { format: "json" });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cot-proof-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent fail on export
    } finally {
      setProofLoading(false);
    }
  }

  return (
    <TierGate requiredTier="enterprise" featureLabel="Aletheia CoT Audit">
      <div className="max-w-7xl space-y-6">
        {/* Actions bar */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleVerify}
            disabled={verifyLoading}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 transition-colors text-xs font-bold disabled:opacity-40"
          >
            <Link2 className="h-3.5 w-3.5" />
            {verifyLoading ? "Verifying..." : "Verify Chain"}
          </button>
          <button
            onClick={handleExportProof}
            disabled={proofLoading}
            className="flex items-center gap-2 h-9 px-4 rounded-lg border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface hover:border-of-outline-variant/40 transition-colors text-xs font-bold disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            {proofLoading ? "Exporting..." : "Export Proof"}
          </button>

          {verifyResult && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
              verifyResult.valid
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-of-error/10 text-of-error border border-of-error/20"
            }`}>
              {verifyResult.valid ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Chain Valid ({verifyResult.checked_entries ?? 0} entries)
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5" />
                  Broken at entry {verifyResult.broken_at ?? "unknown"}
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-of-error text-xs">{error}</p>}

        {/* Loading */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && entries.length === 0 && (
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 flex flex-col items-center justify-center py-16 text-of-on-surface-variant gap-3">
            <Link2 className="h-8 w-8 opacity-30" />
            <p className="text-sm">No chain entries recorded yet</p>
          </div>
        )}

        {/* Chain entries table */}
        {!loading && entries.length > 0 && (
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_120px_100px_160px_auto] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
              {["Request ID", "Model", "Provider", "Tokens", "Timestamp", ""].map((h, i) => (
                <span key={i} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{h}</span>
              ))}
            </div>

            {entries.map((entry) => (
              <div key={entry.request_id}>
                <div
                  className="grid grid-cols-[1fr_120px_120px_100px_160px_auto] gap-4 px-5 py-3.5 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center cursor-pointer"
                  onClick={() => setExpandedRequestId(expandedRequestId === entry.request_id ? null : entry.request_id)}
                >
                  <span className="font-mono text-xs text-of-on-surface truncate" title={entry.request_id}>
                    {entry.request_id.slice(0, 12)}...
                  </span>
                  <span className="text-xs text-of-on-surface">{entry.model}</span>
                  <span className="text-xs text-of-on-surface-variant">{entry.provider}</span>
                  <span className="text-xs font-mono text-of-on-surface tabular-nums">{entry.cot_token_count}</span>
                  <span className="font-mono text-[11px] text-of-on-surface-variant">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  <button className="text-of-on-surface-variant hover:text-of-on-surface transition-colors justify-self-end">
                    {expandedRequestId === entry.request_id ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {/* Expanded content */}
                {expandedRequestId === entry.request_id && (
                  <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-5 py-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">Chain Hash</p>
                        <p className="font-mono text-xs text-of-on-surface break-all">{entry.chain_hash}</p>
                      </div>
                      {entry.prev_hash && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">Previous Hash</p>
                          <p className="font-mono text-xs text-of-on-surface break-all">{entry.prev_hash}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">Content</p>
                      <p className="text-of-on-surface-variant text-[10px] mb-2">Content access requires audit role</p>
                      {contentLoading && (
                        <div className="h-24 rounded-lg bg-of-surface-container-high animate-pulse" />
                      )}
                      {!contentLoading && contentData?.content && (
                        <pre className="bg-of-surface-container-high rounded-lg p-4 font-mono text-xs overflow-x-auto text-of-on-surface max-h-64">
                          {contentData.content}
                        </pre>
                      )}
                      {!contentLoading && !contentData?.content && (
                        <p className="text-xs text-of-on-surface-variant bg-of-surface-container-high rounded-lg p-4">
                          Chain-of-thought content is encrypted at rest. Decryption requires tenant DEK provisioning.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </TierGate>
  );
}
