import { useState } from 'react';
import { BoardView } from './ui/BoardView';
import { ScorePanel } from './ui/ScorePanel';
import { newGame } from './game/setup';
import type { Cell, GameState, Rug } from './game/types';
import { BOARD_SIZE } from './game/types';
import './ui/game.css';

// A hand-authored position just to show the board off (step 6). Real play wiring
// comes in step 8. Rugs are painted onto the board in order so the cells match
// what BoardView draws.
function buildDemo(): GameState {
  const base = newGame(4, () => 0);
  const rugs: Rug[] = [
    { colour: 'r', id: 1, squares: [{ col: 1, row: 1 }, { col: 2, row: 1 }] },
    { colour: 'y', id: 1, squares: [{ col: 2, row: 2 }, { col: 2, row: 3 }] },
    { colour: 'c', id: 1, squares: [{ col: 3, row: 2 }, { col: 4, row: 2 }] },
    { colour: 'p', id: 1, squares: [{ col: 4, row: 3 }, { col: 4, row: 4 }] },
    { colour: 'c', id: 2, squares: [{ col: 2, row: 1 }, { col: 3, row: 1 }] }, // overlaps red r1
    { colour: 'y', id: 2, squares: [{ col: 5, row: 4 }, { col: 5, row: 5 }] },
    { colour: 'r', id: 2, squares: [{ col: 3, row: 4 }, { col: 3, row: 5 }] },
  ];

  const board: Cell[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null as Cell),
  );
  for (const rug of rugs) {
    for (const sq of rug.squares) board[sq.col][sq.row] = { colour: rug.colour, rugId: rug.id };
  }

  return { ...base, board, rugs, assam: { pos: { col: 3, row: 3 }, facing: 'E' } };
}

export default function App() {
  const [state] = useState<GameState>(buildDemo);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Marrakech</h1>
        <p className="tagline">Rug merchants of the medina</p>
      </header>
      <main className="layout">
        <BoardView state={state} />
        <ScorePanel state={state} />
      </main>
    </div>
  );
}
