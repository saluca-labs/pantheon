/**
 * Research OS Phase 2 — NotebookEntryCard render tests.
 *
 * Locks the render-layer XSS guarantee: react-markdown WITHOUT
 * rehype-raw must escape raw HTML in `body_md`. The DOM should never
 * gain a real `<script>` element from user input.
 *
 * Also smoke-tests the kind pill, the timestamp formatter, and the
 * URL list rendering.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotebookEntryCard } from '@/components/agentic-os/research/notebook-entry-card';
import type { NotebookEntry } from '@/lib/agentic-os/research/notebook-entries';

function mkEntry(overrides: Partial<NotebookEntry> = {}): NotebookEntry {
  return {
    id: 'ne-1',
    userId: 'u-1',
    experimentId: 'exp-1',
    entryKind: 'note',
    title: 'Render test',
    bodyMd: '',
    attachedUrls: [],
    tags: [],
    entryAt: '2026-05-12T10:00:00.000Z',
    archivedAt: null,
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('NotebookEntryCard render', () => {
  it('renders the title', () => {
    render(<NotebookEntryCard entry={mkEntry({ title: 'Sample observation' })} />);
    expect(screen.getByText('Sample observation')).toBeInTheDocument();
  });

  it('renders the entry-kind pill with the correct label', () => {
    render(<NotebookEntryCard entry={mkEntry({ entryKind: 'observation' })} />);
    expect(screen.getByTestId('entry-kind-pill-observation')).toBeInTheDocument();
  });

  it('renders body_md as markdown (paragraphs)', () => {
    const { container } = render(
      <NotebookEntryCard entry={mkEntry({ bodyMd: 'Line one.\n\nLine two.' })} />,
    );
    // react-markdown renders two <p> tags for the double-newline split.
    const paragraphs = container.querySelectorAll('p');
    // Includes the timestamp <p> + content paragraphs; the bodyMd
    // container is the inner div, so we just check it's present.
    const bodyDiv = container.querySelector('[data-testid="card-body-ne-1"]');
    expect(bodyDiv).toBeTruthy();
    expect(bodyDiv?.querySelectorAll('p').length).toBeGreaterThanOrEqual(2);
  });

  it('XSS GUARD: <script> in body_md does NOT become a real <script> element', () => {
    const { container } = render(
      <NotebookEntryCard
        entry={mkEntry({
          bodyMd: '<script>window.__pwned = true;</script>',
        })}
      />,
    );
    // react-markdown without rehype-raw escapes the HTML — the rendered
    // body contains the literal text, not an executable script tag.
    const scripts = container.querySelectorAll('script');
    expect(scripts.length).toBe(0);
    // The bodyMd container should still render the escaped text inside
    // a paragraph.
    const bodyDiv = container.querySelector('[data-testid="card-body-ne-1"]');
    expect(bodyDiv?.textContent).toContain('<script>');
  });

  it('XSS GUARD: <img onerror=...> in body_md does not fire the handler', () => {
    const { container } = render(
      <NotebookEntryCard
        entry={mkEntry({
          bodyMd: '<img src=x onerror="window.__pwned2 = true">',
        })}
      />,
    );
    const imgs = container.querySelectorAll('img');
    // The literal `<img>` tag from the body should not be rendered as a
    // real DOM <img>. (Lucide icons are rendered as <svg>.)
    expect(imgs.length).toBe(0);
  });

  it('renders attached URL list with safe link attributes', () => {
    const { container } = render(
      <NotebookEntryCard
        entry={mkEntry({ attachedUrls: ['https://example.com/raw.csv'] })}
      />,
    );
    const link = container.querySelector('[data-testid="card-urls-ne-1"] a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://example.com/raw.csv');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('renders all tags', () => {
    render(
      <NotebookEntryCard entry={mkEntry({ tags: ['enzyme', 'kinetics'] })} />,
    );
    expect(screen.getByText('enzyme')).toBeInTheDocument();
    expect(screen.getByText('kinetics')).toBeInTheDocument();
  });

  it('does NOT render the body container when body_md is empty', () => {
    const { container } = render(<NotebookEntryCard entry={mkEntry({ bodyMd: '' })} />);
    expect(container.querySelector('[data-testid="card-body-ne-1"]')).toBeNull();
  });

  it('formats entry_at as YYYY-MM-DD HH:MM', () => {
    const { container } = render(
      <NotebookEntryCard
        entry={mkEntry({ entryAt: '2026-05-12T15:30:00.000Z' })}
      />,
    );
    // The formatter uses the local timezone for display. The output is
    // a stable YYYY-MM-DD HH:MM shape; we just check the date portion
    // is present (the hour shifts per locale).
    expect(container.textContent).toMatch(/2026-05-1[12]/);
  });

  it('renders edit + archive affordances', () => {
    render(<NotebookEntryCard entry={mkEntry()} />);
    expect(screen.getByTestId('card-edit-ne-1')).toBeInTheDocument();
    expect(screen.getByTestId('card-archive-ne-1')).toBeInTheDocument();
  });
});

describe('NotebookEntryCard kind pill — all 6 kinds', () => {
  for (const k of ['note', 'observation', 'result', 'decision', 'question', 'todo'] as const) {
    it(`renders pill for ${k}`, () => {
      render(<NotebookEntryCard entry={mkEntry({ entryKind: k })} />);
      expect(screen.getByTestId(`entry-kind-pill-${k}`)).toBeInTheDocument();
    });
  }
});
