/**
 * React hooks for deploy key management.
 *
 * useDeployKeys()      -- GET  /api/tiresias/policies/deploy-keys
 * useCreateDeployKey() -- POST /api/tiresias/policies/deploy-keys
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { DeployKey } from "@/lib/api/schemas/policies";

const DEPLOY_KEYS_ENDPOINT = "/api/tiresias/policies/deploy-keys";

/* ---- List deploy keys ---- */

interface UseDeployKeysResult {
  keys: DeployKey[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDeployKeys(): UseDeployKeysResult {
  const [keys, setKeys] = useState<DeployKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<{ keys: DeployKey[] }>(DEPLOY_KEYS_ENDPOINT);
      setKeys(data.keys ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deploy keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  return { keys, loading, error, refetch: fetchKeys };
}

/* ---- Create deploy key ---- */

interface UseCreateDeployKeyResult {
  create: (keyName: string) => Promise<DeployKey | null>;
  creating: boolean;
  error: string | null;
}

export function useCreateDeployKey(): UseCreateDeployKeyResult {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (keyName: string): Promise<DeployKey | null> => {
    try {
      setCreating(true);
      setError(null);
      const data = await api.post<DeployKey>(DEPLOY_KEYS_ENDPOINT, { key_name: keyName });
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create deploy key";
      setError(msg);
      return null;
    } finally {
      setCreating(false);
    }
  }, []);

  return { create, creating, error };
}
