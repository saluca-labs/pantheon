/**
 * Business OS Phase 6 — document list / table.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

'use client';

import { FileText } from 'lucide-react';
import DocumentRow from './document-row';
import type { BusinessDocument, DocumentStatus } from '@/lib/agentic-os/business/documents';
import { DOCUMENT_STATUSES } from '@/lib/agentic-os/business/documents';

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
                ? 'bg-[#4361EE] text-white'
                : 'bg-[#1a1d27] border border-[#2a2d3e] text-[#94a3b8] hover:text-white'
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
                  ? 'bg-[#4361EE] text-white'
                  : 'bg-[#1a1d27] border border-[#2a2d3e] text-[#94a3b8] hover:text-white'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {documents.length > 0 ? (
        <div className="rounded-xl border border-[#2a2d3e] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a2d3e] bg-[#1a1d27]">
                <th className="py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                  Status
                </th>
                <th className="py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                  Title
                </th>
                <th className="py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                  Updated
                </th>
                <th className="py-3 px-4 text-right text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
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
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-12 text-center">
          <FileText className="w-8 h-8 text-[#64748b] mx-auto mb-3" />
          <p className="text-[#94a3b8] text-sm">
            No documents yet. Create your first document to get started.
          </p>
        </div>
      )}
    </div>
  );
}
