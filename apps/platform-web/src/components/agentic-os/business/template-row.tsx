/**
 * Business OS Phase 6 — single template row.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import type { DocTemplate } from '@/lib/agentic-os/business/doc-templates';

const kindColors: Record<string, string> = {
  nda: 'bg-os-secure-dev/15 text-os-secure-dev border-os-secure-dev/30',
  sow: 'bg-accent/15 text-accent border-accent/30',
  msa: 'bg-os-business/15 text-os-business border-os-business/30',
  proposal: 'bg-warning/15 text-warning border-warning/30',
  '1099': 'bg-os-filmmaker/15 text-os-filmmaker border-os-filmmaker/30',
  invoice_terms: 'bg-positive/15 text-positive border-positive/30',
  other: 'bg-surface-2 text-text-secondary border-border-subtle',
};

interface Props {
  template: DocTemplate;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function TemplateRow({ template, onEdit, onDelete }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this template?')) return;
    setDeleting(true);
    try {
      await fetch(
        `/api/tiresias/agentic-os/business/templates/${template.id}`,
        { method: 'DELETE' },
      );
      onDelete?.(template.id);
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }, [template.id, router, onDelete]);

  return (
    <tr className="border-b border-border-subtle hover:bg-surface-2/50 transition-colors">
      <td className="py-3 px-4">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
            kindColors[template.kind] ?? kindColors.other
          }`}
        >
          {template.kind === '1099' ? '1099' : template.kind.replace('_', ' ').toUpperCase()}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-white max-w-[200px] truncate">
        <Link
          href={`/dashboard/os/business/templates/${template.id}`}
          className="hover:text-accent transition-colors"
        >
          {template.title}
        </Link>
      </td>
      <td className="py-3 px-4 text-xs text-text-tertiary font-mono">
        v{template.version}
      </td>
      <td className="py-3 px-4 text-xs text-text-tertiary">
        {template.updatedAt.slice(0, 10)}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit?.(template.id)}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-border-subtle text-text-tertiary hover:text-white transition-colors"
            title="Edit template"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-danger/15 text-text-tertiary hover:text-danger transition-colors"
            title="Delete template"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
