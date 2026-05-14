/**
 * Maker OS — Wave D.4 (UI Depth Wave) specialization render tests.
 *
 * Wave C-3a locked the uniform primitive-adoption swap (see
 * `wave-c-adoption.test.tsx`). Wave D.4 specializes Maker's depth surfaces;
 * these tests lock that work:
 *
 *  - BuildLogFeed         → redesigned rich entry rows on top of the Wave C
 *                           `ActivityFeed` adoption: relative timestamps,
 *                           a feed-stats header strip, a photo grid with a
 *                           "+N" overflow tile, and an attachment chip row.
 *  - BomEditor            → per-line card grid with sourcing-status pills,
 *                           a labelled totals stat grid, and a sourcing
 *                           hint for lines lacking a priced supplier link
 *                           (was a flat `DataTable` + text strip).
 *  - ConsumableTracker    → segmented `WearGauge` per consumable + a
 *                           low/exhausted rollup header (was a thin bar).
 *  - ProjectPhaseStrip    → at-a-glance 7-phase lifecycle strip, current
 *                           segment marked from the project status.
 *  - ProjectOverviewLinks → inline linked parts + specs digest with
 *                           EmptyState primitives when empty.
 *
 * They assert the specialized structure renders AND that the same domain
 * data still surfaces, so the "behavior-preserving" contract is verifiable.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BuildLogFeed } from '@/components/agentic-os/maker/build-log-feed';
import { BomEditor } from '@/components/agentic-os/maker/bom-editor';
import { ConsumableTracker } from '@/components/agentic-os/maker/consumable-tracker';
import { ProjectPhaseStrip } from '@/components/agentic-os/maker/project-phase-strip';
import { ProjectOverviewLinks } from '@/components/agentic-os/maker/project-overview-links';
import { phaseProgressDefault } from '@/lib/agentic-os/maker/projects';
import type { BuildLogEntry } from '@/lib/agentic-os/maker/log';
import type { BomSummary, BomSummaryRow } from '@/lib/agentic-os/maker/bom';
import type { ToolConsumable } from '@/lib/agentic-os/maker/consumables';
import type { PartCatalogRow } from '@/lib/agentic-os/maker/catalog';
import type { SpecSheet } from '@/lib/agentic-os/maker/spec-sheets';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function mkBuildLogEntry(overrides: Partial<BuildLogEntry> = {}): BuildLogEntry {
  return {
    id: 'ble-1',
    projectId: 'proj-1',
    stepId: null,
    body: 'Squared up the gantry',
    attachedUrls: [],
    authorId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function mkCatalogRow(overrides: Partial<PartCatalogRow> = {}): PartCatalogRow {
  return {
    id: 'cat-1',
    userId: 'u-1',
    name: 'NEMA 23 stepper',
    category: 'electronic',
    manufacturer: null,
    mfgPartNumber: null,
    unit: 'ea',
    parentPartCatalogId: null,
    quantityOnHand: 0,
    defaultSupplierId: null,
    datasheetUrl: null,
    imageUrl: null,
    tags: [],
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkSummaryRow(overrides: Partial<BomSummaryRow> = {}): BomSummaryRow {
  const catalog = overrides.catalog ?? mkCatalogRow();
  return {
    line: {
      id: 'line-1',
      projectId: 'proj-1',
      partCatalogId: catalog.id,
      variantId: null,
      quantityNeeded: 4,
      notes: null,
      priority: 'normal',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    catalog,
    variant: null,
    needed: 4,
    onHand: 4,
    free: 4,
    deficit: 0,
    estCostCents: 2000,
    currency: 'USD',
    cheapestLinkId: 'link-1',
    ...overrides,
  };
}

function mkSummary(rows: BomSummaryRow[]): BomSummary {
  return {
    projectId: 'proj-1',
    rows,
    totalEstCostCents: rows.reduce((s, r) => s + (r.estCostCents ?? 0), 0),
    currency: 'USD',
    totalDeficit: rows.reduce((s, r) => s + r.deficit, 0),
    linesCount: rows.length,
    criticalDeficitLines: rows.filter(
      (r) => r.deficit > 0 && r.line.priority === 'critical',
    ).length,
  };
}

function mkConsumable(overrides: Partial<ToolConsumable> = {}): ToolConsumable {
  return {
    id: 'con-1',
    toolId: 'tool-1',
    name: '1/4" end mill',
    kind: 'endmill',
    hoursRemaining: 8,
    maxHours: 40,
    lastReplacedAt: null,
    notes: null,
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkSpecSheet(overrides: Partial<SpecSheet> = {}): SpecSheet {
  return {
    id: 'spec-1',
    userId: 'u-1',
    title: 'Stepper datasheet',
    kind: 'datasheet',
    url: 'https://example.com/stepper.pdf',
    notes: null,
    revision: null,
    issuedAt: null,
    partId: 'cat-1',
    toolId: null,
    projectId: null,
    tags: [],
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

// Client list/feed components self-refetch on mount; stub `fetch` with a
// benign empty payload so they settle to their initial-prop state.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            entries: [],
            consumables: [],
            summary: null,
            rows: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── BuildLogFeed — Wave D.4 feed redesign ──────────────────────────────────

describe('BuildLogFeed — Wave D.4 redesign', () => {
  it('still renders the ActivityFeed with a row per entry (Wave C base intact)', () => {
    render(
      <BuildLogFeed
        projectId="proj-1"
        initialEntries={[
          mkBuildLogEntry({ id: 'b-1', body: 'Squared up the gantry' }),
        ]}
      />,
    );
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-b-1')).toBeInTheDocument();
    expect(screen.getByText('Squared up the gantry')).toBeInTheDocument();
  });

  it('renders the feed-stats header strip with entry + photo counts', () => {
    render(
      <BuildLogFeed
        projectId="proj-1"
        initialEntries={[
          mkBuildLogEntry({
            id: 'b-1',
            attachedUrls: [{ url: 'https://x/p.jpg', kind: 'photo' }],
          }),
          mkBuildLogEntry({ id: 'b-2' }),
        ]}
      />,
    );
    const stats = screen.getByTestId('build-log-stats');
    expect(stats).toHaveTextContent('2');
    expect(stats).toHaveTextContent('entries');
    expect(stats).toHaveTextContent('photo');
  });

  it('renders a photo grid with a "+N" overflow tile past the preview cap', () => {
    const photos = Array.from({ length: 9 }, (_, i) => ({
      url: `https://x/p${i}.jpg`,
      kind: 'photo' as const,
    }));
    render(
      <BuildLogFeed
        projectId="proj-1"
        initialEntries={[mkBuildLogEntry({ id: 'b-1', attachedUrls: photos })]}
      />,
    );
    expect(screen.getByTestId('build-log-photo-grid')).toBeInTheDocument();
    // 9 photos, cap is 6 → "+3" overflow tile.
    expect(screen.getByTestId('build-log-photo-overflow')).toHaveTextContent(
      '+3',
    );
  });

  it('renders non-photo attachments as a scannable chip row', () => {
    render(
      <BuildLogFeed
        projectId="proj-1"
        initialEntries={[
          mkBuildLogEntry({
            id: 'b-1',
            attachedUrls: [
              { url: 'https://x/doc.pdf', kind: 'file', label: 'Wiring doc' },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText('Wiring doc')).toBeInTheDocument();
  });
});

// ─── BomEditor — Wave D.4 depth ─────────────────────────────────────────────

describe('BomEditor — Wave D.4 depth', () => {
  it('renders the labelled totals stat grid', () => {
    render(
      <BomEditor
        projectId="proj-1"
        initialSummary={mkSummary([mkSummaryRow()])}
        catalogRows={[mkCatalogRow()]}
      />,
    );
    const totals = screen.getByTestId('bom-totals');
    expect(totals).toHaveTextContent('Lines');
    expect(totals).toHaveTextContent('Est. cost');
    expect(totals).toHaveTextContent('Deficit');
    expect(totals).toHaveTextContent('Critical short');
  });

  it('renders a per-line card with an in-stock sourcing pill when covered', () => {
    render(
      <BomEditor
        projectId="proj-1"
        initialSummary={mkSummary([mkSummaryRow({})])}
        catalogRows={[mkCatalogRow()]}
      />,
    );
    expect(screen.getByTestId('bom-line-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('bom-line-status-line-1')).toHaveTextContent(
      'In stock',
    );
    expect(screen.getByText('NEMA 23 stepper')).toBeInTheDocument();
  });

  it('escalates the sourcing pill to critical short on a critical deficit', () => {
    const row = mkSummaryRow({
      free: 0,
      deficit: 4,
      line: {
        id: 'line-1',
        projectId: 'proj-1',
        partCatalogId: 'cat-1',
        variantId: null,
        quantityNeeded: 4,
        notes: null,
        priority: 'critical',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    });
    render(
      <BomEditor
        projectId="proj-1"
        initialSummary={mkSummary([row])}
        catalogRows={[mkCatalogRow()]}
      />,
    );
    expect(screen.getByTestId('bom-line-status-line-1')).toHaveTextContent(
      'Critical short',
    );
  });

  it('shows a sourcing hint when a line has no priced supplier link', () => {
    render(
      <BomEditor
        projectId="proj-1"
        initialSummary={mkSummary([mkSummaryRow({ cheapestLinkId: null })])}
        catalogRows={[mkCatalogRow()]}
      />,
    );
    expect(screen.getByTestId('bom-sourcing-hint')).toHaveTextContent(
      'no priced supplier link',
    );
  });
});

// ─── ConsumableTracker — Wave D.4 wear gauges ───────────────────────────────

describe('ConsumableTracker — Wave D.4 wear gauges', () => {
  it('renders a segmented wear gauge per consumable with a status state', () => {
    render(
      <ConsumableTracker
        toolId="tool-1"
        initialConsumables={[mkConsumable({ hoursRemaining: 8, maxHours: 40 })]}
      />,
    );
    const gauge = screen.getByTestId('wear-gauge');
    // 8/40 = 20% remaining → "low" status band.
    expect(gauge).toHaveAttribute('data-state', 'low');
    expect(gauge).toHaveTextContent('20%');
  });

  it('renders an untracked gauge state when hours data is missing', () => {
    render(
      <ConsumableTracker
        toolId="tool-1"
        initialConsumables={[
          mkConsumable({ id: 'c-x', hoursRemaining: null, maxHours: null }),
        ]}
      />,
    );
    expect(screen.getByTestId('wear-gauge')).toHaveAttribute(
      'data-state',
      'untracked',
    );
  });

  it('rolls up low / exhausted counts in the header strip', () => {
    render(
      <ConsumableTracker
        toolId="tool-1"
        initialConsumables={[
          mkConsumable({ id: 'c-low', hoursRemaining: 4, maxHours: 40 }),
          mkConsumable({ id: 'c-dead', hoursRemaining: 0, maxHours: 40 }),
        ]}
      />,
    );
    expect(screen.getByTestId('consumable-rollup-low')).toHaveTextContent('1');
    expect(screen.getByTestId('consumable-rollup-exhausted')).toHaveTextContent(
      '1',
    );
  });
});

// ─── ProjectPhaseStrip — Wave D.4 phase strip ───────────────────────────────

describe('ProjectPhaseStrip — Wave D.4', () => {
  it('renders all seven lifecycle phase segments', () => {
    render(
      <ProjectPhaseStrip
        phaseProgress={phaseProgressDefault()}
        status="concept"
      />,
    );
    expect(screen.getByTestId('project-phase-strip')).toBeInTheDocument();
    for (const phase of [
      'concept',
      'design',
      'procurement',
      'fabrication',
      'assembly',
      'commissioning',
      'done',
    ]) {
      expect(screen.getByTestId(`phase-segment-${phase}`)).toBeInTheDocument();
    }
  });

  it('marks the segment matching the project status as current', () => {
    render(
      <ProjectPhaseStrip
        phaseProgress={{ ...phaseProgressDefault(), fabrication: 60 }}
        status="fabrication"
      />,
    );
    expect(
      screen.getByTestId('phase-segment-fabrication'),
    ).toHaveAttribute('data-current', 'true');
    expect(screen.getByTestId('phase-segment-concept')).not.toHaveAttribute(
      'data-current',
    );
  });

  it('renders no current marker for an archived project', () => {
    render(
      <ProjectPhaseStrip
        phaseProgress={phaseProgressDefault()}
        status="archived"
      />,
    );
    for (const phase of ['concept', 'done']) {
      expect(screen.getByTestId(`phase-segment-${phase}`)).not.toHaveAttribute(
        'data-current',
      );
    }
  });
});

// ─── ProjectOverviewLinks — Wave D.4 inline linked specs / parts ────────────

describe('ProjectOverviewLinks — Wave D.4', () => {
  it('renders linked parts and specs with the data preserved', () => {
    render(
      <ProjectOverviewLinks
        projectId="proj-1"
        bomSummary={mkSummary([mkSummaryRow()])}
        specSheets={[mkSpecSheet()]}
      />,
    );
    expect(screen.getByTestId('overview-parts')).toBeInTheDocument();
    expect(screen.getByTestId('overview-specs')).toBeInTheDocument();
    expect(screen.getByText('NEMA 23 stepper')).toBeInTheDocument();
    expect(screen.getByText('Stepper datasheet')).toBeInTheDocument();
  });

  it('shows EmptyState primitives when there are no parts or specs', () => {
    render(
      <ProjectOverviewLinks
        projectId="proj-1"
        bomSummary={mkSummary([])}
        specSheets={[]}
      />,
    );
    expect(screen.getByText('No parts on the BOM yet')).toBeInTheDocument();
    expect(screen.getByText('No spec sheets linked yet')).toBeInTheDocument();
    expect(screen.getAllByTestId('empty-state')).toHaveLength(2);
  });

  it('renders a "+N more" link when parts exceed the inline cap', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      mkSummaryRow({
        catalog: mkCatalogRow({ id: `cat-${i}`, name: `Part ${i}` }),
        line: {
          id: `line-${i}`,
          projectId: 'proj-1',
          partCatalogId: `cat-${i}`,
          variantId: null,
          quantityNeeded: 1,
          notes: null,
          priority: 'normal',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      }),
    );
    render(
      <ProjectOverviewLinks
        projectId="proj-1"
        bomSummary={mkSummary(rows)}
        specSheets={[]}
      />,
    );
    // 8 parts, cap 5 → "+3 more parts".
    expect(screen.getByText('+ 3 more parts')).toBeInTheDocument();
  });
});
