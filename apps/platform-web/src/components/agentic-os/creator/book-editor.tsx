'use client';

/**
 * Creator OS Phase 3 — Book editor component.
 *
 * Two-panel layout:
 * - Left panel (w-64): Book title + chapter list with drag-to-reorder via
 *   @dnd-kit. Chapter status pills, add-chapter button.
 * - Right panel: Selected chapter title input + shared TipTapEditor.
 *
 * Features:
 * - Auto-save via debounced PATCH on chapter content change
 * - Word count display per chapter (extracted from TipTap JSON)
 * - Reading time estimate (wordCount / 238 wpm)
 * - Book status picker (draft/writing/complete/published)
 *
 * @license MIT — Tiresias Creator OS Phase 3 (internal).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  GripVertical,
  ChevronLeft,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { TipTapEditor } from '@/components/agentic-os/_shared/tiptap-editor';
import { ExportButton } from './export-button';
import { BookSettingsDrawer } from './book-settings-drawer';
import type {
  CreatorBook,
  CreatorChapter,
  BookStatus,
} from '@/lib/agentic-os/creator/books';
import type { PublishingTarget } from '@/lib/agentic-os/creator/publishing-targets';

interface BookEditorProps {
  book: CreatorBook;
  chapters: CreatorChapter[];
  publishingTargets: PublishingTarget[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractText(json: Record<string, unknown>): string {
  if (typeof json === 'object' && json !== null) {
    if ((json as { type?: unknown }).type === 'text') {
      const t = (json as { text?: unknown }).text;
      return typeof t === 'string' ? t : '';
    }
    const content = (json as { content?: unknown }).content;
    if (Array.isArray(content)) {
      return content
        .map((child) =>
          typeof child === 'object' && child !== null
            ? extractText(child as Record<string, unknown>)
            : '',
        )
        .join(' ');
    }
  }
  return '';
}

function computeWordCount(content: Record<string, unknown>): number {
  const text = extractText(content);
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-border-subtle text-text-secondary',
  writing: 'bg-accent/20 text-accent',
  complete: 'bg-positive/20 text-positive',
  published: 'bg-os-creator/20 text-os-creator',
};

const CHAPTER_STATUS_COLORS: Record<string, string> = {
  draft: 'text-text-tertiary',
  revised: 'text-warning',
  final: 'text-positive',
};

// ─── Sortable Chapter Row ───────────────────────────────────────────────────

function SortableChapterRow({
  chapter,
  isActive,
  onClick,
}: {
  chapter: CreatorChapter;
  isActive: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? 'bg-accent/15 text-white border border-accent/30'
          : 'text-text-secondary hover:bg-surface-2 hover:text-white border border-transparent'
      }`}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${chapter.title || 'chapter'}`}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-secondary transition-opacity shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className="flex-1 flex items-center gap-2 min-w-0 text-left"
      >
        <span className="flex-1 truncate text-xs">{chapter.title}</span>

        <span
          className={`text-[10px] font-medium shrink-0 ${CHAPTER_STATUS_COLORS[chapter.status] ?? ''}`}
        >
          {chapter.status}
        </span>
      </button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function BookEditor({
  book: initialBook,
  chapters: initialChapters,
  publishingTargets: initialTargets,
}: BookEditorProps) {
  const router = useRouter();
  const [book, setBook] = useState(initialBook);
  const [chapterList, setChapterList] = useState(initialChapters);
  const [publishingTargets, setPublishingTargets] = useState(initialTargets);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    chapterList[0]?.id ?? null,
  );
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedChapter = chapterList.find((c) => c.id === selectedChapterId) ?? null;

  // ─── dnd-kit sensors ──────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIdx = chapterList.findIndex((c) => c.id === active.id);
      const newIdx = chapterList.findIndex((c) => c.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;

      const reordered = arrayMove(chapterList, oldIdx, newIdx);
      setChapterList(reordered);

      // Persist the new order
      const orderedIds = reordered.map((c) => c.id);
      await fetch(
        `/api/tiresias/agentic-os/creator/books/${book.id}/chapters/reorder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds }),
        },
      );
    },
    [chapterList, book.id],
  );

  // ─── Auto-save chapter content ────────────────────────────────────────
  const saveChapter = useCallback(
    (chapterId: string, patch: Record<string, unknown>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await fetch(
          `/api/tiresias/agentic-os/creator/books/${book.id}/chapters/${chapterId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          },
        );
      }, 800);
    },
    [book.id],
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function handleChapterContentChange(json: Record<string, unknown>) {
    if (!selectedChapterId) return;

    const wc = computeWordCount(json);
    setChapterList((prev) =>
      prev.map((c) =>
        c.id === selectedChapterId
          ? { ...c, content: json, wordCount: wc }
          : c,
      ),
    );

    saveChapter(selectedChapterId, { content: json, wordCount: wc });
  }

  function handleChapterTitleChange(title: string) {
    if (!selectedChapterId) return;

    setChapterList((prev) =>
      prev.map((c) => (c.id === selectedChapterId ? { ...c, title } : c)),
    );

    saveChapter(selectedChapterId, { title });
  }

  // ─── Create chapter ───────────────────────────────────────────────────
  async function handleCreateChapter() {
    setCreatingChapter(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/creator/books/${book.id}/chapters`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Untitled Chapter' }),
        },
      );
      if (r.ok) {
        const chapter = await r.json();
        setChapterList((prev) => [...prev, chapter]);
        setSelectedChapterId(chapter.id);
      }
    } finally {
      setCreatingChapter(false);
    }
  }

  // ─── Update book status ───────────────────────────────────────────────
  async function handleStatusChange(status: BookStatus) {
    const r = await fetch(
      `/api/tiresias/agentic-os/creator/books/${book.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    );
    if (r.ok) {
      const updated = await r.json();
      setBook(updated);
    }
  }

  // ─── Update book title ────────────────────────────────────────────────
  async function handleBookTitleChange(title: string) {
    setBook((prev) => ({ ...prev, title }));
    // Debounce save
    await fetch(
      `/api/tiresias/agentic-os/creator/books/${book.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      },
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────
  const totalWordCount = chapterList.reduce((s, c) => s + c.wordCount, 0);
  const readingTimeMin = Math.max(1, Math.ceil(totalWordCount / 238));

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ── Left Panel: Book info + Chapter list ──────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-border-subtle bg-surface-0 flex flex-col overflow-hidden">
        {/* Book header */}
        <div className="p-4 border-b border-border-subtle space-y-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard/os/creator/books')}
            className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-white transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Books
          </button>

          <input
            type="text"
            value={book.title}
            onChange={(e) => handleBookTitleChange(e.target.value)}
            className="w-full bg-transparent text-white font-semibold text-sm border border-transparent hover:border-border-subtle focus:border-accent rounded px-2 py-1 outline-none transition-colors"
          />

          {/* Status picker */}
          <select
            value={book.status}
            onChange={(e) => handleStatusChange(e.target.value as BookStatus)}
            className="w-full bg-surface-2 text-xs text-text-secondary border border-border-subtle rounded px-2 py-1.5 outline-none focus:border-accent cursor-pointer"
          >
            <option value="draft">Draft</option>
            <option value="writing">Writing</option>
            <option value="complete">Complete</option>
            <option value="published">Published</option>
          </select>

          {/* Stats */}
          <div className="flex items-center justify-between text-[10px] text-text-tertiary">
            <span>{chapterList.length} chapter{chapterList.length !== 1 ? 's' : ''}</span>
            <span>{totalWordCount.toLocaleString()} words</span>
          </div>
          <div className="text-[10px] text-text-tertiary">
            ~{readingTimeMin} min reading time
          </div>

          {/* Export + Settings */}
          <div className="flex gap-2">
            <div className="flex-1">
              <ExportButton bookId={book.id} bookTitle={book.title} />
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="px-2 py-1.5 text-text-secondary hover:text-white border border-border-subtle hover:border-accent rounded transition-colors"
              aria-label="Open book settings"
              title="Book settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chapter list header */}
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
            Chapters
          </span>
          <button
            type="button"
            onClick={handleCreateChapter}
            disabled={creatingChapter}
            className="text-accent hover:text-accent/80 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Sortable chapter list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={chapterList.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5">
                {chapterList.map((chapter) => (
                  <SortableChapterRow
                    key={chapter.id}
                    chapter={chapter}
                    isActive={chapter.id === selectedChapterId}
                    onClick={() => setSelectedChapterId(chapter.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {chapterList.length === 0 && (
            <p className="text-xs text-text-tertiary text-center mt-8">
              No chapters. Click + to add one.
            </p>
          )}
        </div>
      </aside>

      {/* ── Right Panel: Chapter editor ───────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {selectedChapter ? (
          <>
            {/* Chapter toolbar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-surface-0">
              <input
                type="text"
                value={selectedChapter.title}
                onChange={(e) => handleChapterTitleChange(e.target.value)}
                className="flex-1 bg-transparent text-white font-medium text-sm border border-transparent hover:border-border-subtle focus:border-accent rounded px-2 py-1 outline-none transition-colors"
              />

              <span className="text-xs text-text-tertiary shrink-0">
                {selectedChapter.wordCount.toLocaleString()} words
              </span>
              <span className="text-xs text-text-tertiary shrink-0">
                ~{Math.max(1, Math.ceil(selectedChapter.wordCount / 238))} min
              </span>
            </div>

            {/* TipTap editor */}
            <div className="flex-1 overflow-y-auto p-4">
              <TipTapEditor
                content={selectedChapter.content}
                onChange={handleChapterContentChange}
                placeholder={`Start writing "${selectedChapter.title}"…`}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-text-tertiary text-sm">
                {chapterList.length === 0
                  ? 'Add a chapter to start writing.'
                  : 'Select a chapter from the left panel.'}
              </p>
            </div>
          </div>
        )}
      </main>

      {settingsOpen && (
        <BookSettingsDrawer
          book={book}
          targets={publishingTargets}
          onBookChange={setBook}
          onTargetsChange={setPublishingTargets}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
