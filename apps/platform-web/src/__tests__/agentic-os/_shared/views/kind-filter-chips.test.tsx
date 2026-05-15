/**
 * KindFilterChips — Wave E.2b shared primitive render tests.
 *
 * Locks the closed-set chip-filter contract:
 *  - renders the "All" chip plus N option chips
 *  - fires `onChange(null)` from "All", `onChange(value)` from options
 *  - applies the default `accent` active style on the active chip and lets
 *    a per-option `activeColor` override it
 *  - exposes deterministic `data-testid`s for downstream test harnesses
 *
 * @license MIT — Tiresias Pantheon UI Depth Wave E (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KindFilterChips } from '@/components/agentic-os/_shared/views';

const OPTIONS = [
  { value: 'note', label: 'Note' },
  { value: 'todo', label: 'To-do' },
] as const;

describe('KindFilterChips', () => {
  it('renders an "All" chip plus N option chips', () => {
    render(
      <KindFilterChips
        value={null}
        options={[...OPTIONS]}
        onChange={() => {}}
        testIdPrefix="kind-chip"
      />,
    );
    expect(screen.getByTestId('kind-chip-all')).toBeInTheDocument();
    expect(screen.getByTestId('kind-chip-note')).toBeInTheDocument();
    expect(screen.getByTestId('kind-chip-todo')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByText('To-do')).toBeInTheDocument();
  });

  it('renders the custom allLabel when provided', () => {
    render(
      <KindFilterChips
        value={null}
        options={[...OPTIONS]}
        onChange={() => {}}
        allLabel="All kinds"
      />,
    );
    expect(screen.getByText('All kinds')).toBeInTheDocument();
  });

  it('fires onChange(null) when the "All" chip is clicked', () => {
    const onChange = vi.fn();
    render(
      <KindFilterChips
        value="note"
        options={[...OPTIONS]}
        onChange={onChange}
        testIdPrefix="kind-chip"
      />,
    );
    fireEvent.click(screen.getByTestId('kind-chip-all'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('fires onChange(value) when an option chip is clicked', () => {
    const onChange = vi.fn();
    render(
      <KindFilterChips
        value={null}
        options={[...OPTIONS]}
        onChange={onChange}
        testIdPrefix="kind-chip"
      />,
    );
    fireEvent.click(screen.getByTestId('kind-chip-todo'));
    expect(onChange).toHaveBeenCalledWith('todo');
  });

  it('marks the active chip via aria-pressed and the accent active style', () => {
    render(
      <KindFilterChips
        value="note"
        options={[...OPTIONS]}
        onChange={() => {}}
        testIdPrefix="kind-chip"
      />,
    );
    const allChip = screen.getByTestId('kind-chip-all');
    const noteChip = screen.getByTestId('kind-chip-note');
    const todoChip = screen.getByTestId('kind-chip-todo');
    expect(allChip.getAttribute('aria-pressed')).toBe('false');
    expect(noteChip.getAttribute('aria-pressed')).toBe('true');
    expect(todoChip.getAttribute('aria-pressed')).toBe('false');
    expect(noteChip.className).toContain('bg-accent/20');
    expect(noteChip.className).toContain('border-accent/60');
    expect(allChip.className).not.toContain('bg-accent/20');
  });

  it('marks "All" as active when value is null', () => {
    render(
      <KindFilterChips
        value={null}
        options={[...OPTIONS]}
        onChange={() => {}}
        testIdPrefix="kind-chip"
      />,
    );
    const allChip = screen.getByTestId('kind-chip-all');
    expect(allChip.getAttribute('aria-pressed')).toBe('true');
    expect(allChip.className).toContain('bg-accent/20');
  });

  it('applies per-option activeColor in place of the default accent style', () => {
    render(
      <KindFilterChips
        value="todo"
        options={[
          { value: 'note', label: 'Note' },
          {
            value: 'todo',
            label: 'To-do',
            activeColor: 'bg-warning/15 text-warning border-warning/40',
          },
        ]}
        onChange={() => {}}
        testIdPrefix="kind-chip"
      />,
    );
    const todoChip = screen.getByTestId('kind-chip-todo');
    expect(todoChip.className).toContain('bg-warning/15');
    expect(todoChip.className).toContain('text-warning');
    expect(todoChip.className).not.toContain('bg-accent/20');
  });

  it('respects an explicit per-option testId override', () => {
    render(
      <KindFilterChips
        value={null}
        options={[
          { value: 'note', label: 'Note', testId: 'custom-note-chip' },
          { value: 'todo', label: 'To-do' },
        ]}
        onChange={() => {}}
        testIdPrefix="kind-chip"
      />,
    );
    expect(screen.getByTestId('custom-note-chip')).toBeInTheDocument();
    expect(screen.queryByTestId('kind-chip-note')).toBeNull();
    // The other chip still derives from the prefix.
    expect(screen.getByTestId('kind-chip-todo')).toBeInTheDocument();
  });

  it('omits chip data-testids when no testIdPrefix is set', () => {
    render(
      <KindFilterChips
        value={null}
        options={[...OPTIONS]}
        onChange={() => {}}
        testId="my-filter"
      />,
    );
    expect(screen.getByTestId('my-filter')).toBeInTheDocument();
    expect(screen.queryByTestId('kind-chip-all')).toBeNull();
  });

  it('applies an aria-label on the wrapper', () => {
    render(
      <KindFilterChips
        value={null}
        options={[...OPTIONS]}
        onChange={() => {}}
        ariaLabel="Filter datasets by kind"
      />,
    );
    expect(
      screen.getByRole('group', { name: 'Filter datasets by kind' }),
    ).toBeInTheDocument();
  });
});
