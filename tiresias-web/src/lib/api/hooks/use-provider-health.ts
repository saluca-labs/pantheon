import { useQuery } from '@tanstack/react-query';
import { fetchBFF } from '@/lib/api/client';
import {
  providerHealthResponseSchema,
  type ProviderHealthResponse,
} from '@/lib/api/schemas/provider-health';

export function useProviderHealth(refreshInterval: number) {
  return useQuery<ProviderHealthResponse>({
    queryKey: ['provider-health'],
    queryFn: () =>
      fetchBFF('/api/tiresias/providers/health', providerHealthResponseSchema),
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    staleTime: 0,
    gcTime: 0,
  });
}
