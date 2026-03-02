// A provider-agnostic LLM opponent. It implements the same AsyncAgent contract
// as the algorithmic agents, but chooses moves by prompting a language model
// and validating the reply against the legal move set — retrying with the error
// fed back on malformed or illegal output, and falling back to the greedy agent
// if the model can't produce a legal move within the retry budget.
//
// Eval-only: never bundled into the browser, so no API key reaches the client.
import type { AsyncAgent } from './agent';
import { greedyAgent } from './agents';
import {
  legalRotations,
  legalPlacements,
  type Placement,
  type RotateChoice,
} from '../moves';
import { colourAt } from '../board';
import { BOARD_SIZE } from '../types';
import type { GameState } from '../types';

// The single seam to a model: take a prompt, return its text completion.
export type Complete = (prompt: string) => Promise<string>;

// One malformed/illegal attempt, surfaced so the eval harness can count them.
export type IllegalMove = { phase: 'rotate' | 'place'; reason: string; raw: string };

export type LlmOptions = {
  complete: Complete;
  name?: string;
  maxRetries?: number; // tries to get a legal move before falling back (default 2)
  onIllegalMove?: (info: IllegalMove) => void;
};

const ARROW: Record<string, string> = { N: '↑', E: '→', S: '↓', W: '←' };

// Render the board as text, rows top to bottom. Empty squares are '.', rugs are
// the owner's colour letter, and Assam is shown as '@' with his facing.
function boardToText(state: GameState): string {
  const lines: string[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    const cells: string[] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (state.assam.pos.col === col && state.assam.pos.row === row) {
        cells.push('@');
      } else {
        const c = colourAt(state.board, { col, row });
        cells.push(c ?? '.');
      }
    }
    lines.push(`row ${row}: ${cells.join(' ')}`);
  }
  return lines.join('\n');
}

function playersToText(state: GameState): string {
  return state.players
    .map((p) => {
      const me = state.players[state.turnIndex].colour === p.colour ? ' (you)' : '';
      const out = p.out ? ' OUT' : '';
      return `  ${p.colour}: ${p.dirhams} dirhams, ${p.rugsLeft} rugs left${me}${out}`;
    })
    .join('\n');
}

const RULES_BRIEF = [
  'Marrakech: steer the shared merchant Assam (@) around a 7x7 souk and lay rugs of your colour.',
  'Each turn: (1) rotate Assam, (2) roll a die and walk forward, (3) lay a rug on two adjacent squares.',
  'You pay rent when you land on an opponent rug; you earn points for visible squares of your colour plus your dirhams.',
  'Letters c/y/r/p are the four player colours.',
].join(' ');

// Pull the first balanced {...} JSON object out of a model reply (which may wrap
// it in prose or ``` fences). Returns null if none parses.
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  // Walk braces to find the matching close, tolerating nested objects.
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function llmAgent(opts: LlmOptions): AsyncAgent {
  const { complete, onIllegalMove } = opts;
  const maxRetries = opts.maxRetries ?? 2;
  const name = opts.name ?? 'llm';

  async function chooseRotation(state: GameState): Promise<RotateChoice> {
    const options = legalRotations();
    const base = [
      RULES_BRIEF,
      '',
      `It is colour ${state.players[state.turnIndex].colour}'s turn (you). Assam faces ${state.assam.facing} ${ARROW[state.assam.facing]}.`,
      'Board (row 0 is the top):',
      boardToText(state),
      'Players:',
      playersToText(state),
      '',
      `Choose how to rotate Assam before the roll. Legal options (degrees clockwise): ${options.join(', ')}. 0 keeps him facing the same way.`,
      'Reply with ONLY a JSON object: {"rotation": <0|90|270>}.',
    ].join('\n');

    let prompt = base;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const raw = await complete(prompt);
      const json = extractJson(raw);
      const value = json?.rotation;
      if (typeof value === 'number' && (options as number[]).includes(value)) {
        return value as RotateChoice;
      }
      onIllegalMove?.({ phase: 'rotate', reason: 'not a legal rotation', raw });
      prompt = `${base}\n\nYour previous reply was invalid (${JSON.stringify(raw).slice(0, 120)}). Reply with ONLY {"rotation": <0|90|270>}.`;
    }
    // Budget exhausted — fall back to a sound algorithmic choice.
    return greedyAgent.chooseRotation(state, Math.random);
  }

  async function choosePlacement(state: GameState): Promise<Placement | null> {
    const moves = legalPlacements(state);
    if (moves.length === 0) return null;

    const list = moves
      .map((m, i) => `  ${i}: anchor (${m.anchor.col},${m.anchor.row}) + (${m.second.col},${m.second.row})`)
      .join('\n');
    const base = [
      RULES_BRIEF,
      '',
      `It is colour ${state.players[state.turnIndex].colour}'s turn (you). Assam is at (${state.assam.pos.col},${state.assam.pos.row}).`,
      'Board (row 0 is the top):',
      boardToText(state),
      'Players:',
      playersToText(state),
      '',
      'Lay one of your rugs. Each legal placement covers two squares (an anchor next to Assam plus a partner):',
      list,
      '',
      'Pick the placement that best grows your connected territory and pressures opponents.',
      `Reply with ONLY a JSON object: {"index": <0..${moves.length - 1}>}.`,
    ].join('\n');

    let prompt = base;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const raw = await complete(prompt);
      const json = extractJson(raw);
      const idx = json?.index;
      if (typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < moves.length) {
        return moves[idx];
      }
      onIllegalMove?.({ phase: 'place', reason: 'index out of range or malformed', raw });
      prompt = `${base}\n\nYour previous reply was invalid (${JSON.stringify(raw).slice(0, 120)}). Reply with ONLY {"index": <0..${moves.length - 1}>}.`;
    }
    return greedyAgent.choosePlacement(state, Math.random);
  }

  return { name, chooseRotation, choosePlacement };
}

// A degenerate "model" handy for offline tests: always replies with this text.
export const fakeComplete = (reply: string): Complete => () => Promise.resolve(reply);
