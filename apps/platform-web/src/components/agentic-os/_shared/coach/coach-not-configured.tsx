/**
 * Shared coach 503 / not-configured surface.
 *
 * Wave E-2 (UI Depth Wave coherence pass). Replaces the four ad-hoc
 * per-OS variants (autobiographer, business, maker, research) that
 * pre-dated the `EmptyState` primitive and disagreed on style + icon +
 * copy. Renders the same `EmptyState` shell across every coach surface;
 * vertical messaging is opt-in via the `extra` slot — the base copy is
 * identical so the not-configured experience is coherent.
 *
 * No primary CTA: the underlying gate is the `ANTHROPIC_API_KEY` secret
 * in the deployment, which the end-user has no control over. The
 * description explains the dependency and that the surface will light
 * up without a redeploy once the secret is set. Consumers needing a
 * custom action can pass `primaryCta` through.
 *
 * @license MIT — Tiresias Agentic OS shared (internal).
 */

import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import {
  EmptyState,
  type EmptyStateAction,
} from '@/components/agentic-os/_shared/views';

export interface CoachNotConfiguredProps {
  /**
   * Vertical label rendered in the headline, e.g. `"Autobiographer"`,
   * `"Business"`, `"Maker"`, `"Research"`. Pluralizes naturally — the
   * headline is `"<osLabel> Coach not yet configured"`.
   */
  osLabel: string;
  /**
   * Optional trailing description fragment appended after the base
   * "will light up without a redeploy" sentence. Use for
   * vertical-specific framing (e.g. research's regulated-advice
   * referral note). Plain text or inline nodes.
   */
  extra?: ReactNode;
  /**
   * Optional primary CTA. Omit unless the surface offers a real
   * fallback action; the default state is description-only because the
   * user cannot self-serve the secret.
   */
  primaryCta?: EmptyStateAction;
  /** Extra classes on the root element. */
  className?: string;
}

export function CoachNotConfigured({
  osLabel,
  extra,
  primaryCta,
  className,
}: CoachNotConfiguredProps) {
  return (
    <EmptyState
      icon={<Sparkles className="h-6 w-6 text-accent" />}
      title={`${osLabel} Coach not yet configured`}
      description={
        <>
          The AI coach is not yet configured for this environment. Once an
          admin sets the{' '}
          <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-text-primary">
            ANTHROPIC_API_KEY
          </code>{' '}
          secret in the deployment, this surface will light up without a
          redeploy.
          {extra ? <> {extra}</> : null}
        </>
      }
      primaryCta={primaryCta}
      className={className}
    />
  );
}
