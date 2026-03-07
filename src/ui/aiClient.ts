// Browser client for the AI-move endpoint. The LLM opponent asks the server
// (which holds the API key) for a move; the algorithmic agents run locally.
import type { GameState, Placement, RotateChoice } from '@marrakech/engine';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export async function fetchAiRotation(state: GameState): Promise<RotateChoice> {
  const res = await fetch(`${API_URL}/api/ai-move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, phase: 'rotate' }),
  });
  if (!res.ok) throw new Error(`ai-move ${res.status}`);
  const { rotation } = (await res.json()) as { rotation: RotateChoice };
  return rotation;
}

export async function fetchAiPlacement(state: GameState): Promise<Placement | null> {
  const res = await fetch(`${API_URL}/api/ai-move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, phase: 'place' }),
  });
  if (!res.ok) throw new Error(`ai-move ${res.status}`);
  const { placement } = (await res.json()) as { placement: Placement | null };
  return placement;
}
