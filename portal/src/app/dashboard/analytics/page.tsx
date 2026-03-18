"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const DAILY_EVALS = [
  { day: "Mar 5", value: 3120 },
  { day: "Mar 6", value: 3450 },
  { day: "Mar 7", value: 2980 },
  { day: "Mar 8", value: 1890 },
  { day: "Mar 9", value: 1720 },
  { day: "Mar 10", value: 3680 },
  { day: "Mar 11", value: 3920 },
  { day: "Mar 12", value: 4100 },
  { day: "Mar 13", value: 3850 },
  { day: "Mar 14", value: 3540 },
  { day: "Mar 15", value: 2100 },
  { day: "Mar 16", value: 1950 },
  { day: "Mar 17", value: 3760 },
  { day: "Mar 18", value: 3772 },
];

const TOP_RESOURCES = [
  { name: "customer-data/*", count: 12840 },
  { name: "reports/*", count: 8920 },
  { name: "data-lake/raw/*", count: 7350 },
  { name: "config/*", count: 5210 },
  { name: "logs/auth-events", count: 4180 },
];

const TOP_AGENTS = [
  { name: "monitoring-agent", count: 9820 },
  { name: "customer-support-ai", count: 8450 },
  { name: "analytics-agent", count: 7230 },
  { name: "security-scanner", count: 6100 },
  { name: "data-pipeline", count: 5440 },
];

const maxEval = Math.max(...DAILY_EVALS.map((d) => d.value));
const maxResource = TOP_RESOURCES[0].count;
const maxAgent = TOP_AGENTS[0].count;

function AnimatedNumber({ value, className }: { value: string; className?: string }) {
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    // Parse the numeric part
    const numericStr = value.replace(/[^0-9.]/g, "");
    const target = parseFloat(numericStr);
    if (isNaN(target)) {
      const t = setTimeout(() => setDisplay(value), 0);
      return () => clearTimeout(t);
    }

    const suffix = value.replace(/[0-9,.]/g, "");
    const hasCommas = value.includes(",");
    const duration = 500;
    const steps = 15;
    let current = 0;

    const timer = setInterval(() => {
      current += target / steps;
      if (current >= target) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        const formatted = hasCommas ? Math.floor(current).toLocaleString() : Math.floor(current).toString();
        setDisplay(formatted + suffix);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span className={className}>{display}</span>;
}

export default function AnalyticsPage() {
  const allowPct = 94.2;
  const denyPct = 5.8;
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Analytics</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <input type="date" defaultValue="2026-03-05" className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200" />
            <span className="text-foreground-subtle text-xs">to</span>
            <input type="date" defaultValue="2026-03-18" className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200" />
          </div>
          <button className="group px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200 flex items-center gap-2">
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export Report
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Evaluations", value: "47,832", color: "text-foreground" },
          { label: "Unique Agents", value: "47", color: "text-teal-400" },
          { label: "Avg Latency", value: "14ms", color: "text-gold-400" },
          { label: "Uptime", value: "99.97%", color: "text-green-400" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-xl p-5"
          >
            <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">{stat.label}</p>
            <p className={`text-3xl font-bold mt-2 ${stat.color}`}>
              <AnimatedNumber value={stat.value} />
            </p>
          </motion.div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Evaluations Bar Chart */}
        <div className="lg:col-span-2 glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Daily Evaluations (14 days)</h3>
          <div className="flex items-end gap-1.5 h-48">
            {DAILY_EVALS.map((d, i) => {
              const height = (d.value / maxEval) * 100;
              const isHovered = hoveredBar === i;
              return (
                <div
                  key={d.day}
                  className="flex-1 flex flex-col items-center gap-1 group relative"
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {/* Tooltip */}
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute -top-8 px-2 py-1 rounded-md bg-navy-700 border border-white/10 text-[10px] text-foreground font-mono shadow-lg whitespace-nowrap z-10"
                    >
                      {d.value.toLocaleString()}
                    </motion.div>
                  )}
                  <motion.div
                    className={`w-full rounded-t-sm cursor-pointer transition-colors duration-200 ${
                      isHovered
                        ? "bg-gradient-to-t from-gold-600 to-gold-400"
                        : "bg-gradient-to-t from-teal-600 to-teal-400"
                    }`}
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ duration: 0.5, delay: i * 0.03, ease: "easeOut" }}
                    style={{ minHeight: 4 }}
                  />
                  <span className="text-[9px] text-foreground-subtle mt-1 whitespace-nowrap">{d.day.split(" ")[1]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Allow vs Deny Donut */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Allow vs Deny</h3>
          <div className="flex items-center justify-center py-4">
            <div className="relative w-40 h-40">
              {/* Animated CSS donut chart */}
              <motion.div
                className="w-full h-full rounded-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  background: `conic-gradient(
                    #22c55e 0deg ${allowPct * 3.6}deg,
                    #ef4444 ${allowPct * 3.6}deg 360deg
                  )`,
                }}
              />
              {/* Center hole */}
              <div className="absolute inset-4 rounded-full bg-navy-900 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xl font-bold text-foreground">
                    <AnimatedNumber value={`${allowPct}`} />%
                  </p>
                  <p className="text-[10px] text-foreground-subtle">Allowed</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-green-500"></div>
              <span className="text-xs text-foreground-muted">Allow ({allowPct}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-red-500"></div>
              <span className="text-xs text-foreground-muted">Deny ({denyPct}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Resources */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Top 5 Resources Accessed</h3>
          <div className="space-y-3">
            {TOP_RESOURCES.map((r, i) => {
              const width = (r.count / maxResource) * 100;
              return (
                <div key={r.name} className="space-y-1 group">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground-muted font-mono truncate max-w-[200px] group-hover:text-foreground transition-colors duration-200">{r.name}</span>
                    <span className="text-foreground-subtle font-mono">{r.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Agents */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Top 5 Agents by Activity</h3>
          <div className="space-y-3">
            {TOP_AGENTS.map((a, i) => {
              const width = (a.count / maxAgent) * 100;
              return (
                <div key={a.name} className="space-y-1 group">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground-muted group-hover:text-foreground transition-colors duration-200">{a.name}</span>
                    <span className="text-foreground-subtle font-mono">{a.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-gold-600 to-gold-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
