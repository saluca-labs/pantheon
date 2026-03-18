"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type WidgetSize = "small" | "medium" | "large";
export type WidgetCategory = "security" | "management" | "analytics";
export type PresetKey = "soc" | "admin" | "hybrid" | "custom";

export interface WidgetConfig {
  id: string;
  type: string;
  colSpan: number; // 3 | 4 | 6 | 12
  order: number;
}

export interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  category: WidgetCategory;
  defaultColSpan: number;
  icon: string; // SVG path or emoji placeholder
}

// ─── Widget Registry ─────────────────────────────────────────────────────────

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // Security
  { type: "AlertFeed", name: "Alert Feed", description: "Live security alerts and incidents", category: "security", defaultColSpan: 6, icon: "alert" },
  { type: "AnomalyChart", name: "Anomaly Chart", description: "Real-time anomaly detection trends", category: "security", defaultColSpan: 4, icon: "chart" },
  { type: "SigmaMatches", name: "Sigma Matches", description: "SIGMA rule match results", category: "security", defaultColSpan: 4, icon: "sigma" },
  { type: "QuarantineStatus", name: "Quarantine Status", description: "Quarantined agents and entities", category: "security", defaultColSpan: 4, icon: "shield" },
  { type: "ThreatMap", name: "Threat Map", description: "Geographic threat visualization", category: "security", defaultColSpan: 6, icon: "map" },

  // Management
  { type: "AgentOverview", name: "Agent Overview", description: "Fleet status and agent health", category: "management", defaultColSpan: 6, icon: "agents" },
  { type: "PolicyStatus", name: "Policy Status", description: "Active policies and compliance", category: "management", defaultColSpan: 4, icon: "policy" },
  { type: "KeyLifecycle", name: "Key Lifecycle", description: "SoulKey rotation and expiry", category: "management", defaultColSpan: 4, icon: "key" },
  { type: "TenantHealth", name: "Tenant Health", description: "Multi-tenant health overview", category: "management", defaultColSpan: 4, icon: "tenant" },
  { type: "QuickActions", name: "Quick Actions", description: "Common admin shortcuts", category: "management", defaultColSpan: 3, icon: "actions" },

  // Analytics
  { type: "UsageMetrics", name: "Usage Metrics", description: "API calls, tokens, and throughput", category: "analytics", defaultColSpan: 4, icon: "metrics" },
  { type: "AuditStream", name: "Audit Stream", description: "Live audit event log", category: "analytics", defaultColSpan: 4, icon: "audit" },
  { type: "AgentFleetMap", name: "Agent Fleet Map", description: "Agent deployment topology", category: "analytics", defaultColSpan: 6, icon: "fleet" },
  { type: "EvaluationTrends", name: "Evaluation Trends", description: "Policy evaluation analytics", category: "analytics", defaultColSpan: 4, icon: "trends" },
  { type: "TopAgents", name: "Top Agents", description: "Most active agents ranking", category: "analytics", defaultColSpan: 4, icon: "ranking" },
];

export function getWidgetDef(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find((w) => w.type === type);
}

export function sizeToColSpan(size: WidgetSize): number {
  switch (size) {
    case "small": return 3;
    case "medium": return 4;
    case "large": return 6;
  }
}

export function colSpanToSize(colSpan: number): WidgetSize {
  if (colSpan <= 3) return "small";
  if (colSpan <= 4) return "medium";
  return "large";
}

// ─── Presets ─────────────────────────────────────────────────────────────────

function makeWidgets(entries: [string, number][]): WidgetConfig[] {
  return entries.map(([type, colSpan], i) => ({
    id: `${type}-${i}`,
    type,
    colSpan,
    order: i,
  }));
}

