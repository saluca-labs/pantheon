"use client";

interface ErrorCardProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorCard({
  message = "Something went wrong while loading data.",
  onRetry,
  className = "",
}: ErrorCardProps) {
  return (
    <div
      className={`bg-of-surface-container border border-of-error/20 rounded-xl p-8 flex flex-col items-center justify-center gap-4 text-center ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-of-error-container/20 flex items-center justify-center">
        <svg
          className="w-6 h-6 text-of-error"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-label-lg text-of-on-surface">Failed to load</p>
        <p className="text-body-sm text-of-on-surface-variant">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg border border-of-outline-variant/30 bg-of-surface-container-high text-label-md text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container-highest transition-all"
        >
          Try again
        </button>
      )}
    </div>
  );
}
