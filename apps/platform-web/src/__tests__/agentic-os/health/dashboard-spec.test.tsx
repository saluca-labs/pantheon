/**
 * Health OS Wave D — dashboard-spec adapter tests.
 *
 * Wave D retrofits Health's hub dashboard from the bolted-on
 * `HealthHubOverview` sibling strip onto `DashboardHub`'s declarative
 * `dashboard` prop, via the pure `buildHealthDashboardSpec` adapter. These
 * tests lock the retrofit — they replace the old `hub-overview.test.tsx`
 * and keep coverage equivalent:
 *
 *   - the spec carries the mood / screener / activity / nutrition rollup
 *     widgets with the right aggregate numbers,
 *   - the merged activity feed spans all six source kinds,
 *   - the zero-data path still yields an `EmptyState` door (chart + feed),
 *   - rendering the spec through the real `_shared/views` primitives (the
 *     same way `DashboardHub`'s `DashboardRegion` does) produces the hub.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  buildHealthDashboardSpec,
  buildHealthActivityEvents,
  type HealthDashboardInput,
} from '@/lib/agentic-os/health/dashboard-spec';
import {
  ActivityFeed,
  ChartCard,
  DashboardWidget,
} from '@/components/agentic-os/_shared/views';
import type {
  ActivityEntry,
  CbtLog,
  MealEntry,
  MoodEntry,
  RiskFlagRow,
  ScreenerRow,
} from '@/lib/agentic-os/health/repo';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function mkMood(overrides: Partial<MoodEntry> = {}): MoodEntry {
  return {
    id: 'm-1',
    userId: 'u',
    tenantId: 't',
    moodScore: 6,
    energyScore: 5,
    anxietyScore: 3,
    sleepQuality: 'good',
    notes: null,
    entryAt: '2026-05-12T10:00:00.000Z',
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

function mkScreener(overrides: Partial<ScreenerRow> = {}): ScreenerRow {
  return {
    id: 's-1',
    userId: 'u',
    screener: 'phq9',
    answers: [],
    score: 8,
    severity: 'mild',
    crisisFlag: false,
    createdAt: '2026-05-12T09:00:00.000Z',
    ...overrides,
  };
}

function mkCbt(overrides: Partial<CbtLog> = {}): CbtLog {
  return {
    id: 'c-1',
    userId: 'u',
    tenantId: 't',
    kind: 'thought-record',
    exerciseId: null,
    startedAt: '2026-05-12T08:00:00.000Z',
    completedAt: '2026-05-12T08:30:00.000Z',
    moodBefore: 4,
    moodAfter: 6,
    data: {},
    notes: null,
    createdAt: '2026-05-12T08:00:00.000Z',
    updatedAt: '2026-05-12T08:30:00.000Z',
    ...overrides,
  };
}

function mkFlag(overrides: Partial<RiskFlagRow> = {}): RiskFlagRow {
  return {
    id: 'f-1',
    userId: 'u',
    tenantId: 't',
    kind: 'high-stress',
    severity: 'medium',
    source: 'screener',
    payload: {},
    createdAt: '2026-05-12T07:00:00.000Z',
    dismissedAt: null,
    dismissedByUserId: null,
    ...overrides,
  };
}

function mkMeal(overrides: Partial<MealEntry> = {}): MealEntry {
  return {
    id: 'meal-1',
    tenantId: 't',
    userId: 'u',
    entryDate: '2026-05-12',
    mealSlot: 'lunch',
    foodItemId: null,
    foodItem: null,
    freeformDescription: 'Chicken salad',
    servings: 1,
    kcalOverride: null,
    proteinGOverride: null,
    carbsGOverride: null,
    fatGOverride: null,
    notes: null,
    createdAt: '2026-05-12T12:00:00.000Z',
    updatedAt: '2026-05-12T12:00:00.000Z',
    nutrients: { kcal: 420, protein_g: 30, carbs_g: 20, fat_g: 18 },
    ...overrides,
  };
}

function mkActivity(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'act-1',
    tenantId: 't',
    userId: 'u',
    entryDate: '2026-05-12',
    activityType: 'Running',
    durationMin: 30,
    intensity: 'moderate',
    kcalBurned: 280,
    notes: null,
    metadata: {},
    createdAt: '2026-05-12T07:00:00.000Z',
    updatedAt: '2026-05-12T07:00:00.000Z',
    ...overrides,
  };
}

function emptyInput(
  overrides: Partial<HealthDashboardInput> = {},
): HealthDashboardInput {
  return {
    flags: [],
    moodEntries: [],
    screeners: [],
    journalEntries: [],
    cbtLogs: [],
    mealEntries: [],
    activityEntries: [],
    ...overrides,
  };
}

/**
 * Render a `DashboardSpec` the same way `DashboardHub`'s `DashboardRegion`
 * does — widget grid + chart + activity feed — so these are real render
 * tests over the retrofitted hub surface.
 */
