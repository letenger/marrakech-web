import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  assamAfterMove,
  assamPath,
  rollDie,
  rotateAssam,
  isRugValid,
  isPlacementValid,
  makePlacement,
  getPaymentAmount,
  isGameOver,
  getWinner,
} from '../src/game/rules';
import { newGame } from '../src/game/setup';
import type { Assam, Facing, GameState, Rug } from '../src/game/types';

const here = dirname(fileURLToPath(import.meta.url));

// --- tiny "Axyf" helpers (the Java Assam string), test-local on purpose ---
function parseAssam(s: string): Assam {
  return { pos: { col: +s[1], row: +s[2] }, facing: s[3] as Facing };
}
function formatAssam(a: Assam): string {
  return `A${a.pos.col}${a.pos.row}${a.facing}`;
}

function loadCases(file: string): { assam: string; die: number; expected: string }[] {
  return readFileSync(join(here, 'fixtures', file), 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const [assam, die, expected] = l.split('@');
      return { assam, die: Number(die), expected };
    });
}

describe('rollDie', () => {
  it('maps each of the 6 die faces to 1,2,2,3,3,4', () => {
    const faces = [1, 2, 2, 3, 3, 4];
    for (let i = 0; i < 6; i++) {
      const rng = () => (i + 0.5) / 6; // lands squarely in slot i
      expect(rollDie(rng)).toBe(faces[i]);
    }
  });

  it('only ever returns 1..4', () => {
    for (let n = 0; n < 100; n++) {
      const v = rollDie(() => n / 100);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4);
    }
  });
});

describe('rotateAssam', () => {
  const base = newGame(2, () => 0); // Assam faces N
  it('turns right (90) clockwise', () => {
    expect(rotateAssam(base, 90).assam.facing).toBe('E');
  });
  it('turns left (270) anticlockwise', () => {
    expect(rotateAssam(base, 270).assam.facing).toBe('W');
  });
  it('refuses a 180 turn and a 0 turn (unchanged)', () => {
    expect(rotateAssam(base, 180).assam.facing).toBe('N');
    expect(rotateAssam(base, 0).assam.facing).toBe('N');
  });
});

describe('moveAssam — simple (no edge) against real test data', () => {
  it('matches every simple case', () => {
    for (const c of loadCases('assam_movement_simple.txt')) {
      const got = formatAssam(assamAfterMove(parseAssam(c.assam), c.die));
      expect(got, `${c.assam} +${c.die}`).toBe(c.expected);
    }
  });
});

describe('moveAssam — complex (edge wrap) against real test data', () => {
  it('matches every edge/corner case', () => {
    for (const c of loadCases('assam_movement_complex.txt')) {
      const got = formatAssam(assamAfterMove(parseAssam(c.assam), c.die));
      expect(got, `${c.assam} +${c.die}`).toBe(c.expected);
    }
  });
});

describe('assamPath — cell-by-cell walk lands where a single move does', () => {
  it('final step equals assamAfterMove for every fixture case', () => {
    for (const file of ['assam_movement_simple.txt', 'assam_movement_complex.txt']) {
      for (const c of loadCases(file)) {
        const start = parseAssam(c.assam);
        const path = assamPath(start, c.die);
        expect(path, `${c.assam} +${c.die} step count`).toHaveLength(c.die);
        expect(formatAssam(path[path.length - 1]), `${c.assam} +${c.die}`).toBe(c.expected);
      }
    }
  });
});

// --- helpers for placement/payment/scoring tests ---
function rug(colour: Rug['colour'], id: number, a: [number, number], b: [number, number]): Rug {
  return { colour, id, squares: [{ col: a[0], row: a[1] }, { col: b[0], row: b[1] }] };
}
function withAssam(state: GameState, col: number, row: number): GameState {
  return { ...state, assam: { ...state.assam, pos: { col, row } } };
}

