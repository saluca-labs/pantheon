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

import { useId, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { DEAL_STAGES, type Deal, type DealStage } from '@/lib/agentic-os/business/deals';
import type { Interaction } from '@/lib/agentic-os/business/crm';
import { fullName } from '@/lib/agentic-os/business/crm';
import DealStagePicker from './deal-stage-picker';
import { InteractionEditor } from '@/components/agentic-os/business/interaction-editor';
import { InteractionTimeline } from '@/components/agentic-os/business/interaction-timeline';

function formatValue(cents: number, currency: string = 'USD'): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface DealDetailShellProps {
  deal: Deal;
  contact: { id: string; firstName: string; lastName: string } | null;
  organization: { id: string; name: string } | null;
  initialInteractions: Interaction[];
}

export default function DealDetailShell({
  deal: initialDeal,
  contact,
  organization,
  initialInteractions,
}: DealDetailShellProps) {
  const [deal, setDeal] = useState<Deal>(initialDeal);
  const [interactions, setInteractions] = useState<Interaction[]>(initialInteractions);
  const [stageError, setStageError] = useState<string | null>(null);
  const stageSelectId = useId();

  const isArchived = !!deal.archivedAt;
  const isTerminal = deal.stage === 'won' || deal.stage === 'lost' || isArchived;

  async function handleStageChange(newStage: DealStage) {
    setStageError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/business/deals/${deal.id}/stage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: newStage }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Stage transition failed: ${res.status}`);
      }
      const updated: Deal = await res.json();
      setDeal(updated);
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'Failed to change stage.');
    }
  }

  function handleInteractionCreated(interaction: Interaction) {
    setInteractions((prev) => [interaction, ...prev]);
  }

  const cardClass = 'rounded-xl border border-border-subtle bg-surface-2 p-5';
  const labelClass = 'block text-xs font-medium text-text-secondary mb-1';
  const valueClass = 'text-sm text-text-primary';

  return (
    <div className="space-y-5">
      {/* Meta Card */}
      <div className={cardClass}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-text-primary text-lg font-bold">{deal.title}</h2>
          <DealStagePicker stage={deal.stage} disabled={isTerminal} onChange={handleStageChange} />
        </div>

        {stageError && (
          <div className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
            {stageError}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <div>
            <span className={labelClass}>Value</span>
            <span className={`${valueClass} text-os-business tabular-nums`}>
              {deal.valueCents != null ? formatValue(deal.valueCents, deal.currency) : '--'}
            </span>
          </div>
          <div>
            <span className={labelClass}>Probability</span>
            <span className={valueClass}>{deal.probabilityPct}%</span>
          </div>
          <div>
            <span className={labelClass}>Expected Close</span>
            <span className={valueClass}>{formatDate(deal.expectedCloseDate) ?? '--'}</span>
          </div>
          <div>
            <span className={labelClass}>Source</span>
            <span className={valueClass}>{deal.source || '--'}</span>
          </div>

          {contact && (
            <div>
              <span className={labelClass}>Contact</span>
              <Link
                href={`/dashboard/os/business/people/${contact.id}`}
                className={`${valueClass} text-accent hover:underline`}
              >
                {fullName(contact)}
              </Link>
            </div>
          )}
          {organization && (
            <div>
              <span className={labelClass}>Organization</span>
              <Link
                href={`/dashboard/os/business/orgs/${organization.id}`}
                className={`${valueClass} text-accent hover:underline`}
              >
                {organization.name}
              </Link>
            </div>
          )}

          {deal.closedAt && (
            <div>
              <span className={labelClass}>Closed</span>
              <span className={valueClass}>{formatDateTime(deal.closedAt)}</span>
            </div>
          )}
          <div>
            <span className={labelClass}>Created</span>
            <span className={valueClass}>{formatDateTime(deal.createdAt)}</span>
          </div>
          <div>
            <span className={labelClass}>Updated</span>
            <span className={valueClass}>{formatDateTime(deal.updatedAt)}</span>
          </div>
        </div>

        {/* Stage transition dropdown */}
        {!isTerminal && (
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <label htmlFor={stageSelectId} className={`${labelClass} mb-2`}>Move to...</label>
            <select
              id={stageSelectId}
              value=""
              onChange={(e) => {
                if (e.target.value) handleStageChange(e.target.value as DealStage);
              }}
              className="rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none transition"
            >
              <option value="" disabled className="bg-surface-2 text-text-secondary">Select stage...</option>
              {DEAL_STAGES.filter((s) => s !== deal.stage).map((s) => (
                <option key={s} value={s} className="bg-surface-2 text-text-primary">
                  {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tags */}
      {deal.tags && deal.tags.length > 0 && (
        <div className={cardClass}>
          <span className={labelClass}>Tags</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {deal.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded bg-os-business/15 border border-os-business/30 px-2 py-0.5 text-xs text-os-business"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lost reason */}
      {deal.stage === 'lost' && deal.lostReason && (
        <div className={`${cardClass} border-danger/30`}>
          <span className={labelClass}>Lost Reason</span>
          <p className="text-sm text-danger mt-1">{deal.lostReason}</p>
        </div>
      )}

      {/* Description */}
      {deal.descriptionMd && (
        <div className={cardClass}>
          <span className={labelClass}>Description</span>
          <div className="prose prose-invert prose-sm mt-2 max-w-none text-text-primary">
            <ReactMarkdown>{deal.descriptionMd}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Interactions */}
      <div className={cardClass}>
        <span className={labelClass}>Add Interaction</span>
        <div className="mt-2">
          <InteractionEditor
            defaultDealId={deal.id}
            onCreated={handleInteractionCreated}
          />
        </div>
      </div>

      <div className={cardClass}>
        <span className={labelClass}>Timeline</span>
        <div className="mt-2">
          <InteractionTimeline interactions={interactions} />
        </div>
      </div>
    </div>
  );
}
