/**
 * Business OS Phase 5 — expenses list page.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import { Wallet, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listExpenses } from '@/lib/agentic-os/business/expenses-repo';
import { listProjects } from '@/lib/agentic-os/business/projects-repo';
import { EXPENSE_CATEGORIES } from '@/lib/agentic-os/business/expenses';
import ExpenseForm from '@/components/agentic-os/business/expense-form';
import ExpensesList from '@/components/agentic-os/business/expenses-list';

export const dynamic = 'force-dynamic';

const FILTER_CATEGORIES = ['all', ...EXPENSE_CATEGORIES] as const;

interface Props {
  searchParams: Promise<{
    new?: string;
    category?: string;
    project_id?: string;
    reimbursable?: string;
    q?: string;
  }>;
}

export default async function ExpensesPage({ searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const showNew = sp.new === '1';
  const activeCategory = (FILTER_CATEGORIES as readonly string[]).includes(sp.category ?? '')
    ? sp.category
    : 'all';
  const reimbursableOnly = sp.reimbursable === '1';
  const query = sp.q;

  const [expenses, projects] = await Promise.all([
    listExpenses(user.userId, {
      category: activeCategory !== 'all' ? (activeCategory as any) : undefined,
      projectId: sp.project_id ?? undefined,
      reimbursable: reimbursableOnly || undefined,
      q: query ?? undefined,
      limit: 500,
    }),
    listProjects(user.userId, { limit: 500 }),
  ]);

  const projectsList = projects.map((p) => ({ id: p.id, title: p.title }));

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/business"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Business OS
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Wallet className="w-6 h-6 text-os-business" />
          <h1 className="text-2xl font-semibold text-white">Expenses</h1>
        </div>
        <Link
          href="?new=1"
          className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New expense
        </Link>
      </div>

      {showNew && (
        <div className="mb-6 rounded-xl border border-border-subtle bg-surface-2 p-6">
          <ExpenseForm
            projects={projectsList}
          />
        </div>
      )}

      {/* Category filter chips */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 flex-wrap">
        {FILTER_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={c === 'all' ? '?' : `?category=${c}`}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === c
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-subtle bg-surface-2 text-text-secondary hover:text-white hover:border-accent/50'
            }`}
          >
            {c === 'all' ? 'All' : c.replace('_', ' ')}
          </Link>
        ))}
        <Link
          href={reimbursableOnly ? '?' : '?reimbursable=1'}
          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            reimbursableOnly
              ? 'border-warning bg-warning/10 text-warning'
              : 'border-border-subtle bg-surface-2 text-text-secondary hover:text-white hover:border-warning/50'
          }`}
        >
          Reimbursable only
        </Link>
      </div>

      <ExpensesList
        expenses={expenses}
        emptyMessage={
          expenses.length === 0
            ? query || sp.category
              ? 'No expenses match the selected filter.'
              : 'No expenses yet. Track your first expense to start building financial records.'
            : 'No expenses match the selected filter.'
        }
      />
    </div>
  );
}
