'use client';

/**
 * EntitySearch — in-hub search / filter input (Wave B.2 data-view primitive).
 *
 * OSes have no search-inside-hub today (UI Depth Wave plan §9 universal gap).
 * This is the standalone, isolation-testable building block: a debounced text
 * input that emits the query upstream, plus an optional inline result dropdown
 * driven by a render-prop. It is generic over the result shape so a single
 * primitive serves people, deals, experiments, alerts, etc.
 *
 * Contract / responsibilities:
 *  - Owns its own input value + debounce timer + keyboard-highlight state.
 *  - Debounces `onQueryChange` by `debounceMs` (default 200ms). The leading
 *    keystroke is NOT fired immediately — callers get one settled query.
 *  - When `results` is provided, renders a dropdown of result rows via the
 *    `renderResult` render-prop. Empty input shows nothing; non-empty input
 *    with zero results shows the no-results state.
 *  - Keyboard: ArrowDown / ArrowUp move the highlight, Enter selects the
 *    highlighted result, Escape closes the dropdown.
 *  - Parent owns the fetch loop — props in, callbacks out. No backend here.
 *
 * Wave C wires this into ~40 list pages; this wave only ships + tests it.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EntitySearchResult {
  /** Stable identifier — used as React key and for highlight tracking. */
  id: string;
}

export interface EntitySearchProps<TResult extends EntitySearchResult> {
  /** Placeholder copy for the input. Friendly + plainspoken (tokens.md §10). */
  placeholder?: string;
  /** Controlled initial value. The component owns the live value after mount. */
  defaultValue?: string;
  /** Debounce window in ms before `onQueryChange` fires. Default 200. */
  debounceMs?: number;
  /**
   * Fires with the settled (debounced) query string. Parent runs the fetch
   * and feeds results back via `results`.
   */
  onQueryChange: (query: string) => void;
  /**
   * Result rows to render in the dropdown. Omit (or leave undefined) to use
   * EntitySearch as a pure search input with no inline results surface.
   */
  results?: TResult[];
  /** Render-prop for a single result row. Receives the row + highlight flag. */
  renderResult?: (result: TResult, isHighlighted: boolean) => React.ReactNode;
  /** Fires when a result is chosen (click or Enter on the highlight). */
  onSelectResult?: (result: TResult) => void;
  /** Show a loading affordance on the right of the input. */
  loading?: boolean;
  /** Disable the input. */
  disabled?: boolean;
  /** Copy shown when the input is non-empty but `results` is empty. */
  noResultsLabel?: string;
  /** className passthrough on the wrapper. */
  className?: string;
}

export function EntitySearch<TResult extends EntitySearchResult>({
  placeholder = 'Search…',
  defaultValue = '',
  debounceMs = 200,
  onQueryChange,
  results,
  renderResult,
  onSelectResult,
  loading = false,
  disabled = false,
  noResultsLabel = 'No matches — try a different search.',
  className,
}: EntitySearchProps<TResult>) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  const hasResultsSurface = results !== undefined && renderResult !== undefined;

  // Debounced query emit. The timer is reset on every keystroke; the parent
  // only ever sees the settled value.
  const emitDebounced = useCallback(
    (next: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onQueryChange(next);
      }, debounceMs);
    },
    [debounceMs, onQueryChange],
  );

  // Flush any pending timer on unmount so a late callback never fires into a
  // dead component.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Reset the highlight whenever the result set changes shape.
  useEffect(() => {
    setHighlight(0);
  }, [results?.length]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!hasResultsSurface) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [hasResultsSurface]);

  const handleChange = (next: string) => {
    setValue(next);
    setOpen(true);
    emitDebounced(next);
  };

  const handleClear = () => {
    setValue('');
    setOpen(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    // Clearing is an explicit intent — emit immediately, no debounce.
    onQueryChange('');
  };

  const handleSelect = useCallback(
    (result: TResult) => {
      onSelectResult?.(result);
      setOpen(false);
    },
    [onSelectResult],
  );

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!hasResultsSurface) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    const list = results ?? [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(list.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && list[highlight]) {
        e.preventDefault();
        handleSelect(list[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showDropdown = hasResultsSurface && open && value.trim().length > 0;
  const list = results ?? [];

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
          aria-hidden="true"
        />
        <input
          type="text"
          role="searchbox"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => hasResultsSurface && setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-label={placeholder}
          aria-expanded={hasResultsSurface ? showDropdown : undefined}
          aria-controls={hasResultsSurface ? listboxId : undefined}
          className={cn(
            'w-full rounded-md border border-border-subtle bg-surface-1 py-2 pl-9 pr-9 text-sm text-text-primary',
            'placeholder:text-text-tertiary transition',
            'focus:border-accent focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
        {loading && (
          <span
            data-testid="entity-search-loading"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-text-tertiary"
          >
            …
          </span>
        )}
        {!loading && value.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-tertiary transition hover:bg-surface-3 hover:text-text-secondary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border-subtle bg-surface-2 shadow-lg"
        >
          {list.length === 0 ? (
            <div
              data-testid="entity-search-no-results"
              className="px-3 py-4 text-center text-xs text-text-secondary"
            >
              {noResultsLabel}
            </div>
          ) : (
            list.map((result, i) => (
              <div
                key={result.id}
                role="option"
                aria-selected={i === highlight}
                data-testid={`entity-search-result-${result.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm transition',
                  i === highlight
                    ? 'bg-accent-soft/40 text-text-primary'
                    : 'text-text-secondary hover:bg-surface-3',
                )}
              >
                {renderResult!(result, i === highlight)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default EntitySearch;
