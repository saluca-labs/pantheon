/**
 * Autobiographer OS — ConsentBadge.
 *
 * Small chip that renders the consent state with a colour code matched to
 * the Phase 6 publication gate. `granted`/`deceased`/`public_figure`/
 * `not_applicable` pass the gate (greens + neutrals); `pending` is amber
 * (default, action expected); `withheld` is rose (hard block).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { ShieldCheck, ShieldAlert, ShieldX, Shield } from 'lucide-react';
import {
  CONSENT_LABELS,
  type ConsentState,
} from '@/lib/agentic-os/autobiographer/people';

export const CONSENT_STATE_COLOR: Record<ConsentState, string> = {
  granted: 'text-positive bg-positive/10 border-positive/30',
  pending: 'text-warning bg-warning/10 border-warning/30',
  withheld: 'text-danger bg-danger/10 border-danger/30',
  deceased: 'text-os-secure-dev bg-os-secure-dev/10 border-os-secure-dev/30',
  public_figure: 'text-os-research bg-os-research/10 border-os-research/30',
  not_applicable: 'text-text-secondary bg-surface-2 border-border-subtle',
};

const CONSENT_ICON: Record<ConsentState, typeof ShieldCheck> = {
  granted: ShieldCheck,
  pending: Shield,
  withheld: ShieldX,
  deceased: Shield,
  public_figure: Shield,
  not_applicable: Shield,
};

export interface ConsentBadgeProps {
  state: ConsentState;
  /** Render larger (detail page) vs default (row card). */
  size?: 'sm' | 'md';
  /** Hide the icon (used when stacked with other chips). */
  noIcon?: boolean;
}

export function ConsentBadge({ state, size = 'sm', noIcon }: ConsentBadgeProps) {
  const Icon = CONSENT_ICON[state];
  const sizeClass =
    size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5';
  return (
    <span
      className={`font-medium uppercase tracking-wide rounded-full border inline-flex items-center gap-1 ${sizeClass} ${CONSENT_STATE_COLOR[state]}`}
      title={`Consent: ${CONSENT_LABELS[state]}`}
    >
      {!noIcon && <Icon className="w-3 h-3" />}
      {CONSENT_LABELS[state]}
    </span>
  );
}
