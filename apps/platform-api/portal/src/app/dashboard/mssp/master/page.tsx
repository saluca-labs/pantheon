"use client";

import { useState, useEffect, useMemo } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { api } from "@/lib/api";
import { UpgradePrompt, parseErrorStatus } from "@/components/UpgradePrompt";
import {
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Building2,
  BarChart3,
  Users,
  Shield,
  Bot,
} from "lucide-react";

/* ---------- Types ---------- */

interface PlatformTenant {
  id: string;
  tenant_id?: string;
  name: string;
  slug: string;
  tier: string;
  status: string;
  parent_tenant_id: string | null;
  hierarchy_depth: number;
  children?: PlatformTenant[];
  created_at: string;
}

interface PlatformStats {
  total_tenants: number;
  by_tier: Record<string, number>;
  by_depth: Record<string, number>;
}

interface AgentKey {
  tenant_id: string;
  [key: string]: unknown;
}

type AgentsResponse = AgentKey[];

interface StatsResponse {
  stats?: PlatformStats;
}

interface TenantsResponse {
  tenants?: PlatformTenant[];
}

/* ---------- Helpers ---------- */

function buildTree(tenants: PlatformTenant[]): PlatformTenant[] {
  const map = new Map<string, PlatformTenant>();
  const roots: PlatformTenant[] = [];

  for (const t of tenants) {
    const id = t.tenant_id ?? t.id;
    map.set(id, { ...t, children: [] });
  }

  for (const t of tenants) {
    const id = t.tenant_id ?? t.id;
    const node = map.get(id)!;
    if (t.parent_tenant_id && map.has(t.parent_tenant_id)) {
      map.get(t.parent_tenant_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

const TIER_COLORS: Record<string, string> = {
  saas: "text-yellow-400 bg-yellow-500/15 border-yellow-500/25",
  mssp: "text-of-primary bg-of-primary/15 border-of-primary/25",
  enterprise: "text-purple-400 bg-purple-500/15 border-purple-500/25",
  pro: "text-blue-400 bg-blue-500/15 border-blue-500/25",
  community: "text-green-400 bg-green-500/15 border-green-500/25",
  starter: "text-of-on-surface-variant bg-of-surface-container-high border-of-outline-variant/20",
};

/* ---------- Tree Node Component ---------- */

function TenantNode({ tenant, depth = 0, agentCounts }: { tenant: PlatformTenant; depth?: number; agentCounts: Map<string, number> }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = (tenant.children?.length ?? 0) > 0;
  const tierStyle = TIER_COLORS[tenant.tier] ?? TIER_COLORS.starter;

  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-of-surface-container-high transition-colors border-b border-of-outline-variant/5"
        style={{ paddingLeft: `${depth * 24 + 16}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 rounded hover:bg-of-surface-container-high transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-of-on-surface-variant" />
            ) : (
              <ChevronRight className="w-4 h-4 text-of-on-surface-variant" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-of-on-surface truncate">{tenant.name}</p>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${tierStyle}`}
            >
              {tenant.tier}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                tenant.status === "active"
                  ? "bg-green-500/15 text-green-400 border border-green-500/20"
                  : "bg-of-error/20 text-of-error border border-of-error/30"
              }`}
            >
              {tenant.status}
            </span>
          </div>
          <p className="text-[10px] font-mono text-of-on-surface-variant mt-0.5 truncate">
            {tenant.slug} | depth {tenant.hierarchy_depth}
          </p>
        </div>

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums bg-of-primary/10 text-of-primary border border-of-primary/20 whitespace-nowrap">
          <Bot className="w-3 h-3" />
          {agentCounts.get(tenant.tenant_id ?? tenant.id) ?? 0}
        </span>

        <span className="text-[10px] text-of-on-surface-variant whitespace-nowrap">
          {hasChildren ? `${tenant.children!.length} children` : "leaf"}
        </span>
      </div>

      {expanded &&
        tenant.children?.map((child) => (
          <TenantNode
            key={child.tenant_id ?? child.id}
            tenant={child}
            depth={depth + 1}
            agentCounts={agentCounts}
          />
        ))}
    </div>
  );
}

/* ---------- Main Content ---------- */

function PlatformAdminContent() {
  const [createForm, setCreateForm] = useState({
    name: "",
    slug: "",
    tier: "enterprise",
    parent_tenant_id: "",
  });
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{
    tenant_id?: string;
    error?: string;
  } | null>(null);

  const {
    data: tenantsData,
    loading: tenantsLoading,
    error: tenantsError,
  } = useWidgetData<TenantsResponse>({
    endpoint: "/api/saas/admin/tenants",
    refreshInterval: 30000,
  });

  const {
    data: statsData,
    loading: statsLoading,
  } = useWidgetData<StatsResponse>({
    endpoint: "/api/saas/admin/stats",
    refreshInterval: 60000,
  });

  const {
    data: agentsData,
  } = useWidgetData<AgentsResponse>({
    endpoint: "/api/soulauth/agents?all=true",
    refreshInterval: 30000,
  });

  const agentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const arr = Array.isArray(agentsData) ? agentsData : [];
    for (const k of arr) {
      if (k?.tenant_id) {
        counts.set(k.tenant_id, (counts.get(k.tenant_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [agentsData]);

  const tenants: PlatformTenant[] =
    tenantsData?.tenants ??
    (Array.isArray(tenantsData) ? (tenantsData as PlatformTenant[]) : []);

  const tree = buildTree(tenants);

  const stats: PlatformStats = statsData?.stats ?? {
    total_tenants: tenants.length,
    by_tier: {},
    by_depth: {},
  };

  // Auto-generate slug from name
  useEffect(() => {
    if (createForm.name && !createForm.slug) {
      const autoSlug = createForm.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 63);
      setCreateForm((f) => ({ ...f, slug: autoSlug }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createForm.name]);

  async function handleCreate() {
    if (!createForm.name || !createForm.slug) return;
    setCreating(true);
    setCreateResult(null);
    try {
      const payload: Record<string, unknown> = {
        name: createForm.name,
        slug: createForm.slug,
        tier: createForm.tier,
      };
      if (createForm.parent_tenant_id) {
        payload.parent_tenant_id = createForm.parent_tenant_id;
      }
      const result = await api.post<{ tenant_id?: string; id?: string }>(
        "/api/saas/admin/tenants",
        payload,
      );
      setCreateResult({ tenant_id: result.tenant_id ?? result.id });
      setCreateForm({ name: "", slug: "", tier: "enterprise", parent_tenant_id: "" });
    } catch (e) {
      setCreateResult({
        error: e instanceof Error ? e.message : "Creation failed",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-8">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-of-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
              Total Tenants
            </span>
          </div>
          <p className="text-2xl font-bold text-of-on-surface tabular-nums">
            {statsLoading ? "--" : stats.total_tenants}
          </p>
        </div>

        {["mssp", "enterprise", "pro", "community"].map((tier) => (
          <div
            key={tier}
            className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5"
          >
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-of-on-surface-variant" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                {tier}
              </span>
            </div>
            <p className="text-2xl font-bold text-of-on-surface tabular-nums">
              {statsLoading ? "--" : (stats.by_tier?.[tier] ?? 0)}
            </p>
          </div>
        ))}
      </div>

      {/* Create tenant form */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Plus className="h-4 w-4 text-of-primary" />
          <h3 className="text-sm font-bold text-of-on-surface">Create Tenant</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">
              Tenant Name
            </label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, name: e.target.value, slug: "" }))
              }
              placeholder="Acme Security"
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">
              Slug
            </label>
            <input
              type="text"
              value={createForm.slug}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, slug: e.target.value }))
              }
              placeholder="acme-security"
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">
              Tier
            </label>
            <select
              value={createForm.tier}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, tier: e.target.value }))
              }
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface focus:outline-none focus:border-of-primary/40 transition-colors"
            >
              {["saas", "mssp", "enterprise", "pro", "starter", "community"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant block mb-1.5">
              Parent Tenant ID (optional)
            </label>
            <input
              type="text"
              value={createForm.parent_tenant_id}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  parent_tenant_id: e.target.value,
                }))
              }
              placeholder="UUID or leave empty for root"
              className="w-full h-9 px-3 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 transition-colors"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleCreate}
            disabled={creating || !createForm.name || !createForm.slug}
            className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {creating && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Create Tenant
          </button>
          {createResult?.tenant_id && (
            <span className="text-xs text-green-400">
              Created:{" "}
              <span className="font-mono">{createResult.tenant_id}</span>
            </span>
          )}
          {createResult?.error && (
            <span className="text-xs text-of-error">{createResult.error}</span>
          )}
        </div>
      </div>

      {/* Hierarchy tree */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-of-primary" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
            Platform Hierarchy
          </p>
          <span className="text-[10px] text-of-on-surface-variant/60 ml-auto">
            {tenants.length} tenants
          </span>
        </div>

        {tenantsLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5"
              />
            ))}
          </div>
        )}

        {tenantsError && (
          parseErrorStatus(tenantsError) === 402 ? (
            <UpgradePrompt feature="mssp_admin" requiredTier="mssp" />
          ) : (
            <div className="bg-of-error/10 border border-of-error/20 rounded-xl p-4">
              <p className="text-sm text-of-error">
                Failed to load tenants. Ensure the SaaS admin API is reachable.
              </p>
            </div>
          )
        )}

        {!tenantsLoading && !tenantsError && tree.length > 0 && (
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_100px] gap-4 px-4 py-3 border-b border-of-outline-variant/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant pl-9">
                Tenant
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                Agents
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                Children
              </span>
            </div>
            {tree.map((t) => (
              <TenantNode key={t.tenant_id ?? t.id} tenant={t} agentCounts={agentCounts} />
            ))}
          </div>
        )}

        {!tenantsLoading && !tenantsError && tree.length === 0 && (
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6 text-center">
            <p className="text-sm text-of-on-surface-variant">
              No tenants found. Create your first tenant above.
            </p>
          </div>
        )}
      </div>

      {/* Delegate admin section */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-of-primary" />
          <h3 className="text-sm font-bold text-of-on-surface">Delegated Admin</h3>
        </div>
        <p className="text-xs text-of-on-surface-variant">
          To delegate admin privileges to a child SaaS tenant, create the tenant with tier{" "}
          <span className="font-mono text-of-on-surface">saas</span> above. The child
          SaaS tenant owner will automatically receive admin rights over their subtree,
          following the tier permission matrix.
        </p>
      </div>
    </div>
  );
}

export default function PlatformAdminPage() {
  return (
      <PlatformAdminContent />
  );
}
