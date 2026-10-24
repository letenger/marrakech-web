import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { AGENTS, newGame, scoreOf, transitionGame } from '@marrakech/engine';
import type { Colour, OnlineCommand, OnlineRoom, OnlineSnapshot } from '@marrakech/engine';
import { MemoryOnlineStore } from './onlineStore';
import type { OnlineStore } from './onlineStore';
import { rateLimit } from './rateLimit';
type Guest = {
  id: string;
  name: string;
  tokenHash: string;
  seen: number;
  receipts: string[];
};
type OnlineEnv = {
  Variables: {
    guest: Guest;
  };
};
type Room = OnlineRoom & {
  updated: number;
  blocked: string[];
};
type Data = {
  revision: number;
  guests: Guest[];
  rooms: Room[];
};
const colours: Colour[] = ['c', 'y', 'r', 'p'];
const coord = z.object({
  col: z.number().int().min(0).max(6),
  row: z.number().int().min(0).max(6)
});
const base = {
  id: z.string().min(1).max(100),
  version: z.number().int().nonnegative().optional()
};
const commandSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('create'),
    name: z.string().trim().min(1).max(48),
    capacity: z.number().int().min(2).max(4)
  }),
  z.object({
    ...base,
    type: z.literal('request'),
    roomId: z.string().min(1).max(100)
  }),
  ...(['accept', 'decline', 'remove'] as const).map(type => z.object({
    ...base,
    type: z.literal(type),
    guestId: z.string()
  })),
  z.object({ ...base, type: z.literal('addAi'), kind: z.enum(['random', 'greedy', 'search']) }),
  z.object({ ...base, type: z.literal('setAi'), guestId: z.string(), kind: z.enum(['random', 'greedy', 'search']) }),
  z.object({
    ...base,
    type: z.literal('ready'),
    ready: z.boolean()
  }),
  z.object({
    ...base,
    type: z.literal('capacity'),
    capacity: z.number().int().min(2).max(4)
  }),
  z.object({
    ...base,
    type: z.literal('colour'),
    colour: z.enum(['c', 'y', 'r', 'p'])
  }),
  z.object({
    ...base,
    type: z.literal('rotate'),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(270)])
  }),
  z.object({
    ...base,
    type: z.literal('place'),
    placement: z.object({
      anchor: coord,
      second: coord
    })
  }),
  ...(['cancelRequest', 'start', 'leave', 'rematch', 'roll'] as const).map(type => z.object({
    ...base,
    type: z.literal(type)
  })),
]);
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export type OnlineScheduler = (callback: () => void, delay: number) => () => void;
const defaultScheduler: OnlineScheduler = (callback, delay) => {
  const timer = setTimeout(callback, delay);
  timer.unref?.();
  return () => clearTimeout(timer);
};
export function onlineRoutes(store: OnlineStore = new MemoryOnlineStore(), rng = () => randomInt(0, 2 ** 32) / 2 ** 32, now = Date.now, schedule: OnlineScheduler = defaultScheduler) {
  const app = new Hono<OnlineEnv>();
  const data: Data = JSON.parse(store.load() ?? '{"revision":0,"guests":[],"rooms":[]}');
  data.revision ??= 0;
  const listeners = new Set<() => void>();
  const connections = new Map<string, number>();
  const sessionLimit = rateLimit({
    windowMs: 60000,
    max: 20
  });
  const commandLimit = rateLimit({
    windowMs: 60000,
    max: 120
  });
  const save = () => store.save(JSON.stringify(data));
  const broadcast = () => {
    reconcileAi();
    save();
    for (const listener of listeners)
      listener();
  };
  const roomOf = (id: string) => data.rooms.find(r => r.members.some(m => m.guestId === id));
  const observed = new Set<string>();
  const connected = (id: string) =>
    id.startsWith('bot:') ||
    (connections.get(id) ?? 0) > 0 ||
    (observed.has(id) && now() - (data.guests.find(g => g.id === id)?.seen ?? 0) < 35_000);

  // Presence belongs to this process; durable room membership survives restarts.
  function clean() {
    for (const room of data.rooms) {
      room.requests = room.requests.filter(r => r.expiresAt > now());
      if (room.status !== 'playing' && !connected(room.hostId)) {
        const host = data.guests.find(g => g.id === room.hostId);
        const next = room.members.find(m => !m.ai && connected(m.guestId));
        if (next && now() - (host?.seen ?? 0) > 60000) {
          room.hostId = next.guestId;
          room.version++;
        }
      }
    }
    data.rooms = data.rooms.filter(r => r.members.some(m => !m.ai && connected(m.guestId)) || now() - r.updated < (r.status === 'waiting' ? 600000 : 30 * 86400000));
    data.guests = data.guests.filter(g => now() - g.seen < 30 * 86400000 || data.rooms.some(r => r.members.some(m => m.guestId === g.id) || r.requests.some(q => q.guestId === g.id)));
  }

  // Host-only requests and private session credentials never enter public summaries.
  function snapshot(guest: Guest): OnlineSnapshot {
    data.revision++;
    save();
    const room = roomOf(guest.id);
    const publicRooms = data.rooms.filter(r => r.status === 'waiting').map(r => summary(r));
    const pending = data.rooms.find(r => r.requests.some(q => q.guestId === guest.id));
    return {
      revision: data.revision,
      guestId: guest.id,
      name: guest.name,
      rooms: publicRooms,
      room: room ? {
        ...summary(room),
        hostId: room.hostId,
        version: room.version,
        members: room.members.map(m => ({
          ...m,
          connected: connected(m.guestId)
        })),
        requests: room.hostId === guest.id ? room.requests : [],
        state: room.state,
        matchId: room.matchId,
        abandoned: room.abandoned,
        lastRoll: room.lastRoll,
        roster: room.roster,
        payments: room.payments
      } : null,
      pendingRequest: pending ? {
        roomId: pending.id,
        roomName: pending.name,
        expiresAt: pending.requests.find(q => q.guestId === guest.id)!.expiresAt
      } : null
    };
  }
  function summary(r: Room) {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      hostName: r.members.find(m => m.guestId === r.hostId)?.name ?? '',
      count: r.members.length,
      capacity: r.capacity,
      status: r.status
    };
  }
  app.post('/session', async (c) => {
    if (!sessionLimit(c.req.header('x-forwarded-for') ?? 'local'))
      return c.json({ error: 'Too many sessions. Please wait.' }, 429);
    const parsed = z.object({ name: z.string().trim().min(1).max(24) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'Enter a name of 1–24 characters.' }, 400);
    const token = randomBytes(32).toString('base64url');
    const guest = {
      id: randomUUID(),
      name: parsed.data.name,
      tokenHash: hash(token),
      seen: now(),
      receipts: []
    };
    data.guests.push(guest);
    observed.add(guest.id);
    save();
    return c.json({
      token,
      guestId: guest.id,
      name: guest.name
    }, 201);
  });
  app.use('*', async (c, next) => {
    const token = c.req.header('authorization')?.replace(/^Bearer /, '');
    const guest = token ? data.guests.find(g => g.tokenHash === hash(token)) : undefined;
    if (!guest)
      return c.json({ error: 'Please enter the lobby again.' }, 401);
    guest.seen = now();
    observed.add(guest.id);
    clean();
    c.set('guest', guest);
    await next();
  });
  const getGuest = (c: Context<OnlineEnv>) => c.get('guest');
  app.get('/snapshot', c => { reconcileAi(); return c.json(snapshot(getGuest(c))); });
  app.get('/events', c => {
    const guest = getGuest(c);
    if ((connections.get(guest.id) ?? 0) >= 3)
      return c.json({ error: 'Close another online tab before reconnecting.' }, 429);
    connections.set(guest.id, (connections.get(guest.id) ?? 0) + 1);
    broadcast();
    return streamSSE(c, async (stream) => {
      let wake: (() => void) | null = null;
      let dirty = false;
      stream.onAbort(() => wake?.());
      const listener = () => {
        dirty = true;
        wake?.();
      };
      listeners.add(listener);
      try {
        while (!stream.aborted) {
          guest.seen = now();
          observed.add(guest.id);
          clean();
          dirty = false;
          await stream.writeSSE({
            event: 'snapshot',
            data: JSON.stringify(snapshot(guest))
          });
          if (dirty || stream.aborted)
            continue;
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, 15000);
            wake = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          wake = null;
        }
      }
      finally {
        listeners.delete(listener);
        connections.set(guest.id, Math.max(0, (connections.get(guest.id) ?? 1) - 1));
        guest.seen = now() - 35001;
        broadcast();
      }
    });
  });
  app.post('/command', async (c) => {
    const guest = getGuest(c);
    if (!commandLimit(guest.id))
      return c.json({ error: 'Too many actions. Please wait.' }, 429);
    const parsed = commandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'Invalid command.' }, 400);
    const cmd = parsed.data as OnlineCommand;
    if (guest.receipts.includes(cmd.id))
      return c.json(snapshot(guest));
    const backup = JSON.stringify(data);
    try {
      execute(guest, cmd);
      guest.receipts.push(cmd.id);
      broadcast();
      return c.json(snapshot(guest));
    }
    catch (error) {
      const previous = JSON.parse(backup) as Data;
      for (const old of previous.guests) {
        const live = data.guests.find(g => g.id === old.id);
        if (live)
          Object.assign(live, old);
      }
      data.rooms = previous.rooms;
      return c.json({ error: error instanceof Error ? error.message : 'Action failed.' }, 409);
    }
  });

  // Bots act only on the server. Each version gets at most one delayed job.
  const jobs = new Map<string, { version: number; cancel: () => void }>();
  function applyAction(room: Room, action: import('@marrakech/engine').GameAction) {
    const result = transitionGame(room.state!, action, rng);
    room.state = result.state;
    if (result.roll !== null) room.lastRoll = result.roll;
    if (result.payment && room.matchId && result.roll !== null) {
      const payer = result.state.players.find(p => p.colour === result.payment!.payer)!;
      const owner = result.state.players.find(p => p.colour === result.payment!.owner)!;
      room.payments = [...(room.payments ?? []), {
        ...result.payment, id: randomUUID(), matchId: room.matchId, createdAt: now(), die: result.roll,
        payerDirhams: payer.dirhams, ownerDirhams: owner.dirhams,
        payerScore: scoreOf(result.state, payer), ownerScore: scoreOf(result.state, owner)
      }].slice(-32);
    }
    if (room.state.phase === 'gameover') room.status = 'finished';
  }
  function reconcileAi() {
    for (const [id, job] of jobs) {
      const room = data.rooms.find(r => r.id === id);
      if (!room || room.version !== job.version || !canAct(room)) {
        job.cancel(); jobs.delete(id);
      }
    }
    for (const room of data.rooms) {
      if (!canAct(room) || jobs.has(room.id)) continue;
      const version = room.version;
      const matchId = room.matchId;
      const delay = room.state!.phase === 'place' ? 3200 : 2600;
      const cancel = schedule(() => {
        jobs.delete(room.id);
        const live = data.rooms.find(r => r.id === room.id);
        if (!live || live.version !== version || live.matchId !== matchId || !canAct(live)) return;
        const state = live.state!;
        const bot = live.members.find(m => m.colour === state.players[state.turnIndex].colour)!;
        const agent = AGENTS[bot.ai!];
        const action: import('@marrakech/engine').GameAction = state.phase === 'rotate'
          ? { type: 'rotate', rotation: agent.chooseRotation(state, rng) }
          : state.phase === 'move' ? { type: 'roll' }
          : { type: 'place', placement: agent.choosePlacement(state, rng)! };
        applyAction(live, action);
        live.version++;
        live.updated = now();
        broadcast();
      }, delay);
      jobs.set(room.id, { version, cancel });
    }
  }
  function canAct(room: Room) {
    return room.status === 'playing' && !!room.state && room.members.every(m => connected(m.guestId)) &&
      !!room.members.find(m => m.colour === room.state!.players[room.state!.turnIndex].colour)?.ai;
  }

  // All mutations are synchronous, so validation and capacity checks are serialized.
  function execute(guest: Guest, cmd: OnlineCommand) {
    const fail = (message: string): never => {
      throw new Error(message);
    };
    const current = roomOf(guest.id);
    const cancel = () => {
      for (const r of data.rooms)
        r.requests = r.requests.filter(q => q.guestId !== guest.id);
    };
    const reset = (room: Room) => {
      room.members.forEach(m => {
        m.ready = !!m.ai;
      });
    };
    if (cmd.type === 'create') {
      if (current)
        fail('Leave your current room first.');
      cancel();
      data.rooms.push({
        id: randomUUID(),
        code: randomBytes(4).toString('hex').toUpperCase(),
        name: cmd.name,
        hostId: guest.id,
        hostName: guest.name,
        count: 1,
        capacity: cmd.capacity,
        status: 'waiting',
        version: 1,
        members: [{
          guestId: guest.id,
          name: guest.name,
          colour: 'c',
          ready: false,
          connected: true
        }],
        requests: [],
        state: null,
        matchId: null,
        abandoned: false,
        lastRoll: null,
        updated: now(),
        blocked: []
      });
      return;
    }
    if (cmd.type === 'cancelRequest') {
      cancel();
      return;
    }
    if (cmd.type === 'request') {
      if (current)
        fail('Leave your current room first.');
      const room = data.rooms.find(r => r.id === cmd.roomId || r.code === cmd.roomId.toUpperCase());
      if (!room || room.status !== 'waiting' || room.members.length >= room.capacity)
        fail('Room is unavailable.');
      if (room!.blocked.includes(guest.id))
        fail('You were removed from this room.');
      cancel();
      room!.requests.push({
        guestId: guest.id,
        name: guest.name,
        expiresAt: now() + 120000
      });
      return;
    }
    const room = current ?? fail('You are not in a room.');
    if (cmd.version !== room.version)
      fail('The room changed. Please try again.');
    const member = room.members.find(m => m.guestId === guest.id)!;
    const host = () => {
      if (room.hostId !== guest.id)
        fail('Only the host can do that.');
    };
    const waiting = () => {
      if (room.status !== 'waiting')
        fail('The room is not waiting.');
    };
    if (cmd.type === 'leave') {
      if (room.status === 'playing') {
        room.status = 'finished';
        room.abandoned = true;
      }
      room.members = room.members.filter(m => m.guestId !== guest.id);
      reset(room);
      if (!room.members.some(m => !m.ai))
        data.rooms = data.rooms.filter(r => r.id !== room.id);
      else if (room.hostId === guest.id)
        room.hostId = room.members.find(m => !m.ai && connected(m.guestId))?.guestId ?? room.members.find(m => !m.ai)!.guestId;
    }
    else if (cmd.type === 'accept' || cmd.type === 'decline' || cmd.type === 'remove') {
      host();
      waiting();
      if (cmd.type === 'remove') {
        if (cmd.guestId === guest.id)
          fail('Use Leave to exit your room.');
        room.members = room.members.filter(m => m.guestId !== cmd.guestId);
        room.blocked.push(cmd.guestId);
        reset(room);
      }
      else {
        const request = room.requests.find(q => q.guestId === cmd.guestId) ?? fail('Request expired.');
        if (cmd.type === 'accept') {
          if (room.members.length >= room.capacity || roomOf(request.guestId))
            fail('No seat is available.');
          room.members.push({
            guestId: request.guestId,
            name: request.name,
            colour: colours.find(colour => !room.members.some(m => m.colour === colour))!,
            ready: false,
            connected: connected(request.guestId)
          });
          reset(room);
        }
        room.requests = room.requests.filter(q => q.guestId !== cmd.guestId);
      }
    }
    else if (cmd.type === 'addAi' || cmd.type === 'setAi') {
      host();
      waiting();
      if (cmd.type === 'addAi') {
        if (room.members.length >= room.capacity) fail('No seat is available.');
        room.members.push({ guestId: `bot:${randomUUID()}`, name: `AI ${cmd.kind}`, ai: cmd.kind, colour: colours.find(colour => !room.members.some(m => m.colour === colour))!, ready: true, connected: true });
      } else {
        const bot = room.members.find(m => m.guestId === cmd.guestId && m.ai) ?? fail('AI seat not found.');
        bot.ai = cmd.kind;
        bot.name = `AI ${cmd.kind}`;
      }
      reset(room);
    }
    else if (cmd.type === 'capacity') {
      host();
      waiting();
      if (cmd.capacity < room.members.length)
        fail('Capacity cannot be smaller than the player count.');
      room.capacity = cmd.capacity;
      reset(room);
    }
    else if (cmd.type === 'ready') {
      waiting();
      member.ready = cmd.ready;
    }
    else if (cmd.type === 'colour') {
      waiting();
      if (room.members.some(m => m.colour === cmd.colour && m !== member))
        fail('That colour is taken.');
      member.colour = cmd.colour;
      reset(room);
    }
    else if (cmd.type === 'start') {
      host();
      waiting();
      if (room.members.length < 2 || !room.members.every(m => m.ready && connected(m.guestId)))
        fail('Everyone must be connected and ready.');
      room.state = newGame(room.members.length, rng);
      room.roster = room.members.map(({ guestId, name, colour, ai }) => ({ guestId, name, colour, ...(ai ? { ai } : {}) }));
      room.state.players = room.state.players.map((p, i) => ({
        ...p,
        colour: room.members[i].colour
      }));
      room.status = 'playing';
      room.matchId = randomUUID();
      room.requests = [];
      room.abandoned = false;
      room.lastRoll = null;
      room.payments = [];
    }
    else if (cmd.type === 'rematch') {
      host();
      if (room.status !== 'finished')
        fail('The match has not finished.');
      room.status = 'waiting';
      room.state = null;
      room.matchId = null;
      room.roster = [];
      room.lastRoll = null;
      room.payments = [];
      reset(room);
    }
    else {
      if (room.status !== 'playing' || !room.state)
        fail('No match is in progress.');
      if (!room.members.every(m => connected(m.guestId)))
        fail('Waiting for a player to reconnect.');
      if (room.state!.players[room.state!.turnIndex].colour !== member.colour)
        fail('It is not your turn.');
      if (cmd.type !== 'rotate' && cmd.type !== 'roll' && cmd.type !== 'place')
        fail('Unknown action.');
      applyAction(room, cmd as import('@marrakech/engine').GameAction);
    }
    room.version++;
    room.updated = now();
  }
  return app;
}
