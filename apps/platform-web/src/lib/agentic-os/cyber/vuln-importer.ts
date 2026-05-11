/**
 * CyberSec OS — Vulnerability importer.
 *
 * Parses static JSON reports from common scanners (Trivy, OpenVAS) into
 * `VulnerabilityUpsert` shape. Validates with Zod; soft-fails per row so a
 * single malformed entry doesn't tank the whole import. Returns the parsed
 * upserts plus a row-indexed errors list the UI can surface.
 *
 * Live ingestion (running scanners on schedule, parsing their output via
 * MCP-mediated storage) is Phase 6+. This file is JSON-blob only.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { z } from 'zod';
import { cvssToSeverity, type VulnerabilityUpsert } from './vulnerabilities';

export interface ImporterResult {
  vulnerabilities: VulnerabilityUpsert[];
  errors: { row: number; message: string }[];
}

// ─── Trivy ─────────────────────────────────────────────────────────────────
//
// Trivy v0.x JSON: { Results: [{ Target, Type, Vulnerabilities: [...] }] }
// Each Vulnerability has: VulnerabilityID (CVE), PkgName, InstalledVersion,
// FixedVersion?, Severity (CRITICAL/HIGH/MEDIUM/LOW/UNKNOWN), Title?,
// Description?, References?, CVSS?, CweIDs?, PublishedDate?.

const TrivyCvssScore = z.object({
  V3Score: z.number().optional(),
  V3Vector: z.string().optional(),
  V2Score: z.number().optional(),
}).passthrough();

const TrivyVulnerability = z.object({
  VulnerabilityID: z.string().optional(),
  PkgName: z.string().optional(),
  InstalledVersion: z.string().optional(),
  FixedVersion: z.string().optional(),
  Severity: z.string().optional(),
  Title: z.string().optional(),
  Description: z.string().optional(),
  References: z.array(z.string()).optional(),
  CweIDs: z.array(z.string()).optional(),
  CVSS: z.record(z.string(), TrivyCvssScore).optional(),
  PublishedDate: z.string().optional(),
}).passthrough();

const TrivyResult = z.object({
  Target: z.string().optional(),
  Type: z.string().optional(),
  Vulnerabilities: z.array(TrivyVulnerability).nullable().optional(),
}).passthrough();

const TrivyReport = z.object({
  Results: z.array(TrivyResult).optional(),
  // Some Trivy outputs nest Results under SchemaVersion / ArtifactName; we
  // accept any shape and dig for Results.
}).passthrough();

export type TrivyReportV2 = z.infer<typeof TrivyReport>;

function normalizeTrivySeverity(s: string | undefined):
  'critical' | 'high' | 'medium' | 'low' | 'info' {
  switch ((s ?? '').toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH':     return 'high';
    case 'MEDIUM':   return 'medium';
    case 'LOW':      return 'low';
    default:         return 'info';
  }
}

function pickTrivyCvss(
  cvss: Record<string, z.infer<typeof TrivyCvssScore>> | undefined,
): { score: number | null; vector: string | null } {
  if (!cvss) return { score: null, vector: null };
  // Prefer nvd, then redhat, then any source.
  const order = ['nvd', 'redhat', 'ghsa'];
  const sources = [
    ...order.filter((k) => k in cvss),
    ...Object.keys(cvss).filter((k) => !order.includes(k)),
  ];
  for (const src of sources) {
    const row = cvss[src];
    if (!row) continue;
    if (typeof row.V3Score === 'number') {
      return { score: row.V3Score, vector: row.V3Vector ?? null };
    }
    if (typeof row.V2Score === 'number') {
      return { score: row.V2Score, vector: null };
    }
  }
  return { score: null, vector: null };
}

/**
 * Parse a Trivy JSON report into `VulnerabilityUpsert` rows.
 * Skips entries with no Title (and no CVE), and bubbles the per-row error
 * up via the `errors` array — caller decides whether to halt or proceed.
 */
