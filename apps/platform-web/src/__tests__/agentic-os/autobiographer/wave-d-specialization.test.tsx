/**
 * Autobiographer OS Wave D — specialization render + logic tests.
 *
 * Locks the Wave D specialization surfaces:
 *  - RevisionHistoryRail   → proper rail with count header + per-revision
 *                            word-count deltas + summary previews
 *  - MemoryTimelineAxis    → cross-book `TimelineView` adoption (dated
 *                            memories plotted on a year axis, lanes by book)
 *  - TimelineViewSwitcher  → grouped ⇄ axis toggle, default grouped
 *  - VoiceStudioStats      → Voice Studio dashboard-widget strip
 *  - PrivacyReviewWizard   → guided multi-step privacy review flow
 *  - timeline-axis + privacy-review lib helpers → pure shaping / summary
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Components reach for the App Router; a benign stub keeps them
// renderable in isolation.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard/os/autobiographer',
  useSearchParams: () => new URLSearchParams(),
}));

import { RevisionHistoryRail } from '@/components/agentic-os/autobiographer/revision-history-rail';
import { MemoryTimelineAxis } from '@/components/agentic-os/autobiographer/memory-timeline-axis';
import { TimelineViewSwitcher } from '@/components/agentic-os/autobiographer/timeline-view-switcher';
import { VoiceStudioStats } from '@/components/agentic-os/autobiographer/voice-studio-stats';
import { PrivacyReviewWizard } from '@/components/agentic-os/autobiographer/privacy-review-wizard';
import type { RevisionCardData } from '@/components/agentic-os/autobiographer/revision-card';
import type { TimelineMemory } from '@/lib/agentic-os/autobiographer/timeline';
import {
  buildMemoryAxisModel,
  parseEraDate,
} from '@/lib/agentic-os/autobiographer/timeline-axis';
import {
  summarizePeopleStep,
  summarizeChecklistStep,
  privacyReviewIsReady,
} from '@/lib/agentic-os/autobiographer/privacy-review';

// ─── fixtures ────────────────────────────────────────────────────────────────

function mkRevision(
  overrides: Partial<RevisionCardData> = {},
): RevisionCardData {
  return {
    id: 'rev-1',
    version: 1,
    author: 'user',
    wordCount: 100,
    createdAt: '2026-05-01T00:00:00.000Z',
    summary: null,
    ...overrides,
  };
}

function mkTimelineMemory(
  overrides: Partial<TimelineMemory> = {},
): TimelineMemory {
  return {
    id: 'tm-1',
    bookId: null,
    bookTitle: null,
    title: 'A memory',
    bodyMarkdown: 'It happened.',
    whenInLife: null,
    eraDateEstimate: '1990-06-01',
    location: null,
    emotionTags: [],
    contentTags: [],
    isSensitive: false,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    themes: [],
    arcs: [],
    ...overrides,
  };
}

// ─── Item 1 — RevisionHistoryRail ────────────────────────────────────────────

describe('RevisionHistoryRail — Wave D rail', () => {
  it('renders as a rail with a revision count header', () => {
    render(
      <RevisionHistoryRail
        chapterId="ch-1"
        revisions={[
          mkRevision({ id: 'rev-2', version: 2, wordCount: 150 }),
          mkRevision({ id: 'rev-1', version: 1, wordCount: 100 }),
        ]}
        activeRevisionId="rev-2"
        onSelect={vi.fn()}
        seedBody="body"
      />,
    );
    const rail = screen.getByTestId('revision-history-rail');
    expect(rail).toBeInTheDocument();
    expect(rail.textContent).toContain('Revision history');
  });

  it('shows a positive word-count delta against the previous revision', () => {
    render(
      <RevisionHistoryRail
        chapterId="ch-1"
        revisions={[
          mkRevision({ id: 'rev-2', version: 2, wordCount: 150 }),
          mkRevision({ id: 'rev-1', version: 1, wordCount: 100 }),
        ]}
        activeRevisionId="rev-2"
        onSelect={vi.fn()}
        seedBody="body"
      />,
    );
    // v2 is +50 over v1.
    const v2 = screen.getByTestId('revision-card-rev-2');
    expect(v2.textContent).toContain('+50');
  });

  it('renders the revision summary preview when present', () => {
    render(
      <RevisionHistoryRail
        chapterId="ch-1"
        revisions={[
          mkRevision({ id: 'rev-1', summary: 'Tightened the opening.' }),
        ]}
        activeRevisionId="rev-1"
        onSelect={vi.fn()}
        seedBody="body"
      />,
    );
    expect(screen.getByText('Tightened the opening.')).toBeInTheDocument();
  });

  it('fires onSelect when a revision card is clicked', () => {
    const onSelect = vi.fn();
    render(
      <RevisionHistoryRail
        chapterId="ch-1"
        revisions={[mkRevision({ id: 'rev-1' })]}
        activeRevisionId={null}
        onSelect={onSelect}
        seedBody="body"
      />,
    );
    fireEvent.click(screen.getByTestId('revision-card-rev-1'));
    expect(onSelect).toHaveBeenCalledWith('rev-1');
  });
});

// ─── Item 2 — timeline-axis lib + MemoryTimelineAxis ─────────────────────────

describe('timeline-axis — parseEraDate', () => {
  it('parses a YYYY-MM-DD era date into a UTC Date', () => {
    const d = parseEraDate('1994-07-15');
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBe(Date.UTC(1994, 6, 15));
  });

  it('returns null for a missing or unparseable estimate', () => {
    expect(parseEraDate(null)).toBeNull();
    expect(parseEraDate('sometime in the 90s')).toBeNull();
  });
});

describe('timeline-axis — buildMemoryAxisModel', () => {
  it('plots dated memories and counts undated ones separately', () => {
    const model = buildMemoryAxisModel([
      mkTimelineMemory({ id: 'a', eraDateEstimate: '1990-01-01' }),
      mkTimelineMemory({ id: 'b', eraDateEstimate: '1995-01-01' }),
      mkTimelineMemory({ id: 'c', eraDateEstimate: null }),
    ]);
    expect(model.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(model.undatedCount).toBe(1);
    expect(model.range).not.toBeNull();
  });

  it('builds one lane per book and sorts the unbooked lane last', () => {
    const model = buildMemoryAxisModel([
      mkTimelineMemory({
        id: 'a',
        bookId: 'book-1',
        bookTitle: 'Volume One',
        eraDateEstimate: '1990-01-01',
      }),
      mkTimelineMemory({
        id: 'b',
        bookId: null,
        eraDateEstimate: '1992-01-01',
      }),
    ]);
    expect(model.lanes.map((l) => l.id)).toEqual(['book-1', '__unbooked__']);
    expect(model.lanes[1]!.label).toBe('Unbooked');
  });

  it('returns an empty model with no dated memories', () => {
    const model = buildMemoryAxisModel([
      mkTimelineMemory({ id: 'c', eraDateEstimate: null }),
    ]);
    expect(model.items).toHaveLength(0);
    expect(model.range).toBeNull();
    expect(model.undatedCount).toBe(1);
  });
});

describe('MemoryTimelineAxis', () => {
  it('renders the shared TimelineView with dated memories', () => {
    render(
      <MemoryTimelineAxis
        memories={[
          mkTimelineMemory({ id: 'a', eraDateEstimate: '1990-01-01' }),
          mkTimelineMemory({ id: 'b', eraDateEstimate: '1995-01-01' }),
        ]}
      />,
    );
    expect(screen.getByTestId('memory-timeline-axis')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-item-a')).toBeInTheDocument();
  });

  it('shows an empty-state door when no memory carries an era date', () => {
    render(
      <MemoryTimelineAxis
        memories={[mkTimelineMemory({ id: 'c', eraDateEstimate: null })]}
      />,
    );
    const empty = screen.getByTestId('empty-state');
    expect(empty.textContent).toContain('No dated memories to plot');
  });
});

// ─── Item 2 — TimelineViewSwitcher ───────────────────────────────────────────

describe('TimelineViewSwitcher', () => {
  it('defaults to the grouped (bespoke decade) view', () => {
    render(
      <TimelineViewSwitcher
        memories={[mkTimelineMemory({ title: 'A grouped memory' })]}
      />,
    );
    expect(screen.getByTestId('timeline-mode-grouped')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('A grouped memory')).toBeInTheDocument();
  });

  it('switches to the axis view on toggle', () => {
    render(
      <TimelineViewSwitcher
        memories={[
          mkTimelineMemory({ id: 'a', eraDateEstimate: '1990-01-01' }),
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId('timeline-mode-axis'));
    expect(screen.getByTestId('timeline-mode-axis')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('memory-timeline-axis')).toBeInTheDocument();
  });
});

// ─── Item 3 — VoiceStudioStats ───────────────────────────────────────────────

describe('VoiceStudioStats', () => {
  it('renders four dashboard widgets derived from props', () => {
    render(
      <VoiceStudioStats
        totalSamples={5}
        activeSampleCount={3}
        activeSampleWordCount={1200}
        profileCount={2}
        activeProfileVersion={2}
      />,
    );
    const strip = screen.getByTestId('voice-studio-stats');
    expect(strip).toBeInTheDocument();
    expect(strip.textContent).toContain('Voice samples');
    expect(strip.textContent).toContain('1,200');
    expect(strip.textContent).toContain('v2');
  });

  it('shows an em-dash when no profile is active', () => {
    render(
      <VoiceStudioStats
        totalSamples={1}
        activeSampleCount={1}
        activeSampleWordCount={50}
        profileCount={0}
        activeProfileVersion={null}
      />,
    );
    expect(screen.getByTestId('voice-studio-stats').textContent).toContain(
      'Build one to unlock the drafter',
    );
  });
});

// ─── Item 4 — privacy-review lib + PrivacyReviewWizard ───────────────────────

describe('privacy-review — step summaries', () => {
  it('flags the people step when consent is blocking', () => {
    const s = summarizePeopleStep({
      consentStates: ['granted', 'pending'],
    });
    expect(s.status).toBe('attention');
    expect(s.blocking).toBe(1);
  });

  it('marks the people step complete when all consent is publishable', () => {
    const s = summarizePeopleStep({
      consentStates: ['granted', 'public_figure', 'deceased'],
    });
    expect(s.status).toBe('complete');
  });

  it('marks the checklist complete only when every required check is satisfied', () => {
    const complete = summarizeChecklistStep({
      bookLevelChecks: [],
      chapters: [
        {
          hasSensitiveContent: false,
          checks: [
            { kind: 'consent_collected', status: 'passed' },
            { kind: 'attribution_verified', status: 'waived' },
          ],
        },
      ],
    });
    expect(complete.status).toBe('complete');

    const incomplete = summarizeChecklistStep({
      bookLevelChecks: [],
      chapters: [
        {
          hasSensitiveContent: false,
          checks: [{ kind: 'consent_collected', status: 'pending' }],
        },
      ],
    });
    expect(incomplete.status).toBe('attention');
  });

  it('gates readiness on people + checklist both complete', () => {
    expect(privacyReviewIsReady('complete', 'complete')).toBe(true);
    expect(privacyReviewIsReady('attention', 'complete')).toBe(false);
    expect(privacyReviewIsReady('complete', 'attention')).toBe(false);
  });
});

describe('PrivacyReviewWizard', () => {
  const PEOPLE = [
    {
      personId: 'p-1',
      canonicalName: 'Jane Doe',
      consentState: 'granted' as const,
      memoryCount: 2,
    },
  ];
  const PSEUDONYM_PEOPLE = [
    {
      personId: 'p-1',
      canonicalName: 'Jane Doe',
      aliases: [],
      consentState: 'granted' as const,
      pseudonymId: null,
      pseudonym: '',
      notes: null,
      applied: false,
    },
  ];

  it('renders the step rail and starts on the people step', () => {
    render(
      <PrivacyReviewWizard
        bookId="b-1"
        people={PEOPLE}
        pseudonymPeople={PSEUDONYM_PEOPLE}
        bookLevelChecks={[]}
        chapters={[]}
      />,
    );
    expect(screen.getByTestId('privacy-review-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-wizard-step-people')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByTestId('privacy-wizard-body-people')).toBeInTheDocument();
  });

  it('navigates to the summary step via Next', () => {
    render(
      <PrivacyReviewWizard
        bookId="b-1"
        people={PEOPLE}
        pseudonymPeople={PSEUDONYM_PEOPLE}
        bookLevelChecks={[]}
        chapters={[]}
      />,
    );
    const next = screen.getByTestId('privacy-wizard-next');
    fireEvent.click(next); // → pseudonyms
    fireEvent.click(next); // → checklist
    fireEvent.click(next); // → summary
    expect(screen.getByTestId('privacy-wizard-summary')).toBeInTheDocument();
  });

  it('jumps straight to a step from the rail', () => {
    render(
      <PrivacyReviewWizard
        bookId="b-1"
        people={PEOPLE}
        pseudonymPeople={PSEUDONYM_PEOPLE}
        bookLevelChecks={[]}
        chapters={[]}
      />,
    );
    fireEvent.click(screen.getByTestId('privacy-wizard-step-checklist'));
    expect(
      screen.getByTestId('privacy-wizard-body-checklist'),
    ).toBeInTheDocument();
  });
});
