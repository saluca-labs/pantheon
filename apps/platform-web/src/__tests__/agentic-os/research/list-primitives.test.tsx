/**
 * Research OS Wave C-2b — list-page primitive adoption render tests.
 *
 * Locks the Wave C-2b swaps on the Research list surfaces:
 *  - ExperimentList     → EntitySearch (in-list search) + EmptyState
 *  - HypothesisLedger   → EntitySearch + EmptyState
 *  - TopBlockersList    → EmptyState (all-clear state)
 *
 * These client components self-refetch on mount; `fetch` is stubbed to a
 * benign empty payload so the components settle to their initial-prop
 * state without network noise.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExperimentList } from '@/components/agentic-os/research/experiment-list';
import { HypothesisLedger } from '@/components/agentic-os/research/HypothesisLedger';
import { TopBlockersList } from '@/components/agentic-os/research/top-blockers-list';
import type { ResearchExperiment } from '@/lib/agentic-os/research/repo';
import type { Hypothesis } from '@/lib/agentic-os/research/hypotheses';
import { phaseProgressDefault } from '@/lib/agentic-os/research/experiments';

function mkExperiment(overrides: Partial<ResearchExperiment> = {}): ResearchExperiment {
  return {
    id: 'exp-1',
    userId: 'u-1',
    hypothesisId: null,
    name: 'Enzyme kinetics',
    description: 'Temperature sweep',
    status: 'running',
    tags: ['biochem'],
    coverImageUrl: null,
    targetCompletionDate: null,
    teamSize: null,
    phaseProgress: phaseProgressDefault(),
    archivedAt: null,
    metadata: {},
    independent: '',
    dependent: '',
    controls: '',
    protocol: '',
    successCriteria: '',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
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
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ items: [], hypotheses: [], papers: [], protocols: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ExperimentList — primitive adoption', () => {
  it('renders the EntitySearch search box', () => {
    render(<ExperimentList initialExperiments={[mkExperiment()]} />);
    expect(
      screen.getByRole('searchbox', {
        name: /search experiments/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the EmptyState door when there are no experiments', () => {
    render(<ExperimentList initialExperiments={[]} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('No experiments yet');
    // Primary CTA wires to the create drawer.
    expect(screen.getByTestId('empty-state-cta-primary')).toBeInTheDocument();
  });

  it('still renders experiment cards when there is data', () => {
    render(<ExperimentList initialExperiments={[mkExperiment()]} />);
    expect(screen.getByText('Enzyme kinetics')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('HypothesisLedger — primitive adoption', () => {
  it('renders the EntitySearch search box', () => {
    render(<HypothesisLedger initialHypotheses={[mkHypothesis()]} />);
    expect(
      screen.getByRole('searchbox', { name: /search hypotheses/i }),
    ).toBeInTheDocument();
  });

  it('renders the EmptyState when the ledger is empty', async () => {
    render(<HypothesisLedger initialHypotheses={[]} />);
    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No hypotheses yet')).toBeInTheDocument();
  });
});

describe('TopBlockersList — primitive adoption', () => {
  it('renders the EmptyState all-clear state with no blockers', async () => {
    render(<TopBlockersList initial={[]} />);
    const empty = await screen.findByTestId('top-blockers-list-empty');
    expect(empty).toBeInTheDocument();
    expect(empty.querySelector('[data-testid="empty-state"]')).toBeTruthy();
    expect(empty.textContent).toContain('All clear');
  });
});