function renderSpec(spec: ReturnType<typeof buildHealthDashboardSpec>) {
  return render(
    <div>
      <div data-testid="widget-grid">
        {spec.widgets?.map((w, i) => (
          <DashboardWidget key={w['data-testid'] ?? i} osSlug="health" {...w} />
        ))}
      </div>
      {spec.chart ? <ChartCard osSlug="health" {...spec.chart} /> : null}
      {spec.activity ? <ActivityFeed {...spec.activity} /> : null}
    </div>,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildHealthDashboardSpec — rollup widgets', () => {
  it('emits the six mood/screener/activity/nutrition rollup widgets', () => {
    const spec = buildHealthDashboardSpec(emptyInput());
    const ids = spec.widgets?.map((w) => w['data-testid']);
    expect(ids).toEqual([
      'health-widget-risk-flags',
      'health-widget-avg-mood',
      'health-widget-latest-screener',
      'health-widget-cbt-practice',
      'health-widget-nutrition',
      'health-widget-activity',
    ]);
  });

  it('renders the widget titles through the real primitive', () => {
    renderSpec(buildHealthDashboardSpec(emptyInput()));
    expect(screen.getByText('Active risk flags')).toBeInTheDocument();
    expect(screen.getByText('Average mood')).toBeInTheDocument();
    expect(screen.getByText('Latest screener')).toBeInTheDocument();
    expect(screen.getByText('CBT practice')).toBeInTheDocument();
    expect(screen.getByText('Nutrition (7d)')).toBeInTheDocument();
    expect(screen.getByText('Activity (7d)')).toBeInTheDocument();
  });

  it('shows the active-flag count and recent CBT count', () => {
    renderSpec(
      buildHealthDashboardSpec(
        emptyInput({
          flags: [mkFlag(), mkFlag({ id: 'f-2' })],
          cbtLogs: [mkCbt(), mkCbt({ id: 'c-2' }), mkCbt({ id: 'c-3' })],
        }),
      ),
    );
    const flagWidget = screen.getByTestId('health-widget-risk-flags');
    expect(within(flagWidget).getByText('2')).toBeInTheDocument();
    const cbtWidget = screen.getByTestId('health-widget-cbt-practice');
    expect(within(cbtWidget).getByText('3')).toBeInTheDocument();
  });

  it('averages mood across the supplied entries', () => {
    renderSpec(
      buildHealthDashboardSpec(
        emptyInput({
          moodEntries: [
            mkMood({ id: 'a', moodScore: 4 }),
            mkMood({ id: 'b', moodScore: 8 }),
          ],
        }),
      ),
    );
    // (4 + 8) / 2 = 6.0
    expect(screen.getByText('6.0')).toBeInTheDocument();
  });

  it('surfaces the latest screener score + key', () => {
    renderSpec(
      buildHealthDashboardSpec(
        emptyInput({
          screeners: [mkScreener({ id: 'newest', score: 14, screener: 'gad7' })],
        }),
      ),
    );
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('GAD7')).toBeInTheDocument();
  });

  it('rolls up meal count + calorie intake and activity sessions + minutes', () => {
    renderSpec(
      buildHealthDashboardSpec(
        emptyInput({
          mealEntries: [
            mkMeal({ id: 'meal-1' }),
            mkMeal({ id: 'meal-2', nutrients: { kcal: 580, protein_g: null, carbs_g: null, fat_g: null } }),
          ],
          activityEntries: [
            mkActivity({ id: 'act-1', durationMin: 30 }),
            mkActivity({ id: 'act-2', durationMin: 45 }),
          ],
        }),
      ),
    );
    const nutritionWidget = screen.getByTestId('health-widget-nutrition');
    expect(within(nutritionWidget).getByText('2')).toBeInTheDocument();
    // 420 + 580 = 1,000 kcal
    expect(within(nutritionWidget).getByText(/1,000 kcal/)).toBeInTheDocument();
    const activityWidget = screen.getByTestId('health-widget-activity');
    expect(within(activityWidget).getByText('2')).toBeInTheDocument();
    // 30 + 45 = 75 min
    expect(within(activityWidget).getByText(/75 min/)).toBeInTheDocument();
  });

  it('escalates the risk-flag widget to danger on a crisis-language flag', () => {
    const spec = buildHealthDashboardSpec(
      emptyInput({ flags: [mkFlag({ kind: 'crisis-language', severity: 'critical' })] }),
    );
    const flagWidget = spec.widgets?.find(
      (w) => w['data-testid'] === 'health-widget-risk-flags',
    );
    expect(flagWidget?.variant).toBe('danger');
  });
});

