/**
 * Filmmaker OS — Wave D (UI Depth Wave) specialization render tests.
 *
 * Wave C-5 locked the uniform primitive-adoption swap (see
 * `wave-c-adoption.test.tsx`). Wave D specializes Filmmaker's depth surfaces;
 * these tests lock that work:
 *
 *  - StoryboardWorkspace  → polished panel grid + EmptyState primitive
 *                           (was an ad-hoc dashed <div>).
 *  - ScheduleTimelineView → stripboard's dated days surfaced through the
 *                           shared `TimelineView` primitive (a specialization;
 *                           the bespoke two-pane editor stays — see the PR
 *                           note). Renders null when nothing is dated.
 *  - StripboardWorkspace  → hosts the timeline overview above the editor.
 *  - ScreenplayWorkspace  → focused/distraction-free writing mode toggle;
 *                           header chrome + scene rail collapse, save flow
 *                           preserved.
 *
 * They assert the specialized structure renders AND that the same domain data
 * still surfaces, so the "behavior-preserving" contract is verifiable.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Filmmaker client components call `useRouter()` at module scope; jsdom has no
// App Router context, so stub `next/navigation` (mirrors the Wave C suite).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

// `@uiw/react-codemirror` mounts a real editor that is noisy in jsdom; mock it
// to a textarea so the ScreenplayWorkspace focused-mode render stays
// deterministic. Focused mode is pure presentation — no CM behaviour is
// asserted here.
vi.mock('@uiw/react-codemirror', () => {
  const React = require('react');
  const CodeMirror = React.forwardRef(
    (
      props: { value?: string; onChange?: (v: string) => void },
      _ref: unknown,
    ) =>
      React.createElement('textarea', {
        'data-testid': 'cm-mock',
        defaultValue: props.value,
        onChange: (e: { target: { value: string } }) =>
          props.onChange?.(e.target.value),
      }),
  );
  return {
    __esModule: true,
    default: CodeMirror,
    EditorView: {
      theme: () => ({}),
      lineWrapping: {},
      scrollIntoView: () => ({}),
    },
    Decoration: { line: () => ({}), set: () => ({}), none: {} },
    ViewPlugin: { fromClass: () => ({}) },
  };
});

import { StoryboardWorkspace } from '@/components/agentic-os/filmmaker/storyboard/StoryboardWorkspace';
import { ScheduleTimelineView } from '@/components/agentic-os/filmmaker/schedule/ScheduleTimelineView';
import { StripboardWorkspace } from '@/components/agentic-os/filmmaker/schedule/StripboardWorkspace';
import { ScreenplayWorkspace } from '@/components/agentic-os/filmmaker/screenplay/ScreenplayWorkspace';
import type {
  StoryboardWithPanels,
  StoryboardPanel,
} from '@/lib/agentic-os/filmmaker/storyboards';
import type {
  ShootingDayWithStrips,
  ProjectScheduleSummary,
} from '@/lib/agentic-os/filmmaker/schedule';
import type {
  Screenplay,
  ScreenplayVersion,
} from '@/lib/agentic-os/filmmaker/screenplays';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function mkPanel(overrides: Partial<StoryboardPanel> = {}): StoryboardPanel {
  return {
    id: 'panel-1',
    storyboardId: 'sb-1',
    position: 1,
    imageUrl: null,
    cameraAngle: 'EYE LEVEL',
    cameraMove: 'STATIC',
    shotSize: 'MS',
    description: 'Maria steps into the doorway.',
    dialogueExcerpt: null,
    durationSeconds: 6,
    notes: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkStoryboard(
  overrides: Partial<StoryboardWithPanels> = {},
): StoryboardWithPanels {
  return {
    id: 'sb-1',
    projectId: 'p-1',
    name: 'Opening sequence',
    description: null,
    sceneId: null,
    status: 'draft',
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    panels: [],
    ...overrides,
  };
}

function mkDay(
  overrides: Partial<ShootingDayWithStrips> = {},
): ShootingDayWithStrips {
  return {
    id: 'd-1',
    projectId: 'p-1',
    shootDate: null,
    dayNumber: 1,
    label: null,
    callTime: null,
    wrapTime: null,
    unit: 'main',
    status: 'planned',
    notes: null,
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    strips: [],
    ...overrides,
  };
}

const EMPTY_SUMMARY: ProjectScheduleSummary = {
  totalDays: 0,
  scheduledScenes: 0,
  unscheduledScenes: 0,
  totalScenes: 0,
  totalEighths: 0,
  scheduledEighths: 0,
  totalScheduledMinutes: 0,
};

function mkScreenplay(overrides: Partial<Screenplay> = {}): Screenplay {
  return {
    id: 'scr-1',
    projectId: 'p-1',
    title: 'Northern Lights',
    format: 'feature',
    status: 'draft',
    headVersionId: 'v-1',
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

function mkVersion(
  overrides: Partial<ScreenplayVersion> = {},
): ScreenplayVersion {
  return {
    id: 'v-1',
    screenplayId: 'scr-1',
    versionNumber: 1,
    label: null,
    isHead: true,
    fountainText: 'INT. CABIN - NIGHT\n\nMaria enters.',
    wordCount: 4,
    pageCountEstimate: 0.1,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── StoryboardWorkspace — panel-grid polish + EmptyState ───────────────────

describe('StoryboardWorkspace — panel grid polish', () => {
  it('shows the EmptyState primitive (not an ad-hoc div) when there are no panels', () => {
    render(
      <StoryboardWorkspace
        projectId="p-1"
        storyboard={mkStoryboard({ panels: [] })}
        scenes={[]}
      />,
    );
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No panels yet')).toBeInTheDocument();
    // the "door" CTA is offered
    expect(
      screen.getByRole('button', { name: /Add first panel/ }),
    ).toBeInTheDocument();
  });

  it('renders the panel grid with each panel\'s data preserved', () => {
    render(
      <StoryboardWorkspace
        projectId="p-1"
        storyboard={mkStoryboard({
          panels: [
            mkPanel({ id: 'pa', position: 1, description: 'Wide of the bay.' }),
            mkPanel({ id: 'pb', position: 2, description: 'Close on hands.' }),
          ],
        })}
        scenes={[]}
      />,
    );
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('Wide of the bay.')).toBeInTheDocument();
    expect(screen.getByText('Close on hands.')).toBeInTheDocument();
    // panel position chips still render
    expect(screen.getByText('Panel 1')).toBeInTheDocument();
    expect(screen.getByText('Panel 2')).toBeInTheDocument();
  });

  it('keeps the panel reorder controls (bespoke behavior preserved)', () => {
    render(
      <StoryboardWorkspace
        projectId="p-1"
        storyboard={mkStoryboard({ panels: [mkPanel(), mkPanel({ id: 'p2', position: 2 })] })}
        scenes={[]}
      />,
    );
    expect(screen.getAllByLabelText('Move up').length).toBe(2);
    expect(screen.getAllByLabelText('Move down').length).toBe(2);
  });
});

// ─── ScheduleTimelineView — TimelineView specialization ─────────────────────

describe('ScheduleTimelineView — stripboard TimelineView adoption', () => {
  it('renders nothing when no day has a shootDate', () => {
    const { container } = render(
      <ScheduleTimelineView days={[mkDay({ shootDate: null })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the shared TimelineView for dated days', () => {
    render(
      <ScheduleTimelineView
        days={[
          mkDay({ id: 'd1', shootDate: '2026-06-10', dayNumber: 1 }),
          mkDay({ id: 'd2', shootDate: '2026-06-12', dayNumber: 2 }),
        ]}
      />,
    );
    expect(screen.getByTestId('schedule-timeline')).toBeInTheDocument();
    // the primitive itself rendered
    expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    // each dated day is a timeline item, keyed by day id
    expect(screen.getByTestId('timeline-item-d1')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-item-d2')).toBeInTheDocument();
  });

  it('counts dated vs undated days in the section header', () => {
    render(
      <ScheduleTimelineView
        days={[
          mkDay({ id: 'd1', shootDate: '2026-06-10' }),
          mkDay({ id: 'd2', shootDate: null }),
        ]}
      />,
    );
    expect(screen.getByText('(1 dated)')).toBeInTheDocument();
    expect(screen.getByText(/1 undated day below/)).toBeInTheDocument();
  });

  it('stacks parallel-unit days into per-unit lanes', () => {
    render(
      <ScheduleTimelineView
        days={[
          mkDay({ id: 'main1', shootDate: '2026-06-10', unit: 'main' }),
          mkDay({
            id: 'su1',
            shootDate: '2026-06-10',
            unit: 'second_unit',
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('timeline-lane-main')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-lane-second_unit')).toBeInTheDocument();
  });
});

// ─── StripboardWorkspace — hosts the timeline overview ──────────────────────

describe('StripboardWorkspace — timeline overview integration', () => {
  it('renders the timeline overview above the editor when days are dated', () => {
    render(
      <StripboardWorkspace
        projectId="p-1"
        unscheduledScenes={[]}
        days={[mkDay({ id: 'd1', shootDate: '2026-06-10' })]}
        summary={{ ...EMPTY_SUMMARY, totalDays: 1 }}
      />,
    );
    expect(screen.getByTestId('schedule-timeline')).toBeInTheDocument();
    // the bespoke two-pane editor is still present (capability preserved)
    expect(screen.getByText(/Unscheduled scenes/)).toBeInTheDocument();
    expect(screen.getByText(/Shooting days/)).toBeInTheDocument();
  });

  it('omits the timeline overview entirely when no day is dated', () => {
    render(
      <StripboardWorkspace
        projectId="p-1"
        unscheduledScenes={[]}
        days={[mkDay({ id: 'd1', shootDate: null })]}
        summary={{ ...EMPTY_SUMMARY, totalDays: 1 }}
      />,
    );
    expect(screen.queryByTestId('schedule-timeline')).not.toBeInTheDocument();
    // editor still renders
    expect(screen.getByText(/Shooting days/)).toBeInTheDocument();
  });
});

// ─── ScreenplayWorkspace — focused mode ─────────────────────────────────────

describe('ScreenplayWorkspace — focused writing mode', () => {
  it('renders the full chrome by default with a Focus toggle', () => {
    render(
      <ScreenplayWorkspace
        projectId="p-1"
        screenplay={mkScreenplay()}
        headVersion={mkVersion()}
        scenes={[]}
        versions={[mkVersion()]}
      />,
    );
    expect(screen.queryByTestId('screenplay-focused')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Focus' })).toBeInTheDocument();
  });

  it('enters focused mode — chrome collapses, the editor stays', () => {
    render(
      <ScreenplayWorkspace
        projectId="p-1"
        screenplay={mkScreenplay()}
        headVersion={mkVersion()}
        scenes={[]}
        versions={[mkVersion()]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    const focused = screen.getByTestId('screenplay-focused');
    expect(focused).toBeInTheDocument();
    // the editor is still mounted inside focused mode
    expect(within(focused).getByTestId('cm-mock')).toBeInTheDocument();
    // save flow is preserved
    expect(
      within(focused).getByRole('button', { name: /Save draft/ }),
    ).toBeInTheDocument();
    // an explicit exit affordance is offered
    expect(
      within(focused).getByRole('button', { name: /Exit focus/ }),
    ).toBeInTheDocument();
  });

  it('exits focused mode back to the full chrome', () => {
    render(
      <ScreenplayWorkspace
        projectId="p-1"
        screenplay={mkScreenplay()}
        headVersion={mkVersion()}
        scenes={[]}
        versions={[mkVersion()]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    fireEvent.click(screen.getByRole('button', { name: /Exit focus/ }));
    expect(screen.queryByTestId('screenplay-focused')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Focus' })).toBeInTheDocument();
  });
});
