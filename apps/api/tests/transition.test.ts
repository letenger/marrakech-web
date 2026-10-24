import { describe, expect, it } from 'vitest';
import { legalPlacements, newGame, transitionGame, winnerOf } from '@marrakech/engine';

describe('authoritative game transitions', () => {
 for (const count of [2, 3, 4]) {
  it(`finishes a legal ${count}-player match without mutating accepted snapshots`, () => {
   let state = newGame(count, () => 0);
   for (let step = 0; step < 1000 && state.phase !== 'gameover'; step++) {
    const before = JSON.stringify(state);
    const action = state.phase === 'rotate' ? { type: 'rotate' as const, rotation: 0 as const }
     : state.phase === 'move' ? { type: 'roll' as const }
     : { type: 'place' as const, placement: legalPlacements(state)[0] };
    const result = transitionGame(state, action, () => 0.5);
    expect(JSON.stringify(state)).toBe(before);
    state = result.state;
   }
   expect(state.phase).toBe('gameover');
   expect(['c', 'y', 'r', 'p', 'tie']).toContain(winnerOf(state));
   expect(state.players.every(p => p.rugsLeft >= 0 && p.dirhams >= 0)).toBe(true);
  });
 }
 it('rejects out-of-phase and disconnected rug-square actions without advancing', () => {
  const state = newGame(2, () => 0);
  expect(() => transitionGame(state, { type: 'roll' }, () => 0)).toThrow();
  const placing = { ...state, phase: 'place' as const };
  expect(() => transitionGame(placing, { type: 'place', placement: { anchor: { col: 3, row: 2 }, second: { col: 0, row: 0 } } }, () => 0)).toThrow();
  expect(placing.turnIndex).toBe(0);
  expect(placing.rugs).toHaveLength(0);
 });
 it('settles rent and skips rug placement for a bankrupt player', () => {
  const state = newGame(3, () => 0);
  state.phase = 'move';
  state.players[0].dirhams = 0;
  state.board[3][2] = { colour: 'y', rugId: 0 };
  const result = transitionGame(state, { type: 'roll' }, () => 0).state;
  expect(result.players[0].out).toBe(true);
  expect(result.turnIndex).toBe(1);
  expect(result.phase).toBe('rotate');
 });
});
