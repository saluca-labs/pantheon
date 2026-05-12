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

import { DEAL_STAGES, type DealStage } from '@/lib/agentic-os/business/deals';

export const STAGE_COLORS: Record<DealStage, { bg: string; text: string; label: string }> = {
  lead:        { bg: 'bg-[#374151]',   text: 'text-[#9ca3af]', label: 'Lead' },
  qualified:   { bg: 'bg-[#1e3a5f]',   text: 'text-[#60a5fa]', label: 'Qualified' },
  proposal:    { bg: 'bg-[#4a3a0a]',   text: 'text-[#fbbf24]', label: 'Proposal' },
  negotiation: { bg: 'bg-[#4a2a0a]',   text: 'text-[#fb923c]', label: 'Negotiation' },
  won:         { bg: 'bg-[#064e3b]',   text: 'text-[#34d399]', label: 'Won' },
  lost:        { bg: 'bg-[#3b0a0a]',   text: 'text-[#f87171]', label: 'Lost' },
  on_hold:     { bg: 'bg-[#2e1065]',   text: 'text-[#a78bfa]', label: 'On Hold' },
};

interface DealStagePickerProps {
  stage: DealStage;
  onChange?: (stage: DealStage) => void;
  disabled?: boolean;
}

export default function DealStagePicker({ stage, onChange, disabled }: DealStagePickerProps) {
  const colors = STAGE_COLORS[stage];

  if (!onChange || disabled) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
      >
        {colors.label}
      </span>
    );
  }

  return (
    <select
      value={stage}
      onChange={(e) => onChange(e.target.value as DealStage)}
      disabled={disabled}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border-0 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-[#4361EE] ${colors.bg} ${colors.text}`}
    >
      {DEAL_STAGES.map((s) => (
        <option key={s} value={s} className="bg-[#1a1d27] text-white">
          {STAGE_COLORS[s].label}
        </option>
      ))}
    </select>
  );
}
