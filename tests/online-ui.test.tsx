// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { newGame, transitionGame, type OnlineSnapshot } from '@marrakech/engine';
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
  window.history.replaceState(null, '', '/');
  vi.mocked(readSession).mockReturnValue({ guestId: 'host', name: 'Host', token: 'private' });
  vi.mocked(readEvents).mockImplementation((_token, signal, onData, connected) => {
    deliver = onData; connected();
    return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve()));
  });
  vi.mocked(onlineRequest).mockResolvedValue(snapshot(99));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('online screens', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Leave match' }));
    expect(onlineRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End match and leave' }));
    await waitFor(() => expect(onlineRequest).toHaveBeenCalledWith('command', 'private', expect.objectContaining({ type: 'leave' })));
  });
});
