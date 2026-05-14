/**
 * Health OS Wave C-1b — HealthHubOverview render tests.
 *
 * The hub dashboard strip composes shared-view primitives (DashboardWidget,
 * ChartCard, ActivityFeed, EmptyState) over already-loaded snapshots. These
 * tests lock the adoption: the widgets surface the right aggregate numbers,
 * the activity feed merges the four source kinds, and the zero-data path
 * renders the EmptyState door rather than an empty void.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { HealthHubOverview } from '@/components/agentic-os/health/hub/health-hub-overview';
import type {
  CbtLog,
  MoodEntry,
  RiskFlagRow,
  ScreenerRow,
} from '@/lib/agentic-os/health/repo';

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

describe('HealthHubOverview', () => {
  it('renders the four hub widgets', () => {
    render(
      <HealthHubOverview
        flags={[]}
        moodEntries={[]}
        screeners={[]}
        journalEntries={[]}
        cbtLogs={[]}
      />,
    );
    expect(screen.getByText('Active risk flags')).toBeInTheDocument();
    expect(screen.getByText('Average mood')).toBeInTheDocument();
    expect(screen.getByText('Latest screener')).toBeInTheDocument();
    expect(screen.getByText('Practice this period')).toBeInTheDocument();
  });

  it('shows the active-flag count and recent CBT count', () => {
    render(
      <HealthHubOverview
        flags={[mkFlag(), mkFlag({ id: 'f-2' })]}
        moodEntries={[]}
        screeners={[]}
        journalEntries={[]}
        cbtLogs={[mkCbt(), mkCbt({ id: 'c-2' }), mkCbt({ id: 'c-3' })]}
      />,
    );
    const flagWidget = screen
      .getByText('Active risk flags')
      .closest('[data-testid="dashboard-widget"]')!;
    expect(within(flagWidget as HTMLElement).getByText('2')).toBeInTheDocument();
    const practiceWidget = screen
      .getByText('Practice this period')
      .closest('[data-testid="dashboard-widget"]')!;
    expect(
      within(practiceWidget as HTMLElement).getByText('3'),
    ).toBeInTheDocument();
  });

  it('averages mood across the supplied entries', () => {
    render(
      <HealthHubOverview
        flags={[]}
        moodEntries={[
          mkMood({ id: 'a', moodScore: 4 }),
          mkMood({ id: 'b', moodScore: 8 }),
        ]}
        screeners={[]}
        journalEntries={[]}
        cbtLogs={[]}
      />,
    );
    // (4 + 8) / 2 = 6.0
    expect(screen.getByText('6.0')).toBeInTheDocument();
  });

  it('surfaces the latest screener score + key', () => {
    render(
      <HealthHubOverview
        flags={[]}
        moodEntries={[]}
        screeners={[
          mkScreener({ id: 'newest', score: 14, screener: 'gad7' }),
        ]}
        journalEntries={[]}
        cbtLogs={[]}
      />,
    );
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('GAD7')).toBeInTheDocument();
  });

  it('merges all four source kinds into the activity feed', () => {
    render(
      <HealthHubOverview
        flags={[]}
        moodEntries={[mkMood()]}
        screeners={[mkScreener()]}
        journalEntries={[
          { id: 'j-1', title: 'Tough day', entryAt: '2026-05-12T11:00:00.000Z' },
        ]}
        cbtLogs={[mkCbt()]}
      />,
    );
    const feed = screen.getByTestId('activity-feed');
    expect(within(feed).getByText(/mood check-in/i)).toBeInTheDocument();
    expect(within(feed).getByText(/Completed PHQ9/i)).toBeInTheDocument();
    expect(within(feed).getByText(/Tough day/i)).toBeInTheDocument();
    expect(within(feed).getByText(/CBT exercise/i)).toBeInTheDocument();
  });

  it('renders an EmptyState when there is no recent activity', () => {
    render(
      <HealthHubOverview
        flags={[]}
        moodEntries={[]}
        screeners={[]}
        journalEntries={[]}
        cbtLogs={[]}
      />,
    );
    expect(screen.getByText('Nothing logged yet')).toBeInTheDocument();
    expect(
      screen.getByText('Start with a mood check-in'),
    ).toBeInTheDocument();
  });
});
