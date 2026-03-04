import { describe, it, expect } from 'vitest';
import {
  newGame,
  randomAgent,
  greedyAgent,
  searchAgent,
  AGENTS,
  legalRotations,
  legalPlacements,
  applyRotation,
  applyPlacement,
  moveAssam,
  rollDie,
  settlePayment,
  isGameOver,
  type Agent,
  type GameState,
} from '@marrakech/engine';

// A deterministic rng so an agent's tie-breaking is reproducible in tests.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const ALL: Agent[] = [randomAgent, greedyAgent, searchAgent];

describe('agent contract', () => {
  for (const agent of ALL) {
    it(`${agent.name}: chooseRotation returns a legal rotation`, () => {
      const g = newGame(3, seeded(1));
      const deg = agent.chooseRotation(g, seeded(2));
      expect(legalRotations()).toContain(deg);
    });

    it(`${agent.name}: choosePlacement returns a legal placement or null`, () => {
      const g = { ...newGame(3, seeded(1)), phase: 'place' as const };
      const placement = agent.choosePlacement(g, seeded(2));
      if (placement === null) {
        expect(legalPlacements(g)).toHaveLength(0);
      } else {
        const matches = legalPlacements(g).some(
          (p) =>
            p.anchor.col === placement.anchor.col &&
            p.anchor.row === placement.anchor.row &&
            p.second.col === placement.second.col &&
            p.second.row === placement.second.row,
        );
        expect(matches).toBe(true);
      }
    });
  }
});

describe('determinism', () => {
  it('same state + same seed → same choice', () => {
    const g = newGame(4, seeded(7));
    expect(searchAgent.chooseRotation(g, seeded(99))).toBe(
      searchAgent.chooseRotation(g, seeded(99)),
    );
  });
});

// Drive a full game between two agents through the real engine — proves the
// agents always produce engine-legal moves and that games terminate.
function playGame(a: Agent, b: Agent, seed: number): GameState {
  const agents = [a, b];
  const rng = seeded(seed);
  let state = newGame(2, rng);
  let guard = 0;

  while (!isGameOver(state) && state.phase !== 'gameover' && guard++ < 5000) {
    const agent = agents[state.turnIndex % 2];
    // rotate
    const deg = agent.chooseRotation(state, rng);
    state = applyRotation(state, deg);
    // roll + walk + settle rent
    const die = rollDie(rng);
    state = settlePayment(moveAssam(state, die)).state;
    if (state.players[state.turnIndex].out) {
      // mover went bankrupt — treat as placement phase that just advances
      state = { ...state, phase: 'place' };
    } else {
      state = { ...state, phase: 'place' };
    }
    // place
    const placement = agent.choosePlacement(state, rng);
    state = placement
      ? applyPlacement(state, placement)
      : applyPlacement(state, { anchor: state.assam.pos, second: state.assam.pos }); // no legal move → turn passes
  }
  return state;
}

describe('full games terminate', () => {
  it('random vs random reaches game over', () => {
    const final = playGame(randomAgent, randomAgent, 123);
    expect(final.phase === 'gameover' || isGameOver(final)).toBe(true);
  });

  it('greedy vs random reaches game over', () => {
    const final = playGame(greedyAgent, randomAgent, 456);
    expect(final.phase === 'gameover' || isGameOver(final)).toBe(true);
  });
});

describe('registry', () => {
  it('exposes the three agents by name', () => {
    expect(Object.keys(AGENTS).sort()).toEqual(['greedy', 'random', 'search']);
  });
});
