'use client';

/**
 * Research OS — HypothesisLedger workspace component.
 *
 * Wave D specialization: the ledger stops being a flat card list and
 * becomes a status-aware *workspace*:
 *
 *  - A header summary strip ("open work" count + total).
 *  - A status-filter chip rail (built alongside `EntitySearch` — the
 *    primitive has no filter-chip API, known `_shared/views` gap #1) plus
 *    the existing `EntitySearch` text query.
 *  - `SavedViews` for named filter presets, persisted via the
 *    localStorage-mock store (`SavedViews` has no persistence yet — known
 *    gap #2; Wave E schema-backs it).
 *  - Hypotheses grouped into lifecycle lanes (active → testing → draft →
 *    resolved → archived) instead of one undifferentiated list.
 *  - Each card makes the If / Then / Because structure explicit with
 *    labelled clause rows rather than a single italic run-on sentence.
 *
 * Data, deep-linking, and the create/update/archive API surface are
 * unchanged — this is a surface upgrade, not a capability change.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, Lightbulb } from 'lucide-react';
import type {
  Hypothesis,
  HypothesisStatus,
  ConfidenceLevel,
} from '@/lib/agentic-os/research/hypotheses';
import {
  HYPOTHESIS_STATUSES,
  CONFIDENCE_LEVELS,
  validateHypothesis,
} from '@/lib/agentic-os/research/hypotheses';
import {
  filterHypotheses,
  groupHypothesesByStatus,
  countHypothesesByStatus,
  isOpenHypothesis,
  type HypothesisStatusFilter,
} from '@/lib/agentic-os/research/hypothesis-workspace';
import { useSavedViews } from '@/lib/agentic-os/research/saved-views-store';
import {
  EntitySearch,
  EmptyState,
  SavedViews,
  SkeletonGroup,
  Skeleton,
} from '@/components/agentic-os/_shared/views';
import { HypothesisArchiveButton } from './hypothesis-archive-button';
import { HypothesisStatusFilterChips } from './hypothesis-status-filter-chips';

const API = '/api/tiresias/agentic-os/research/hypotheses';

/** localStorage key for this surface's saved views. */
const SAVED_VIEWS_KEY = 'hypotheses';

/** The opaque filter-state a saved view restores. */
interface HypothesisQuery {
  status: HypothesisStatusFilter;
  query: string;
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const STATUS_COLOR: Record<HypothesisStatus, string> = {
  draft:        'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
  active:       'text-accent bg-accent/10 border-accent/30',
  testing:      'text-warning bg-warning/10 border-warning/30',
  supported:    'text-positive bg-positive/10 border-positive/30',
  refuted:      'text-danger bg-danger/10 border-danger/30',
  inconclusive: 'text-accent bg-accent/10 border-accent/30',
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
        <ul className="text-sm text-danger space-y-0.5">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 text-sm transition"
      >
        {saving ? 'Adding…' : 'Add hypothesis'}
      </button>
    </form>
  );
}

// ─── Clause row — makes the If / Then / Because structure explicit ──────────

function ClauseRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex gap-2 text-sm leading-relaxed" data-testid={`clause-${label.toLowerCase()}`}>
      <span className="shrink-0 w-16 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary pt-0.5">
        {label}
      </span>
      <span className="min-w-0 text-text-primary">{text}</span>
    </div>
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

  return (
    <div
      className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-3"
      data-testid={`hypothesis-card-${hyp.id}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link
            href={`/dashboard/os/research/hypotheses/${hyp.id}`}
            className="text-white font-medium hover:text-accent inline-flex items-center gap-1"
          >
            <span className="truncate">{hyp.title}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </Link>
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

      {/* If / Then / Because — explicit labelled structure */}
      <div className="space-y-1.5 rounded-lg border border-border-subtle bg-surface-0 p-3">
        <ClauseRow label="If" text={hyp.ifClause} />
        <ClauseRow label="Then" text={hyp.thenClause} />
        <ClauseRow label="Because" text={hyp.becauseClause} />
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
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<HypothesisStatusFilter>('all');

  // Saved views — localStorage-mock until Wave E schema-backs SavedViews.
  const { views, saveView, deleteView } = useSavedViews<HypothesisQuery>(SAVED_VIEWS_KEY);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const currentQuery: HypothesisQuery = useMemo(
    () => ({ status: statusFilter, query }),
    [statusFilter, query],
  );

  // Counts are computed over the full (unfiltered) list so chip badges are
  // stable as the user narrows the view.
  const counts = useMemo(() => countHypothesesByStatus(hypotheses), [hypotheses]);
  const openCount = useMemo(
    () => hypotheses.filter(isOpenHypothesis).length,
    [hypotheses],
  );

  const visible = useMemo(
    () => filterHypotheses(hypotheses, statusFilter, query),
    [hypotheses, statusFilter, query],
  );
  const groups = useMemo(() => groupHypothesesByStatus(visible), [visible]);

  // The active saved view is "dirty" when the live query no longer matches it.
  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const isDirty =
    activeView != null &&
    (activeView.query.status !== statusFilter || activeView.query.query !== query);

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

  function applyView(view: { id: string; query: HypothesisQuery }) {
    setStatusFilter(view.query.status);
    setQuery(view.query.query);
    setActiveViewId(view.id);
  }

  function clearView() {
    setStatusFilter('all');
    setQuery('');
    setActiveViewId(null);
  }

  return (
    <div className="space-y-6">
      {!showArchived && <NewHypothesisForm onCreated={onCreated} />}

      {/* Workspace header — open-work summary + archived toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            {showArchived ? 'Archived hypotheses' : 'Hypothesis workspace'}
          </h2>
          {!showArchived && (
            <span className="text-xs text-text-secondary" data-testid="hypothesis-open-summary">
              <span className="tabular-nums text-text-primary">{openCount}</span> open ·{' '}
              <span className="tabular-nums text-text-primary">{hypotheses.length}</span> total
            </span>
          )}
        </div>
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

      {/* Search + status-filter chips (chips built alongside EntitySearch — */}
      {/* the primitive has no filter-chip API, known _shared/views gap #1). */}
      <div className="space-y-3">
        <EntitySearch
          placeholder="Search hypotheses by title, clause, or tag"
          debounceMs={0}
          onQueryChange={(q) => {
            setQuery(q);
            setActiveViewId(null);
          }}
        />
        <HypothesisStatusFilterChips
          active={statusFilter}
          counts={counts}
          total={hypotheses.length}
          onChange={(next) => {
            setStatusFilter(next);
            setActiveViewId(null);
          }}
        />
        <SavedViews<HypothesisQuery>
          views={views}
          activeViewId={activeViewId}
          currentQuery={currentQuery}
          isDirty={isDirty}
          slug="research"
          allViewsLabel="All hypotheses"
          onClearView={clearView}
          onSelectView={applyView}
          onSaveView={(name, q) => {
            const view = saveView(name, q);
            setActiveViewId(view.id);
          }}
          onDeleteView={(id) => {
            deleteView(id);
            if (activeViewId === id) setActiveViewId(null);
          }}
        />
      </div>

      {loading ? (
        <SkeletonGroup>
          <Skeleton variant="card" />
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </SkeletonGroup>
      ) : visible.length === 0 ? (
        hypotheses.length === 0 ? (
          <EmptyState
            icon={<Lightbulb className="h-6 w-6" />}
            title={showArchived ? 'No archived hypotheses' : 'No hypotheses yet'}
            description={
              showArchived
                ? 'Hypotheses you archive will appear here.'
                : 'Track research questions in the standard If…then…because format — predictions, falsifiers, and the experiments that test them.'
            }
          />
        ) : (
          <EmptyState
            variant="bare"
            icon={<Lightbulb className="h-6 w-6" />}
            title="No hypotheses match"
            description="Try a different search term or status filter."
          />
        )
      ) : (
        <div className="space-y-6" data-testid="hypothesis-workspace-lanes">
          {groups.map((group) => (
            <section key={group.status} data-testid={`hypothesis-lane-${group.status}`}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {group.label}
                </h3>
                <span className="text-[10px] tabular-nums rounded-full bg-surface-2 px-1.5 py-0.5 text-text-tertiary">
                  {group.hypotheses.length}
                </span>
              </div>
              <div className="space-y-4">
                {group.hypotheses.map((h) => (
                  <HypothesisCard
                    key={h.id}
                    hyp={h}
                    onUpdated={onUpdated}
                    onArchived={onArchived}
                    onRestored={onRestored}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
