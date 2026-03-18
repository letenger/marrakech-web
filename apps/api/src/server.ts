// Production entry: pick the LLM adapter by protocol, wire the SQLite store,
// then serve the Hono app on Node. Config from the environment.
//
//   LLM_PROVIDER=openai     → OpenAI-compatible endpoint (OpenAI, DeepSeek, most
//                             third-party gateways). Uses OPENAI_API_KEY,
//                             OPENAI_BASE_URL, OPENAI_MODEL. This is the default.
//   LLM_PROVIDER=anthropic  → official Anthropic API. Uses ANTHROPIC_API_KEY.
import { serve } from '@hono/node-server';
import type { Complete } from '@marrakech/engine';
import { createApp } from './app';
import { openaiComplete } from './openai';
import { anthropicComplete } from './anthropic';
import { SqliteStore } from './store';

function pickComplete(): Complete {
  const provider = (process.env.LLM_PROVIDER ?? 'openai').toLowerCase();
  if (provider === 'anthropic') return anthropicComplete();
  return openaiComplete(); // openai-compatible: OpenAI, DeepSeek, gateways
}

const port = Number(process.env.PORT ?? 8787);
const app = createApp({
  complete: pickComplete(),
  store: new SqliteStore(process.env.DB_PATH ?? 'marrakech.db'),
  webOrigin: process.env.WEB_ORIGIN, // e.g. https://marrakech.vercel.app
});

serve({ fetch: app.fetch, port });
console.log(`Marrakech API listening on http://localhost:${port}`);
