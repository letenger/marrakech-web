import { describe, expect, it } from 'vitest';
import { legalPlacements } from '@marrakech/engine';
import type { OnlineSnapshot } from '@marrakech/engine';
import { onlineRoutes } from '../src/online';
import { MemoryOnlineStore } from '../src/onlineStore';

async function setup(capacity = 4) {
 const store = new MemoryOnlineStore();
 let time = 1_000_000;
 const app = onlineRoutes(store, () => 0, () => time);
 const tokens: string[] = [];
 for (const name of ['Host', 'Second', 'Third', 'Fourth', 'Fifth']) {
   const res = await app.request('/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
   tokens.push((await res.json()).token);
 }
 let id = 0;
 const request = (player: number, path: string, body?: object) => app.request(path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${tokens[player]}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
 const snap = async (player: number) => (await (await request(player, '/snapshot')).json()) as OnlineSnapshot;
 const cmd = async (player: number, body: object, requestId?: string) => request(player, '/command', { id: requestId ?? String(++id), version: (await snap(player)).room?.version, ...body });
 await cmd(0, { type: 'create', name: 'Test room', capacity });
 return { app, store, tokens, snap, cmd, advance: (ms: number) => { time += ms; } };
}
async function join(s: Awaited<ReturnType<typeof setup>>, player: number) {
 const host = await s.snap(0);
 await s.cmd(player, { type: 'request', roomId: host.room!.code });
 const guestId = (await s.snap(player)).guestId;
 expect((await s.cmd(0, { type: 'accept', guestId })).status).toBe(200);
}
describe('public online rooms', () => {
 it('requires a private bearer token and hides host-only requests', async () => {
  const s = await setup();
  expect((await s.app.request('/snapshot')).status).toBe(401);
  await join(s, 1);
  await s.cmd(2, { type: 'request', roomId: (await s.snap(0)).room!.id });
  expect((await s.snap(0)).room!.requests).toHaveLength(1);
  expect((await s.snap(1)).room!.requests).toHaveLength(0);
  expect((await s.cmd(1, { type: 'accept', guestId: (await s.snap(2)).guestId })).status).toBe(409);
 });
 it('checks final-seat capacity atomically and enforces stale versions', async () => {
  const s = await setup(2);
  const roomId = (await s.snap(0)).room!.id;
  await s.cmd(1, { type: 'request', roomId }); await s.cmd(2, { type: 'request', roomId });
  const version = (await s.snap(0)).room!.version;
  expect((await s.cmd(0, { type: 'accept', guestId: (await s.snap(1)).guestId, version })).status).toBe(200);
  expect((await s.cmd(0, { type: 'accept', guestId: (await s.snap(2)).guestId, version })).status).toBe(409);
  expect((await s.snap(0)).room!.members).toHaveLength(2);
 });
 it('runs a four-player authoritative match with idempotent dice and restores persistence', async () => {
  const s = await setup();
  for (let p = 1; p < 4; p++) await join(s, p);
  expect((await s.cmd(0, { type: 'start' })).status).toBe(409);
  for (let p = 0; p < 4; p++) await s.cmd(p, { type: 'ready', ready: true });
  expect((await s.cmd(0, { type: 'start' })).status).toBe(200);
  expect((await s.cmd(1, { type: 'rotate', rotation: 90 })).status).toBe(409);
  await s.cmd(0, { type: 'rotate', rotation: 0 });
  const version = (await s.snap(0)).room!.version;
  await s.cmd(0, { type: 'roll', version }, 'one-roll');
  const rolled = (await s.snap(0)).room!;
  await s.cmd(0, { type: 'roll', version }, 'one-roll');
  expect((await s.snap(0)).room!.version).toBe(rolled.version);
  expect((await s.cmd(0, { type: 'place', placement: { anchor: { col: 0, row: 0 }, second: { col: 6, row: 6 } } })).status).toBe(409);
  await s.cmd(0, { type: 'place', placement: legalPlacements(rolled.state!)[0] });
  expect((await s.snap(1)).room!.state!.turnIndex).toBe(1);
  const restored = onlineRoutes(s.store, () => 0);
  const res = await restored.request('/snapshot', { headers: { authorization: `Bearer ${s.tokens[0]}` } });
  expect((await res.json()).room.state).toEqual((await s.snap(0)).room!.state);
 });
 it('finishes a four-player match through authenticated API commands', async () => {
  const s = await setup();
  for (let player = 1; player < 4; player++) await join(s, player);
  for (let player = 0; player < 4; player++) await s.cmd(player, { type: 'ready', ready: true });
  await s.cmd(0, { type: 'start' });
  let completed = false;
  for (let step = 0; step < 1000; step++) {
   // Keep all four guests connected and refresh rate-limit windows as turns pass.
   s.advance(1000);
   const snapshots = await Promise.all([0, 1, 2, 3].map(player => s.snap(player)));
   const room = snapshots[0].room!;
   if (room.status === 'finished') {
    expect(room.state!.phase).toBe('gameover');
    expect(snapshots.every(snapshot => JSON.stringify(snapshot.room!.state) === JSON.stringify(room.state))).toBe(true);
    completed = true;
    break;
   }
   const state = room.state!;
   const actor = snapshots.findIndex(snapshot => snapshot.guestId === room.members.find(member => member.colour === state.players[state.turnIndex].colour)!.guestId);
   const action = state.phase === 'rotate' ? { type: 'rotate', rotation: 0 }
    : state.phase === 'move' ? { type: 'roll' }
    : { type: 'place', placement: legalPlacements(state)[0] };
   expect((await s.cmd(actor, action)).status).toBe(200);
  }
  expect(completed).toBe(true);
 });
 it('retains disconnected matches, expires presence, and changes capacity safely', async () => {
  const s = await setup(); await join(s, 1); await join(s, 2);
  expect((await s.cmd(1, { type: 'capacity', capacity: 3 })).status).toBe(409);
  expect((await s.cmd(0, { type: 'capacity', capacity: 2 })).status).toBe(409);
  await s.cmd(0, { type: 'ready', ready: true });
  await s.cmd(0, { type: 'capacity', capacity: 3 });
  expect((await s.snap(0)).room!.members.every(m => !m.ready)).toBe(true);
  for (let p = 0; p < 3; p++) await s.cmd(p, { type: 'ready', ready: true });
  await s.cmd(0, { type: 'start' });
  s.advance(601_000);
  expect((await s.snap(4)).rooms).toHaveLength(0);
  const recovered = (await s.snap(0)).room!;
  expect(recovered.status).toBe('playing');
  expect(recovered.members[1].connected).toBe(false);
  expect((await s.cmd(0, { type: 'rotate', rotation: 0 })).status).toBe(409);
 });
 it('expires requests, transfers host and abandons a left match without a winner', async () => {
  const s = await setup(); await join(s, 1);
  await s.cmd(2, { type: 'request', roomId: (await s.snap(0)).room!.id });
  s.advance(121_000);
  expect((await s.snap(1)).room!.requests).toHaveLength(0);
  expect((await s.snap(1)).room!.hostId).toBe((await s.snap(1)).guestId);
  await s.cmd(0, { type: 'ready', ready: true }); await s.cmd(1, { type: 'ready', ready: true });
  await s.cmd(1, { type: 'start' });
  await s.cmd(0, { type: 'leave' });
  expect((await s.snap(1)).room!.abandoned).toBe(true);
  expect((await s.snap(1)).room!.roster?.map(player => player.name)).toEqual(['Host', 'Second']);
  await s.cmd(1, { type: 'rematch' });
  expect((await s.snap(1)).room!.status).toBe('waiting');
 });
});
