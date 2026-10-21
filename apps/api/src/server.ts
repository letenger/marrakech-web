import { serve } from '@hono/node-server';
import type { Complete } from '@marrakech/engine';
import { createApp } from './app';
import { openaiComplete } from './openai';
import { anthropicComplete } from './anthropic';
import { SqliteStore } from './store';

function pickComplete(): Complete {
  const provider = (process.env.LLM_PROVIDER ?? 'openai').toLowerCase();
  if (provider === 'anthropic') return anthropicComplete();
  return openaiComplete();
}

const port = Number(process.env.PORT ?? 8787);
const app = createApp({
  complete: pickComplete(),
  store: new SqliteStore(process.env.DB_PATH ?? 'marrakech.db'),
  webOrigin: process.env.WEB_ORIGIN,
});

serve({ fetch: app.fetch, port });
console.log(`Marrakech API listening on http://localhost:${port}`);
