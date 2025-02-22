// The playable scene: the board, the controls, and the full turn flow
// (rotate → roll → walk → settle → place). Owns all in-game state; the
// surrounding App only decides whether this screen is shown.
import { useState } from 'react';
import { BoardView } from './BoardView';
import type { Overlay } from './BoardView';
import { ScorePanel } from './ScorePanel';
import { Controls } from './Controls';
import { DiceRoll } from './DiceRoll';
import { PaymentPrompt } from './PaymentPrompt';
import type { PaymentResult } from './PaymentPrompt';
import { GameMenu } from './GameMenu';
import { GameOver } from './GameOver';
import type { PlayerNames } from './players';
import { newGame } from '../game/setup';
import { countConnectedColour, inBounds } from '../game/board';
import {
  assamPath,
  isPlacementValid,
  isRugValid,
  makePlacement,
  moveAssam,
  nextRugId,
  rollDie,
  rotateAssam,
  scoreOf,
  settlePayment,
  winnerOf,
} from '../game/rules';
import type { Colour, Coord, GameState, Rug } from '../game/types';

type UI = {
  state: GameState;
  die: number | null;
  anchor: Coord | null;
  message: string;
  winner: Colour | 'tie' | null;
};

const neighbours = (c: Coord): Coord[] => [
  { col: c.col + 1, row: c.row },
  { col: c.col - 1, row: c.row },
  { col: c.col, row: c.row + 1 },
  { col: c.col, row: c.row - 1 },
];

// Candidate rug for the current player covering squares a and b.
function candidate(state: GameState, a: Coord, b: Coord): Rug {
  const colour = state.players[state.turnIndex].colour;
  return { colour, id: nextRugId(state, colour), squares: [a, b] };
}
function validPair(state: GameState, a: Coord, b: Coord): boolean {
  const rug = candidate(state, a, b);
  return isPlacementValid(state, rug) && isRugValid(state, rug);
}
// Tiles next to Assam that can anchor a legal rug.
function legalAnchors(state: GameState): Coord[] {
  return neighbours(state.assam.pos).filter(
    (a) => inBounds(a) && neighbours(a).some((b) => validPair(state, a, b)),
  );
}
// Given a chosen anchor, the tiles the rug can extend onto.
function legalSeconds(state: GameState, anchor: Coord): Coord[] {
  return neighbours(anchor).filter((b) => validPair(state, anchor, b));
}

