/**
 * Research coach — side panel summarizing the in-scope context.
 *
 * Mode-discriminated body:
 *   - lit_reviewer: cited paper IDs (parsed from assistant turns).
 *   - hypothesis_critic: cited hypothesis IDs (parsed from assistant turns).
 *   - methods_advisor: experiment scope info.
 *   - general: hidden (no panel).
 *
 * Lightweight — parses `[paper:id]` / `[hypothesis:id]` / `[experiment:id]`
 * marker syntax out of assistant text without a separate parser pass.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

'use client';

import { useMemo } from 'react';
import { BookOpenText, Lightbulb, ShieldCheck } from 'lucide-react';
import type { CoachMode } from '@/lib/agentic-os/research/coach/modes';
import type { CoachUiMessage } from './coach-message';

interface Props {
  mode: CoachMode;
  experimentId: string | null;
  messages: CoachUiMessage[];
}

function extractIds(text: string, prefix: string): string[] {
  if (typeof text !== 'string' || !text) return [];
  // Match [<prefix>:<uuid>] — case-insensitive prefix, UUID-ish loose pattern
  const re = new RegExp(
    `\\[${prefix}:([0-9a-fA-F-]{8,})\\]`,
    'gi',
  );
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ids.add(m[1]!);
  }
  return Array.from(ids);
}

function ListPanel({
  title,
  icon: Icon,
  ids,
}: {
  title: string;
  icon: typeof BookOpenText;
  ids: string[];
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <Icon className="w-3.5 h-3.5 text-accent" />
        <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
          {title}
        </h3>
      </div>
      {ids.length === 0 ? (
        <p className="text-xs text-text-tertiary italic">No citations yet.</p>
      ) : (
        <ul className="space-y-1">
          {ids.map((id) => (
            <li
              key={id}
              className="text-[10px] font-mono text-text-primary truncate bg-surface-0 border border-border-subtle rounded px-2 py-1"
              title={id}
            >
              {id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CoachContextPanel({ mode, experimentId, messages }: Props) {
  const assistantText = useMemo(
    () =>
      messages
        .filter((m) => m.role === 'assistant')
        .map((m) => m.content)
        .join('\n'),
    [messages],
  );

  if (mode === 'general') return null;

  if (mode === 'lit_reviewer') {
    const ids = extractIds(assistantText, 'paper');
    return (
      <aside className="rounded-xl border border-border-subtle bg-surface-2 p-4 self-start max-h-[calc(100vh-200px)] overflow-y-auto">
        <ListPanel title="Cited papers" icon={BookOpenText} ids={ids} />
      </aside>
    );
  }
  if (mode === 'hypothesis_critic') {
    const ids = extractIds(assistantText, 'hypothesis');
    return (
      <aside className="rounded-xl border border-border-subtle bg-surface-2 p-4 self-start max-h-[calc(100vh-200px)] overflow-y-auto">
        <ListPanel title="Cited hypotheses" icon={Lightbulb} ids={ids} />
      </aside>
    );
  }
  // methods_advisor
  return (
    <aside className="rounded-xl border border-border-subtle bg-surface-2 p-4 self-start max-h-[calc(100vh-200px)] overflow-y-auto space-y-3">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-accent" />
        <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
          Experiment scope
        </h3>
      </div>
      <p className="text-[10px] font-mono text-text-primary truncate bg-surface-0 border border-border-subtle rounded px-2 py-1">
        {experimentId ?? '(none)'}
      </p>
      <p className="text-xs text-text-secondary leading-relaxed">
        Methods advisor reads this experiment&apos;s protocols, datasets, and
        reproducibility checklist. Regulated topics (IRB / IACUC / EHS /
        clinical) trigger institutional referral.
      </p>
    </aside>
  );
}
