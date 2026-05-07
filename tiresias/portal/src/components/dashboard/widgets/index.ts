import AlertFeed from "./AlertFeed";
import AnomalyChart from "./AnomalyChart";
import SigmaMatches from "./SigmaMatches";
import QuarantineStatus from "./QuarantineStatus";
import ThreatMap from "./ThreatMap";
import AgentOverview from "./AgentOverview";
import PolicyStatus from "./PolicyStatus";
import KeyLifecycle from "./KeyLifecycle";
import TenantHealth from "./TenantHealth";
import QuickActions from "./QuickActions";
import UsageMetrics from "./UsageMetrics";
import AuditStream from "./AuditStream";
import AgentFleetMap from "./AgentFleetMap";
import EvaluationTrends from "./EvaluationTrends";
import TopAgents from "./TopAgents";
import WidgetShell from "./WidgetShell";

/** Widget registry -- maps widget IDs to components with metadata (name, category, default span). */

export const widgetRegistry: Record<
  string,
  {
    component: React.ComponentType;
    name: string;
    description: string;
    category: "security" | "management" | "analytics";
    defaultColSpan: number;
  }
> = {
  alertFeed: {
    component: AlertFeed,
    name: "Alert Feed",
    description: "Live security alert and event feed with severity indicators",
    category: "security",
    defaultColSpan: 1,
  },
  anomalyChart: {
    component: AnomalyChart,
    name: "Anomaly Chart",
    description: "7-day anomaly detection bar chart with summary stats",
    category: "security",
    defaultColSpan: 1,
  },
  sigmaMatches: {
    component: SigmaMatches,
    name: "Sigma Matches",
    description: "Recent Sigma detection rule matches with status tracking",
    category: "security",
    defaultColSpan: 2,
  },
  quarantineStatus: {
    component: QuarantineStatus,
    name: "Quarantine Status",
    description: "Active agent quarantines with actions and release controls",
    category: "security",
    defaultColSpan: 1,
  },
  threatMap: {
    component: ThreatMap,
    name: "Threat Map",
    description: "Radar-style threat category visualization with overall score",
    category: "security",
    defaultColSpan: 1,
  },
  agentOverview: {
    component: AgentOverview,
    name: "Agent Overview",
    description: "Agent fleet summary with stats and recent registrations",
    category: "management",
    defaultColSpan: 2,
  },
  policyStatus: {
    component: PolicyStatus,
    name: "Policy Status",
    description: "Policy sync status, version info, and recent changes",
    category: "management",
    defaultColSpan: 1,
  },
  keyLifecycle: {
    component: KeyLifecycle,
    name: "Key Lifecycle",
    description: "Soulkey lifecycle overview with timeline and health status",
    category: "management",
    defaultColSpan: 1,
  },
  tenantHealth: {
    component: TenantHealth,
    name: "Tenant Health",
    description: "System health indicators for all tenant services",
    category: "management",
    defaultColSpan: 1,
  },
  quickActions: {
    component: QuickActions,
    name: "Quick Actions",
    description: "Common admin action buttons for frequent operations",
    category: "management",
    defaultColSpan: 1,
  },
  usageMetrics: {
    component: UsageMetrics,
    name: "Usage Metrics",
    description: "Evaluation counts, token stats, and daily usage chart",
    category: "analytics",
    defaultColSpan: 2,
  },
  auditStream: {
    component: AuditStream,
    name: "Audit Stream",
    description: "Terminal-style live audit event log viewer",
    category: "analytics",
    defaultColSpan: 2,
  },
  agentFleetMap: {
    component: AgentFleetMap,
    name: "Agent Fleet Map",
    description: "Visual grid of agent nodes with status coloring",
    category: "analytics",
    defaultColSpan: 1,
  },
  evaluationTrends: {
    component: EvaluationTrends,
    name: "Evaluation Trends",
    description: "Allow vs Deny evaluation trends with top denied resources",
    category: "analytics",
    defaultColSpan: 1,
  },
  topAgents: {
    component: TopAgents,
    name: "Top Agents",
    description: "Most active agents ranked by evaluation count with sparklines",
    category: "analytics",
    defaultColSpan: 1,
  },
};

export {
  AlertFeed,
  AnomalyChart,
  SigmaMatches,
  QuarantineStatus,
  ThreatMap,
  AgentOverview,
  PolicyStatus,
  KeyLifecycle,
  TenantHealth,
  QuickActions,
  UsageMetrics,
  AuditStream,
  AgentFleetMap,
  EvaluationTrends,
  TopAgents,
  WidgetShell,
};
