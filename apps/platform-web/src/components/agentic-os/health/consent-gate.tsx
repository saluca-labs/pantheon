'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { ConsentScope } from '@/lib/agentic-os/health/schemas';

interface Props {
  /**
   * Map of scope to current consent state. Missing entries are treated
   * as "not yet granted" — the gate prompts for them.
   */
  initial: Record<ConsentScope, boolean>;
}

const SCOPE_LABELS: Record<ConsentScope, { label: string; copy: string }> = {
  physical: {
    label: 'Physical health',
    copy: 'Store profile vitals, intake answers, and physical-health logs in Health OS.',
  },
  mental: {
    label: 'Mental health',
    copy: 'Store mental-health profile, screener responses, and journal entries with crisis-safety guards.',
  },
  integrations: {
    label: 'Third-party integrations',
    copy: 'Allow optional connections (wearables, EHR, mood apps). You can revoke this at any time.',
  },
};

export function ConsentGate({ initial }: Props) {
  const [state, setState] = useState<Record<ConsentScope, boolean>>(initial);
  const [busy, setBusy] = useState<ConsentScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(scope: ConsentScope, granted: boolean) {
    setBusy(scope);
    setError(null);
    try {
      const r = await fetch('/api/tiresias/agentic-os/health/consent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, granted }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ?? `Update failed (${r.status})`);
      }
      setState((s) => ({ ...s, [scope]: granted }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  }

  const missing = (Object.keys(SCOPE_LABELS) as ConsentScope[]).filter(
    (s) => !state[s],
  );

  if (missing.length === 0) {
    return null; // All scopes granted — gate hidden.
  }

  return (
    <div className="rounded-xl border border-positive/30 bg-positive/5 p-5">
      <div className="flex items-start gap-3 mb-3">
        <ShieldCheck className="w-5 h-5 text-positive mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-white">Consent required</h3>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            Health OS keeps your data scoped by purpose. You can grant or
            revoke each scope independently. Mental-health features are
            gated by the mental-health consent — no mh data is written
            without it.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {missing.map((scope) => {
          const { label, copy } = SCOPE_LABELS[scope];
          return (
            <div
              key={scope}
              className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle bg-surface-0 p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">{label}</div>
                <p className="text-xs text-text-secondary leading-relaxed">{copy}</p>
              </div>
              <button
                type="button"
                disabled={busy === scope}
                onClick={() => toggle(scope, true)}
                className="rounded-md bg-positive hover:bg-positive/90 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 transition shrink-0"
              >
                {busy === scope ? 'Saving…' : 'Grant'}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-danger mt-3">{error}</p>}
    </div>
  );
}
