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
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  type Task,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/agentic-os/business/tasks';

interface TaskFormProps {
  projectId: string;
  initial?: Task;
  onCreated?: (task?: Task) => void;
}

export default function TaskForm({ projectId, initial, onCreated }: TaskFormProps) {
  const isEditing = !!initial;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [descriptionMd, setDescriptionMd] = useState(initial?.descriptionMd ?? '');
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'medium');
  const [assigneeText, setAssigneeText] = useState(initial?.assigneeText ?? '');
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? '');
  const [billingRateCents, setBillingRateCents] = useState(
    initial?.billingRateCents != null ? String(initial.billingRateCents) : ''
  );
  const [isBillable, setIsBillable] = useState(initial?.isBillable ?? true);
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    const body = {
      title: title.trim(),
      project_id: isEditing ? undefined : projectId,
      description_md: descriptionMd.trim() || undefined,
      status,
      priority,
      assignee_text: assigneeText.trim() || null,
      due_on: dueOn || null,
      billing_rate_cents: billingRateCents ? parseInt(billingRateCents, 10) : null,
      is_billable: isBillable,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    setLoading(true);
    try {
      const url = isEditing
        ? `/api/tiresias/agentic-os/business/tasks/${initial!.id}`
        : '/api/tiresias/agentic-os/business/tasks';

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
      onCreated?.(data.task);
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
        {isEditing ? 'Edit Task' : 'New Task'}
      </h3>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor={fid('title')} className={labelClass}>Title *</label>
        <input
          id={fid('title')}
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          required
        />
      </div>

      {/* Status + Priority */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={fid('status')} className={labelClass}>Status</label>
          <select
            id={fid('status')}
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-surface-2 text-white">
                {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={fid('priority')} className={labelClass}>Priority</label>
          <select
            id={fid('priority')}
            className={inputClass}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p} className="bg-surface-2 text-white">
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Assignee + Due Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={fid('assignee')} className={labelClass}>Assignee</label>
          <input
            id={fid('assignee')}
            className={inputClass}
            value={assigneeText}
            onChange={(e) => setAssigneeText(e.target.value)}
            placeholder="Name or role"
          />
        </div>
        <div>
          <label htmlFor={fid('due-date')} className={labelClass}>Due Date</label>
          <input
            id={fid('due-date')}
            className={inputClass}
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
        </div>
      </div>

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
            placeholder="Inherits from project if empty"
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

      {/* Tags */}
      <div>
        <label htmlFor={fid('tags')} className={labelClass}>Tags (comma-separated)</label>
        <input
          id={fid('tags')}
          className={inputClass}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="frontend, bugfix"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor={fid('description')} className={labelClass}>Description (Markdown)</label>
        <textarea
          id={fid('description')}
          className={inputClass}
          rows={3}
          value={descriptionMd}
          onChange={(e) => setDescriptionMd(e.target.value)}
          placeholder="Task details..."
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium px-4 py-1.5 transition disabled:opacity-50"
        >
          {loading ? 'Saving...' : isEditing ? 'Update Task' : 'Create Task'}
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
