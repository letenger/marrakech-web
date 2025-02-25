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
- [Project structure](#project-structure)
- [Design system](#design-system)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Known simplifications & roadmap](#known-simplifications--roadmap)
- [Credits](#credits)

---

## Features

- **Full turn flow** — rotate → roll → walk → pay rent → place a rug, with legal-move detection and end-of-game scoring.
- **Multi-scene app** — title screen, player setup, the game, an in-game pause menu, and a final standings screen.
- **Custom players** — 2–4 merchants, each renamable (defaults: Peacock, Saffron, Crimson, Amethyst).
- **Save & resume** — the match is snapshotted to `localStorage`, so a refresh or "Resume Game" picks up exactly where you left off.
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

## Project structure

```
src/
├── App.tsx              # scene shell: home | setup | play
├── game/                # ── pure engine (no React) ──
│   ├── types.ts         #   GameState, Player, Rug, Coord, …
│   ├── board.ts         #   board queries (adjacency, connected regions, counts)
│   ├── rules.ts         #   the rules: rotate, move, place, pay, score, winner
│   ├── setup.ts         #   newGame(): a fresh, deterministic board
│   └── io.ts            #   serialize/parse (the assignment's game-string format)
├── ui/                  # ── React components ──
│   ├── BoardView.tsx    #   photographic board + positioned rug/Assam pieces
│   ├── GameScreen.tsx   #   play scene — thin renderer over useTurnFlow
│   ├── useTurnFlow.ts   #   the turn engine: state + roll/walk timer chain + persistence
│   ├── HomeScreen.tsx   #   title screen (New Game / Resume / How to Play)
│   ├── SetupScreen.tsx  #   player count + custom names
│   ├── GameMenu.tsx     #   pause overlay
│   ├── GameOver.tsx     #   final standings
│   ├── RulesPanel.tsx   #   shared rules drawer
│   ├── DiceRoll.tsx     #   tumbling 3D die overlay
│   ├── PaymentPrompt.tsx#   rent / bankruptcy popup
│   ├── Controls.tsx     #   turn controls ("Merchant's Ledger")
│   ├── ScorePanel.tsx   #   per-player dirhams / rugs / score
│   ├── useDialog.ts     #   overlay a11y: focus trap, Escape, focus restore
│   ├── persistence.ts   #   save/resume via localStorage
│   ├── players.ts       #   colour palette, default names, GameConfig
│   ├── game.css         #   design tokens + in-game chrome
│   └── scenes.css       #   scenes + overlays + reduced-motion
└── main.tsx             # React entry point

tests/                   # Vitest specs: rules, setup, io (fixtures), and UI interaction
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
```

---

## Testing

Tests run on **Vitest** and split into two layers:

- **Engine (Node).** Pure-rule specs plus fixture-driven tests that replay the original assignment's game-string scenarios (`tests/fixtures/*.txt`) for movement, placement validity, payment, win detection, and serialization round-trips. Because the rules are pure functions, they need no DOM.
- **UI (jsdom).** Interaction tests with React Testing Library cover scene navigation, the timer-driven turn flow (rotate → roll → walk → place), save/resume persistence, and overlay accessibility (Escape-to-close).

```bash
npm test            # run once
npm run test:watch  # watch mode
```

---

## Known simplifications & roadmap

This is a faithful adaptation with a couple of deliberate gaps, and room to grow:

- **Hot-seat only** — all players share one device. No online play and no AI opponent yet; an AI merchant would be the natural next feature.
- **Lossy assignment format** — `game/io.ts` (the Java game-string format) is kept for its tests but isn't used for save/resume, since it drops turn order, phase, and names. Live saves use a full JSON snapshot instead.
- **Asset size** — `board.png` is ~900 KB; converting it to WebP would roughly halve initial load (skipped here only because no WebP encoder was available locally).

---

## Credits

- *Marrakech* is a board game designed by **Dominique Ehrhard** (published by Gigamic). This is an unofficial, educational fan adaptation.
- Game engine originally ported from a Java coursework implementation, then rebuilt as an immutable, test-driven TypeScript core.

This project is for learning and portfolio purposes and is not affiliated with the publisher.
