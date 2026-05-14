/**
 * EmptyState — the one true empty-state primitive for Agentic OS.
 *
 * Replaces the literal `"No entries yet."` string in `_shared/data-table.tsx`
 * and the dozens of ad-hoc empty divs scattered across the 8 OSes. Per the
 * visual-language contract: empty states are doors, not apologies — every
 * one offers a primary CTA and 1-2 lines of why-this-matters copy.
 *
 * Wave B.1 primitive. Standalone — wired into OS pages in Wave C.
 *
 * Spec sources:
 *  - PANTHEON_UI_DEPTH_WAVE_PLAN.md §2.4
 *  - _design/visual-language.md "Loading / empty / error states"
 *  - _design/tokens.md §10 (voice: friendly + plainspoken)
 */

import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Inbox } from 'lucide-react';

/** A call-to-action rendered inside the empty state. */
export interface EmptyStateAction {
  /** Button / link copy. */
  label: string;
  /** Click handler. Provide this OR `href`, not both. */
  onClick?: () => void;
  /** Link target. Provide this OR `onClick`, not both. */
  href?: string;
  /** Optional leading icon (Lucide element). */
  icon?: ReactNode;
}

export interface EmptyStateProps {
  /**
   * Lucide icon element (or any node). Rendered at 24-32px in
   * `text-text-tertiary`. Defaults to an Inbox glyph.
   */
  icon?: ReactNode;
  /** 1-line headline in `text-text-primary`. */
  title: string;
  /** 1-2 line description in `text-text-secondary` — explain + invite. */
  description?: ReactNode;
  /** Primary CTA — the "door". Rendered as a filled accent button. */
  primaryCta?: EmptyStateAction;
  /**
   * Secondary affordance — typically "import / seed sample data".
   * Rendered as a subdued link-style button.
   */
  secondaryCta?: EmptyStateAction;
  /** Optional custom illustration node, rendered above the title in place of the icon tile. */
  illustration?: ReactNode;
  /**
   * Visual density. `card` (default) wraps in a dashed-border panel;
   * `bare` renders with no border for embedding inside an existing card.
   */
  variant?: 'card' | 'bare';
  /** Extra classes on the root element. */
  className?: string;
}

function ActionButton({
  action,
  kind,
}: {
  action: EmptyStateAction;
  kind: 'primary' | 'secondary';
}) {
  const base =
    'inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition';
  const styles =
    kind === 'primary'
      ? 'bg-accent px-3.5 py-2 text-white hover:bg-accent/90'
      : 'px-2.5 py-2 text-text-secondary hover:text-text-primary';
  const content = (
    <>
      {action.icon ? <span className="shrink-0">{action.icon}</span> : null}
      {action.label}
    </>
  );

  if (action.href) {
    return (
      <a
        href={action.href}
        className={clsx(base, styles)}
        data-testid={`empty-state-cta-${kind}`}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      className={clsx(base, styles)}
      data-testid={`empty-state-cta-${kind}`}
    >
      {content}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  primaryCta,
  secondaryCta,
  illustration,
  variant = 'card',
  className,
}: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={clsx(
        'flex flex-col items-center text-center',
        variant === 'card'
          ? 'rounded-xl border border-dashed border-border-subtle bg-surface-2/50 px-6 py-10'
          : 'px-4 py-8',
        className,
      )}
    >
      {illustration ? (
        <div className="mb-4">{illustration}</div>
      ) : (
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-3 text-text-tertiary"
          data-testid="empty-state-icon"
          aria-hidden="true"
        >
          {icon ?? <Inbox className="h-6 w-6" />}
        </div>
      )}

      <p className="text-base font-semibold text-text-primary">{title}</p>

      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-text-secondary">
          {description}
        </p>
      ) : null}

      {primaryCta || secondaryCta ? (
        <div className="mt-5 flex items-center gap-1">
          {primaryCta ? (
            <ActionButton action={primaryCta} kind="primary" />
          ) : null}
          {secondaryCta ? (
            <ActionButton action={secondaryCta} kind="secondary" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
