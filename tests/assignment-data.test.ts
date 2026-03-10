// Safety net: run the original COMP1110 assignment test data through the pure
// TS rules, to prove the port reproduces the Java game semantics.
// Fixtures are lean samples of the assignment data (see tests/fixtures).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse, parseRug, serialize } from './helpers/gameString';
import {
  getPaymentAmount,
  isPlacementValid,
  isRugValid,
  makePlacement,
  isGameOver,
  getWinner,
} from '@marrakech/engine';

const here = dirname(fileURLToPath(import.meta.url));

function lines(file: string): string[] {
  return readFileSync(join(here, 'fixtures', file), 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}

// Run every line; report the first mismatch with its case so failures are legible.
function checkAll(file: string, run: (cols: string[]) => { got: unknown; want: unknown }) {
  const all = lines(file);
  for (const line of all) {
    const cols = line.split('@');
    const { got, want } = run(cols);
    expect(got, line.slice(0, 80)).toEqual(want);
  }
  return all.length;
}

describe('getPaymentAmount vs assignment data', () => {
  it('counts connected same-colour squares under Assam', () => {
    const n = checkAll('get_payment.txt', ([game, amount]) => ({
      got: getPaymentAmount(parse(game)),
      want: Number(amount),
    }));
    expect(n).toBeGreaterThan(100);
  });
});

describe('isPlacementValid vs assignment data', () => {
  for (const file of ['is_placement_valid_simple.txt', 'is_placement_valid_complex.txt']) {
    it(file, () => {
      checkAll(file, ([game, rug, expected]) => {
        const r = parseRug(rug);
        return { got: r ? isPlacementValid(parse(game), r) : false, want: expected === 'true' };
      });
    });
  }
});

describe('isRugValid vs assignment data', () => {
  for (const file of [
    'is_rug_valid_simple.txt',
    'is_rug_valid_duplicate.txt',
    'is_rug_valid_badplayer.txt',
    'is_rug_valid_offboard.txt',
  ]) {
    it(file, () => {
      checkAll(file, ([game, rug, expected]) => {
        const r = parseRug(rug);
        return { got: r ? isRugValid(parse(game), r) : false, want: expected === 'true' };
      });
    });
  }
});

describe('makePlacement vs assignment data (also exercises parse+serialize)', () => {
  it('valid placements produce the expected game string', () => {
    checkAll('make_placement_valid.txt', ([game, rug, expected]) => {
      const r = parseRug(rug);
      const next = r ? makePlacement(parse(game), r) : parse(game);
      return { got: serialize(next), want: expected };
    });
  });

  it('illegal (fully-covering) placements leave the game unchanged', () => {
    checkAll('make_placement_invalid_covering.txt', ([game, rug, expected]) => {
      const r = parseRug(rug);
      const next = r ? makePlacement(parse(game), r) : parse(game);
      return { got: serialize(next), want: expected };
    });
  });
});

describe('isGameOver vs assignment data', () => {
  it('detects whether every in-player is out of rugs', () => {
    checkAll('is_game_over.txt', ([game, expected]) => ({
      got: isGameOver(parse(game)),
      want: expected === 'true',
    }));
  });
});

describe('getWinner vs assignment data', () => {
  // map our return value onto the assignment's single-char convention
  const toChar = (w: string) => (w === 'tie' ? 't' : w === 'none' ? 'n' : w);
  for (const file of ['get_winner_simple.txt', 'get_winner_complex.txt', 'get_winner_out_of_game.txt']) {
    it(file, () => {
      checkAll(file, ([game, expected]) => ({
        got: toChar(getWinner(parse(game))),
        want: expected,
      }));
    });
  }
});
