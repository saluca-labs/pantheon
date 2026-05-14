'use client';

/**
 * Filmmaker OS — ShootingDayCard.
 *
 * Single day card with header (date / label / call / wrap / unit /
 * status), inline editor, and a stack of strips.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Pencil, Save, Trash2, X } from 'lucide-react';
import type {
  ShootingDay,
  ShootingDayWithStrips,
  ShootingUnit,
  ShootingDayStatus,
} from '@/lib/agentic-os/filmmaker/schedule';
import {
  SHOOTING_DAY_STATUSES,
  SHOOTING_UNITS,
  totalShootMinutes,
  totalEighths,
} from '@/lib/agentic-os/filmmaker/schedule';
import { pagesLabel } from '@/lib/agentic-os/filmmaker/breakdown';
import { ScheduleStripRow } from './ScheduleStripRow';

interface Props {
  day: ShootingDayWithStrips;
  allDays: ShootingDay[];
}

export function ShootingDayCard({ day, allDays }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    label: day.label ?? '',
    shootDate: day.shootDate ?? '',
    callTime: day.callTime ?? '',
    wrapTime: day.wrapTime ?? '',
    unit: day.unit,
    status: day.status,
    notes: day.notes ?? '',
  });

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/filmmaker/shooting-days/${day.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            label: form.label || null,
            shootDate: form.shootDate || null,
            callTime: form.callTime || null,
            wrapTime: form.wrapTime || null,
            unit: form.unit,
            status: form.status,
            notes: form.notes || null,
          }),
        },
      );
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteDay() {
    if (!confirm(`Delete day ${day.dayNumber}? Strips will be removed.`)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/filmmaker/shooting-days/${day.id}`,
        { method: 'DELETE' },
      );
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const statusInfo = SHOOTING_DAY_STATUSES.find((s) => s.status === day.status);
  const minutes = totalShootMinutes(day);
  const eighths = totalEighths(day);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
      <div className="p-3 flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-text-secondary">
              Day {day.dayNumber}
            </span>
            {day.unit !== 'main' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-secondary">
                {day.unit.replace('_', ' ')}
              </span>
            )}
            {statusInfo && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border ${statusInfo.color}`}
              >
                {statusInfo.label}
              </span>
            )}
          </div>
          <p className="text-sm text-white mt-0.5">
            {day.label ?? 'Untitled'}
            {day.shootDate && (
              <span className="text-text-secondary ml-2">{day.shootDate}</span>
            )}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {day.callTime ? `Call ${day.callTime}` : 'No call set'}
            {day.wrapTime ? ` · Wrap ${day.wrapTime}` : ''}
            {day.strips.length > 0 && (
              <>
                {' · '}
                {day.strips.length} scenes
                {eighths > 0 && ` · ${pagesLabel(eighths)} pp`}
                {minutes > 0 && ` · ${minutes} min`}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={`/api/tiresias/agentic-os/filmmaker/shooting-days/${day.id}/exports/call-sheet.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-secondary hover:text-white p-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide"
            title="Call sheet PDF"
          >
            <Download className="w-3.5 h-3.5" />
            Call sheet
          </a>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-text-secondary hover:text-white p-1"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={deleteDay}
            disabled={busy}
            className="text-text-secondary hover:text-red-300 p-1"
            title="Delete day"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="px-3 pb-3 space-y-2 border-t border-border-subtle pt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-white"
            />
            <input
              type="date"
              value={form.shootDate}
              onChange={(e) => setForm({ ...form, shootDate: e.target.value })}
              className="text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-white"
            />
            <input
              type="time"
              placeholder="Call"
              value={form.callTime}
              onChange={(e) => setForm({ ...form, callTime: e.target.value })}
              className="text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-white"
            />
            <input
              type="time"
              placeholder="Wrap"
              value={form.wrapTime}
              onChange={(e) => setForm({ ...form, wrapTime: e.target.value })}
              className="text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-white"
            />
            <select
              value={form.unit}
              onChange={(e) =>
                setForm({ ...form, unit: e.target.value as ShootingUnit })
              }
              className="text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-white"
            >
              {SHOOTING_UNITS.map((u) => (
                <option key={u.unit} value={u.unit}>
                  {u.label}
                </option>
              ))}
            </select>
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as ShootingDayStatus })
              }
              className="text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-white"
            >
              {SHOOTING_DAY_STATUSES.map((s) => (
                <option key={s.status} value={s.status}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-white"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border-subtle text-text-secondary hover:text-white"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded bg-accent text-white disabled:opacity-40"
            >
              <Save className="w-3 h-3" /> Save
            </button>
          </div>
        </div>
      )}

      <div className="px-3 pb-3">
        {day.strips.length === 0 ? (
          <p className="text-[11px] text-[#64748b] italic">
            No scenes scheduled. Drop one from the left.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {day.strips.map((strip, idx) => (
              <ScheduleStripRow
                key={strip.id}
                strip={strip}
                day={day}
                index={idx}
                total={day.strips.length}
                allDays={allDays}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
