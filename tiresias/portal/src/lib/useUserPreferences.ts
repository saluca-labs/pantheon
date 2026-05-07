/**
 * @module useUserPreferences
 *
 * Lightweight user preferences hook backed by localStorage.
 *
 * Stores per-user UI preferences that persist across sessions but are
 * not synced to the server. Each key is namespaced under `tiresias_prefs_`.
 *
 * Supported preference keys:
 *  - `sidebar_collapsed_sections` -- which sidebar nav groups are collapsed
 *  - `dashboard_layout`           -- dashboard widget layout preference
 *  - `visible_sidebar_sections`   -- which sidebar groups are visible (user can hide sections)
 */
"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_PREFIX = "tiresias_prefs_";

export interface UserPreferences {
  /** Map of sidebar section key -> collapsed boolean */
  sidebar_collapsed_sections: Record<string, boolean>;
  /** Dashboard layout variant */
  dashboard_layout: "default" | "compact" | "wide";
  /** Set of sidebar section keys that are visible (empty = all visible) */
  visible_sidebar_sections: string[];
}

const DEFAULT_PREFERENCES: UserPreferences = {
  sidebar_collapsed_sections: {},
  dashboard_layout: "default",
  visible_sidebar_sections: [],
};

function readPref<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES[key];
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return DEFAULT_PREFERENCES[key];
    return JSON.parse(raw) as UserPreferences[K];
  } catch {
    return DEFAULT_PREFERENCES[key];
  }
}

function writePref<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage full or disabled -- silently ignore
  }
}

/**
 * Hook to read and write user preferences from localStorage.
 *
 * Returns the full preferences object and setter functions for each key.
 * Changes are persisted immediately and trigger a re-render.
 */
export function useUserPreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(() => ({
    sidebar_collapsed_sections: readPref("sidebar_collapsed_sections"),
    dashboard_layout: readPref("dashboard_layout"),
    visible_sidebar_sections: readPref("visible_sidebar_sections"),
  }));

  // Sync from localStorage on mount (handles SSR hydration)
  useEffect(() => {
    setPrefs({
      sidebar_collapsed_sections: readPref("sidebar_collapsed_sections"),
      dashboard_layout: readPref("dashboard_layout"),
      visible_sidebar_sections: readPref("visible_sidebar_sections"),
    });
  }, []);

  const setPref = useCallback(<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    writePref(key, value);
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetAll = useCallback(() => {
    for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof UserPreferences)[]) {
      writePref(key, DEFAULT_PREFERENCES[key]);
    }
    setPrefs({ ...DEFAULT_PREFERENCES });
  }, []);

  return { prefs, setPref, resetAll };
}

/** All sidebar section keys for the preferences UI */
export const ALL_SIDEBAR_SECTIONS = [
  { key: "observability", label: "Observability" },
  { key: "main", label: "Overview" },
  { key: "security", label: "Detection" },
  { key: "soulwatch", label: "SoulWatch" },
  { key: "soulgate", label: "SoulGate" },
  { key: "system", label: "System" },
  { key: "mssp", label: "MSSP" },
  { key: "aletheia", label: "Aletheia" },
] as const;
