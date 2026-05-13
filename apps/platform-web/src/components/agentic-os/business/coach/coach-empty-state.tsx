/**
 * Business coach — empty-state / not-configured banner.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

'use client';

import { AlertTriangle } from 'lucide-react';

export function CoachEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 max-w-md">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />
          <h2 className="text-base font-semibold text-amber-100">
            AI Coach not configured
          </h2>
        </div>
        <p className="text-sm text-amber-200/80 leading-relaxed">
          The Business AI Coach requires an{' '}
          <code className="bg-amber-500/20 px-1 rounded text-amber-100">
            ANTHROPIC_API_KEY
          </code>{' '}
          environment variable to be set. Add it to your{' '}
          <code className="bg-amber-500/20 px-1 rounded text-amber-100">
            .env.local
          </code>{' '}
          file and restart the dev server.
        </p>
        <p className="text-xs text-amber-300/60 mt-3">
          Once configured, you will have access to five coaching modes:
          pricing advisor, sales coach, marketing advisor, business strategist,
          and general coach.
        </p>
      </div>
    </div>
  );
}
