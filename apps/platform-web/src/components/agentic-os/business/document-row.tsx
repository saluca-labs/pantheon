/**
 * Business OS Phase 6 — single document row.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2, Send, PenLine, Download } from 'lucide-react';
import type { BusinessDocument } from '@/lib/agentic-os/business/documents';

const statusColors: Record<string, string> = {
  draft: 'bg-slate-900/40 text-slate-300 border-slate-800',
  sent: 'bg-blue-900/40 text-blue-300 border-blue-800',
  signed: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  declined: 'bg-red-900/40 text-red-300 border-red-800',
  expired: 'bg-amber-900/40 text-amber-300 border-amber-800',
};

interface Props {
  document: BusinessDocument;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSend?: (id: string) => void;
  onSign?: (id: string) => void;
}

export default function DocumentRow({
  document: doc,
  onEdit,
  onDelete,
  onSend,
  onSign,
}: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this document?')) return;
    setDeleting(true);
    try {
      await fetch(
        `/api/tiresias/agentic-os/business/documents/${doc.id}`,
        { method: 'DELETE' },
      );
      onDelete?.(doc.id);
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }, [doc.id, router, onDelete]);

  return (
    <tr className="border-b border-[#2a2d3e] hover:bg-[#1a1d27]/50 transition-colors">
      <td className="py-3 px-4">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
            statusColors[doc.status] ?? statusColors.draft
          }`}
        >
          {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-white max-w-[200px] truncate">
        <Link
          href={`/dashboard/os/business/documents/${doc.id}`}
          className="hover:text-[#4361EE] transition-colors"
        >
          {doc.title}
        </Link>
      </td>
      <td className="py-3 px-4 text-xs text-[#64748b]">
        {doc.updatedAt.slice(0, 10)}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1">
          {doc.status === 'draft' && (
            <>
              <button
                onClick={() => onSend?.(doc.id)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-blue-900/30 text-[#64748b] hover:text-blue-400 transition-colors"
                title="Send document"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onEdit?.(doc.id)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#2a2d3e] text-[#64748b] hover:text-white transition-colors"
                title="Edit document"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {doc.status === 'sent' && (
            <button
              onClick={() => onSign?.(doc.id)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-emerald-900/30 text-[#64748b] hover:text-emerald-400 transition-colors"
              title="Sign document"
            >
              <PenLine className="w-3.5 h-3.5" />
            </button>
          )}
          {doc.status === 'signed' && (
            <a
              href={`/api/tiresias/agentic-os/business/documents/${doc.id}/export.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#2a2d3e] text-[#64748b] hover:text-white transition-colors"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-red-900/30 text-[#64748b] hover:text-red-400 transition-colors"
            title="Delete document"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
