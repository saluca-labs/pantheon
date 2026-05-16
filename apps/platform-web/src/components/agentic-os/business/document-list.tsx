/**
 * Business OS — document list / table.
 *
 * Wave C (UI Depth Wave) adoption: the ad-hoc empty-state div is replaced
 * with the shared `EmptyState` primitive. The filter chips + table render
 * are unchanged.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

'use client';

import { FileText } from 'lucide-react';
import DocumentRow from './document-row';
import type { BusinessDocument, DocumentStatus } from '@/lib/agentic-os/business/documents';
import { DOCUMENT_STATUSES } from '@/lib/agentic-os/business/documents';
import { EmptyState } from '@/components/agentic-os/_shared/views';

interface Props {
  documents: BusinessDocument[];
  statusFilter?: DocumentStatus;
  onStatusChange?: (status: DocumentStatus | undefined) => void;
}

export default function DocumentList({
  documents,
  statusFilter,
  onStatusChange,
}: Props) {
  return (
    <div>
      {/* Filter chips */}
      {onStatusChange && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => onStatusChange(undefined)}
            className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              !statusFilter
                ? 'bg-accent text-white'
                : 'bg-surface-2 border border-border-subtle text-text-secondary hover:text-white'
            }`}
          >
            All
          </button>
          {DOCUMENT_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 border border-border-subtle text-text-secondary hover:text-white'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {documents.length > 0 ? (
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-2">
                <th className="py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Status
                </th>
                <th className="py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Title
                </th>
                <th className="py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Updated
                </th>
                <th className="py-3 px-4 text-right text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <DocumentRow key={d.id} document={d} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No documents yet"
          description="Create your first document to get started."
        />
      )}
    </div>
  );
}
