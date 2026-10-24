// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { newGame, transitionGame, type OnlinePayment, type OnlineSnapshot } from '@marrakech/engine';
import OnlineScreen from '../src/online/OnlineScreen';
import { onlineRequest, readEvents, readSession } from '../src/online/transport';

vi.mock('../src/online/transport', () => ({
  readSession: vi.fn(), saveSession: vi.fn(), onlineRequest: vi.fn(), readEvents: vi.fn(),
  OnlineError: class extends Error { status = 409; },
}));
let deliver: (data: unknown) => void;
function snapshot(revision = 1): OnlineSnapshot {
  return { revision, guestId: 'host', name: 'Host', rooms: [], room: null, pendingRequest: null };
}
function inRoom(revision = 2): OnlineSnapshot {
  return { ...snapshot(revision), room: {
    id: 'room', code: 'ABC123', name: 'Market', hostId: 'host', hostName: 'Host', count: 2, capacity: 4, status: 'waiting', version: 1,
    members: [
      { guestId: 'host', name: 'Host', colour: 'c', ready: false, connected: true },
      { guestId: 'guest', name: 'Guest', colour: 'y', ready: false, connected: true },
    ], requests: [], state: null, matchId: null, abandoned: false, lastRoll: null,
  } };
}
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  window.history.replaceState(null, '', '/');
  vi.mocked(readSession).mockReturnValue({ guestId: 'host', name: 'Host', token: 'private' });
  vi.mocked(readEvents).mockImplementation((_token, signal, onData, connected) => {
    deliver = onData; connected();
    return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve()));
  });
  vi.mocked(onlineRequest).mockResolvedValue(snapshot(99));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function payment(id = 'rent-1'): OnlinePayment {
  return { id, matchId: 'match', createdAt: Date.now(), die: 1, payer: 'c', owner: 'y', owed: 3, paid: 3, bankrupt: false, payerDirhams: 27, ownerDirhams: 33, payerScore: 27, ownerScore: 36 };
}

