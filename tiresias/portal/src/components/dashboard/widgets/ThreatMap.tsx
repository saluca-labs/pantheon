"use client";

import { useWidgetData } from "@/lib/useWidgetData";
import WidgetShell from "./WidgetShell";

/** Threat map -- radar-style threat category visualization. Uses live API via useWidgetData. */

interface Anomaly {
  anomaly_type: string;
  severity?: string;
  score?: number;
}

interface ThreatCategory {
  name: string;
  level: number;
  angle: number;
}

const CATEGORY_MAP: Record<string, string> = {
  privilege_escalation: "Privilege Escalation",
  data_exfiltration: "Data Exfil",
  lateral_movement: "Lateral Movement",
  policy_bypass: "Policy Bypass",
  anomalous_behavior: "Anomalous Behavior",
  credential_abuse: "Credential Abuse",
};

const CATEGORY_ANGLES: Record<string, number> = {
  "Privilege Escalation": 0,
  "Data Exfil": 60,
  "Lateral Movement": 120,
  "Policy Bypass": 180,
  "Anomalous Behavior": 240,
  "Credential Abuse": 300,
};

function transformAnomalies(raw: unknown): ThreatCategory[] {
  const anomalies = (raw as { anomalies?: Anomaly[] })?.anomalies || (raw as Anomaly[]) || [];

  // Count anomalies per category
  const counts: Record<string, number> = {};
  for (const a of anomalies) {
    const name = CATEGORY_MAP[a.anomaly_type] || a.anomaly_type || "Anomalous Behavior";
    counts[name] = (counts[name] || 0) + 1;
  }

  const maxCount = Math.max(...Object.values(counts), 1);

  // Build all 6 categories with their levels
  const allCategories = Object.entries(CATEGORY_ANGLES).map(([name, angle]) => ({
    name,
    level: Math.min((counts[name] || 0) / maxCount, 1),
    angle,
  }));

  return allCategories;
}

export default function ThreatMap() {
  const { data: categories, loading, error, refetch } = useWidgetData({
    endpoint: "/v1/analytics/anomalies",
    transform: transformAnomalies,
  });

  const cx = 120;
  const cy = 120;
  const maxR = 90;

  // Calculate overall threat level
  const avgLevel = categories ? categories.reduce((s, c) => s + c.level, 0) / categories.length : 0;
  const threatLabel = avgLevel >= 0.7 ? "HIGH" : avgLevel >= 0.4 ? "MED" : "LOW";
  const threatColor = avgLevel >= 0.7 ? "#ef4444" : avgLevel >= 0.4 ? "#eab308" : "#2dd4bf";

  return (
    <WidgetShell
      title="Threat Map"
      titleColor="text-of-primary"
      glowClass="glow-teal"
      loading={loading}
      error={error}
      onRetry={refetch}
    >
      {categories && (
        <div className="flex-1 flex items-center justify-center w-full">
          <svg viewBox="0 0 240 240" className="w-full max-w-[240px]">
            {/* Concentric rings */}
            {[0.33, 0.66, 1].map((r, i) => (
              <circle key={i} cx={cx} cy={cy} r={maxR * r} fill="none" stroke="rgba(45,212,191,0.1)" strokeWidth="1" />
            ))}

            {/* Axis lines */}
            {categories.map((cat, i) => {
              const rad = (cat.angle * Math.PI) / 180;
              const x2 = cx + Math.cos(rad) * maxR;
              const y2 = cy + Math.sin(rad) * maxR;
              return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(45,212,191,0.08)" strokeWidth="1" />;
            })}

            {/* Threat polygon */}
            <polygon
              points={categories
                .map((cat) => {
                  const rad = (cat.angle * Math.PI) / 180;
                  const r = maxR * Math.max(cat.level, 0.05);
                  return `${cx + Math.cos(rad) * r},${cy + Math.sin(rad) * r}`;
                })
                .join(" ")}
              fill="rgba(45,212,191,0.12)"
              stroke="#2dd4bf"
              strokeWidth="1.5"
            />

            {/* Threat dots */}
            {categories.map((cat, i) => {
              const rad = (cat.angle * Math.PI) / 180;
              const r = maxR * Math.max(cat.level, 0.05);
              const x = cx + Math.cos(rad) * r;
              const y = cy + Math.sin(rad) * r;
              const dotR = 3 + cat.level * 4;
              const isElevated = cat.level >= 0.7;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={dotR}
                  fill={isElevated ? "#ef4444" : cat.level >= 0.5 ? "#eab308" : "#2dd4bf"}
                  opacity={0.9}
                />
              );
            })}

            {/* Category labels */}
            {categories.map((cat, i) => {
              const rad = (cat.angle * Math.PI) / 180;
              const lR = maxR + 18;
              const x = cx + Math.cos(rad) * lR;
              const y = cy + Math.sin(rad) * lR;
              return (
                <text
                  key={i}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#5a6380"
                  fontSize="6.5"
                  fontFamily="var(--font-geist-mono)"
                >
                  {cat.name}
                </text>
              );
            })}

            {/* Center score */}
            <circle cx={cx} cy={cy} r="18" fill="rgba(15,22,41,0.9)" stroke={`${threatColor}50`} strokeWidth="1" />
            <text x={cx} y={cy - 3} textAnchor="middle" fill={threatColor} fontSize="8" fontWeight="bold">
              {threatLabel}
            </text>
            <text x={cx} y={cy + 7} textAnchor="middle" fill="#5a6380" fontSize="5">
              Threat Level
            </text>
          </svg>
        </div>
      )}
    </WidgetShell>
  );
}