export const PRESETS: Record<Exclude<PresetKey, "custom">, { name: string; description: string; widgets: WidgetConfig[] }> = {
  soc: {
    name: "SOC View",
    description: "Optimized for security operations centers",
    widgets: makeWidgets([
      ["AlertFeed", 6],
      ["AnomalyChart", 4],
      ["QuarantineStatus", 4],
      ["SigmaMatches", 4],
      ["AgentFleetMap", 6],
      ["AuditStream", 4],
    ]),
  },
  admin: {
    name: "Admin Console",
    description: "Optimized for platform management",
    widgets: makeWidgets([
      ["AgentOverview", 6],
      ["PolicyStatus", 4],
      ["TenantHealth", 4],
      ["KeyLifecycle", 4],
      ["UsageMetrics", 4],
      ["QuickActions", 3],
    ]),
  },
  hybrid: {
    name: "Hybrid",
    description: "Best of security and management",
    widgets: makeWidgets([
      ["AgentOverview", 4],
      ["AlertFeed", 4],
      ["AnomalyChart", 4],
      ["PolicyStatus", 4],
      ["AuditStream", 4],
      ["QuarantineStatus", 3],
      ["UsageMetrics", 3],
      ["QuickActions", 3],
    ]),
  },
};

// ─── Context ─────────────────────────────────────────────────────────────────

interface DashboardState {
  currentLayout: WidgetConfig[];
  activePreset: PresetKey;
  isEditMode: boolean;
}

interface DashboardActions {
  addWidget: (type: string, colSpan?: number) => void;
  removeWidget: (id: string) => void;
  reorderWidgets: (activeId: string, overId: string) => void;
  resizeWidget: (id: string, colSpan: number) => void;
  setPreset: (preset: PresetKey) => void;
  toggleEditMode: () => void;
  setLayout: (widgets: WidgetConfig[]) => void;
}

type DashboardContextValue = DashboardState & DashboardActions;

const DashboardContext = createContext<DashboardContextValue | null>(null);

const STORAGE_KEY = "tiresias-dashboard-layout";

interface StoredState {
  currentLayout: WidgetConfig[];
  activePreset: PresetKey;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [currentLayout, setCurrentLayout] = useState<WidgetConfig[]>(PRESETS.hybrid.widgets);
  const [activePreset, setActivePreset] = useState<PresetKey>("hybrid");
  const [isEditMode, setIsEditMode] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored: StoredState = JSON.parse(raw);
          if (stored.currentLayout?.length) {
            setCurrentLayout(stored.currentLayout);
            setActivePreset(stored.activePreset || "custom");
          }
        }
      } catch {
        // Ignore parse errors
      }
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Save to localStorage on every change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    const data: StoredState = { currentLayout, activePreset };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [currentLayout, activePreset, hydrated]);

  const addWidget = useCallback((type: string, colSpan?: number) => {
    const def = getWidgetDef(type);
    const span = colSpan ?? def?.defaultColSpan ?? 4;
    setCurrentLayout((prev) => {
      const id = `${type}-${Date.now()}`;
      return [...prev, { id, type, colSpan: span, order: prev.length }];
    });
    setActivePreset("custom");
  }, []);

  const removeWidget = useCallback((id: string) => {
    setCurrentLayout((prev) =>
      prev.filter((w) => w.id !== id).map((w, i) => ({ ...w, order: i }))
    );
    setActivePreset("custom");
  }, []);

  const reorderWidgets = useCallback((activeId: string, overId: string) => {
    setCurrentLayout((prev) => {
      const oldIndex = prev.findIndex((w) => w.id === activeId);
      const newIndex = prev.findIndex((w) => w.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const updated = [...prev];
      const [moved] = updated.splice(oldIndex, 1);
      updated.splice(newIndex, 0, moved);
      return updated.map((w, i) => ({ ...w, order: i }));
    });
    setActivePreset("custom");
  }, []);

  const resizeWidget = useCallback((id: string, colSpan: number) => {
    setCurrentLayout((prev) =>
      prev.map((w) => (w.id === id ? { ...w, colSpan } : w))
    );
    setActivePreset("custom");
  }, []);

  const setPreset = useCallback((preset: PresetKey) => {
    if (preset !== "custom") {
      setCurrentLayout(PRESETS[preset].widgets);
    }
    setActivePreset(preset);
  }, []);

  const toggleEditMode = useCallback(() => {
    setIsEditMode((v) => !v);
  }, []);

  const setLayout = useCallback((widgets: WidgetConfig[]) => {
    setCurrentLayout(widgets);
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        currentLayout,
        activePreset,
        isEditMode,
        addWidget,
        removeWidget,
        reorderWidgets,
        resizeWidget,
        setPreset,
        toggleEditMode,
        setLayout,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
