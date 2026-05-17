/**
 * Filmmaker OS — Wave C-5 (UI Depth Wave) primitive-adoption render tests.
 *
 * Filmmaker had no component-level render tests before Wave C-5 — the prior
 * suite is all logic / repo / route coverage. These tests lock the
 * presentation-layer swap to the shared `_shared/views` primitives, plus the
 * tier-1 → tier-2 hub convergence:
 *  - buildFilmmakerDashboardSpec  → DashboardWidget specs + ActivityFeed spec
 *  - buildFilmmakerActivityEvents → recent-project events
 *  - DashboardHub + filmmaker module + spec → the inline `[slug]/page.tsx`
 *    metadata header + feature grid + roadmap accordion, plus the declarative
 *    dashboard region
 *  - ProjectsManager       → FilmmakerListControls (EntitySearch + SavedViews)
 *                            + EmptyState
 *  - CharacterListManager  → EntitySearch + EmptyState
 *  - ShotListBuilder       → EmptyState
 *  - StoryboardList        → EmptyState
 *  - CharacterDetailWorkspace → CrossEntityTabs
 *
 * They assert the primitive structure renders AND that the same domain data
 * still surfaces (counts, project names, statuses), so the
 * "behavior-preserving" contract is verifiable.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

// Several Filmmaker client components call `useRouter()` at module scope;
// jsdom has no App Router context, so stub `next/navigation` for the render
// tests (mirrors the Cyber Wave C suite).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

import {
  buildFilmmakerDashboardSpec,
  buildFilmmakerActivityEvents,
} from '@/lib/agentic-os/filmmaker/dashboard-spec';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import type { EmptyStateProps } from '@/components/agentic-os/_shared/views';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { ProjectsManager } from '@/components/agentic-os/filmmaker/projects-manager';
import { CharacterListManager } from '@/components/agentic-os/filmmaker/characters/CharacterListManager';
import { ShotListBuilder } from '@/components/agentic-os/filmmaker/shot-list-builder';
import { StoryboardList } from '@/components/agentic-os/filmmaker/storyboard/StoryboardList';
import { CharacterDetailWorkspace } from '@/components/agentic-os/filmmaker/characters/CharacterDetailWorkspace';
import type { FilmmakerProject } from '@/lib/agentic-os/filmmaker/projects';
import { phaseProgressDefault } from '@/lib/agentic-os/filmmaker/projects';
import type { Character } from '@/lib/agentic-os/filmmaker/characters';
import type { ShotListEntry } from '@/lib/agentic-os/filmmaker/shots';
import type { StoryboardSummary } from '@/lib/agentic-os/filmmaker/storyboards';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function mkProject(overrides: Partial<FilmmakerProject> = {}): FilmmakerProject {
  return {
    id: 'p-1',
    userId: 'u-1',
    name: 'Short Film 2026',
    description: 'A micro-budget drama.',
    status: 'pre_production',
    tags: [],
    format: 'feature',
    logline: 'A drifter returns home.',
    coverImageUrl: null,
    phaseProgress: phaseProgressDefault(),
    targetCompletionDate: null,
    teamSize: null,
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

function mkCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c-1',
    projectId: 'p-1',
    name: 'Maria Vega',
    role: 'protagonist',
    archetype: null,
    logline: null,
    age: null,
    pronouns: null,
    gender: null,
    occupation: null,
    backstory: null,
    goals: null,
    needs: null,
    fears: null,
    wounds: null,
    arc: null,
    voiceNotes: null,
    physicalDescription: null,
    portraitUrl: null,
    tags: [],
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

function mkShot(overrides: Partial<ShotListEntry> = {}): ShotListEntry {
  return {
    id: 's-1',
    projectId: 'p-1',
    sceneNumber: '1',
    shotNumber: 'A',
    shotType: 'MS',
    cameraMove: 'STATIC',
    subject: 'Maria walks to the door',
    description: '',
    estimatedSeconds: 8,
    completed: false,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkStoryboard(
  overrides: Partial<StoryboardSummary> = {},
): StoryboardSummary {
  return {
    id: 'sb-1',
    name: 'Storyboard 1',
    status: 'draft',
    sceneId: null,
    panelCount: 0,
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

// ─── buildFilmmakerDashboardSpec — the hub `dashboard` prop adapter ──────────

describe('buildFilmmakerDashboardSpec — hub dashboard spec', () => {
  it('builds four aggregate-stat widgets, each linking to the projects surface', () => {
    const spec = buildFilmmakerDashboardSpec({ projects: [mkProject()] });
    expect(spec.widgets).toHaveLength(4);
    const testIds = spec.widgets!.map((w) => w['data-testid']);
    expect(testIds).toContain('filmmaker-widget-projects');
    expect(testIds).toContain('filmmaker-widget-in-production');
    expect(testIds).toContain('filmmaker-widget-next-target');
    expect(testIds).toContain('filmmaker-widget-avg-progress');
    for (const w of spec.widgets!) {
      expect(w.href).toBe('/dashboard/os/filmmaker/projects');
    }
  });

  it('omits the chart — Filmmaker has no cross-project time-series surface', () => {
    const spec = buildFilmmakerDashboardSpec({ projects: [mkProject()] });
    expect(spec.chart).toBeUndefined();
  });

  it('attention-tints the in-production widget when a project is shooting or in post', () => {
    const spec = buildFilmmakerDashboardSpec({
      projects: [mkProject({ status: 'production' })],
    });
    const inProd = spec.widgets!.find(
      (w) => w['data-testid'] === 'filmmaker-widget-in-production',
    );
    expect(inProd!.variant).toBe('attention');
  });

  it('leaves the in-production widget default-tinted when nothing is shooting', () => {
    const spec = buildFilmmakerDashboardSpec({
      projects: [mkProject({ status: 'pre_production' })],
    });
    const inProd = spec.widgets!.find(
      (w) => w['data-testid'] === 'filmmaker-widget-in-production',
    );
    expect(inProd!.variant).toBe('default');
  });

  it('handles the empty case — widgets render, activity has a CTA empty state', () => {
    const spec = buildFilmmakerDashboardSpec({ projects: [] });
    expect(spec.widgets).toHaveLength(4);
    expect(spec.activity!.events).toHaveLength(0);
    const emptyState = spec.activity!.emptyState as
      | Partial<EmptyStateProps>
      | undefined;
    expect(emptyState).toMatchObject({ title: 'No projects yet' });
    expect(emptyState?.primaryCta?.href).toBe(
      '/dashboard/os/filmmaker/projects',
    );
  });
});

// ─── buildFilmmakerActivityEvents — recent-projects feed ────────────────────

describe('buildFilmmakerActivityEvents — recent projects', () => {
  it('maps each project into a feed event linking to its project hub', () => {
    const events = buildFilmmakerActivityEvents([
      mkProject({ id: 'm-1', name: 'Billing service' }),
      mkProject({ id: 'm-2', name: 'Marketing reel' }),
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: 'm-1',
      actor: 'Billing service',
      href: '/dashboard/os/filmmaker/projects/m-1',
    });
  });

  it('tones the event by production status (warning for production)', () => {
    const events = buildFilmmakerActivityEvents([
      mkProject({ id: 'hot', status: 'production' }),
    ]);
    expect(events[0]!.tone).toBe('warning');
  });

  it('caps the feed at the most recent 8 projects', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      mkProject({ id: `m-${i}` }),
    );
    expect(buildFilmmakerActivityEvents(many)).toHaveLength(8);
  });
});

// ─── DashboardHub + filmmaker module — tier-1 → tier-2 convergence ──────────

describe('Filmmaker hub — DashboardHub convergence (behavior-preserving)', () => {
  const mod = findAgenticOsModule('filmmaker')!;

  it('renders the same metadata header the inline [slug] route produced', () => {
    render(<DashboardHub module={mod} />);
    expect(
      screen.getByRole('heading', { name: 'Filmmaker OS', level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Script to screen, end-to-end.'),
    ).toBeInTheDocument();
    // status badge — filmmaker is 'live' in the registry
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders the registry feature grid — all eight feature cards', () => {
    render(<DashboardHub module={mod} />);
    expect(
      screen.getByRole('heading', { name: 'Features', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText(`${mod.features.length} features available`)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Shot list builder/ }),
    ).toBeInTheDocument();
  });

  it('renders the declarative dashboard region with the four widgets', () => {
    const dashboard = buildFilmmakerDashboardSpec({
      projects: [mkProject({ name: 'Short Film 2026' })],
    });
    render(
      <DashboardHub module={mod} dashboard={dashboard} />,
    );
    expect(screen.getByTestId('dashboard-hub-region')).toBeInTheDocument();
    expect(screen.getByTestId('filmmaker-widget-projects')).toBeInTheDocument();
    expect(
      screen.getByTestId('filmmaker-widget-in-production'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('filmmaker-widget-next-target'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('filmmaker-widget-avg-progress'),
    ).toBeInTheDocument();
  });

  it('renders no dashboard region when the dashboard prop is omitted', () => {
    render(<DashboardHub module={mod} />);
    expect(screen.queryByTestId('dashboard-hub-region')).not.toBeInTheDocument();
  });

  it('surfaces the recent-projects ActivityFeed inside the dashboard region', () => {
    const dashboard = buildFilmmakerDashboardSpec({
      projects: [
        mkProject({ id: 'm-1', name: 'Billing service' }),
        mkProject({ id: 'm-2', name: 'Marketing reel' }),
      ],
    });
    render(
      <DashboardHub module={mod} dashboard={dashboard} />,
    );
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-m-1')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-m-2')).toBeInTheDocument();
  });
});

// ─── ProjectsManager — list-page primitive adoption ─────────────────────────

describe('ProjectsManager — FilmmakerListControls + EmptyState adoption', () => {
  it('renders the EntitySearch input and the SavedViews rail', () => {
    render(<ProjectsManager initialProjects={[mkProject()]} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Saved views' }),
    ).toBeInTheDocument();
    // the "All" reset pill is offered
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });

  it('renders each project card with the data preserved', () => {
    render(
      <ProjectsManager
        initialProjects={[
          mkProject({ id: 'p-a', name: 'Northern Lights' }),
          mkProject({ id: 'p-b', name: 'Desert Run' }),
        ]}
      />,
    );
    expect(screen.getByText('Northern Lights')).toBeInTheDocument();
    expect(screen.getByText('Desert Run')).toBeInTheDocument();
  });

  it('shows the EmptyState primitive (not an ad-hoc <p>) when there are no projects', () => {
    render(<ProjectsManager initialProjects={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });
});

// ─── CharacterListManager — list-page primitive adoption ────────────────────

describe('CharacterListManager — EntitySearch + EmptyState adoption', () => {
  it('renders the EntitySearch input', () => {
    render(
      <CharacterListManager
        projectId="p-1"
        initialCharacters={[mkCharacter()]}
      />,
    );
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('renders each character card with the data preserved', () => {
    render(
      <CharacterListManager
        projectId="p-1"
        initialCharacters={[
          mkCharacter({ id: 'c-a', name: 'Maria Vega' }),
          mkCharacter({ id: 'c-b', name: 'Tomas Reyes', role: 'antagonist' }),
        ]}
      />,
    );
    expect(screen.getByText('Maria Vega')).toBeInTheDocument();
    expect(screen.getByText('Tomas Reyes')).toBeInTheDocument();
  });

  it('shows the EmptyState primitive when there are no characters', () => {
    render(
      <CharacterListManager projectId="p-1" initialCharacters={[]} />,
    );
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No characters yet')).toBeInTheDocument();
  });
});

// ─── ShotListBuilder — list-page EmptyState adoption ────────────────────────

describe('ShotListBuilder — EmptyState adoption', () => {
  it('shows the EmptyState primitive when there are no shots', () => {
    render(<ShotListBuilder projectId="p-1" initial={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No shots yet')).toBeInTheDocument();
  });

  it('renders the shot table (not the empty state) when shots exist', () => {
    render(<ShotListBuilder projectId="p-1" initial={[mkShot()]} />);
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('Maria walks to the door')).toBeInTheDocument();
  });
});

// ─── StoryboardList — list-page EmptyState adoption ─────────────────────────

describe('StoryboardList — EmptyState adoption', () => {
  it('shows the EmptyState primitive when there are no storyboards', () => {
    render(<StoryboardList projectId="p-1" initial={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No storyboards yet')).toBeInTheDocument();
  });

  it('renders the storyboard list (not the empty state) when storyboards exist', () => {
    render(
      <StoryboardList
        projectId="p-1"
        initial={[mkStoryboard({ name: 'Opening sequence' })]}
      />,
    );
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('Opening sequence')).toBeInTheDocument();
  });
});

// ─── CharacterDetailWorkspace — CrossEntityTabs adoption ────────────────────

describe('CharacterDetailWorkspace — CrossEntityTabs adoption', () => {
  it('renders the related-entity tab strip with a Relationships count badge', () => {
    render(
      <CharacterDetailWorkspace
        projectId="p-1"
        character={mkCharacter({ name: 'Maria Vega', occupation: 'Welder' })}
        allCharacters={[mkCharacter()]}
        relationships={[]}
      />,
    );
    expect(
      screen.getByRole('tablist', { name: 'Related entities' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-identity')).toBeInTheDocument();
    expect(
      screen.getByTestId('cross-entity-tab-psychology'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-voice')).toBeInTheDocument();
    expect(
      screen.getByTestId('cross-entity-tab-relationships'),
    ).toBeInTheDocument();
    // count badge reflects the relationship count (0 still renders)
    expect(
      screen.getByTestId('cross-entity-tab-count-relationships'),
    ).toHaveTextContent('0');
  });

  it('renders the default (Identity) tab content with the character data preserved', () => {
    render(
      <CharacterDetailWorkspace
        projectId="p-1"
        character={mkCharacter({ occupation: 'Welder' })}
        allCharacters={[mkCharacter()]}
        relationships={[]}
      />,
    );
    const identityPanel = screen.getByTestId('cross-entity-panel-identity');
    expect(identityPanel).toBeInTheDocument();
    // the occupation field surfaces inside the Identity panel
    expect(within(identityPanel).getByText('Welder')).toBeInTheDocument();
  });
});
