/**
 * tools/nexus.ts — Tool handlers for the `nexus_*` family.
 *
 * Nexus is a fleet-state catalog (tailnet nodes, services per node,
 * projects + GSD status per node). The original upstream nexus is a
 * cron-scanner-driven catalog; this adapter exposes the SAME read
 * surface but the catalog is populated through internal HTTP/POST
 * endpoints (`/api/nexus/nodes/upsert`, `/api/nexus/services/upsert`,
 * `/api/nexus/projects/upsert`) so a scanner running anywhere can
 * push state in — same shape, decoupled from the LLM tool surface.
 *
 * Stale-node policy: a node is "stale" after NEXUS_STALE_AFTER_MS
 * without a heartbeat. We report stale nodes in nexus_status so
 * callers know infrastructure health at a glance.
 */

import { z } from 'zod';
import type { DB } from '../store/db.js';

const NEXUS_STALE_AFTER_MS = Number(process.env.SOUL_MCP_NEXUS_STALE_MS ?? 15 * 60_000);

// ── Schemas ──────────────────────────────────────────────────────────────────

export const nexusContextSchema = z.object({
  node: z.string().optional(),
});

export const nexusServicesSchema = z.object({
  node: z.string().optional(),
});

export const nexusWhereSchema = z.object({
  project: z.string(),
});

// Upsert schemas — used by the HTTP-only catalog-feed endpoints (NOT
// exposed as MCP tools; only published from a node-scanner cron).
export const nodeUpsertSchema = z.object({
  node_id: z.string(),
  tailscale_ip: z.string().optional(),
  os: z.string().optional(),
  roles: z.array(z.string()).optional(),
  status: z.string().default('online'),
  meta: z.record(z.unknown()).optional(),
});

export const serviceUpsertSchema = z.object({
  node_id: z.string(),
  service_name: z.string(),
  port: z.number().int().optional(),
  status: z.string().default('running'),
  type: z.string().optional(),
});

export const projectUpsertSchema = z.object({
  project_name: z.string(),
  node_id: z.string(),
  path: z.string().optional(),
  git_branch: z.string().optional(),
  gsd_status: z.string().optional(),
  gsd_milestone: z.string().optional(),
  gsd_progress: z.number().optional(),
});

// ── Factory ──────────────────────────────────────────────────────────────────

