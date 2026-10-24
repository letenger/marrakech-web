import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { llmAgent, type Complete, type GameState } from '@marrakech/engine';
import type { GameStore } from './store';
import { rateLimit } from './rateLimit';
import { onlineRoutes } from './online';
import type { OnlineStore } from './onlineStore';

export type AppDeps = {
  complete: Complete;
  store: GameStore;
  webOrigin?: string;
  onlineStore?: OnlineStore;
};

// Validate the transport shape here; the shared engine remains the authority
// for move legality.
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

export function createApp({ complete, store, webOrigin, onlineStore }: AppDeps) {
  const app = new Hono();
  const agent = llmAgent({ complete, name: 'llm' });

  app.use('/api/*', cors({ origin: webOrigin ?? 'http://localhost:5173' }));

  app.route('/api/online', onlineRoutes(onlineStore));

  app.get('/api/health', async (c) => {
    try { await onlineStore?.flush?.(); }
    catch { return c.json({ ok: false }, 503); }
    return c.json({ ok: true });
  });

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
      return c.json({ placement });
    } catch {
      return c.json({ error: 'ai unavailable' }, 502);
    }
  });

  app.post('/api/games', async (c) => {
    const parsed = createGameSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid body', details: parsed.error.issues }, 400);
    const saved = await store.create(parsed.data.config, parsed.data.state as unknown as GameState);
    return c.json({ id: saved.id }, 201);
  });

  app.get('/api/games/:id', async (c) => {
    const saved = await store.get(c.req.param('id'));
    if (!saved) return c.json({ error: 'not found' }, 404);
    return c.json(saved);
  });

  app.put('/api/games/:id', async (c) => {
    const parsed = updateGameSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid body', details: parsed.error.issues }, 400);
    const saved = await store.update(c.req.param('id'), parsed.data.state as unknown as GameState);
    if (!saved) return c.json({ error: 'not found' }, 404);
    return c.json(saved);
  });

  return app;
}

function clientKey(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}
