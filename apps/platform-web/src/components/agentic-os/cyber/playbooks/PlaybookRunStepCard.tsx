/**
 * CyberSec OS — Single step row for run-detail readonly view.
 *
 * Server component. Status badge, label, input preview, notes, completion ts.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { CheckCircle2, Circle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { PlaybookStepRun, PlaybookStepRunStatus } from '@/lib/agentic-os/cyber/playbooks';

const STATUS_STYLE: Record<PlaybookStepRunStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  pending:     { cls: 'text-slate-300 bg-slate-500/10 border-slate-500/30', Icon: Circle },
  in_progress: { cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30', Icon: Loader2 },
  completed:   { cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', Icon: CheckCircle2 },
  skipped:     { cls: 'text-slate-400 bg-slate-500/10 border-slate-500/30', Icon: XCircle },
  blocked:     { cls: 'text-red-300 bg-red-500/10 border-red-500/30', Icon: AlertCircle },
};

export function PlaybookRunStepCard({ stepRun }: { stepRun: PlaybookStepRun }) {
  const { cls, Icon } = STATUS_STYLE[stepRun.status];
  const inputKeys = Object.keys(stepRun.input ?? {});

  return (
    <li className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-3">
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 mt-0.5 text-[#4361EE] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
              step {stepRun.stepIndex + 1}
            </span>
            <span className="text-sm font-medium text-white truncate">
              {stepRun.stepSnapshot.label}
            </span>
            <span
              className={`ml-auto text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cls}`}
            >
              {stepRun.status}
            </span>
          </div>
          {stepRun.stepSnapshot.instructions && (
            <p className="text-[12px] text-[#cbd5e1] mb-2 whitespace-pre-wrap">
              {stepRun.stepSnapshot.instructions}
            </p>
          )}
          {inputKeys.length > 0 && (
            <pre className="text-[11px] text-[#cbd5e1] bg-[#0f1117] border border-[#2a2d3e] rounded p-2 overflow-x-auto leading-snug font-mono mb-2">
              {JSON.stringify(stepRun.input, null, 2)}
            </pre>
          )}
          {stepRun.notes && (
            <p className="text-[12px] text-[#cbd5e1] italic">{stepRun.notes}</p>
          )}
          <div className="text-[10px] text-[#94a3b8]/80 mt-1 flex gap-3">
            {stepRun.startedAt && <span>started {new Date(stepRun.startedAt).toLocaleString()}</span>}
            {stepRun.completedAt && <span>completed {new Date(stepRun.completedAt).toLocaleString()}</span>}
          </div>
        </div>
      </div>
    </li>
  );
}
