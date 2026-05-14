/**
 * Health OS Wave C-1b — JournalEntryBrowser render + filter tests.
 *
 * The journal list adopts the shared `EntitySearch` + `EmptyState`
 * primitives. These tests lock: the rows render, the in-page search
 * filters by title/body/category, the no-matches case shows an EmptyState,
 * and the whole-feature zero state shows the "New entry" door.
 *
 * `EntitySearch` debounces `onQueryChange` (200ms default), so the filter
 * assertions drive fake timers — same approach as the primitive's own
 * `entity-search.test.tsx`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  JournalEntryBrowser,
  type JournalEntrySummary,
} from '@/components/agentic-os/health/journal/journal-entry-browser';

const ENTRIES: JournalEntrySummary[] = [
  {
    id: 'j-1',
    title: 'Morning gratitude',
    body: 'Felt thankful for the quiet start.',
    entryAt: '2026-05-12T08:00:00.000Z',
    prompt: { category: 'gratitude' },
  },
  {
    id: 'j-2',
    title: 'Hard conversation',
    body: 'Worked through the conflict at work.',
    entryAt: '2026-05-11T20:00:00.000Z',
    prompt: null,
  },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('JournalEntryBrowser', () => {
  it('renders every entry when unfiltered', () => {
    render(<JournalEntryBrowser entries={ENTRIES} />);
    expect(screen.getByText('Morning gratitude')).toBeInTheDocument();
    expect(screen.getByText('Hard conversation')).toBeInTheDocument();
  });

  it('shows the whole-feature EmptyState when there are no entries', () => {
    render(<JournalEntryBrowser entries={[]} />);
    expect(screen.getByText('No entries yet')).toBeInTheDocument();
    expect(screen.getByText('New entry')).toBeInTheDocument();
  });

  it('filters entries via the EntitySearch input', () => {
    vi.useFakeTimers();
    render(<JournalEntryBrowser entries={ENTRIES} />);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'conflict' },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText('Hard conversation')).toBeInTheDocument();
    expect(screen.queryByText('Morning gratitude')).not.toBeInTheDocument();
  });

  it('shows a no-matches EmptyState when the search excludes everything', () => {
    vi.useFakeTimers();
    render(<JournalEntryBrowser entries={ENTRIES} />);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'zzz-nothing' },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(
      screen.getByText('No entries match that search'),
    ).toBeInTheDocument();
  });
});
