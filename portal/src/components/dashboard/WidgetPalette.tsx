"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useDashboard,
  WIDGET_REGISTRY,
  sizeToColSpan,
  type WidgetCategory,
  type WidgetSize,
} from "./DashboardProvider";
import { WidgetIcon } from "./DashboardWidget";

const CATEGORIES: { key: WidgetCategory; label: string; accent: string; borderAccent: string; icon: React.ReactNode }[] = [
  {
    key: "security",
    label: "Security",
    accent: "text-of-primary",
    borderAccent: "border-l-of-primary/50",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    key: "management",
    label: "Management",
    accent: "text-of-primary",
    borderAccent: "border-l-of-primary/50",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    key: "analytics",
    label: "Analytics",
    accent: "text-blue-400",
    borderAccent: "border-l-blue-400/50",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
  },
];

const SIZE_OPTIONS: { key: WidgetSize; label: string; cols: number }[] = [
  { key: "small", label: "S", cols: 3 },
  { key: "medium", label: "M", cols: 4 },
  { key: "large", label: "L", cols: 6 },
];

export default function WidgetPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { currentLayout, addWidget } = useDashboard();

  const isAdded = (type: string) => currentLayout.some((w) => w.type === type);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-of-on-surface-variant hover:text-foreground transition-all duration-200"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Widget
      </button>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Slide-out panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-of-surface-container-low border-l border-white/[0.08] shadow-2xl shadow-black/50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-[-0.01em]">Widget Palette</h2>
                <p className="text-xs text-of-outline mt-0.5">Click a widget to add it to your dashboard</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg hover:bg-white/5 text-of-on-surface-variant hover:text-foreground transition-all duration-200"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b border-white/[0.04]">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-of-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  placeholder="Filter widgets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-of-surface-container border border-white/[0.08] text-sm text-foreground placeholder:text-of-outline focus:outline-none focus:border-of-primary/40 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-of-outline hover:text-foreground transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Widget list */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-thin">
              {CATEGORIES.map((cat) => {
                const widgets = WIDGET_REGISTRY.filter(
                  (w) =>
                    w.category === cat.key &&
                    (!search || w.name.toLowerCase().includes(search.toLowerCase()) || w.description.toLowerCase().includes(search.toLowerCase()))
                );
                if (widgets.length === 0) return null;
                return (
                  <div key={cat.key}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={cat.accent}>{cat.icon}</span>
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${cat.accent}`}>
                        {cat.label}
                      </h3>
                      <span className="text-[10px] text-of-outline font-mono ml-auto">{widgets.length}</span>
                    </div>
                    <div className="space-y-2">
                      {widgets.map((widget) => {
                        const added = isAdded(widget.type);
                        return (
                          <WidgetPaletteItem
                            key={widget.type}
                            widget={widget}
                            added={added}
                            accent={cat.accent}
                            borderAccent={cat.borderAccent}
                            onAdd={(colSpan) => {
                              addWidget(widget.type, colSpan);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function WidgetPaletteItem({
  widget,
  added,
  accent,
  borderAccent,
  onAdd,
}: {
  widget: (typeof WIDGET_REGISTRY)[number];
  added: boolean;
  accent: string;
  borderAccent: string;
  onAdd: (colSpan: number) => void;
}) {
  const [selectedSize, setSelectedSize] = useState<WidgetSize>("medium");

  return (
    <motion.div
      layout
      className={`
        relative rounded-lg border-l-2 ${borderAccent} border border-l-2 p-3 transition-all duration-200
        ${added
          ? "border-white/[0.04] bg-white/[0.01] opacity-50"
          : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12]"
        }
      `}
    >
      {/* Added checkmark overlay */}
      {added && (
        <div className="absolute top-2 right-2">
          <div className="w-5 h-5 rounded-full bg-green-500/15 border border-green-500/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${accent}`}>
          <WidgetIcon type={widget.type} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{widget.name}</span>
          </div>
          <p className="text-xs text-of-outline mt-0.5 leading-relaxed">{widget.description}</p>

          {/* Size selector + add button */}
          {!added && (
            <div className="flex items-center gap-2 mt-2.5">
              {/* Segmented control */}
              <div className="relative flex items-center bg-of-surface-container/80 rounded-lg p-0.5 border border-white/[0.06]">
                {SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSelectedSize(opt.key)}
                    className={`
                      relative px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider transition-all duration-200 z-10
                      ${selectedSize === opt.key
                        ? "text-foreground"
                        : "text-of-outline hover:text-of-on-surface-variant"
                      }
                    `}
                  >
                    {selectedSize === opt.key && (
                      <motion.div
                        layoutId={`size-bg-${widget.type}`}
                        className="absolute inset-0 bg-white/[0.1] rounded-md border border-white/[0.08]"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative">{opt.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => onAdd(sizeToColSpan(selectedSize))}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-of-primary/10 hover:bg-of-primary/20 text-of-primary text-xs font-medium transition-all duration-200 border border-of-primary/10 hover:border-of-primary/20"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
