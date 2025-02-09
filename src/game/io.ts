// Save/load: the game-string format from the Java assignment.
// State is the source of truth; this is just an import/export format (REWRITE.md §7).
//
// Layout (concatenated, no separators):
//   player : P + colour(1) + dirhams(3) + rugs(2) + status(1: i=in, o=out)
//   assam  : A + col(1) + row(1) + facing(1)
//   board  : B + 49 tiles x 3 chars, col-major; "n00" = empty, else colour + id(2)
//
// Note: the string only snapshots players, Assam and the board. It does NOT carry
// turnIndex/phase (Java never did), and a covered rug square is invisible — so a
// rug's two squares can only be recovered if both are still showing.
import { BOARD_SIZE } from './types';
import type { Cell, Colour, Facing, GameState, Player, Rug } from './types';

const pad = (n: number, width: number) => String(n).padStart(width, '0');

// --- serialize: GameState -> string -------------------------------------

function serialisePlayer(p: Player): string {
  return `P${p.colour}${pad(p.dirhams, 3)}${pad(p.rugsLeft, 2)}${p.out ? 'o' : 'i'}`;
}

function serialiseBoard(board: Cell[][]): string {
  let s = 'B';
  for (let col = 0; col < BOARD_SIZE; col++) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      const cell = board[col][row];
      s += cell === null ? 'n00' : `${cell.colour}${pad(cell.rugId, 2)}`;
    }
  }
  return s;
}

export function serialize(state: GameState): string {
  const players = state.players.map(serialisePlayer).join('');
  const assam = `A${state.assam.pos.col}${state.assam.pos.row}${state.assam.facing}`;
  return players + assam + serialiseBoard(state.board);
}

// --- parse: string -> GameState -----------------------------------------

function parsePlayers(s: string): Player[] {
  const players: Player[] = [];
  for (const m of s.matchAll(/P([cyrp])(\d{3})(\d{2})([oi])/g)) {
    players.push({
      colour: m[1] as Colour,
      dirhams: Number(m[2]),
      rugsLeft: Number(m[3]),
      out: m[4] === 'o',
    });
  }
  return players;
}

function parseAssam(s: string) {
  const m = s.match(/A([0-6])([0-6])([NESW])/);
  if (!m) throw new Error('No Assam found in game string');
  return { pos: { col: Number(m[1]), row: Number(m[2]) }, facing: m[3] as Facing };
}

function parseBoard(s: string): Cell[][] {
  const m = s.match(/B([0-9ncryp]{147})/);
  if (!m) throw new Error('No board found in game string');
  const body = m[1];

  const board: Cell[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null as Cell),
  );
  for (let i = 0; i < 49; i++) {
    const tile = body.slice(i * 3, i * 3 + 3);
    const col = Math.floor(i / BOARD_SIZE); // col-major, matching serialise
    const row = i % BOARD_SIZE;
    board[col][row] = tile === 'n00' ? null : { colour: tile[0] as Colour, rugId: Number(tile.slice(1)) };
  }
  return board;
}

// Best-effort rebuild of the rug list from the visible cells: squares sharing a
// (colour, id) belong to the same rug. A fully-covered square cannot be recovered.
function rebuildRugs(board: Cell[][]): Rug[] {
  const groups = new Map<string, { colour: Colour; id: number; squares: { col: number; row: number }[] }>();
  for (let col = 0; col < BOARD_SIZE; col++) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      const cell = board[col][row];
      if (!cell) continue;
      const key = `${cell.colour}${cell.rugId}`;
      const g = groups.get(key) ?? { colour: cell.colour, id: cell.rugId, squares: [] };
      g.squares.push({ col, row });
      groups.set(key, g);
    }
  }
  return [...groups.values()].map((g) => ({
    colour: g.colour,
    id: g.id,
    squares: (g.squares.length >= 2 ? [g.squares[0], g.squares[1]] : [g.squares[0], g.squares[0]]) as Rug['squares'],
  }));
}

// Parse a rug string (colour + 2-digit id + 4 coord digits, e.g. "c013334").
// Returns null if malformed or off-board, matching the Java validity rules.
export function parseRug(rugString: string): Rug | null {
  if (!/^[cyrp]\d{2}[0-6]{4}$/.test(rugString)) return null;
  return {
    colour: rugString[0] as Colour,
    id: Number(rugString.slice(1, 3)),
    squares: [
      { col: Number(rugString[3]), row: Number(rugString[4]) },
      { col: Number(rugString[5]), row: Number(rugString[6]) },
    ],
  };
}

export function parse(gameString: string): GameState {
  const board = parseBoard(gameString);
  return {
    players: parsePlayers(gameString),
    assam: parseAssam(gameString),
    board,
    rugs: rebuildRugs(board),
    turnIndex: 0, // not encoded in the string
    phase: 'rotate', // not encoded in the string
  };
}
