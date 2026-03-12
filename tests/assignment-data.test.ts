// Safety net: run the original COMP1110 assignment test data through the pure
// TS rules, to prove the port reproduces the Java game semantics. Each fixture
// row becomes its own named `it.each` case, so a failure pinpoints exactly which
// case broke (not just "the first one"). Fixtures use the lossy game-string
// format — see tests/helpers/gameString.ts for why that's safe here.
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

// One case per non-blank fixture line: its @-split columns plus a scannable name.
type Case = { name: string; cols: string[] };
function casesOf(file: string): Case[] {
  return readFileSync(join(here, 'fixtures', file), 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line, i) => ({ name: `${file} #${i + 1}`, cols: line.split('@') }));
}

// The game-string encodes only board + players + assam. parse() fills turnIndex
// and phase with fixed placeholders; this canary pins that contract so nobody
// later makes parse() pretend to carry them (which would silently break fixtures
// whose expected output must not depend on turn/phase). See gameString.ts.
describe('game-string placeholder contract', () => {
  it('parse() returns turnIndex:0 / phase:rotate (never assert on these)', () => {
    const g = parse('Pc03015iPy03015iA33NB' + 'n00'.repeat(49));
    expect(g.turnIndex).toBe(0);
    expect(g.phase).toBe('rotate');
  });
});

describe('getPaymentAmount vs assignment data', () => {
  it.each(casesOf('get_payment.txt'))('$name', ({ cols: [game, amount] }) => {
    expect(getPaymentAmount(parse(game))).toBe(Number(amount));
  });
});

describe('isPlacementValid vs assignment data', () => {
  for (const file of ['is_placement_valid_simple.txt', 'is_placement_valid_complex.txt']) {
    it.each(casesOf(file))('$name', ({ cols: [game, rug, expected] }) => {
      const r = parseRug(rug);
      expect(r ? isPlacementValid(parse(game), r) : false).toBe(expected === 'true');
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
    it.each(casesOf(file))('$name', ({ cols: [game, rug, expected] }) => {
      const r = parseRug(rug);
      expect(r ? isRugValid(parse(game), r) : false).toBe(expected === 'true');
    });
  }
});

describe('makePlacement vs assignment data (also exercises parse+serialize)', () => {
  it.each(casesOf('make_placement_valid.txt'))('valid $name', ({ cols: [game, rug, expected] }) => {
    const r = parseRug(rug);
    const next = r ? makePlacement(parse(game), r) : parse(game);
    expect(serialize(next)).toBe(expected);
  });

  it.each(casesOf('make_placement_invalid_covering.txt'))('invalid $name', ({ cols: [game, rug, expected] }) => {
    const r = parseRug(rug);
    const next = r ? makePlacement(parse(game), r) : parse(game);
    expect(serialize(next)).toBe(expected);
  });
});

describe('isGameOver vs assignment data', () => {
  it.each(casesOf('is_game_over.txt'))('$name', ({ cols: [game, expected] }) => {
    expect(isGameOver(parse(game))).toBe(expected === 'true');
  });
});

describe('getWinner vs assignment data', () => {
  // map our return value onto the assignment's single-char convention
  const toChar = (w: string) => (w === 'tie' ? 't' : w === 'none' ? 'n' : w);
  for (const file of ['get_winner_simple.txt', 'get_winner_complex.txt', 'get_winner_out_of_game.txt']) {
    it.each(casesOf(file))('$name', ({ cols: [game, expected] }) => {
      expect(toChar(getWinner(parse(game)))).toBe(expected);
    });
  }
});
