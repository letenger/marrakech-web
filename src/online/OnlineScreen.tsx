import { useCallback, useEffect, useRef, useState } from 'react';
import { assamPath, legalAnchors, legalSeconds, winnerOf, type OnlineCommand, type OnlineRoom, type OnlineSnapshot, type OnlinePayment, type OnlineAiKind, type Coord, type GameState } from '@marrakech/engine';
import { BoardView, type Overlay } from '../ui/BoardView';
import { Controls } from '../ui/Controls';
import { ScorePanel } from '../ui/ScorePanel';
import { DiceRoll } from '../ui/DiceRoll';
import { PaymentPrompt } from '../ui/PaymentPrompt';
import { acknowledgeRent, rentReceipts } from './rentReceipts';
import type { PlayerNames } from '../ui/players';
import { defaultNames, PLAYER_HEX, PLAYER_NAME } from '../ui/players';
import { onlineRequest, OnlineError, readEvents, readSession, saveSession, type GuestSession } from './transport';
import './online.css';

type CommandInput = OnlineCommand extends infer C ? C extends OnlineCommand ? Omit<C, 'id' | 'version'> : never : never;
type Send = (command: CommandInput) => void;
type Motion = { roomId: string; version: number; state: GameState; die: 1 | 2 | 3 | 4; rolling: boolean };
type PendingRent = { payment: OnlinePayment; names: PlayerNames };
const AI_OPTIONS: { kind: OnlineAiKind; label: string }[] = [
  { kind: 'random', label: 'Random · easy' },
  { kind: 'greedy', label: 'Greedy · medium' },
  { kind: 'search', label: 'Search · hard' },
];

