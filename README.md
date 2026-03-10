# Marrakech

**Rug merchants of the medina** — a digital adaptation of the board game *Marrakech*, built in React + TypeScript. Steer Assam the merchant around a 7×7 souk, lay down your rugs, and charge your rivals rent when they tread on your colour.

The board, rugs, and Assam are real photographed pieces; everything around them is a hand-built **"Moroccan Souk"** interface — warm terracotta, saffron, and tarnished brass, with no UI framework.

> **Status:** playable hot-seat game for 2–4 players on a single device.

<!-- Add screenshots to a docs/ folder and link them here, e.g.:
![Title screen](docs/home.png)
![In game](docs/game.png)
-->

---

## Table of contents

- [Features](#features)
- [Game rules](#game-rules)
- [How to play (the app)](#how-to-play-the-app)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [AI opponents & evaluation](#ai-opponents--evaluation)
- [Project structure](#project-structure)
- [Design system](#design-system)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Known simplifications & roadmap](#known-simplifications--roadmap)
- [Further reading](#further-reading)
- [Credits](#credits)

---

## Features

- **Full turn flow** — rotate → roll → walk → pay rent → place a rug, with legal-move detection and end-of-game scoring.
- **Multi-scene app** — title screen, player setup, the game, an in-game pause menu, and a final standings screen.
- **Custom players** — 2–4 merchants, each renamable (defaults: Peacock, Saffron, Crimson, Amethyst).
- **Save & resume** — the match is snapshotted to `localStorage`, so a refresh or "Resume Game" picks up exactly where you left off.
- **AI opponents** — any seat can be a computer player (random, greedy, or an expectiminimax search agent) or the server-backed **LLM opponent**, plus a `npm run eval` harness for measuring agents head-to-head. See [AI opponents & evaluation](#ai-opponents--evaluation).
- **Animated feedback** — a tumbling 3D die that lands on the rolled face, Assam pacing the board cell by cell, and a rent popup that itemises every dirham and point that changes hands.
- **Accessible overlays** — dialogs trap focus, close on `Escape`, restore focus on close, and all motion honours `prefers-reduced-motion`.
- **Photographic board** — pieces positioned in fractions of the real board image, so the layout scales responsively.
- **Pure, tested game engine** — all rules live in a UI-free core, covered by unit, fixture, and interaction tests.

---

## Game rules

Marrakech is a game of area control and economics. You manoeuvre a shared merchant, **Assam**, and use his position to lay your own rugs while collecting rent from opponents.

### Setup
- A **7×7** market board. Assam starts in the centre, facing a random direction.
- Each player begins with **30 dirhams**. Rugs are dealt by player count, as in the physical game: **24 each for 2 players, 15 for 3, 12 for 4**.

### A turn, in four steps
1. **Rotate Assam** — turn him a quarter-turn left, a quarter-turn right, or leave him facing straight. He may *never* spin a full half-turn.
2. **Roll & walk** — roll the special die (faces **1, 2, 2, 3, 3, 4**) and walk Assam that many squares forward. If he would leave the board, he folds back onto it along the painted track at the edge.
3. **Pay rent** — if Assam lands on an **opponent's** rug, you pay them **one dirham per tile** in that connected patch of their colour. Land on bare sand or your own rug, and nothing is owed. If you can't pay in full, you hand over everything you have and are **eliminated**.
4. **Lay a rug** — place a rug covering **two adjacent squares**, at least one of them next to Assam. A rug may partially overlap existing rugs, but may **not** completely bury a single rug. (If there's no legal placement, your turn simply passes.)

### Winning
The game ends once the players still in it have placed all their rugs. Your **score** is your **dirhams + every visible square of your colour** on the board. Highest score wins; ties are broken by remaining dirhams.

> Note: one rug covers two squares, but scoring counts *visible squares* — so a rug that has been partly covered may be worth fewer points than the two it started with.

---

## How to play (the app)

1. **New Game** on the title screen → **Setup** (or **Resume Game** to continue a saved match).
2. Pick the number of players (2–4) and optionally rename each colour (up to 12 letters).
3. **Start Market** to begin. The current player is highlighted with a glow in their own colour.
4. Use the **control panel** ("Merchant's Ledger") to rotate, roll, and then click two tiles on the board to lay your rug.
5. The **❖ menu** (top-right) pauses the game: resume, review the rules, restart, or quit to the title screen.

---

## Tech stack

| Area | Choice |
|---|---|
| Language | TypeScript 6 (strict-ish: `noUnusedLocals`, `noUnusedParameters`) |
| UI | React 19 |
| Build/dev | Vite 8 |
| Tests | Vitest 4 — pure-rule + fixture tests (Node) and interaction tests (jsdom + React Testing Library) |
| Styling | Hand-written CSS with design tokens — **no UI framework** |
| Fonts | Cormorant Garamond (display) + Inter (body), via Google Fonts |
| Lint | ESLint 10 + typescript-eslint (type-aware) |
| Persistence | `localStorage` (save/resume) |
| AI | Pure-engine agents (expectiminimax search) + an eval harness run with `tsx`; LLM agent via the Anthropic SDK |

No state-management library and no CSS framework — state is plain React, and the look is bespoke CSS by design.

---

## Architecture

The guiding principle is a hard split between **the rules** and **the screen**.

```
┌─────────────────────────────────────────────┐
│  src/ui/  — React: scenes, board, controls   │   "how it looks & feels"
├─────────────────────────────────────────────┤
│  src/game/ — pure functions, no React, no DOM │   "what the rules are"
└─────────────────────────────────────────────┘
```

**`src/game/` (the engine)** is entirely UI-free and treats `GameState` as immutable — every rule takes a state and returns a *new* one. Randomness is injected (`rng: () => number`) so games are deterministic under test. This is what let the interface be rebuilt twice without ever touching the logic.

**`src/ui/` (the shell)** is a small scene state machine. `App.tsx` owns only the current scene (`home | setup | play`), the player config, and any resumable save; each scene is its own component. The in-game turn flow lives in a dedicated **`useTurnFlow` hook** (state, the roll/walk timer chain, and persistence), so `GameScreen` stays a thin renderer and the flow is unit-testable on its own.

The flow per turn:

```
rotate ──▶ roll (dice overlay) ──▶ walk (cell by cell)
   ▲                                      │
   └──────── place rug ◀── pay rent ◀──────┘
                          (popup if owed)
```

---

## AI opponents & evaluation

Any seat can be handed to a computer player from the Setup screen. Because the engine is pure, immutable, and rule-validating, the agents reuse it directly — they choose from the same `legalRotations` / `legalPlacements` the UI offers a human, so an agent can never make an illegal move or desync from the board.

> **Deep dive:** [`docs/AI.md`](docs/AI.md) walks through every file — the move enumerator, the expectiminimax tree, the LLM validate-retry loop, the eval harness, and the debugging story — and generalises the recipe to any turn-based game.

### The agent contract

A Marrakech turn has **two decisions split by a chance event** — rotate → *roll the die* → place — so an agent isn't one `chooseMove`; it's two pure functions with the die in between, each given a seeded `rng` so even tie-breaking is reproducible:

```ts
interface Agent {
  chooseRotation(state, rng): RotateChoice;       // before the roll
  choosePlacement(state, rng): Placement | null;  // after the roll (null = pass)
}
```

A parallel `AsyncAgent` interface (plus a `toAsync` lift) lets the I/O-bound LLM agent and the synchronous algorithmic agents run through one harness without making the pure agents async.

### The agents

| Agent | Strategy |
|---|---|
| **random** | Uniform choice over legal moves. The baseline every eval measures against. |
| **greedy** | One-ply lookahead, no opponent model. Placement picks the best immediate board; rotation (chosen *before* the die) takes the **expected value over the die distribution**. Fast and surprisingly strong. |
| **search** | Depth-2 **expectiminimax** over the real game tree: rotate/place are decision nodes, the die is a chance node. |

All three share one evaluation function — `heuristic = scoreOf(me) − scoreOf(strongest opponent)`, with self-bankruptcy valued at −∞ — so an agent plays *competitively* (denying opponents), not just acquisitively, and never walks into rent it can't pay.

The search agent models the turn structure explicitly and rests on three invariants:

1. **Chance nodes always average** — `Σ p(die) · childValue` — whoever is moving; you take the die's expectation, you can't optimise over it. (That "optimise over choices, average over chance" shape is what makes it *expecti*minimax.)
2. **Decision nodes flip perspective** — maximise the heuristic at my nodes, **minimise** it at opponents' nodes, since they play for themselves.
3. **Depth is deliberately shallow** (`DEPTH = 2`): branching is rotations (3) × die outcomes (4) × placements (~dozen), so cost climbs fast and the agent must stay responsive in the browser.

### In the UI

The "vs Computer" driver is one `useEffect` in `useTurnFlow` that, on an AI seat, calls the **same handlers a human clicks** (`onRotate`, `onRoll`, `placeRug`) on a short timer — so the dice tumble, the cell-by-cell walk, the rent popup, and `localStorage` persistence all keep working unchanged. The AI is a synthetic clicker, not a bypass; it waits out animations and disables the human controls while it acts.

### Eval harness

`npm run eval` plays N **seeded** (reproducible) games between any two agents, alternating the first seat to cancel first-mover bias, and reports win rate, illegal-move rate, decision latency, and game length:

```bash
npm run eval                       # greedy vs random, 50 games
npm run eval -- search greedy 100  # 100 games, search vs greedy
npm run eval -- llm greedy 20      # LLM (needs ANTHROPIC_API_KEY) vs greedy
```

Sample run:

```
Match: search vs greedy  —  30 games, 0 ties, avg 45 turns
  search   wins  19 ( 63%)   illegal    0   avg latency 342.6ms
  greedy   wins  11 ( 37%)   illegal    0   avg latency   0.1ms
```

> The harness earned its keep: an early `search` scored **30%** — losing to `greedy` — because it optimistically maximised *its own* score at opponent nodes instead of modelling them as adversaries. Flipping to minimise at opponent nodes took it to **63%**. The eval is what surfaced a smarter-*looking* agent that was actually playing worse, and turned the fix into a verifiable number.

### LLM opponent

[`packages/engine/src/game/ai/llm.ts`](packages/engine/src/game/ai/llm.ts) is a **provider-agnostic** agent behind a one-function seam — `complete(prompt) => Promise<string>`, so swapping Anthropic / OpenAI / a fake is one adapter. It:

1. **Serialises** the board to a text grid (`.`/colour/`@`) and lists the legal placements **with indices**, so the model picks from a constrained menu rather than emitting free-form coordinates.
2. **Parses tolerantly** — brace-matches the first balanced `{…}`, so prose or ```` ```json ```` fences around the answer are fine.
3. **Validates strictly** against the *actual* legal set — the engine decides legality, never the model.
4. **Retries with the error fed back**, and after the budget (default 2) **falls back to the greedy agent** — so it can never stall the game or play an illegal move.

This validate-and-retry-with-fallback loop is the core reliability pattern for putting a fuzzy model behind a strict interface. The API key lives only on the **server** (`apps/api`), so the LLM opponent is playable in the browser without ever exposing the key. Its tests run fully offline against a fake `complete`.

### The API server (`apps/api`)

A small [Hono](https://hono.dev) service on Node holds the LLM key and persists games, so the browser can face the LLM opponent and resume games across devices.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness. |
| `POST` | `/api/ai-move` | Body `{ state, phase }` → a legal `{ rotation }` or `{ placement }`. The server re-derives legal moves from the posted state, so it can never return an illegal move — the client is never trusted for legality. |
| `POST` / `GET` / `PUT` | `/api/games[/:id]` | Save / load / update a game (SQLite via `node:sqlite`, behind a `GameStore` interface that a Postgres impl can replace). |

Zod validates every body; CORS is locked to the web origin; `/api/ai-move` is rate-limited (it spends money). The app is a `createApp({ complete, store })` factory, so tests inject a fake model and an in-memory store — no key, no disk.

```bash
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev:api           # API on http://localhost:8787
npm run dev               # web on http://localhost:5173 (in another shell)
```

Then in **Setup**, tap a seat until it reads **AI · LLM**. Full end-to-end architecture and deployment (Vercel + Fly.io) are in [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Project structure

```
packages/engine/          # @marrakech/engine — pure game core (no React, no DOM)
└── src/
    ├── index.ts           #   barrel: the package's public API
    └── game/
        ├── types.ts       #   GameState, Player, Rug, Coord, …
        ├── board.ts       #   board queries (adjacency, connected regions, counts)
        ├── rules.ts       #   the rules: rotate, move, place, pay, score, winner
        ├── moves.ts       #   legal-move enumeration + apply (shared by UI, AI, eval)
        ├── setup.ts       #   newGame(): a fresh, deterministic board
        └── ai/            #   ── agents (pure) ──
            ├── agent.ts   #     Agent / AsyncAgent contracts
            ├── agents.ts  #     random, greedy, expectiminimax search
            └── llm.ts     #     provider-agnostic LLM agent + validate-retry loop

apps/api/                 # @marrakech/api — Hono server (LLM proxy + persistence)
└── src/
    ├── app.ts             #   createApp({complete, store}): routes, zod, CORS, rate limit
    ├── server.ts          #   entry: wires the Anthropic adapter + SQLite store
    ├── anthropic.ts       #   Anthropic-backed Complete adapter (key server-side only)
    ├── store.ts           #   GameStore: node:sqlite + in-memory impls
    └── rateLimit.ts       #   in-memory per-IP limiter

src/                      # the web app (Vite + React), depends on @marrakech/engine
├── App.tsx               #   scene shell: home | setup | play
├── ui/
│   ├── BoardView.tsx      #   photographic board + positioned rug/Assam pieces
│   ├── GameScreen.tsx     #   play scene — thin renderer over useTurnFlow
│   ├── useTurnFlow.ts     #   turn engine: state + roll/walk + AI auto-play + persistence
│   ├── aiClient.ts        #   calls /api/ai-move for the LLM seat
│   ├── HomeScreen · SetupScreen · GameMenu · GameOver · RulesPanel
│   ├── DiceRoll · PaymentPrompt · Controls · ScorePanel
│   ├── useDialog.ts       #   overlay a11y: focus trap, Escape, focus restore
│   ├── persistence.ts     #   save/resume via localStorage
│   ├── players.ts         #   palette, names, GameConfig, seat kinds
│   └── game.css · scenes.css
└── main.tsx

eval/                     # AI eval harness (Node, run with tsx — outside the app build)
├── arena.ts              #   play seeded games between agents; aggregate metrics
├── anthropic.ts          #   Anthropic-backed `complete` adapter for the LLM agent
└── run.ts                #   CLI entry — `npm run eval`

tests/                    # Vitest: rules, moves, setup, agents, llm, assignment-data,
                          #   UI interaction; helpers/gameString.ts (test-only format)
docs/                     # AI.md · DEPLOY.md · ERD.md · TESTING.md
```

---

## Design system

The UI deliberately avoids the generic "tech dashboard" look in favour of a tactile, thematic feel.

- **Palette** — warm terracotta, deep amber, saffron, burnt sienna, dusty night blue, and tarnished brass accents (defined as CSS custom properties in `game.css`).
- **Materials** — parchment cards with brass keylines and inner shadow; buttons styled as stamped-leather / brass tokens that physically *sink* on press.
- **Typography** — Cormorant Garamond for headers and messages, Inter for numbers and controls.
- **Motion** — scene-enter transitions, a 3D die tumble, Assam's cell-by-cell walk, and pop animations on overlays.
- **Touches of theme** — the active player's row glows in their own rug colour; the menu is a brass mosaic tile.

All of it is hand-written CSS with shared tokens, so the theme is consistent and trivially re-tunable from one place.

---

## Getting started

**Prerequisites:** Node.js 20+ and npm.

```bash
npm install        # install dependencies
npm run dev        # start the dev server (http://localhost:5173)
npm run build      # type-check and build for production → dist/
npm run preview    # preview the production build locally
npm test           # run the test suite
npm run lint       # lint
npm run eval       # play AI agents against each other (see AI section)
```

---

## Testing

Tests run on **Vitest** and split into two layers:

- **Engine (Node).** Pure-rule specs plus fixture-driven tests that replay the original assignment's game-string scenarios (`tests/fixtures/*.txt`) for movement, placement validity, payment, and win detection — 100+ cases proving the TS port matches the Java semantics. Because the rules are pure functions, they need no DOM.
- **UI (jsdom).** Interaction tests with React Testing Library cover scene navigation, the timer-driven turn flow (rotate → roll → walk → place), save/resume persistence, and overlay accessibility (Escape-to-close).

```bash
npm test            # run once
npm run test:watch  # watch mode
```

---

## Known simplifications & roadmap

This is a faithful adaptation with a couple of deliberate gaps, and room to grow:

- **Local play** — humans and AI agents share one device. No online/networked multiplayer yet; the API server already validates moves with the shared engine, so an authoritative WebSocket game host is the natural next step (see [`docs/DEPLOY.md`](docs/DEPLOY.md)).
- **Search depth** — the expectiminimax agent looks two plies ahead with no pruning: deliberately shallow for a responsive browser (depth 3 is measurably unusable — minutes per game). Plain alpha-beta doesn't apply above chance nodes; the correct deeper-search optimisation is **\*-minimax (star1/star2) pruning**, noted in [`docs/AI.md`](docs/AI.md).
- **Deployment** — everything runs locally (web + API + eval); it isn't yet deployed to a public URL. [`docs/DEPLOY.md`](docs/DEPLOY.md) has the Vercel + Fly.io plan.

---

## Further reading

In-depth docs live in [`docs/`](docs/):

- [**AI.md**](docs/AI.md) — how the agents and eval harness work, end to end: move enumeration, the expectiminimax tree, the LLM validate-retry loop, and the debugging story behind the search agent.
- [**TESTING.md**](docs/TESTING.md) — the test strategy: the pure-core / interaction / API layers, what each guards, and how to run and extend them.
- [**ERD.md**](docs/ERD.md) — the data model: the `GameState` domain entities and the persistence schema, with an entity-relationship diagram.
- [**DEPLOY.md**](docs/DEPLOY.md) — the plan to deploy the web app + API (Vercel + Fly.io) and reach frontend / backend / fullstack / agentic in production.

---

## Credits

- *Marrakech* is a board game designed by **Dominique Ehrhard** (published by Gigamic). This is an unofficial, educational fan adaptation.
- Game engine originally ported from a Java coursework implementation, then rebuilt as an immutable, test-driven TypeScript core.

This project is for learning and portfolio purposes and is not affiliated with the publisher.
