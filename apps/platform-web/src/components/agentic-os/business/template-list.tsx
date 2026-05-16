/**
 * Business OS — template list / table.
 *
 * Wave C (UI Depth Wave) adoption: the ad-hoc empty-state div is replaced
 * with the shared `EmptyState` primitive. The filter chips + table render
 * are unchanged.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

'use client';

import { FileText } from 'lucide-react';
import TemplateRow from './template-row';
import type { DocTemplate, DocTemplateKind } from '@/lib/agentic-os/business/doc-templates';
import { DOC_TEMPLATE_KINDS } from '@/lib/agentic-os/business/doc-templates';
import { EmptyState } from '@/components/agentic-os/_shared/views';

interface Props {
  templates: DocTemplate[];
  kindFilter?: DocTemplateKind;
  onKindChange?: (kind: DocTemplateKind | undefined) => void;
}

export default function TemplateList({ templates, kindFilter, onKindChange }: Props) {
  return (
    <div>
      {/* Filter chips */}
      {onKindChange && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => onKindChange(undefined)}
            className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              !kindFilter
                ? 'bg-accent text-white'
                : 'bg-surface-2 border border-border-subtle text-text-secondary hover:text-white'
            }`}
          >
            All
          </button>
          {DOC_TEMPLATE_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => onKindChange(k)}
              className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                kindFilter === k
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 border border-border-subtle text-text-secondary hover:text-white'
              }`}
            >
              {k === '1099' ? '1099' : k.replace('_', ' ').toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {templates.length > 0 ? (
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-2">
                <th className="py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Kind
                </th>
                <th className="py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Title
                </th>
                <th className="py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Version
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
              {templates.map((t) => (
                <TemplateRow key={t.id} template={t} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No templates yet"
          description="Create your first template to get started."
        />
      )}
    </div>
  );
}
