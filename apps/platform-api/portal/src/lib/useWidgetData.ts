/**
 * @module useWidgetData
 *
 * Custom React hook for dashboard widget data fetching.
 *
 * Handles the full lifecycle of widget data: initial fetch, automatic
 * interval-based polling (default 30s from config), error normalization
 * (ApiError status codes surfaced), and an optional `transform` callback
 * to reshape the raw API response before it reaches the widget component.
 *
 * @param endpoint  - API path to poll (e.g. `/api/dash/v1/spend`)
 * @param transform - Optional function to reshape the raw response into `T`
 * @param refreshInterval - Polling interval in ms (default: `config.refreshInterval`)
 * @param skip      - When true, suppresses all fetching (e.g. unauthenticated state)
 * @param requireTenant - When true, reads tenant_id from cookie and injects as query param; auto-skips when tenant is unavailable
 *
 * @returns `{ data, loading, error, refetch }`, standard async data tuple
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, ApiError, getStoredTenantId } from "./api";
import { config } from "./config";

interface UseWidgetDataOptions<T> {
  /** API endpoint path */
  endpoint: string;
  /** Transform raw API response into widget data */
  transform?: (raw: unknown) => T;
  /** Refresh interval in ms (defaults to 30s) */
  refreshInterval?: number;
  /** Whether to skip fetching (e.g. when not authenticated) */
  skip?: boolean;
  /**
   * When true, read tenant_id from getStoredTenantId() and inject as query param.
   * Auto-sets skip when tenant is unavailable, so widgets avoid firing requests
   * that would 400 on the backend for missing tenant scope.
   */
  requireTenant?: boolean;
}

interface UseWidgetDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Append a `tenant_id=<encoded>` query param to the endpoint, using `&` if
 * the endpoint already contains a query string, otherwise `?`.
 */
function appendTenantParam(endpoint: string, tenantId: string): string {
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}tenant_id=${encodeURIComponent(tenantId)}`;
}

export function useWidgetData<T>({
  endpoint,
  transform,
  refreshInterval = config.refreshInterval,
  skip = false,
  requireTenant = false,
}: UseWidgetDataOptions<T>): UseWidgetDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read tenant id only on the client to avoid SSR hydration mismatches.
  const tenantId =
    typeof window !== "undefined" ? getStoredTenantId() : null;

  // Effective skip: caller's explicit skip, OR requireTenant with no tenant available.
  const effectiveSkip = skip || (requireTenant && !tenantId);

  // Resolve the final endpoint; only inject tenant when requested and present.
  const resolvedEndpoint =
    requireTenant && tenantId ? appendTenantParam(endpoint, tenantId) : endpoint;

  const fetchData = useCallback(async () => {
    if (effectiveSkip) return;
    try {
      const raw = await api.get(resolvedEndpoint);
      const result = transform ? transform(raw) : (raw as T);
      setData(result);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load data");
      }
    } finally {
      setLoading(false);
    }
  }, [resolvedEndpoint, transform, effectiveSkip]);

  useEffect(() => {
    setLoading(true);
    fetchData();

    if (!effectiveSkip && refreshInterval > 0) {
      intervalRef.current = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, refreshInterval, effectiveSkip]);

  return { data, loading, error, refetch: fetchData };
}
