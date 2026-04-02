"use client";

import { useState } from "react";
import { TierGate } from "@/components/dashboard/TierGate";
import { Tag, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

function PromoContent() {
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
    } catch (err: unknown) {
      setResult({ error: err instanceof Error ? err.message : "Failed to create promo code" });
    }
    setCreating(false);
  };

  return (
    <div className="max-w-7xl space-y-6">
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Plus className="h-4 w-4 text-of-primary" />
          <h3 className="text-sm font-bold text-of-on-surface">Create Promo Code</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">Code</label>
            <input type="text" placeholder="ACME-SEC-20" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors" />
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
    </div>
  );
}

export default function PromosPage() {
  return (
    <TierGate requiredTier="mssp" featureLabel="Promo Code Management">
      <PromoContent />
    </TierGate>
  );
}
