"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { Server, Plus, Trash2, CheckCircle, XCircle, MinusCircle, ToggleLeft, ToggleRight, X, Activity } from "lucide-react";

/** SIEM connectors -- syslog/webhook connector management and health. Uses live API via useWidgetData. */

// ---- Types ----

type ConnectorKind = "syslog" | "webhook";
type ConnectorStatus = "connected" | "error" | "disabled";

interface ConnectorConfig {
  id: string;
  kind: ConnectorKind;
  name: string;
  enabled: boolean;
  syslog_host?: string;
  syslog_port: number;
  syslog_protocol: string;
  webhook_url?: string;
  webhook_max_retries: number;
  webhook_verify_ssl: boolean;
  filter_severity: string[];
  filter_event_kind: string[];
  created_at: string;
}

interface ConnectorListData {
  connectors: ConnectorConfig[];
  total: number;
}

interface HealthEntry {
  id: string;
  name: string;
  kind: ConnectorKind;
  status: ConnectorStatus;
  last_event_at: string | null;
  error?: string;
}

interface HealthData {
  connectors: HealthEntry[];
  total: number;
  healthy: number;
  degraded: number;
  disabled: number;
}

// ---- Status helpers ----

function StatusBadge({ status }: { status: ConnectorStatus }) {
  const styles: Record<ConnectorStatus, string> = {
    connected: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    error: "bg-of-error/15 text-of-error border-of-error/20",
    disabled: "bg-of-outline-variant/10 text-of-on-surface-variant border-of-outline-variant/20",
  };
  const icons: Record<ConnectorStatus, React.ReactNode> = {
    connected: <CheckCircle className="h-2.5 w-2.5" />,
    error: <XCircle className="h-2.5 w-2.5" />,
    disabled: <MinusCircle className="h-2.5 w-2.5" />,
  };
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border w-fit ${styles[status]}`}>
      {icons[status]}
      {status}
    </span>
  );
}

// ---- Add connector form state ----

interface AddFormState {
  kind: ConnectorKind;
  name: string;
  syslog_host: string;
  syslog_port: string;
  syslog_protocol: "udp" | "tcp" | "tls";
  webhook_url: string;
  webhook_max_retries: string;
  filter_severity: string;
  filter_event_kind: string;
}

const EMPTY_FORM: AddFormState = {
  kind: "syslog",
  name: "",
  syslog_host: "",
  syslog_port: "514",
  syslog_protocol: "udp",
  webhook_url: "",
  webhook_max_retries: "3",
  filter_severity: "",
  filter_event_kind: "",
};

// ---- Main component ----

export default function SIEMConfigPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, HealthEntry>>({});

  const { data: listData, loading: listLoading, error: listError, refetch: refetchList } =
    useWidgetData<ConnectorListData>({
      endpoint: "/v1/siem/connectors",
      refreshInterval: 30000,
    });

  const { data: healthData, loading: healthLoading, refetch: refetchHealth } =
    useWidgetData<HealthData>({
      endpoint: "/v1/siem/health",
      refreshInterval: 30000,
    });

  const connectors: ConnectorConfig[] = listData?.connectors ?? [];
  const healthMap: Record<string, HealthEntry> = Object.fromEntries(
    (healthData?.connectors ?? []).map((h) => [h.id, h])
  );

  // ---- Actions ----

  async function handleAdd() {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    if (form.kind === "syslog" && !form.syslog_host.trim()) { setFormError("Syslog host is required"); return; }
    if (form.kind === "webhook" && !form.webhook_url.trim()) { setFormError("Webhook URL is required"); return; }

    setSubmitting(true);
    setFormError(null);
    try {
      const { api } = await import("@/lib/api");
      const body: Record<string, unknown> = {
        kind: form.kind,
        name: form.name.trim(),
        enabled: true,
      };
      if (form.kind === "syslog") {
        body.syslog_host = form.syslog_host.trim();
        body.syslog_port = parseInt(form.syslog_port) || 514;
        body.syslog_protocol = form.syslog_protocol;
      } else {
        body.webhook_url = form.webhook_url.trim();
        body.webhook_max_retries = parseInt(form.webhook_max_retries) || 3;
      }
      const parseSeverities = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);
      if (form.filter_severity.trim()) body.filter_severity = parseSeverities(form.filter_severity);
      if (form.filter_event_kind.trim()) body.filter_event_kind = parseSeverities(form.filter_event_kind);

      await api.post("/v1/siem/connectors", body);
      setActionResult({ type: "success", message: `Connector "${form.name}" created.` });
      setShowAddForm(false);
      setForm(EMPTY_FORM);
      refetchList();
      refetchHealth();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(connector: ConnectorConfig) {
    try {
      const { api } = await import("@/lib/api");
      await api.put(`/v1/siem/connectors/${connector.id}`, { enabled: !connector.enabled });
      setActionResult({
        type: "success",
        message: `Connector "${connector.name}" ${!connector.enabled ? "enabled" : "disabled"}.`,
      });
      refetchList();
      refetchHealth();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionResult({ type: "error", message });
    }
  }

  async function handleDelete(connector: ConnectorConfig) {
    if (!confirm(`Delete connector "${connector.name}"? This cannot be undone.`)) return;
    try {
      const { api } = await import("@/lib/api");
      await api.delete(`/v1/siem/connectors/${connector.id}`);
      setActionResult({ type: "success", message: `Connector "${connector.name}" deleted.` });
      refetchList();
      refetchHealth();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionResult({ type: "error", message });
    }
  }

  async function handleTest(connector: ConnectorConfig) {
    setTestingId(connector.id);
    try {
      const { api } = await import("@/lib/api");
      const result = await api.get("/v1/siem/health") as HealthData;
      const entry = result.connectors.find((c) => c.id === connector.id);
      if (entry) {
        setTestResults((prev) => ({ ...prev, [connector.id]: entry }));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionResult({ type: "error", message: `Test failed: ${message}` });
    } finally {
      setTestingId(null);
    }
  }

  // ---- Render ----

  return (
    <div className="max-w-7xl space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-of-on-surface">SIEM Configuration</h1>
          <p className="text-[11px] text-of-on-surface-variant mt-0.5">
            Configure syslog and webhook connectors for enterprise SIEM forwarding
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(!showAddForm); setFormError(null); }}
          className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 transition-colors text-xs font-bold"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Connector
        </button>
      </div>

      {/* Action result toast */}
      {actionResult && (
        <div className={`flex items-center justify-between p-4 rounded-xl border ${
          actionResult.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : "bg-of-error/10 border-of-error/20 text-of-error"
        }`}>
          <span className="text-sm font-medium">{actionResult.message}</span>
          <button onClick={() => setActionResult(null)} className="ml-4 hover:opacity-70 transition-opacity">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Health summary strip */}
      {!healthLoading && healthData && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: healthData.total, color: "text-of-on-surface" },
            { label: "Healthy", value: healthData.healthy, color: "text-emerald-400" },
            { label: "Degraded", value: healthData.degraded, color: "text-of-error" },
            { label: "Disabled", value: healthData.disabled, color: "text-of-on-surface-variant" },
          ].map((s) => (
            <div key={s.label} className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-4 flex items-center gap-3">
              <Server className="h-4 w-4 text-of-on-surface-variant shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{s.label}</p>
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add connector inline form */}
      {showAddForm && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-of-primary">New Connector</p>
            <button onClick={() => { setShowAddForm(false); setFormError(null); setForm(EMPTY_FORM); }}
              className="text-of-on-surface-variant hover:text-of-on-surface transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Kind selector */}
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Type</label>
              <div className="flex gap-2">
                {(["syslog", "webhook"] as ConnectorKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setForm((f) => ({ ...f, kind: k }))}
                    className={`px-4 h-8 rounded-lg text-xs font-bold border transition-colors ${
                      form.kind === k
                        ? "bg-of-primary/20 text-of-primary border-of-primary/30"
                        : "border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface"
                    }`}
                  >
                    {k === "syslog" ? "Syslog" : "Webhook"}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Splunk Syslog"
                className="w-full h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
              />
            </div>

            {/* Syslog fields */}
            {form.kind === "syslog" && (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Syslog Host *</label>
                  <input
                    value={form.syslog_host}
                    onChange={(e) => setForm((f) => ({ ...f, syslog_host: e.target.value }))}
                    placeholder="e.g. 192.168.1.100"
                    className="w-full h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Port</label>
                  <input
                    type="number"
                    value={form.syslog_port}
                    onChange={(e) => setForm((f) => ({ ...f, syslog_port: e.target.value }))}
                    min={1}
                    max={65535}
                    className="w-full h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface focus:outline-none focus:border-of-primary/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Protocol</label>
                  <div className="flex gap-2">
                    {(["udp", "tcp", "tls"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setForm((f) => ({ ...f, syslog_protocol: p }))}
                        className={`px-3 h-8 rounded-lg text-xs font-bold border transition-colors ${
                          form.syslog_protocol === p
                            ? "bg-of-primary/20 text-of-primary border-of-primary/30"
                            : "border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface"
                        }`}
                      >
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Webhook fields */}
            {form.kind === "webhook" && (
              <>
                <div className="md:col-span-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Webhook URL *</label>
                  <input
                    value={form.webhook_url}
                    onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
                    placeholder="https://hooks.example.com/..."
                    className="w-full h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Max Retries</label>
                  <input
                    type="number"
                    value={form.webhook_max_retries}
                    onChange={(e) => setForm((f) => ({ ...f, webhook_max_retries: e.target.value }))}
                    min={0}
                    max={10}
                    className="w-full h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface focus:outline-none focus:border-of-primary/40"
                  />
                </div>
              </>
            )}

            {/* Shared filter fields */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                Filter Severity <span className="normal-case font-normal">(comma-separated, optional)</span>
              </label>
              <input
                value={form.filter_severity}
                onChange={(e) => setForm((f) => ({ ...f, filter_severity: e.target.value }))}
                placeholder="critical,high"
                className="w-full h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                Filter Event Kind <span className="normal-case font-normal">(comma-separated, optional)</span>
              </label>
              <input
                value={form.filter_event_kind}
                onChange={(e) => setForm((f) => ({ ...f, filter_event_kind: e.target.value }))}
                placeholder="detection,quarantine"
                className="w-full h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
              />
            </div>
          </div>

          {formError && (
            <div className="mt-3 p-3 rounded-lg bg-of-error/10 border border-of-error/20 text-of-error text-xs">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-5">
            <button
              onClick={() => { setShowAddForm(false); setFormError(null); setForm(EMPTY_FORM); }}
              className="px-4 h-8 rounded-lg text-xs font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={submitting}
              className="px-4 h-8 rounded-lg text-xs font-bold bg-of-primary/20 text-of-primary border border-of-primary/20 hover:bg-of-primary/30 disabled:opacity-40 transition-colors"
            >
              {submitting ? "Creating..." : "Create Connector"}
            </button>
          </div>
        </div>
      )}

      {/* Error state -- suppress when no connectors (API may 404 on empty) */}
      {listError && !listLoading && connectors.length > 0 && (
        <div className="p-4 rounded-xl bg-of-error/10 border border-of-error/20 text-of-error text-sm">
          Failed to load connectors: {listError}
        </div>
      )}

      {/* Loading skeletons */}
      {listLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!listLoading && connectors.length === 0 && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 flex flex-col items-center justify-center py-16 gap-3 text-of-on-surface-variant">
          <Server className="h-8 w-8 opacity-30" />
          <p className="text-sm">No connectors configured</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 transition-colors text-xs font-bold"
          >
            <Plus className="h-3.5 w-3.5" />
            Add First Connector
          </button>
        </div>
      )}

      {/* Connector list */}
      {!listLoading && connectors.length > 0 && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_120px_140px_160px_auto] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
            {["Connector", "Kind", "Status", "Last Event", "Target", "Actions"].map((h, i) => (
              <span key={i} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{h}</span>
            ))}
          </div>

          {connectors.map((c) => {
            const health = testResults[c.id] ?? healthMap[c.id];
            const status: ConnectorStatus = !c.enabled
              ? "disabled"
              : health?.status ?? (c.enabled ? "connected" : "disabled");

            return (
              <div
                key={c.id}
                className={`grid grid-cols-[1fr_80px_120px_140px_160px_auto] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center ${
                  !c.enabled ? "opacity-60" : ""
                }`}
              >
                {/* Name + ID */}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-of-on-surface truncate">{c.name}</p>
                  <p className="text-[10px] font-mono text-of-on-surface-variant truncate mt-0.5">{c.id}</p>
                </div>

                {/* Kind badge */}
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase w-fit border ${
                  c.kind === "syslog"
                    ? "bg-of-primary/10 text-of-primary border-of-primary/20"
                    : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                }`}>
                  {c.kind}
                </span>

                {/* Status badge */}
                <StatusBadge status={status} />

                {/* Last event */}
                <span className="text-[10px] font-mono text-of-on-surface-variant">
                  {health?.last_event_at
                    ? new Date(health.last_event_at).toLocaleString()
                    : "\u2014"}
                </span>

                {/* Target endpoint */}
                <span className="text-xs font-mono text-of-on-surface-variant truncate" title={c.syslog_host || c.webhook_url || "\u2014"}>
                  {c.kind === "syslog"
                    ? `${c.syslog_host ?? "?"}:${c.syslog_port} (${c.syslog_protocol})`
                    : (c.webhook_url ? new URL(c.webhook_url).hostname : "\u2014")}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-2 justify-end">
                  {/* Test connectivity */}
                  <button
                    onClick={() => handleTest(c)}
                    disabled={testingId === c.id}
                    title="Test connectivity"
                    className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-primary hover:border-of-primary/30 disabled:opacity-40 transition-colors"
                  >
                    <Activity className="h-3 w-3" />
                    {testingId === c.id ? "..." : "Test"}
                  </button>

                  {/* Toggle enabled */}
                  <button
                    onClick={() => handleToggle(c)}
                    title={c.enabled ? "Disable connector" : "Enable connector"}
                    className="text-of-on-surface-variant hover:text-of-on-surface transition-colors"
                  >
                    {c.enabled
                      ? <ToggleRight className="h-4 w-4 text-emerald-400" />
                      : <ToggleLeft className="h-4 w-4" />}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(c)}
                    title="Delete connector"
                    className="text-of-on-surface-variant hover:text-of-error transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
