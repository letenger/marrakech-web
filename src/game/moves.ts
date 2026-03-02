// Legal-move enumeration and application — the single source of truth for
// "what can a player do?", shared by the UI, the AI agents, and the eval
// harness. Pure: every apply* function returns a new GameState.
//
// A Marrakech turn has two decision points with a chance event between them:
//   rotate (choose) → roll the die (chance) → place a rug (choose)
// so moves are enumerated in two families: rotations and placements.
import { inBounds, isAdjacent } from './board';
import {
  isPlacementValid,
  isRugValid,
  makePlacement,
  nextRugId,
  rotateAssam,
} from './rules';
import type { Coord, GameState, Rug } from './types';

// A rotation choice in degrees. 180 is never legal (Assam can't spin a full
// half-turn); 0 means "keep straight".
export type RotateChoice = 0 | 90 | 270;

// A rug placement: an anchor square next to Assam plus the partner it extends to.
export type Placement = { anchor: Coord; second: Coord };

const neighbours = (c: Coord): Coord[] => [
  { col: c.col + 1, row: c.row },
  { col: c.col - 1, row: c.row },
  { col: c.col, row: c.row + 1 },
  { col: c.col, row: c.row - 1 },
];

// The candidate rug for the current player covering squares a and b.
export function candidateRug(state: GameState, a: Coord, b: Coord): Rug {
  const colour = state.players[state.turnIndex].colour;
  return { colour, id: nextRugId(state, colour), squares: [a, b] };
}

function validPair(state: GameState, a: Coord, b: Coord): boolean {
  const rug = candidateRug(state, a, b);
  return isPlacementValid(state, rug) && isRugValid(state, rug);
}

// The rotations available to the mover. 90 and 270 are always options; 0 is too,
// but a forward roll after 0 is only meaningful relative to current facing — we
// keep all three so the die step is independent of the rotation choice.
export function legalRotations(): RotateChoice[] {
  return [0, 90, 270];
}

// Tiles next to Assam that can anchor at least one legal rug.
export function legalAnchors(state: GameState): Coord[] {
  return neighbours(state.assam.pos).filter(
    (a) => inBounds(a) && neighbours(a).some((b) => validPair(state, a, b)),
  );
}

// Given a chosen anchor, the partner tiles the rug can extend onto.
export function legalSeconds(state: GameState, anchor: Coord): Coord[] {
  return neighbours(anchor).filter((b) => validPair(state, anchor, b));
}

// Every legal (anchor, second) placement for the current player.
export function legalPlacements(state: GameState): Placement[] {
  const out: Placement[] = [];
  for (const anchor of legalAnchors(state)) {
    for (const second of legalSeconds(state, anchor)) {
      out.push({ anchor, second });
    }
  }
  return out;
}

// Advance to the next active player, or end the game. (Lifted from the UI so
// agents and evals share the exact turn-advance + game-over logic.)
export function advanceTurn(state: GameState): GameState {
  const active = state.players.filter((p) => !p.out);
  if (active.length <= 1) return { ...state, phase: 'gameover' };

  let idx = state.turnIndex;
  for (let k = 0; k < state.players.length; k++) {
    idx = (idx + 1) % state.players.length;
    if (!state.players[idx].out) break;
  }
  if (state.players[idx].rugsLeft === 0) return { ...state, turnIndex: idx, phase: 'gameover' };
  return { ...state, turnIndex: idx, phase: 'rotate' };
}

// Apply a rotation and move into the 'move' (roll) phase.
export function applyRotation(state: GameState, deg: RotateChoice): GameState {
  const rotated = deg ? rotateAssam(state, deg) : state;
  return { ...rotated, phase: 'move' };
}

// Apply a placement and advance the turn. Returns the state unchanged-but-
// advanced if the placement is illegal (makePlacement is itself a no-op then).
export function applyPlacement(state: GameState, p: Placement): GameState {
  const placed = makePlacement(state, candidateRug(state, p.anchor, p.second));
  return advanceTurn(placed);
}

// Whether the two squares are edge-adjacent — re-exported for agents that score
// positions without importing board internals directly.
export { isAdjacent };
