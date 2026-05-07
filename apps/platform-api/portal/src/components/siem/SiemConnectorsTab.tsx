"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";

/**
 * SIEM Connectors management tab for Settings page.
 * Lists all DB-persisted connectors (syslog + webhook) with CRUD + health.
 */

type ConnectorKind = "syslog" | "webhook";

interface Connector {
  id: string;
  kind: ConnectorKind;
  name: string;
  enabled: boolean;
  syslog_host?: string;
  syslog_port?: number;
  syslog_protocol?: string;
  webhook_url?: string;
  webhook_max_retries?: number;
  filter_severity: string[];
  filter_event_kind: string[];
  status?: string;
  last_event_at?: string | null;
  created_at?: string;
}

interface HealthData {
  total: number;
  healthy: number;
  degraded: number;
  disabled: number;
  connectors: { id: string; status: string; name: string; kind: string; last_event_at: string | null; last_error: string | null }[];
}

export default function SiemConnectorsTab() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // New connector form
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<ConnectorKind>("syslog");
  const [newHost, setNewHost] = useState("");
  const [newPort, setNewPort] = useState(514);
  const [newProtocol, setNewProtocol] = useState("udp");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newRetries, setNewRetries] = useState(3);

  const refresh = async () => {
    try {
      const [cData, hData] = await Promise.all([
        api.get<{ connectors: Connector[]; total: number }>("/v1/siem/connectors"),
        api.get<HealthData>("/v1/siem/health"),
      ]);
      setConnectors(cData.connectors || []);
      setHealth(hData);
    } catch {
      setConnectors([]);
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    const body: Record<string, unknown> = {
      kind: newKind,
      name: newName,
      enabled: true,
    };
    if (newKind === "syslog") {
      body.syslog_host = newHost;
      body.syslog_port = newPort;
      body.syslog_protocol = newProtocol;
    } else {
      body.webhook_url = newWebhookUrl;
      body.webhook_max_retries = newRetries;
    }
    await api.post("/v1/siem/connectors", body);
    setShowAdd(false);
    setNewName("");
    setNewHost("");
    setNewWebhookUrl("");
    await refresh();
  };

  const statusColor = (s: string) => {
    if (s === "connected") return "bg-emerald-500/15 text-emerald-400";
    if (s === "error") return "bg-red-500/15 text-red-400";
    return "bg-gray-500/15 text-gray-400";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Health Summary */}
      {health && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: health.total, color: "text-foreground" },
            { label: "Healthy", value: health.healthy, color: "text-emerald-400" },
            { label: "Degraded", value: health.degraded, color: "text-red-400" },
            { label: "Disabled", value: health.disabled, color: "text-gray-400" },
          ].map((s) => (
            <div key={s.label} className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-foreground-subtle uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">SIEM Connectors</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
        >
          {showAdd ? "Cancel" : "+ Add Connector"}
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. prod-splunk"
                className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground"
              />
            </div>
            <div>
              <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Type</label>
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as ConnectorKind)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground"
              >
                <option value="syslog">Syslog (Splunk/Elastic/Sentinel via CEF)</option>
                <option value="webhook">Webhook (HTTP POST)</option>
              </select>
            </div>
          </div>

          {newKind === "syslog" ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Host</label>
                <input
                  value={newHost}
                  onChange={(e) => setNewHost(e.target.value)}
                  placeholder="syslog.example.com"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Port</label>
                <input
                  type="number"
                  value={newPort}
                  onChange={(e) => setNewPort(parseInt(e.target.value) || 514)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground"
                />
              </div>
              <div>
                <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Protocol</label>
                <select
                  value={newProtocol}
                  onChange={(e) => setNewProtocol(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground"
                >
                  <option value="udp">UDP</option>
                  <option value="tcp">TCP</option>
                  <option value="tls">TLS</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Webhook URL</label>
                <input
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://siem.example.com/events"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Max Retries</label>
                <input
                  type="number"
                  value={newRetries}
                  onChange={(e) => setNewRetries(parseInt(e.target.value) || 3)}
                  min={0}
                  max={10}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground"
                />
              </div>
            </div>
          )}

          <p className="text-[10px] text-foreground-subtle">
            Syslog connectors forward events in CEF format — compatible with Splunk HEC, Elastic, and Azure Sentinel.
          </p>

          <button
            onClick={handleCreate}
            disabled={!newName || (newKind === "syslog" ? !newHost : !newWebhookUrl)}
            className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create Connector
          </button>
        </div>
      )}

      {/* Connector List */}
      {loading ? (
        <p className="text-xs text-foreground-muted">Loading connectors...</p>
      ) : connectors.length === 0 ? (
        <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-8 text-center">
          <p className="text-sm text-foreground-muted">No SIEM connectors configured.</p>
          <p className="text-xs text-foreground-subtle mt-1">
            Add a syslog or webhook connector to forward detection events to your SIEM.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connectors.map((c) => {
            const h = health?.connectors.find((hc) => hc.id === c.id);
            const st = h?.status || (c.enabled ? "connected" : "disabled");
            return (
              <div
                key={c.id}
                className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-of-surface-container-highest flex items-center justify-center text-lg font-bold text-foreground-muted uppercase">
                      {c.kind === "syslog" ? "S" : "W"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{c.name}</p>
                      <p className="text-[10px] text-foreground-subtle">
                        {c.kind} &middot; {c.kind === "syslog" ? `${c.syslog_host}:${c.syslog_port}` : c.webhook_url}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(st)}`}>
                    {st}
                  </span>
                </div>

                {h?.last_error && (
                  <p className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">{h.last_error}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await api.put(`/v1/siem/connectors/${c.id}`, { enabled: !c.enabled });
                      await refresh();
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-foreground-muted hover:bg-of-surface-container-high"
                  >
                    {c.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={async () => {
                      await api.delete(`/v1/siem/connectors/${c.id}`);
                      await refresh();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
