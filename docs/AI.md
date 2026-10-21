# AI design notes

Marrakech has two player decisions separated by chance:

```text
choose rotation → roll die → settle rent → choose rug placement
```

The AI layer mirrors that turn structure. Agents choose only from moves enumerated by the rules engine, so the UI, evaluation harness, and API share one definition of legality.

## Move contract

```ts
interface Agent {
  name: string;
  chooseRotation(state: GameState, rng: Rng): RotateChoice;
  choosePlacement(state: GameState, rng: Rng): Placement | null;
}
```

`AsyncAgent` exposes the same decisions as promises. `toAsync` lifts the synchronous agents into that interface so the evaluation harness can run algorithmic and model-backed players through one path.

Randomness is injected. Tests and evaluations use a seeded generator, while the browser supplies `Math.random`.

## Legal move enumeration

`packages/engine/src/game/moves.ts` provides:

- `legalRotations()`
- `legalPlacements(state)`
- `applyRotation(state, choice)`
- `applyPlacement(state, placement)`

These functions are shared across the human controls, algorithmic agents, LLM validation, and headless evaluation. An agent does not implement a second version of the rules.

## Algorithmic agents

### Random

The baseline selects uniformly from legal moves. It is useful for contract tests and as a minimum benchmark.

### Greedy

The heuristic is:

```text
my score − strongest active opponent's score
```

Placement selects the best immediate board state. Rotation is chosen before the die roll, so it maximises expected value across the real `1, 2, 2, 3, 3, 4` distribution after movement and rent settlement.

### Search

The search agent uses depth-limited expectiminimax:

- maximise at the controlled player's decisions;
- minimise at an opponent's decisions;
- average at die-roll chance nodes using the real probabilities.

Depth is fixed at two plies to keep decisions responsive in the browser. The branching factor combines three rotations, four distinct die outcomes, and multiple rug placements.

The evaluation harness caught a perspective error in an earlier version that maximised at opponent nodes. Correcting those nodes to minimise improved the recorded 30-game result against greedy from 9 wins to 19 wins, with zero illegal moves.

## LLM agent

The engine depends on one provider-neutral function:

```ts
type Complete = (prompt: string) => Promise<string>;
```

The API supplies either an OpenAI-compatible or Anthropic adapter. The key remains on the server.

For each decision, the agent:

1. serialises the board, player resources, and current position;
2. lists every legal action with a constrained index or rotation value;
3. asks for a small JSON object;
4. extracts and parses the first balanced JSON object in the response;
5. validates the selection against the current legal set;
6. retries malformed or illegal output with feedback;
7. falls back to the greedy agent when the retry budget is exhausted.

The model proposes a selection. The engine remains the authority.

## Browser integration

`src/ui/useTurnFlow.ts` drives every AI seat through the same handlers used by a human player. This keeps dice animation, movement, rent prompts, turn advancement, and persistence consistent.

Local agents execute in the browser. The LLM seat calls `/api/ai-move`; if the request fails, the browser uses a local greedy choice so the match can continue.

## Evaluation harness

`eval/arena.ts` runs complete two-player games through the engine. A match:

- uses seeded randomness for reproduction;
- alternates the first seat to reduce first-player bias;
- tracks wins, ties, illegal replies, decision latency, rent, and game length;
- constructs fresh agents and counters for each game.

Examples:

```bash
npm run eval
npm run eval -- search greedy 30
npm run eval -- llm greedy 10
```

The LLM evaluation requires `ANTHROPIC_API_KEY`. All standard automated tests use a fake completion function and do not call an external model.

## Test coverage

- Agent contract tests run full games and assert that every selected move is legal.
- Search tests cover decision perspective and chance weighting.
- LLM tests cover JSON extraction, illegal selections, retries, fallback, and the no-placement case.
- API tests inject a fake model and in-memory store to test validation, rate limiting, and persistence without network or disk dependencies.
