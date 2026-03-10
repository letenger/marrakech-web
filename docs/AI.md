# Adding an agentic competitor and an eval harness

A deep technical walkthrough of how Marrakech grew computer opponents and a
measurement harness — what each piece does, why it's shaped that way, and how
the same recipe transfers to any turn-based game.

> **TL;DR.** The game engine is pure, immutable, and rule-validating. That single
> property is what makes agents cheap: an agent only ever picks from the moves
> the engine already declares legal, so it can't cheat or desync. Everything
> below builds on that.

---

## Contents

1. [The architectural precondition](#1-the-architectural-precondition)
2. [Step 1 — Enumerate legal moves in the pure core](#step-1--enumerate-legal-moves-in-the-pure-core)
3. [Step 2 — The agent contract](#step-2--the-agent-contract)
4. [Step 3 — Algorithmic agents](#step-3--algorithmic-agents)
5. [Step 4 — Wiring AI into the UI](#step-4--wiring-ai-into-the-ui)
6. [Step 5 — The LLM agent](#step-5--the-llm-agent)
7. [Step 6 — The eval harness](#step-6--the-eval-harness)
8. [Step 7 — Tests](#step-7--tests)
9. [The debugging story](#the-debugging-story)
10. [Extension ideas](#extension-ideas)

---

## 1. The architectural precondition

None of this works cheaply unless the rules layer obeys three constraints, all of
which `packages/engine/src/game/` already did before any AI existed:

- **Pure** — every rule is `(GameState, …) -> GameState`, no mutation, no I/O,
  no `Date.now()`, no module-level state.
- **Immutable** — rules return a *new* state; the input is never touched. Search
  can therefore explore a move and discard it by simply not keeping the result.
- **Injected randomness** — `rollDie(rng)` and `newGame(n, rng)` take an
  `rng: () => number`. Pass a seeded PRNG and a whole game is reproducible.

If your engine mutates a shared board or reads `Math.random()` internally, fix
that first. Search that mutates its input has to undo every move (error-prone);
search over fresh immutable states just recurses.

---

## Step 1 — Enumerate legal moves in the pure core

**File:** [`packages/engine/src/game/moves.ts`](../packages/engine/src/game/moves.ts)

Before agents existed, "what can I do right now?" lived inside the UI hook. The
first move was to lift it into the engine so the **UI, the agents, and the eval
all share one definition of legality** — if they diverged, an agent could pick a
move the UI would reject, or vice versa.

The key insight is that a Marrakech turn is **two choices separated by a chance
event**:

```
rotate (choose) ──▶ roll the die (chance) ──▶ place a rug (choose)
```

So moves come in two families, enumerated separately:

```ts
export type RotateChoice = 0 | 90 | 270;            // 180 is never legal
export type Placement = { anchor: Coord; second: Coord };

export function legalRotations(): RotateChoice[];          // always [0, 90, 270]
export function legalPlacements(state): Placement[];       // every legal pair
export function applyRotation(state, deg): GameState;      // → 'move' phase
export function applyPlacement(state, placement): GameState; // → advance turn
```

`legalPlacements` is the interesting one. It's a nested filter over the board
geometry:

```ts
legalAnchors(state)   // tiles next to Assam that can hold at least one rug
  → for each, legalSeconds(state, anchor)  // partner tiles that form a legal rug
  → flatten into { anchor, second } pairs
```

Both lean on the existing rule predicates `isPlacementValid` and `isRugValid`,
so the enumerator can never disagree with the validator — it's defined *in terms
of* it. That property is pinned by a test (see Step 7, "parity").

**The transferable recipe:** separate *list legal actions* from *apply an
action*, and make both pure. An agent is then nothing more than a function from
state to one of the listed actions, and the rest of this document is plumbing.

---

## Step 2 — The agent contract

**File:** [`packages/engine/src/game/ai/agent.ts`](../packages/engine/src/game/ai/agent.ts)

Because a turn has two decision points, an agent is **not** a single
`chooseMove(state)`. Modelling it that way would force the die roll and the
placement into one opaque call and lose the chance node. Instead:

```ts
export interface Agent {
  readonly name: string;
  chooseRotation(state: GameState, rng: Rng): RotateChoice;       // before the roll
  choosePlacement(state: GameState, rng: Rng): Placement | null;  // after the roll
}
```

Two design decisions worth calling out:

- **`rng` is threaded in, not captured.** Even an agent's own tie-breaking is
  reproducible — feed the same seed and you get the same choice. This is what
  makes the eval deterministic and test assertions stable.
- **`choosePlacement` may return `null`** — the one legal "non-move", when the
  board offers no placement and the turn passes. Encoding it in the type means
  callers must handle it.

### The sync/async split

Algorithmic agents are synchronous; an LLM agent must do network I/O. Rather than
make everything `async` (and pay that tax in the pure agents and their tests),
there are two interfaces and a lift:

```ts
export interface AsyncAgent {
  chooseRotation(state, rng): Promise<RotateChoice>;
  choosePlacement(state, rng): Promise<Placement | null>;
}

export function toAsync(agent: Agent): AsyncAgent;  // wraps sync results in Promise.resolve
```

The eval harness speaks `AsyncAgent` so it can run any mix of agents uniformly;
`toAsync` lifts the sync ones in for free. This is the adapter pattern doing real
work: it keeps the common case (pure, sync, instantly testable) clean while still
accommodating the I/O case.

---

## Step 3 — Algorithmic agents

**File:** [`packages/engine/src/game/ai/agents.ts`](../packages/engine/src/game/ai/agents.ts)

Three agents, built weakest-to-strongest so each is a baseline for the next.

### The shared heuristic

Every non-random agent scores a position from one player's seat:

```ts
function heuristic(state, me): number {
  if (mine.out) return -Infinity;                 // never bankrupt yourself
  return scoreOf(me) - max(scoreOf(eachOpponent)); // my lead over the best rival
}
```

`scoreOf` is the real game score (dirhams + visible same-colour squares). Using
*lead over the strongest opponent* rather than raw score makes the agent
competitive rather than merely acquisitive — it values denying opponents, not
just growing its own pile. The `-Infinity` for an eliminated self is what stops
the agent walking into rent it can't pay.

### random

```ts
chooseRotation: (_state, rng) => pick(legalRotations(), rng),
choosePlacement: (state, rng) => { const m = legalPlacements(state); return m.length ? pick(m, rng) : null; },
```

Uniform choice over legal moves. Useless as a player, essential as a **baseline**:
any agent worth shipping must beat it convincingly, and the eval quantifies "convincingly".

### greedy — one-ply expected value

For placement, it evaluates every legal move and keeps the best `heuristic`. For
rotation — which happens *before* the die is known — it can't evaluate a single
outcome, so it takes the **expectation over the die distribution**:

```ts
for (const deg of legalRotations()) {
  let ev = 0;
  for (const { value, p } of DIE_DISTRIBUTION) {            // 1→⅙, 2→⅓, 3→⅓, 4→⅙
    const landed = settlePayment(moveAssam(rotated, value)).state;
    ev += p * heuristic(landed, me);
  }
  // keep the rotation with the highest ev
}
```

`DIE_DISTRIBUTION` (exported from `rules.ts`) is the real Marrakech die —
faces `1,2,2,3,3,4`, so 2 and 3 are twice as likely. Weighting by it means greedy
optimises *expected* position, not a uniform-die fiction. Note it also calls
`settlePayment` at each hypothetical landing, so rent is folded into the value.

Greedy has **no opponent model** — it looks one half-turn ahead and stops. It is
nonetheless strong, which is the usual lesson: a good evaluation function with
shallow search beats a mediocre one with deep search.

### search — depth-limited expectiminimax

This is the centrepiece. The game tree alternates three node types:

```
            ┌─ rotate node ─┐   the mover picks a rotation (MAX if me, MIN if opponent)
            │               │
            ▼               ▼
        chance node     chance node      the die: average over DIE_DISTRIBUTION
        ┌──┬──┬──┐
        ▼  ▼  ▼  ▼
     place place …        place node: the mover picks a rug (MAX if me, MIN if opponent)
        │
        ▼
     (next player's rotate node …)        recurse, depth-1
```

Two mutually-recursive functions implement it:

```ts
function rotateValue(state, me, depth): number {
  const maximizing = currentColour === me;
  // optimise over rotations; for each, AVERAGE over the die, then recurse into placement
  best = maximizing ? max(...) : min(...)
}

function searchPlacementValue(state, me, depth): number {
  const maximizing = currentColour === me;
  // optimise over placements; recurse into the next rotateValue at depth-1
  // (depth <= 0 → stop and return heuristic)
}
```

The three crucial details:

1. **The chance node averages, always** — `ev += p * childValue` — regardless of
   whose turn it is. You can't max or min over a die you don't control; you take
   its expectation. That "max/min over choices, average over chance" structure is
   exactly what makes it *expecti*minimax rather than plain minimax.
2. **`maximizing` flips per node based on whose colour is to move.** At my nodes
   we maximise my lead; at an opponent's nodes we *minimise* it, because they
   play for themselves. (This is the subtle bit — see [the debugging story](#the-debugging-story).)
3. **`DEPTH = 2`** plies of (rotate + place) lookahead. Kept deliberately shallow:
   the branching factor is rotations (3) × die outcomes (4) × placements (up to
   ~a dozen), so cost grows fast and the agent must stay responsive in the browser.

### The registry

```ts
export const AGENTS: Record<string, Agent> = { random, greedy, search };
```

A name→agent map so the Setup screen and the eval CLI can both resolve an agent
from a string without knowing the concrete modules.

---

## Step 4 — Wiring AI into the UI

**Files:** [`src/ui/players.ts`](../src/ui/players.ts) (seat types),
[`src/ui/SetupScreen.tsx`](../src/ui/SetupScreen.tsx) (the toggle),
[`src/ui/useTurnFlow.ts`](../src/ui/useTurnFlow.ts) (the driver)

`GameConfig` gained a per-seat control map:

```ts
export type SeatKind = 'human' | 'random' | 'greedy' | 'search';
export type SeatKinds = Record<Colour, SeatKind>;
```

The Setup screen renders a button per seat that cycles `You → AI·Random →
AI·Greedy → AI·Search`. The interesting engineering is the **driver**, a single
`useEffect` in `useTurnFlow`:

```ts
const currentSeat = seats[state.players[state.turnIndex].colour];
const isAITurn = !gameOver && currentSeat !== 'human';

useEffect(() => {
  if (!isAITurn || rolling !== null || walking) return;   // wait out animations
  const agent = AGENTS[currentSeat];

  if (prompt !== null)           setTimeout(() => prompt.onContinue(), AI_PROMPT_MS);
  else if (phase === 'rotate')   setTimeout(() => onRotate(agent.chooseRotation(state, Math.random)), AI_TURN_MS);
  else if (phase === 'move')     setTimeout(() => onRoll(), AI_TURN_MS);
  else if (phase === 'place')    setTimeout(() => { const p = agent.choosePlacement(state, Math.random); … }, AI_TURN_MS);

  return () => clearTimeout(id);  // cancel if state changes first
}, [state, rolling, walking, prompt, isAITurn, currentSeat]);
```

Design principles that matter here:

- **The AI drives the existing flow; it does not bypass it.** It calls the *same*
  handlers a human clicks — `onRotate`, `onRoll`, `placeRug` — so dice animation,
  the cell-by-cell walk, the rent popup, and `localStorage` persistence all keep
  working unchanged. The AI is just a synthetic clicker.
- **It stands back during animations** (`rolling !== null || walking`): the dice
  tumble and the walk own the screen and resolve themselves, then the effect
  re-fires on the resulting state.
- **It's paced** (`AI_TURN_MS = 650`, `AI_PROMPT_MS = 1600`) so a human can
  follow what the opponent is doing, and the cleanup `clearTimeout` cancels a
  pending action if state changes first (e.g. you open the pause menu).
- **`busy || isAITurn`** disables the human controls while the agent acts, so you
  can't fight it for the dice.

---

## Step 5 — The LLM agent

**File:** [`packages/engine/src/game/ai/llm.ts`](../packages/engine/src/game/ai/llm.ts)

This is the part that demonstrates *AI-application* engineering: putting a fuzzy,
fallible model behind a strict interface so the rest of the system can trust it.

### The provider seam

The agent depends on exactly one function:

```ts
export type Complete = (prompt: string) => Promise<string>;
```

That's the whole coupling to "an LLM". Anthropic, OpenAI, a local model, or a
canned fake all satisfy it; swapping providers is one adapter and never touches
the agent logic. (`eval/anthropic.ts` is the real one; `fakeComplete` is the test one.)

### Serialising state into a prompt

`boardToText` renders the 7×7 grid as labelled rows — `.` for sand, a colour
letter for a rug, `@` for Assam — and `playersToText` lists each player's
dirhams/rugs with `(you)` marking the mover. The placement prompt then lists the
legal moves **with indices**:

```
0: anchor (3,2) + (3,1)
1: anchor (3,2) + (2,2)
…
Reply with ONLY a JSON object: {"index": <0..N-1>}.
```

Asking for an **index into the legal list** rather than free-form coordinates is
deliberate: the model picks from a constrained menu, which both shrinks the space
of malformed answers and makes validation a trivial range check.

### Validate-and-retry — the core reliability loop

```ts
let prompt = base;
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  const raw  = await complete(prompt);
  const json = extractJson(raw);                 // tolerant: digs {…} out of prose/fences
  const idx  = json?.index;
  if (Number.isInteger(idx) && idx >= 0 && idx < moves.length) return moves[idx];

  onIllegalMove?.({ phase: 'place', reason: 'index out of range or malformed', raw });
  prompt = `${base}\n\nYour previous reply was invalid (${snippet}). Reply with ONLY {"index": …}.`;
}
return greedyAgent.choosePlacement(state, Math.random);   // budget spent → safe fallback
```

Four properties make this robust:

- **Tolerant parsing.** `extractJson` brace-matches the first balanced `{…}`, so
  the model can wrap its answer in prose or ```` ```json ```` fences and still be
  understood.
- **Strict validation.** A parsed answer is still checked against the *actual*
  legal set. The model never gets to assert a move is legal — the engine decides.
- **Error feedback.** A bad reply is re-prompted *with the failure quoted*, which
  measurably improves the next attempt.
- **Bounded with a safe fallback.** After `maxRetries` (default 2), it returns a
  **greedy** move — so the agent can never stall the game or emit an illegal move,
  no matter how badly the model misbehaves.

The optional `onIllegalMove` callback is the hook the eval uses to *count* how
often the model strays — turning reliability into a measured number.

### Key stays server-side by construction

The LLM agent lives in `packages/engine/src/game/ai/`, but the `complete` function
it depends on is only ever supplied where a key is safe: the **eval harness**
(Node) and the **API server** (`apps/api`). The React app never constructs a
real `complete` — it calls the API's `/api/ai-move` over HTTP — so no API key
reaches the browser bundle. The `Complete` seam is what permits this: the server
*is* a `Complete` implementation reached over the network.

---

## Step 6 — The eval harness

**Files:** [`eval/arena.ts`](../eval/arena.ts),
[`eval/anthropic.ts`](../eval/anthropic.ts),
[`eval/run.ts`](../eval/run.ts) — run with `npm run eval`

The harness lives outside `src/` and runs under `tsx` as a plain Node script, so
it's never in the app bundle and has no timer/RNG restrictions.

### Reproducible games

```ts
function makeRng(seed): () => number { /* mulberry32 */ }
```

Each game gets a seeded PRNG, so game `#7` is byte-for-byte identical every run —
essential for comparing agents fairly and for reproducing a specific game that
exposed a bug.

### Playing a game headlessly

`playGame` runs the full turn loop with **no UI and no animation** — it only
needs the resulting states:

```
rotate (agent) → applyRotation
roll (rng) → settlePayment(moveAssam(...))   // accumulate rent
place (agent or pass) → applyPlacement
… until isGameOver, capped at MAX_TURNS = 2000 (a non-termination backstop)
```

It returns `{ winner, turns, rentPaid }`.

### Fairness, instrumentation, metrics

`runMatch` plays N games and:

- **Alternates the first seat every other game** (`swap = g % 2 === 1`) to cancel
  any first-mover advantage — otherwise a symmetric matchup could look lopsided
  purely from seating.
- **Instruments each agent** by wrapping it so every decision records wall-clock
  latency and a decision count, and the LLM's `onIllegalMove` sink increments an
  illegal-move counter. The wrapping is via an **agent factory** (`(sink) =>
  AsyncAgent`) so fresh counters can be wired per game.

`formatReport` prints a compact table:

```
Match: search vs greedy  —  30 games, 0 ties, avg 45 turns
  search   wins  19 ( 63%)   illegal    0   avg latency 342.6ms
  greedy   wins  11 ( 37%)   illegal    0   avg latency   0.1ms
```

### The CLI

```bash
npm run eval                       # greedy vs random, 50 games (defaults)
npm run eval -- search greedy 100  # 100 games, search vs greedy
npm run eval -- llm greedy 20      # LLM (needs ANTHROPIC_API_KEY) vs greedy
```

`run.ts` resolves each name to an agent factory — algorithmic ones via the
`AGENTS` registry lifted through `toAsync`, and `llm` via `llmAgent` wired to the
Anthropic `Complete` adapter with its illegal-move sink.

---

## Step 7 — Tests

**Files:** [`tests/moves.test.ts`](../tests/moves.test.ts),
[`tests/agents.test.ts`](../tests/agents.test.ts),
[`tests/llm.test.ts`](../tests/llm.test.ts)

Three layers, each guarding a different risk:

- **`moves.test.ts`** — enumeration is correct: anchors are adjacent to Assam,
  seconds adjacent to anchors, `applyPlacement` spends a rug and advances the
  turn, `advanceTurn` skips eliminated players and ends the game correctly. The
  **"parity" test** asserts every enumerated placement is one `makePlacement`
  actually accepts — locking the enumerator to the validator.
- **`agents.test.ts`** — a contract suite run over *all three* agents: every
  choice is engine-legal, choices are deterministic under a fixed seed, and full
  `random`-vs-`random` / `greedy`-vs-`random` games **terminate** (catching any
  infinite-loop regressions in the turn logic).
- **`llm.test.ts`** — the validate-retry loop, entirely offline against
  `fakeComplete`: happy path, prose/fence tolerance, malformed-then-valid retry,
  out-of-range index rejection, and never-complies → greedy fallback.

All pure and fast; the LLM tests never touch the network.

---

## The debugging story

When the search agent was first run against greedy, it **lost**:

```
search   wins   9 ( 30%)
greedy   wins  21 ( 70%)
```

A depth-2 lookahead agent losing to a one-ply greedy agent is a red flag —
deeper search should not play *worse*. The cause was in the recursion: it
maximised *my* score at **every** node, including the opponent's turns. That
models opponents as cooperating with me — optimistic to the point of delusion —
so the deeper it looked, the more it banked on opponents kindly handing it
points. The fix was three characters of intent: flip to **minimising at opponent
nodes** (`maximizing = currentColour === me`), which is what makes it real
adversarial minimax. Re-running:

```
search   wins  19 ( 63%)
greedy   wins  11 ( 37%)
```

The point isn't the bug; it's that **the eval harness caught a smarter-*looking*
agent playing worse, and turned a vague "is this better?" into a number that
made the regression obvious and the fix verifiable.** That measure-diagnose-fix
loop is the entire reason the harness exists.

---

## Extension ideas

Roughly increasing effort:

- **Richer heuristic.** The current one is `myScore − bestOpponent`. Add terms
  for connected-territory size, rug economy (rugs left vs board filled), or
  Assam-position threat. The eval will tell you immediately whether a new term
  helps — change it, run `npm run eval -- search greedy 100`, compare win rate.
- **Deeper search (★-minimax pruning).** The search is plain expectiminimax with
  no pruning, held at `DEPTH = 2` because the branching factor — rotations (3) ×
  die faces (4) × placements (~a dozen) per ply — makes depth 3 measurably
  unusable (minutes per game; measured with `npm run eval`). Plain **alpha-beta
  does not apply** here: the max/min decision nodes sit *above* chance (die)
  nodes, and you can't bound a chance node's expectation until its children are
  evaluated. The correct optimisation is **★-minimax (star1/star2) pruning**,
  which carries running bounds through the chance node and prunes once the
  parent's window is exceeded — pairing that with move ordering (by the one-ply
  heuristic) is what would let the search go deeper at the same cost.
- **More eval metrics.** `rentPaid` is already tracked per game but not yet
  surfaced in the report; average rent extracted/paid is a good strategic signal.
- **A second LLM provider.** Write an `openaiComplete` next to `anthropicComplete`
  — the agent doesn't change at all, which is the point of the `Complete` seam.
- **Self-play tuning.** Use the harness as a fitness function to tune heuristic
  weights (hill-climbing or a small CMA-ES loop), scoring candidates by win rate
  against a fixed reference agent.

