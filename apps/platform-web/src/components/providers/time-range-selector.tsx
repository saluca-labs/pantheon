'use client';

const TIME_RANGES = ['1h', '24h', '7d', '30d'] as const;

interface TimeRangeSelectorProps {
  value: string;
  onChange: (range: string) => void;
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-2 border border-border-subtle p-1">
      {TIME_RANGES.map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            value === range
              ? 'bg-accent/10 text-accent font-medium'
              : 'text-text-secondary hover:text-white hover:bg-border-subtle'
          }`}
          aria-pressed={value === range}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
