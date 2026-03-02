# Deploy plan — frontend · backend · fullstack · AI agentic

How to take Marrakech from "a great front-end with an eval-only AI" to a
deployed full-stack app where the LLM opponent is playable in the browser —
covering all four CV pillars with one coherent backend.

---

## Where the project stands

| Pillar | Today | After this plan |
|---|---|---|
| **Frontend** | ✅ React 19, scenes, bespoke CSS, a11y | ✅ unchanged, + talks to an API |
| **AI / agentic** | 🟡 agents + eval, but LLM is **eval-only (Node)** | ✅ LLM opponent **playable in production** |
| **Backend** | ❌ none | ✅ Node API: AI-move + game persistence |
| **Fullstack** | ❌ none | ✅ FE ↔ API ↔ DB, deployed |

The insight: **one small backend creates all three missing pillars at once.** It
holds the API key (so the LLM is reachable from the browser), persists games to a
DB (backend + fullstack), and gives you a deployed URL. The existing `Complete`
seam in [`src/game/ai/llm.ts`](../src/game/ai/llm.ts) is already the exact
abstraction needed: the server *is* a `Complete` implementation reached over HTTP.

**Decisions locked:** standalone Node API · split hosting (Vercel front-end +
Fly.io/Railway back-end).

---

## Target architecture

```
┌─────────────────────────┐         ┌──────────────────────────────────────┐
│  Browser (Vercel)        │  HTTPS  │  API server (Fly.io / Railway)         │
│  React app               │ ──────▶ │  Hono on Node                          │
│   • algorithmic agents   │         │   • POST /api/ai-move                  │
│     run locally (fast)   │         │       └─ validates with shared rules,  │
│   • LLM agent calls API ─┼────────▶│          calls Anthropic (key here)    │
│   • games saved via API ─┼────────▶│   • POST /api/games  GET /api/games/:id│
└─────────────────────────┘         │       └─ Postgres (Fly/Railway)        │
                                     └──────────────────────────────────────┘
        shared, imported by both:  src/game/** (pure engine + agents)
```

The pure engine (`src/game/`) is imported by **both** sides — the browser for
local play, the server for authoritative move validation. That shared,
trusted core is what keeps the client honest: the server never believes a move
is legal just because the client says so.

---

## Phase 0 — Repo shape (monorepo-lite)

Keep one repo; split into workspaces so the shared engine has one home.

```
marrakech/
├── packages/
│   └── engine/        # move src/game/** here → @marrakech/engine (pure, no React, no DOM)
├── apps/
│   ├── web/           # the current Vite app, depends on @marrakech/engine
│   └── api/           # NEW: Hono server, also depends on @marrakech/engine
├── eval/              # unchanged; depends on @marrakech/engine
└── package.json       # npm workspaces
```

- Use **npm workspaces** (already on npm) — add `"workspaces": ["packages/*", "apps/*"]`.
- The engine has **zero runtime deps** and no DOM/React imports, so it drops into a package untouched. This is the payoff of the pure-core architecture.
- *Lower-effort alternative:* skip the monorepo and have `apps/api` import the engine via a relative path or a path alias. Workspaces are cleaner and read better on a CV, but either works.

---

## Phase 1 — The backend API (`apps/api`)

