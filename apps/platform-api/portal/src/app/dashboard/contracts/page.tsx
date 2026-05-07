"use client";

import { useState } from "react";
import { TierGate } from "@/components/dashboard/TierGate";
import { FileText, Upload, CheckCircle2, AlertTriangle, Shield, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useWidgetData } from "@/lib/useWidgetData";

interface ContractVersion {
  contract_id: string;
  version: number;
  status: string;
  content_hash: string;
  prev_hash: string | null;
  review_status: string | null;
  review_risk_score: number | null;
  flagged_clauses: Array<{ clause: string; status: string; description: string; risk: number }> | null;
  submitted_by: string;
  created_at: string | null;
}

interface ChainVerify {
  valid: boolean;
  versions_checked: number;
  errors: Array<{ version: number; error?: string }>;
}

function ContractsContent() {
  const [contractType, setContractType] = useState("msa");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<ContractVersion | null>(null);
  const [submitError, setSubmitError] = useState("");

  const { data: chainStatus } = useWidgetData<ChainVerify>({
    endpoint: `/api/contracts/chain/verify?contract_type=${contractType}`,
    refreshInterval: 60000,
  });

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setSubmitError("");
    setSubmitResult(null);
    try {
      const res = await api.post<ContractVersion>("/api/contracts/submit", {
        contract_type: contractType,
        content: content,
      });
      setSubmitResult(res);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    }
    setSubmitting(false);
  };

  const riskColor = (score: number | null) => {
    if (!score) return "text-green-400";
    if (score >= 0.7) return "text-of-error";
    if (score >= 0.3) return "text-warning";
    return "text-green-400";
  };

  return (
    <div className="max-w-7xl space-y-6">
      {/* Chain Integrity */}
      {chainStatus && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          chainStatus.valid
            ? "bg-green-500/10 border-green-500/20"
            : "bg-of-error/10 border-of-error/20"
        }`}>
          {chainStatus.valid ? (
            <CheckCircle2 className="h-5 w-5 text-green-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-of-error" />
          )}
          <div>
            <p className={`text-sm font-bold ${chainStatus.valid ? "text-green-400" : "text-of-error"}`}>
              Contract Chain: {chainStatus.valid ? "Verified" : "Integrity Error"}
            </p>
            <p className="text-xs text-of-on-surface-variant">{chainStatus.versions_checked} version(s) checked</p>
          </div>
        </div>
      )}

      {/* Submit Contract */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Upload className="h-4 w-4 text-of-primary" />
          <h3 className="text-sm font-bold text-of-on-surface">Submit Contract for Review</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Contract Type</label>
            <div className="flex gap-2">
              {["msa", "nda", "sla"].map((t) => (
                <button key={t} onClick={() => setContractType(t)}
                  className={`px-3 h-8 rounded-lg text-[11px] font-bold uppercase transition-colors ${
                    contractType === t
                      ? "bg-of-primary/20 text-of-primary border border-of-primary/30"
                      : "bg-of-surface-container-high text-of-on-surface-variant border border-of-outline-variant/20 hover:text-of-on-surface"
                  }`}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Contract Content</label>
            <textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your proposed contract text here..."
              className="w-full px-4 py-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors resize-y font-mono" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSubmit} disabled={submitting || !content.trim()}
              className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
              {submitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Submit for Review
            </button>
            {submitError && <span className="text-xs text-of-error">{submitError}</span>}
          </div>
        </div>
      </div>

      {/* Review Result */}
      {submitResult && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-of-primary" />
            <h3 className="text-sm font-bold text-of-on-surface">Review Result</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Version</p>
              <p className="text-lg font-bold text-of-on-surface">v{submitResult.version}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Status</p>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                submitResult.review_status === "auto_accept" ? "bg-green-500/15 text-green-400" :
                submitResult.review_status === "auto_reject" ? "bg-of-error/20 text-of-error" :
                "bg-warning/15 text-warning"
              }`}>{submitResult.review_status}</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Risk Score</p>
              <p className={`text-lg font-bold ${riskColor(submitResult.review_risk_score)}`}>
                {submitResult.review_risk_score?.toFixed(2) || "0.00"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Content Hash</p>
              <code className="text-xs font-mono text-of-on-surface-variant">{submitResult.content_hash.slice(0, 16)}...</code>
            </div>
          </div>

          {submitResult.flagged_clauses && submitResult.flagged_clauses.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">Flagged Clauses</p>
              <div className="space-y-2">
                {submitResult.flagged_clauses.map((fc, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/10">
                    <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${
                      fc.status === "auto_reject" ? "text-of-error" : "text-warning"
                    }`} />
                    <div>
                      <p className="text-xs font-bold text-of-on-surface">{fc.description}</p>
                      <p className="text-[10px] text-of-on-surface-variant">Risk: {fc.risk.toFixed(2)} — {fc.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ContractsPage() {
  return (
    <TierGate requiredTier="enterprise" featureLabel="Contract Management">
      <ContractsContent />
    </TierGate>
  );
}
