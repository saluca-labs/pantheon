/**
 * EntitySearch — Wave B.2 data-view primitive tests.
 *
 * Covers: render, debounce timing, clear affordance, result dropdown,
 * no-results path, keyboard navigation + select, pure-input mode (no
 * results surface), loading + disabled states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntitySearch } from './entity-search';

interface Person {
  id: string;
  name: string;
}

const PEOPLE: Person[] = [
  { id: 'p1', name: 'Ada Lovelace' },
  { id: 'p2', name: 'Alan Turing' },
  { id: 'p3', name: 'Grace Hopper' },
];

describe('EntitySearch — render', () => {
  it('renders a searchbox with the placeholder', () => {
    render(<EntitySearch placeholder="Find people" onQueryChange={vi.fn()} />);
    const input = screen.getByRole('searchbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Find people');
  });

  it('seeds the input with defaultValue', () => {
    render(
      <EntitySearch
        defaultValue="ada"
        placeholder="Find"
        onQueryChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('searchbox')).toHaveValue('ada');
  });

  it('renders the loading affordance when loading', () => {
    render(<EntitySearch loading placeholder="Find" onQueryChange={vi.fn()} />);
    expect(screen.getByTestId('entity-search-loading')).toBeInTheDocument();
  });

  it('disables the input when disabled', () => {
    render(<EntitySearch disabled placeholder="Find" onQueryChange={vi.fn()} />);
    expect(screen.getByRole('searchbox')).toBeDisabled();
  });
});

describe('EntitySearch — debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not fire onQueryChange until the debounce window elapses', () => {
    const onQueryChange = vi.fn();
    render(
      <EntitySearch
        placeholder="Find"
        debounceMs={200}
        onQueryChange={onQueryChange}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a' } });
    expect(onQueryChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(onQueryChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onQueryChange).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('coalesces rapid keystrokes into a single settled emit', () => {
    const onQueryChange = vi.fn();
    render(
      <EntitySearch
        placeholder="Find"
        debounceMs={200}
        onQueryChange={onQueryChange}
      />,
    );
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'a' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: 'ad' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: 'ada' } });
    vi.advanceTimersByTime(200);
    expect(onQueryChange).toHaveBeenCalledExactlyOnceWith('ada');
  });
});

describe('EntitySearch — clear', () => {
  it('shows the clear button only when there is a value', () => {
    render(<EntitySearch placeholder="Find" onQueryChange={vi.fn()} />);
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ada' },
    });
    expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
  });

  it('clear empties the input and emits an empty query immediately', () => {
    const onQueryChange = vi.fn();
    render(<EntitySearch placeholder="Find" onQueryChange={onQueryChange} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'ada' } });
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(input).toHaveValue('');
    expect(onQueryChange).toHaveBeenLastCalledWith('');
  });
});

describe('EntitySearch — result dropdown', () => {
  const renderResult = (p: Person) => <span>{p.name}</span>;

  it('renders result rows via the render-prop when input is non-empty', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={PEOPLE}
        renderResult={renderResult}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a' } });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('does not show the dropdown while the input is empty', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={PEOPLE}
        renderResult={renderResult}
      />,
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the no-results state when input is non-empty but results empty', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={[]}
        renderResult={renderResult}
        noResultsLabel="Nothing found here."
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByTestId('entity-search-no-results')).toHaveTextContent(
      'Nothing found here.',
    );
  });

  it('clicking a result fires onSelectResult and closes the dropdown', () => {
    const onSelectResult = vi.fn();
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={PEOPLE}
        renderResult={renderResult}
        onSelectResult={onSelectResult}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a' } });
    fireEvent.click(screen.getByTestId('entity-search-result-p2'));
    expect(onSelectResult).toHaveBeenCalledWith(PEOPLE[1]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('EntitySearch — keyboard navigation', () => {
  const renderResult = (p: Person, hl: boolean) => (
    <span data-hl={hl}>{p.name}</span>
  );

  it('ArrowDown moves the highlight and Enter selects it', () => {
    const onSelectResult = vi.fn();
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={PEOPLE}
        renderResult={renderResult}
        onSelectResult={onSelectResult}
      />,
    );
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'a' } });
    // First option highlighted by default; ArrowDown → second option.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectResult).toHaveBeenCalledWith(PEOPLE[1]);
  });

  it('ArrowUp does not move past the first option', () => {
    const onSelectResult = vi.fn();
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={PEOPLE}
        renderResult={renderResult}
        onSelectResult={onSelectResult}
      />,
    );
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectResult).toHaveBeenCalledWith(PEOPLE[0]);
  });

  it('Escape closes the dropdown', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={PEOPLE}
        renderResult={renderResult}
      />,
    );
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'a' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('EntitySearch — pure-input mode (no results surface)', () => {
  it('renders no dropdown when results/renderResult are omitted', () => {
    render(<EntitySearch placeholder="Find" onQueryChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ada' },
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('EntitySearch — declarative filters', () => {
  const filterDefs = [
    {
      key: 'stage',
      label: 'Stage',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'won', label: 'Won' },
      ],
    },
    {
      key: 'owner',
      label: 'Owner',
      options: [
        { value: 'me', label: 'Me' },
        { value: 'team', label: 'Team' },
      ],
    },
  ];

  it('renders no controls row when filterDefs/sortOptions/viewToggle omitted', () => {
    render(<EntitySearch placeholder="Find" onQueryChange={vi.fn()} />);
    expect(
      screen.queryByTestId('entity-search-controls'),
    ).not.toBeInTheDocument();
  });

  it('renders a labelled select per filter definition', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        filterDefs={filterDefs}
      />,
    );
    expect(screen.getByTestId('entity-search-controls')).toBeInTheDocument();
    expect(
      screen.getByTestId('entity-search-filter-stage'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('entity-search-filter-owner'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Stage')).toBeInTheDocument();
  });

  it('emits the full filter-value map on change', () => {
    const onFilterChange = vi.fn();
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        filterDefs={filterDefs}
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Stage'), {
      target: { value: 'won' },
    });
    expect(onFilterChange).toHaveBeenLastCalledWith({ stage: 'won' });
    fireEvent.change(screen.getByLabelText('Owner'), {
      target: { value: 'me' },
    });
    expect(onFilterChange).toHaveBeenLastCalledWith({
      stage: 'won',
      owner: 'me',
    });
  });

  it('seeds filter selects from defaultFilterValues', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        filterDefs={filterDefs}
        defaultFilterValues={{ stage: 'open' }}
      />,
    );
    expect(screen.getByLabelText('Stage')).toHaveValue('open');
  });
});

describe('EntitySearch — declarative sort', () => {
  const sortOptions = [
    { value: 'recent', label: 'Most recent' },
    { value: 'name', label: 'Name A–Z' },
  ];

  it('renders a sort select and emits the chosen value', () => {
    const onSortChange = vi.fn();
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        sortOptions={sortOptions}
        onSortChange={onSortChange}
      />,
    );
    const sort = screen.getByLabelText('Sort');
    expect(sort).toHaveValue('recent');
    fireEvent.change(sort, { target: { value: 'name' } });
    expect(onSortChange).toHaveBeenCalledWith('name');
  });

  it('honors defaultSortValue', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        sortOptions={sortOptions}
        defaultSortValue="name"
      />,
    );
    expect(screen.getByLabelText('Sort')).toHaveValue('name');
  });
});

describe('EntitySearch — combobox-on-wrapper contract (W-E.5)', () => {
  const renderResult = (p: Person) => <span>{p.name}</span>;

  it('places role="combobox" + aria-haspopup="listbox" on the wrapper, not the input', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={PEOPLE}
        renderResult={renderResult}
      />,
    );
    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveAttribute('aria-haspopup', 'listbox');
    // The input retains its implicit searchbox role and is a child of the wrapper.
    const input = screen.getByRole('searchbox');
    expect(combobox).toContainElement(input);
    // The input itself should NOT carry role="combobox" or the popup-affordance ARIA.
    expect(input).not.toHaveAttribute('role', 'combobox');
    expect(input).not.toHaveAttribute('aria-haspopup');
  });

  it('aria-expanded on the wrapper toggles in sync with the dropdown open state', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={PEOPLE}
        renderResult={renderResult}
      />,
    );
    const combobox = screen.getByRole('combobox');
    // Closed by default — input is empty.
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    // Typing opens the dropdown; aria-expanded follows.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a' } });
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // Escape closes; aria-expanded follows back.
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });

  it('input drives selection via aria-activedescendant pointing at the highlighted option id', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        results={PEOPLE}
        renderResult={renderResult}
      />,
    );
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'a' } });
    // First option is highlighted by default; aria-activedescendant must match its id.
    const firstOption = screen.getByTestId('entity-search-result-p1');
    expect(input.getAttribute('aria-activedescendant')).toBe(firstOption.id);
  });
});

describe('EntitySearch — view toggle', () => {
  const viewToggle = [
    { value: 'list', label: 'List' },
    { value: 'grid', label: 'Grid' },
  ];

  it('renders a view toggle button per mode and emits on click', () => {
    const onViewModeChange = vi.fn();
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        viewToggle={viewToggle}
        onViewModeChange={onViewModeChange}
      />,
    );
    expect(
      screen.getByTestId('entity-search-view-toggle'),
    ).toBeInTheDocument();
    const grid = screen.getByTestId('entity-search-view-grid');
    expect(screen.getByTestId('entity-search-view-list')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(grid);
    expect(onViewModeChange).toHaveBeenCalledWith('grid');
    expect(grid).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not render the toggle when fewer than two modes', () => {
    render(
      <EntitySearch
        placeholder="Find"
        onQueryChange={vi.fn()}
        viewToggle={[{ value: 'list', label: 'List' }]}
      />,
    );
    expect(
      screen.queryByTestId('entity-search-view-toggle'),
    ).not.toBeInTheDocument();
  });
});
