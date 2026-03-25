import { useQuery } from '@tanstack/react-query';
import { fetchBFF } from '@/lib/api/client';
import {
  errorRatesResponseSchema,
  type ErrorRatesResponse,
} from '@/lib/api/schemas/errors';

function buildTimeParams(timeRange: string): string {
  const now = new Date();
  const hours: Record<string, number> = {
    '1h': 1,
    '24h': 24,
    '7d': 168,
    '30d': 720,
  };
  const h = hours[timeRange] || 24;
  const start = new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
  const end = now.toISOString();
  return `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
}

export function useErrors(timeRange: string, refreshInterval: number) {
  return useQuery<ErrorRatesResponse>({
    queryKey: ['errors', timeRange],
    queryFn: () =>
      fetchBFF(
        `/api/tiresias/errors${buildTimeParams(timeRange)}`,
        errorRatesResponseSchema,
      ),
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    staleTime: 0,
    gcTime: 0,
  });
}
