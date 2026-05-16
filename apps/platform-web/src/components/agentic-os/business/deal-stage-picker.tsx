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
  lead:        { bg: 'bg-surface-3',         text: 'text-text-secondary',    label: 'Lead' },
  qualified:   { bg: 'bg-accent/20',         text: 'text-accent',            label: 'Qualified' },
  proposal:    { bg: 'bg-warning/20',        text: 'text-warning',           label: 'Proposal' },
  negotiation: { bg: 'bg-attention/20',      text: 'text-attention',         label: 'Negotiation' },
  won:         { bg: 'bg-positive/20',       text: 'text-positive',          label: 'Won' },
  lost:        { bg: 'bg-danger/20',         text: 'text-danger',            label: 'Lost' },
  on_hold:     { bg: 'bg-os-secure-dev/20',  text: 'text-os-secure-dev',     label: 'On Hold' },
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border-0 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-accent ${colors.bg} ${colors.text}`}
    >
      {DEAL_STAGES.map((s) => (
        <option key={s} value={s} className="bg-surface-2 text-white">
          {STAGE_COLORS[s].label}
        </option>
      ))}
    </select>
  );
}
