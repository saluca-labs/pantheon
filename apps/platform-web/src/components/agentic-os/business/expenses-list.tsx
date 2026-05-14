/**
 * Business OS — expenses list table.
 *
 * Wave C (UI Depth Wave) adoption: the ad-hoc empty-state div is replaced
 * with the shared `EmptyState` primitive. The table render is unchanged.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

'use client';

import { Wallet } from 'lucide-react';
import ExpenseRow from './expense-row';
import type { Expense } from '@/lib/agentic-os/business/expenses';
import { EmptyState } from '@/components/agentic-os/_shared/views';

interface Props {
  expenses: Expense[];
  emptyMessage?: string;
}

export default function ExpensesList({
  expenses,
  emptyMessage = 'No expenses recorded yet.',
}: Props) {
  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="h-6 w-6" />}
        title="No expenses yet"
        description={emptyMessage}
        primaryCta={{ label: 'New expense', href: '?new=1' }}
      />
    );
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-0/50">
            <th className="py-3 px-4 text-left text-[10px] font-medium text-[#64748b] uppercase tracking-wider">
              Category
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-[#64748b] uppercase tracking-wider">
              Vendor
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-[#64748b] uppercase tracking-wider">
              Description
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-[#64748b] uppercase tracking-wider">
              Date
            </th>
            <th className="py-3 px-4 text-right text-[10px] font-medium text-[#64748b] uppercase tracking-wider">
              Amount
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-[#64748b] uppercase tracking-wider">
              Reimbursable
            </th>
            <th className="py-3 px-4 text-left text-[10px] font-medium text-[#64748b] uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
