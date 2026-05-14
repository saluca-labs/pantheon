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
