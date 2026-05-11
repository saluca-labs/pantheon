'use client';

/**
 * CyberSec OS — Playbook run wizard.
 *
 * Renders the first pending step_run with kind-specific UI:
 *   - checklist:    a list of fields rendered as togglable boxes
 *   - input:        free-form fields per the snapshot
 *   - decision:     either yes/no or option-selection
 *   - runbook_step: instructions + done button
 *
 * "Mark complete" / "Skip" / "Block" buttons PATCH the step run. The full run
 * can be terminated via the "Complete run" / "Abandon run" buttons.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, SkipForward, AlertOctagon, Flag } from 'lucide-react';
import type {
  PlaybookRunDetail,
  PlaybookStep,
  PlaybookStepField,
  PlaybookStepRun,
  PlaybookStepRunStatus,
} from '@/lib/agentic-os/cyber/playbooks';
import {
  isRunTerminal,
  nextPendingStepIndex,
  progressFraction,
} from '@/lib/agentic-os/cyber/playbooks';
import { PlaybookRunStepCard } from './PlaybookRunStepCard';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const API_RUN = '/api/tiresias/agentic-os/cyber/playbook-runs';

export function PlaybookRunWizard({ run: initialRun }: { run: PlaybookRunDetail }) {
  const router = useRouter();
  const [run, setRun] = useState<PlaybookRunDetail>(initialRun);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextIdx = nextPendingStepIndex(run, run.stepRuns);
  const current: PlaybookStepRun | null =
    nextIdx === null ? null : run.stepRuns.find((sr) => sr.stepIndex === nextIdx) ?? null;
  const progress = progressFraction(run.stepRuns);
  const terminal = isRunTerminal(run);

  async function patchStep(
    stepRunId: string,
    patch: { status?: PlaybookStepRunStatus; input?: Record<string, unknown>; notes?: string | null },
  ) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_RUN}/${run.id}/steps/${stepRunId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { stepRun } = (await r.json()) as { stepRun: PlaybookStepRun };
      setRun((prev) => ({
        ...prev,
        stepRuns: prev.stepRuns.map((sr) => (sr.id === stepRun.id ? stepRun : sr)),
      }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function completeRun(status: 'completed' | 'abandoned') {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_RUN}/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { run: updated } = (await r.json()) as { run: PlaybookRunDetail };
      setRun(updated);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <div>
            <h1 className="text-xl font-semibold text-white">{run.playbookName}</h1>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              Run started {new Date(run.startedAt).toLocaleString()} ·{' '}
              <span className="uppercase tracking-wide">{run.status.replace('_', ' ')}</span>
            </p>
          </div>
          {!terminal && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void completeRun('completed')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium px-3 py-1.5 text-sm transition"
              >
                <Flag className="w-4 h-4" />
                Complete run
              </button>
              <button
                type="button"
                onClick={() => void completeRun('abandoned')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-60 px-3 py-1.5 text-sm transition"
              >
                Abandon
              </button>
            </div>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-[#0f1117] overflow-hidden">
          <div
            className="h-full bg-[#4361EE] transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-[#94a3b8] mt-1.5">
          {run.stepRuns.filter((s) => s.status === 'completed' || s.status === 'skipped').length} /{' '}
          {run.stepRuns.length} step{run.stepRuns.length === 1 ? '' : 's'} resolved
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 text-red-200 text-sm p-3">
          {error}
        </div>
      )}

      {!terminal && current && (
        <CurrentStepEditor
          stepRun={current}
          busy={busy}
          onComplete={(input, notes) =>
            patchStep(current.id, { status: 'completed', input, notes: notes || null })
          }
          onSkip={(notes) => patchStep(current.id, { status: 'skipped', notes: notes || null })}
          onBlock={(notes) => patchStep(current.id, { status: 'blocked', notes: notes || null })}
        />
      )}

      <section>
        <h2 className="text-sm uppercase tracking-wide text-[#94a3b8] mb-2">All steps</h2>
        <ol className="space-y-2">
          {run.stepRuns.map((sr) => (
            <PlaybookRunStepCard key={sr.id} stepRun={sr} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function CurrentStepEditor({
  stepRun,
  busy,
  onComplete,
  onSkip,
  onBlock,
}: {
  stepRun: PlaybookStepRun;
  busy: boolean;
  onComplete: (input: Record<string, unknown>, notes: string) => void;
  onSkip: (notes: string) => void;
  onBlock: (notes: string) => void;
}) {
  const step: PlaybookStep = stepRun.stepSnapshot;
  const [input, setInput] = useState<Record<string, unknown>>(stepRun.input ?? {});
  const [notes, setNotes] = useState(stepRun.notes ?? '');

  function setField(name: string, value: unknown) {
    setInput((curr) => ({ ...curr, [name]: value }));
  }

  return (
    <section className="rounded-xl border-2 border-[#4361EE]/50 bg-[#1a1d27] p-5 space-y-4">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#4361EE]/40 text-[#4361EE]">
            current — step {stepRun.stepIndex + 1}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#2a2d3e] text-[#94a3b8]">
            {step.kind}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-white">{step.label}</h2>
      </header>

      {step.instructions && (
        <pre className="text-[12px] text-[#cbd5e1] whitespace-pre-wrap bg-[#0f1117] border border-[#2a2d3e] rounded p-3 leading-relaxed">
          {step.instructions}
        </pre>
      )}

      {step.kind === 'checklist' && (
        <div className="space-y-2">
          {(step.fields ?? []).map((field) => (
            <label key={field.name} className="flex items-center gap-2 text-sm text-[#cbd5e1]">
              <input
                type="checkbox"
                checked={Boolean(input[field.name])}
                onChange={(e) => setField(field.name, e.target.checked)}
                className="accent-[#4361EE]"
              />
              {field.label}
            </label>
          ))}
        </div>
      )}

      {(step.kind === 'input' || step.kind === 'decision') && (
        <div className="space-y-3">
          {(step.fields ?? []).map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={input[field.name]}
              onChange={(v) => setField(field.name, v)}
            />
          ))}
        </div>
      )}

      {step.kind === 'runbook_step' && (
        <p className="text-xs text-[#94a3b8]">Execute the instruction above, then mark complete below.</p>
      )}

      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Observations, deviations, follow-ups…"
          className={inputCls + ' resize-y'}
        />
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onComplete(input, notes)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium px-3 py-1.5 text-sm transition"
        >
          <CheckCircle2 className="w-4 h-4" />
          Mark complete
        </button>
        <button
          type="button"
          onClick={() => onSkip(notes)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2d3e] text-[#cbd5e1] hover:text-white px-3 py-1.5 text-sm transition"
        >
          <SkipForward className="w-4 h-4" />
          Skip
        </button>
        <button
          type="button"
          onClick={() => onBlock(notes)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 px-3 py-1.5 text-sm transition"
        >
          <AlertOctagon className="w-4 h-4" />
          Block
        </button>
      </div>
    </section>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PlaybookStepField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-[#cbd5e1]">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-[#4361EE]"
        />
        {field.label}{field.required ? ' *' : ''}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
          {field.label}{field.required ? ' *' : ''}
        </span>
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">—</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === 'textarea') {
    return (
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
          {field.label}{field.required ? ' *' : ''}
        </span>
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={inputCls + ' resize-y'}
        />
      </label>
    );
  }
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
        {field.label}{field.required ? ' *' : ''}
      </span>
      <input
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}