export function buildNexusTools(db: DB) {
  const upsertNode = db.prepare(`
    INSERT INTO nexus_nodes
      (node_id, tailscale_ip, os, roles, status, meta, last_heartbeat, registered_at)
    VALUES
      (@node_id, @tailscale_ip, @os, @roles, @status, @meta, @now, @now)
    ON CONFLICT(node_id) DO UPDATE SET
      tailscale_ip   = COALESCE(excluded.tailscale_ip, nexus_nodes.tailscale_ip),
      os             = COALESCE(excluded.os, nexus_nodes.os),
      roles          = excluded.roles,
      status         = excluded.status,
      meta           = excluded.meta,
      last_heartbeat = excluded.last_heartbeat
  `);
  const upsertService = db.prepare(`
    INSERT INTO nexus_services (node_id, service_name, port, status, type, reported_at)
    VALUES (@node_id, @service_name, @port, @status, @type, @now)
    ON CONFLICT(node_id, service_name) DO UPDATE SET
      port        = excluded.port,
      status      = excluded.status,
      type        = excluded.type,
      reported_at = excluded.reported_at
  `);
  const upsertProject = db.prepare(`
    INSERT INTO nexus_projects
      (project_name, node_id, path, git_branch, gsd_status, gsd_milestone, gsd_progress, last_scanned_at)
    VALUES
      (@project_name, @node_id, @path, @git_branch, @gsd_status, @gsd_milestone, @gsd_progress, @now)
    ON CONFLICT(project_name, node_id) DO UPDATE SET
      path            = excluded.path,
      git_branch      = excluded.git_branch,
      gsd_status      = excluded.gsd_status,
      gsd_milestone   = excluded.gsd_milestone,
      gsd_progress    = excluded.gsd_progress,
      last_scanned_at = excluded.last_scanned_at
  `);

  const allNodes = db.prepare(`SELECT * FROM nexus_nodes ORDER BY node_id`);
  const oneNode = db.prepare(`SELECT * FROM nexus_nodes WHERE node_id = ?`);
  const servicesByNode = db.prepare(
    `SELECT * FROM nexus_services WHERE node_id = ? ORDER BY service_name`,
  );
  const allServices = db.prepare(`SELECT * FROM nexus_services ORDER BY node_id, service_name`);
  const allProjects = db.prepare(`SELECT * FROM nexus_projects ORDER BY project_name, node_id`);
  const gsdProjects = db.prepare(
    `SELECT * FROM nexus_projects WHERE gsd_status IS NOT NULL ORDER BY project_name`,
  );
  const projectExact = db.prepare(
    `SELECT * FROM nexus_projects WHERE project_name = ? ORDER BY node_id`,
  );
  const projectFuzzy = db.prepare(
    `SELECT * FROM nexus_projects WHERE project_name LIKE ? ORDER BY project_name, node_id LIMIT 50`,
  );

  function rowToNode(r: Record<string, unknown>) {
    return {
      node_id: r.node_id,
      tailscale_ip: r.tailscale_ip,
      os: r.os,
      roles: JSON.parse((r.roles as string) || '[]'),
      status: r.status,
      meta: JSON.parse((r.meta as string) || '{}'),
      last_heartbeat: r.last_heartbeat,
      registered_at: r.registered_at,
    };
  }
  function rowToService(r: Record<string, unknown>) {
    return {
      node_id: r.node_id,
      service_name: r.service_name,
      port: r.port,
      status: r.status,
      type: r.type,
      reported_at: r.reported_at,
    };
  }
  function rowToProject(r: Record<string, unknown>) {
    return {
      project_name: r.project_name,
      node_id: r.node_id,
      path: r.path,
      git_branch: r.git_branch,
      gsd_status: r.gsd_status,
      gsd_milestone: r.gsd_milestone,
      gsd_progress: r.gsd_progress,
      last_scanned_at: r.last_scanned_at,
    };
  }

  return {
    nexus_nodes() {
      const rows = (allNodes.all() as Array<Record<string, unknown>>).map(rowToNode);
      return { count: rows.length, nodes: rows };
    },

    nexus_services(input: z.infer<typeof nexusServicesSchema>) {
      const args = nexusServicesSchema.parse(input);
      const rows = args.node
        ? (servicesByNode.all(args.node) as Array<Record<string, unknown>>)
        : (allServices.all() as Array<Record<string, unknown>>);
      return { count: rows.length, services: rows.map(rowToService) };
    },

    nexus_gsd() {
      const rows = (gsdProjects.all() as Array<Record<string, unknown>>).map(rowToProject);
      return { count: rows.length, projects: rows };
    },

    nexus_where(input: z.infer<typeof nexusWhereSchema>) {
      const args = nexusWhereSchema.parse(input);
      let rows = projectExact.all(args.project) as Array<Record<string, unknown>>;
      let matchType: 'exact' | 'fuzzy' | 'none' = 'exact';
      if (rows.length === 0) {
        rows = projectFuzzy.all(`%${args.project}%`) as Array<Record<string, unknown>>;
        matchType = rows.length ? 'fuzzy' : 'none';
      }
      return {
        project: args.project,
        match_type: matchType,
        count: rows.length,
        locations: rows.map(rowToProject),
      };
    },

    nexus_context(input: z.infer<typeof nexusContextSchema>) {
      const args = nexusContextSchema.parse(input);
      const targetNodes = args.node
        ? ([oneNode.get(args.node)].filter(Boolean) as Array<Record<string, unknown>>)
        : (allNodes.all() as Array<Record<string, unknown>>);
      const out = targetNodes.map((nodeRow) => {
        const services = (servicesByNode.all(nodeRow.node_id as string) as Array<Record<string, unknown>>).map(
          rowToService,
        );
        const projects = (allProjects.all() as Array<Record<string, unknown>>)
          .filter((r) => r.node_id === nodeRow.node_id)
          .map(rowToProject);
        return {
          ...rowToNode(nodeRow),
          services,
          projects,
        };
      });
      return { count: out.length, nodes: out };
    },

    nexus_status() {
      const now = Date.now();
      const cutoff = now - NEXUS_STALE_AFTER_MS;
      const nodes = (allNodes.all() as Array<Record<string, unknown>>).map(rowToNode);
      const online = nodes.filter((n) => (n.last_heartbeat as number) >= cutoff);
      const stale = nodes.filter((n) => (n.last_heartbeat as number) < cutoff);
      const projects = (allProjects.all() as Array<Record<string, unknown>>).length;
      const gsd = (gsdProjects.all() as Array<Record<string, unknown>>).length;
      const services = (allServices.all() as Array<Record<string, unknown>>).length;
      return {
        nodes_total: nodes.length,
        nodes_online: online.length,
        nodes_stale: stale.length,
        services_running: services,
        projects_total: projects,
        gsd_projects: gsd,
        stale_after_ms: NEXUS_STALE_AFTER_MS,
        stale_nodes: stale.map((n) => n.node_id),
      };
    },

    // ── catalog-feed (NOT MCP tools — surfaced as HTTP-only) ───────────────

    upsertNode(input: z.infer<typeof nodeUpsertSchema>) {
      const args = nodeUpsertSchema.parse(input);
      const now = Date.now();
      upsertNode.run({
        node_id: args.node_id,
        tailscale_ip: args.tailscale_ip ?? null,
        os: args.os ?? null,
        roles: JSON.stringify(args.roles ?? []),
        status: args.status,
        meta: JSON.stringify(args.meta ?? {}),
        now,
      });
      return { node_id: args.node_id, status: args.status, updated_at: now };
    },

    upsertService(input: z.infer<typeof serviceUpsertSchema>) {
      const args = serviceUpsertSchema.parse(input);
      const now = Date.now();
      upsertService.run({
        node_id: args.node_id,
        service_name: args.service_name,
        port: args.port ?? null,
        status: args.status,
        type: args.type ?? null,
        now,
      });
      return {
        node_id: args.node_id,
        service_name: args.service_name,
        status: args.status,
        updated_at: now,
      };
    },

    upsertProject(input: z.infer<typeof projectUpsertSchema>) {
      const args = projectUpsertSchema.parse(input);
      const now = Date.now();
      upsertProject.run({
        project_name: args.project_name,
        node_id: args.node_id,
        path: args.path ?? null,
        git_branch: args.git_branch ?? null,
        gsd_status: args.gsd_status ?? null,
        gsd_milestone: args.gsd_milestone ?? null,
        gsd_progress: args.gsd_progress ?? null,
        now,
      });
      return {
        project_name: args.project_name,
        node_id: args.node_id,
        updated_at: now,
      };
    },
  };
}

export type NexusTools = ReturnType<typeof buildNexusTools>;
