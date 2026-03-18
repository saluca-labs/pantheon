"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Upstream {
  id: string;
  name: string;
  baseUrl: string;
  status: "healthy" | "degraded" | "down";
  latency: number;
  circuitBreaker: "closed" | "open" | "half_open";
  timeout: number;
  retries: number;
  requestsToday: number;
  errorsToday: number;
  lastCheck: string;
}

const INITIAL_UPSTREAMS: Upstream[] = [
  {
    id: "ups_1", name: "analytics-api", baseUrl: "https://analytics.internal:8080",
    status: "healthy", latency: 42, circuitBreaker: "closed", timeout: 5000, retries: 3,
    requestsToday: 48200, errorsToday: 12, lastCheck: "30 sec ago",
  },
  {
    id: "ups_2", name: "auth-service", baseUrl: "https://auth.internal:9090",
    status: "healthy", latency: 18, circuitBreaker: "closed", timeout: 3000, retries: 2,
    requestsToday: 92400, errorsToday: 3, lastCheck: "30 sec ago",
  },
  {
    id: "ups_3", name: "data-lake", baseUrl: "https://datalake.internal:7070",
    status: "degraded", latency: 340, circuitBreaker: "closed", timeout: 10000, retries: 5,
    requestsToday: 15600, errorsToday: 234, lastCheck: "30 sec ago",
  },
  {
    id: "ups_4", name: "ml-inference", baseUrl: "https://ml.internal:8443",
    status: "healthy", latency: 128, circuitBreaker: "closed", timeout: 15000, retries: 2,
    requestsToday: 22100, errorsToday: 8, lastCheck: "30 sec ago",
  },
  {
    id: "ups_5", name: "notification-svc", baseUrl: "https://notify.internal:6060",
    status: "down", latency: 0, circuitBreaker: "open", timeout: 5000, retries: 3,
    requestsToday: 1200, errorsToday: 1200, lastCheck: "30 sec ago",
  },
  {
    id: "ups_6", name: "billing-api", baseUrl: "https://billing.internal:8888",
    status: "healthy", latency: 65, circuitBreaker: "closed", timeout: 5000, retries: 3,
    requestsToday: 8900, errorsToday: 2, lastCheck: "30 sec ago",
  },
];

const statusBadge: Record<string, string> = {
  healthy: "bg-green-500/15 text-green-400 border border-green-500/20",
  degraded: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  down: "bg-red-500/15 text-red-400 border border-red-500/20",
};

const statusDot: Record<string, string> = {
  healthy: "bg-green-400",
  degraded: "bg-yellow-400",
  down: "bg-red-400",
};

const cbBadge: Record<string, string> = {
  closed: "bg-green-500/15 text-green-400 border border-green-500/20",
  open: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  half_open: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
};

