'use client';

/**
 * Reusable typeahead / autocomplete combobox.
 *
 * Cross-OS primitive: any feature that needs to search a catalog and pick
 * an entry (food, exercise, project, contact) can use this. Owns its own
 * input + dropdown state; emits selection events upstream.
 *
 * Behaviour:
 *  - Free-text input is the source of truth (`value`).
 *  - On input change, `onQueryChange` fires so the parent can refetch
 *    options. Parent owns the fetch loop and passes `options` back in.
 *  - Selecting an option fires `onSelect(option)`. The input is replaced
 *    by the option's display label.
 *  - `allowFreeText` (default true) keeps the typed string as-is when
 *    the user blurs without picking — useful for "type a new item" flows.
 *  - Keyboard: ArrowDown / ArrowUp / Enter / Escape.
 *
 * Accessibility (W-E.4): implements the WAI-ARIA APG combobox-pattern.
 *  - Wrapping `<div>` carries `role="combobox" aria-expanded aria-controls
 *    aria-haspopup="listbox" aria-autocomplete="list"`.
 *  - The text input drives `aria-activedescendant` over the rendered
 *    `role="option"` rows in the listbox.
 *  - Options render as `<div role="option" id="..." aria-selected="...">`
 *    inside a `<div role="listbox" id="...">`. We keep `<div>` rather than
 *    `<li>` so the surrounding listbox container can stay a `<div>` — the
 *    existing dropdown surface has bg/border/shadow styling that would need
 *    redesigning if it became a `<ul>`.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';

export interface ComboboxOption<T> {
  /** Unique id used as React key. */
  id: string;
  /** Display label rendered in the dropdown row + the input on select. */
  label: string;
  /** Optional dim sublabel shown to the right (e.g. brand / source). */
  sublabel?: string;
  /** Caller-defined payload — handed back via `onSelect`. */
  data: T;
  /** Optional disabled flag — option still renders but cannot be selected. */
  disabled?: boolean;
}

export interface ComboboxProps<T> {
  value: string;
  onChange: (value: string) => void;
  onQueryChange?: (query: string) => void;
  onSelect: (option: ComboboxOption<T>) => void;
  options: ComboboxOption<T>[];
  placeholder?: string;
  /** Show a small loading indicator on the right of the input. */
  loading?: boolean;
  /** Disable the input. */
  disabled?: boolean;
  /** Empty-state copy when there are no matches. */
  emptyLabel?: string;
  /**
   * Accessible label for the input — required when no surrounding `<label>`
   * names the field. Falls back to the placeholder for backward compat.
   */
  ariaLabel?: string;
  /** className passthrough on the wrapper. */
  className?: string;
}

export function Combobox<T>({
  value,
  onChange,
  onQueryChange,
  onSelect,
  options,
  placeholder,
  loading,
  disabled,
  emptyLabel = 'No matches',
  ariaLabel,
  className,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  // Per-instance prefix so option ids are stable but unique across multiple
  // combobox instances on the same page.
  const optionIdPrefix = useId();

  useEffect(() => {
    setHighlight(0);
  }, [options.length]);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback(
    (opt: ComboboxOption<T>) => {
      if (opt.disabled) return;
      onChange(opt.label);
      onSelect(opt);
      setOpen(false);
    },
    [onChange, onSelect],
  );

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && options[highlight]) {
        e.preventDefault();
        handleSelect(options[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showListbox = open && (value.length > 0 || options.length > 0);
  const activeOption = open && options[highlight] ? options[highlight] : null;
  const activeDescendantId = activeOption
    ? `${optionIdPrefix}-${activeOption.id}`
    : undefined;

  // WAI APG combobox pattern: the wrapping element carries the combobox role
  // and surfaces the expanded/controls/haspopup/autocomplete attributes.
  return (
    <div
      ref={rootRef}
      role="combobox"
      aria-expanded={showListbox}
      aria-controls={showListbox ? listboxId : undefined}
      aria-haspopup="listbox"
      aria-owns={showListbox ? listboxId : undefined}
      className={`relative ${className ?? ''}`}
    >
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onQueryChange?.(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={showListbox ? listboxId : undefined}
          aria-activedescendant={activeDescendantId}
          aria-label={ariaLabel ?? placeholder}
          className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-[#64748b] focus:border-accent focus:outline-none disabled:opacity-50"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-secondary">
            …
          </span>
        )}
      </div>

      {showListbox && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border-subtle bg-surface-0 shadow-lg"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-secondary">
              {emptyLabel}
            </div>
          ) : (
            options.map((opt, i) => {
              const optionId = `${optionIdPrefix}-${opt.id}`;
              const isHighlighted = i === highlight;
              return (
                // WAI APG combobox pattern: options are NOT individually
                // focusable. Focus stays on the input and the active option
                // is announced via `aria-activedescendant` on the input.
                // Keyboard handling (ArrowUp / Down / Enter / Esc) lives on
                // the input's `onKeyDown` (see `onKey` above), so the option
                // row deliberately has no `onKeyDown` of its own — the lint
                // rules below assume each interactive element owns its
                // keyboard handling, which is incorrect for APG combobox.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- APG combobox: options are not focusable; the input owns keyboard via aria-activedescendant.
                <div
                  key={opt.id}
                  id={optionId}
                  role="option"
                  aria-selected={isHighlighted}
                  aria-disabled={opt.disabled || undefined}
                  data-testid={`combobox-option-${opt.id}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                    isHighlighted
                      ? 'bg-accent/15 text-white'
                      : 'text-text-primary hover:bg-surface-2'
                  } ${opt.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="truncate text-xs text-text-secondary">
                      {opt.sublabel}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
