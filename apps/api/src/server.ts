// Production entry: wire the real Anthropic adapter and the SQLite store, then
// serve the Hono app on Node. Config from the environment.
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { anthropicComplete } from './anthropic';
import { SqliteStore } from './store';

const port = Number(process.env.PORT ?? 8787);
const app = createApp({
  complete: anthropicComplete(),
  store: new SqliteStore(process.env.DB_PATH ?? 'marrakech.db'),
  webOrigin: process.env.WEB_ORIGIN, // e.g. https://marrakech.vercel.app
});

serve({ fetch: app.fetch, port });
console.log(`Marrakech API listening on http://localhost:${port}`);