describe('rug placement', () => {
  const game = withAssam(newGame(2, () => 0), 3, 3); // Assam at (3,3)

  it('accepts a rug edge-adjacent to Assam', () => {
    const r = rug('c', 1, [3, 4], [3, 5]); // (3,4) is adjacent to (3,3)
    expect(isPlacementValid(game, r)).toBe(true);
    expect(isRugValid(game, r)).toBe(true);
  });

  it('rejects a rug not adjacent to Assam', () => {
    expect(isPlacementValid(game, rug('c', 1, [0, 0], [0, 1]))).toBe(false);
  });

  it('rejects a rug sitting on Assam', () => {
    expect(isPlacementValid(game, rug('c', 1, [3, 3], [3, 4]))).toBe(false);
  });

  it('makePlacement paints both squares and spends a rug', () => {
    const after = makePlacement(game, rug('c', 1, [3, 4], [3, 5]));
    expect(after.board[3][4]).toEqual({ colour: 'c', rugId: 1 });
    expect(after.board[3][5]).toEqual({ colour: 'c', rugId: 1 });
    // 2-player game starts with 24 rugs; placing one leaves 23.
    expect(after.players.find((p) => p.colour === 'c')!.rugsLeft).toBe(23);
    expect(after.rugs).toHaveLength(1);
  });

  it('rejects a duplicate (colour,id) once placed', () => {
    const after = makePlacement(game, rug('c', 1, [3, 4], [3, 5]));
    expect(isRugValid(after, rug('c', 1, [2, 3], [2, 4]))).toBe(false);
    expect(isRugValid(after, rug('y', 1, [2, 3], [2, 4]))).toBe(true); // same id, other colour ok
  });

  it('makePlacement returns the game unchanged for an illegal placement', () => {
    const bad = rug('c', 1, [0, 0], [0, 1]); // not adjacent
    expect(makePlacement(game, bad)).toBe(game);
  });

  it('refuses to fully bury an existing single rug', () => {
    const after = makePlacement(game, rug('c', 1, [3, 4], [3, 5])); // covers (3,4)+(3,5)
    const a2 = withAssam(after, 3, 3);
    // a rug covering exactly (3,4)+(3,5) would bury rug c1 entirely -> illegal
    expect(isPlacementValid(a2, rug('y', 2, [3, 4], [3, 5]))).toBe(false);
  });
});

describe('getPaymentAmount', () => {
  it('is 0 on bare sand', () => {
    const game = withAssam(newGame(2, () => 0), 3, 3);
    expect(getPaymentAmount(game)).toBe(0);
  });

  it('counts the connected same-colour region under Assam', () => {
    let game = withAssam(newGame(2, () => 0), 3, 3);
    game = makePlacement(game, rug('c', 1, [3, 4], [3, 5])); // two connected c squares
    game = withAssam(game, 3, 4); // land Assam on the rug
    expect(getPaymentAmount(game)).toBe(2);
  });
});

describe('isGameOver / getWinner', () => {
  it('not over while a player still holds rugs', () => {
    const game = newGame(2, () => 0);
    expect(isGameOver(game)).toBe(false);
    expect(getWinner(game)).toBe('none');
  });

  it('over when every in-player has no rugs; winner by score then dirhams', () => {
    const game = newGame(2, () => 0);
    const over: GameState = {
      ...game,
      players: [
        { colour: 'c', dirhams: 40, rugsLeft: 0, out: false },
        { colour: 'y', dirhams: 20, rugsLeft: 0, out: false },
      ],
    };
    expect(isGameOver(over)).toBe(true);
    expect(getWinner(over)).toBe('c');
  });

  it('declares a tie on equal score and dirhams', () => {
    const game = newGame(2, () => 0);
    const tie: GameState = {
      ...game,
      players: [
        { colour: 'c', dirhams: 30, rugsLeft: 0, out: false },
        { colour: 'y', dirhams: 30, rugsLeft: 0, out: false },
      ],
    };
    expect(getWinner(tie)).toBe('tie');
  });
});