export function parseTrivyReport(json: unknown): ImporterResult {
  const result: ImporterResult = { vulnerabilities: [], errors: [] };
  const parsedTop = TrivyReport.safeParse(json);
  if (!parsedTop.success) {
    result.errors.push({ row: -1, message: 'Top-level payload is not a Trivy report' });
    return result;
  }
  const results = parsedTop.data.Results ?? [];
  let rowIndex = 0;
  for (const res of results) {
    const vulns = res.Vulnerabilities ?? [];
    for (const v of vulns) {
      rowIndex += 1;
      try {
        const title = v.Title?.trim() || v.VulnerabilityID || v.PkgName || null;
        if (!title) {
          result.errors.push({ row: rowIndex, message: 'no title, CVE, or package — skipped' });
          continue;
        }
        const { score, vector } = pickTrivyCvss(v.CVSS);
        const severity =
          score != null ? cvssToSeverity(score) : normalizeTrivySeverity(v.Severity);
        const cweId = (v.CweIDs ?? [])[0] ?? null;
        const cveId = v.VulnerabilityID?.startsWith('CVE-')
          ? v.VulnerabilityID
          : null;
        result.vulnerabilities.push({
          cveId,
          title,
          description: v.Description ?? null,
          severity,
          cvssScore: score,
          cvssVector: vector,
          cweId,
          vendor: null,
          product: v.PkgName ?? null,
          affectedVersions: v.InstalledVersion ? [v.InstalledVersion] : [],
          fixedVersions: v.FixedVersion ? [v.FixedVersion] : [],
          publishedAt: v.PublishedDate ?? null,
          references: v.References ?? [],
          tags: ['trivy'],
          metadata: {
            source: 'trivy',
            target: res.Target ?? null,
            type: res.Type ?? null,
            originalVulnerabilityId: v.VulnerabilityID ?? null,
          },
        });
      } catch (e) {
        result.errors.push({
          row: rowIndex,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  return result;
}

// ─── OpenVAS ───────────────────────────────────────────────────────────────
//
// OpenVAS / Greenbone XML-converted-to-JSON shape:
//   { report: { results: { result: [...] } } }
// or directly { results: { result: [...] } }
// Each `result` row has: name, nvt: { cve, cvss_base_vector, cwe? },
// severity (string-numeric), description, threat, port?, references?.

const OpenvasNvt = z.object({
  cve: z.string().nullable().optional(),
  cvss_base_vector: z.string().nullable().optional(),
  cwe: z.string().nullable().optional(),
  family: z.string().nullable().optional(),
}).passthrough();

const OpenvasResult = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  severity: z.union([z.number(), z.string()]).optional(),
  threat: z.string().optional(),
  port: z.string().optional(),
  nvt: OpenvasNvt.optional(),
}).passthrough();

const OpenvasReportInner = z.object({
  results: z.union([
    z.object({ result: z.array(OpenvasResult).nullable().optional() }).passthrough(),
    z.array(OpenvasResult),
  ]).optional(),
}).passthrough();

const OpenvasReport = z.object({
  report: OpenvasReportInner.optional(),
}).passthrough();

function extractOpenvasResults(json: unknown): z.infer<typeof OpenvasResult>[] {
  const wrapped = OpenvasReport.safeParse(json);
  if (wrapped.success && wrapped.data.report?.results) {
    const inner = wrapped.data.report.results;
    if (Array.isArray(inner)) return inner;
    return inner.result ?? [];
  }
  const direct = OpenvasReportInner.safeParse(json);
  if (direct.success && direct.data.results) {
    const inner = direct.data.results;
    if (Array.isArray(inner)) return inner;
    return inner.result ?? [];
  }
  return [];
}

/** Parse an OpenVAS JSON report into `VulnerabilityUpsert` rows. */
export function parseOpenvasReport(json: unknown): ImporterResult {
  const result: ImporterResult = { vulnerabilities: [], errors: [] };
  const rows = extractOpenvasResults(json);
  if (rows.length === 0) {
    // Distinguish "wrong shape" from "valid but zero findings" — only flag
    // when the top-level isn't even a known OpenVAS container.
    if (
      !OpenvasReport.safeParse(json).success &&
      !OpenvasReportInner.safeParse(json).success
    ) {
      result.errors.push({ row: -1, message: 'Top-level payload is not an OpenVAS report' });
    }
    return result;
  }
  rows.forEach((r, idx) => {
    const rowIndex = idx + 1;
    try {
      const title = r.name?.trim();
      if (!title) {
        result.errors.push({ row: rowIndex, message: 'no name — skipped' });
        return;
      }
      const scoreRaw = typeof r.severity === 'string'
        ? Number.parseFloat(r.severity)
        : r.severity;
      const score = typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)
        ? scoreRaw
        : null;
      const severity = score != null ? cvssToSeverity(score) : (() => {
        switch ((r.threat ?? '').toLowerCase()) {
          case 'high':     return 'high'   as const;
          case 'medium':   return 'medium' as const;
          case 'low':      return 'low'    as const;
          case 'log':      return 'info'   as const;
          default:         return 'medium' as const;
        }
      })();
      const cve = r.nvt?.cve?.trim();
      const cveId = cve && cve.startsWith('CVE-') ? cve : null;
      const cwe = r.nvt?.cwe?.trim();
      const cweId = cwe && cwe.startsWith('CWE-') ? cwe : null;
      result.vulnerabilities.push({
        cveId,
        title,
        description: r.description ?? null,
        severity,
        cvssScore: score,
        cvssVector: r.nvt?.cvss_base_vector ?? null,
        cweId,
        vendor: null,
        product: null,
        affectedVersions: [],
        fixedVersions: [],
        publishedAt: null,
        references: [],
        tags: ['openvas'],
        metadata: {
          source: 'openvas',
          port: r.port ?? null,
          family: r.nvt?.family ?? null,
          threat: r.threat ?? null,
        },
      });
    } catch (e) {
      result.errors.push({
        row: rowIndex,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
  return result;
}
