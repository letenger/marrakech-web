import { serve } from '@hono/node-server';
import type { Complete } from '@marrakech/engine';
import { createApp } from './app';
import { openaiComplete } from './openai';
import { anthropicComplete } from './anthropic';
import { SqliteStore } from './store';
import { SqliteOnlineStore, type OnlineStore } from './onlineStore';
import postgres from 'postgres';
import { PostgresGameStore, PostgresOnlineStore } from './postgresStore';

function pickComplete(): Complete {
  let complete: Complete | undefined;
  return (prompt) => {
    complete ??= (process.env.LLM_PROVIDER ?? 'openai').toLowerCase() === 'anthropic'
      ? anthropicComplete()
      : openaiComplete();
    return complete(prompt);
  };
}

const port = Number(process.env.PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;
if (process.env.RENDER && !databaseUrl) throw new Error('DATABASE_URL is required on Render');
const sql = databaseUrl ? postgres(databaseUrl, {
  max: 2, idle_timeout: 20, connect_timeout: 20,
}) : null;
const store = sql ? await PostgresGameStore.open(sql) : new SqliteStore(process.env.DB_PATH ?? 'marrakech.db');
const onlineStore: OnlineStore = sql ? await PostgresOnlineStore.open(sql) : new SqliteOnlineStore(process.env.ONLINE_DB_PATH ?? 'marrakech-online.db');
const app = createApp({ complete: pickComplete(), store, webOrigin: process.env.WEB_ORIGIN, onlineStore });
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
console.log(`Marrakech API listening on port ${port} (${sql ? 'PostgreSQL' : 'SQLite'})`);

// Render sends SIGTERM on deploy/spin-down. Drain already queued snapshots.
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 8_000);
  deadline.unref();
  server.close();
  try {
    await onlineStore.flush?.();
    await sql?.end({ timeout: 5 });
    process.exit(0);
  } catch {
    console.error('Could not finish database writes during shutdown');
    process.exit(1);
  }
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
