// Pure agents remain reproducible when the caller supplies a seeded RNG.
import type { Agent } from './agent';
import { pick } from './agent';
import { DIE_DISTRIBUTION, scoreOf, moveAssam, settlePayment } from '../rules';
import {
  legalRotations,
  legalPlacements,
  applyRotation,
  applyPlacement,
} from '../moves';
import type { GameState, Player } from '../types';

function heuristic(state: GameState, me: Player['colour']): number {
  const mine = state.players.find((p) => p.colour === me)!;
  if (mine.out) return -Infinity;
  const myScore = scoreOf(state, mine);
  let bestOpp = -Infinity;
  for (const p of state.players) {
    if (p.colour === me || p.out) continue;
    bestOpp = Math.max(bestOpp, scoreOf(state, p));
  }
  return myScore - (bestOpp === -Infinity ? 0 : bestOpp);
}

export const randomAgent: Agent = {
  name: 'random',
  chooseRotation: (_state, rng) => pick(legalRotations(), rng),
  choosePlacement: (state, rng) => {
    const moves = legalPlacements(state);
    return moves.length ? pick(moves, rng) : null;
  },
};

export const greedyAgent: Agent = {
  name: 'greedy',
  chooseRotation: (state, _rng) => {
    const me = state.players[state.turnIndex].colour;
    let best = legalRotations()[0];
    let bestVal = -Infinity;
    for (const deg of legalRotations()) {
      const rotated = applyRotation(state, deg);
      let ev = 0;
      for (const { value, p } of DIE_DISTRIBUTION) {
        const landed = settlePayment(moveAssam(rotated, value)).state;
        ev += p * heuristic(landed, me);
      }
      if (ev > bestVal) {
        bestVal = ev;
        best = deg;
      }
    }
    return best;
  },
  choosePlacement: (state, _rng) => {
    const me = state.players[state.turnIndex].colour;
    const moves = legalPlacements(state);
    if (!moves.length) return null;
    let best = moves[0];
    let bestVal = -Infinity;
    for (const move of moves) {
      const val = heuristic(applyPlacement(state, move), me);
      if (val > bestVal) {
        bestVal = val;
        best = move;
      }
    }
    return best;
  },
};

// Depth two keeps expectiminimax responsive in the browser. Chance nodes use
// the real die distribution; player decisions alternate max/min perspective.
const DEPTH = 2;

function searchPlacementValue(state: GameState, me: Player['colour'], depth: number): number {
  const maximizing = state.players[state.turnIndex].colour === me;
  const moves = legalPlacements(state);
  if (!moves.length) {
    const passed = applyPlacement(state, { anchor: state.assam.pos, second: state.assam.pos });
    return depth <= 0 ? heuristic(passed, me) : rotateValue(passed, me, depth - 1);
  }
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const next = applyPlacement(state, move);
    const val = depth <= 0 ? heuristic(next, me) : rotateValue(next, me, depth - 1);
    best = maximizing ? Math.max(best, val) : Math.min(best, val);
  }
  return best;
}

function rotateValue(state: GameState, me: Player['colour'], depth: number): number {
  if (state.phase === 'gameover') return heuristic(state, me);
  const maximizing = state.players[state.turnIndex].colour === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const deg of legalRotations()) {
    const rotated = applyRotation(state, deg);
    let ev = 0;
    for (const { value, p } of DIE_DISTRIBUTION) {
      const landed = settlePayment(moveAssam(rotated, value)).state;
      ev += p * searchPlacementValue({ ...landed, phase: 'place' }, me, depth);
    }
    best = maximizing ? Math.max(best, ev) : Math.min(best, ev);
  }
  return best;
}

export const searchAgent: Agent = {
  name: 'search',
  chooseRotation: (state, _rng) => {
    const me = state.players[state.turnIndex].colour;
    let best = legalRotations()[0];
    let bestVal = -Infinity;
    for (const deg of legalRotations()) {
      const rotated = applyRotation(state, deg);
      let ev = 0;
      for (const { value, p } of DIE_DISTRIBUTION) {
        const landed = settlePayment(moveAssam(rotated, value)).state;
        ev += p * searchPlacementValue({ ...landed, phase: 'place' }, me, DEPTH - 1);
      }
      if (ev > bestVal) {
        bestVal = ev;
        best = deg;
      }
    }
    return best;
  },
  choosePlacement: (state, _rng) => {
    const me = state.players[state.turnIndex].colour;
    const moves = legalPlacements(state);
    if (!moves.length) return null;
    let best = moves[0];
    let bestVal = -Infinity;
    for (const move of moves) {
      const next = applyPlacement(state, move);
      const val = rotateValue(next, me, DEPTH - 1);
      if (val > bestVal) {
        bestVal = val;
        best = move;
      }
    }
    return best;
  },
};

export const AGENTS: Record<string, Agent> = {
  random: randomAgent,
  greedy: greedyAgent,
  search: searchAgent,
};
