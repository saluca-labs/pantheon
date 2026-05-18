"use client";

import { useState } from "react";
import { Tag, Plus, RefreshCw, CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { useWidgetData } from "@/lib/useWidgetData";

interface PromoCode {
  promo_code_id: string;
  code: string;
  coupon_id: string | null;
  percent_off: number | null;
  active: boolean;
  times_redeemed: number;
  max_redemptions: number | null;
}

function PromoContent() {
  const { data: promos, loading, refetch } = useWidgetData<PromoCode[]>({
    endpoint: "/api/partner/promo/list",
    refreshInterval: 30000,
  });
  const [form, setForm] = useState({ code: "", discount_percent: 20, duration_months: 12, max_redemptions: "" });
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ code?: string; error?: string } | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        code: form.code,
        discount_percent: form.discount_percent,
        duration_months: form.duration_months,
      };
      if (form.max_redemptions) body.max_redemptions = parseInt(form.max_redemptions);
      const res = await api.post<{ code: string }>("/api/partner/promo/create", body);
      setResult({ code: res.code });
      setForm({ code: "", discount_percent: 20, duration_months: 12, max_redemptions: "" });
      // Refresh the list after creation
      setTimeout(() => refetch(), 500);
    } catch (err: unknown) {
      setResult({ error: err instanceof Error ? err.message : "Failed to create promo code" });
    }
    setCreating(false);
  };

  return (
    <div className="max-w-7xl space-y-6">
      {/* Create Promo Form */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Plus className="h-4 w-4 text-of-primary" />
          <h3 className="text-sm font-bold text-of-on-surface">Create Promo Code</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Code</label>
            <input type="text" placeholder="ACME-SEC-20" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Discount %</label>
            <input type="number" min="1" max="99" value={form.discount_percent}
              onChange={(e) => setForm({ ...form, discount_percent: parseInt(e.target.value) || 0 })}
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface focus:outline-none focus:border-of-primary/40 transition-colors" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Duration (months)</label>
            <input type="number" min="1" max="60" value={form.duration_months}
              onChange={(e) => setForm({ ...form, duration_months: parseInt(e.target.value) || 12 })}
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface focus:outline-none focus:border-of-primary/40 transition-colors" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Max Redemptions</label>
            <input type="number" min="1" placeholder="Unlimited" value={form.max_redemptions}
              onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })}
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleCreate} disabled={creating || !form.code}
            className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {creating && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            <Tag className="h-3.5 w-3.5" />
            Create Code
          </button>
          {result?.code && <span className="text-xs text-green-400">Created: <code className="font-mono">{result.code}</code></span>}
          {result?.error && <span className="text-xs text-of-error">{result.error}</span>}
        </div>
      </div>

      {/* Existing Promo Codes */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">Your Promo Codes</p>
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_100px_100px_120px_100px] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
            {["Code", "Discount", "Redeemed", "Max Uses", "Status"].map((h) => (
              <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{h}</span>
            ))}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="px-5 py-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded bg-of-surface-container-high animate-pulse mb-2" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && (!promos || promos.length === 0) && (
            <div className="px-5 py-12 text-center">
              <BarChart3 className="h-5 w-5 text-of-on-surface-variant/30 mx-auto mb-2" />
              <p className="text-sm text-of-on-surface-variant">No promo codes yet</p>
              <p className="text-xs text-of-on-surface-variant/60 mt-1">Create your first promo code above to start tracking redemptions</p>
            </div>
          )}

          {/* Rows */}
          {!loading && promos && promos.length > 0 && (
            (Array.isArray(promos) ? promos : []).map((promo) => (
              <div key={promo.promo_code_id} className="grid grid-cols-[1fr_100px_100px_120px_100px] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center">
                <span className="text-sm text-of-on-surface font-mono font-medium">{promo.code}</span>
                <span className="text-sm text-of-on-surface">
                  {promo.percent_off != null ? `${promo.percent_off}%` : "\u2014"}
                </span>
                <span className="text-sm text-of-on-surface">
                  {promo.times_redeemed}
                  {promo.max_redemptions != null && (
                    <span className="text-of-on-surface-variant">/{promo.max_redemptions}</span>
                  )}
                </span>
                <span className="text-sm text-of-on-surface-variant">
                  {promo.max_redemptions != null ? promo.max_redemptions : "Unlimited"}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                  promo.active
                    ? "bg-green-500/15 text-green-400 border border-green-500/20"
                    : "bg-of-error/20 text-of-error border border-of-error/20"
                }`}>
                  {promo.active ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                  {promo.active ? "Active" : "Inactive"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function PromosPage() {
  return (
      <PromoContent />
  );
}
