/**
 * CyberSec OS — Wave D (UI Depth Wave) specialization tests.
 *
 * Wave C-2a locked the uniform primitive-adoption swap (see
 * `wave-c-adoption.test.tsx`). Wave D specializes Cyber's flagship surfaces;
 * these tests lock that work:
 *
 *  - AlertTriageQueue   → triage rail (DashboardWidget grid) + severity-banded
 *                         queue; flat-view toggle preserved.
 *  - CaseWorkspaceTabs  → URL-synced (`?tab=`) deep-linking around
 *                         CrossEntityTabs; `normalizeCaseTab` validation.
 *  - CaseDetailWorkspace→ renders the 4-tab workspace, seeded from `activeTab`.
 *  - SigmaDetectionEditor → `classifyJsonTokens` Sigma-key / JSON tokenizer.
 *  - DetectionRuleForm  → hosts the SigmaDetectionEditor (not a plain textarea).
 *  - TrendsDashboard    → widget grid (remediation rail + chart grid + IOC
 *                         hit-rate viz).
 *  - buildIocHitRate    → pure hit-rate adapter over TrendsPayload.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// App Router context isn't available in jsdom — several Cyber components call
// the navigation hooks at module / render scope, so stub `next/navigation`.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => '/dashboard/os/cyber/cases/case-1',
  useSearchParams: () => new URLSearchParams(),
}));

// `@uiw/react-codemirror` mounts a real editor that is noisy in jsdom; mock it
// to a textarea so DetectionRuleForm / SigmaDetectionEditor render tests stay
// deterministic. The Sigma-highlight logic is tested directly via
// `classifyJsonTokens` (a pure export), not through the CM host.
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
    EditorView: { theme: () => ({}), lineWrapping: {} },
    Decoration: {
      mark: () => ({}),
      line: () => ({}),
      set: () => ({}),
      none: {},
    },
    ViewPlugin: { fromClass: () => ({}) },
  };
});

import { AlertTriageQueue } from '@/components/agentic-os/cyber/AlertTriageQueue';
import { CaseDetailWorkspace } from '@/components/agentic-os/cyber/cases/CaseDetailWorkspace';
import { normalizeCaseTab } from '@/components/agentic-os/cyber/cases/CaseWorkspaceTabs';
import { DetectionRuleForm } from '@/components/agentic-os/cyber/detections/DetectionRuleForm';
import { classifyJsonTokens } from '@/components/agentic-os/cyber/detections/SigmaDetectionEditor';
import { TrendsDashboard } from '@/components/agentic-os/cyber/trends/TrendsDashboard';
import { buildIocHitRate } from '@/lib/agentic-os/cyber/trends-spec';
import type { Alert } from '@/lib/agentic-os/cyber/triage';
import type { CaseDetail } from '@/lib/agentic-os/cyber/cases';
import type { TrendsPayload } from '@/lib/agentic-os/cyber/repo';

// ─── Fixtures ───────────────────────────────────────────────────────────────

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

function mkCaseDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: 'case-1',
    ownerId: 'u-1',
    title: 'Suspected lateral movement',
    summary: 'Multiple hosts touched in quick succession.',
    severity: 'high',
    status: 'investigating',
    priority: 'p2',
    assignedTo: 'analyst@example.com',
    tactic: 'lateral-movement',
    technique: 'T1021',
    tags: ['incident', 'prod'],
    closedAt: null,
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T11:00:00.000Z',
    linkedAlerts: [],
    evidence: [],
    tasks: [],
    events: [],
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
    iocHitsLast30d: 4,
    topVulnerableAssets: [],
    ...overrides,
  };
}

// ─── AlertTriageQueue — flagship triage workspace ───────────────────────────

describe('AlertTriageQueue — flagship triage workspace', () => {
  it('renders the triage rail as a DashboardWidget grid with status counts', () => {
    render(
      <AlertTriageQueue
        initialAlerts={[
          mkAlert({ id: 'a-1', status: 'open' }),
          mkAlert({ id: 'a-2', status: 'investigating' }),
        ]}
      />,
    );
    expect(screen.getByTestId('alert-triage-rail')).toBeInTheDocument();
    expect(screen.getByTestId('alert-rail-open')).toBeInTheDocument();
    expect(screen.getByTestId('alert-rail-investigating')).toBeInTheDocument();
    expect(screen.getByTestId('alert-rail-resolved')).toBeInTheDocument();
    expect(screen.getByTestId('alert-rail-false-positive')).toBeInTheDocument();
  });

  it('groups the queue into severity bands by default', () => {
    render(
      <AlertTriageQueue
        initialAlerts={[
          mkAlert({ id: 'a-crit', severity: 'critical', title: 'Ransomware detonation' }),
          mkAlert({ id: 'a-high', severity: 'high', title: 'SSH brute force' }),
        ]}
      />,
    );
    expect(screen.getByTestId('alert-queue-grouped')).toBeInTheDocument();
    expect(screen.getByTestId('alert-band-critical')).toBeInTheDocument();
    expect(screen.getByTestId('alert-band-high')).toBeInTheDocument();
    expect(screen.getByTestId('alert-band-count-critical')).toHaveTextContent(
      '1',
    );
    // domain data still surfaces in each band
    expect(screen.getByText('Ransomware detonation')).toBeInTheDocument();
    expect(screen.getByText('SSH brute force')).toBeInTheDocument();
  });

  it('keeps the search rail + saved-views from Wave C-2a', () => {
    render(<AlertTriageQueue initialAlerts={[mkAlert()]} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Saved views' }),
    ).toBeInTheDocument();
  });

  it('shows the EmptyState primitive when the queue is empty', () => {
    render(<AlertTriageQueue initialAlerts={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(
      screen.getByText('No active alerts — all clear'),
    ).toBeInTheDocument();
  });
});

// ─── CaseWorkspaceTabs — deep-linking ───────────────────────────────────────

describe('normalizeCaseTab — `?tab=` deep-link validation', () => {
  it('passes through the four workspace tab keys + overview', () => {
    expect(normalizeCaseTab('overview')).toBe('overview');
    expect(normalizeCaseTab('alerts')).toBe('alerts');
    expect(normalizeCaseTab('evidence')).toBe('evidence');
    expect(normalizeCaseTab('tasks')).toBe('tasks');
    expect(normalizeCaseTab('timeline')).toBe('timeline');
  });

  it('falls back to overview for absent / unknown values', () => {
    expect(normalizeCaseTab(undefined)).toBe('overview');
    expect(normalizeCaseTab(null)).toBe('overview');
    expect(normalizeCaseTab('bogus')).toBe('overview');
  });
});

describe('CaseDetailWorkspace — 4-tab workspace', () => {
  it('renders all four linked-entity tabs plus overview', () => {
    render(<CaseDetailWorkspace caseDetail={mkCaseDetail()} />);
    expect(screen.getByTestId('case-workspace-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-evidence')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-timeline')).toBeInTheDocument();
  });

  it('seeds the active tab from the validated `activeTab` deep-link', () => {
    render(
      <CaseDetailWorkspace caseDetail={mkCaseDetail()} activeTab="evidence" />,
    );
    expect(screen.getByTestId('cross-entity-tab-evidence')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('carries linked-entity counts onto the tab badges', () => {
    render(
      <CaseDetailWorkspace
        caseDetail={mkCaseDetail({
          linkedAlerts: [
            { id: 'la-1', title: 'x', severity: 'high', occurredAt: '2026-05-12T10:00:00.000Z' },
          ],
        })}
      />,
    );
    expect(
      screen.getByTestId('cross-entity-tab-count-alerts'),
    ).toHaveTextContent('1');
  });
});

// ─── SigmaDetectionEditor — Sigma-key / JSON tokenizer ──────────────────────

describe('classifyJsonTokens — Sigma detection-body highlighter', () => {
  it('classifies Sigma keys distinctly from ordinary object keys', () => {
    const tokens = classifyJsonTokens(
      '{ "condition": "selection", "event_type": "auth_failure" }',
    );
    const condition = tokens.find((t) => t.text === '"condition"');
    const eventType = tokens.find((t) => t.text === '"event_type"');
    expect(condition!.class).toBe('cm-sigma-key');
    expect(eventType!.class).toBe('cm-sigma-objkey');
  });

  it('classifies string / number / bool literals by type', () => {
    const tokens = classifyJsonTokens('{ "a": "str", "b": 10, "c": true }');
    expect(tokens.find((t) => t.text === '"str"')!.class).toBe(
      'cm-sigma-string',
    );
    expect(tokens.find((t) => t.text === '10')!.class).toBe('cm-sigma-number');
    expect(tokens.find((t) => t.text === 'true')!.class).toBe('cm-sigma-bool');
  });

  it('tolerates a half-typed document without throwing', () => {
    expect(() => classifyJsonTokens('{ "condition": "sel')).not.toThrow();
    const tokens = classifyJsonTokens('{ "condition": "sel');
    expect(tokens.some((t) => t.class === 'cm-sigma-key')).toBe(true);
  });
});

describe('DetectionRuleForm — hosts the SigmaDetectionEditor', () => {
  it('renders the SigmaDetectionEditor (not a plain JSON textarea)', () => {
    render(<DetectionRuleForm />);
    expect(screen.getByTestId('sigma-detection-editor')).toBeInTheDocument();
    expect(
      screen.getByText('Sigma detection body (JSON)'),
    ).toBeInTheDocument();
  });
});

// ─── TrendsDashboard — widget grid ──────────────────────────────────────────

describe('TrendsDashboard — widget grid', () => {
  it('renders the exposure-remediation rail as DashboardWidget tiles', () => {
    render(<TrendsDashboard trends={mkTrends()} />);
    expect(screen.getByTestId('trends-remediation-rail')).toBeInTheDocument();
    expect(screen.getByTestId('trends-widget-mttr')).toBeInTheDocument();
    expect(
      screen.getByTestId('trends-widget-open-exposures'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('trends-widget-closed-30d')).toBeInTheDocument();
  });

  it('renders the IOC hit-rate viz and top-assets widget', () => {
    render(<TrendsDashboard trends={mkTrends()} />);
    expect(screen.getByText('IOC hit rate')).toBeInTheDocument();
    expect(screen.getByTestId('trends-widget-top-assets')).toBeInTheDocument();
  });
});

// ─── buildIocHitRate — pure hit-rate adapter ────────────────────────────────

describe('buildIocHitRate — IOC hit-rate adapter', () => {
  it('computes hit rate as IOC hits / total alerts per window', () => {
    // alertsByDay totals: 5 + 3 = 8 over the (≤7d) series → both windows = 8.
    const rate = buildIocHitRate(mkTrends());
    const r7 = rate.find((p) => p.window === '7d')!;
    const r30 = rate.find((p) => p.window === '30d')!;
    expect(r7.hits).toBe(2);
    expect(r7.totalAlerts).toBe(8);
    expect(r7.hitRatePct).toBe(25); // 2/8 = 25%
    expect(r30.hits).toBe(4);
    expect(r30.hitRatePct).toBe(50); // 4/8 = 50%
  });

  it('returns a 0 rate (no divide-by-zero) when there are no alerts', () => {
    const rate = buildIocHitRate(
      mkTrends({ alertsByDay: [], iocHitsLast7d: 0, iocHitsLast30d: 0 }),
    );
    expect(rate.every((p) => p.hitRatePct === 0)).toBe(true);
    expect(rate.every((p) => p.totalAlerts === 0)).toBe(true);
  });
});
