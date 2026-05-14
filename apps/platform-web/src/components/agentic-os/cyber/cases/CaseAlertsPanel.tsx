'use client';

/**
 * CyberSec OS — Case linked-alerts panel.
 *
 * Lists linked alerts with detach button. "Attach alert" opens
 * AttachAlertDialog.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2Off, Plus } from 'lucide-react';
import type { CaseDetail } from '@/lib/agentic-os/cyber/cases';
import { AttachAlertDialog } from './AttachAlertDialog';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'text-red-200 bg-red-600/20 border-red-500/50',
  high:     'text-orange-300 bg-orange-500/10 border-orange-500/30',
  medium:   'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low:      'text-blue-300 bg-blue-500/10 border-blue-500/30',
  info:     'text-slate-300 bg-slate-500/10 border-slate-500/30',
};

export interface CaseAlertsPanelProps {
  caseId: string;
  linkedAlerts: CaseDetail['linkedAlerts'];
}

export function CaseAlertsPanel({ caseId, linkedAlerts }: CaseAlertsPanelProps) {
  const router = useRouter();
  const [showAttach, setShowAttach] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function detach(alertId: string) {
    if (!confirm('Detach this alert from the case?')) return;
    setBusy(alertId);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/cyber/cases/${caseId}/alerts?alertId=${encodeURIComponent(alertId)}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detach failed');
    } finally {
      setBusy(null);
    }
  }

  const linkedSet = new Set(linkedAlerts.map((a) => a.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          {linkedAlerts.length} alert{linkedAlerts.length === 1 ? '' : 's'} linked
        </p>
        <button
          type="button"
          onClick={() => setShowAttach(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] text-white px-3 py-1.5 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          Attach alert
        </button>
      </div>

      {linkedAlerts.length === 0 ? (
        <p className="text-sm text-text-secondary p-6 rounded-xl border border-dashed border-border-subtle">
          No alerts linked yet. Attach existing alerts to keep this case grounded
          in the raw detections.
        </p>
      ) : (
        <ul className="space-y-2">
          {linkedAlerts.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle bg-surface-2 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${
                      SEVERITY_BADGE[a.severity] ?? ''
                    }`}
                  >
                    {a.severity}
                  </span>
                  <span className="text-sm text-white truncate">{a.title}</span>
                </div>
                <p className="text-[11px] text-text-secondary">
                  {new Date(a.occurredAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => detach(a.id)}
                disabled={busy === a.id}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border-subtle text-text-secondary hover:text-red-300 hover:border-red-500/50 disabled:opacity-60 px-2 py-1 text-xs transition"
                aria-label="Detach alert"
              >
                <Link2Off className="w-3.5 h-3.5" />
                Detach
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      {showAttach && (
        <AttachAlertDialog
          caseId={caseId}
          linkedAlertIds={linkedSet}
          onClose={() => setShowAttach(false)}
        />
      )}
    </div>
  );
}