export default function OnlineScreen({ onBack }: { onBack: () => void }) {
  const [session, setSession] = useState(readSession);
  const [snapshot, setSnapshot] = useState<OnlineSnapshot | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [motion, setMotion] = useState<Motion | null>(null);
  const [pendingRents, setPendingRents] = useState<PendingRent[]>([]);
  const seenRents = useRef(new Set<string>());
  const motionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [invite, setInvite] = useState(() => new URLSearchParams(window.location.search).get('room') ?? '');
  const commandLock = useRef(false);
  const snapshotRef = useRef<OnlineSnapshot | null>(null);

  function acceptSnapshot(next: OnlineSnapshot) {
    const previous = snapshotRef.current;
    if (previous && previous.revision >= next.revision) return;
    if (previous?.pendingRequest && !next.pendingRequest && !next.room) setNotice('Your request ended. It may have been declined, expired, or the room started. You can request another room.');
    if (previous?.room && !next.room) setNotice('You are back in the lobby.');
    if (next.room || next.pendingRequest) setNotice('');
    if (next.room) setInvite('');
    if (next.room || previous?.room) {
      const url = new URL(window.location.href);
      if (next.room) url.searchParams.set('room', next.room.code);
      else url.searchParams.delete('room');
      window.history.replaceState(null, '', url);
    }
    const oldRoom = previous?.room;
    const sameMatch = oldRoom?.id === next.room?.id && oldRoom?.matchId === next.room?.matchId;
    if (!sameMatch) seenRents.current.clear();
    const events = next.room?.payments ?? [];
    const acknowledged = next.room?.matchId ? rentReceipts(next.guestId, next.room.matchId) : new Set<string>();
    // Rejoining does not replay the whole match's historical rent dialogs.
    const candidates = sameMatch ? events : events.slice(-1).filter(event => Date.now() - event.createdAt < 30_000);
    const names = defaultNames();
    (next.room?.roster?.length ? next.room.roster : next.room?.members ?? []).forEach(member => { names[member.colour] = member.name; });
    const incoming = candidates.filter(event => !seenRents.current.has(event.id) && !acknowledged.has(event.id)).map(payment => ({ payment, names }));
    for (const event of events) seenRents.current.add(event.id);
    if (!sameMatch || incoming.length) setPendingRents(queue => sameMatch ? [...queue, ...incoming] : incoming);
    if (!oldRoom || next.room?.id !== oldRoom.id || next.room.version !== oldRoom.version) {
      clearTimeout(motionTimer.current);
      setMotion(null);
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && oldRoom?.state?.phase === 'move' && next.room?.id === oldRoom.id && next.room.matchId === oldRoom.matchId && next.room.version === oldRoom.version + 1 && next.room.lastRoll !== null && next.room.state && next.room.state.phase !== 'move') {
        setMotion({ roomId: next.room.id, version: next.room.version, state: oldRoom.state, die: next.room.lastRoll as 1 | 2 | 3 | 4, rolling: true });
      }
    }
    snapshotRef.current = next;
    setSnapshot(next);
  }

  useEffect(() => () => clearTimeout(motionTimer.current), []);

  const finishDice = useCallback(() => {
    if (!motion) return;
    const currentMotion = motion;
    const path = assamPath(currentMotion.state.assam, currentMotion.die);
    let step = 0;
    function walk() {
      setMotion({ ...currentMotion, rolling: false, state: { ...currentMotion.state, assam: path[step] } });
      step++;
      motionTimer.current = setTimeout(step < path.length ? walk : () => setMotion(null), 300);
    }
    walk();
  }, [motion]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    async function connect() {
      try {
        await readEvents(session!.token, controller.signal,
          data => acceptSnapshot(data as OnlineSnapshot),
          () => { setConnected(true); setError(''); });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setConnected(false);
        if (cause instanceof OnlineError && cause.status === 401) {
          saveSession(null); setSession(null); setSnapshot(null); snapshotRef.current = null;
          clearTimeout(motionTimer.current); setMotion(null); setPendingRents([]); seenRents.current.clear();
          setError('Your guest session expired. Enter your name to join again.');
          return;
        }
        setError('Connection interrupted. Reconnecting…');
        retry = setTimeout(() => { void connect(); }, 2000);
      }
    }
    void connect();
    return () => { controller.abort(); clearTimeout(retry); };
  }, [session]);

  const dismissRent = useCallback(() => {
    const payment = pendingRents[0]?.payment;
    if (!payment) return;
    if (session) acknowledgeRent(session.guestId, payment.matchId, payment.id);
    setPendingRents(queue => queue.slice(1));
  }, [pendingRents, session]);

  async function enter(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commandLock.current) return;
    commandLock.current = true; setBusy(true); setError('');
    try {
      const guest = await onlineRequest<GuestSession>('session', undefined, { name: name.trim() });
      saveSession(guest); setSession(guest);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to enter the lobby.'); }
    finally { commandLock.current = false; setBusy(false); }
  }

  const send: Send = (command) => {
    if (!session || !connected || commandLock.current) return;
    commandLock.current = true; setBusy(true); setError('');
    const payload: OnlineCommand = { ...command, id: crypto.randomUUID(), ...(snapshot?.room ? { version: snapshot.room.version } : {}) };
    void (async () => {
      try {
        // Retrying the SAME id is safe even if the server committed before the response was lost.
        let next: OnlineSnapshot;
        try { next = await onlineRequest<OnlineSnapshot>('command', session.token, payload); }
        catch (cause) {
          if (cause instanceof OnlineError) throw cause;
          next = await onlineRequest<OnlineSnapshot>('command', session.token, payload);
        }
        acceptSnapshot(next);
        if (command.type === 'request') clearInvite();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to complete the action.');
        try { acceptSnapshot(await onlineRequest<OnlineSnapshot>('snapshot', session.token)); } catch { /* Stream retries independently. */ }
      } finally { commandLock.current = false; setBusy(false); }
    })();
  };

  function clearInvite() {
    setInvite('');
    const url = new URL(window.location.href);
    if (snapshotRef.current?.room) url.searchParams.set('room', snapshotRef.current.room.code);
    else url.searchParams.delete('room');
    window.history.replaceState(null, '', url);
  }

  const room = snapshot?.room;
  return <div className="app scene online-shell">
    <header className="online-header">
      <div><h1>Marrakech online</h1><p>{room ? room.name : 'Find a table in the souk'}</p></div>
      <div className="online-actions">
        {session && snapshot && !room && !snapshot.pendingRequest && <button disabled={busy} onClick={() => {
          saveSession(null); setName(session.name); setSession(null); setSnapshot(null); snapshotRef.current = null; setConnected(false); setError(''); setNotice('');
        }}>Change name</button>}
        <button onClick={onBack}>Home</button>
      </div>
    </header>
    {session && <p className="online-connection" role="status">{session.name} · {connected ? 'Connected' : 'Connecting…'}{!connected && ' — play is paused until you reconnect'}</p>}
    {error && <p className="online-error" role="alert">{error}</p>}
    {notice && <p className="online-notice" role="status">{notice}</p>}
    {!session ? <section className="online-card online-entry"><h2>Join the public lobby</h2><p>Choose a name other players will see. No account needed.</p>
      <form onSubmit={event => { void enter(event); }}><label>Display name<input required minLength={1} maxLength={24} value={name} onChange={event => setName(event.target.value)} autoComplete="nickname" /></label><button className="primary" disabled={busy || !name.trim()}>Enter lobby</button></form>
      {invite && <p>Your room invitation will be available after you enter.</p>}
    </section> : !snapshot ? <p role="status">Loading rooms…</p> : room ? <RoomView key={room.id} room={room} guestId={session.guestId} send={send} disabled={busy || !connected || motion !== null || pendingRents.length > 0} displayState={motion?.roomId === room.id && motion.version === room.version ? motion.state : undefined} /> :
      <Lobby snapshot={snapshot} send={send} disabled={busy || !connected} invite={invite} clearInvite={clearInvite} />}
    {motion?.rolling && <DiceRoll value={motion.die} onDone={finishDice} />}
    {!motion && pendingRents[0] && <PaymentPrompt key={pendingRents[0].payment.id} r={pendingRents[0].payment} names={pendingRents[0].names} onContinue={dismissRent} />}
  </div>;
}

