// The Brain: pure rule functions ported from Marrakech.java.
// Every rule takes a GameState and returns a NEW one (or a plain value for queries).
// No strings, no graphics, no mutation of the input.
import { countColour, countConnectedColour, colourAt, inBounds, isAdjacent } from './board';
import type { Rng } from './setup';
import type { Assam, Cell, Colour, Facing, GameState, Player, Rug } from './types';

// ---------------------------------------------------------------------------
// Die
// ---------------------------------------------------------------------------

// The special Marrakech die: faces 1,2,2,3,3,4 (a 2 or 3 is twice as likely).
const DIE_FACES: (1 | 2 | 3 | 4)[] = [1, 2, 2, 3, 3, 4];

// The die's probability mass, for chance-node weighting in search.
// (1→1/6, 2→2/6, 3→2/6, 4→1/6.)
export const DIE_DISTRIBUTION: { value: 1 | 2 | 3 | 4; p: number }[] = [
  { value: 1, p: 1 / 6 },
  { value: 2, p: 2 / 6 },
  { value: 3, p: 2 / 6 },
  { value: 4, p: 1 / 6 },
];

export function rollDie(rng: Rng): 1 | 2 | 3 | 4 {
  return DIE_FACES[Math.floor(rng() * DIE_FACES.length)];
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

const CLOCKWISE: Facing[] = ['N', 'E', 'S', 'W']; // each +90 degrees

// Rotate Assam by a relative angle. Only 90 (right) and 270 (left) are legal;
// 0 and 180 leave him unchanged (he may never spin a full 180). (Java: rotateAssam.)
export function rotateAssam(state: GameState, degrees: 0 | 90 | 180 | 270): GameState {
  if (degrees !== 90 && degrees !== 270) return state;
  const i = CLOCKWISE.indexOf(state.assam.facing);
  const facing = CLOCKWISE[(i + degrees / 90) % 4];
  return { ...state, assam: { ...state.assam, facing } };
}

// ---------------------------------------------------------------------------
// Movement with the board's edge-wrap path.
// ---------------------------------------------------------------------------

// When Assam walks off an edge he folds back onto the board along the painted
// track. We solve the horizontal case (off the left/right edge) once; a vertical
// move (off top/bottom) is the same problem transposed (col <-> row).

// Lane pairing when re-entering. Left and right edges weave differently.
const LEFT_PAIR: Record<number, number> = { 0: 1, 1: 0, 2: 3, 3: 2, 4: 5, 5: 4 }; // row 6 is a corner
const RIGHT_PAIR: Record<number, number> = { 6: 5, 5: 6, 4: 3, 3: 4, 2: 1, 1: 2 }; // row 0 is a corner

type Fold = { col: number; row: number; facing: Facing };

// Reflect an out-of-bounds horizontal overshoot back onto the board.
// `vertical` = true means this is really a N/S move transposed into here, which
// only changes which facing we come out with.
function foldHorizontal(col: number, row: number, vertical: boolean): Fold {
  if (col < 0) {
    // Walked off the LEFT edge. Penetration depth gives the re-entry column.
    col = -1 - col;
    if (row === 6) {
      // Round the bottom-left corner and head up column 0.
      return { col: 0, row: 6 - col, facing: vertical ? 'W' : 'N' };
    }
    return { col, row: LEFT_PAIR[row], facing: vertical ? 'S' : 'E' };
  }
  // Walked off the RIGHT edge (col >= 7).
  const outside = col - 7 + 1;
  col = 7 - outside;
  if (row === 0) {
    // Round the top-right corner and head down column 6.
    return { col: 6, row: outside - 1, facing: vertical ? 'E' : 'S' };
  }
  return { col, row: RIGHT_PAIR[row], facing: vertical ? 'N' : 'W' };
}

// Pure core: where does Assam end up after moving `die` squares forward?
export function assamAfterMove(assam: Assam, die: number): Assam {
  let { col, row } = assam.pos;
  switch (assam.facing) {
    case 'N': row -= die; break;
    case 'S': row += die; break;
    case 'E': col += die; break;
    case 'W': col -= die; break;
  }

  if (inBounds({ col, row })) {
    return { pos: { col, row }, facing: assam.facing };
  }
  if (col < 0 || col >= 7) {
    const f = foldHorizontal(col, row, false);
    return { pos: { col: f.col, row: f.row }, facing: f.facing };
  }
  // Vertical overshoot: transpose (col <-> row), fold, transpose back.
  const f = foldHorizontal(row, col, true);
  return { pos: { col: f.row, row: f.col }, facing: f.facing };
}

export function moveAssam(state: GameState, die: number): GameState {
  return { ...state, assam: assamAfterMove(state.assam, die) };
}

// The cell-by-cell walk: one Assam state per square stepped forward, so the UI
// can animate Assam pacing across the board (and pivoting at the edges). Taking
// `die` single steps lands in the same place as one `die`-square move, because
// the edge fold scales linearly with penetration depth.
export function assamPath(assam: Assam, die: number): Assam[] {
  const path: Assam[] = [];
  let cur = assam;
  for (let i = 0; i < die; i++) {
    cur = assamAfterMove(cur, 1);
    path.push(cur);
  }
  return path;
}

// ---------------------------------------------------------------------------
// Rug placement
// ---------------------------------------------------------------------------

function playerOf(state: GameState, colour: Colour): Player | undefined {
  return state.players.find((p) => p.colour === colour);
}

// A rug is valid if its colour belongs to a player in the game and the
// (colour, id) pair is not already on the board. (Java: isRugValid.)
export function isRugValid(state: GameState, rug: Rug): boolean {
  if (!playerOf(state, rug.colour)) return false;
  const duplicate = state.rugs.some((r) => r.colour === rug.colour && r.id === rug.id);
  return !duplicate;
}

// A placement is valid if the rug covers two distinct in-bounds squares, at
// least one of which is edge-adjacent to Assam, it does not sit on Assam, and it
// does not fully cover any single existing rug. (Java: isPlacementValid.)
export function isPlacementValid(state: GameState, rug: Rug): boolean {
  const [a, b] = rug.squares;
  if (!inBounds(a) || !inBounds(b)) return false;
  if (a.col === b.col && a.row === b.row) return false;

  const assamPos = state.assam.pos;
  for (const sq of rug.squares) {
    if (sq.col === assamPos.col && sq.row === assamPos.row) return false;
  }
  const adjacentToAssam = rug.squares.some((sq) => isAdjacent(sq, assamPos));
  if (!adjacentToAssam) return false;

  // May partially cover a rug, but not bury an entire rug under this one.
  const coveredRugKeys = rug.squares
    .map((sq) => cellKey(state.board, sq))
    .filter((k): k is string => k !== null);
  if (coveredRugKeys.length === 2 && coveredRugKeys[0] === coveredRugKeys[1]) return false;

  return true;
}

// Identity ("colour+id") of the rug visible on a square, or null if empty.
function cellKey(board: Cell[][], c: { col: number; row: number }): string | null {
  const cell = board[c.col][c.row];
  return cell ? `${cell.colour}${cell.rugId}` : null;
}

// Place a rug if it is both valid and legally placed; otherwise return the game
// unchanged. (Java: makePlacement.)
export function makePlacement(state: GameState, rug: Rug): GameState {
  if (!isRugValid(state, rug) || !isPlacementValid(state, rug)) return state;

  const board = state.board.map((col) => col.slice());
  for (const sq of rug.squares) {
    board[sq.col][sq.row] = { colour: rug.colour, rugId: rug.id };
  }
  const players = state.players.map((p) =>
    p.colour === rug.colour ? { ...p, rugsLeft: p.rugsLeft - 1 } : p,
  );
  return { ...state, board, rugs: [...state.rugs, rug], players };
}

// ---------------------------------------------------------------------------
// Payment & scoring
// ---------------------------------------------------------------------------

// What the player who just moved owes: the number of connected same-colour
// squares in the region Assam landed on. 0 if he landed on bare sand.
// (Java: getPaymentAmount.)
export function getPaymentAmount(state: GameState): number {
  if (colourAt(state.board, state.assam.pos) === null) return 0;
  return countConnectedColour(state.board, state.assam.pos);
}

export function scoreOf(state: GameState, player: Player): number {
  return player.dirhams + countColour(state.board, player.colour);
}

// ---------------------------------------------------------------------------
// End of game
// ---------------------------------------------------------------------------

// The game ends when every player still in it has run out of rugs. (Java: isGameOver.)
export function isGameOver(state: GameState): boolean {
  return state.players.every((p) => p.out || p.rugsLeft === 0);
}

// Best player by score, then by dirhams, among those still in. 'tie' if level.
// Assumes the game is over; callers gate on that.
export function winnerOf(state: GameState): Colour | 'tie' {
  let winners: Player[] = [];
  let bestScore = -Infinity;
  let bestDirhams = -Infinity;

  for (const p of state.players) {
    if (p.out) continue;
    const score = scoreOf(state, p);
    const cmp = score !== bestScore ? score - bestScore : p.dirhams - bestDirhams;
    if (cmp > 0) {
      winners = [p];
      bestScore = score;
      bestDirhams = p.dirhams;
    } else if (cmp === 0) {
      winners.push(p);
    }
  }

  if (winners.length !== 1) return 'tie';
  return winners[0].colour;
}

// Winner: highest score, tie broken by most dirhams. 'none' if not over,
// 'tie' if still level after both. Players who are out cannot win. (Java: getWinner.)
export function getWinner(state: GameState): Colour | 'tie' | 'none' {
  if (!isGameOver(state)) return 'none';
  return winnerOf(state);
}

// ---------------------------------------------------------------------------
// Live-play helpers (used by the UI, not the assignment API)
// ---------------------------------------------------------------------------

// The next unused rug id for a colour, so each placed rug stays unique.
export function nextRugId(state: GameState, colour: Colour): number {
  const ids = state.rugs.filter((r) => r.colour === colour).map((r) => r.id);
  return ids.length === 0 ? 0 : Math.max(...ids) + 1;
}

// Settle rent after Assam lands. The current player pays the owner of the rug
// landed on, equal to the connected same-colour region. If they cannot pay in
// full they pay what they can and drop out. (Java: settlePayment.)
export function settlePayment(state: GameState): {
  state: GameState;
  paid: number;
  toColour: Colour | null;
  bankrupt: boolean;
} {
  const payer = state.players[state.turnIndex];
  const landed = colourAt(state.board, state.assam.pos);
  const noPayment = { state, paid: 0, toColour: null, bankrupt: false };

  if (landed === null || landed === payer.colour) return noPayment;
  const owner = state.players.find((p) => p.colour === landed);
  if (!owner || owner.out) return noPayment;

  const owed = countConnectedColour(state.board, state.assam.pos);
  const paid = Math.min(owed, payer.dirhams);
  const bankrupt = paid < owed;

  const players = state.players.map((p) => {
    if (p.colour === payer.colour) return { ...p, dirhams: p.dirhams - paid, out: p.out || bankrupt };
    if (p.colour === owner.colour) return { ...p, dirhams: p.dirhams + paid };
    return p;
  });

  return { state: { ...state, players }, paid, toColour: owner.colour, bankrupt };
}
