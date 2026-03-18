"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Destination {
  id: string;
  name: string;
  type: "splunk" | "elastic" | "syslog" | "webhook" | "sentinel";
  url: string;
  status: "healthy" | "degraded" | "down";
  lastEvent: string;
  eventsForwarded: number;
}

const TYPE_LABELS: Record<string, string> = {
  splunk: "Splunk HEC",
  elastic: "Elasticsearch",
  syslog: "Syslog / CEF",
  webhook: "Webhook",
  sentinel: "Azure Sentinel",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  splunk: <span className="text-xs font-bold text-green-400">S&gt;</span>,
  elastic: <span className="text-xs font-bold text-yellow-400">Es</span>,
  syslog: <span className="text-xs font-bold text-blue-400">Sy</span>,
  webhook: <span className="text-xs font-bold text-purple-400">Wh</span>,
  sentinel: <span className="text-xs font-bold text-cyan-400">Az</span>,
};

const INITIAL_DESTINATIONS: Destination[] = [
  {
    id: "1", name: "Production Splunk", type: "splunk", url: "https://splunk.internal:8088/services/collector",
    status: "healthy", lastEvent: "2 sec ago", eventsForwarded: 128450,
  },
  {
    id: "2", name: "Security Elastic", type: "elastic", url: "https://elastic.internal:9200/soulwatch-events",
    status: "healthy", lastEvent: "5 sec ago", eventsForwarded: 98320,
  },
  {
    id: "3", name: "SOC Syslog", type: "syslog", url: "syslog://10.0.1.50:514",
    status: "degraded", lastEvent: "2 min ago", eventsForwarded: 45600,
  },
  {
    id: "4", name: "PagerDuty Webhook", type: "webhook", url: "https://events.pagerduty.com/integration/...",
    status: "healthy", lastEvent: "1 hour ago", eventsForwarded: 342,
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

export default function IntegrationsPage() {
  const [destinations, setDestinations] = useState(INITIAL_DESTINATIONS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<Destination["type"]>("splunk");
  const [newUrl, setNewUrl] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  const deadLetterCount = 23;

  const handleAddDestination = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    const dest: Destination = {
      id: Date.now().toString(),
      name: newName.trim(),
      type: newType,
      url: newUrl.trim(),
      status: "healthy",
      lastEvent: "Never",
      eventsForwarded: 0,
    };
    setDestinations((prev) => [...prev, dest]);
    setShowAddModal(false);
    setNewName("");
    setNewUrl("");
  };

  const handleTestConnection = (id: string) => {
    setTestingId(id);
    setTestResults((prev) => ({ ...prev, [id]: "testing" }));
    setTimeout(() => {
      setTestResults((prev) => ({ ...prev, [id]: "Connection successful - 200 OK (142ms)" }));
      setTestingId(null);
    }, 1500);
  };

  const handleRemoveDestination = (id: string) => {
    setDestinations((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Integrations</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-500/15 text-teal-400 border border-teal-500/20">
            {destinations.length} connected
          </span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors"
        >
          + Add Destination
        </button>
      </div>

      {/* Destinations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {destinations.map((dest, i) => (
          <motion.div
            key={dest.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-navy-800 border border-white/10 flex items-center justify-center">
                  {TYPE_ICONS[dest.type]}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{dest.name}</h3>
                  <p className="text-xs text-foreground-subtle">{TYPE_LABELS[dest.type]}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge[dest.status]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot[dest.status]} ${dest.status === "healthy" ? "animate-pulse" : ""}`} />
                {dest.status === "healthy" ? "Healthy" : dest.status === "degraded" ? "Degraded" : "Down"}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground-subtle">Endpoint</span>
                <span className="text-foreground-muted font-mono truncate max-w-[200px]">{dest.url}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground-subtle">Last Event</span>
                <span className="text-foreground-muted">{dest.lastEvent}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground-subtle">Events Forwarded</span>
                <span className="text-foreground-muted font-mono">{dest.eventsForwarded.toLocaleString()}</span>
              </div>
            </div>

            {testResults[dest.id] && testResults[dest.id] !== "testing" && (
              <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/20 text-xs text-green-400">
                {testResults[dest.id]}
              </div>
            )}
            {testResults[dest.id] === "testing" && (
              <div className="p-2 rounded-lg bg-navy-950 border border-white/5 text-xs text-foreground-muted">
                Testing connection...
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <button
                onClick={() => handleTestConnection(dest.id)}
                disabled={testingId === dest.id}
                className="flex-1 px-3 py-2 rounded-lg border border-teal-500/30 text-teal-400 hover:bg-teal-500/10 text-xs font-medium transition-all disabled:opacity-40"
              >
                Test Connection
              </button>
              <button
                onClick={() => handleRemoveDestination(dest.id)}
                className="px-3 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-all"
              >
                Remove
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Dead Letter Queue */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Dead Letter Queue</h3>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            deadLetterCount > 0 ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20" : "bg-green-500/15 text-green-400 border border-green-500/20"
          }`}>
            {deadLetterCount} messages
          </span>
        </div>
        <p className="text-xs text-foreground-muted mb-3">
          Events that failed to deliver to their destination are stored here for retry. Messages are retained for 72 hours.
        </p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 rounded-lg bg-navy-800/50 border border-white/5">
            <p className="text-lg font-bold text-yellow-400 font-mono">{deadLetterCount}</p>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mt-1">Pending</p>
          </div>
          <div className="p-3 rounded-lg bg-navy-800/50 border border-white/5">
            <p className="text-lg font-bold text-green-400 font-mono">148</p>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mt-1">Retried OK</p>
          </div>
          <div className="p-3 rounded-lg bg-navy-800/50 border border-white/5">
            <p className="text-lg font-bold text-red-400 font-mono">3</p>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mt-1">Failed</p>
          </div>
        </div>
      </div>

      {/* Add Destination Modal */}
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
                  <h2 className="text-lg font-semibold text-foreground">Add Destination</h2>
                  <button onClick={() => setShowAddModal(false)} className="text-foreground-subtle hover:text-foreground transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Destination Name</label>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Production Splunk"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Type</label>
                    <select value={newType} onChange={(e) => setNewType(e.target.value as Destination["type"])}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all">
                      <option value="splunk">Splunk HEC</option>
                      <option value="elastic">Elasticsearch</option>
                      <option value="syslog">Syslog / CEF</option>
                      <option value="webhook">Webhook</option>
                      <option value="sentinel">Azure Sentinel</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Endpoint URL</label>
                    <input type="text" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all font-mono text-xs" />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                  <button onClick={handleAddDestination} disabled={!newName.trim() || !newUrl.trim()}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Add Destination
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
