'use client';

/**
 * Autobiographer OS — VoiceProfileJsonView.
 *
 * Collapsible "View JSON" expander on each profile card. Renders
 * `style_summary`, `style_rules` (as a numbered list), `style_adjectives`
 * (as inline chips), and `example_openings` (each as a verbatim quote
 * block). Used as the source-of-truth display when the author wants to
 * inspect the underlying profile shape.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface VoiceProfileJsonViewProps {
  styleSummary: string;
  styleAdjectives: string[];
  styleRules: string[];
  exampleOpenings: string[];
}

export function VoiceProfileJsonView({
  styleSummary,
  styleAdjectives,
  styleRules,
  exampleOpenings,
}: VoiceProfileJsonViewProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-[#2a2d3e] bg-[#0f1117]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-1.5 text-xs uppercase tracking-wide text-[#94a3b8] hover:text-white inline-flex items-center gap-1.5"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        View JSON
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-[#2a2d3e] pt-3">
          <div>
            <h4 className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1">
              style_summary
            </h4>
            <p className="text-sm text-[#cbd5e1] leading-relaxed whitespace-pre-wrap">
              {styleSummary}
            </p>
          </div>

          {styleAdjectives.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1">
                style_adjectives
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {styleAdjectives.map((a) => (
                  <span
                    key={a}
                    className="text-xs px-2 py-0.5 rounded bg-[#1a1d27] border border-[#2a2d3e] text-[#cbd5e1]"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {styleRules.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1">
                style_rules
              </h4>
              <ol className="list-decimal list-inside space-y-0.5 text-sm text-[#cbd5e1]">
                {styleRules.map((r, i) => (
                  <li key={`${i}-${r.slice(0, 16)}`}>{r}</li>
                ))}
              </ol>
            </div>
          )}

          {exampleOpenings.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1">
                example_openings
              </h4>
              <div className="space-y-2">
                {exampleOpenings.map((o, i) => (
                  <blockquote
                    key={`${i}-${o.slice(0, 16)}`}
                    className="text-xs italic text-[#cbd5e1]/90 border-l-2 border-[#4361EE]/40 pl-3 whitespace-pre-wrap"
                  >
                    {o}
                  </blockquote>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