function Lobby({ snapshot, send, disabled, invite, clearInvite }: { snapshot: OnlineSnapshot; send: Send; disabled: boolean; invite: string; clearInvite: () => void }) {
  const [roomName, setRoomName] = useState(`${snapshot.name}'s room`);
  const [capacity, setCapacity] = useState(4);
  const [code, setCode] = useState(invite);
  const pending = snapshot.pendingRequest;
  return <main className="online-lobby">
    <section className="online-card"><h2>Public rooms</h2><p>Ask to join a table. The host approves new players.</p>
      {pending && <div className="online-notice" role="status"><p>Waiting for approval from {pending.roomName}.</p><button disabled={disabled} onClick={() => send({ type: 'cancelRequest' })}>Cancel request</button></div>}
      {snapshot.rooms.length === 0 && <p>No rooms are waiting yet. Create the first one.</p>}
      <div className="online-room-list">{snapshot.rooms.map(room => <article className="online-room-card" key={room.id}>
        <div><h3>{room.name}</h3><p>Hosted by {room.hostName} · {room.count}/{room.capacity} players</p></div>
        <button disabled={disabled || !!pending || room.count >= room.capacity} onClick={() => send({ type: 'request', roomId: room.id })}>{room.count >= room.capacity ? 'Full' : 'Request to join'}</button>
      </article>)}</div>
    </section>
    <aside className="online-sidebar">
      <section className="online-card"><h2>Create a room</h2><form onSubmit={event => { event.preventDefault(); send({ type: 'create', name: roomName.trim(), capacity }); }}>
        <label>Room name<input required maxLength={48} value={roomName} onChange={event => setRoomName(event.target.value)} /></label>
        <label>Maximum players<select value={capacity} onChange={event => setCapacity(Number(event.target.value))}><option value={2}>2 players</option><option value={3}>3 players</option><option value={4}>4 players</option></select></label>
        <button className="primary" disabled={disabled || !!pending || !roomName.trim()}>Create room</button>
      </form></section>
      <section className="online-card"><h2>{invite ? 'Room invitation' : 'Have a room code?'}</h2><form onSubmit={event => { event.preventDefault(); send({ type: 'request', roomId: code.trim() }); }}>
        <label>Room code<input required value={code} maxLength={64} onChange={event => setCode(event.target.value)} autoCapitalize="characters" /></label><button disabled={disabled || !!pending || !code.trim()}>Request to join</button>
        {invite && <button type="button" onClick={clearInvite}>Dismiss invitation</button>}
      </form></section>
    </aside>
  </main>;
}

