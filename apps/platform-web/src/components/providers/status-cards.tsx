'use client';

import type { ProviderHealthResponse } from '@/lib/api/schemas/provider-health';
import { Skeleton } from '@/components/agentic-os/_shared/views';

interface StatusCardsProps {
  data: ProviderHealthResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  showCascade: boolean;
}

const STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  up: { dot: 'bg-[#00B894]', text: 'text-[#00B894]' },
  degraded: { dot: 'bg-[#FDCB6E]', text: 'text-[#FDCB6E]' },
  down: { dot: 'bg-[#E17055]', text: 'text-[#E17055]' },
};

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="widget" />
      ))}
    </div>
  );
}

export function StatusCards({
  data,
  isLoading,
  isError,
  error,
  showCascade,
}: StatusCardsProps) {
  if (isLoading) {
    return <SkeletonCards />;
  }

  if (isError) {
    return (
      <div className="bg-surface-2 border border-border-subtle rounded-lg p-6 text-center">
        <p className="text-[#FDCB6E]">
          Backend unreachable, standing by to provide response. Retrying...
        </p>
        {error?.message && (
          <p className="text-text-secondary text-sm mt-2">{error.message}</p>
        )}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* D-10: Cascade order display (admin-togglable) */}
      {showCascade && data.cascade.length > 0 && (
        <div className="mb-4 p-3 bg-surface-2 border border-border-subtle rounded-lg">
          <span className="text-sm text-text-secondary">Cascade Order: </span>
          {data.cascade.map((provider, index) => (
            <span key={provider} className="text-sm">
              <span className="text-text-secondary">{index + 1}. </span>
              <span className="text-white">{provider}</span>
              {index < data.cascade.length - 1 && (
                <span className="text-text-secondary mx-2">&middot;</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {data.providers.map((provider) => {
          const colors = STATUS_COLORS[provider.status] ?? STATUS_COLORS.down;
          return (
            <div
              key={provider.name}
              className="bg-surface-2 border border-border-subtle rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium capitalize">
                  {provider.name}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${colors.dot}`}
                    aria-label={`Status: ${provider.status}`}
                  />
                  <span className={`text-sm ${colors.text}`}>
                    {provider.status}
                  </span>
                </div>
              </div>
              {provider.consecutive_errors > 0 && (
                <p className="text-text-secondary text-sm">
                  {provider.consecutive_errors} consecutive error
                  {provider.consecutive_errors !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
