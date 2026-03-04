// Pure board queries. No mutation, no graphics.
import { BOARD_SIZE } from './types';
import type { Cell, Colour, Coord } from './types';

export function inBounds(c: Coord): boolean {
  return c.col >= 0 && c.col < BOARD_SIZE && c.row >= 0 && c.row < BOARD_SIZE;
}

// Two squares are adjacent only if they share a full edge (no diagonals).
export function isAdjacent(a: Coord, b: Coord): boolean {
  const dc = Math.abs(a.col - b.col);
  const dr = Math.abs(a.row - b.row);
  return dc + dr === 1;
}

export function cellAt(board: Cell[][], c: Coord): Cell {
  return board[c.col][c.row];
}

export function colourAt(board: Cell[][], c: Coord): Colour | null {
  return board[c.col][c.row]?.colour ?? null;
}

// Size of the connected same-colour region containing `start`
// (orthogonal neighbours only). 0 if that square is empty. (Java: dfs.)
export function countConnectedColour(board: Cell[][], start: Coord): number {
  const colour = colourAt(board, start);
  if (colour === null) return 0;

  const seen = new Set<string>();
  const key = (c: Coord) => `${c.col},${c.row}`;
  const stack: Coord[] = [start];
  let count = 0;

  while (stack.length > 0) {
    const c = stack.pop()!;
    if (!inBounds(c) || seen.has(key(c))) continue;
    if (colourAt(board, c) !== colour) continue;
    seen.add(key(c));
    count++;
    stack.push(
      { col: c.col + 1, row: c.row },
      { col: c.col - 1, row: c.row },
      { col: c.col, row: c.row + 1 },
      { col: c.col, row: c.row - 1 },
    );
  }
  return count;
}

// Total visible squares of a colour anywhere on the board (for scoring).
export function countColour(board: Cell[][], colour: Colour): number {
  let count = 0;
  for (const col of board) for (const cell of col) if (cell?.colour === colour) count++;
  return count;
}
