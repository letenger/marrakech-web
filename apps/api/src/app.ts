// The Marrakech API, as a factory so tests can inject a fake `complete` and an
// in-memory store (no key, no disk). server.ts wires the real adapters.
//
// Routes:
//   GET  /api/health          — liveness
//   POST /api/ai-move          — LLM chooses a legal rotation or placement
//   POST /api/games            — persist a new game, returns { id }
//   GET  /api/games/:id        — load a saved game
//   PUT  /api/games/:id        — update a saved game's state
//
// Security posture: the LLM key lives only here; the server re-derives legal
// moves from the posted state (never trusts the client for legality); bodies are
// zod-validated; CORS is locked to the web origin; /api/ai-move is rate limited.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { llmAgent, type Complete, type GameState } from '@marrakech/engine';
import type { GameStore } from './store';
import { rateLimit } from './rateLimit';

export type AppDeps = {
  complete: Complete;
  store: GameStore;
  webOrigin?: string; // CORS allow-list; defaults to the Vite dev origin
};

// We validate the envelope but treat GameState structurally — the engine is the
// real authority (it only ever returns moves legal for the posted state), so a
// deep schema would just duplicate the rules. `passthrough` keeps unknown keys.
const gameStateSchema = z
  .object({
    players: z.array(z.unknown()).min(2).max(4),
    assam: z.object({ pos: z.object({ col: z.number(), row: z.number() }), facing: z.string() }),
    board: z.array(z.array(z.unknown())),
    turnIndex: z.number().int().min(0),
    phase: z.string(),
  })
  .passthrough();

const aiMoveSchema = z.object({
  state: gameStateSchema,
  phase: z.enum(['rotate', 'place']),
});

const configSchema = z.object({
  count: z.number().int().min(2).max(4),
  names: z.record(z.string()),
  seats: z.record(z.string()),
});

const createGameSchema = z.object({ config: configSchema, state: gameStateSchema });
const updateGameSchema = z.object({ state: gameStateSchema });

export function createApp({ complete, store, webOrigin }: AppDeps) {
  const app = new Hono();
  const agent = llmAgent({ complete, name: 'llm' });

  app.use('/api/*', cors({ origin: webOrigin ?? 'http://localhost:5173' }));

  app.get('/api/health', (c) => c.json({ ok: true }));

  // 30 AI moves / minute / IP — this route spends money, so it's throttled.
  const aiLimiter = rateLimit({ windowMs: 60_000, max: 30 });

  app.post('/api/ai-move', async (c) => {
    if (!aiLimiter(clientKey(c))) return c.json({ error: 'rate limited' }, 429);

    const parsed = aiMoveSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid body', details: parsed.error.issues }, 400);

    const state = parsed.data.state as unknown as GameState;
    try {
      if (parsed.data.phase === 'rotate') {
        const rotation = await agent.chooseRotation(state, Math.random);
        return c.json({ rotation });
      }
      const placement = await agent.choosePlacement(state, Math.random);
      return c.json({ placement }); // placement may be null → the turn passes
    } catch {
      // Model/provider failure — signal it so the client falls back locally.
      return c.json({ error: 'ai unavailable' }, 502);
    }
  });

  app.post('/api/games', async (c) => {
    const parsed = createGameSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid body', details: parsed.error.issues }, 400);
    const saved = store.create(parsed.data.config, parsed.data.state as unknown as GameState);
    return c.json({ id: saved.id }, 201);
  });

  app.get('/api/games/:id', (c) => {
    const saved = store.get(c.req.param('id'));
    if (!saved) return c.json({ error: 'not found' }, 404);
    return c.json(saved);
  });

  app.put('/api/games/:id', async (c) => {
    const parsed = updateGameSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid body', details: parsed.error.issues }, 400);
    const saved = store.update(c.req.param('id'), parsed.data.state as unknown as GameState);
    if (!saved) return c.json({ error: 'not found' }, 404);
    return c.json(saved);
  });

  return app;
}

// Best-effort client identity for rate limiting: the proxy-forwarded IP, else a
// fixed key (dev). Not a security control — just spend protection.
function clientKey(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}
