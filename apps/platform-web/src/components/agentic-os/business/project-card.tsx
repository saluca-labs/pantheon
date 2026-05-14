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
import { Calendar, DollarSign } from 'lucide-react';
import type { Project } from '@/lib/agentic-os/business/projects';
import type { Deal } from '@/lib/agentic-os/business/deals';

interface ProjectCardProps {
  project: Project;
  deal?: Deal | null;
}

const statusColors: Record<string, string> = {
  proposed: 'bg-purple-900/40 text-purple-300 border-purple-800',
  active: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  on_hold: 'bg-amber-900/40 text-amber-300 border-amber-800',
  completed: 'bg-blue-900/40 text-blue-300 border-blue-800',
  cancelled: 'bg-red-900/40 text-red-300 border-red-800',
  archived: 'bg-slate-900/40 text-slate-400 border-slate-800',
};

const billingModelLabels: Record<string, string> = {
  hourly: 'Hourly',
  fixed: 'Fixed Price',
  retainer: 'Retainer',
  milestone: 'Milestone',
  free: 'Free',
};

function formatCents(cents: number | null): string {
  if (cents == null) return 'N/A';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ProjectCard({ project, deal }: ProjectCardProps) {
  const budgetPercent =
    project.budgetCents != null && project.budgetCents > 0
      ? 0 // placeholder — real calculation needs time entry totals
      : 0;

  return (
    <Link
      href={`/dashboard/os/business/projects/${project.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 hover:border-accent/50 transition-colors p-5 group"
    >
      {/* Top row: title + status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-white text-sm font-semibold group-hover:text-teal-300 transition-colors line-clamp-1">
          {project.title}
        </h3>
        <span
          className={`shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
            statusColors[project.status] ?? statusColors.active
          }`}
        >
          {project.status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
      </div>

      {/* Slug */}
      <p className="text-[10px] text-[#64748b] font-mono mb-2">
        {project.slug}
      </p>

      {/* Billing model + rate */}
      <div className="flex items-center gap-3 mb-3">
        <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 border border-accent/30 px-2 py-0.5 text-[10px] font-medium text-accent">
          {billingModelLabels[project.billingModel] ?? project.billingModel}
        </span>
        {project.defaultRateCents != null && (
          <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
            <DollarSign className="w-3 h-3" />
            {formatCents(project.defaultRateCents)}/hr
          </span>
        )}
      </div>

      {/* Budget gauge */}
      {project.budgetCents != null && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] text-text-secondary mb-1">
            <span>Budget</span>
            <span>{formatCents(project.budgetCents)}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-surface-0 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500/60"
              style={{ width: `${Math.min(budgetPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="flex items-center gap-4 text-[10px] text-[#64748b]">
        {project.startDate && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Start: {project.startDate}
          </span>
        )}
        {project.targetCompletionDate && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Target: {project.targetCompletionDate}
          </span>
        )}
      </div>

      {/* Linked deal */}
      {deal && (
        <div className="mt-2 pt-2 border-t border-border-subtle">
          <p className="text-[10px] text-[#64748b]">
            Deal: <span className="text-text-secondary">{deal.title}</span>
          </p>
        </div>
      )}
    </Link>
  );
}
