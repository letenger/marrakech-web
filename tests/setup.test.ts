import { describe, it, expect } from 'vitest';
import { newGame, INITIAL_DIRHAMS, rugsForPlayers } from '../src/game/setup';
import { BOARD_SIZE } from '../src/game/types';

// A fake rng that always returns 0 -> picks the first option every time.
const rng0 = () => 0;

describe('newGame', () => {
  it('creates the requested number of players with the right colours', () => {
    expect(newGame(2, rng0).players.map((p) => p.colour)).toEqual(['c', 'y']);
    expect(newGame(4, rng0).players.map((p) => p.colour)).toEqual(['c', 'y', 'r', 'p']);
  });

  it('gives every player the starting dirhams and no eliminations', () => {
    for (const p of newGame(4, rng0).players) {
      expect(p.dirhams).toBe(INITIAL_DIRHAMS);
      expect(p.out).toBe(false);
    }
  });

  it('hands out rugs by player count, matching the physical game (24/15/12)', () => {
    expect(rugsForPlayers(2)).toBe(24);
    expect(rugsForPlayers(3)).toBe(15);
    expect(rugsForPlayers(4)).toBe(12);
    for (const [count, rugs] of [[2, 24], [3, 15], [4, 12]] as const) {
      expect(newGame(count, rng0).players.every((p) => p.rugsLeft === rugs)).toBe(true);
    }
  });

  it('places Assam in the centre, facing per the rng (0 -> North)', () => {
    const g = newGame(2, rng0);
    expect(g.assam.pos).toEqual({ col: 3, row: 3 });
    expect(g.assam.facing).toBe('N');
  });

  it('starts with an empty 7x7 board and no placed rugs', () => {
    const g = newGame(2, rng0);
    expect(g.board.length).toBe(BOARD_SIZE);
    expect(g.board.every((col) => col.length === BOARD_SIZE)).toBe(true);
    expect(g.board.flat().every((cell) => cell === null)).toBe(true);
    expect(g.rugs).toEqual([]);
  });

  it('starts on player 0 in the rotate phase', () => {
    const g = newGame(3, rng0);
    expect(g.turnIndex).toBe(0);
    expect(g.phase).toBe('rotate');
  });

  it('rejects an illegal player count', () => {
    expect(() => newGame(1, rng0)).toThrow();
    expect(() => newGame(5, rng0)).toThrow();
  });
});
