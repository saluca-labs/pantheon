/**
 * BulkActionsBar — Wave B.2 data-view primitive tests.
 *
 * Covers: renders-nothing-when-empty, selection count, clear callback,
 * action buttons firing with selectedIds, danger variant, disabled action,
 * extraActions slot, custom count label, sticky toggle.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkActionsBar, type BulkAction } from './bulk-actions-bar';

const mkActions = (
  onArchive = vi.fn(),
  onDelete = vi.fn(),
): BulkAction[] => [
  { id: 'archive', label: 'Archive', onClick: onArchive },
  { id: 'delete', label: 'Delete', onClick: onDelete, variant: 'danger' },
];

describe('BulkActionsBar — contextual visibility', () => {
  it('renders nothing when no rows are selected', () => {
    const { container } = render(
      <BulkActionsBar
        selectedIds={[]}
        actions={mkActions()}
        onClear={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the bar when at least one row is selected', () => {
    render(
      <BulkActionsBar
        selectedIds={['a']}
        actions={mkActions()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('bulk-actions-bar')).toBeInTheDocument();
  });
});

describe('BulkActionsBar — selection count', () => {
  it('shows the selection count', () => {
    render(
      <BulkActionsBar
        selectedIds={['a', 'b', 'c']}
        actions={mkActions()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('bulk-actions-bar')).toHaveTextContent('3');
    expect(screen.getByTestId('bulk-actions-bar')).toHaveTextContent(
      'selected',
    );
  });

  it('honors a custom countLabel', () => {
    render(
      <BulkActionsBar
        selectedIds={['a', 'b']}
        actions={mkActions()}
        onClear={vi.fn()}
        countLabel={(n) => `${n} deals selected`}
      />,
    );
    expect(screen.getByTestId('bulk-actions-bar')).toHaveTextContent(
      'deals selected',
    );
  });
});

describe('BulkActionsBar — clear', () => {
  it('clicking clear fires onClear', () => {
    const onClear = vi.fn();
    render(
      <BulkActionsBar
        selectedIds={['a']}
        actions={mkActions()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByTestId('bulk-actions-clear'));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe('BulkActionsBar — actions', () => {
  it('renders one button per action', () => {
    render(
      <BulkActionsBar
        selectedIds={['a']}
        actions={mkActions()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('bulk-action-archive')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-delete')).toBeInTheDocument();
  });

  it('clicking an action fires its onClick with the live selectedIds', () => {
    const onArchive = vi.fn();
    render(
      <BulkActionsBar
        selectedIds={['a', 'b']}
        actions={mkActions(onArchive)}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('bulk-action-archive'));
    expect(onArchive).toHaveBeenCalledWith(['a', 'b']);
  });

  it('does not fire a disabled action', () => {
    const onClick = vi.fn();
    render(
      <BulkActionsBar
        selectedIds={['a']}
        actions={[{ id: 'export', label: 'Export', onClick, disabled: true }]}
        onClear={vi.fn()}
      />,
    );
    const btn = screen.getByTestId('bulk-action-export');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the danger variant treatment', () => {
    render(
      <BulkActionsBar
        selectedIds={['a']}
        actions={mkActions()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('bulk-action-delete').className).toContain(
      'text-danger',
    );
  });
});

describe('BulkActionsBar — slots + layout', () => {
  it('renders the extraActions slot', () => {
    render(
      <BulkActionsBar
        selectedIds={['a']}
        actions={mkActions()}
        onClear={vi.fn()}
        extraActions={<div data-testid="os-stage-picker">stage picker</div>}
      />,
    );
    expect(screen.getByTestId('os-stage-picker')).toBeInTheDocument();
  });

  it('is sticky by default and inline when sticky=false', () => {
    const { rerender } = render(
      <BulkActionsBar
        selectedIds={['a']}
        actions={mkActions()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('bulk-actions-bar').className).toContain(
      'sticky',
    );
    rerender(
      <BulkActionsBar
        selectedIds={['a']}
        actions={mkActions()}
        onClear={vi.fn()}
        sticky={false}
      />,
    );
    expect(screen.getByTestId('bulk-actions-bar').className).not.toContain(
      'sticky',
    );
  });
});
