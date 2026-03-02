// Algorithmic agents, weakest to strongest. All are pure: given the same state
// and a seeded rng they make the same choice, so the eval harness reproduces.
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

// --- shared evaluation ---------------------------------------------------

// How good `state` looks for the player whose colour is `me`: my score minus
// the strongest opponent's. Positive means I'm ahead. Out players score -inf
// from their own seat so the agent avoids bankrupting itself.
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

// --- random --------------------------------------------------------------

export const randomAgent: Agent = {
  name: 'random',
  chooseRotation: (_state, rng) => pick(legalRotations(), rng),
  choosePlacement: (state, rng) => {
    const moves = legalPlacements(state);
    return moves.length ? pick(moves, rng) : null;
  },
};

// --- greedy --------------------------------------------------------------
// Looks one ply ahead with no opponent model: for rotation, averages the
// heuristic over the die distribution; for placement, picks the best immediate
// board. Fast and surprisingly competent.

export const greedyAgent: Agent = {
  name: 'greedy',
  chooseRotation: (state, _rng) => {
    const me = state.players[state.turnIndex].colour;
    let best = legalRotations()[0];
    let bestVal = -Infinity;
    for (const deg of legalRotations()) {
      const rotated = applyRotation(state, deg);
      // Expected value over the die, settling rent at each landing.
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

// --- expectiminimax ------------------------------------------------------
// Depth-limited search where the die is a chance node weighted by the real
// 1/2/2/3/3/4 distribution. The mover maximises the heuristic; we model the
// turn structure (rotate → chance → place) and look DEPTH plies ahead.

const DEPTH = 2; // plies of (rotate+place) lookahead; kept small for speed

// Value of the position once Assam has landed and it is time to place a rug.
// The mover at this node maximises my advantage if it's my turn, and minimises
// it if it's an opponent's (they play for themselves) — proper minimax, not the
// optimistic max-everywhere that makes deeper search play worse.
function searchPlacementValue(state: GameState, me: Player['colour'], depth: number): number {
  const maximizing = state.players[state.turnIndex].colour === me;
  const moves = legalPlacements(state);
  if (!moves.length) {
    // No legal placement: the turn passes. Evaluate the advanced state.
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

// Value of being at a 'rotate' decision: the mover optimises over rotations
// (max for me, min for an opponent), then we take the die expectation, then the
// best placement. The chance node always averages, whoever is moving.
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
