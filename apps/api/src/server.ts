import { serve } from '@hono/node-server';
import type { Complete } from '@marrakech/engine';
import { createApp } from './app';
import { openaiComplete } from './openai';
import { anthropicComplete } from './anthropic';
import { SqliteStore } from './store';
import { SqliteOnlineStore } from './onlineStore';

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
const app = createApp({
  complete: pickComplete(),
  store: new SqliteStore(process.env.DB_PATH ?? 'marrakech.db'),
  webOrigin: process.env.WEB_ORIGIN,
  onlineStore: new SqliteOnlineStore(process.env.ONLINE_DB_PATH ?? 'marrakech-online.db'),
});

serve({ fetch: app.fetch, port });
console.log(`Marrakech API listening on http://localhost:${port}`);
