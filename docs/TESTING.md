# Testing

Marrakech is tested in layers that mirror its architecture. The guiding idea:
**push correctness into pure functions, and test those exhaustively; keep the
impure edges (React effects, timers, I/O) thin and test them for wiring, not
logic.** That's why the bulk of the coverage sits in the engine, where tests
need no DOM, no network, and no mocks.

**79 tests across 8 files**, all runnable offline (no API key, no live model):

```bash
npm test            # run everything once (Vitest)
npm run test:watch  # watch mode
npx vitest run tests/agents.test.ts          # a single file
npx vitest run apps/api/tests                 # just the API suite
```

Resolution note: tests import the engine as `@marrakech/engine`, resolved by a
Vitest alias (shared with Vite) to the package source — so there's no build step
between editing the engine and testing it.

| Layer | File | Tests | Guards |
|---|---|---|---|
| Rules (pure) | `tests/rules.test.ts` | 20 | Movement, rotation, placement, rent, scoring, win. |
| Assignment parity | `tests/assignment-data.test.ts` | 7 | 100+ original Java cases → TS rules match. |
| Move enumeration | `tests/moves.test.ts` | 9 | Legal-move list ≡ what the validator accepts. |
| Setup | `tests/setup.test.ts` | 7 | New-game invariants (rug counts, Assam, etc.). |
| Agents | `tests/agents.test.ts` | 6 | Every agent plays legal, deterministic, terminating. |
| LLM loop | `tests/llm.test.ts` | 7 | Parse-tolerant, validate, retry, fallback — offline. |
| API routes | `apps/api/tests/app.test.ts` | 7 | Endpoints, validation, rate limit, persistence. |
| UI interaction | `tests/ui.test.tsx` | 6 | Scene flow, the timer-driven turn, a11y — jsdom. |

---

## The engine layer (pure, Node)

The engine is the crown jewel of the test suite because it's pure: deterministic
inputs, deterministic outputs, no environment.

### Rules & setup

`rules.test.ts` and `setup.test.ts` cover the game logic directly — Assam's
movement including the edge-fold wrap, rotation, placement validity, the
connected-region rent calculation, scoring, and the game-over/winner logic.
`setup.test.ts` pins the new-game invariants, including the player-count-
dependent rug counts (24/15/12 for 2/3/4 players).

**Determinism comes from an injected RNG.** `newGame(n, rng)` and `rollDie(rng)`
take an `rng: () => number`, so a test passes a fixed function (e.g. `() => 0`)
and gets a reproducible game. No global `Math.random` to stub.

### Assignment parity — the safety net

`assignment-data.test.ts` replays **100+ cases from the original COMP1110 Java
assignment** (`tests/fixtures/*.txt`, 15 fixture files) through the pure TS rules
and asserts the outputs match. This is what proves the port didn't drift from the
reference semantics — it's regression insurance for the whole rules layer.

It relies on the lossy Java game-string format only to *load* those fixtures.
That format is **not** part of the shipped engine (it dropped turn order, phase,
and names); the `parse`/`serialize` helpers live test-only in
[`tests/helpers/gameString.ts`](../tests/helpers/gameString.ts) so the fixtures
still run without exposing the format in `@marrakech/engine`.

### Move enumeration — the parity lock

`moves.test.ts` guards the one invariant that everything else leans on: the
legal-move enumerator (`legalPlacements`/`legalRotations`) must agree with the
validator (`isPlacementValid`). Its **parity test** asserts every enumerated
placement is one `makePlacement` actually accepts — so the UI, the agents, and
the eval can never offer a move the engine would reject.

<!-- APPEND-MARKER -->
---

## The AI layer

### Agents (contract, not fixtures)

`agents.test.ts` runs one **contract suite over all three agents** — every
`chooseRotation`/`choosePlacement` returns an engine-legal move, choices are
deterministic under a fixed seed, and full `random`-vs-`random` /
`greedy`-vs-`random` games **terminate** (catching any infinite-loop regression
in the turn logic). It doesn't assert *which* move — that's the eval's job — only
that agents obey the rules and halt.

### LLM loop (offline, against a fake model)

`llm.test.ts` exercises the reliability loop with **no network** — a
`fakeComplete(reply)` returns a canned string:

- happy path (well-formed JSON → the chosen move),
- tolerant parsing (prose / ```` ```json ```` fences around the object),
- **retry** — malformed reply, then a valid one on the next attempt,
- **rejection** — an out-of-range placement index is refused,
- **fallback** — a model that never complies → a legal greedy move.

This is where the "put a fuzzy model behind a strict interface" guarantees are
actually proven.

> The **eval harness** (`npm run eval`) is *measurement*, not part of the test
> suite — it plays agents head-to-head and reports win-rate / illegal-rate /
> latency. It's how strength regressions are caught (e.g. the search-agent
> minimax bug), but it isn't run by `npm test`. See [`AI.md`](AI.md).

---

## The API layer (Hono, `app.request`)

`apps/api/tests/app.test.ts` tests the server via Hono's in-process
`app.request()` — no socket, no port. The `createApp({ complete, store })`
factory takes its dependencies, so tests inject **`fakeComplete` + `MemoryStore`**
(no key, no disk). It checks:

- `/api/ai-move` returns a legal rotation/placement for the posted state,
- a malformed body → **400**, a flood from one IP → **429** (rate limit),
- the full games lifecycle: create → read → update, and **404** on an unknown id.

It deliberately does **not** re-prove move legality — the engine layer already
owns that. The API tests guard the HTTP envelope: status codes, validation,
limits, and persistence round-trips.

---

## The UI layer (jsdom + React Testing Library)

`tests/ui.test.tsx` targets the **impure hazards** the pure layers can't reach —
timers, effects, async, focus. With fake timers driving the turn flow, it covers
scene navigation (Home → Setup → Play), the timer-driven
rotate → roll → walk → settle chain (the exact class of bug that once caused a
white screen), save/resume against a stubbed `localStorage`, and dialog
accessibility (Escape-to-close). The components stay thin renderers over
`useTurnFlow`, so there's little component logic to test beyond this wiring.

---

## What is deliberately not tested

- **Live LLM calls.** The real Anthropic adapter is a thin SDK wrapper; the logic
  that matters (validate/retry/fallback) is proven against `fakeComplete`. A live
  call is a manual/eval step, gated on a key.
- **Visual rendering / CSS.** The Souk theme is verified by eye, not snapshots —
  snapshot tests on styling are brittle and low-value here.
- **The build pipeline.** Covered by the `tsc` + `lint` + `build` gates rather
  than unit tests.

---

## Where to add a test

| Changing… | Add/extend a test in… |
|---|---|
| A game rule (movement, rent, scoring, win) | `tests/rules.test.ts` |
| Legal-move enumeration / apply | `tests/moves.test.ts` |
| An agent or the heuristic | `tests/agents.test.ts` (+ check `npm run eval`) |
| The LLM prompt / parse / retry logic | `tests/llm.test.ts` |
| An API route, validation, or the store | `apps/api/tests/app.test.ts` |
| A scene, the turn flow, or an overlay | `tests/ui.test.tsx` |
| New-game setup invariants | `tests/setup.test.ts` |

Before committing, run the full gate set: `tsc` (engine/app/api), `npm run lint`,
`npm test`, `npm run build`.

