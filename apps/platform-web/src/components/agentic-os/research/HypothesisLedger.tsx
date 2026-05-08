'use client';

/**
 * Research OS — HypothesisLedger client component.
 *
 * Renders the hypothesis tracker: create new hypotheses in "If…then…because"
 * form, view the ledger, and update status.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { useState } from 'react';
import type { Hypothesis, HypothesisStatus, ConfidenceLevel } from '@/lib/agentic-os/research/hypotheses';
import {
  HYPOTHESIS_STATUSES,
  CONFIDENCE_LEVELS,
  renderHypothesisStatement,
  validateHypothesis,
} from '@/lib/agentic-os/research/hypotheses';

const API = '/api/tiresias/agentic-os/research/hypotheses';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const STATUS_COLOR: Record<HypothesisStatus, string> = {
  draft:        'text-slate-300 bg-slate-500/10 border-slate-500/30',
  active:       'text-blue-300 bg-blue-500/10 border-blue-500/30',
  testing:      'text-amber-300 bg-amber-500/10 border-amber-500/30',
  supported:    'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  refuted:      'text-red-300 bg-red-500/10 border-red-500/30',
  inconclusive: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  archived:     'text-[#94a3b8] bg-[#1a1d27] border-[#2a2d3e]',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

// ─── New Hypothesis Form ────────────────────────────────────────────────────

function NewHypothesisForm({ onCreated }: { onCreated: (h: Hypothesis) => void }) {
  const [title, setTitle] = useState('');
  const [ifClause, setIfClause] = useState('');
  const [thenClause, setThenClause] = useState('');
  const [becauseClause, setBecauseClause] = useState('');
  const [confidence, setConfidence] = useState<ConfidenceLevel>('medium');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validationErrors = validateHypothesis({ title, ifClause, thenClause, becauseClause });
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          ifClause: ifClause.trim(),
          thenClause: thenClause.trim(),
          becauseClause: becauseClause.trim(),
          confidence,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErrors([d.error ?? `Failed (${r.status})`]);
        return;
      }
      const { hypothesis } = await r.json();
      onCreated(hypothesis);
      setTitle(''); setIfClause(''); setThenClause(''); setBecauseClause('');
      setConfidence('medium'); setTags('');
    } catch {
      setErrors(['Network error']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
      <h3 className="text-sm font-semibold text-white">New hypothesis</h3>
      <Field label="Title / short name">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Temperature affects yield" className={inputCls} />
      </Field>
      <div className="space-y-3">
        <p className="text-xs text-[#94a3b8]">Structure your hypothesis as: <span className="italic">If [X], then [Y], because [Z].</span></p>
        <Field label="If (independent variable / condition)">
          <input value={ifClause} onChange={(e) => setIfClause(e.target.value)} placeholder="e.g. incubation temperature exceeds 37°C" className={inputCls} />
        </Field>
        <Field label="Then (expected outcome)">
          <input value={thenClause} onChange={(e) => setThenClause(e.target.value)} placeholder="e.g. enzyme activity decreases by ≥ 20%" className={inputCls} />
        </Field>
        <Field label="Because (rationale / mechanism)">
          <textarea value={becauseClause} onChange={(e) => setBecauseClause(e.target.value)} placeholder="e.g. elevated temperature denatures the active site above 37°C (cite source)" rows={2} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Confidence">
          <select value={confidence} onChange={(e) => setConfidence(e.target.value as ConfidenceLevel)} className={inputCls}>
            {CONFIDENCE_LEVELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Tags (comma-separated)">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. biochemistry, enzymes" className={inputCls} />
        </Field>
      </div>
      {errors.length > 0 && (
        <ul className="text-sm text-red-300 space-y-0.5">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      <button type="submit" disabled={saving} className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 text-sm transition">
        {saving ? 'Adding…' : 'Add hypothesis'}
      </button>
    </form>
  );
}

// ─── Hypothesis Card ────────────────────────────────────────────────────────

function HypothesisCard({ hyp, onUpdated }: { hyp: Hypothesis; onUpdated: (h: Hypothesis) => void }) {
  const [newStatus, setNewStatus] = useState<HypothesisStatus>(hyp.status);
  const [updating, setUpdating] = useState(false);

  async function updateStatus() {
    if (newStatus === hyp.status) return;
    setUpdating(true);
    try {
      const r = await fetch(`${API}/${hyp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (r.ok) {
        const { hypothesis } = await r.json();
        onUpdated(hypothesis);
      }
    } finally {
      setUpdating(false);
    }
  }

  const statement = renderHypothesisStatement(hyp);

  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-white font-medium">{hyp.title}</h3>
          <p className="text-sm text-[#94a3b8] mt-1 italic leading-relaxed">{statement}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLOR[hyp.status]}`}>
            {hyp.status}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-[#2a2d3e] text-[#94a3b8]">
            {hyp.confidence} confidence
          </span>
        </div>
      </div>

      {hyp.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {hyp.tags.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]">{t}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as HypothesisStatus)}
          className="rounded-md border border-[#2a2d3e] bg-[#0f1117] px-2 py-1 text-xs text-white focus:border-[#4361EE] focus:outline-none"
        >
          {HYPOTHESIS_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button
          onClick={updateStatus}
          disabled={updating || newStatus === hyp.status}
          className="text-xs px-2 py-1 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] hover:text-white disabled:opacity-40 transition"
        >
          {updating ? 'Updating…' : 'Update status'}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function HypothesisLedger({ initialHypotheses }: { initialHypotheses: Hypothesis[] }) {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>(initialHypotheses);

  function onCreated(h: Hypothesis) {
    setHypotheses((prev) => [h, ...prev]);
  }

  function onUpdated(h: Hypothesis) {
    setHypotheses((prev) => prev.map((x) => (x.id === h.id ? h : x)));
  }

  return (
    <div className="space-y-6">
      <NewHypothesisForm onCreated={onCreated} />

      {hypotheses.length === 0 ? (
        <p className="text-sm text-[#94a3b8]">No hypotheses yet. Add your first one above.</p>
      ) : (
        <div className="space-y-4">
          {hypotheses.map((h) => (
            <HypothesisCard key={h.id} hyp={h} onUpdated={onUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}
