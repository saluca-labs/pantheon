'use client';

const TIME_RANGES = ['1h', '24h', '7d', '30d'] as const;

interface TimeRangeSelectorProps {
  value: string;
  onChange: (range: string) => void;
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-[#1a1d27] border border-[#2a2d3e] p-1">
      {TIME_RANGES.map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            value === range
              ? 'bg-[#4361EE]/10 text-[#4361EE] font-medium'
              : 'text-[#94a3b8] hover:text-white hover:bg-[#2a2d3e]'
          }`}
          aria-pressed={value === range}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
