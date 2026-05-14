/**
 * SavedViews — Wave B.2 data-view primitive tests.
 *
 * Covers: render pills, active-pill state, select callback, save-current
 * flow (open → name → confirm), cancel save, delete affordance, dirty-gated
 * save affordance, all-views reset pill, generic query shape passthrough.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavedViews, type SavedView } from './saved-views';

interface DealQuery {
  stage: string;
  sort: string;
}

const VIEWS: SavedView<DealQuery>[] = [
  { id: 'v1', name: 'Open deals', query: { stage: 'open', sort: 'value' } },
  { id: 'v2', name: 'Won this quarter', query: { stage: 'won', sort: 'date' } },
];

const CURRENT: DealQuery = { stage: 'open', sort: 'name' };

describe('SavedViews — render', () => {
  it('renders one pill per saved view', () => {
    render(
      <SavedViews
        views={VIEWS}
        activeViewId={null}
        currentQuery={CURRENT}
        onSelectView={vi.fn()}
        onSaveView={vi.fn()}
      />,
    );
    expect(screen.getByTestId('saved-view-v1')).toHaveTextContent('Open deals');
    expect(screen.getByTestId('saved-view-v2')).toHaveTextContent(
      'Won this quarter',
    );
  });

  it('marks the active view pill as pressed', () => {
    render(
      <SavedViews
        views={VIEWS}
        activeViewId="v2"
        currentQuery={CURRENT}
        onSelectView={vi.fn()}
        onSaveView={vi.fn()}
      />,
    );
    const v2btn = screen
      .getByTestId('saved-view-v2')
      .querySelector('button[aria-pressed]')!;
    expect(v2btn).toHaveAttribute('aria-pressed', 'true');
    const v1btn = screen
      .getByTestId('saved-view-v1')
      .querySelector('button[aria-pressed]')!;
    expect(v1btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the all-views reset pill when allViewsLabel is set', () => {
    render(
      <SavedViews
        views={VIEWS}
        activeViewId={null}
        currentQuery={CURRENT}
        onSelectView={vi.fn()}
        onSaveView={vi.fn()}
        allViewsLabel="All"
        onClearView={vi.fn()}
      />,
    );
    expect(screen.getByText('All')).toBeInTheDocument();
  });
});

describe('SavedViews — select', () => {
  it('clicking a pill fires onSelectView with the full view', () => {
    const onSelectView = vi.fn();
    render(
      <SavedViews
        views={VIEWS}
        activeViewId={null}
        currentQuery={CURRENT}
        onSelectView={onSelectView}
        onSaveView={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Open deals'));
    expect(onSelectView).toHaveBeenCalledWith(VIEWS[0]);
  });

  it('clicking the reset pill fires onClearView', () => {
    const onClearView = vi.fn();
    render(
      <SavedViews
        views={VIEWS}
        activeViewId="v1"
        currentQuery={CURRENT}
        onSelectView={vi.fn()}
        onSaveView={vi.fn()}
        allViewsLabel="All"
        onClearView={onClearView}
      />,
    );
    fireEvent.click(screen.getByText('All'));
    expect(onClearView).toHaveBeenCalledOnce();
  });
});

describe('SavedViews — save current flow', () => {
  it('hides the save affordance when not dirty', () => {
    render(
      <SavedViews
        views={VIEWS}
        activeViewId="v1"
        currentQuery={CURRENT}
        isDirty={false}
        onSelectView={vi.fn()}
        onSaveView={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId('saved-views-save-current'),
    ).not.toBeInTheDocument();
  });

  it('shows the save affordance when dirty', () => {
    render(
      <SavedViews
        views={VIEWS}
        activeViewId="v1"
        currentQuery={CURRENT}
        isDirty
        onSelectView={vi.fn()}
        onSaveView={vi.fn()}
      />,
    );
    expect(screen.getByTestId('saved-views-save-current')).toBeInTheDocument();
  });

  it('opens the name field, accepts a name, and fires onSaveView with the current query', () => {
    const onSaveView = vi.fn();
    render(
      <SavedViews
        views={VIEWS}
        activeViewId="v1"
        currentQuery={CURRENT}
        isDirty
        onSelectView={vi.fn()}
        onSaveView={onSaveView}
      />,
    );
    fireEvent.click(screen.getByTestId('saved-views-save-current'));
    const field = screen.getByLabelText('New view name');
    fireEvent.change(field, { target: { value: 'My pipeline' } });
    fireEvent.click(screen.getByLabelText('Confirm save view'));
    expect(onSaveView).toHaveBeenCalledWith('My pipeline', CURRENT);
  });

  it('Enter in the name field submits the save', () => {
    const onSaveView = vi.fn();
    render(
      <SavedViews
        views={VIEWS}
        activeViewId="v1"
        currentQuery={CURRENT}
        isDirty
        onSelectView={vi.fn()}
        onSaveView={onSaveView}
      />,
    );
    fireEvent.click(screen.getByTestId('saved-views-save-current'));
    const field = screen.getByLabelText('New view name');
    fireEvent.change(field, { target: { value: 'Quick save' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSaveView).toHaveBeenCalledWith('Quick save', CURRENT);
  });

  it('does not fire onSaveView for a blank name', () => {
    const onSaveView = vi.fn();
    render(
      <SavedViews
        views={VIEWS}
        activeViewId="v1"
        currentQuery={CURRENT}
        isDirty
        onSelectView={vi.fn()}
        onSaveView={onSaveView}
      />,
    );
    fireEvent.click(screen.getByTestId('saved-views-save-current'));
    fireEvent.change(screen.getByLabelText('New view name'), {
      target: { value: '   ' },
    });
    fireEvent.keyDown(screen.getByLabelText('New view name'), { key: 'Enter' });
    expect(onSaveView).not.toHaveBeenCalled();
  });

  it('cancel closes the name field without saving', () => {
    const onSaveView = vi.fn();
    render(
      <SavedViews
        views={VIEWS}
        activeViewId="v1"
        currentQuery={CURRENT}
        isDirty
        onSelectView={vi.fn()}
        onSaveView={onSaveView}
      />,
    );
    fireEvent.click(screen.getByTestId('saved-views-save-current'));
    fireEvent.click(screen.getByLabelText('Cancel save view'));
    expect(onSaveView).not.toHaveBeenCalled();
    expect(screen.getByTestId('saved-views-save-current')).toBeInTheDocument();
  });
});

describe('SavedViews — delete', () => {
  it('shows the delete affordance only when onDeleteView is provided', () => {
    const { rerender } = render(
      <SavedViews
        views={VIEWS}
        activeViewId={null}
        currentQuery={CURRENT}
        onSelectView={vi.fn()}
        onSaveView={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText('Delete view Open deals'),
    ).not.toBeInTheDocument();

    rerender(
      <SavedViews
        views={VIEWS}
        activeViewId={null}
        currentQuery={CURRENT}
        onSelectView={vi.fn()}
        onSaveView={vi.fn()}
        onDeleteView={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText('Delete view Open deals'),
    ).toBeInTheDocument();
  });

  it('clicking delete fires onDeleteView with the view id', () => {
    const onDeleteView = vi.fn();
    render(
      <SavedViews
        views={VIEWS}
        activeViewId={null}
        currentQuery={CURRENT}
        onSelectView={vi.fn()}
        onSaveView={vi.fn()}
        onDeleteView={onDeleteView}
      />,
    );
    fireEvent.click(screen.getByLabelText('Delete view Won this quarter'));
    expect(onDeleteView).toHaveBeenCalledWith('v2');
  });
});