export default function UpstreamsPage() {
  const [upstreams, setUpstreams] = useState(INITIAL_UPSTREAMS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTimeout, setNewTimeout] = useState("5000");
  const [newRetries, setNewRetries] = useState("3");
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<Record<string, string>>({});

  const healthyCount = upstreams.filter((u) => u.status === "healthy").length;

  const handleAddUpstream = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    const upstream: Upstream = {
      id: `ups_${Date.now()}`,
      name: newName.trim(),
      baseUrl: newUrl.trim(),
      status: "healthy",
      latency: 0,
      circuitBreaker: "closed",
      timeout: parseInt(newTimeout) || 5000,
      retries: parseInt(newRetries) || 3,
      requestsToday: 0,
      errorsToday: 0,
      lastCheck: "Never",
    };
    setUpstreams((prev) => [...prev, upstream]);
    setShowAddModal(false);
    setNewName("");
    setNewUrl("");
    setNewTimeout("5000");
    setNewRetries("3");
  };

  const handleHealthCheck = (id: string) => {
    setCheckingId(id);
    setCheckResults((prev) => ({ ...prev, [id]: "checking" }));
    setTimeout(() => {
      const upstream = upstreams.find((u) => u.id === id);
      if (upstream?.status === "down") {
        setCheckResults((prev) => ({ ...prev, [id]: "Health check failed - connection refused (ECONNREFUSED)" }));
      } else {
        setCheckResults((prev) => ({ ...prev, [id]: `Health check passed - 200 OK (${Math.floor(Math.random() * 80 + 10)}ms)` }));
      }
      setCheckingId(null);
    }, 1500);
  };

  const handleResetCircuitBreaker = (id: string) => {
    setUpstreams((prev) =>
      prev.map((u) => (u.id === id ? { ...u, circuitBreaker: "half_open" as const } : u))
    );
    setTimeout(() => {
      setUpstreams((prev) =>
        prev.map((u) => (u.id === id ? { ...u, circuitBreaker: "closed" as const, status: "degraded" as const } : u))
      );
    }, 2000);
  };

  const handleRemoveUpstream = (id: string) => {
    setUpstreams((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Upstreams</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/20">
            {healthyCount}/{upstreams.length} healthy
          </span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors"
        >
          + Add Upstream
        </button>
      </div>

      {/* Upstreams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {upstreams.map((upstream, i) => (
          <motion.div
            key={upstream.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  upstream.status === "healthy" ? "bg-green-500/10 border border-green-500/20" :
                  upstream.status === "degraded" ? "bg-yellow-500/10 border border-yellow-500/20" :
                  "bg-red-500/10 border border-red-500/20"
                }`}>
                  <svg className={`w-5 h-5 ${
                    upstream.status === "healthy" ? "text-green-400" :
                    upstream.status === "degraded" ? "text-yellow-400" : "text-red-400"
                  }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{upstream.name}</h3>
                  <p className="text-xs text-foreground-subtle font-mono truncate max-w-[200px]">{upstream.baseUrl}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge[upstream.status]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot[upstream.status]} ${upstream.status === "healthy" ? "animate-pulse" : ""}`} />
                {upstream.status === "healthy" ? "Healthy" : upstream.status === "degraded" ? "Degraded" : "Down"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground-subtle">Latency</span>
                  <span className={`font-mono ${
                    upstream.latency === 0 ? "text-red-400" :
                    upstream.latency > 200 ? "text-yellow-400" : "text-foreground-muted"
                  }`}>
                    {upstream.latency === 0 ? "N/A" : `${upstream.latency}ms`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground-subtle">Timeout</span>
                  <span className="text-foreground-muted font-mono">{upstream.timeout}ms</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground-subtle">Retries</span>
                  <span className="text-foreground-muted font-mono">{upstream.retries}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground-subtle">Requests</span>
                  <span className="text-foreground-muted font-mono">{upstream.requestsToday.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground-subtle">Errors</span>
                  <span className={`font-mono ${upstream.errorsToday > 100 ? "text-red-400" : "text-foreground-muted"}`}>
                    {upstream.errorsToday.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground-subtle">Last Check</span>
                  <span className="text-foreground-muted">{upstream.lastCheck}</span>
                </div>
              </div>
            </div>

            {/* Circuit Breaker Status */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-navy-800/50 border border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-foreground-subtle">Circuit Breaker:</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${cbBadge[upstream.circuitBreaker]}`}>
                  {upstream.circuitBreaker === "half_open" ? "Half Open" : upstream.circuitBreaker === "open" ? "Open" : "Closed"}
                </span>
              </div>
              {upstream.circuitBreaker === "open" && (
                <button
                  onClick={() => handleResetCircuitBreaker(upstream.id)}
                  className="px-2 py-1 rounded text-xs text-blue-400 hover:bg-blue-500/10 transition-all font-medium"
                >
                  Reset
                </button>
              )}
            </div>

            {checkResults[upstream.id] && checkResults[upstream.id] !== "checking" && (
              <div className={`p-2 rounded-lg border text-xs ${
                checkResults[upstream.id].includes("passed")
                  ? "bg-green-500/5 border-green-500/20 text-green-400"
                  : "bg-red-500/5 border-red-500/20 text-red-400"
              }`}>
                {checkResults[upstream.id]}
              </div>
            )}
            {checkResults[upstream.id] === "checking" && (
              <div className="p-2 rounded-lg bg-navy-950 border border-white/5 text-xs text-foreground-muted">
                Running health check...
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <button
                onClick={() => handleHealthCheck(upstream.id)}
                disabled={checkingId === upstream.id}
                className="flex-1 px-3 py-2 rounded-lg border border-teal-500/30 text-teal-400 hover:bg-teal-500/10 text-xs font-medium transition-all disabled:opacity-40"
              >
                Health Check
              </button>
              <button
                onClick={() => handleRemoveUpstream(upstream.id)}
                className="px-3 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-all"
              >
                Remove
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Upstream Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card rounded-xl w-full max-w-lg border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">Add Upstream</h2>
                  <button onClick={() => setShowAddModal(false)} className="text-foreground-subtle hover:text-foreground transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Name</label>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. analytics-api"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Base URL</label>
                    <input type="text" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://service.internal:8080"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all font-mono text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Timeout (ms)</label>
                      <input type="number" value={newTimeout} onChange={(e) => setNewTimeout(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Retries</label>
                      <input type="number" value={newRetries} onChange={(e) => setNewRetries(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all font-mono" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                  <button onClick={handleAddUpstream} disabled={!newName.trim() || !newUrl.trim()}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Add Upstream
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