describe('buildHealthActivityEvents — merged feed', () => {
  it('merges all six source kinds into the activity feed', () => {
    renderSpec(
      buildHealthDashboardSpec(
        emptyInput({
          moodEntries: [mkMood()],
          screeners: [mkScreener()],
          journalEntries: [
            { id: 'j-1', title: 'Tough day', entryAt: '2026-05-12T11:00:00.000Z' },
          ],
          cbtLogs: [mkCbt()],
          mealEntries: [mkMeal()],
          activityEntries: [mkActivity()],
        }),
      ),
    );
    const feed = screen.getByTestId('activity-feed');
    expect(within(feed).getByText(/mood check-in/i)).toBeInTheDocument();
    expect(within(feed).getByText(/Completed PHQ9/i)).toBeInTheDocument();
    expect(within(feed).getByText(/Tough day/i)).toBeInTheDocument();
    expect(within(feed).getByText(/CBT exercise/i)).toBeInTheDocument();
    expect(within(feed).getByText(/Chicken salad/i)).toBeInTheDocument();
    expect(within(feed).getByText(/Running/i)).toBeInTheDocument();
  });

  it('gives every event a stable, source-prefixed id', () => {
    const events = buildHealthActivityEvents(
      emptyInput({
        moodEntries: [mkMood({ id: 'mood-x' })],
        mealEntries: [mkMeal({ id: 'meal-x' })],
        activityEntries: [mkActivity({ id: 'act-x' })],
      }),
    );
    const ids = events.map((e) => e.id);
    expect(ids).toContain('mood-mood-x');
    expect(ids).toContain('meal-meal-x');
    expect(ids).toContain('activity-act-x');
  });
});

describe('buildHealthDashboardSpec — zero-data doors', () => {
  it('renders an EmptyState in the activity feed when nothing is logged', () => {
    renderSpec(buildHealthDashboardSpec(emptyInput()));
    expect(screen.getByText('Nothing logged yet')).toBeInTheDocument();
    expect(screen.getByText('Start with a mood check-in')).toBeInTheDocument();
  });

  it('renders an EmptyState in the chart when there is no mood data', () => {
    renderSpec(buildHealthDashboardSpec(emptyInput()));
    expect(screen.getByText('No mood data yet')).toBeInTheDocument();
    expect(screen.getByText('Log a check-in')).toBeInTheDocument();
  });
});
