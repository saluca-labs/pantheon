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

import Link from 'next/link';
import type { Deal } from '@/lib/agentic-os/business/deals';
import DealStagePicker from './deal-stage-picker';

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface DealCardProps {
  deal: Deal;
  contactName?: string | null;
  orgName?: string | null;
}

export default function DealCard({ deal, contactName, orgName }: DealCardProps) {
  const expectedClose = formatDate(deal.expectedCloseDate);

  return (
    <Link
      href={`/dashboard/os/business/deals/${deal.id}`}
      className="block rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-3 hover:border-[#4361EE] transition-colors w-[280px] shrink-0"
    >
      {/* Title */}
      <h4 className="text-white text-sm font-semibold truncate mb-2">{deal.title}</h4>

      {/* Stage + Value */}
      <div className="flex items-center justify-between mb-2">
        <DealStagePicker stage={deal.stage} disabled />
        <span className="text-teal-300 text-xs font-medium">
          {deal.valueCents != null ? formatValue(deal.valueCents, deal.currency) : '--'}
        </span>
      </div>

      {/* Contact / Org */}
      {(contactName || orgName) && (
        <div className="text-[#94a3b8] text-xs mb-1.5 truncate">
          {contactName && <span>{contactName}</span>}
          {contactName && orgName && <span className="mx-1">·</span>}
          {orgName && <span>{orgName}</span>}
        </div>
      )}

      {/* Probability + Close Date */}
      <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-2">
        <span>{deal.probabilityPct}% prob.</span>
        {expectedClose && <span>{expectedClose}</span>}
      </div>

      {/* Tags */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deal.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md bg-[#0f1117] border border-[#2a2d3e] px-1.5 py-0.5 text-[10px] text-[#94a3b8]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