describe('online screens', () => {
  it('reuses the local brass menu without offering a private restart of an online game', () => {
    const value = inRoom(); value.room!.status = 'playing'; value.room!.matchId = 'match'; value.room!.state = newGame(2, () => 0);
    const onBack = vi.fn();
    render(<OnlineScreen onBack={onBack} />);
    act(() => deliver(value));
    expect(screen.getByRole('button', { name: 'Menu', exact: true }).className).toBe('menu-btn');
    expect(screen.queryByRole('button', { name: 'Home', exact: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menu', exact: true }));
    expect(screen.getByRole('dialog', { name: 'Online menu' })).toBeTruthy();
    expect(screen.getByText(/Online play continues/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restart game' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume', exact: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onlineRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Menu', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Home', exact: true }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onlineRequest).not.toHaveBeenCalled();
  });
  it('shows rent after the shared dice/walk animation and dismisses without charging again', () => {
    vi.useFakeTimers();
    const value = inRoom();
    value.room!.status = 'playing'; value.room!.matchId = 'match';
    value.room!.state = { ...newGame(2, () => 0), phase: 'move' };
    render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver(value));
    const rolled = structuredClone(value);
    rolled.revision++; rolled.room!.version++; rolled.room!.lastRoll = 1;
    rolled.room!.state = transitionGame(value.room!.state, { type: 'roll' }, () => 0).state;
    rolled.room!.payments = [payment()];
    act(() => deliver(rolled));
    expect(screen.queryByRole('dialog', { name: 'Rent due' })).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('dialog', { name: 'Rent due' })).toBeTruthy();
    expect(screen.getByText(/landed on/).textContent).toContain('pays 3');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onlineRequest).not.toHaveBeenCalled();
    act(() => deliver({ ...rolled, revision: rolled.revision + 1 }));
    expect(screen.queryByRole('dialog', { name: 'Rent due' })).toBeNull();
  });
  it('queues each unseen rent event once and retains its original totals across later turns', () => {
    const value = inRoom(); value.room!.status = 'playing'; value.room!.matchId = 'match'; value.room!.state = { ...newGame(2, () => 0), phase: 'place' };
    render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver(value));
    const next = structuredClone(value); next.revision++;
    next.room!.payments = [payment(), { ...payment('rent-2'), paid: 2, owed: 2 }];
    act(() => deliver(next));
    expect(screen.getByText(/landed on/).textContent).toContain('pays 3');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/landed on/).textContent).toContain('pays 2');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    act(() => deliver({ ...next, revision: next.revision + 1 }));
    expect(screen.queryByRole('dialog', { name: 'Rent due' })).toBeNull();
  });
  it('does not replay acknowledged rent after refresh, but shows a new bankruptcy event', () => {
    const value = inRoom(); value.room!.status = 'playing'; value.room!.matchId = 'match'; value.room!.state = { ...newGame(2, () => 0), phase: 'place' }; value.room!.payments = [payment()];
    const view = render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver(value));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    view.unmount();
    render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver({ ...value, revision: 10 }));
    expect(screen.queryByRole('dialog', { name: 'Rent due' })).toBeNull();
    const next = structuredClone(value); next.revision = 11;
    next.room!.payments!.push({ ...payment('bankruptcy'), paid: 0, bankrupt: true });
    act(() => deliver(next));
    expect(screen.getByText(/Bankrupt!/)).toBeTruthy();
    expect(screen.getByText(/landed on/).textContent).toContain('pays 0');
  });
  it('lets the host add AI and edit its difficulty, but hides these controls from guests', async () => {
    const value = inRoom();
    value.room!.members[1] = { ...value.room!.members[1], guestId: 'bot:1', ai: 'random', name: 'AI random', ready: true };
    render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver(value));
    fireEvent.change(screen.getByLabelText('AI difficulty', { exact: true }), { target: { value: 'search' } });
    await waitFor(() => expect(onlineRequest).toHaveBeenCalledWith('command', 'private', expect.objectContaining({ type: 'setAi', guestId: 'bot:1', kind: 'search' })));
    act(() => deliver({ ...value, revision: 100 }));
    fireEvent.click(screen.getByRole('button', { name: 'Add AI', exact: true }));
    await waitFor(() => expect(onlineRequest).toHaveBeenCalledWith('command', 'private', expect.objectContaining({ type: 'addAi', kind: 'greedy' })));
    const notHost = structuredClone(value); notHost.revision = 101; notHost.room!.hostId = 'other';
    act(() => deliver(notHost));
    expect(screen.queryByRole('button', { name: 'Add AI', exact: true })).toBeNull();
    expect(screen.queryByLabelText('AI difficulty', { exact: true })).toBeNull();
  });
  it('finishes dice and movement even while unrelated snapshots keep arriving', () => {
    vi.useFakeTimers();
    const value = inRoom();
    value.room!.status = 'playing'; value.room!.matchId = 'match';
    value.room!.state = { ...newGame(2, () => 0), phase: 'move' };
    render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver(value));
    const rolled = structuredClone(value);
    rolled.revision++; rolled.room!.version++; rolled.room!.lastRoll = 1;
    rolled.room!.state = transitionGame(value.room!.state, { type: 'roll' }, () => 0).state;
    act(() => deliver(rolled));
    for (let i = 0; i < 5; i++) {
      act(() => { vi.advanceTimersByTime(700); });
      act(() => { deliver({ ...rolled, revision: rolled.revision + i + 1 }); });
    }
    expect(screen.queryAllByRole('button', { name: /^cell/ }).length).toBeGreaterThan(0);
  });
  it('preserves the joined room URL when a delayed join response finishes', async () => {
    let resolveCommand: (value: OnlineSnapshot) => void = () => undefined;
    vi.mocked(onlineRequest).mockImplementation(() => new Promise(resolve => { resolveCommand = resolve as typeof resolveCommand; }));
    render(<OnlineScreen onBack={() => undefined} />);
    const lobby = snapshot();
    lobby.rooms = [{ id: 'room', code: 'ABC123', name: 'Market', hostName: 'Other', count: 1, capacity: 4, status: 'waiting' }];
    act(() => deliver(lobby));
    fireEvent.click(screen.getAllByRole('button', { name: 'Request to join' })[0]);
    act(() => deliver(inRoom(5)));
    await act(async () => { resolveCommand(snapshot(3)); await Promise.resolve(); });
    expect(new URLSearchParams(window.location.search).get('room')).toBe('ABC123');
  });
  it('keeps newer membership when an older lobby response arrives', () => {
    render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver(inRoom(5)));
    act(() => deliver(snapshot(4)));
    expect(screen.getByRole('heading', { name: 'Market' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Public rooms' })).toBeNull();
    act(() => deliver(snapshot(6)));
    act(() => deliver(inRoom(5)));
    expect(screen.getByRole('heading', { name: 'Public rooms' })).toBeTruthy();
  });
  it('shows pending requests and sends host acceptance with version and unique id', async () => {
    const value = inRoom();
    value.room!.requests = [{ guestId: 'third', name: 'Third', expiresAt: Date.now() + 60000 }];
    render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver(value));
    expect((screen.getByRole('button', { name: 'Start game' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Accept', exact: true }));
    await waitFor(() => expect(onlineRequest).toHaveBeenCalledWith('command', 'private', expect.objectContaining({ type: 'accept', guestId: 'third', version: 1, id: expect.any(String) })));
  });
  it('disables gameplay when another player owns the turn or disconnects', () => {
    const value = inRoom();
    value.room!.status = 'playing'; value.room!.state = newGame(2, () => 0); value.room!.state.turnIndex = 1;
    render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver(value));
    expect((screen.getByRole('button', { name: 'Face up' }) as HTMLButtonElement).disabled).toBe(true);
    const next = structuredClone(value); next.revision++; next.room!.state!.turnIndex = 0; next.room!.members[1].connected = false;
    act(() => deliver(next));
    expect(screen.getByText(/Match paused/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Face up' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('requires an explicit confirmation before abandoning an active match', async () => {
    const value = inRoom(); value.room!.status = 'playing'; value.room!.state = newGame(2, () => 0);
    render(<OnlineScreen onBack={() => undefined} />);
    act(() => deliver(value));
    fireEvent.click(screen.getByRole('button', { name: 'Menu', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave match' }));
    expect(onlineRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End match and leave' }));
    await waitFor(() => expect(onlineRequest).toHaveBeenCalledWith('command', 'private', expect.objectContaining({ type: 'leave' })));
  });
});
