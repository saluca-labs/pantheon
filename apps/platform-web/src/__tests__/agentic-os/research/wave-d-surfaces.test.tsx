/**
 * Research OS Wave D — specialized-surface render tests.
 *
 * Locks the Wave D specialization surfaces:
 *  - HypothesisLedger        → status-filter chips + status-grouped lanes
 *                              + open-work summary + SavedViews
 *  - NotebookEntryTimeline   → TimelineView adoption (lanes + points)
 *  - NotebookTimeline        → list / timeline view toggle
 *  - ReproducibilityChecklist→ progress header + outstanding/done sections
 *  - TopBlockersList         → SavedViews with the "Top blockers" default
 *                              view applied on first load
 *
 * Client components self-refetch on mount; `fetch` is stubbed to a benign
 * empty payload so the components settle to their initial-prop state.
 * `localStorage` is cleared between tests so the SavedViews mock store
 * doesn't bleed across cases.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HypothesisLedger } from '@/components/agentic-os/research/hypothesis-ledger';
import { NotebookEntryTimeline } from '@/components/agentic-os/research/notebook-entry-timeline';
import { NotebookTimeline } from '@/components/agentic-os/research/notebook-timeline';
import { ReproducibilityChecklist } from '@/components/agentic-os/research/reproducibility-checklist';
import { TopBlockersList } from '@/components/agentic-os/research/top-blockers-list';
import type { Hypothesis } from '@/lib/agentic-os/research/hypotheses';
import type { NotebookEntry } from '@/lib/agentic-os/research/notebook-entries';
import type { ReproCheck, ReproState } from '@/lib/agentic-os/research/reproducibility';
import type { BlockerItem } from '@/lib/agentic-os/research/blockers';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function mkHyp(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: 'hyp-1',
    userId: 'u-1',
    title: 'Temperature affects yield',
    ifClause: 'temperature exceeds 37C',
    thenClause: 'yield drops',
    becauseClause: 'denaturation',
    status: 'active',
    confidence: 'medium',
    tags: [],
    experimentIds: [],
    descriptionMd: '',
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkEntry(overrides: Partial<NotebookEntry> = {}): NotebookEntry {
  return {
    id: 'ne-1',
    userId: 'u-1',
    experimentId: 'exp-1',
    entryKind: 'note',
    title: 'Entry',
    bodyMd: '',
    attachedUrls: [],
    tags: [],
    entryAt: '2026-05-10T12:00:00.000Z',
    archivedAt: null,
    metadata: {},
    createdAt: '2026-05-10T12:00:00.000Z',
    updatedAt: '2026-05-10T12:00:00.000Z',
    ...overrides,
  };
}

function mkRepro(state: ReproState, itemKey: string): ReproCheck {
  return {
    id: `id-${itemKey}`,
    experimentId: 'exp-1',
    userId: 'u-1',
    itemKey,
    state,
    evidenceUrl: null,
    notes: null,
    completedAt: state === 'done' ? '2026-05-12T10:00:00.000Z' : null,
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
  };
}

function mkBlocker(overrides: Partial<BlockerItem> = {}): BlockerItem {
  return {
    kind: 'milestone',
    id: 'm-1',
    experimentId: 'exp-1',
    experimentName: 'Experiment One',
    title: 'Blocked milestone',
    severity: 'high',
    dueAt: null,
    status: 'blocked',
    reason: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({ items: [], hypotheses: [], entries: [], papers: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  );
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom always has localStorage; guard is belt-and-braces */
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
  } catch {
    /* no-op */
  }
});

// ─── HypothesisLedger workspace ─────────────────────────────────────────────