**Stack:** [Hono](https://hono.dev) on Node (tiny, typed, runs identically on Node/Fly/serverless), `@anthropic-ai/sdk` (already a dep), Postgres via `pg` or Drizzle ORM.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/ai-move` | Body: `{ state, phase }`. Server enumerates legal moves with the **shared engine**, prompts the LLM, validates & retries, returns `{ rotation }` or `{ placementIndex }`. Key never leaves the server. |
| `POST` | `/api/games` | Persist a game snapshot (`{ config, state }`); returns an id. |
| `GET` | `/api/games/:id` | Load a snapshot (cross-device resume / shareable game). |
| `GET` | `/api/health` | Liveness for the platform health check. |

`/api/ai-move` is almost entirely **reused code**: lift the prompt-building and
validate-retry loop out of `llm.ts` so both the eval's `Complete` and the HTTP
handler share it. The server-side `Complete` is the Anthropic adapter that
[`eval/anthropic.ts`](../eval/anthropic.ts) already implements.

### Hardening (matters for a backend story)

- **Rate-limit** `/api/ai-move` (per-IP token bucket) — it spends money.
- **Validate the request body** with `zod`; reject malformed `GameState` (don't trust the client).
- **CORS** locked to the Vercel origin.
- **Never trust client legality** — the server re-derives legal moves from the posted state; an LLM (or a tampering client) can't smuggle an illegal move through.
- **Secrets** (`ANTHROPIC_API_KEY`, `DATABASE_URL`) from env only; never in the repo or the bundle.

### Data model (Postgres)

```sql
create table games (
  id          uuid primary key default gen_random_uuid(),
  config      jsonb not null,     -- player count, names, seat kinds
  state       jsonb not null,     -- the GameState snapshot
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
```

`GameState` is plain JSON-serialisable data, so `jsonb` is a natural fit and you
get a working save/load with one table.

---

## Phase 2 — Frontend wiring (`apps/web`)

The browser stays mostly as-is; the only new idea is **which `Complete` to use**:

- **Algorithmic agents** (`random`/`greedy`/`search`) keep running **locally** — they're pure and fast, no round-trip needed. This is a nice talking point: not everything needs the server.
- **LLM agent** gets a browser `Complete` that POSTs to `/api/ai-move`. Add `'llm'` to `SeatKind`, and the Setup toggle gains an **AI · LLM** option.
- **Save/resume** optionally writes through to `/api/games` in addition to `localStorage`, enabling cross-device resume and shareable game links.

Use a `VITE_API_URL` env var so dev points at `localhost` and prod at the Fly/Railway URL.

> Security note already handled by design: because the key lives only on the
> server, the in-browser LLM opponent is safe — exactly the gap the current
> "eval-only" LLM agent leaves open.

---

## Phase 3 — Deployment

### Backend → Fly.io (or Railway)

1. `Dockerfile` for `apps/api` (Node 20 slim, `npm ci`, build, `node dist/server.js`).
2. `fly launch` → set secrets: `fly secrets set ANTHROPIC_API_KEY=… DATABASE_URL=…`.
3. Provision Postgres: `fly postgres create` (or Railway's one-click Postgres) and attach.
4. Health check → `/api/health`; set min-machines so it doesn't cold-start mid-game.

### Frontend → Vercel

1. Import the repo; set **root** to `apps/web`, build `npm run build`, output `dist/`.
2. Env: `VITE_API_URL=https://<your-api>.fly.dev`.
3. Auto-deploys on push to `main`.

### Glue

- **CORS** on the API → allow the Vercel domain.
- Put the **live URL at the top of the README** with a screenshot/GIF — the single biggest credibility multiplier for any reviewer.

---

## Phase 4 — CI/CD (small, high-signal)

A GitHub Actions workflow on PR + `main`:

```
lint  →  typecheck  →  test (all workspaces)  →  build
                                                   ├─ deploy api  (Fly, on main)
                                                   └─ deploy web  (Vercel auto)
```

Even just **lint + typecheck + test on PR** signals professional habits; the
deploy steps make it true CD.

---

## Phase 5 — Optional: the "wow" tier (real-time multiplayer)

Once the API exists, upgrading to an **authoritative WebSocket game server** is
the standout fullstack feature — and the pure engine makes it tractable: the
server holds `GameState`, clients send *intents* (rotate/roll/place), the server
validates each with the shared rules and broadcasts the new state. Same
"never trust the client" principle, now over a socket. Scope it as a follow-up,
not part of the first deploy.

---

## Suggested sequencing

| Step | Outcome | Pillars unlocked |
|---|---|---|
| 1. Workspaces + extract `@marrakech/engine` | Shared core, no behaviour change | — |
| 2. `apps/api` with `/api/ai-move` | LLM opponent works locally end-to-end | **backend, AI in-app** |
| 3. Frontend `Complete` → API + `AI · LLM` seat | Play the LLM in the browser | **fullstack** |
| 4. Postgres + `/api/games` | Server-side save/load | deepens backend |
| 5. Deploy (Fly + Vercel) + live URL in README | A thing people can play | **all four, in production** |
| 6. CI/CD | Automated quality gate + deploy | professionalism |
| 7. (optional) WebSocket multiplayer | Real-time authoritative server | fullstack showcase |

Stop after step 5 and you already cover **frontend, backend, fullstack, and
agentic AI** with a live URL. Steps 6–7 are polish and showcase.

---

## What to claim on a CV afterwards

- **Frontend** — React 19 SPA, hand-built design system, accessibility, animation.
- **Backend** — Typed Node/Hono API, Postgres persistence, rate limiting, input validation, secret management.
- **Fullstack** — Shared TypeScript domain core imported by both client and server; server-authoritative move validation; deployed split FE/BE with CI/CD.
- **AI / agentic** — Expectiminimax search agent + an **LLM agent behind a provider-agnostic seam with validate-and-retry and a deterministic fallback**, measured by a reproducible eval harness (win-rate, illegal-move rate, latency). The eval caught a real adversarial-search bug — a concrete "I measure and harden agents" story.
