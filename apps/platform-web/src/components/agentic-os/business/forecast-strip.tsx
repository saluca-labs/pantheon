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

import { useMemo } from 'react';
import type { Deal } from '@/lib/agentic-os/business/deals';

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (dollars >= 1_000) {
    return `$${(dollars / 1_000).toFixed(0)}K`;
  }
  return `$${dollars.toFixed(0)}`;
}

interface ForecastStripProps {
  deals: Deal[];
}

export default function ForecastStrip({ deals }: ForecastStripProps) {
  const { openDeals, totalValue, weightedValue } = useMemo(() => {
    const open = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
    const total = open.reduce((sum, d) => sum + (d.valueCents ?? 0), 0);
    const weighted = open.reduce(
      (sum, d) => sum + ((d.valueCents ?? 0) * d.probabilityPct) / 100,
      0,
    );
    return {
      openDeals: open.length,
      totalValue: total,
      weightedValue: weighted,
    };
  }, [deals]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-2 px-4 py-2.5">
      <span className="text-xs font-medium text-text-secondary">Pipeline</span>
      <span className="h-4 w-px bg-border-subtle" />
      <span className="text-xs text-white font-semibold">
        {openDeals} open deal{openDeals !== 1 ? 's' : ''}
      </span>
      <span className="text-xs text-text-secondary">·</span>
      <span className="text-xs text-teal-300 font-semibold">
        {formatDollars(totalValue)} total
      </span>
      <span className="text-xs text-text-secondary">·</span>
      <span className="text-xs text-teal-300/80">
        {formatDollars(weightedValue)} weighted
      </span>
    </div>
  );
}
