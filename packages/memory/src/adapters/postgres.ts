import type { Adapter, Memory } from '../types.js'
import { M2_ENABLED, M2_H0_DAYS, stabilityAfterRecall } from '../hybrid/decay.js'

// pg is a peer dependency — import dynamically so SQLite users don't need it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgPool = any

export class PostgresAdapter implements Adapter {
  private pool!: PgPool
  private readonly connectionString: string
  private readonly maxMemoriesPerTopic: number

  constructor(connectionString?: string, maxMemoriesPerTopic = 10) {
    this.connectionString =
      connectionString ?? process.env.ASPHODEL_DATABASE_URL ?? ''
    if (!this.connectionString) {
      throw new Error(
        'PostgresAdapter requires a connection string or ASPHODEL_DATABASE_URL env var'
      )
    }
    this.maxMemoriesPerTopic = maxMemoriesPerTopic
  }

  async init(): Promise<void> {
    // Dynamic import so pg is optional
    const { Pool } = await import('pg')
    this.pool = new Pool({ connectionString: this.connectionString })
    await this.migrate()
  }

  private async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id         SERIAL PRIMARY KEY,
        content    TEXT NOT NULL,
        topics     TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS topic_index (
        word      TEXT NOT NULL,
        memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        PRIMARY KEY (word, memory_id)
      );

      CREATE INDEX IF NOT EXISTS idx_topic_word ON topic_index(word);
      CREATE INDEX IF NOT EXISTS idx_memories_fts
        ON memories USING gin(to_tsvector('english', content));

      -- Access-frequency + M2 activation-gated memory columns (additive, safe).
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS recall_count   INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS stability      DOUBLE PRECISION NOT NULL DEFAULT ${M2_H0_DAYS};
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_recall_at TIMESTAMPTZ;
      UPDATE memories SET last_recall_at = created_at WHERE last_recall_at IS NULL;
    `)
  }

  async insert(content: string, topics: string[]): Promise<number> {
    const { rows } = await this.pool.query(
      `INSERT INTO memories (content, topics) VALUES ($1, $2) RETURNING id`,
      [content, topics]
    )
    const id: number = rows[0].id

    for (const word of topics) {
      // Evict oldest if at capacity
      await this.pool.query(`
        DELETE FROM topic_index
        WHERE word = $1 AND memory_id = (
          SELECT ti.memory_id FROM topic_index ti
          JOIN memories m ON m.id = ti.memory_id
          WHERE ti.word = $1
          ORDER BY m.created_at ASC
          LIMIT 1
        ) AND (SELECT COUNT(*) FROM topic_index WHERE word = $1) >= $2
      `, [word, this.maxMemoriesPerTopic])

      await this.pool.query(
        `INSERT INTO topic_index (word, memory_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [word, id]
      )
    }

    return id
  }

  async recall(topic: string, limit: number): Promise<Memory[]> {
    const { rows } = await this.pool.query(`
      SELECT m.id, m.content, m.topics, m.created_at, m.stability, m.last_recall_at
      FROM memories m
      JOIN topic_index ti ON ti.memory_id = m.id
      WHERE ti.word = $1
      ORDER BY m.id DESC
      LIMIT $2
    `, [topic.toLowerCase().trim(), limit])

    return rows.map((r: {
      id: number; content: string; topics: string[]; created_at: Date
      stability?: number; last_recall_at?: Date | string | null
    }) => ({
      id: r.id,
      content: r.content,
      topics: r.topics,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      stability: r.stability ?? undefined,
      last_recall_at: r.last_recall_at == null
        ? undefined
        : r.last_recall_at instanceof Date ? r.last_recall_at.toISOString() : r.last_recall_at,
    }))
  }

  async search(query: string, limit: number): Promise<Memory[]> {
    const { rows } = await this.pool.query(`
      SELECT id, content, topics, created_at, stability, last_recall_at,
             ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS rank
      FROM memories
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $2
    `, [query, limit])

    return rows.map((r: {
      id: number; content: string; topics: string[]; created_at: Date
      stability?: number; last_recall_at?: Date | string | null
    }) => ({
      id: r.id,
      content: r.content,
      topics: r.topics,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      stability: r.stability ?? undefined,
      last_recall_at: r.last_recall_at == null
        ? undefined
        : r.last_recall_at instanceof Date ? r.last_recall_at.toISOString() : r.last_recall_at,
    }))
  }

  async forget(id: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM memories WHERE id = $1`,
      [id]
    )
    return (rowCount ?? 0) > 0
  }

  async list(limit: number, offset: number): Promise<Memory[]> {
    const { rows } = await this.pool.query(`
      SELECT id, content, topics, created_at, stability, last_recall_at
      FROM memories
      ORDER BY id DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset])

    return rows.map((r: {
      id: number; content: string; topics: string[]; created_at: Date
      stability?: number; last_recall_at?: Date | string | null
    }) => ({
      id: r.id,
      content: r.content,
      topics: r.topics,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      stability: r.stability ?? undefined,
      last_recall_at: r.last_recall_at == null
        ? undefined
        : r.last_recall_at instanceof Date ? r.last_recall_at.toISOString() : r.last_recall_at,
    }))
  }

  /**
   * Recall update. M1 (flag off): postgres never tracked recalls — preserve that
   * (no-op), so M1 behavior is byte-for-byte unchanged. M2 (flag on): gate the
   * stability gain on retrievability-at-recall and reset last_recall_at (the
   * testing effect), transactionally per id.
   */
  async bumpRecallCount(ids: number[]): Promise<void> {
    if (ids.length === 0 || !M2_ENABLED) return
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const now = new Date().toISOString()
      for (const id of ids) {
        const { rows } = await client.query(
          'SELECT stability, last_recall_at, created_at FROM memories WHERE id = $1 FOR UPDATE',
          [id]
        )
        if (!rows[0]) continue
        const stability: number = rows[0].stability ?? M2_H0_DAYS
        const lr = rows[0].last_recall_at ?? rows[0].created_at
        const lastIso = lr instanceof Date ? lr.toISOString() : lr
        await client.query(
          'UPDATE memories SET recall_count = recall_count + 1, stability = $1, last_recall_at = $2 WHERE id = $3',
          [stabilityAfterRecall(stability, lastIso), now, id]
        )
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
