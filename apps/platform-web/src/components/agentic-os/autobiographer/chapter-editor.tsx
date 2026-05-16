'use client';

/**
 * Autobiographer OS — Chapter Editor component.
 *
 * Client component for writing a chapter and capturing life events. The editor
 * shows a live word count and reading-time estimate based on Brysbaert (2019)'s
 * 238 wpm meta-analysis.
 *
 * @license MIT — original work for Tiresias platform
 * @see https://doi.org/10.1016/j.jml.2019.104047
 *   Brysbaert (2019) — 238 wpm reading rate meta-analysis
 * @see https://doi.org/10.1111/1467-8721.00097
 *   McAdams (2001) — life-story event taxonomy
 */

import { useState, useMemo } from 'react';
import {
  LEGACY_CHAPTER_STATUSES,
  EVENT_KINDS,
  countWords,
  estimateReadingMinutes,
  validateChapter,
} from '@/lib/agentic-os/autobiographer/chapters';
import type {
  Chapter,
  LifeEvent,
  EventKind,
  LegacyChapterStatus,
} from '@/lib/agentic-os/autobiographer/chapters';

// Phase 4 alias: the legacy single-chapter editor used the names
// `CHAPTER_STATUSES` / `ChapterStatus` before Phase 4 reframed those to
// the book-scoped four-value taxonomy. The legacy names are preserved
// locally so the editor's body stays untouched.
const CHAPTER_STATUSES = LEGACY_CHAPTER_STATUSES;
type ChapterStatus = LegacyChapterStatus;

interface Props {
  initial: Chapter | null;
  events: LifeEvent[];
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const BLANK_EVENT = {
  kind: 'milestone' as EventKind,
  headline: '',
  detail: '',
  occurredYear: '',
};

export function ChapterEditor({ initial, events: initialEvents }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? '');
  const [status, setStatus] = useState<ChapterStatus>(initial?.status ?? 'draft');
  const [periodLabel, setPeriodLabel] = useState(initial?.periodLabel ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(initial?.id ?? null);
  const [events, setEvents] = useState<LifeEvent[]>(initialEvents);
  const [eventForm, setEventForm] = useState({ ...BLANK_EVENT });
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  const wordCount = useMemo(() => countWords(bodyText), [bodyText]);
  const readingMinutes = useMemo(() => estimateReadingMinutes(wordCount), [wordCount]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateChapter({ title, bodyText, status });
    if (errs.length > 0) {
      setSaveError(errs[0] ?? 'Validation error');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setMessage(null);
    try {
      const body = { title, bodyText, status, periodLabel: periodLabel || null };
      const url = chapterId
        ? `/api/tiresias/agentic-os/autobiographer/chapters?id=${chapterId}`
        : '/api/tiresias/agentic-os/autobiographer/chapters';
      const method = chapterId ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed (${r.status})`);
      }
      const data = await r.json();
      if (!chapterId) setChapterId(data.chapter.id);
      setMessage('Chapter saved.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!chapterId) {
      setEventError('Save the chapter first before adding events.');
      return;
    }
    if (!eventForm.headline.trim()) {
      setEventError('Headline is required.');
      return;
    }
    setAddingEvent(true);
    setEventError(null);
    try {
      const body = {
        chapterId,
        kind: eventForm.kind,
        headline: eventForm.headline.trim(),
        detail: eventForm.detail.trim() || null,
        occurredYear: eventForm.occurredYear ? Number(eventForm.occurredYear) : null,
      };
      const r = await fetch('/api/tiresias/agentic-os/autobiographer/chapters?resource=events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed (${r.status})`);
      }
      const data = await r.json();
      setEvents((prev) => [...prev, data.event]);
      setEventForm({ ...BLANK_EVENT });
    } catch (err) {
      setEventError(err instanceof Error ? err.message : 'Failed to add event');
    } finally {
      setAddingEvent(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Chapter form */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-white">Chapter</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Summer We Left Detroit"
              className={inputCls}
              required
            />
          </Field>
          <Field label="Period (optional)">
            <input
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              placeholder="e.g. Childhood, 1990–1998"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ChapterStatus)}
            className={inputCls}
          >
            {CHAPTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Chapter text (${wordCount} words · ~${readingMinutes} min read)`}>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={10}
            placeholder="Write your chapter here…"
            className={inputCls + ' resize-y'}
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {saving ? 'Saving…' : 'Save chapter'}
          </button>
          {message && <span className="text-sm text-positive">{message}</span>}
          {saveError && <span className="text-sm text-danger">{saveError}</span>}
        </div>
      </form>

      {/* Life events */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">
          Life events{' '}
          <span className="text-text-secondary font-normal">({events.length})</span>
        </h2>

        <form onSubmit={handleAddEvent} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Kind">
              <select
                value={eventForm.kind}
                onChange={(e) => setEventForm((f) => ({ ...f, kind: e.target.value as EventKind }))}
                className={inputCls}
              >
                {EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year (optional)">
              <input
                type="number"
                min={1900}
                max={2100}
                value={eventForm.occurredYear}
                onChange={(e) => setEventForm((f) => ({ ...f, occurredYear: e.target.value }))}
                placeholder="e.g. 1994"
                className={inputCls}
              />
            </Field>
            <Field label="Headline">
              <input
                value={eventForm.headline}
                onChange={(e) => setEventForm((f) => ({ ...f, headline: e.target.value }))}
                placeholder="e.g. Graduated high school"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={addingEvent}
              className="rounded-lg border border-border-subtle text-white text-sm px-4 py-2 hover:border-accent transition disabled:opacity-50"
            >
              {addingEvent ? 'Adding…' : '+ Add event'}
            </button>
            {eventError && <span className="text-sm text-danger">{eventError}</span>}
          </div>
        </form>

        {events.length > 0 && (
          <ul className="space-y-2 mt-2">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-0 p-3"
              >
                <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-os-autobiographer/20 text-os-autobiographer border border-os-autobiographer/30 shrink-0">
                  {ev.kind}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{ev.headline}</p>
                  {ev.occurredYear && (
                    <p className="text-xs text-text-secondary">{ev.occurredYear}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
