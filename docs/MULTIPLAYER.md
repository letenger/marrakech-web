# Public lobby and online rooms

Choose **Play online**, enter a guest display name, and create a room or request entry to an existing public room. Hosts approve requests; accepted players choose unique colours and mark themselves ready. A host can start with 2–4 connected, ready seats, including AI opponents, up to the room capacity. Copy the room invitation or enter its code to find it directly; invitations still require host approval.

## Run locally

Use Node.js 22.13+ (the API uses `node:sqlite`). Run the web app with `npm run dev` and the API in a second terminal with `npm run dev:api`. Online human games need no model API key. Existing LLM features initialize their provider only when called.

The frontend reads `VITE_API_URL` (default `http://localhost:8787`). The API uses `WEB_ORIGIN` (default `http://localhost:5173`) as the allowed web origin. Use the exact configured web origin; `localhost` and `127.0.0.1` are different origins.

For testing two players on one computer, use separate browsers or browser profiles. Tabs in the same profile share the stored guest identity and reclaim the same seat. Guest credentials remain in browser storage; clearing that storage loses access to the guest's reserved seat.

## Room behavior

- Capacity can be 2, 3, or 4 and cannot be reduced below the accepted roster. Capacity, colour, or roster changes reset readiness.
- Pending requests reserve no seats, expire after two minutes, and can be cancelled or declined. Hosts cannot accept beyond capacity. Removed guests are blocked from requesting that room again with the same identity.
- Joining, colour changes, and removals stop once a match starts.
- Hosts can fill open seats with Random, Greedy, or Search AI and change their difficulty before starting. AI seats count toward capacity and are automatically ready. One human plus AI is supported; bots never become hosts, and a room closes when its last human leaves.
- AI decisions, rolls, and placements run on the server, with pauses for shared animations. Bots stop while a human is disconnected and resume after everyone reconnects, including after a backend restart. No model API key is needed for these AI seats.
- An explicitly departing host transfers the role to a connected remaining member, falling back to the earliest member. In a waiting room, a disconnected host transfers after 60 seconds when another connected member is available.
- Disconnected players retain their match seats. Play pauses until everyone reconnects. Refreshing a room URL restores the room and guest identity; missed animations are skipped in favor of the latest snapshot.
- Explicitly leaving an active match abandons it for everyone, without a winner. Remaining players can return to the waiting room through the host's rematch control.
- Empty rooms close immediately. Waiting rooms with no connected members expire after 10 minutes of room inactivity. Inactive playing/finished rooms and unreferenced guest sessions are retained for 30 days. Cleanup runs during authenticated activity and live heartbeats.

## Architecture

The shared `transitionGame` action reducer validates rotation, roll, and placement, resolves movement/rent/turn advancement, and accepts injected randomness. Online randomness comes from the server's cryptographic random generator.

HTTP commands mutate state; an authenticated, fetch-based Server-Sent Events stream supplies live full snapshots. This avoids a new transport dependency while supporting cross-origin bearer authorization without putting credentials in URLs. Snapshots have a durable monotonically increasing revision; room commands also carry an expected room version. A stale command is rejected and the browser refreshes state. Unique command IDs make retries idempotent.

Clients animate accepted dice results and movement locally. Animation completion never commits game rules. A newer authoritative version cancels outdated presentation work. Rug anchor selection remains local until a complete placement is submitted.

The server publishes rent events with the roll, payer, owner, owed/paid amounts, bankruptcy flag, and the resulting balances and scores. Each browser queues unseen rent dialogs after movement and dismisses them locally. Continue never settles money again or gates other clients. A local acknowledgement avoids reopening a read event after refresh; joining an existing match does not replay its historical dialogs. Rooms retain the latest 32 rent events, cleared at a new match.

Online data uses its own store and is inaccessible through the existing local saved-game routes. Tokens are random bearer credentials; only their hashes are stored server-side. Host-only request lists are omitted from other players' snapshots.

### HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/online/session` | Create guest from `{name}`; returns private token and guest ID |
| GET | `/api/online/snapshot` | Authenticated lobby, own room, own pending request |
| GET | `/api/online/events` | Authenticated live `snapshot` events |
| POST | `/api/online/command` | Typed commands with unique `id` and room `version` |

Commands cover create, request, cancelRequest, accept, decline, remove, addAi, setAi, ready, colour, capacity, start, leave, rematch, rotate, roll, and place. See `packages/engine/src/online.ts` for payloads. Validation, permissions, capacity, turn ownership, and move legality are enforced server-side.

## Persistence and deployment

Run **one API process on one machine**. The room registry, presence, and command sequencing are coordinated in process; multiple instances require shared coordination before scaling.

`ONLINE_DB_PATH` defaults to `marrakech-online.db` for local development. When `DATABASE_URL` is set (such as a pooled Neon PostgreSQL connection string on Render), both saved games and the online room registry persist to PostgreSQL instead of local SQLite. `PostgresOnlineStore` increments a generation counter on startup so a newly deployed instance fences out its predecessor during rolling deploys, and flushes pending snapshot writes on `SIGTERM` before shutdown.

The supplied `render.yaml` Blueprint deploys `@marrakech/api` as a single Node web service on Render and requires `DATABASE_URL` to be configured as a secret environment variable. Keep the instance count at one and account for free-tier spin-down delays (the browser client waits up to 90 seconds and displays a wake-up notice while the lobby starts).

Set `WEB_ORIGIN` to the actual HTTPS web origin, and build the frontend with the HTTPS API address in `VITE_API_URL`. Verify that the hosting proxy does not buffer SSE, that requests can reconnect, and that PostgreSQL data survives a service restart.

The frontend is deployed by the GitHub integration to Vercel. Set `VITE_API_URL` for the Production environment before pushing a release to `main`.

## Verification

Run `npm test`, `npm run build`, and `npm run typecheck:api`. The automated coverage includes full rule-engine matches with 2/3/4 players, illegal moves, host permissions, readiness, capacity races, duplicate actions, persistence restoration, disconnected match retention, stale snapshots, disabled opponent controls, and explicit abandonment confirmation.

Manual browser checks should use two independent guest identities: create → request → approve → ready → start → rotate/roll/place → refresh/reconnect → leave/rematch. For release, also exercise a full match on separate computers over the internet and a backend restart on durable storage.

## Shared game interface

Online matches reuse the local game's header, brass menu button, menu/rules dialogs, board, controls, and score panel. Room metadata is shown in a compact status line during play; invitation, Home, and leave actions are available in the menu. Online menus do not pause the server, and leaving an active match still requires confirmation.

The board responds to both viewport height and width. Controls reserve a fixed size across direction, roll, and placement phases, while the most recent die result sits beside the score legend. Desktop uses board/sidebar columns; narrow portrait screens stack the board above controls and scores in two columns. Very short windows retain scrolling rather than hiding controls.
