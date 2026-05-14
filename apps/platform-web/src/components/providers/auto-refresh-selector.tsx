'use client';

const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '5m', value: 300 },
] as const;

interface AutoRefreshSelectorProps {
  value: number;
  onChange: (seconds: number) => void;
}

export function AutoRefreshSelector({
  value,
  onChange,
}: AutoRefreshSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="auto-refresh"
        className="text-sm text-text-secondary whitespace-nowrap"
      >
        Auto-refresh:
      </label>
      <select
        id="auto-refresh"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-surface-2 border border-border-subtle text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {REFRESH_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