describe('HypothesisLedger — Wave D workspace', () => {
  /**
   * `HypothesisLedger` self-refetches on mount (the archived-toggle
   * effect) and replaces `initialHypotheses` with `data.hypotheses` — so
   * the fixtures have to come back through the stubbed `fetch`, echoed
   * from whatever the test renders with.
   */
  function stubHypothesesFetch(hypotheses: Hypothesis[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ hypotheses }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  }

  it('renders the status-filter chip rail', () => {
    stubHypothesesFetch([mkHyp()]);
    render(<HypothesisLedger initialHypotheses={[mkHyp()]} />);
    expect(
      screen.getByTestId('hypothesis-status-filter-chips'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('hypothesis-status-chip-all')).toBeInTheDocument();
    expect(
      screen.getByTestId('hypothesis-status-chip-active'),
    ).toBeInTheDocument();
  });

  it('renders the open-work summary count', async () => {
    const list = [
      mkHyp({ id: 'a', status: 'active' }),
      mkHyp({ id: 'b', status: 'supported' }),
    ];
    stubHypothesesFetch(list);
    render(<HypothesisLedger initialHypotheses={list} />);
    const summary = await screen.findByTestId('hypothesis-open-summary');
    // 1 open (active), 2 total.
    expect(summary.textContent).toContain('1');
    expect(summary.textContent).toContain('2');
  });

  it('groups hypotheses into status lanes', async () => {
    const list = [
      mkHyp({ id: 'a', status: 'active', title: 'Alpha' }),
      mkHyp({ id: 'b', status: 'testing', title: 'Beta' }),
    ];
    stubHypothesesFetch(list);
    render(<HypothesisLedger initialHypotheses={list} />);
    expect(
      await screen.findByTestId('hypothesis-workspace-lanes'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('hypothesis-lane-active')).toBeInTheDocument();
    expect(screen.getByTestId('hypothesis-lane-testing')).toBeInTheDocument();
  });

  it('renders each clause with an explicit If / Then / Because label', async () => {
    stubHypothesesFetch([mkHyp()]);
    render(<HypothesisLedger initialHypotheses={[mkHyp()]} />);
    expect(await screen.findByTestId('clause-if')).toBeInTheDocument();
    expect(screen.getByTestId('clause-then')).toBeInTheDocument();
    expect(screen.getByTestId('clause-because')).toBeInTheDocument();
  });

  it('renders the SavedViews reset pill', () => {
    stubHypothesesFetch([mkHyp()]);
    render(<HypothesisLedger initialHypotheses={[mkHyp()]} />);
    expect(screen.getByText('All hypotheses')).toBeInTheDocument();
  });
});

// ─── NotebookEntryTimeline ──────────────────────────────────────────────────

describe('NotebookEntryTimeline — TimelineView adoption', () => {
  it('renders the TimelineView with a lane per kind when filter is "all"', () => {
    render(
      <NotebookEntryTimeline
        entries={[mkEntry({ id: 'a', entryKind: 'observation' })]}
        kind="all"
        onMutated={() => {}}
      />,
    );
    expect(screen.getByTestId('notebook-entry-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    // 6 kind lanes.
    expect(screen.getByTestId('timeline-lane-note')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-lane-observation')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-lane-todo')).toBeInTheDocument();
  });

  it('collapses to a single lane when a concrete kind is filtered', () => {
    render(
      <NotebookEntryTimeline
        entries={[mkEntry({ id: 'a', entryKind: 'result' })]}
        kind="result"
        onMutated={() => {}}
      />,
    );
    expect(screen.getByTestId('timeline-lane-result')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-lane-note')).toBeNull();
  });

  it('renders a timeline point for each entry', () => {
    render(
      <NotebookEntryTimeline
        entries={[
          mkEntry({ id: 'a', entryAt: '2026-05-05T00:00:00.000Z' }),
          mkEntry({ id: 'b', entryAt: '2026-05-15T00:00:00.000Z' }),
        ]}
        kind="all"
        onMutated={() => {}}
      />,
    );
    expect(screen.getByTestId('notebook-timeline-point-a')).toBeInTheDocument();
    expect(screen.getByTestId('notebook-timeline-point-b')).toBeInTheDocument();
  });
});

// ─── NotebookTimeline view toggle ───────────────────────────────────────────

describe('NotebookTimeline — list / timeline view toggle', () => {
  it('renders the view toggle and defaults to the list view', async () => {
    render(
      <NotebookTimeline experimentId="exp-1" initialEntries={[mkEntry()]} />,
    );
    const toggle = await screen.findByTestId('notebook-view-toggle');
    expect(toggle).toBeInTheDocument();
    expect(screen.getByTestId('notebook-view-list')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('notebook-view-timeline')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

// ─── ReproducibilityChecklist ───────────────────────────────────────────────

describe('ReproducibilityChecklist — Wave D checklist UI', () => {
  it('renders the progress bar header', () => {
    render(
      <ReproducibilityChecklist
        experimentId="exp-1"
        initialItems={[
          mkRepro('done', 'raw_data_archived'),
          mkRepro('pending', 'code_published'),
        ]}
      />,
    );
    const progress = screen.getByTestId('repro-checklist-progress');
    expect(progress).toBeInTheDocument();
    // 1 done of 2 scored → 50%.
    expect(progress).toHaveAttribute('aria-valuenow', '50');
  });

  it('renders the outstanding + done sections', () => {
    render(
      <ReproducibilityChecklist
        experimentId="exp-1"
        initialItems={[
          mkRepro('done', 'raw_data_archived'),
          mkRepro('in_progress', 'code_published'),
        ]}
      />,
    );
    expect(screen.getByTestId('repro-section-outstanding')).toBeInTheDocument();
    expect(screen.getByTestId('repro-section-done')).toBeInTheDocument();
  });

  it('collapses the excluded section behind a toggle', () => {
    render(
      <ReproducibilityChecklist
        experimentId="exp-1"
        initialItems={[
          mkRepro('done', 'raw_data_archived'),
          mkRepro('waived', 'ethics_filed'),
        ]}
      />,
    );
    expect(
      screen.getByTestId('repro-section-excluded-toggle'),
    ).toBeInTheDocument();
    // The waived row is hidden until the toggle is opened.
    expect(
      screen.queryByTestId('repro-item-row-ethics_filed'),
    ).toBeNull();
  });

  it('still shows the empty state when there are no items', () => {
    render(
      <ReproducibilityChecklist experimentId="exp-1" initialItems={[]} />,
    );
    expect(screen.getByTestId('repro-checklist-empty')).toBeInTheDocument();
  });
});

// ─── TopBlockersList saved-view default ─────────────────────────────────────

describe('TopBlockersList — Wave D Top blockers default view', () => {
  /**
   * `TopBlockersList` self-refetches on mount and replaces `initial` with
   * the API payload — so the blocker fixtures have to come through the
   * stubbed `fetch`, not just the prop.
   */
  function stubBlockersFetch(items: BlockerItem[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ items }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  }

  it('renders the SavedViews rail with the built-in Top blockers view', async () => {
    stubBlockersFetch([mkBlocker()]);
    render(<TopBlockersList initial={[mkBlocker()]} />);
    expect(await screen.findByText('Top blockers')).toBeInTheDocument();
    expect(screen.getByText('All blockers')).toBeInTheDocument();
  });

  it('applies the high-severity default view on first load', async () => {
    // One high + one medium; the default view should hide the medium one.
    stubBlockersFetch([
      mkBlocker({ id: 'high-1', severity: 'high', title: 'High blocker' }),
      mkBlocker({
        id: 'med-1',
        severity: 'medium',
        title: 'Medium blocker',
        kind: 'dependency',
      }),
    ]);
    render(<TopBlockersList />);
    expect(await screen.findByText('High blocker')).toBeInTheDocument();
    expect(screen.queryByText('Medium blocker')).toBeNull();
  });

  it('shows the all-clear empty state when the default view matches nothing', async () => {
    // Only a medium blocker — the high-severity default view filters it out.
    stubBlockersFetch([mkBlocker({ id: 'med-1', severity: 'medium' })]);
    render(<TopBlockersList />);
    const empty = await screen.findByTestId('top-blockers-list-empty');
    expect(empty.textContent).toContain('All clear');
  });
});
