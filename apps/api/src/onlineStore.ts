import { DatabaseSync } from 'node:sqlite';
export interface OnlineStore {
  load(): string | null;
  save(value: string): void;
}
export class MemoryOnlineStore implements OnlineStore {
  private value: string | null = null;
  load() {
    return this.value;
  }
  save(value: string) {
    this.value = value;
  }
}
/** A separate table keeps online matches inaccessible through the local save API. */
export class SqliteOnlineStore implements OnlineStore {
  private db: DatabaseSync;
  constructor(path = 'marrakech-online.db') {
    this.db = new DatabaseSync(path);
    this.db.exec('CREATE TABLE IF NOT EXISTS online_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
  }
  load() {
    return (this.db.prepare('SELECT value FROM online_state WHERE id=1').get() as {
      value: string;
    } | undefined)?.value ?? null;
  }
  save(value: string) {
    this.db.prepare('INSERT INTO online_state(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value);
  }
}
