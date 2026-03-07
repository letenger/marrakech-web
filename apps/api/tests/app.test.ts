import { describe, it, expect } from 'vitest';
import { newGame, fakeComplete, legalPlacements } from '@marrakech/engine';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/store';
import type { GameConfig } from '../src/types';

// A fresh 2-player game to post at the API. rng=()=>0 → Assam centre, facing N.
const freshState = () => newGame(2, () => 0);
const config: GameConfig = {
  count: 2,
  names: { c: 'Peacock', y: 'Saffron', r: 'Crimson', p: 'Amethyst' },
  seats: { c: 'human', y: 'llm', r: 'human', p: 'human' },
};

function makeApp(complete = fakeComplete('{"rotation": 90}')) {
  return createApp({ complete, store: new MemoryStore() });
}

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await makeApp().request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /api/ai-move', () => {
  it('returns the model-chosen legal rotation', async () => {
    const app = makeApp(fakeComplete('{"rotation": 270}'));
    const res = await app.request('/api/ai-move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: freshState(), phase: 'rotate' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rotation: 270 });
  });

  it('returns a legal placement by index', async () => {
    const state = { ...freshState(), phase: 'place' as const };
    const app = makeApp(fakeComplete('{"index": 0}'));
    const res = await app.request('/api/ai-move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state, phase: 'place' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { placement: unknown };
    expect(body.placement).toEqual(legalPlacements(state)[0]);
  });

  it('rejects a malformed body with 400', async () => {
    const res = await makeApp().request('/api/ai-move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phase: 'rotate' }), // missing state
    });
    expect(res.status).toBe(400);
  });

  it('rate-limits a flood of requests with 429', async () => {
    const app = makeApp();
    const body = JSON.stringify({ state: freshState(), phase: 'rotate' });
    const req = () =>
      app.request('/api/ai-move', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
        body,
      });
    // Default limit is 30/min; the 31st from the same IP should be throttled.
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await req()).status;
    expect(last).toBe(429);
  });
});

describe('games persistence', () => {
  it('creates, reads back, and updates a saved game', async () => {
    const app = makeApp();

    const created = await app.request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config, state: freshState() }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(id).toBeTruthy();

    const loaded = await app.request(`/api/games/${id}`);
    expect(loaded.status).toBe(200);
    const saved = (await loaded.json()) as { config: GameConfig; state: { turnIndex: number } };
    expect(saved.config.count).toBe(2);

    const advanced = { ...freshState(), turnIndex: 1 };
    const updated = await app.request(`/api/games/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: advanced }),
    });
    expect(updated.status).toBe(200);
    const after = (await updated.json()) as { state: { turnIndex: number } };
    expect(after.state.turnIndex).toBe(1);
  });

  it('404s an unknown game id', async () => {
    const res = await makeApp().request('/api/games/does-not-exist');
    expect(res.status).toBe(404);
  });
});
