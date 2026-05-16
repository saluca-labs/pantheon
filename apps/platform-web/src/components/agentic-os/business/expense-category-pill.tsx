/**
 * Business OS Phase 5 — expense category pill.
 *
 * Small colored tag indicating the expense category.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

'use client';

import React from 'react';
import type { ExpenseCategory } from '@/lib/agentic-os/business/expenses';

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  general: 'bg-surface-2 text-text-secondary border-border-subtle',
  software: 'bg-accent/15 text-accent border-accent/30',
  hardware: 'bg-os-secure-dev/15 text-os-secure-dev border-os-secure-dev/30',
  travel: 'bg-accent-info/15 text-accent-info border-accent-info/30',
  meals: 'bg-warning/15 text-warning border-warning/30',
  marketing: 'bg-accent-pink/15 text-accent-pink border-accent-pink/30',
  contractor: 'bg-os-autobiographer/15 text-os-autobiographer border-os-autobiographer/30',
  office: 'bg-positive/15 text-positive border-positive/30',
  utilities: 'bg-os-maker/15 text-os-maker border-os-maker/30',
  insurance: 'bg-danger/15 text-danger border-danger/30',
  professional_services: 'bg-os-business/15 text-os-business border-os-business/30',
  education: 'bg-attention/15 text-attention border-attention/30',
  taxes: 'bg-os-filmmaker/15 text-os-filmmaker border-os-filmmaker/30',
  other: 'bg-surface-2 text-text-tertiary border-border-subtle',
};

interface Props {
  category: ExpenseCategory;
}

export default function ExpenseCategoryPill({ category }: Props) {
  const colorClass = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${colorClass}`}
    >
      {category.replace('_', ' ')}
    </span>
  );
}
