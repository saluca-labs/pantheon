/**
 * W-E.4 — axe-driven a11y gate over every shared primitive.
 *
 * One `it('renders without a11y violations')` per primitive, exercised with
 * minimal but representative props. The matcher is registered globally in
 * `src/__tests__/setup.ts`, so each test calls `axe(container)` from
 * `vitest-axe` and pipes the result through `toHaveNoViolations()`.
 *
 * If a primitive fails axe here, fix the primitive — don't loosen the test.
 * Adding a new primitive to `_shared/` is a contract that includes adding a
 * smoke test below.
 *
 * Spec: `_design/a11y.md` §5.1.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { Skeleton } from '@/components/agentic-os/_shared/views/skeleton';
import { Spinner } from '@/components/agentic-os/_shared/views/spinner';
import { EmptyState } from '@/components/agentic-os/_shared/views/empty-state';
import { DashboardWidget } from '@/components/agentic-os/_shared/views/dashboard-widget';
import { ActivityFeed } from '@/components/agentic-os/_shared/views/activity-feed';
import { KindFilterChips } from '@/components/agentic-os/_shared/views/kind-filter-chips';
import { SavedViews } from '@/components/agentic-os/_shared/views/saved-views';
import { BulkActionsBar } from '@/components/agentic-os/_shared/views/bulk-actions-bar';
import { CrossEntityTabs } from '@/components/agentic-os/_shared/views/cross-entity-tabs';
import { EntitySearch } from '@/components/agentic-os/_shared/views/entity-search';
import { KanbanBoard } from '@/components/agentic-os/_shared/views/kanban-board';
import { Combobox } from '@/components/agentic-os/_shared/combobox';
import { WizardForm } from '@/components/agentic-os/_shared/wizard-form';
import { CoachNotConfigured } from '@/components/agentic-os/_shared/coach/coach-not-configured';

describe('a11y — primitives axe pass', () => {
  it('Skeleton renders without a11y violations', async () => {
    const { container } = render(<Skeleton variant="text-line" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Spinner (decorative) renders without a11y violations', async () => {
    const { container } = render(<Spinner size="sm" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Spinner with label renders without a11y violations', async () => {
    const { container } = render(<Spinner size="md" label="Loading results" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('EmptyState (primary + secondary CTAs) renders without a11y violations', async () => {
    const { container } = render(
      <EmptyState
        title="Nothing here yet"
        description="Add the first item to start your pipeline."
        primaryCta={{ label: 'Add item', onClick: () => undefined }}
        secondaryCta={{ label: 'Import sample data', onClick: () => undefined }}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DashboardWidget with labelled body renders without a11y violations', async () => {
    const { container } = render(
      <DashboardWidget title="Open deals">
        <p>3 deals waiting on your reply.</p>
      </DashboardWidget>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ActivityFeed renders without a11y violations', async () => {
    const { container } = render(
      <ActivityFeed
        events={[
          {
            id: 'e1',
            occurredAt: '2026-05-10T10:00:00Z',
            actor: 'Alfred',
            summary: 'created a deal',
          },
          {
            id: 'e2',
            occurredAt: '2026-05-09T08:00:00Z',
            actor: 'Cristian',
            summary: 'moved a deal to negotiation',
          },
        ]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('KindFilterChips renders without a11y violations', async () => {
    const { container } = render(
      <KindFilterChips
        value={null}
        options={[
          { value: 'task', label: 'Task' },
          { value: 'note', label: 'Note' },
        ]}
        onChange={() => undefined}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SavedViews renders without a11y violations', async () => {
    const { container } = render(
      <SavedViews<Record<string, string>>
        views={[
          { id: 'v1', name: 'My open', query: { status: 'open' } },
          { id: 'v2', name: 'Archived', query: { status: 'archived' } },
        ]}
        activeViewId="v1"
        currentQuery={{ status: 'open' }}
        onSelectView={() => undefined}
        onSaveView={() => undefined}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('BulkActionsBar renders without a11y violations', async () => {
    const { container } = render(
      <BulkActionsBar
        selectedIds={['a', 'b', 'c']}
        actions={[
          { id: 'archive', label: 'Archive', onClick: () => undefined },
          {
            id: 'delete',
            label: 'Delete',
            variant: 'danger',
            onClick: () => undefined,
          },
        ]}
        onClear={() => undefined}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CrossEntityTabs renders without a11y violations', async () => {
    const { container } = render(
      <CrossEntityTabs
        tabs={[
          { key: 'quotes', label: 'Quotes', content: () => <p>q</p> },
          { key: 'invoices', label: 'Invoices', content: () => <p>i</p> },
        ]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('EntitySearch (with filter / sort / view-toggle) renders without a11y violations', async () => {
    const { container } = render(
      <EntitySearch
        placeholder="Search deals"
        onQueryChange={() => undefined}
        filterDefs={[
          {
            key: 'stage',
            label: 'Stage',
            options: [
              { value: 'open', label: 'Open' },
              { value: 'won', label: 'Won' },
            ],
          },
        ]}
        sortOptions={[
          { value: 'recent', label: 'Most recent' },
          { value: 'value', label: 'Highest value' },
        ]}
        viewToggle={[
          { value: 'list', label: 'List' },
          { value: 'grid', label: 'Grid' },
        ]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('KanbanBoard renders without a11y violations', async () => {
    const { container } = render(
      <KanbanBoard
        columns={[
          { id: 'open', title: 'Open' },
          { id: 'won', title: 'Won' },
        ]}
        items={[
          { id: 'd1', columnId: 'open' },
          { id: 'd2', columnId: 'won' },
        ]}
        renderCard={(item) => (
          <div className="rounded bg-surface-1 p-2 text-sm">{item.id}</div>
        )}
        onMove={() => undefined}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Combobox renders without a11y violations', async () => {
    const { container } = render(
      <Combobox<{ name: string }>
        value=""
        onChange={() => undefined}
        onSelect={() => undefined}
        options={[
          {
            id: 'opt-a',
            label: 'Apple',
            data: { name: 'Apple' },
          },
          {
            id: 'opt-b',
            label: 'Banana',
            data: { name: 'Banana' },
          },
        ]}
        placeholder="Pick a fruit"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('WizardForm renders without a11y violations', async () => {
    const { container } = render(
      <WizardForm
        basePath="/dashboard/journal/new"
        currentStep="prompt"
        steps={[
          { id: 'prompt', label: 'Prompt', content: <p>Write a note</p> },
          { id: 'review', label: 'Review', content: <p>Review it</p> },
        ]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CoachNotConfigured renders without a11y violations', async () => {
    const { container } = render(<CoachNotConfigured osLabel="Maker" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
