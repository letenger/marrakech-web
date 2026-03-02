import { describe, it, expect } from 'vitest';
import { newGame } from '../src/game/setup';
import { llmAgent, fakeComplete } from '../src/game/ai/llm';
import type { Complete, IllegalMove } from '../src/game/ai/llm';
import { legalRotations, legalPlacements } from '../src/game/moves';

const rng0 = () => 0; // Assam centre (3,3), facing N

describe('llm agent — happy path', () => {
  it('chooseRotation returns the model-chosen legal rotation', async () => {
    const agent = llmAgent({ complete: fakeComplete('{"rotation": 90}') });
    const deg = await agent.chooseRotation(newGame(2, rng0), rng0);
    expect(deg).toBe(90);
  });

  it('choosePlacement returns the indexed legal placement', async () => {
    const g = { ...newGame(2, rng0), phase: 'place' as const };
    const agent = llmAgent({ complete: fakeComplete('{"index": 0}') });
    const placement = await agent.choosePlacement(g, rng0);
    expect(placement).toEqual(legalPlacements(g)[0]);
  });

  it('tolerates prose and code fences around the JSON', async () => {
    const reply = 'Sure! I think 270 is best.\n```json\n{"rotation": 270}\n```';
    const agent = llmAgent({ complete: fakeComplete(reply) });
    const deg = await agent.chooseRotation(newGame(2, rng0), rng0);
    expect(deg).toBe(270);
  });
});

describe('llm agent — validation & retry', () => {
  it('retries on malformed output, then succeeds', async () => {
    const replies = ['not json at all', '{"rotation": 90}'];
    let i = 0;
    const complete: Complete = () => Promise.resolve(replies[i++]);
    const illegals: IllegalMove[] = [];
    const agent = llmAgent({ complete, onIllegalMove: (info) => illegals.push(info) });

    const deg = await agent.chooseRotation(newGame(2, rng0), rng0);
    expect(deg).toBe(90); // second attempt was accepted
    expect(illegals).toHaveLength(1); // first attempt was flagged illegal
    expect(illegals[0].phase).toBe('rotate');
  });

  it('rejects an out-of-range placement index and retries', async () => {
    const g = { ...newGame(2, rng0), phase: 'place' as const };
    const n = legalPlacements(g).length;
    const replies = [`{"index": ${n + 99}}`, '{"index": 1}'];
    let i = 0;
    const agent = llmAgent({ complete: () => Promise.resolve(replies[i++]) });
    const placement = await agent.choosePlacement(g, rng0);
    expect(placement).toEqual(legalPlacements(g)[1]);
  });

  it('falls back to a legal move when the model never complies', async () => {
    const agent = llmAgent({ complete: fakeComplete('garbage forever'), maxRetries: 1 });
    const g = newGame(2, rng0);
    const deg = await agent.chooseRotation(g, rng0);
    expect(legalRotations()).toContain(deg); // greedy fallback is still legal

    const placeState = { ...g, phase: 'place' as const };
    const placement = await agent.choosePlacement(placeState, rng0);
    const legal = legalPlacements(placeState);
    expect(legal).toContainEqual(placement);
  });

  it('calls the model and returns a legal placement on a real state', async () => {
    let called = false;
    const complete: Complete = () => {
      called = true;
      return Promise.resolve('{"index": 0}');
    };
    const g = newGame(2, rng0);
    const agent = llmAgent({ complete });
    const placement = await agent.choosePlacement({ ...g, phase: 'place' }, rng0);
    expect(placement).not.toBeNull();
    expect(called).toBe(true);
  });
});
