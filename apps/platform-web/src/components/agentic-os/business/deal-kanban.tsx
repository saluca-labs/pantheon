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

/**
 * Business OS — deal kanban + list views.
 *
 * Wave C (UI Depth Wave) adoption: the hand-rolled column markup is replaced
 * with the shared `KanbanBoard` primitive. The board now supports drag-to-stage
 * (wired to the existing `POST /deals/:id/stage` endpoint that deal-detail-shell
 * already uses) with optimistic update + revert-on-failure. The board/list
 * toggle, show-closed toggle, and the list table view are preserved as-is.
 */

import { useState, useMemo } from 'react';
import { DEAL_STAGES, type Deal, type DealStage } from '@/lib/agentic-os/business/deals';
import {
  KanbanBoard,
  type KanbanColumn,
  type KanbanItemBase,
  type KanbanMoveEvent,
} from '@/components/agentic-os/_shared/views';
import DealCard from './deal-card';
import DealRow from './deal-row';
import { STAGE_COLORS } from './deal-stage-picker';

interface DealKanbanProps {
  deals: Deal[];
  contacts: { id: string; firstName: string; lastName: string }[];
  orgs: { id: string; name: string }[];
}

/** Kanban item wrapper — carries the Deal alongside the primitive's id/columnId. */
interface DealKanbanItem extends KanbanItemBase {
  deal: Deal;
}

const CLOSED_STAGES: DealStage[] = ['won', 'lost'];

export default function DealKanban({ deals: initialDeals, contacts, orgs }: DealKanbanProps) {
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [showClosed, setShowClosed] = useState(false);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);

  const contactMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contacts) {
      m.set(c.id, `${c.firstName} ${c.lastName}`.trim());
    }
    return m;
  }, [contacts]);

  const orgMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orgs) {
      m.set(o.id, o.name);
    }
    return m;
  }, [orgs]);

  // Columns: drop the closed (won/lost) columns unless the user opts in.
  const columns: KanbanColumn[] = useMemo(() => {
    return DEAL_STAGES.filter(
      (stage) => showClosed || !CLOSED_STAGES.includes(stage),
    ).map((stage) => ({
      id: stage,
      title: STAGE_COLORS[stage].label,
    }));
  }, [showClosed]);

  const items: DealKanbanItem[] = useMemo(
    () => deals.map((d) => ({ id: d.id, columnId: d.stage, deal: d })),
    [deals],
  );

  async function handleMove({ itemId, fromColumnId, toColumnId }: KanbanMoveEvent) {
    const newStage = toColumnId as DealStage;
    // Optimistic update.
    setDeals((prev) =>
      prev.map((d) => (d.id === itemId ? { ...d, stage: newStage } : d)),
    );
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/business/deals/${itemId}/stage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: newStage }),
        },
      );
      if (!res.ok) throw new Error(`Stage transition failed: ${res.status}`);
      const updated: Deal = await res.json();
      setDeals((prev) => prev.map((d) => (d.id === itemId ? updated : d)));
    } catch {
      // Revert on failure.
      setDeals((prev) =>
        prev.map((d) =>
          d.id === itemId ? { ...d, stage: fromColumnId as DealStage } : d,
        ),
      );
    }
  }

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-border-subtle overflow-hidden">
          <button
            onClick={() => setViewMode('board')}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              viewMode === 'board'
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-text-secondary hover:text-white'
            }`}
          >
            Board
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              viewMode === 'list'
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-text-secondary hover:text-white'
            }`}
          >
            List
          </button>
        </div>

        {viewMode === 'board' && (
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="text-xs text-text-secondary hover:text-white transition"
          >
            {showClosed ? 'Hide closed' : 'Show closed'}
          </button>
        )}
      </div>

      {viewMode === 'board' ? (
        /* KANBAN BOARD — shared primitive */
        <KanbanBoard<DealKanbanItem>
          columns={columns}
          items={items}
          slug="business"
          onMove={handleMove}
          emptyColumnLabel={(column) =>
            `No ${column.title.toLowerCase()} deals`
          }
          renderCard={(item) => (
            <DealCard
              deal={item.deal}
              contactName={
                item.deal.contactId
                  ? (contactMap.get(item.deal.contactId) ?? null)
                  : null
              }
              orgName={
                item.deal.organizationId
                  ? (orgMap.get(item.deal.organizationId) ?? null)
                  : null
              }
            />
          )}
        />
      ) : (
        /* LIST / TABLE VIEW */
        <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle text-left">
                <th className="px-4 py-2.5 text-xs font-semibold text-text-secondary">Title</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-text-secondary">Contact</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-text-secondary">Value</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-text-secondary">Stage</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-text-secondary">Close Date</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs text-text-secondary/60">
                    No deals yet.
                  </td>
                </tr>
              )}
              {deals.map((d) => (
                <DealRow
                  key={d.id}
                  deal={d}
                  contactName={d.contactId ? (contactMap.get(d.contactId) ?? null) : null}
                  orgName={d.organizationId ? (orgMap.get(d.organizationId) ?? null) : null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
