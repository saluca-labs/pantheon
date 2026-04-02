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
 *
 * @returns `{ data, loading, error, refetch }` -- standard async data tuple
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, ApiError } from "./api";
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
}

interface UseWidgetDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWidgetData<T>({
  endpoint,
  transform,
  refreshInterval = config.refreshInterval,
  skip = false,
}: UseWidgetDataOptions<T>): UseWidgetDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (skip) return;
    try {
      const raw = await api.get(endpoint);
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
  }, [endpoint, transform, skip]);

  useEffect(() => {
    setLoading(true);
    fetchData();

    if (!skip && refreshInterval > 0) {
      intervalRef.current = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, refreshInterval, skip]);

  return { data, loading, error, refetch: fetchData };
}
