import { describe, it, expect } from 'vitest';
import { parse, serialize } from '../src/game/io';
import { newGame } from '../src/game/setup';
import { makePlacement } from '../src/game/rules';
import type { GameState, Rug } from '../src/game/types';

// A fresh 2-player game (Assam faces N), empty board. 2 players start with 24 rugs.
const EMPTY_BOARD = 'B' + 'n00'.repeat(49);
const NEW_GAME_STR = 'Pc03024iPy03024iA33N' + EMPTY_BOARD;

function rug(colour: Rug['colour'], id: number, a: [number, number], b: [number, number]): Rug {
  return { colour, id, squares: [{ col: a[0], row: a[1] }, { col: b[0], row: b[1] }] };
}

describe('serialize', () => {
  it('renders a fresh game exactly in the Java format', () => {
    expect(serialize(newGame(2, () => 0))).toBe(NEW_GAME_STR);
  });
});

describe('parse', () => {
  it('reads players, Assam and an empty board', () => {
    const g = parse(NEW_GAME_STR);
    expect(g.players).toEqual([
      { colour: 'c', dirhams: 30, rugsLeft: 24, out: false },
      { colour: 'y', dirhams: 30, rugsLeft: 24, out: false },
    ]);
    expect(g.assam).toEqual({ pos: { col: 3, row: 3 }, facing: 'N' });
    expect(g.board.flat().every((c) => c === null)).toBe(true);
  });

  it('reads a board cell back to the right square (col-major)', () => {
    // place a rug, serialize, parse, and check the painted squares survive
    let g: GameState = { ...newGame(2, () => 0), assam: { pos: { col: 3, row: 3 }, facing: 'N' } };
    g = makePlacement(g, rug('c', 7, [3, 4], [3, 5]));
    const round = parse(serialize(g));
    expect(round.board[3][4]).toEqual({ colour: 'c', rugId: 7 });
    expect(round.board[3][5]).toEqual({ colour: 'c', rugId: 7 });
  });
});

describe('round-trip', () => {
  it('serialize(parse(str)) === str for a fresh game', () => {
    expect(serialize(parse(NEW_GAME_STR))).toBe(NEW_GAME_STR);
  });

  it('survives a string with placed rugs and an out player', () => {
    const str = 'Pc02814iPy03015oA12E' + 'B' + 'c07' + 'c07' + 'n00'.repeat(47);
    expect(serialize(parse(str))).toBe(str);
  });

  it('rebuilds a rug from its two visible squares', () => {
    let g: GameState = { ...newGame(2, () => 0), assam: { pos: { col: 3, row: 3 }, facing: 'N' } };
    g = makePlacement(g, rug('y', 3, [3, 2], [4, 2]));
    const round = parse(serialize(g));
    const r = round.rugs.find((x) => x.colour === 'y' && x.id === 3)!;
    expect(r.squares).toHaveLength(2);
    expect(new Set(r.squares.map((s) => `${s.col},${s.row}`))).toEqual(new Set(['3,2', '4,2']));
  });
});
