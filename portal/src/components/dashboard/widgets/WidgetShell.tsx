"use client";

import { type ReactNode, useMemo } from "react";

interface WidgetShellProps {
  title: string;
  titleColor?: string;
  glowClass?: string;
  boxShadow?: string;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  children: ReactNode;
}

const SKELETON_WIDTHS = [78, 65, 85, 72, 90, 68, 82, 74];

export function LoadingSkeleton({ lines = 4 }: { lines?: number }) {
  const widths = useMemo(() => SKELETON_WIDTHS.slice(0, lines), [lines]);
  return (
    <div className="flex-1 space-y-3 animate-pulse">
      {widths.map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-3 rounded bg-of-surface-container/50" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

export function ErrorDisplay({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
      <svg className="w-8 h-8 text-red-400/50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
      <p className="text-xs text-red-400/70 mb-2 max-w-[200px]">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-[10px] px-3 py-1 rounded border border-of-outline-variant/15 text-of-outline hover:text-foreground hover:border-of-outline-variant/30 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default function WidgetShell({
  title,
  titleColor = "text-of-primary",
  glowClass = "glow-gold",
  boxShadow,
  loading,
  error,
  onRetry,
  children,
}: WidgetShellProps) {
  return (
    <div
      className={`bg-of-surface-container border border-of-outline-variant/15 rounded-xl ${glowClass} rounded-xl p-4 h-full flex flex-col`}
      style={boxShadow ? { boxShadow } : undefined}
    >
      <h3 className={`text-sm font-semibold ${titleColor} uppercase tracking-wider mb-3`}>
        {title}
      </h3>
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorDisplay message={error} onRetry={onRetry} />
      ) : (
        children
      )}
    </div>
  );
}
