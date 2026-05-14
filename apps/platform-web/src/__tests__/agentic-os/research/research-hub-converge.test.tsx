/**
 * Research OS Wave E-3 — hub DashboardHub-convergence render tests.
 *
 * Supersedes the Wave C-2b `research-hub-widgets.test.tsx` suite. The
 * bespoke Research hub (hand-rolled header + the `ResearchHubWidgets` stat
 * strip, inlined in the page body) was retired for the shared
 * `DashboardHub` shell driven by the pure `buildResearchDashboardSpec`
 * adapter. These tests exercise that spec rendered through `DashboardHub` —
 * same four stat tiles (experiments / hypotheses / literature / open
 * blockers), same counts, same routes, same variant-escalation on
 * high-severity blockers, same footers — just the shared shell.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { buildResearchDashboardSpec } from '@/lib/agentic-os/research/dashboard-spec';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import type { AgenticOsModule } from '@/lib/agentic-os/registry';
import type { ResearchExperiment } from '@/lib/agentic-os/research/repo';
import type { BlockerItem } from '@/lib/agentic-os/research/blockers';
import { phaseProgressDefault } from '@/lib/agentic-os/research/experiments';

const researchModule = findAgenticOsModule('research') as AgenticOsModule;

/** Render the Research hub the way the page does — spec → DashboardHub. */
function renderResearchHub(
  args: Parameters<typeof buildResearchDashboardSpec>[0],
) {
  return render(
    <DashboardHub
      module={researchModule}
      roadmapMarkdown={null}
      dashboard={buildResearchDashboardSpec(args)}
    />,
  );
}

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

describe('Research hub — DashboardHub convergence', () => {
  it('renders the four stat DashboardWidget tiles through the shared hub', () => {
    renderResearchHub({
      experiments: [mkExperiment()],
      blockers: [],
      hypothesisCount: 0,
      literatureCount: 0,
    });
    expect(screen.getByTestId('research-hub-experiments')).toBeInTheDocument();
    expect(screen.getByTestId('research-hub-hypotheses')).toBeInTheDocument();
    expect(screen.getByTestId('research-hub-literature')).toBeInTheDocument();
    expect(screen.getByTestId('research-hub-blockers')).toBeInTheDocument();
    // All four tiles sit inside the shared hub's dashboard region grid.
    const grid = screen.getByTestId('dashboard-hub-widget-grid');
    expect(grid).toContainElement(screen.getByTestId('research-hub-experiments'));
    expect(grid).toContainElement(screen.getByTestId('research-hub-blockers'));
  });

  it('widget tiles link to the same routes as before', () => {
    renderResearchHub({
      experiments: [mkExperiment()],
      blockers: [],
      hypothesisCount: 0,
      literatureCount: 0,
    });
    expect(screen.getByTestId('research-hub-experiments')).toHaveAttribute(
      'href',
      '/dashboard/os/research/experiments',
    );
    expect(screen.getByTestId('research-hub-hypotheses')).toHaveAttribute(
      'href',
      '/dashboard/os/research/hypotheses',
    );
    expect(screen.getByTestId('research-hub-literature')).toHaveAttribute(
      'href',
      '/dashboard/os/research/library',
    );
    expect(screen.getByTestId('research-hub-blockers')).toHaveAttribute(
      'href',
      '/dashboard/os/research/blockers',
    );
  });

  it('counts only active experiments and reports running + archived', () => {
    renderResearchHub({
      experiments: [
        mkExperiment({ id: 'a', status: 'running' }),
        mkExperiment({ id: 'b', status: 'planning' }),
        mkExperiment({
          id: 'c',
          status: 'archived',
          archivedAt: '2026-05-02T00:00:00.000Z',
        }),
      ],
      blockers: [],
      hypothesisCount: 3,
      literatureCount: 7,
    });
    // 2 active, 1 running, 1 archived.
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1 running')).toBeInTheDocument();
    expect(screen.getByText('1 archived')).toBeInTheDocument();
    // Hypothesis + literature counts surface verbatim.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('escalates the blocker widget to attention on a high-severity blocker', () => {
    renderResearchHub({
      experiments: [mkExperiment()],
      blockers: [mkBlocker({ severity: 'high' }), mkBlocker({ id: 'm-2' })],
      hypothesisCount: 0,
      literatureCount: 0,
    });
    expect(screen.getByText('1 high severity')).toBeInTheDocument();
  });

  it('shows the all-clear blocker footer when there are no blockers', () => {
    renderResearchHub({
      experiments: [mkExperiment()],
      blockers: [],
      hypothesisCount: 0,
      literatureCount: 0,
    });
    expect(screen.getByText('Nothing blocking')).toBeInTheDocument();
  });

  it('renders the shared hub header + registry feature grid', () => {
    renderResearchHub({
      experiments: [],
      blockers: [],
      hypothesisCount: 0,
      literatureCount: 0,
    });
    // Header from the registry module — replaces the bespoke hand-rolled one.
    expect(
      screen.getByRole('heading', { name: 'Research OS' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /All Agentic OS modules/ }),
    ).toBeInTheDocument();
    // The registry feature grid renders every Research feature.
    expect(
      screen.getByRole('link', { name: /Hypothesis ledger/ }),
    ).toHaveAttribute('href', '/dashboard/os/research/hypotheses');
  });
});
