'use client';

/**
 * KindFilterChips — shared closed-set chip-filter primitive (Wave E.2b).
 *
 * Renders a horizontal pill / chip row for a fixed enum-style filter: one
 * leading "All" chip plus N option chips, with the active chip styled
 * distinctly. Used wherever an OS surface filters a list by a known kind /
 * severity / category enum and the affordance should read as chips rather
 * than a select.
 *
 * Why a sibling to `EntitySearch`, not a mode on it?
 *  - `EntitySearch.filterDefs` renders selects (good for many filters / wide
 *    option sets).
 *  - The chip affordance is a different UI primitive — visible-at-a-glance,
 *    one-tap, optimized for short closed sets (2-8 options).
 *  - Bundling chips into `EntitySearch` would conflate two different
 *    affordances and force consumers to pick between them per-call. Keeping
 *    them sibling primitives is the cleaner contract (UI Depth plan §6.4).
 *
 * Tokens-only by default — the active chip uses `accent` for its tint. A
 * consumer that wants a per-OS or per-kind accent passes `activeColor` as a
 * Tailwind class string; the primitive trusts the consumer to honor the
 * tokens contract (`os-<slug>` / status tokens / accent — never raw palette).
 *
 * Composition: this primitive is intentionally standalone. Consumers that
 * pair a chip rail with a tag input, an archived toggle, or any other
 * adjacent affordance keep those siblings in their own JSX — the primitive
 * does not bundle them.
 *
 * @license MIT — Tiresias Pantheon UI Depth Wave E (internal).
 */

import { cn } from '@/lib/utils';

/** A single selectable option chip. */
export interface KindFilterChipOption<TValue extends string = string> {
  /** Stable value emitted on selection. */
  value: TValue;
  /** Human-readable label rendered inside the chip. */
  label: string;
  /**
   * Optional active-state Tailwind class string. When provided AND this chip
   * is active, this class string replaces the default `accent` active style.
   * Consumers MUST honor the tokens contract — use `os-<slug>`, status tokens
   * (`positive` / `warning` / `attention` / `danger`), or `accent` family.
   * Raw Tailwind palette (`bg-blue-500/10`, `text-amber-300`) is a bug.
   */
  activeColor?: string;
  /**
   * Optional `data-testid` override for this chip. Defaults to
   * `${testIdPrefix}-${value}` when `testIdPrefix` is set.
   */
  testId?: string;
}

export interface KindFilterChipsProps<TValue extends string = string> {
  /** The currently-active value, or `null` for the "All" chip. */
  value: TValue | null;
  /** The list of option chips, in render order. */
  options: KindFilterChipOption<TValue>[];
  /** Fired with the next value (or `null` when the user picks "All"). */
  onChange: (next: TValue | null) => void;
  /** Label for the leading "All" chip. Defaults to `'All'`. */
  allLabel?: string;
  /**
   * When set, the "All" chip is rendered with `data-testid=${testIdPrefix}-all`
   * and option chips default to `data-testid=${testIdPrefix}-${value}` unless
   * a per-option `testId` is provided.
   */
  testIdPrefix?: string;
  /** `data-testid` on the wrapper. */
  testId?: string;
  /** `aria-label` on the wrapper. Defaults to `'Filter by kind'`. */
  ariaLabel?: string;
  /** className passthrough on the wrapper. */
  className?: string;
}

/** The tokens-only default active style — used when no `activeColor` is set. */
const DEFAULT_ACTIVE = 'bg-accent/20 border-accent/60 text-text-primary';

/** The tokens-only inactive style — shared across "All" and option chips. */
const INACTIVE =
  'bg-surface-0 border-border-subtle text-text-secondary hover:border-accent/40 hover:text-text-primary';

const BASE =
  'text-xs px-2.5 py-1 rounded-full border transition uppercase tracking-wide font-medium';

export function KindFilterChips<TValue extends string = string>({
  value,
  options,
  onChange,
  allLabel = 'All',
  testIdPrefix,
  testId,
  ariaLabel = 'Filter by kind',
  className,
}: KindFilterChipsProps<TValue>) {
  const allActive = value === null;
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn('flex flex-wrap items-center gap-1', className)}
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={allActive}
        data-testid={testIdPrefix ? `${testIdPrefix}-all` : undefined}
        className={cn(BASE, allActive ? DEFAULT_ACTIVE : INACTIVE)}
      >
        {allLabel}
      </button>
      {options.map((opt) => {
        const active = value === opt.value;
        const optTestId =
          opt.testId ?? (testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            data-testid={optTestId}
            className={cn(
              BASE,
              active ? (opt.activeColor ?? DEFAULT_ACTIVE) : INACTIVE,
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
