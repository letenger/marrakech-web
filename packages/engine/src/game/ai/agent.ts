// The agent contract. A Marrakech turn has two decision points with a chance
// event between them — rotate (choose) → roll the die (chance) → place (choose)
// — so an agent is two pure functions, not one chooseMove.
//
// Both take a seedable rng so an agent's own tie-breaking is deterministic in
// tests and reproducible in the eval harness.
import type { Rng } from '../setup';
import type { GameState } from '../types';
import type { Placement, RotateChoice } from '../moves';

export interface Agent {
  readonly name: string;
  // Called in the 'rotate' phase, before the die is rolled.
  chooseRotation(state: GameState, rng: Rng): RotateChoice;
  // Called in the 'place' phase, after Assam has moved and rent is settled.
  // Returns null only when there is no legal placement (the turn then passes).
  choosePlacement(state: GameState, rng: Rng): Placement | null;
}

// The async flavour, for agents that must do I/O (the LLM agent). The eval
// harness works against this so it can run sync and async agents uniformly;
// toAsync() lifts any sync Agent into it for free.
export interface AsyncAgent {
  readonly name: string;
  chooseRotation(state: GameState, rng: Rng): Promise<RotateChoice>;
  choosePlacement(state: GameState, rng: Rng): Promise<Placement | null>;
}

export function toAsync(agent: Agent): AsyncAgent {
  return {
    name: agent.name,
    chooseRotation: (state, rng) => Promise.resolve(agent.chooseRotation(state, rng)),
    choosePlacement: (state, rng) => Promise.resolve(agent.choosePlacement(state, rng)),
  };
}

// Pick a uniformly random element of a non-empty array using rng.
export function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}