function RoomView({ room, guestId, send, disabled, displayState }: { room: OnlineRoom; guestId: string; send: Send; disabled: boolean; displayState?: GameState }) {
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [aiKind, setAiKind] = useState<OnlineAiKind>('greedy');
  const me = room.members.find(member => member.guestId === guestId);
  const host = room.hostId === guestId;
  const playing = room.status === 'playing';
  const waiting = room.status === 'waiting';
  const canStart = waiting && room.members.length >= 2 && room.members.every(member => member.ready && member.connected);
  async function copyInvite() {
    const url = new URL(window.location.href); url.searchParams.set('room', room.code);
    try { await navigator.clipboard.writeText(url.toString()); setCopied(true); } catch { setCopied(false); }
  }
  return <main>
    <section className="online-card online-room-heading"><div><h2>{room.name}</h2><p>Room code: <strong>{room.code}</strong> · {room.members.length}/{room.capacity} players</p></div>
      <div className="online-actions"><button onClick={() => { void copyInvite(); }}>{copied ? 'Invite link copied' : 'Copy invite link'}</button>
        <button disabled={disabled} onClick={() => playing ? setConfirmLeave(true) : send({ type: 'leave' })}>Leave {playing ? 'match' : 'room'}</button></div>
      {confirmLeave && <div className="online-notice" role="alert"><p>Leaving ends this match for everyone without a winner.</p><button disabled={disabled} onClick={() => send({ type: 'leave' })}>End match and leave</button><button onClick={() => setConfirmLeave(false)}>Keep playing</button></div>}
    </section>
    <div className="online-members">{room.members.map(member => <article className="online-card" key={member.guestId}>
      <h3><span className="swatch" style={{ background: PLAYER_HEX[member.colour] }} /> {member.name}{member.guestId === guestId ? ' (you)' : ''}</h3>
      <p>{member.guestId === room.hostId ? 'Host · ' : ''}{member.ai ? `AI · ${AI_OPTIONS.find(option => option.kind === member.ai)?.label}` : member.connected ? waiting ? member.ready ? 'Ready' : 'Not ready' : 'Connected' : 'Disconnected'}</p>
      {waiting && host && member.ai && <label>AI difficulty<select disabled={disabled} value={member.ai} onChange={event => send({ type: 'setAi', guestId: member.guestId, kind: event.target.value as OnlineAiKind })}>{AI_OPTIONS.map(option => <option key={option.kind} value={option.kind}>{option.label}</option>)}</select></label>}
      {waiting && member.guestId === guestId && <label>Rug colour<select disabled={disabled} value={member.colour} onChange={event => send({ type: 'colour', colour: event.target.value as typeof member.colour })}>
        {Object.entries(PLAYER_NAME).map(([colour, label]) => <option key={colour} value={colour} disabled={room.members.some(other => other.guestId !== guestId && other.colour === colour)}>{label}</option>)}
      </select></label>}
      {waiting && host && member.guestId !== guestId && <button disabled={disabled} onClick={() => send({ type: 'remove', guestId: member.guestId })}>Remove player</button>}
    </article>)}</div>
    {waiting && <div className="online-lobby"><section className="online-card"><h2>Get ready</h2><p>Choose your colour, then mark yourself ready. The host can start with 2–{room.capacity} players once everyone is connected and ready. AI seats are ready automatically.</p><p>Changes to players or colours reset human players’ readiness.</p>
      {host && <label>Maximum players<select disabled={disabled} value={room.capacity} onChange={event => send({ type: 'capacity', capacity: Number(event.target.value) })}>{[2, 3, 4].map(capacity => <option key={capacity} value={capacity} disabled={capacity < room.members.length}>{capacity} players</option>)}</select></label>}
      {host && <div className="online-ai-seats"><h3>AI seats</h3><p>Fill an open seat with a server-controlled opponent.</p><label>New AI difficulty<select value={aiKind} disabled={disabled} onChange={event => setAiKind(event.target.value as OnlineAiKind)}>{AI_OPTIONS.map(option => <option key={option.kind} value={option.kind}>{option.label}</option>)}</select></label><button disabled={disabled || room.members.length >= room.capacity} onClick={() => send({ type: 'addAi', kind: aiKind })}>{room.members.length >= room.capacity ? 'Room full' : 'Add AI'}</button></div>}
      <div className="online-actions"><button className="primary" disabled={disabled} onClick={() => send({ type: 'ready', ready: !me?.ready })}>{me?.ready ? 'Not ready' : 'Ready to play'}</button>
        {host && <button disabled={disabled || !canStart} onClick={() => send({ type: 'start' })}>Start game</button>}</div>
    </section>{host && <section className="online-card"><h2>Join requests</h2>{room.requests.length === 0 ? <p>No pending requests.</p> : room.requests.map(request => <div className="online-request" key={request.guestId}><strong>{request.name}</strong><div className="online-actions"><button disabled={disabled || room.members.length >= room.capacity} onClick={() => send({ type: 'accept', guestId: request.guestId })}>Accept</button><button disabled={disabled} onClick={() => send({ type: 'decline', guestId: request.guestId })}>Decline</button></div></div>)}</section>}</div>}
    {room.state && <OnlineBoard key={room.matchId} room={room} state={displayState ?? room.state} guestId={guestId} send={send} disabled={disabled} walking={!!displayState} />}
    {room.status === 'finished' && <section className="online-card"><h2>{room.abandoned ? 'Match abandoned' : 'Match complete'}</h2>{room.abandoned && <p>A player left. No winner is recorded.</p>}<p>The host can return the remaining players to the waiting room for another game.</p>{host && <button className="primary" disabled={disabled} onClick={() => send({ type: 'rematch' })}>Return to waiting room</button>}</section>}
  </main>;
}

