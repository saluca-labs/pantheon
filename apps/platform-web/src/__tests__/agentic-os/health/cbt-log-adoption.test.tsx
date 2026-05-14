/**
 * Health OS Wave C-1b — CBT log surface primitive-adoption tests.
 *
 * Covers the two CBT surfaces that adopted shared-view primitives:
 *  - CbtLogFilter — wraps `SavedViews`; selecting a view navigates by URL,
 *    the active kind reads as the active pill, "All" clears the filter.
 *  - CbtLogDetailTabs — wraps `CrossEntityTabs`; the exercise panel is
 *    always present, mood / notes tabs only appear when their panel is
 *    supplied, and switching tabs swaps the visible panel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { CbtLogFilter } from '@/components/agentic-os/health/cbt/cbt-log-filter';
import { CbtLogDetailTabs } from '@/components/agentic-os/health/cbt/cbt-log-detail-tabs';

const KINDS = [
  { value: 'thought-record', label: 'Thought record' },
  { value: 'gratitude', label: 'Three good things' },
];

beforeEach(() => {
  pushMock.mockClear();
});

describe('CbtLogFilter', () => {
  it('renders one pill per kind plus the "All" reset', () => {
    render(<CbtLogFilter kinds={KINDS} activeKind={null} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Thought record')).toBeInTheDocument();
    expect(screen.getByText('Three good things')).toBeInTheDocument();
  });

  it('marks the active kind pill as pressed', () => {
    render(<CbtLogFilter kinds={KINDS} activeKind="gratitude" />);
    const pill = screen.getByRole('button', { name: 'Three good things' });
    expect(pill).toHaveAttribute('aria-pressed', 'true');
  });

  it('navigates to the kind URL when a pill is selected', () => {
    render(<CbtLogFilter kinds={KINDS} activeKind={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thought record' }));
    expect(pushMock).toHaveBeenCalledWith(
      '/dashboard/os/health/cbt/logs?kind=thought-record',
    );
  });

  it('clears the filter when "All" is clicked', () => {
    render(<CbtLogFilter kinds={KINDS} activeKind="gratitude" />);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(pushMock).toHaveBeenCalledWith('/dashboard/os/health/cbt/logs');
  });
});

describe('CbtLogDetailTabs', () => {
  it('always renders the exercise tab', () => {
    render(<CbtLogDetailTabs detailPanel={<p>exercise body</p>} />);
    expect(
      screen.getByTestId('cross-entity-tab-detail'),
    ).toBeInTheDocument();
    expect(screen.getByText('exercise body')).toBeInTheDocument();
  });

  it('omits mood + notes tabs when their panels are not supplied', () => {
    render(<CbtLogDetailTabs detailPanel={<p>only detail</p>} />);
    expect(screen.queryByTestId('cross-entity-tab-mood')).toBeNull();
    expect(screen.queryByTestId('cross-entity-tab-notes')).toBeNull();
  });

  it('renders mood + notes tabs when their panels are supplied', () => {
    render(
      <CbtLogDetailTabs
        moodPanel={<p>mood snapshot</p>}
        detailPanel={<p>exercise body</p>}
        notesPanel={<p>my notes</p>}
      />,
    );
    expect(screen.getByTestId('cross-entity-tab-mood')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-notes')).toBeInTheDocument();
  });

  it('switches the visible panel when a tab is clicked', () => {
    render(
      <CbtLogDetailTabs
        detailPanel={<p>exercise body</p>}
        notesPanel={<p>my notes</p>}
      />,
    );
    fireEvent.click(screen.getByTestId('cross-entity-tab-notes'));
    expect(screen.getByText('my notes')).toBeVisible();
  });
});
