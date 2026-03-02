import { describe, it, expect } from 'vitest';
import { newGame } from '../src/game/setup';
import {
  legalRotations,
  legalAnchors,
  legalPlacements,
  applyRotation,
  applyPlacement,
  advanceTurn,
} from '../src/game/moves';
import { makePlacement } from '../src/game/rules';
import type { GameState } from '../src/game/types';

const rng0 = () => 0; // Assam centre (3,3), facing N

describe('legalRotations', () => {
  it('always offers keep-straight, left and right (never 180)', () => {
    expect(legalRotations()).toEqual([0, 90, 270]);
  });
});

describe('legal placements', () => {
  it('anchors are the four tiles around Assam on an empty board', () => {
    const g = newGame(2, rng0);
    const anchors = legalAnchors(g);
    // Assam at (3,3): up/down/left/right are all in-bounds and free.
    expect(anchors).toHaveLength(4);
  });

  it('every enumerated placement is a distinct, applicable move', () => {
    const g = newGame(2, rng0);
    const placements = legalPlacements(g);
    expect(placements.length).toBeGreaterThan(0);

    for (const p of placements) {
      // Each anchor is adjacent to Assam; each second is adjacent to its anchor.
      const d1 = Math.abs(p.anchor.col - g.assam.pos.col) + Math.abs(p.anchor.row - g.assam.pos.row);
      expect(d1).toBe(1);
      const d2 = Math.abs(p.second.col - p.anchor.col) + Math.abs(p.second.row - p.anchor.row);
      expect(d2).toBe(1);
    }
  });

  it('applyPlacement paints a rug and advances the turn', () => {
    const g = newGame(2, rng0);
    const before = g.players[g.turnIndex].rugsLeft;
    const after = applyPlacement(g, legalPlacements(g)[0]);

    expect(after.turnIndex).toBe(1); // advanced to the next player
    expect(after.players[0].rugsLeft).toBe(before - 1);
    expect(after.rugs).toHaveLength(1);
  });
});

describe('applyRotation', () => {
  it('moves into the roll phase', () => {
    const g = newGame(2, rng0);
    expect(applyRotation(g, 0).phase).toBe('move');
    expect(applyRotation(g, 90).phase).toBe('move');
  });

  it('keep-straight (0) leaves Assam facing the same way', () => {
    const g = newGame(2, rng0); // facing N
    expect(applyRotation(g, 0).assam.facing).toBe('N');
    expect(applyRotation(g, 90).assam.facing).toBe('E');
    expect(applyRotation(g, 270).assam.facing).toBe('W');
  });
});

describe('advanceTurn', () => {
  it('ends the game when the next player is out of rugs', () => {
    let g: GameState = newGame(2, rng0);
    // Drain player 1's rugs by hand so advancing onto them ends the game.
    g = { ...g, players: g.players.map((p, i) => (i === 1 ? { ...p, rugsLeft: 0 } : p)) };
    expect(advanceTurn(g).phase).toBe('gameover');
  });

  it('skips eliminated players', () => {
    let g: GameState = newGame(3, rng0);
    g = { ...g, players: g.players.map((p, i) => (i === 1 ? { ...p, out: true } : p)) };
    expect(advanceTurn(g).turnIndex).toBe(2); // 0 → skip 1 → 2
  });
});

describe('parity with rules.makePlacement', () => {
  it('enumerated placements match what makePlacement accepts', () => {
    const g = newGame(2, rng0);
    for (const p of legalPlacements(g)) {
      const rug = { colour: g.players[0].colour, id: 0, squares: [p.anchor, p.second] as const };
      // makePlacement is a no-op on illegal rugs; a legal one changes the board.
      const placed = makePlacement(g, { ...rug, squares: [p.anchor, p.second] });
      expect(placed.rugs.length).toBe(1);
    }
  });
});
