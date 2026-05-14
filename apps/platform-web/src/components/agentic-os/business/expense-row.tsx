/**
 * Business OS Phase 5 — single expense row.
 *
 * Displays a single expense with category pill, details, and actions.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, Pencil, Trash2, BadgeCheck } from 'lucide-react';
import ExpenseCategoryPill from './expense-category-pill';
import type { Expense } from '@/lib/agentic-os/business/expenses';

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface Props {
  expense: Expense;
}

export default function ExpenseRow({ expense }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [reimbursing, setReimbursing] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this expense?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/tiresias/agentic-os/business/expenses/${expense.id}`, {
        method: 'DELETE',
      });
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }, [expense.id, router]);

  const handleReimburse = useCallback(async () => {
    setReimbursing(true);
    try {
      await fetch(
        `/api/tiresias/agentic-os/business/expenses/${expense.id}/reimburse`,
        { method: 'POST' },
      );
      router.refresh();
    } catch {
      setReimbursing(false);
    }
  }, [expense.id, router]);

  return (
    <tr className="border-b border-border-subtle hover:bg-surface-2/50 transition-colors">
      <td className="py-3 px-4">
        <ExpenseCategoryPill category={expense.category} />
      </td>
      <td className="py-3 px-4 text-sm text-white max-w-[200px] truncate">
        {expense.vendor || '—'}
      </td>
      <td className="py-3 px-4 text-sm text-text-secondary max-w-[250px] truncate">
        {expense.description || '—'}
      </td>
      <td className="py-3 px-4 text-xs text-[#64748b]">
        {expense.incurredOn}
      </td>
      <td className="py-3 px-4 text-sm font-mono text-white text-right">
        {fmtCents(expense.amountCents)}
      </td>
      <td className="py-3 px-4">
        {expense.isReimbursable && (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-800 bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            {expense.reimbursedAt ? (
              <>
                <BadgeCheck className="w-3 h-3" />
                Reimbursed
              </>
            ) : (
              'Pending'
            )}
          </span>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1">
          {expense.receiptUrl && (
            <a
              href={expense.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-border-subtle text-[#64748b] hover:text-white transition-colors"
              title="View receipt"
            >
              <Receipt className="w-3.5 h-3.5" />
            </a>
          )}
          {expense.isReimbursable && !expense.reimbursedAt && (
            <button
              onClick={handleReimburse}
              disabled={reimbursing}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-border-subtle text-[#64748b] hover:text-amber-400 transition-colors"
              title="Mark reimbursed"
            >
              <BadgeCheck className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => {
              // Edit — navigate to edit form via URL param or modal
              router.push(`?edit=${expense.id}`);
            }}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-border-subtle text-[#64748b] hover:text-white transition-colors"
            title="Edit expense"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-red-900/30 text-[#64748b] hover:text-red-400 transition-colors"
            title="Delete expense"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
