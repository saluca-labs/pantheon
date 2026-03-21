"use client";

interface SkeletonCardProps {
  lines?: number;
  showHeader?: boolean;
  className?: string;
}

export function SkeletonCard({
  lines = 3,
  showHeader = true,
  className = "",
}: SkeletonCardProps) {
  return (
    <div
      className={`bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 animate-pulse ${className}`}
    >
      {showHeader && (
        <div className="h-4 bg-of-surface-container-high rounded-md w-2/5 mb-4" />
      )}
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-of-surface-container-high rounded-md"
            style={{ width: `${100 - i * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className = "",
}: SkeletonTableProps) {
  return (
    <div
      className={`bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden animate-pulse ${className}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-of-outline-variant/20">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-of-surface-container-high rounded-md flex-1"
            style={{ maxWidth: i === 0 ? "120px" : undefined }}
          />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex items-center gap-4 px-4 py-3 border-b border-of-outline-variant/10 last:border-0"
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <div
              key={colIdx}
              className="h-3 bg-of-surface-container-high/70 rounded-md flex-1"
              style={{
                maxWidth: colIdx === 0 ? "120px" : undefined,
                opacity: 1 - rowIdx * 0.1,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
