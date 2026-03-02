// The turn engine for the play scene, as a hook: it owns the in-game state
// (rotate → roll → walk → settle → place) and the roll/walk/rent overlays,
// and quietly persists the match to localStorage so it can be resumed.
//
// Lifting this out of GameScreen keeps the component a thin renderer and makes
// the flow unit-testable on its own.
import { useEffect, useState } from 'react';
import type { Overlay } from './BoardView';
import type { PaymentResult } from './PaymentPrompt';
import type { GameConfig } from './players';
import { defaultSeats } from './players';
import { writeSave, clearSave } from './persistence';
import { newGame } from '../game/setup';
import { countConnectedColour } from '../game/board';
import {
  assamPath,
  makePlacement,
  moveAssam,
  rollDie,
  rotateAssam,
  scoreOf,
  settlePayment,
  winnerOf,
} from '../game/rules';
import {
  advanceTurn,
  candidateRug,
  legalAnchors,
  legalSeconds,
  type Placement,
} from '../game/moves';
import { AGENTS } from '../game/ai/agents';
import type { Colour, Coord, GameState } from '../game/types';

type UI = {
  state: GameState;
  die: number | null;
  anchor: Coord | null;
  message: string;
  winner: Colour | 'tie' | null;
};

const STEP_MS = 360; // pace of Assam's cell-by-cell walk
const AI_TURN_MS = 650; // pause before an AI seat acts, so a human can follow
const AI_PROMPT_MS = 1600; // how long an AI lets the rent popup linger

export function useTurnFlow(config: GameConfig, resumeState?: GameState) {
  const { names } = config;
  const seats = config.seats ?? defaultSeats(); // resilient to older saves
  const nameOf = (s: GameState) => names[s.players[s.turnIndex].colour];

  function openingMessage(s: GameState): string {
    const who = nameOf(s);
    switch (s.phase) {
      case 'move': return `${who} — roll the die.`;
      case 'place': return `${who} — place a rug next to Assam.`;
      default: return `${who} to move — rotate Assam (or keep straight).`;
    }
  }

  function freshUI(): UI {
    const state = resumeState ?? newGame(config.count, Math.random);
    return {
      state,
      die: null,
      anchor: null,
      winner: state.phase === 'gameover' ? winnerOf(state) : null,
      message: openingMessage(state),
    };
  }

  const [ui, setUi] = useState<UI>(freshUI);
  const [rolling, setRolling] = useState<{ value: 1 | 2 | 3 | 4; commit: () => void } | null>(null);
  const [walking, setWalking] = useState(false);
  const [prompt, setPrompt] = useState<{ result: PaymentResult; onContinue: () => void } | null>(null);
  const { state } = ui;
  const busy = rolling !== null || walking || prompt !== null;
  const gameOver = ui.winner !== null;

  // Persist at every stable point (not mid-walk, where Assam is between cells).
  useEffect(() => {
    if (gameOver) {
      clearSave();
    } else if (!walking) {
      writeSave({ config, state: ui.state });
    }
  }, [ui.state, gameOver, walking, config]);

  const currentSeat = seats[state.players[state.turnIndex].colour];
  const isAITurn = !gameOver && currentSeat !== 'human';

  // Drive AI seats: when an agent controls the active seat, step it through the
  // same rotate → roll → (acknowledge rent) → place actions a human would click,
  // paced so a watcher can follow. Animations (dice tumble, walk) own the screen
  // and resolve themselves, so we stand back while they run.
  useEffect(() => {
    if (!isAITurn || rolling !== null || walking) return;
    const agent = AGENTS[currentSeat];
    if (!agent) return;

    let id: number;
    if (prompt !== null) {
      id = window.setTimeout(() => prompt.onContinue(), AI_PROMPT_MS);
    } else if (state.phase === 'rotate') {
      id = window.setTimeout(() => onRotate(agent.chooseRotation(state, Math.random)), AI_TURN_MS);
    } else if (state.phase === 'move') {
      id = window.setTimeout(() => onRoll(), AI_TURN_MS);
    } else if (state.phase === 'place') {
      id = window.setTimeout(() => {
        const p = agent.choosePlacement(state, Math.random);
        if (p) placeRug(p);
        else finishTurn(state, `${nameOf(state)} has no legal rug — turn passes. `);
      }, AI_TURN_MS);
    } else {
      return;
    }
    return () => window.clearTimeout(id);
    // The handlers below close over the same `state`/`ui` this effect depends on,
    // so they re-create in lockstep with it; listing the reactive values is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, rolling, walking, prompt, isAITurn, currentSeat]);

  function finishTurn(s: GameState, baseMessage: string) {
    const next = advanceTurn(s);
    if (next.phase === 'gameover') {
      setUi({ state: next, die: null, anchor: null, winner: winnerOf(next), message: baseMessage });
    } else {
      setUi({ state: next, die: null, anchor: null, winner: null, message: `${baseMessage}${nameOf(next)} to move.` });
    }
  }

  function onRotate(deg: 0 | 90 | 270) {
    if (state.phase !== 'rotate' || ui.winner) return;
    const rotated = deg ? rotateAssam(state, deg) : state;
    setUi({ ...ui, state: { ...rotated, phase: 'move' }, message: `${nameOf(state)} — roll the die.` });
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

    let i = 0;
    const stepOnce = () => {
      const step = path[i]; // capture now — the updater runs after i++ below
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
      finishTurn(pay.state, `${msg}${nameOf(state)} can't pay and is out! `);
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
    placeRug({ anchor: ui.anchor, second });
  }
  // Lay a rug in one shot — used by the two-click human flow and by AI seats.
  function placeRug(p: Placement) {
    const placed = makePlacement(state, candidateRug(state, p.anchor, p.second));
    finishTurn(placed, `${nameOf(state)} placed a rug. `);
  }
  function onCancel() {
    setUi({ ...ui, anchor: null, message: 'Place a rug next to Assam.' });
  }

  function reset() {
    setRolling(null);
    setWalking(false);
    setPrompt(null);
    const state = newGame(config.count, Math.random);
    setUi({ state, die: null, anchor: null, winner: null, message: openingMessage(state) });
  }

  // Clickable overlay for the placement phase.
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

  return {
    state,
    die: ui.die,
    message: ui.message,
    winner: ui.winner,
    busy,
    isAITurn,
    gameOver,
    overlays,
    rolling,
    prompt,
    canCancel: state.phase === 'place' && ui.anchor !== null,
    onRotate,
    onRoll,
    onCancel,
    reset,
  };
}
