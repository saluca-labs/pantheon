"use client";

import React, { type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDashboard, getWidgetDef, colSpanToSize, type WidgetConfig, type WidgetCategory } from "./DashboardProvider";

// ─── Category Colors ─────────────────────────────────────────────────────────

const CATEGORY_ACCENT: Record<WidgetCategory, { border: string; bg: string; text: string; dot: string; gradientFrom: string; gradientTo: string }> = {
  security: {
    border: "border-of-primary/20",
    bg: "bg-of-primary/5",
    text: "text-of-primary",
    dot: "bg-of-primary",
    gradientFrom: "from-of-primary/20",
    gradientTo: "to-of-primary/0",
  },
  management: {
    border: "border-of-primary/20",
    bg: "bg-of-primary/5",
    text: "text-of-primary",
    dot: "bg-of-primary",
    gradientFrom: "from-of-primary/20",
    gradientTo: "to-of-primary/0",
  },
  analytics: {
    border: "border-blue-400/20",
    bg: "bg-blue-400/5",
    text: "text-blue-400",
    dot: "bg-blue-400",
    gradientFrom: "from-blue-400/20",
    gradientTo: "to-blue-400/0",
  },
};

// ─── Widget Icons ────────────────────────────────────────────────────────────

function WidgetIcon({ type, className }: { type: string; className?: string }) {
  const cls = className || "w-5 h-5";
  const icons: Record<string, React.ReactNode> = {
    AlertFeed: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
    AnomalyChart: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    SigmaMatches: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
    QuarantineStatus: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    ThreatMap: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    AgentOverview: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
      </svg>
    ),
    PolicyStatus: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    KeyLifecycle: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    TenantHealth: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
      </svg>
    ),
    QuickActions: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    UsageMetrics: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
    AuditStream: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    AgentFleetMap: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    EvaluationTrends: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    TopAgents: (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-2.77.672c-.993 0-1.929-.239-2.77-.672" />
      </svg>
    ),
  };

  return icons[type] || (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
    </svg>
  );
}

export { WidgetIcon };

// ─── Drag Handle ─────────────────────────────────────────────────────────────

function DragHandle({ listeners, attributes }: { listeners: ReturnType<typeof import("@dnd-kit/sortable").useSortable>["listeners"]; attributes: ReturnType<typeof import("@dnd-kit/sortable").useSortable>["attributes"] }) {
  return (
    <button
      className="cursor-grab active:cursor-grabbing p-1.5 rounded-md hover:bg-white/[0.06] text-of-outline hover:text-of-on-surface-variant transition-all duration-200 hover:scale-110"
      {...listeners}
      {...attributes}
    >
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="8" cy="4" r="1.5" />
        <circle cx="16" cy="4" r="1.5" />
        <circle cx="8" cy="10" r="1.5" />
        <circle cx="16" cy="10" r="1.5" />
        <circle cx="8" cy="16" r="1.5" />
        <circle cx="16" cy="16" r="1.5" />
      </svg>
    </button>
  );
}

// ─── Size Cycle Button ───────────────────────────────────────────────────────

function SizeButton({ widget }: { widget: WidgetConfig }) {
  const { resizeWidget } = useDashboard();
  const size = colSpanToSize(widget.colSpan);

  const cycle = () => {
    const next: Record<string, number> = { small: 4, medium: 6, large: 3 };
    resizeWidget(widget.id, next[size] ?? 4);
  };

  const label: Record<string, string> = { small: "S", medium: "M", large: "L" };

  return (
    <button
      onClick={cycle}
      className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-white/[0.06] hover:bg-white/[0.12] text-of-on-surface-variant hover:text-foreground transition-all duration-200 border border-white/[0.06] hover:border-white/[0.12]"
      title={`Size: ${size} -- click to cycle`}
    >
      {label[size]}
    </button>
  );
}

// ─── Widget Component ────────────────────────────────────────────────────────

interface DashboardWidgetProps {
  widget: WidgetConfig;
  children?: React.ReactNode;
}

export default function DashboardWidget({ widget, children }: DashboardWidgetProps) {
  const { isEditMode, removeWidget } = useDashboard();
  const def = getWidgetDef(widget.type);
  const category = def?.category || "analytics";
  const accent = CATEGORY_ACCENT[category];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled: !isEditMode });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${widget.colSpan} / span ${widget.colSpan}`,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative rounded-xl bg-of-surface-container-low/70 backdrop-blur-sm
        transition-all duration-250 ease-out
        ${isDragging ? "opacity-50 scale-[1.02] shadow-2xl shadow-black/30 ring-2 ring-of-primary/30" : ""}
        ${isEditMode && !isDragging ? "ring-1 ring-dashed ring-white/10 animate-[pulse_3s_ease-in-out_infinite] hover:ring-white/20" : ""}
      `}
    >
      {/* Gradient border effect */}
      <div className={`absolute inset-0 rounded-xl border ${accent.border} pointer-events-none`} />
      <div className={`absolute inset-0 rounded-xl bg-gradient-to-b ${accent.gradientFrom} ${accent.gradientTo} opacity-[0.03] pointer-events-none`} />

      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`${accent.text} transition-colors duration-200`}>
            <WidgetIcon type={widget.type} className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-medium text-foreground truncate tracking-[-0.01em]">
            {def?.name || widget.type}
          </h3>
          {category === "security" && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-of-primary/10 text-[10px] font-medium text-of-primary border border-of-primary/10">
              <span className="w-1.5 h-1.5 rounded-full bg-of-primary animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5">
          {isEditMode && (
            <>
              <SizeButton widget={widget} />
              <button
                onClick={() => removeWidget(widget.id)}
                className="p-1.5 rounded-md hover:bg-red-500/10 text-of-outline hover:text-red-400 transition-all duration-200 hover:shadow-[0_0_8px_rgba(239,68,68,0.15)]"
                title="Remove widget"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <DragHandle listeners={listeners} attributes={attributes} />
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`relative p-4 min-h-[120px]`}>
        {/* Subtle inner gradient for depth */}
        <div className={`absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-of-background/20 pointer-events-none rounded-b-xl`} />
        <div className="relative">
          {children || (
            <div className="flex flex-col items-center justify-center h-full min-h-[100px] gap-3 opacity-40">
              <div className={accent.text}>
                <WidgetIcon type={widget.type} className="w-8 h-8" />
              </div>
              <p className="text-xs text-of-outline">Widget content here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
