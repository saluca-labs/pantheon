/**
 * Research OS Wave C-2b — ResearchHubWidgets render tests.
 *
 * Locks the hub dashboard-widget strip: four `DashboardWidget` tiles
 * (experiments / hypotheses / literature / open blockers) derived purely
 * from props, with the blocker tile escalating its variant on high-
 * severity items.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResearchHubWidgets } from '@/components/agentic-os/research/research-hub-widgets';
import type { ResearchExperiment } from '@/lib/agentic-os/research/repo';
import type { BlockerItem } from '@/lib/agentic-os/research/blockers';
import { phaseProgressDefault } from '@/lib/agentic-os/research/experiments';

function mkExperiment(overrides: Partial<ResearchExperiment> = {}): ResearchExperiment {
  return {
    id: 'exp-1',
    userId: 'u-1',
    hypothesisId: null,
    name: 'Experiment',
    description: '',
    status: 'planning',
    tags: [],
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

function mkBlocker(overrides: Partial<BlockerItem> = {}): BlockerItem {
  return {
    kind: 'milestone',
    id: 'm-1',
    experimentId: 'exp-1',
    experimentName: 'Experiment',
    title: 'Blocked milestone',
    severity: 'medium',
    dueAt: null,
    status: 'blocked',
    reason: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ResearchHubWidgets', () => {
  it('renders the four-widget strip', () => {
    render(
      <ResearchHubWidgets
        experiments={[mkExperiment()]}
        blockers={[]}
        hypothesisCount={0}
        literatureCount={0}
      />,
    );
    expect(screen.getByTestId('research-hub-widgets')).toBeInTheDocument();
    expect(screen.getByText('Experiments')).toBeInTheDocument();
    expect(screen.getByText('Hypotheses')).toBeInTheDocument();
    expect(screen.getByText('Literature')).toBeInTheDocument();
    expect(screen.getByText('Open blockers')).toBeInTheDocument();
  });

  it('counts only active experiments and reports running + archived', () => {
    render(
      <ResearchHubWidgets
        experiments={[
          mkExperiment({ id: 'a', status: 'running' }),
          mkExperiment({ id: 'b', status: 'planning' }),
          mkExperiment({ id: 'c', status: 'archived', archivedAt: '2026-05-02T00:00:00.000Z' }),
        ]}
        blockers={[]}
        hypothesisCount={3}
        literatureCount={7}
      />,
    );
    // 2 active, 1 running.
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1 running')).toBeInTheDocument();
    expect(screen.getByText('1 archived')).toBeInTheDocument();
    // Hypothesis + literature counts surface verbatim.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('escalates the blocker widget to attention on a high-severity blocker', () => {
    render(
      <ResearchHubWidgets
        experiments={[mkExperiment()]}
        blockers={[mkBlocker({ severity: 'high' }), mkBlocker({ id: 'm-2' })]}
        hypothesisCount={0}
        literatureCount={0}
      />,
    );
    expect(screen.getByText('1 high severity')).toBeInTheDocument();
  });

  it('shows the all-clear blocker footer when there are no blockers', () => {
    render(
      <ResearchHubWidgets
        experiments={[mkExperiment()]}
        blockers={[]}
        hypothesisCount={0}
        literatureCount={0}
      />,
    );
    expect(screen.getByText('Nothing blocking')).toBeInTheDocument();
  });
});
