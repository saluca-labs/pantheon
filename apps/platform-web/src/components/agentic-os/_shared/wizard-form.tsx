/**
 * Multi-step server-validated form pattern shared across Agentic OS
 * surfaces. Step state lives in the URL (`?step=<id>`) so back/forward
 * buttons and refreshes preserve progress without client state — and
 * each step can be a fully server-rendered form.
 *
 * Phase 2 uses this for the journal-new flow (one step today; ready
 * for the Phase 3 CBT mini-wizards which will add 3-5 steps).
 *
 * Server component. The step content itself is whatever the caller
 * passes — typically a form that POSTs to its own action endpoint.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';

export interface WizardStep {
  /** Stable identifier carried in the `?step=` query param. */
  id: string;
  /** Step heading copy. */
  label: string;
  /** Form / instructional content for this step. */
  content: ReactNode;
}

export interface WizardFormProps {
  /** Base path the wizard lives at (no query string). */
  basePath: string;
  /** Steps in order. The first step is the default when no ?step= present. */
  steps: WizardStep[];
  /** Currently-active step id (read from `searchParams.step` by the caller). */
  currentStep?: string;
  /** Optional supplementary search params to preserve on step links. */
  carryParams?: Record<string, string | undefined>;
}

export function WizardForm({
  basePath,
  steps,
  currentStep,
  carryParams = {},
}: WizardFormProps) {
  if (steps.length === 0) return null;
  const activeId = currentStep ?? steps[0]!.id;
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === activeId),
  );
  const active = steps[activeIndex] ?? steps[0]!;

  function hrefFor(stepId: string): string {
    const sp = new URLSearchParams();
    sp.set('step', stepId);
    for (const [k, v] of Object.entries(carryParams)) {
      if (typeof v === 'string' && v.length > 0) sp.set(k, v);
    }
    return `${basePath}?${sp.toString()}`;
  }

  return (
    <div>
      <nav
        aria-label="Wizard steps"
        className="mb-5 grid gap-2 text-xs"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        }}
      >
        {steps.map((step, idx) => {
          const isActive = step.id === active.id;
          const isPast = idx < activeIndex;
          const cls = isActive
            ? 'rounded-md border border-accent/60 bg-accent/15 text-white'
            : isPast
              ? 'rounded-md border border-emerald-500/40 bg-emerald-500/5 text-emerald-200'
              : 'rounded-md border border-border-subtle bg-surface-0 text-text-secondary hover:text-white hover:border-accent/40';
          return (
            <Link
              key={step.id}
              href={hrefFor(step.id)}
              className={`${cls} px-3 py-2 text-center font-medium transition`}
            >
              <span className="block opacity-60">Step {idx + 1}</span>
              <span className="block">{step.label}</span>
            </Link>
          );
        })}
      </nav>

      <div>{active.content}</div>

      <div className="mt-4 flex items-center justify-between text-sm">
        {activeIndex > 0 ? (
          <Link
            href={hrefFor(steps[activeIndex - 1]!.id)}
            className="text-text-secondary hover:text-white transition"
          >
            ← {steps[activeIndex - 1]!.label}
          </Link>
        ) : (
          <span />
        )}
        {activeIndex < steps.length - 1 ? (
          <Link
            href={hrefFor(steps[activeIndex + 1]!.id)}
            className="text-accent hover:text-[#5d7aff] transition font-medium"
          >
            {steps[activeIndex + 1]!.label} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