function OnlineBoard({ room, state, guestId, send, disabled, walking }: { room: OnlineRoom; state: GameState; guestId: string; send: Send; disabled: boolean; walking: boolean }) {
  const [selection, setSelection] = useState<{ version: number; anchor: Coord } | null>(null);
  const anchor = selection?.version === room.version ? selection.anchor : null;
  const names = defaultNames();
  (room.roster?.length ? room.roster : room.members).forEach(member => { names[member.colour] = member.name; });
  const current = room.members.find(member => member.colour === state.players[state.turnIndex].colour);
  const paused = room.members.some(member => !member.ai && !member.connected);
  const active = room.status === 'playing' && current?.guestId === guestId && !disabled && !paused;
  const winner = room.status === 'finished' && !room.abandoned && state.phase === 'gameover' ? winnerOf(state) : null;
  let overlays: Overlay[] = [];
  if (active && state.phase === 'place') {
    overlays = anchor ? [{ coord: anchor, variant: 'selected' }, ...legalSeconds(state, anchor).map(second => ({ coord: second, variant: 'second' as const, onClick: () => send({ type: 'place', placement: { anchor, second } }) }))] :
      legalAnchors(state).map(coord => ({ coord, variant: 'anchor', onClick: () => setSelection({ version: room.version, anchor: coord }) }));
  }
  const message = room.abandoned ? 'This match was abandoned.' : paused ? 'Match paused — waiting for disconnected players to return.' : active ? 'Your turn.' : current?.ai ? `${current.name} is thinking…` : `Waiting for ${current?.name ?? 'the next player'}.`;
  return <section className="layout online-game"><BoardView state={state} overlays={overlays} walking={walking} /><div className="side">
    <Controls state={state} die={room.lastRoll} message={message} winner={winner} names={names} busy={!active} canCancel={!!anchor && active} onCancel={() => setSelection(null)} onRotate={rotation => send({ type: 'rotate', rotation })} onRoll={() => send({ type: 'roll' })} />
    {room.lastRoll !== null && <p className="online-die" role="status">🎲 Last roll: {room.lastRoll}</p>}
    <ScorePanel state={state} names={names} />
  </div></section>;
}
