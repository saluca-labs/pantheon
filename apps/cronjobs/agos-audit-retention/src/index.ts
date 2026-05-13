/**
 * @pantheon-cronjobs/agos-audit-retention
 *
 * Nightly retention sweep on `agos_audit`. Deletes every row whose
 * `created_at` is older than `AUDIT_RETENTION_DAYS` (default 90).
 *
 * Connection model
 *   Uses the standard `DATABASE_URL` env var (Postgres URI, sync flavour).
 *   In-cluster the value points at `127.0.0.1:5432` via the cloud-sql-proxy
 *   sidecar; locally it can point at a dev Postgres.
 *
 * Safety guards
 *   - `AUDIT_RETENTION_DAYS < 7` aborts before issuing the DELETE. The audit
 *     trail is operationally load-bearing (every OS writes to it); a misset
 *     env var must not silently nuke the recent past.
 *   - `DRY_RUN=true` performs a COUNT(*) of the matching rows instead of
 *     deleting. Default `false`.
 *   - `BATCH_LIMIT` (default 100_000) caps a single sweep so a very large
 *     backlog can't lock the table for an unbounded window. The Job exits
 *     cleanly after one batch; subsequent nights chew through the rest.
 *
 * Output
 *   One structured JSON line per phase (start, decision, result) to stdout.
 *   Fluent Bit ingests these for the central log sink.
 */
import { Client } from "pg";

interface LogPayload {
  [key: string]: unknown;
}

function log(event: string, payload: LogPayload = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    component: "agos-audit-retention",
    event,
    ...payload,
  });
  // eslint-disable-next-line no-console
  console.log(line);
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    throw new Error(`env ${name}=${raw!} is not a valid integer`);
  }
  return n;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

async function main(): Promise<number> {
  const startedAt = Date.now();
  const retentionDays = parseIntEnv("AUDIT_RETENTION_DAYS", 90);
  const batchLimit = parseIntEnv("BATCH_LIMIT", 100_000);
  const dryRun = parseBoolEnv("DRY_RUN", false);

  log("start", {
    retentionDays,
    batchLimit,
    dryRun,
  });

  // Safety floor: refuse retention windows shorter than a week. The audit
  // log is the only source of truth for "who did what" and there is no
  // backup outside Cloud SQL automated backups (which themselves rotate).
  if (retentionDays < 7) {
    log("aborted", {
      reason: "retention_below_floor",
      retentionDays,
      floorDays: 7,
    });
    return 2;
  }

  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl === "") {
    log("aborted", { reason: "missing_database_url" });
    return 3;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Cutoff is computed inside Postgres so timezone semantics match the
    // table's `created_at TIMESTAMPTZ DEFAULT now()` exactly. Passing
    // `retentionDays` as a bound integer parameter avoids any SQL injection
    // surface even though the value is env-controlled.
    if (dryRun) {
      const result = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
           FROM agos_audit
          WHERE created_at < now() - make_interval(days => $1::int)`,
        [retentionDays],
      );
      const rawCount = result.rows[0]?.n ?? "0";
      const eligible = Number.parseInt(rawCount, 10);
      log("dry_run", {
        eligible,
        retentionDays,
        durationMs: Date.now() - startedAt,
      });
      return 0;
    }

    // Two-step delete: subselect with LIMIT so a runaway backlog can't
    // hold a row lock on the entire historic tail. Subsequent nights
    // sweep the next chunk.
    const result = await client.query<{ id: string }>(
      `DELETE FROM agos_audit
        WHERE id IN (
          SELECT id
            FROM agos_audit
           WHERE created_at < now() - make_interval(days => $1::int)
           ORDER BY created_at ASC
           LIMIT $2::int
        )
        RETURNING id`,
      [retentionDays, batchLimit],
    );
    const deleted = result.rowCount ?? 0;
    log("deleted", {
      deleted,
      batchLimit,
      retentionDays,
      durationMs: Date.now() - startedAt,
    });
    return 0;
  } finally {
    await client.end();
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log("error", { message, stack });
    process.exit(1);
  });
