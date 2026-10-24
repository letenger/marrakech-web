import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import type { GameStore, SavedGame } from './store';
import type { OnlineStore } from './onlineStore';
import type { GameConfig, GameState } from './types';

export type Sql = ReturnType<typeof postgres>;

/** Cached registry keeps rule validation synchronous; writes commit in order. */
export class PostgresOnlineStore implements OnlineStore {
  private pending: Promise<void> = Promise.resolve();
  private failure: Error | null = null;
  private value: string | null;
  private readonly write: (value: string) => Promise<void>;

  constructor(value: string | null, write: (value: string) => Promise<void>) {
    this.value = value;
    this.write = write;
  }

  static async open(sql: Sql) {
    await sql`CREATE TABLE IF NOT EXISTS online_state (
      id INTEGER PRIMARY KEY CHECK (id=1), value TEXT, generation INTEGER NOT NULL
    )`;
    // A new deployment fences out its predecessor during Render's deploy overlap.
    const [row] = await sql`INSERT INTO online_state(id,value,generation) VALUES(1,NULL,1)
      ON CONFLICT(id) DO UPDATE SET generation=online_state.generation+1
      RETURNING value,generation`;
    const generation = row.generation as number;
    return new PostgresOnlineStore(row.value as string | null, async value => {
      const result = await sql`UPDATE online_state SET value=${value}
        WHERE id=1 AND generation=${generation} RETURNING id`;
      if (!result.length) throw new Error('Online writer replaced by a newer deployment');
    });
  }

  load() { return this.value; }

  save(value: string) {
    if (this.failure) throw this.failure;
    this.value = value;
    // Catch here to avoid unhandled rejections from timer/presence writes.
    // flush rejects consistently; later writes never run after a failed commit.
    this.pending = this.pending.then(async () => {
      if (this.failure) return;
      try { await this.write(value); }
      catch (error) { this.failure = error instanceof Error ? error : new Error('Database write failed'); }
    });
  }

  async flush() {
    await this.pending;
    if (this.failure) throw this.failure;
  }
}

export class PostgresGameStore implements GameStore {
  private readonly sql: Sql;
  constructor(sql: Sql) { this.sql = sql; }

  static async open(sql: Sql) {
    await sql`CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY, config TEXT NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL
    )`;
    return new PostgresGameStore(sql);
  }

  async create(config: GameConfig, state: GameState): Promise<SavedGame> {
    const row = { id: randomUUID(), config, state, updatedAt: new Date().toISOString() };
    await this.sql`INSERT INTO games(id,config,state,updated_at)
      VALUES(${row.id},${JSON.stringify(config)},${JSON.stringify(state)},${row.updatedAt})`;
    return row;
  }

  async update(id: string, state: GameState): Promise<SavedGame | null> {
    const updatedAt = new Date().toISOString();
    const [row] = await this.sql`UPDATE games SET state=${JSON.stringify(state)}, updated_at=${updatedAt}
      WHERE id=${id} RETURNING config`;
    return row ? { id, config: JSON.parse(row.config), state, updatedAt } : null;
  }

  async get(id: string): Promise<SavedGame | null> {
    const [row] = await this.sql`SELECT config,state,updated_at FROM games WHERE id=${id}`;
    return row ? { id, config: JSON.parse(row.config), state: JSON.parse(row.state), updatedAt: row.updated_at } : null;
  }
}