// Move to the next active player, or end the game.
function advanceTurn(state: GameState): GameState {
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

export type GameConfig = { count: number; names: PlayerNames };

export function GameScreen({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { names } = config;
  const turnName = (s: GameState) => names[s.players[s.turnIndex].colour];

  function freshGame(): UI {
    const state = newGame(config.count, Math.random);
    return {
      state,
      die: null,
      anchor: null,
      winner: null,
      message: `${names[state.players[state.turnIndex].colour]} to move — rotate Assam (or keep straight).`,
    };
  }

  const [ui, setUi] = useState<UI>(freshGame);
  const [rolling, setRolling] = useState<{ value: 1 | 2 | 3 | 4; commit: () => void } | null>(null);
  const [walking, setWalking] = useState(false);
  const [prompt, setPrompt] = useState<{ result: PaymentResult; onContinue: () => void } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { state } = ui;
  const busy = rolling !== null || walking || prompt !== null;

  // End a turn: advance, and detect game over.
  function finishTurn(s: GameState, baseMessage: string) {
    const next = advanceTurn(s);
    if (next.phase === 'gameover') {
      setUi({ state: next, die: null, anchor: null, winner: winnerOf(next), message: baseMessage });
    } else {
      setUi({ state: next, die: null, anchor: null, winner: null, message: `${baseMessage}${turnName(next)} to move.` });
    }
  }

  function onRotate(deg: 0 | 90 | 270) {
    if (state.phase !== 'rotate' || ui.winner) return;
    const rotated = deg ? rotateAssam(state, deg) : state;
    setUi({ ...ui, state: { ...rotated, phase: 'move' }, message: `${turnName(state)} — roll the die.` });
  }

  // Step 1 — roll: pick the die, then tumble it on screen.
  function onRoll() {
    if (state.phase !== 'move' || ui.winner || busy) return;
    const die = rollDie(Math.random);
    setRolling({ value: die, commit: () => startWalk(die) });
  }

  // Step 2 — walk: pace Assam one cell at a time along his path.
  function startWalk(die: 1 | 2 | 3 | 4) {
    setRolling(null);
    setWalking(true);
    const path = assamPath(state.assam, die);
    setUi((u) => ({ ...u, die, message: `Rolled ${die} — Assam sets off…` }));

    const STEP_MS = 360;
    let i = 0;
    const stepOnce = () => {
      const step = path[i]; // capture now — the updater below runs after i++ below
      setUi((u) => ({ ...u, state: { ...u.state, assam: step } }));
      i += 1;
      window.setTimeout(i < path.length ? stepOnce : () => settleLanding(die), STEP_MS);
    };
    stepOnce();
  }

  // Step 3 — settle: work out the rent and, if any changes hands, show the prompt.
  function settleLanding(die: 1 | 2 | 3 | 4) {
    setWalking(false);
    const moved = moveAssam(state, die);
    const pay = settlePayment(moved);

    if (pay.toColour === null) {
      proceed(die, pay); // landed on sand or own rug — nothing to report
      return;
    }

    const payer = pay.state.players.find((p) => p.colour === state.players[state.turnIndex].colour)!;
    const owner = pay.state.players.find((p) => p.colour === pay.toColour)!;
    const result: PaymentResult = {
      die,
      payer: payer.colour,
      owner: owner.colour,
      owed: countConnectedColour(moved.board, moved.assam.pos),
      paid: pay.paid,
      bankrupt: pay.bankrupt,
      payerDirhams: payer.dirhams,
      ownerDirhams: owner.dirhams,
      payerScore: scoreOf(pay.state, payer),
      ownerScore: scoreOf(pay.state, owner),
    };
    setPrompt({ result, onContinue: () => proceed(die, pay) });
  }

  // Step 4 — proceed: dismiss the prompt and move into placement (or end turn).
  function proceed(die: 1 | 2 | 3 | 4, pay: ReturnType<typeof settlePayment>) {
    setPrompt(null);
    let msg = `Rolled ${die}. `;
    msg += pay.paid > 0 ? `Paid ${pay.paid} to ${names[pay.toColour!]}. ` : 'No rent owed. ';

    if (pay.bankrupt) {
      finishTurn(pay.state, `${msg}${turnName(state)} can't pay and is out! `);
      return;
    }
    const placing: GameState = { ...pay.state, phase: 'place' };
    if (legalAnchors(placing).length === 0) {
      finishTurn(placing, `${msg}No legal rug placement — turn passes. `);
      return;
    }
    setUi({ state: placing, die, anchor: null, winner: null, message: `${msg}Place a rug next to Assam.` });
  }

  function onPickAnchor(anchor: Coord) {
    setUi({ ...ui, anchor, message: 'Now click a neighbouring tile to lay the rug.' });
  }
  function onPickSecond(second: Coord) {
    if (!ui.anchor) return;
    const placed = makePlacement(state, candidate(state, ui.anchor, second));
    finishTurn(placed, `${turnName(state)} placed a rug. `);
  }
  function onCancel() {
    setUi({ ...ui, anchor: null, message: 'Place a rug next to Assam.' });
  }

  // Build the clickable overlay for the placement phase.
  let overlays: Overlay[] = [];
  if (state.phase === 'place' && !ui.winner) {
    if (ui.anchor === null) {
      overlays = legalAnchors(state).map((c) => ({ coord: c, variant: 'anchor', onClick: () => onPickAnchor(c) }));
    } else {
      overlays = [
        { coord: ui.anchor, variant: 'selected' },
        ...legalSeconds(state, ui.anchor).map((c) => ({ coord: c, variant: 'second' as const, onClick: () => onPickSecond(c) })),
      ];
    }
  }

  const gameOver = ui.winner !== null;

  return (
    <div className="app scene scene-play">
      <header className="app-header game-header">
        <div>
          <h1>Marrakech</h1>
          <p className="tagline">Rug merchants of the medina</p>
        </div>
        <button type="button" className="menu-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          ❖
        </button>
      </header>
      <main className="layout">
        <BoardView state={state} overlays={overlays} />
        <div className="side">
          <Controls
            state={state}
            die={ui.die}
            message={ui.message}
            winner={ui.winner}
            names={names}
            busy={busy}
            canCancel={state.phase === 'place' && ui.anchor !== null}
            onRotate={onRotate}
            onRoll={onRoll}
            onCancel={onCancel}
          />
          <ScorePanel state={state} names={names} />
        </div>
      </main>

      {rolling && <DiceRoll value={rolling.value} onDone={rolling.commit} />}
      {prompt && <PaymentPrompt r={prompt.result} names={names} onContinue={prompt.onContinue} />}
      {menuOpen && (
        <GameMenu
          onResume={() => setMenuOpen(false)}
          onRestart={() => {
            setMenuOpen(false);
            setUi(freshGame());
          }}
          onQuit={onExit}
        />
      )}
      {gameOver && (
        <GameOver
          state={state}
          winner={ui.winner!}
          names={names}
          onPlayAgain={() => setUi(freshGame())}
          onMenu={onExit}
        />
      )}
    </div>
  );
}
