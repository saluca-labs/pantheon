/**
 * Research coach — 503-aware "not configured" empty state.
 *
 * Renders when `ANTHROPIC_API_KEY` is missing. Distinct copy from the
 * other OSes so the messaging stays vertical-specific.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { Sparkles } from 'lucide-react';

export function CoachNotConfiguredBanner() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-100/90">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold text-amber-50 mb-1">
            Research Coach not yet configured
          </h2>
          <p className="leading-relaxed">
            The AI coach is not yet configured for this environment. Once an
            admin sets the{' '}
            <code className="rounded bg-amber-900/40 px-1.5 py-0.5 font-mono text-xs">
              ANTHROPIC_API_KEY
            </code>{' '}
            secret in the deployment, this surface will light up without a
            redeploy. The coach covers literature synthesis, hypothesis
            critique, and methods design — with regulated-advice referral
            for clinical / IRB / IACUC / EHS topics.
          </p>
        </div>
      </div>
    </div>
  );
}
