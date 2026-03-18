"use client";

import React from "react";
import { motion } from "framer-motion";
import { useDashboard, PRESETS, type PresetKey } from "./DashboardProvider";

const PRESET_META: Record<Exclude<PresetKey, "custom">, { icon: React.ReactNode; accentClass: string; borderClass: string; glowClass: string; description: string }> = {
  soc: {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    accentClass: "text-teal-400",
    borderClass: "border-teal-500/30",
    glowClass: "shadow-[0_0_20px_-4px_rgba(45,212,191,0.15)]",
    description: "Security-focused monitoring layout",
  },
  admin: {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
    accentClass: "text-gold-400",
    borderClass: "border-gold-500/30",
    glowClass: "shadow-[0_0_20px_-4px_rgba(212,168,83,0.15)]",
    description: "Fleet management and operations",
  },
  hybrid: {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
      </svg>
    ),
    accentClass: "text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-gold-400",
    borderClass: "border-white/10",
    glowClass: "",
    description: "Combined security and management view",
  },
};

export default function LayoutPresets() {
  const { activePreset, setPreset } = useDashboard();

  const presetKeys: Exclude<PresetKey, "custom">[] = ["soc", "admin", "hybrid"];

  return (
    <div className="flex flex-wrap gap-3">
      {presetKeys.map((key) => {
        const preset = PRESETS[key];
        const meta = PRESET_META[key];
        const isActive = activePreset === key;

        return (
          <motion.button
            key={key}
            onClick={() => setPreset(key)}
            className={`
              relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-250
              ${isActive
                ? `${meta.borderClass} bg-white/[0.06] ${meta.glowClass}`
                : "border-white/[0.06] bg-navy-900/50 hover:bg-white/[0.03] hover:border-white/[0.1] hover:-translate-y-0.5"
              }
            `}
            whileTap={{ scale: 0.98 }}
            layout
          >
            {/* Active checkmark overlay */}
            {isActive && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gold-500 flex items-center justify-center shadow-lg shadow-gold-500/30"
              >
                <svg className="w-3 h-3 text-navy-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </motion.div>
            )}

            <div className={`${meta.accentClass} transition-colors duration-200`}>{meta.icon}</div>
            <div className="text-left">
              <div className={`text-sm font-medium ${isActive ? "text-foreground" : "text-foreground-muted"} transition-colors duration-200`}>
                {preset.name}
              </div>
              <div className="text-[11px] text-foreground-subtle leading-tight mt-0.5">
                {meta.description}
              </div>
            </div>
          </motion.button>
        );
      })}

      {/* Custom indicator */}
      {activePreset === "custom" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.06]"
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground-muted flex items-center justify-center shadow-lg"
          >
            <svg className="w-3 h-3 text-navy-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </motion.div>
          <svg className="w-5 h-5 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">Custom</div>
            <div className="text-[11px] text-foreground-subtle leading-tight mt-0.5">Modified layout</div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
