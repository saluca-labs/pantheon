'use client';

/**
 * Research OS Phase 4 — collapsible markdown abstract block.
 *
 * Renders `abstract_md` via react-markdown WITHOUT rehype-raw (same XSS
 * guard pattern as Phase 2 notebook entries). Collapses to a 4-line
 * preview by default; click "Expand" to reveal the full body.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  /** Markdown body. Empty or null renders the placeholder. */
  abstractMd: string | null | undefined;
  /** Approximate preview character cap before "Expand" appears. */
  previewMax?: number;
}

export function PaperAbstractCollapsible({ abstractMd, previewMax = 480 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const body = abstractMd?.trim() ?? '';
  if (!body) {
    return (
      <p className="text-sm text-text-secondary italic" data-testid="paper-abstract-empty">
        No abstract recorded.
      </p>
    );
  }
  const needsCollapse = body.length > previewMax;
  const shown = expanded || !needsCollapse ? body : body.slice(0, previewMax) + '…';
  return (
    <div data-testid="paper-abstract-collapsible">
      <div
        className="prose prose-invert prose-sm max-w-none text-text-primary [&_a]:text-accent [&_code]:text-text-secondary [&_code]:bg-surface-0 [&_code]:px-1 [&_code]:rounded"
        data-testid="paper-abstract-body"
      >
        <ReactMarkdown>{shown}</ReactMarkdown>
      </div>
      {needsCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          data-testid="paper-abstract-toggle"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Expand
            </>
          )}
        </button>
      )}
    </div>
  );
}
