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

import { useState, useMemo } from 'react';
import { DEAL_STAGES, type Deal, type DealStage } from '@/lib/agentic-os/business/deals';
import DealCard from './deal-card';
import DealRow from './deal-row';
import { STAGE_COLORS } from './deal-stage-picker';
import DealStagePicker from './deal-stage-picker';

interface DealKanbanProps {
  deals: Deal[];
  contacts: { id: string; firstName: string; lastName: string }[];
  orgs: { id: string; name: string }[];
}

export default function DealKanban({ deals, contacts, orgs }: DealKanbanProps) {
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [showClosed, setShowClosed] = useState(false);

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

  const dealsByStage = useMemo(() => {
    const map = new Map<DealStage, Deal[]>();
    for (const stage of DEAL_STAGES) {
      map.set(stage, []);
    }
    for (const d of deals) {
      const stageDeals = map.get(d.stage) ?? [];
      stageDeals.push(d);
    }
    return map;
  }, [deals]);

  const isClosedStage = (stage: DealStage) => stage === 'won' || stage === 'lost';

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-[#2a2d3e] overflow-hidden">
          <button
            onClick={() => setViewMode('board')}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              viewMode === 'board'
                ? 'bg-[#4361EE] text-white'
                : 'bg-[#1a1d27] text-[#94a3b8] hover:text-white'
            }`}
          >
            Board
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              viewMode === 'list'
                ? 'bg-[#4361EE] text-white'
                : 'bg-[#1a1d27] text-[#94a3b8] hover:text-white'
            }`}
          >
            List
          </button>
        </div>

        {viewMode === 'board' && (
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="text-xs text-[#94a3b8] hover:text-white transition"
          >
            {showClosed ? 'Hide closed' : 'Show closed'}
          </button>
        )}
      </div>

      {viewMode === 'board' ? (
        /* KANBAN BOARD */
        <div className="flex gap-3 overflow-x-auto pb-4">
          {DEAL_STAGES.map((stage) => {
            const stageDeals = dealsByStage.get(stage) ?? [];
            const colors = STAGE_COLORS[stage];
            const closed = isClosedStage(stage);

            // Collapse won/lost unless showClosed is toggled
            const visible = closed && !showClosed ? [] : stageDeals;

            return (
              <div
                key={stage}
                className="flex-shrink-0 w-[300px] rounded-xl border border-[#2a2d3e] bg-[#1a1d27] flex flex-col max-h-[70vh]"
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2a2d3e]">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${colors.bg}`} />
                    <span className={`text-xs font-semibold ${colors.text}`}>{colors.label}</span>
                    <span className="text-xs text-[#94a3b8]">{stageDeals.length}</span>
                  </div>
                  {closed && stageDeals.length > 0 && !showClosed && (
                    <span className="text-[10px] text-[#94a3b8]">collapsed</span>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {visible.map((d) => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      contactName={
                        d.contactId ? (contactMap.get(d.contactId) ?? null) : null
                      }
                      orgName={d.organizationId ? (orgMap.get(d.organizationId) ?? null) : null}
                    />
                  ))}
                  {visible.length === 0 && (
                    <p className="text-xs text-[#94a3b8]/60 text-center py-6">
                      {closed && !showClosed
                        ? `${stageDeals.length} deal${stageDeals.length !== 1 ? 's' : ''}`
                        : `No ${colors.label.toLowerCase()} deals`}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST / TABLE VIEW */
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a2d3e] text-left">
                <th className="px-4 py-2.5 text-xs font-semibold text-[#94a3b8]">Title</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#94a3b8]">Contact</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#94a3b8]">Value</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#94a3b8]">Stage</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#94a3b8]">Close Date</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs text-[#94a3b8]/60">
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
