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
  general: 'bg-slate-900/40 text-slate-300 border-slate-800',
  software: 'bg-blue-900/40 text-blue-300 border-blue-800',
  hardware: 'bg-violet-900/40 text-violet-300 border-violet-800',
  travel: 'bg-cyan-900/40 text-cyan-300 border-cyan-800',
  meals: 'bg-amber-900/40 text-amber-300 border-amber-800',
  marketing: 'bg-pink-900/40 text-pink-300 border-pink-800',
  contractor: 'bg-indigo-900/40 text-indigo-300 border-indigo-800',
  office: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  utilities: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  insurance: 'bg-red-900/40 text-red-300 border-red-800',
  professional_services: 'bg-teal-900/40 text-teal-300 border-teal-800',
  education: 'bg-orange-900/40 text-orange-300 border-orange-800',
  taxes: 'bg-rose-900/40 text-rose-300 border-rose-800',
  other: 'bg-slate-900/40 text-slate-400 border-slate-800',
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
