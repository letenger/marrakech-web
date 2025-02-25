// Builds a fresh GameState. (Java: GameState(numberOfPlayers) + Assam() + Board().)
import { BOARD_SIZE } from './types';
import type { Assam, Cell, Colour, Facing, GameState, Player } from './types';

export const INITIAL_DIRHAMS = 30;

// Rugs handed to each player, by player count — matching the physical game
// (fewer players means more rugs each, so the board still fills up).
const RUGS_BY_PLAYERS: Record<number, number> = { 2: 24, 3: 15, 4: 12 };

export function rugsForPlayers(numPlayers: number): number {
  return RUGS_BY_PLAYERS[numPlayers] ?? 15;
}

// Colours are always assigned in this fixed order (c -> y -> r -> p).
const COLOUR_ORDER: Colour[] = ['c', 'y', 'r', 'p'];
const FACINGS: Facing[] = ['N', 'E', 'S', 'W'];

// rng: a function returning a number in [0, 1), like Math.random.
// Injected so tests can pass a fake and get a predictable game.
export type Rng = () => number;

// An empty 7x7 board: board[col][row], every cell null (sand).
function emptyBoard(): Cell[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null as Cell),
  );
}

function newPlayer(colour: Colour, rugs: number): Player {
  return { colour, dirhams: INITIAL_DIRHAMS, rugsLeft: rugs, out: false };
}

// Assam starts in the centre (3,3) facing a random direction.
function newAssam(rng: Rng): Assam {
  const facing = FACINGS[Math.floor(rng() * FACINGS.length)];
  return { pos: { col: 3, row: 3 }, facing };
}

// Create a brand new game for `numPlayers` (2..4).
export function newGame(numPlayers: number, rng: Rng): GameState {
  if (numPlayers < 2 || numPlayers > 4) {
    throw new Error(`numPlayers must be 2..4, got ${numPlayers}`);
  }
  const rugs = rugsForPlayers(numPlayers);
  const players = COLOUR_ORDER.slice(0, numPlayers).map((c) => newPlayer(c, rugs));
  return {
    players,
    assam: newAssam(rng),
    board: emptyBoard(),
    rugs: [],
    turnIndex: 0,
    phase: 'rotate',
  };
}
