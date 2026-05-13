/**
 * Business OS Phase 5 — expenses list table.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

'use client';

import { Wallet } from 'lucide-react';
import ExpenseRow from './expense-row';
import type { Expense } from '@/lib/agentic-os/business/expenses';

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
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-12 text-center">
        <Wallet className="w-8 h-8 text-[#64748b] mx-auto mb-3" />
        <p className="text-[#94a3b8] text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#2a2d3e] bg-[#0f1117]/50">
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
