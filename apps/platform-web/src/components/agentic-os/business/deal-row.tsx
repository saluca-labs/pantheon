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

interface DealRowProps {
  deal: Deal;
  contactName?: string | null;
  orgName?: string | null;
}

export default function DealRow({ deal, contactName, orgName }: DealRowProps) {
  const expectedClose = formatDate(deal.expectedCloseDate);

  return (
    <tr className="border-b border-[#2a2d3e] hover:bg-[#1e2130] transition-colors">
      <td className="px-4 py-2.5">
        <Link
          href={`/dashboard/os/business/deals/${deal.id}`}
          className="text-white text-xs font-medium hover:text-[#4361EE] transition-colors"
        >
          {deal.title}
        </Link>
      </td>
      <td className="px-4 py-2.5 text-xs text-[#94a3b8]">
        {contactName || '--'}
        {contactName && orgName && <span className="mx-1">·</span>}
        {orgName && !contactName && <span>{orgName}</span>}
        {contactName && orgName && <span>{orgName}</span>}
      </td>
      <td className="px-4 py-2.5 text-xs text-teal-300 font-medium">
        {formatValue(deal.valueCents, deal.currency)}
      </td>
      <td className="px-4 py-2.5">
        <DealStagePicker stage={deal.stage} disabled />
      </td>
      <td className="px-4 py-2.5 text-xs text-[#94a3b8]">
        {expectedClose ?? '--'}
      </td>
    </tr>
  );
}
