'use client';

/**
 * Food picker combobox — local catalog + on-demand USDA search.
 *
 * Wraps the generic ``Combobox`` with the food-specific search loop. The
 * parent owns ``query`` + ``foodId`` state and gets ``onSelect`` / ``onClear``
 * events. Local catalog hits are fetched on every keystroke (debounced);
 * the user can opt in to a USDA pass with a "Search USDA Foods" link.
 *
 * USDA-not-configured: if the server returns 503, we show an inline notice
 * and continue to function with local-only results.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Combobox,
  type ComboboxOption,
} from '@/components/agentic-os/_shared/combobox';

export interface FoodPickerItem {
  id: string;
  name: string;
  brand: string | null;
  source?: string;
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

export interface FoodComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: FoodPickerItem | null) => void;
  selectedId: string | null;
  placeholder?: string;
}

interface FoodOption {
  item: FoodPickerItem;
}

export function FoodCombobox({
  value,
  onChange,
  onSelect,
  selectedId,
  placeholder,
}: FoodComboboxProps) {
  const [localItems, setLocalItems] = useState<FoodPickerItem[]>([]);
  const [usdaItems, setUsdaItems] = useState<FoodPickerItem[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [usdaLoading, setUsdaLoading] = useState(false);
  const [usdaError, setUsdaError] = useState<string | null>(null);
  const [usdaTried, setUsdaTried] = useState(false);

  useEffect(() => {
    let active = true;
    setUsdaItems([]);
    setUsdaTried(false);
    setUsdaError(null);
    const handle = window.setTimeout(async () => {
      if (value.trim().length < 2) {
        setLocalItems([]);
        return;
      }
      setLocalLoading(true);
      try {
        const r = await fetch(
          `/api/tiresias/agentic-os/health/food?q=${encodeURIComponent(value)}&limit=15`,
          { cache: 'no-store' },
        );
        const j = await r.json();
        if (!active) return;
        setLocalItems(j.items ?? []);
      } finally {
        if (active) setLocalLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [value]);

  const onUsdaSearch = useCallback(async () => {
    if (value.trim().length < 2) return;
    setUsdaLoading(true);
    setUsdaError(null);
    setUsdaTried(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/health/food/usda/search?q=${encodeURIComponent(value)}&limit=15`,
        { cache: 'no-store' },
      );
      if (r.status === 503) {
        setUsdaError(
          'USDA integration not configured — admin can add API key.',
        );
        setUsdaItems([]);
        return;
      }
      const j = await r.json();
      setUsdaItems(j.items ?? []);
    } catch (e) {
      setUsdaError(e instanceof Error ? e.message : 'USDA search failed');
    } finally {
      setUsdaLoading(false);
    }
  }, [value]);

  const options: ComboboxOption<FoodOption>[] = useMemo(() => {
    const merged: FoodPickerItem[] = [];
    const seen = new Set<string>();
    for (const it of [...localItems, ...usdaItems]) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      merged.push(it);
    }
    return merged.map((it) => ({
      id: it.id,
      label: it.name,
      sublabel: it.brand ?? (it.source === 'usda' ? 'USDA' : undefined),
      data: { item: it },
    }));
  }, [localItems, usdaItems]);

  return (
    <div className="space-y-1.5">
      <Combobox<FoodOption>
        value={value}
        onChange={(v) => {
          onChange(v);
          if (selectedId) onSelect(null);
        }}
        onSelect={(opt) => onSelect(opt.data.item)}
        options={options}
        loading={localLoading || usdaLoading}
        placeholder={placeholder ?? 'e.g. oatmeal, chicken breast, …'}
        emptyLabel="No matches — type freeform or search USDA"
      />
      <div className="flex items-center justify-between gap-2 text-[11px]">
        {!usdaTried ? (
          <button
            type="button"
            onClick={onUsdaSearch}
            disabled={value.trim().length < 2 || usdaLoading}
            className="text-accent hover:text-accent/80 disabled:opacity-40 disabled:hover:text-accent"
          >
            {usdaLoading ? 'Searching USDA…' : 'Search USDA Foods →'}
          </button>
        ) : (
          <span className="text-text-secondary">
            {usdaError
              ? usdaError
              : `${usdaItems.length} USDA result${usdaItems.length === 1 ? '' : 's'} merged.`}
          </span>
        )}
        {selectedId && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-text-secondary hover:text-white"
          >
            Clear selection
          </button>
        )}
      </div>
    </div>
  );
}
