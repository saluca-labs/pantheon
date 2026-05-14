/**
 * Autobiographer OS Wave C-3b — PersonRelatedTabs render tests.
 *
 * Locks the CrossEntityTabs adoption on the person detail page: the two
 * linked-entity collections (memories, books) render as a tab strip with
 * count badges; content is lazy so only the active tab's panel mounts.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonRelatedTabs } from '@/components/agentic-os/autobiographer/person-related-tabs';

describe('PersonRelatedTabs', () => {
  it('renders a tab per linked-entity collection with count badges', () => {
    render(
      <PersonRelatedTabs
        personName="Jane Doe"
        memories={[
          {
            memoryId: 'm-1',
            title: 'A memory',
            whenInLife: null,
            eraDateEstimate: null,
            role: null,
          },
        ]}
        books={[
          { bookId: 'b-1', bookTitle: 'My Life', memoryCount: 3 },
          { bookId: 'b-2', bookTitle: 'Volume Two', memoryCount: 1 },
        ]}
      />,
    );
    expect(screen.getByTestId('cross-entity-tab-memories')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-books')).toBeInTheDocument();
    expect(
      screen.getByTestId('cross-entity-tab-count-memories'),
    ).toHaveTextContent('1');
    expect(
      screen.getByTestId('cross-entity-tab-count-books'),
    ).toHaveTextContent('2');
  });

  it('renders the first tab panel content (memories) by default', () => {
    render(
      <PersonRelatedTabs
        personName="Jane Doe"
        memories={[
          {
            memoryId: 'm-1',
            title: 'Summer at the lake',
            whenInLife: 'Age 8',
            eraDateEstimate: null,
            role: 'narrator',
          },
        ]}
        books={[]}
      />,
    );
    expect(screen.getByText('Summer at the lake')).toBeInTheDocument();
  });

  it('shows the plainspoken empty copy for an empty collection', () => {
    render(
      <PersonRelatedTabs personName="Jane Doe" memories={[]} books={[]} />,
    );
    expect(
      screen.getByText(/No memories link to this person yet/i),
    ).toBeInTheDocument();
  });
});
