"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { ShieldAlert, ShieldCheck, ChevronDown, ChevronRight, X, Plus } from "lucide-react";

/** Quarantine management -- view, release, and add agent quarantine entries. Uses live API via useWidgetData. */

interface QuarantineEntry {
  soulkey_id: string;
  status: "active" | "released";
  triggered_by: string;
  triggered_by_type?: string;
  actions: string[];
  reason: string;
  quarantined_at: string;
  released_at?: string;
  auto_release_after?: string;
  flagged_prompt?: string | null;
  flagged_completion?: string | null;
}

interface QuarantineListData {
  quarantined?: QuarantineEntry[];
  items?: QuarantineEntry[];
}

interface QuarantineHistoryData {
  history?: QuarantineEntry[];
}

export default function QuarantinePage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "released">("");
  const [showQuarantineModal, setShowQuarantineModal] = useState(false);
  const [modalSoulkeyId, setModalSoulkeyId] = useState("");
  const [modalReason, setModalReason] = useState("");
  const [modalActions, setModalActions] = useState<string[]>(["rate_limit"]);
  const [modalAutoRelease, setModalAutoRelease] = useState("");
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const queryParams = statusFilter ? `?status=${statusFilter}&limit=100` : "?limit=100";
  const { data, loading, error, refetch } = useWidgetData<QuarantineListData>({
    endpoint: `/v1/enforcement/quarantine${queryParams}`,
    refreshInterval: 30000,
  });

  const { data: historyData, loading: historyLoading } = useWidgetData<QuarantineHistoryData>({
    endpoint: expandedId ? `/v1/enforcement/quarantine/${expandedId}` : "",
    skip: !expandedId,
  });

  // Normalize API response — handle both { quarantined: [] } and direct array shapes
  const entries: QuarantineEntry[] =
    data?.quarantined ??
    data?.items ??
    (Array.isArray(data) ? (data as QuarantineEntry[]) : []);

  async function handleRelease(soulkeyId: string) {
    setSubmitting(true);
    setActionResult(null);
    try {
      const { api } = await import("@/lib/api");
      await api.post(`/v1/enforcement/quarantine/${soulkeyId}/release`, {
        released_by: "analyst",
      });
      setActionResult({
        type: "success",
        message: `Soulkey ${soulkeyId.slice(0, 12)}… released successfully.`,
      });
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionResult({ type: "error", message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuarantine() {
    if (!modalSoulkeyId.trim() || !modalReason.trim()) return;
    setSubmitting(true);
    setActionResult(null);
    try {
      const { api } = await import("@/lib/api");
      await api.post(`/v1/enforcement/quarantine/${modalSoulkeyId.trim()}`, {
        actions: modalActions,
        reason: modalReason.trim(),
        ...(modalAutoRelease && { auto_release_after: modalAutoRelease }),
      });
      setActionResult({
        type: "success",
        message: `Soulkey ${modalSoulkeyId.slice(0, 12)}… quarantined successfully.`,
      });
      setShowQuarantineModal(false);
      setModalSoulkeyId("");
      setModalReason("");
      setModalActions(["rate_limit"]);
      setModalAutoRelease("");
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionResult({ type: "error", message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6">

      {/* Action result toast */}
      {actionResult && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border ${
            actionResult.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-of-error/10 border-of-error/20 text-of-error"
          }`}
        >
          <span className="text-sm font-medium">{actionResult.message}</span>
          <button
            onClick={() => setActionResult(null)}
            className="ml-4 hover:opacity-70 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["", "active", "released"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 h-7 rounded-full text-[11px] font-bold uppercase transition-colors ${
                statusFilter === s
                  ? "bg-of-primary/20 text-of-primary"
                  : "text-of-on-surface-variant hover:text-of-on-surface"
              }`}
            >
              {s === "" ? "All" : s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowQuarantineModal(true)}
          className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-of-error/15 text-of-error border border-of-error/20 hover:bg-of-error/25 transition-colors text-xs font-bold"
        >
          <Plus className="h-3.5 w-3.5" />
          Quarantine Agent
        </button>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="p-4 rounded-xl bg-of-error/10 border border-of-error/20 text-of-error text-sm">
          Failed to load quarantine data: {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5"
            />
          ))}
        </div>
      )}

      {/* Quarantine list table (QUAR-01) */}
      {!loading && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_120px_160px_160px_160px_auto] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
            {["Soulkey ID", "Status", "Triggered By", "Actions Taken", "Quarantined At", ""].map(
              (h, i) => (
                <span
                  key={i}
                  className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant"
                >
                  {h}
                </span>
              )
            )}
          </div>

          {entries.length === 0 && (
            <div className="flex items-center justify-center py-16 text-of-on-surface-variant">
              <p className="text-sm">
                No quarantined agents{statusFilter ? ` with status "${statusFilter}"` : ""}
              </p>
            </div>
          )}

          {entries.map((entry) => (
            <div key={entry.soulkey_id}>
              {/* Main row */}
              <div className="grid grid-cols-[1fr_120px_160px_160px_160px_auto] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center">
                {/* Soulkey ID with expand toggle */}
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === entry.soulkey_id ? null : entry.soulkey_id)
                    }
                    className="text-of-on-surface-variant hover:text-of-on-surface transition-colors shrink-0"
                  >
                    {expandedId === entry.soulkey_id ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span className="font-mono text-xs text-of-on-surface truncate">
                    {entry.soulkey_id}
                  </span>
                </div>

                {/* Status badge (QUAR-01) */}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                    entry.status === "active"
                      ? "bg-of-error/15 text-of-error border border-of-error/20"
                      : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {entry.status}
                </span>

                {/* Triggered by */}
                <span
                  className="text-xs text-of-on-surface-variant truncate"
                  title={entry.triggered_by}
                >
                  {entry.triggered_by}
                </span>

                {/* Actions taken */}
                <div className="flex flex-wrap gap-1">
                  {(entry.actions ?? []).map((a) => (
                    <span
                      key={a}
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/10 text-warning border border-warning/20"
                    >
                      {a}
                    </span>
                  ))}
                </div>

                {/* Timestamp */}
                <span className="font-mono text-[11px] text-of-on-surface-variant">
                  {entry.quarantined_at ? new Date(entry.quarantined_at).toLocaleString() : "—"}
                </span>

                {/* Action buttons */}
                <div className="flex items-center gap-2 justify-end">
                  {entry.status === "active" && (
                    <button
                      onClick={() => handleRelease(entry.soulkey_id)}
                      disabled={submitting}
                      className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      Release
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === entry.soulkey_id ? null : entry.soulkey_id)
                    }
                    className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface hover:border-of-outline-variant/40 transition-colors"
                  >
                    View
                  </button>
                </div>
              </div>

              {/* Expanded detail panel (QUAR-02) */}
              {expandedId === entry.soulkey_id && (
                <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-5 py-4">
                  {/* Quarantine reason */}
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-of-primary mb-1.5">
                      Reason
                    </p>
                    <p className="text-sm text-of-on-surface bg-of-surface-container rounded-lg px-3 py-2 border border-of-outline-variant/5">
                      {entry.reason}
                    </p>
                  </div>

                  {/* Auto-release info */}
                  {entry.auto_release_after && (
                    <div className="mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-warning mb-1.5">
                        Auto-Release After
                      </p>
                      <p className="text-xs font-mono text-of-on-surface-variant">
                        {entry.auto_release_after}
                      </p>
                    </div>
                  )}

                  {/* Released at info */}
                  {entry.released_at && (
                    <div className="mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
                        Released At
                      </p>
                      <p className="text-xs font-mono text-emerald-400">
                        {new Date(entry.released_at).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {/* Flagged prompt (GAP-01) */}
                  {entry.flagged_prompt != null ? (
                    <div className="mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-of-error mb-1.5">
                        Flagged Prompt
                      </p>
                      <pre className="text-xs font-mono text-of-on-surface bg-of-surface-container rounded-lg px-3 py-2 border border-of-error/20 whitespace-pre-wrap break-all overflow-auto max-h-48">
                        {entry.flagged_prompt}
                      </pre>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                        Flagged Prompt
                      </p>
                      <p className="text-xs text-of-on-surface-variant italic">Not available</p>
                    </div>
                  )}

                  {/* Flagged completion (GAP-01) */}
                  {entry.flagged_completion != null ? (
                    <div className="mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-of-error mb-1.5">
                        Flagged Completion
                      </p>
                      <pre className="text-xs font-mono text-of-on-surface bg-of-surface-container rounded-lg px-3 py-2 border border-of-error/20 whitespace-pre-wrap break-all overflow-auto max-h-48">
                        {entry.flagged_completion}
                      </pre>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                        Flagged Completion
                      </p>
                      <p className="text-xs text-of-on-surface-variant italic">Not available</p>
                    </div>
                  )}

                  {/* History from /v1/enforcement/quarantine/{id} */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">
                      Quarantine History
                    </p>
                    {historyLoading && (
                      <div className="h-20 rounded-lg bg-of-surface-container animate-pulse" />
                    )}
                    {!historyLoading && historyData?.history && historyData.history.length > 0 && (
                      <div className="space-y-2">
                        {historyData.history.map((h, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-4 text-xs py-2 border-b border-of-outline-variant/5 last:border-0"
                          >
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                h.status === "active"
                                  ? "bg-of-error/15 text-of-error border border-of-error/20"
                                  : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                              }`}
                            >
                              {h.status}
                            </span>
                            <span className="font-mono text-[11px] text-of-on-surface-variant">
                              {h.quarantined_at
                                ? new Date(h.quarantined_at).toLocaleString()
                                : "—"}
                            </span>
                            {h.released_at && (
                              <span className="font-mono text-[11px] text-emerald-400">
                                Released: {new Date(h.released_at).toLocaleString()}
                              </span>
                            )}
                            <span className="text-of-on-surface-variant truncate">
                              {h.triggered_by}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!historyLoading && (!historyData?.history || historyData.history.length === 0) && (
                      <p className="text-xs text-of-on-surface-variant py-2">
                        No additional history
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quarantine Action Modal (QUAR-03) */}
      {showQuarantineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-of-surface-container rounded-2xl border border-of-outline-variant/20 p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-of-error" />
                <h2 className="text-base font-bold text-of-on-surface">Quarantine Agent</h2>
              </div>
              <button
                onClick={() => setShowQuarantineModal(false)}
                className="text-of-on-surface-variant hover:text-of-on-surface transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Soulkey ID input */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                  Soulkey ID
                </label>
                <input
                  value={modalSoulkeyId}
                  onChange={(e) => setModalSoulkeyId(e.target.value)}
                  placeholder="sk_..."
                  className="w-full h-9 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-sm font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
                />
              </div>

              {/* Reason input */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                  Reason
                </label>
                <textarea
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="Describe why this agent is being quarantined..."
                  rows={3}
                  className="w-full px-3 py-2 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 resize-none"
                />
              </div>

              {/* Actions checkboxes */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">
                  Actions
                </label>
                <div className="flex flex-wrap gap-2">
                  {["rate_limit", "block", "alert"].map((action) => (
                    <label key={action} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modalActions.includes(action)}
                        onChange={(e) =>
                          setModalActions((prev) =>
                            e.target.checked
                              ? [...prev, action]
                              : prev.filter((a) => a !== action)
                          )
                        }
                        className="accent-of-primary"
                      />
                      <span className="text-xs font-bold uppercase text-of-on-surface-variant">
                        {action}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Auto-release input (optional) */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                  Auto-Release After{" "}
                  <span className="normal-case font-normal">(optional, e.g. &ldquo;2h&rdquo;)</span>
                </label>
                <input
                  value={modalAutoRelease}
                  onChange={(e) => setModalAutoRelease(e.target.value)}
                  placeholder="e.g. 1h, 24h, 7d"
                  className="w-full h-9 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
                />
              </div>
            </div>

            {/* Modal action result */}
            {actionResult?.type === "error" && (
              <div className="mt-4 p-3 rounded-lg bg-of-error/10 border border-of-error/20 text-of-error text-sm">
                {actionResult.message}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowQuarantineModal(false)}
                className="px-4 h-9 rounded-lg text-sm font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleQuarantine}
                disabled={submitting || !modalSoulkeyId.trim() || !modalReason.trim()}
                className="px-4 h-9 rounded-lg text-sm font-bold bg-of-error/20 text-of-error border border-of-error/20 hover:bg-of-error/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {submitting ? "Quarantining…" : "Quarantine"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
