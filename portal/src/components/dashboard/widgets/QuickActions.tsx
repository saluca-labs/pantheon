"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";

interface ActionDef {
  label: string;
  endpoint?: string;
  method?: "POST" | "GET";
  href?: string;
  icon: React.ReactNode;
}

const actions: ActionDef[] = [
  {
    label: "Issue New Soulkey",
    endpoint: "/v1/soulauth/admin/soulkeys",
    method: "POST",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    label: "Sync Policies",
    endpoint: "/v1/soulauth/admin/policies/sync",
    method: "POST",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
      </svg>
    ),
  },
  {
    label: "View Audit Log",
    href: "/dashboard/audit",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    ),
  },
  {
    label: "Manage Quarantine",
    href: "/dashboard/quarantine",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    label: "Export Report",
    endpoint: "/v1/soulauth/admin/audit/export",
    method: "GET",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
  {
    label: "API Documentation",
    href: "/developers",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
];

export default function QuickActions() {
  const [executing, setExecuting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ label: string; ok: boolean } | null>(null);

  const handleAction = useCallback(async (action: ActionDef) => {
    if (action.href) {
      window.location.href = action.href;
      return;
    }
    if (!action.endpoint) return;

    setExecuting(action.label);
    setFeedback(null);

    try {
      if (action.method === "POST") {
        await api.post(action.endpoint);
      } else {
        await api.get(action.endpoint);
      }
      setFeedback({ label: action.label, ok: true });
    } catch {
      setFeedback({ label: action.label, ok: false });
    } finally {
      setExecuting(null);
      setTimeout(() => setFeedback(null), 3000);
    }
  }, []);

  return (
    <div className="glass-card glow-gold rounded-xl p-4 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-gold-400 uppercase tracking-wider mb-3">Quick Actions</h3>

      {/* Feedback toast */}
      {feedback && (
        <div className={`mb-2 px-3 py-1.5 rounded-lg text-xs ${
          feedback.ok
            ? "bg-green-500/10 border border-green-500/20 text-green-400"
            : "bg-red-500/10 border border-red-500/20 text-red-400"
        }`}>
          {feedback.ok ? `${feedback.label} completed` : `${feedback.label} failed`}
        </div>
      )}

      <div className="flex-1 grid grid-cols-2 gap-2 min-h-0">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => handleAction(action)}
            disabled={executing === action.label}
            className="glass-card rounded-lg p-3 flex flex-col items-center justify-center gap-2 text-foreground-muted hover:text-gold-400 hover:border-gold-500/30 transition-all cursor-pointer group disabled:opacity-50"
          >
            <span className="text-foreground-subtle group-hover:text-gold-400 transition-colors">
              {executing === action.label ? (
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                action.icon
              )}
            </span>
            <span className="text-[10px] text-center leading-tight">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
