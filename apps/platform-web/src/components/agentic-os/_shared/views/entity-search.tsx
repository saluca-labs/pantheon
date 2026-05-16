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
import { EmptyState } from './empty-state';

export interface EntitySearchResult {
  /** Stable identifier — used as React key and for highlight tracking. */
  id: string;
}

/** A single selectable option within a declarative filter. */
export interface FilterOption {
  /** Stable value emitted on `onFilterChange`. */
  value: string;
  /** Human-readable option label. */
  label: string;
}

/**
 * Declarative filter definition (plan §2.2 `filterDefs`). Each filter is a
 * labelled select over a fixed option set; EntitySearch renders the chips and
 * emits the active value map upstream. Parent owns applying the filter.
 */
export interface FilterDef {
  /** Stable key — identifies this filter in the emitted value map. */
  key: string;
  /** Human-readable filter label (shown before the options). */
  label: string;
  /** The selectable options. */
  options: FilterOption[];
}

/** A single declarative sort option (plan §2.2 `sortOptions`). */
export interface SortOption {
  /** Stable value emitted on `onSortChange`. */
  value: string;
  /** Human-readable sort label. */
  label: string;
}

/** A view-toggle mode (plan §2.2 `viewToggle`) — e.g. list / grid / kanban. */
export interface ViewModeOption {
  /** Stable value emitted on `onViewModeChange`. */
  value: string;
  /** Human-readable mode label. */
  label: string;
  /** Optional leading icon for the toggle button. */
  icon?: React.ReactNode;
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
  /**
   * Declarative filter definitions (plan §2.2). When provided, EntitySearch
   * renders a labelled select per definition above/beside the input. Omit to
   * render no filter surface — existing call sites are untouched.
   */
  filterDefs?: FilterDef[];
  /** Initial active filter values, keyed by `FilterDef.key`. */
  defaultFilterValues?: Record<string, string>;
  /**
   * Fires with the full active filter-value map whenever any filter changes.
   * Parent owns applying the filters to its query.
   */
  onFilterChange?: (values: Record<string, string>) => void;
  /**
   * Declarative sort options (plan §2.2). When provided, EntitySearch renders
   * a sort select. Omit to render no sort surface.
   */
  sortOptions?: SortOption[];
  /** Initial active sort value. Defaults to the first `sortOptions` entry. */
  defaultSortValue?: string;
  /** Fires with the chosen sort value whenever the sort selection changes. */
  onSortChange?: (value: string) => void;
  /**
   * Declarative view-toggle modes (plan §2.2) — e.g. list / grid / kanban /
   * calendar. When provided (2+ modes), EntitySearch renders a segmented
   * toggle. Omit to render no view toggle.
   */
  viewToggle?: ViewModeOption[];
  /** Initial active view mode. Defaults to the first `viewToggle` entry. */
  defaultViewMode?: string;
  /** Fires with the chosen view-mode value whenever the toggle changes. */
  onViewModeChange?: (value: string) => void;
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
  filterDefs,
  defaultFilterValues,
  onFilterChange,
  sortOptions,
  defaultSortValue,
  onSortChange,
  viewToggle,
  defaultViewMode,
  onViewModeChange,
  className,
}: EntitySearchProps<TResult>) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  const hasResultsSurface = results !== undefined && renderResult !== undefined;
  const hasFilters = filterDefs !== undefined && filterDefs.length > 0;
  const hasSort = sortOptions !== undefined && sortOptions.length > 0;
  const hasViewToggle = viewToggle !== undefined && viewToggle.length > 1;
  const hasControls = hasFilters || hasSort || hasViewToggle;

  // Declarative-filter state: a value map keyed by FilterDef.key.
  const [filterValues, setFilterValues] = useState<Record<string, string>>(
    () => defaultFilterValues ?? {},
  );
  const [sortValue, setSortValue] = useState<string>(
    () => defaultSortValue ?? sortOptions?.[0]?.value ?? '',
  );
  const [viewMode, setViewMode] = useState<string>(
    () => defaultViewMode ?? viewToggle?.[0]?.value ?? '',
  );

  const handleFilterChange = useCallback(
    (key: string, next: string) => {
      setFilterValues((prev) => {
        const merged = { ...prev, [key]: next };
        onFilterChange?.(merged);
        return merged;
      });
    },
    [onFilterChange],
  );

  const handleSortChange = useCallback(
    (next: string) => {
      setSortValue(next);
      onSortChange?.(next);
    },
    [onSortChange],
  );

  const handleViewModeChange = useCallback(
    (next: string) => {
      setViewMode(next);
      onViewModeChange?.(next);
    },
    [onViewModeChange],
  );

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

  // Stable per-option DOM id so the input can drive selection via
  // aria-activedescendant (WAI APG combobox-on-wrapper pattern). The listbox
  // id is the prefix so collisions across multiple EntitySearch instances are
  // impossible.
  const optionDomId = (id: string) => `${listboxId}-option-${id}`;
  const activeDescendantId =
    showDropdown && list[highlight] ? optionDomId(list[highlight].id) : undefined;

  // WAI APG combobox-on-wrapper pattern: the wrapping <div> carries the
  // combobox role + aria-expanded/-controls/-haspopup; the input itself only
  // signals the autocomplete style and the active option. This keeps
  // role-supports-aria-props happy and gives AT users the standard listbox
  // semantics on the popup target. The wrapper variant is the documented
  // ARIA 1.2 pattern; see _design/a11y.md §2.
  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        className="relative"
        role={hasResultsSurface ? 'combobox' : undefined}
        aria-haspopup={hasResultsSurface ? 'listbox' : undefined}
        aria-expanded={hasResultsSurface ? showDropdown : undefined}
        aria-controls={hasResultsSurface ? listboxId : undefined}
      >
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
          aria-hidden="true"
        />
        <input
          // type="search" gives the input its implicit role="searchbox" (no
          // explicit role attribute needed; that previously violated
          // role-supports-aria-props once aria-expanded was on the input).
          type="search"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => hasResultsSurface && setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-label={placeholder}
          aria-autocomplete={hasResultsSurface ? 'list' : undefined}
          aria-activedescendant={activeDescendantId}
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

      {hasControls && (
        <div
          data-testid="entity-search-controls"
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          {hasFilters &&
            filterDefs!.map((def) => (
              <label
                key={def.key}
                data-testid={`entity-search-filter-${def.key}`}
                className="flex items-center gap-1.5 text-xs text-text-tertiary"
              >
                <span>{def.label}</span>
                <select
                  value={filterValues[def.key] ?? ''}
                  disabled={disabled}
                  onChange={(e) => handleFilterChange(def.key, e.target.value)}
                  aria-label={def.label}
                  className={cn(
                    'rounded-md border border-border-subtle bg-surface-1 px-2 py-1 text-xs text-text-primary',
                    'focus:border-accent focus:outline-none',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  <option value="">All</option>
                  {def.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}

          {hasSort && (
            <label
              data-testid="entity-search-sort"
              className="flex items-center gap-1.5 text-xs text-text-tertiary"
            >
              <span>Sort</span>
              <select
                value={sortValue}
                disabled={disabled}
                onChange={(e) => handleSortChange(e.target.value)}
                aria-label="Sort"
                className={cn(
                  'rounded-md border border-border-subtle bg-surface-1 px-2 py-1 text-xs text-text-primary',
                  'focus:border-accent focus:outline-none',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {sortOptions!.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {hasViewToggle && (
            <div
              role="group"
              aria-label="View mode"
              data-testid="entity-search-view-toggle"
              className="ml-auto flex items-center gap-0.5 rounded-md border border-border-subtle bg-surface-1 p-0.5"
            >
              {viewToggle!.map((mode) => {
                const isActive = mode.value === viewMode;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={isActive}
                    aria-label={mode.label}
                    data-testid={`entity-search-view-${mode.value}`}
                    onClick={() => handleViewModeChange(mode.value)}
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-1 text-xs transition',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      isActive
                        ? 'bg-surface-3 text-text-primary'
                        : 'text-text-tertiary hover:text-text-secondary',
                    )}
                  >
                    {mode.icon}
                    {mode.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border-subtle bg-surface-2 shadow-lg"
        >
          {list.length === 0 ? (
            <div data-testid="entity-search-no-results">
              <EmptyState
                variant="bare"
                icon={<Search className="h-5 w-5" aria-hidden="true" />}
                title={noResultsLabel}
                className="py-6"
              />
            </div>
          ) : (
            list.map((result, i) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- WAI APG combobox-on-wrapper pattern: focus remains on the combobox input; selection is driven via aria-activedescendant pointing at this option's id. The role="option" element therefore intentionally is not focusable and does not need its own key handler — the input owns the keyboard contract.
              <div
                key={result.id}
                id={optionDomId(result.id)}
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
