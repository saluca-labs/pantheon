/**
 * MIT License
 *
 * Copyright (c) 2025 Saluca LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */

'use client';

import { useId, useState, type FormEvent } from 'react';
import type { Task } from '@/lib/agentic-os/business/tasks';
import type { TimeEntry } from '@/lib/agentic-os/business/time-entries';

interface TimeEntryFormProps {
  projectId: string;
  tasks?: Task[];
  initial?: TimeEntry;
  mode?: 'timer' | 'manual';
  onCreated?: (entry?: TimeEntry) => void;
}

export default function TimeEntryForm({
  projectId,
  tasks = [],
  initial,
  mode: initialMode = 'manual',
  onCreated,
}: TimeEntryFormProps) {
  const isEditing = !!initial;

  const [taskId, setTaskId] = useState(initial?.taskId ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [mode, setMode] = useState(initialMode);
  const [startedAt, setStartedAt] = useState(
    initial?.startedAt ? initial.startedAt.slice(0, 16) : new Date().toISOString().slice(0, 16)
  );
  const [durationMinutes, setDurationMinutes] = useState(
    initial?.durationMinutes != null ? String(initial.durationMinutes) : '60'
  );
  const [isBillable, setIsBillable] = useState(initial?.isBillable ?? true);
  const [billingRateCents, setBillingRateCents] = useState(
    initial?.billingRateCents != null ? String(initial.billingRateCents) : ''
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!taskId) {
      setError('Please select a task.');
      return;
    }

    const isTimer = mode === 'timer';

    const body: any = {
      task_id: taskId,
      project_id: projectId,
      description: description.trim() || undefined,
      is_billable: isBillable,
      billing_rate_cents: billingRateCents ? parseInt(billingRateCents, 10) : null,
    };

    if (!isTimer) {
      body.started_at = new Date(startedAt).toISOString();
      body.duration_minutes = parseInt(durationMinutes, 10) || 0;
    }

    setLoading(true);
    try {
      const url = isEditing
        ? `/api/tiresias/agentic-os/business/time-entries/${initial!.id}`
        : `/api/tiresias/agentic-os/business/time-entries${isTimer ? '?start_timer=true' : ''}`;

      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      onCreated?.(data.entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none transition';
  const labelClass = 'block text-xs font-medium text-text-secondary mb-1';

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4">
      <h3 className="text-white text-sm font-semibold">
        {isEditing ? 'Edit Time Entry' : mode === 'timer' ? 'Start Timer' : 'Log Time'}
      </h3>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Mode toggle (create only) */}
      {!isEditing && (
        <div className="flex gap-1 bg-surface-0 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setMode('timer')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mode === 'timer'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            Start Timer
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mode === 'manual'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            Log Time
          </button>
        </div>
      )}

      {/* Task select */}
      <div>
        <label htmlFor={fid('task')} className={labelClass}>Task *</label>
        <select
          id={fid('task')}
          className={inputClass}
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          required
        >
          <option value="">Select a task...</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id} className="bg-surface-2 text-white">
              {t.title}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label htmlFor={fid('description')} className={labelClass}>Description</label>
        <input
          id={fid('description')}
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What are you working on?"
        />
      </div>

      {/* Timer mode: just a start-button note */}
      {mode === 'timer' && !isEditing && (
        <p className="text-xs text-text-secondary">
          The timer will start immediately and track elapsed time until you stop it.
        </p>
      )}

      {/* Manual mode: started at + duration */}
      {mode === 'manual' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={fid('started-at')} className={labelClass}>Started At</label>
            <input
              id={fid('started-at')}
              className={inputClass}
              type="datetime-local"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={fid('duration')} className={labelClass}>Duration (minutes)</label>
            <input
              id={fid('duration')}
              className={inputClass}
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="60"
              min={1}
            />
          </div>
        </div>
      )}

      {/* Rate + Billable */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={fid('billing-rate')} className={labelClass}>Billing Rate (cents)</label>
          <input
            id={fid('billing-rate')}
            className={inputClass}
            type="number"
            value={billingRateCents}
            onChange={(e) => setBillingRateCents(e.target.value)}
            placeholder="Inherits from task/project if empty"
            min={0}
          />
        </div>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isBillable}
              onChange={(e) => setIsBillable(e.target.checked)}
              className="rounded border-border-subtle bg-surface-0 accent-accent"
            />
            <span className="text-xs text-text-secondary">Billable</span>
          </label>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-os-business hover:bg-os-business/90 text-white text-sm font-medium px-4 py-1.5 transition disabled:opacity-50"
        >
          {loading
            ? 'Saving...'
            : isEditing
            ? 'Update Entry'
            : mode === 'timer'
            ? 'Start Timer'
            : 'Log Time'}
        </button>
        <button
          type="button"
          onClick={() => onCreated?.()}
          className="rounded-lg border border-border-subtle bg-surface-2 hover:border-accent text-text-secondary text-sm font-medium px-4 py-1.5 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
