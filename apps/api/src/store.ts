// Saved-game persistence with SQLite and in-memory implementations.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { GameConfig, GameState } from './types';

export type SavedGame = {
  id: string;
  config: GameConfig;
  state: GameState;
  updatedAt: string;
};

export interface GameStore {
  create(config: GameConfig, state: GameState): SavedGame;
  update(id: string, state: GameState): SavedGame | null;
  get(id: string): SavedGame | null;
}

export class SqliteStore implements GameStore {
  private db: DatabaseSync;

  constructor(path = 'marrakech.db') {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id         TEXT PRIMARY KEY,
        config     TEXT NOT NULL,
        state      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  create(config: GameConfig, state: GameState): SavedGame {
    const row: SavedGame = { id: randomUUID(), config, state, updatedAt: new Date().toISOString() };
    this.db
      .prepare('INSERT INTO games (id, config, state, updated_at) VALUES (?, ?, ?, ?)')
      .run(row.id, JSON.stringify(config), JSON.stringify(state), row.updatedAt);
    return row;
  }

  update(id: string, state: GameState): SavedGame | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updatedAt = new Date().toISOString();
    this.db
      .prepare('UPDATE games SET state = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(state), updatedAt, id);
    return { ...existing, state, updatedAt };
  }

  get(id: string): SavedGame | null {
    const row = this.db.prepare('SELECT * FROM games WHERE id = ?').get(id) as
      | { id: string; config: string; state: string; updated_at: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      config: JSON.parse(row.config) as GameConfig,
      state: JSON.parse(row.state) as GameState,
      updatedAt: row.updated_at,
    };
  }
}

export class MemoryStore implements GameStore {
  private games = new Map<string, SavedGame>();

  create(config: GameConfig, state: GameState): SavedGame {
    const row: SavedGame = { id: randomUUID(), config, state, updatedAt: new Date().toISOString() };
    this.games.set(row.id, row);
    return row;
  }

  update(id: string, state: GameState): SavedGame | null {
    const existing = this.games.get(id);
    if (!existing) return null;
    const row: SavedGame = { ...existing, state, updatedAt: new Date().toISOString() };
    this.games.set(id, row);
    return row;
  }

  get(id: string): SavedGame | null {
    return this.games.get(id) ?? null;
  }
}
