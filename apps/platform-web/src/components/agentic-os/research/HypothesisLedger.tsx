'use client';

/**
 * Research OS — HypothesisLedger client component.
 *
 * Renders the hypothesis tracker: create new hypotheses in "If…then…because"
 * form, view the ledger, update status, and (Phase 3) toggle between
 * active + archived views with an archive affordance per row. Each row
 * deep-links to the per-hypothesis detail page.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type {
  Hypothesis,
  HypothesisStatus,
  ConfidenceLevel,
} from '@/lib/agentic-os/research/hypotheses';
import {
  HYPOTHESIS_STATUSES,
  CONFIDENCE_LEVELS,
  renderHypothesisStatement,
  validateHypothesis,
} from '@/lib/agentic-os/research/hypotheses';
import { HypothesisArchiveButton } from './hypothesis-archive-button';

const API = '/api/tiresias/agentic-os/research/hypotheses';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const STATUS_COLOR: Record<HypothesisStatus, string> = {
  draft:        'text-slate-300 bg-slate-500/10 border-slate-500/30',
  active:       'text-blue-300 bg-blue-500/10 border-blue-500/30',
  testing:      'text-amber-300 bg-amber-500/10 border-amber-500/30',
  supported:    'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  refuted:      'text-red-300 bg-red-500/10 border-red-500/30',
  inconclusive: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  archived:     'text-text-secondary bg-surface-2 border-border-subtle',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">{label}</span>
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
  const [descriptionMd, setDescriptionMd] = useState('');
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
          descriptionMd: descriptionMd.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErrors([d.error ?? `Failed (${r.status})`]);
        return;
      }
      const { hypothesis } = await r.json();
      onCreated(hypothesis);
      setTitle('');
      setIfClause('');
      setThenClause('');
      setBecauseClause('');
      setConfidence('medium');
      setTags('');
      setDescriptionMd('');
    } catch {
      setErrors(['Network error']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border-subtle bg-surface-2 p-5">
      <h3 className="text-sm font-semibold text-white">New hypothesis</h3>
      <Field label="Title / short name">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Temperature affects yield"
          className={inputCls}
        />
      </Field>
      <div className="space-y-3">
        <p className="text-xs text-text-secondary">
          Structure your hypothesis as:{' '}
          <span className="italic">If [X], then [Y], because [Z].</span>
        </p>
        <Field label="If (independent variable / condition)">
          <input
            value={ifClause}
            onChange={(e) => setIfClause(e.target.value)}
            placeholder="e.g. incubation temperature exceeds 37°C"
            className={inputCls}
          />
        </Field>
        <Field label="Then (expected outcome)">
          <input
            value={thenClause}
            onChange={(e) => setThenClause(e.target.value)}
            placeholder="e.g. enzyme activity decreases by ≥ 20%"
            className={inputCls}
          />
        </Field>
        <Field label="Because (rationale / mechanism)">
          <textarea
            value={becauseClause}
            onChange={(e) => setBecauseClause(e.target.value)}
            placeholder="e.g. elevated temperature denatures the active site above 37°C (cite source)"
            rows={2}
            className={inputCls}
          />
        </Field>
        <Field label="Description (optional, markdown)">
          <textarea
            value={descriptionMd}
            onChange={(e) => setDescriptionMd(e.target.value)}
            placeholder="Longer-form context, prior work, or open questions."
            rows={3}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Confidence">
          <select
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as ConfidenceLevel)}
            className={inputCls}
          >
            {CONFIDENCE_LEVELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tags (comma-separated)">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. biochemistry, enzymes"
            className={inputCls}
          />
        </Field>
      </div>
      {errors.length > 0 && (
        <ul className="text-sm text-red-300 space-y-0.5">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 text-sm transition"
      >
        {saving ? 'Adding…' : 'Add hypothesis'}
      </button>
    </form>
  );
}

// ─── Hypothesis Card ────────────────────────────────────────────────────────

function HypothesisCard({
  hyp,
  onUpdated,
  onArchived,
  onRestored,
}: {
  hyp: Hypothesis;
  onUpdated: (h: Hypothesis) => void;
  onArchived: (h: Hypothesis) => void;
  onRestored: (h: Hypothesis) => void;
}) {
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
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link
            href={`/dashboard/os/research/hypotheses/${hyp.id}`}
            className="text-white font-medium hover:text-accent inline-flex items-center gap-1"
          >
            <span className="truncate">{hyp.title}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </Link>
          <p className="text-sm text-text-secondary mt-1 italic leading-relaxed">{statement}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLOR[hyp.status]}`}
          >
            {hyp.status}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-border-subtle text-text-secondary">
            {hyp.confidence} confidence
          </span>
          {hyp.archivedAt && (
            <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-border-subtle bg-surface-0 text-text-secondary">
              Archived
            </span>
          )}
        </div>
      </div>

      {hyp.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {hyp.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as HypothesisStatus)}
            className="rounded-md border border-border-subtle bg-surface-0 px-2 py-1 text-xs text-white focus:border-accent focus:outline-none"
          >
            {HYPOTHESIS_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={updateStatus}
            disabled={updating || newStatus === hyp.status}
            className="text-xs px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-secondary hover:text-white disabled:opacity-40 transition"
          >
            {updating ? 'Updating…' : 'Update status'}
          </button>
        </div>
        <HypothesisArchiveButton
          hypothesis={hyp}
          onArchived={onArchived}
          onRestored={onRestored}
        />
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function HypothesisLedger({ initialHypotheses }: { initialHypotheses: Hypothesis[] }) {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>(initialHypotheses);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);

  // When the toggle flips, refetch from the API with the matching scope.
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${API}${showArchived ? '?archived=true' : ''}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setHypotheses(data.hypotheses ?? []);
      })
      .catch(() => {
        // Keep the prior list; the toggle is a soft refresh.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showArchived]);

  function onCreated(h: Hypothesis) {
    setHypotheses((prev) => [h, ...prev]);
  }

  function onUpdated(h: Hypothesis) {
    setHypotheses((prev) => prev.map((x) => (x.id === h.id ? h : x)));
  }

  function onArchived(h: Hypothesis) {
    // If we're showing active only, drop it; otherwise patch in place.
    if (!showArchived) {
      setHypotheses((prev) => prev.filter((x) => x.id !== h.id));
    } else {
      setHypotheses((prev) => prev.map((x) => (x.id === h.id ? h : x)));
    }
  }

  function onRestored(h: Hypothesis) {
    if (showArchived) {
      setHypotheses((prev) => prev.filter((x) => x.id !== h.id));
    } else {
      setHypotheses((prev) => prev.map((x) => (x.id === h.id ? h : x)));
    }
  }

  return (
    <div className="space-y-6">
      {!showArchived && <NewHypothesisForm onCreated={onCreated} />}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
          {showArchived ? 'Archived hypotheses' : 'Active hypotheses'}
        </h2>
        <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-border-subtle bg-surface-0"
          />
          Show archived
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading…</p>
      ) : hypotheses.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {showArchived ? 'No archived hypotheses.' : 'No hypotheses yet. Add your first one above.'}
        </p>
      ) : (
        <div className="space-y-4">
          {hypotheses.map((h) => (
            <HypothesisCard
              key={h.id}
              hyp={h}
              onUpdated={onUpdated}
              onArchived={onArchived}
              onRestored={onRestored}
            />
          ))}
        </div>
      )}
    </div>
  );
}
