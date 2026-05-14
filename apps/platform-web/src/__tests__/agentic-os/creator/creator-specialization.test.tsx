/**
 * Creator OS Wave D-4b — specialization render tests.
 *
 * Locks the Wave D-4b specialization surfaces:
 *  - NoteTree         → `@dnd-kit` drag-drop reorder: grip handles per row,
 *                       sortable sibling groups, the note link still navigates.
 *  - CoachModePicker  → new `cards` variant surfaces each mode's description.
 *  - AudioPlayer      → token-driven chrome header with title + subtitle.
 *  - VideoPlayer      → chrome header renders only when a subtitle is passed.
 *  - SubscriberTable  → Wave D depth on the Wave C selection model: live
 *                       selection count + Export CSV bulk action.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard/os/creator',
  useSearchParams: () => new URLSearchParams(),
}));

// Plyr / Video.js touch the DOM in ways jsdom doesn't fully model; the
// players' chrome is plain JSX around the media element, so stubbing the
// libraries keeps the render-test focused on the chrome.
vi.mock('plyr', () => ({ default: class { destroy() {} } }));
vi.mock('video.js', () => ({ default: () => ({ dispose() {} }) }));

import { NoteTree } from '@/components/agentic-os/creator/note-tree';
import { CoachModePicker } from '@/components/agentic-os/creator/coach-mode-picker';
import { AudioPlayer } from '@/components/agentic-os/creator/audio-player';
import { VideoPlayer } from '@/components/agentic-os/creator/video-player';
import { SubscriberTable } from '@/components/agentic-os/creator/subscriber-table';
import type { CreatorNote } from '@/lib/agentic-os/creator/notes';
import type { CreatorSubscriber } from '@/lib/agentic-os/creator/subscribers';

function mkNote(overrides: Partial<CreatorNote> = {}): CreatorNote {
  return {
    id: 'note-1',
    userId: 'u-1',
    title: 'A note',
    content: {},
    icon: null,
    coverImageUrl: null,
    parentId: null,
    position: 0,
    tags: [],
    isPinned: false,
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkSub(overrides: Partial<CreatorSubscriber> = {}): CreatorSubscriber {
  return {
    id: 'sub-1',
    userId: 'u-1',
    email: 'reader@example.com',
    name: null,
    status: 'active',
    source: 'manual',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('NoteTree — drag-drop reorder polish', () => {
  it('renders a reorder grip handle on every note row', () => {
    render(
      <NoteTree
        notes={[
          mkNote({ id: 'n1', title: 'First' }),
          mkNote({ id: 'n2', title: 'Second' }),
        ]}
      />,
    );
    expect(screen.getByLabelText('Reorder First')).toBeInTheDocument();
    expect(screen.getByLabelText('Reorder Second')).toBeInTheDocument();
  });

  it('still links each note to its detail route', () => {
    render(<NoteTree notes={[mkNote({ id: 'n1', title: 'First' })]} />);
    expect(screen.getByText('First').closest('a')).toHaveAttribute(
      'href',
      '/dashboard/os/creator/notes/n1',
    );
  });

  it('renders nested children under their parent', () => {
    render(
      <NoteTree
        notes={[
          mkNote({ id: 'p', title: 'Parent' }),
          mkNote({ id: 'c', title: 'Child', parentId: 'p' }),
        ]}
      />,
    );
    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  it('keeps the empty-state copy when there are no notes', () => {
    render(<NoteTree notes={[]} />);
    expect(
      screen.getByText(/No notes yet/i),
    ).toBeInTheDocument();
  });
});

describe('CoachModePicker — cards variant', () => {
  it('renders the chip variant by default', () => {
    render(<CoachModePicker value="general" onChange={vi.fn()} />);
    expect(screen.getByTestId('coach-mode-picker')).toBeInTheDocument();
    // Chip variant: label only, no description text.
    expect(screen.getByText('General Assistant')).toBeInTheDocument();
    expect(
      screen.queryByText(/Any creator-related question/i),
    ).toBeNull();
  });

  it('surfaces each mode description in the cards variant', () => {
    render(
      <CoachModePicker value="general" onChange={vi.fn()} variant="cards" />,
    );
    expect(screen.getByText('Writing Coach')).toBeInTheDocument();
    expect(
      screen.getByText(/Draft review, tone, structure/i),
    ).toBeInTheDocument();
  });

  it('fires onChange when a card is picked', () => {
    const onChange = vi.fn();
    render(
      <CoachModePicker value="general" onChange={onChange} variant="cards" />,
    );
    fireEvent.click(screen.getByText('Writing Coach'));
    expect(onChange).toHaveBeenCalledWith('writing_coach');
  });
});

describe('AudioPlayer — chrome polish', () => {
  it('renders a chrome header with the episode title', () => {
    render(<AudioPlayer audioUrl="https://x/a.mp3" title="Episode One" />);
    expect(screen.getByTestId('audio-player')).toBeInTheDocument();
    expect(screen.getByText('Episode One')).toBeInTheDocument();
  });

  it('renders the optional subtitle line when supplied', () => {
    render(
      <AudioPlayer
        audioUrl="https://x/a.mp3"
        title="Episode One"
        subtitle="My Show · 24m 0s"
      />,
    );
    expect(screen.getByText('My Show · 24m 0s')).toBeInTheDocument();
  });
});

describe('VideoPlayer — chrome polish', () => {
  it('renders the player frame with no chrome header when no subtitle', () => {
    render(<VideoPlayer src="https://x/v.m3u8" title="My video" />);
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
    // No subtitle → no doubled title in a chrome header.
    expect(screen.queryByText('My video')).toBeNull();
  });

  it('renders the chrome header when a subtitle is supplied', () => {
    render(
      <VideoPlayer
        src="https://x/v.m3u8"
        title="My video"
        subtitle="Duration: 3m 0s · Status: ready"
      />,
    );
    expect(screen.getByText('My video')).toBeInTheDocument();
    expect(
      screen.getByText('Duration: 3m 0s · Status: ready'),
    ).toBeInTheDocument();
  });
});

describe('SubscriberTable — Wave D depth', () => {
  it('exposes an Export CSV bulk action once a row is selected', () => {
    render(<SubscriberTable subscribers={[mkSub()]} />);
    // Nothing selected → no bulk bar.
    expect(screen.queryByTestId('bulk-actions-bar')).toBeNull();
    fireEvent.click(screen.getByLabelText('Select reader@example.com'));
    expect(screen.getByTestId('bulk-actions-bar')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-export')).toBeInTheDocument();
  });

  it('shows a live selection count in the table header', () => {
    render(
      <SubscriberTable
        subscribers={[
          mkSub({ id: 's1', email: 'a@example.com' }),
          mkSub({ id: 's2', email: 'b@example.com' }),
        ]}
      />,
    );
    expect(screen.queryByTestId('subscriber-selection-count')).toBeNull();
    fireEvent.click(screen.getByLabelText('Select a@example.com'));
    expect(
      screen.getByTestId('subscriber-selection-count'),
    ).toHaveTextContent('1 selected');
  });

  it('still renders the bulk reactivate / unsubscribe / delete actions', () => {
    render(<SubscriberTable subscribers={[mkSub()]} />);
    fireEvent.click(screen.getByLabelText('Select reader@example.com'));
    expect(screen.getByTestId('bulk-action-reactivate')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-unsubscribe')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-delete')).toBeInTheDocument();
  });
});
