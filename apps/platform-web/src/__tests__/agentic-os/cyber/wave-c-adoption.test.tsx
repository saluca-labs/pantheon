/**
 * CyberSec OS — Wave C (UI Depth Wave) primitive-adoption render tests.
 *
 * Cyber had no component-level render tests before Wave C-2a — the prior
 * suite is all logic / repo / route coverage. These tests lock the
 * presentation-layer swap to the shared `_shared/views` primitives:
 *  - buildCyberDashboardSpec → DashboardWidget specs + ChartCard + ActivityFeed
 *  - CyberListControls       → EntitySearch + SavedViews
 *  - IocsManager (list)      → CyberListControls + EmptyState
 *  - CasesManager (list)     → EmptyState
 *  - CaseTimelinePanel       → ActivityFeed
 *  - DetectionRunHistory     → ActivityFeed (renderItem escape hatch)
 *
 * They assert the primitive structure renders AND that the same domain data
 * still surfaces (counts, titles, severities), so the "behavior-preserving"
 * contract is verifiable.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// `CaseTimelinePanel` calls `useRouter()` at module scope; jsdom has no
// App Router context, so stub `next/navigation` for the render tests.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

import { buildCyberDashboardSpec } from '@/lib/agentic-os/cyber/dashboard-spec';
import { CyberListControls } from '@/components/agentic-os/cyber/CyberListControls';
import { IocsManager } from '@/components/agentic-os/cyber/iocs/IocsManager';
import { CasesManager } from '@/components/agentic-os/cyber/cases/CasesManager';
import { CaseTimelinePanel } from '@/components/agentic-os/cyber/cases/CaseTimelinePanel';
import { DetectionRunHistory } from '@/components/agentic-os/cyber/detections/DetectionRunHistory';
import type { Alert } from '@/lib/agentic-os/cyber/triage';
import type {
  CyberDashboardStats,
  TrendsPayload,
} from '@/lib/agentic-os/cyber/repo';
import type { Ioc } from '@/lib/agentic-os/cyber/iocs';
import type { CaseEvent } from '@/lib/agentic-os/cyber/cases';
import type { DetectionRun } from '@/lib/agentic-os/cyber/detections';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function mkStats(overrides: Partial<CyberDashboardStats> = {}): CyberDashboardStats {
  return {
    openAlerts: 12,
    criticalAlerts: 3,
    totalAssets: 40,
    criticalAssets: 5,
    activeLogSources: 7,
    alertsLast24h: 4,
    alertsLast7d: 18,
    ...overrides,
  };
}

function mkTrends(overrides: Partial<TrendsPayload> = {}): TrendsPayload {
  return {
    alertsByDay: [
      { date: '2026-05-10', total: 5, critical: 1, high: 2 },
      { date: '2026-05-11', total: 3, critical: 0, high: 1 },
    ],
    openVulnsBySeverity: [{ severity: 'high', count: 4 }],
    exposuresMttrDays: 6.2,
    exposuresOpen: 9,
    exposuresClosedLast30d: 11,
    iocHitsLast7d: 2,
    iocHitsLast30d: 8,
    topVulnerableAssets: [],
    ...overrides,
  };
}

function mkAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    title: 'Brute force on SSH',
    description: '10+ failed logins',
    severity: 'high',
    category: 'authentication',
    status: 'open',
    source: 'Wazuh HIDS',
    sourceIp: '198.51.100.42',
    assignedTo: null,
    notes: null,
    occurredAt: '2026-05-12T10:00:00.000Z',
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    assetId: null,
    logSourceId: null,
    tactic: null,
    technique: null,
    correlationId: null,
    tags: [],
    raw: {},
    ...overrides,
  };
}

function mkIoc(overrides: Partial<Ioc> = {}): Ioc {
  return {
    id: 'ioc-1',
    ownerId: 'u-1',
    kind: 'ipv4',
    value: '203.0.113.99',
    title: 'Known C2 endpoint',
    description: null,
    threatType: 'c2',
    confidence: 80,
    firstSeenAt: '2026-05-01T00:00:00.000Z',
    lastSeenAt: '2026-05-12T00:00:00.000Z',
    expiresAt: null,
    source: null,
    tags: [],
    references: [],
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    ...overrides,
  };
}

function mkEvent(overrides: Partial<CaseEvent> = {}): CaseEvent {
  return {
    id: 'ev-1',
    caseId: 'case-1',
    kind: 'note',
    author: 'analyst@example.com',
    body: 'Initial triage note',
    payload: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

function mkRun(overrides: Partial<DetectionRun> = {}): DetectionRun {
  return {
    id: 'run-1',
    ruleId: 'rule-1',
    alertId: 'alert-abcdef12',
    triggeredAt: '2026-05-12T10:00:00.000Z',
    payload: { matched: true },
    createdAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

// ─── buildCyberDashboardSpec — the hub `dashboard` prop adapter ──────────────

describe('buildCyberDashboardSpec — hub dashboard spec', () => {
  it('builds six aggregate-stat widgets, each linking to its list page', () => {
    const spec = buildCyberDashboardSpec({
      stats: mkStats(),
      trends: mkTrends(),
      recentAlerts: [],
    });
    expect(spec.widgets).toHaveLength(6);
    const testIds = spec.widgets!.map((w) => w['data-testid']);
    expect(testIds).toContain('cyber-widget-open-alerts');
    expect(testIds).toContain('cyber-widget-critical-alerts');
    expect(testIds).toContain('cyber-widget-exposures');
    expect(testIds).toContain('cyber-widget-ioc-hits');
    // every widget drills into a route
    for (const w of spec.widgets!) {
      expect(w.href).toMatch(/^\/dashboard\/os\/cyber\//);
    }
  });

  it('tints the alert widgets danger / attention when criticals are open', () => {
    const spec = buildCyberDashboardSpec({
      stats: mkStats({ criticalAlerts: 3 }),
      trends: mkTrends(),
      recentAlerts: [],
    });
    const open = spec.widgets!.find(
      (w) => w['data-testid'] === 'cyber-widget-open-alerts',
    );
    const critical = spec.widgets!.find(
      (w) => w['data-testid'] === 'cyber-widget-critical-alerts',
    );
    expect(open!.variant).toBe('danger');
    expect(critical!.variant).toBe('attention');
  });

  it('builds the alert-volume ChartCard from trends.alertsByDay', () => {
    const spec = buildCyberDashboardSpec({
      stats: mkStats(),
      trends: mkTrends(),
      recentAlerts: [],
    });
    expect(spec.chart).toBeDefined();
    expect(spec.chart!.kind).toBe('bar');
    expect(spec.chart!.series).toHaveLength(3);
    const total = spec.chart!.series.find((s) => s.key === 'total');
    expect(total!.data).toEqual([
      { x: '2026-05-10', y: 5 },
      { x: '2026-05-11', y: 3 },
    ]);
  });

  it('maps recent alerts into severity-toned ActivityFeed events', () => {
    const spec = buildCyberDashboardSpec({
      stats: mkStats(),
      trends: mkTrends(),
      recentAlerts: [
        mkAlert({ id: 'a-crit', severity: 'critical' }),
        mkAlert({ id: 'a-low', severity: 'low' }),
      ],
    });
    expect(spec.activity!.events).toHaveLength(2);
    expect(spec.activity!.events[0]).toMatchObject({
      id: 'a-crit',
      tone: 'danger',
      href: '/dashboard/os/cyber/alerts',
    });
    expect(spec.activity!.events[1]!.tone).toBe('accent');
  });
});

// ─── CyberListControls — EntitySearch + SavedViews composition ──────────────

describe('CyberListControls — search + saved-views rail', () => {
  it('renders the EntitySearch input and the SavedViews rail', () => {
    render(
      <CyberListControls
        search=""
        onSearchChange={() => {}}
        searchPlaceholder="Search alerts…"
        filters={{}}
        onApplyQuery={() => {}}
        savedViewKey="alerts"
      />,
    );
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Saved views' }),
    ).toBeInTheDocument();
    // the "All" reset pill is offered
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });

  it('renders supplied filter controls and the action slot', () => {
    render(
      <CyberListControls
        search=""
        onSearchChange={() => {}}
        searchPlaceholder="Search…"
        filters={{}}
        onApplyQuery={() => {}}
        savedViewKey="cases"
        filterControls={<span data-testid="my-filter">filter</span>}
        actions={<button type="button">New case</button>}
      />,
    );
    expect(screen.getByTestId('my-filter')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New case' }),
    ).toBeInTheDocument();
  });
});

// ─── IocsManager — list-page primitive adoption ─────────────────────────────

describe('IocsManager — EntitySearch / SavedViews / EmptyState adoption', () => {
  it('renders the CyberListControls rail above the list', () => {
    render(<IocsManager initialIocs={[mkIoc()]} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Saved views' }),
    ).toBeInTheDocument();
  });

  it('renders each IOC card with the data preserved', () => {
    render(
      <IocsManager
        initialIocs={[
          mkIoc({ id: 'i-1', value: '203.0.113.99' }),
          mkIoc({ id: 'i-2', value: 'evil.example.com', kind: 'domain' }),
        ]}
      />,
    );
    expect(screen.getByText('203.0.113.99')).toBeInTheDocument();
    expect(screen.getByText('evil.example.com')).toBeInTheDocument();
  });

  it('shows the EmptyState primitive (not an ad-hoc <p>) when empty', () => {
    render(<IocsManager initialIocs={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No IOCs yet')).toBeInTheDocument();
  });
});

// ─── CasesManager — list-page EmptyState adoption ───────────────────────────

describe('CasesManager — EmptyState adoption', () => {
  it('shows the EmptyState primitive when there are no cases', () => {
    render(<CasesManager initialCases={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No cases yet')).toBeInTheDocument();
  });
});

// ─── CaseTimelinePanel — ActivityFeed adoption ──────────────────────────────

describe('CaseTimelinePanel — ActivityFeed adoption', () => {
  it('renders the ActivityFeed empty state when there are no events', () => {
    render(<CaseTimelinePanel caseId="case-1" events={[]} />);
    expect(screen.getByText('No events recorded yet')).toBeInTheDocument();
  });

  it('renders one ActivityFeed event row per case event, body preserved', () => {
    render(
      <CaseTimelinePanel
        caseId="case-1"
        events={[
          mkEvent({ id: 'e-a', body: 'Contained the host' }),
          mkEvent({ id: 'e-b', kind: 'status_change', body: null }),
        ]}
      />,
    );
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-e-a')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-e-b')).toBeInTheDocument();
    expect(screen.getByText('Contained the host')).toBeInTheDocument();
  });

  it('keeps the "Add note" form alongside the feed', () => {
    render(<CaseTimelinePanel caseId="case-1" events={[]} />);
    expect(screen.getByText('Add note')).toBeInTheDocument();
  });
});

// ─── DetectionRunHistory — ActivityFeed adoption ────────────────────────────

describe('DetectionRunHistory — ActivityFeed adoption', () => {
  it('renders the ActivityFeed empty state when there are no runs', () => {
    render(<DetectionRunHistory runs={[]} />);
    expect(
      screen.getByText('No detection runs recorded yet'),
    ).toBeInTheDocument();
  });

  it('renders a feed row per run and preserves the JSON payload preview', () => {
    render(<DetectionRunHistory runs={[mkRun({ id: 'r-1' })]} />);
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-r-1')).toBeInTheDocument();
    // the alert reference + payload JSON still surface via renderItem
    expect(screen.getByText(/alert alert-ab/)).toBeInTheDocument();
    expect(screen.getByText(/"matched": true/)).toBeInTheDocument();
  });
});
