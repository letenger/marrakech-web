// @vitest-environment jsdom
// Interaction tests for the React UI: scene navigation, the timer-driven turn
// flow, save/resume persistence, and overlay accessibility. The pure rules are
// covered elsewhere; these guard the wiring between the engine and the screen.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import App from '../src/App';
import { GameScreen } from '../src/ui/GameScreen';
import { defaultNames, defaultSeats } from '../src/ui/players';

// jsdom here doesn't expose localStorage; provide a minimal in-memory shim.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const config = () => ({ count: 2, names: defaultNames(), seats: defaultSeats() });

describe('scene navigation', () => {
  it('walks Home → Setup → Play', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Marrakech' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(screen.getByRole('button', { name: 'Start Market' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start Market' }));
    expect(screen.getByText(/rotate Assam/i)).toBeTruthy();
  });
});

describe('turn flow', () => {
  it('advances rotate → roll → place across the timer chain', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // Assam faces N, die rolls 1
    vi.useFakeTimers();
    render(<GameScreen config={config()} onExit={() => {}} />);

    // Rotate step → move step.
    fireEvent.click(screen.getByRole('button', { name: /Keep straight/i }));
    expect(screen.getByText(/roll the die/i)).toBeTruthy();

    // Roll → dice overlay → walk → settle.
    fireEvent.click(screen.getByRole('button', { name: /Roll die/i }));
    act(() => void vi.advanceTimersByTime(1200)); // dice resolves, walk begins
    act(() => void vi.advanceTimersByTime(1500)); // walk + landing settle

    // Landed on empty sand (no rent) → placement phase.
    expect(screen.getByText(/Place a rug next to Assam/i)).toBeTruthy();
  });

  it('auto-plays an AI seat without human input', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    // Player 0 (Peacock) is a greedy AI; nobody clicks anything.
    const cfg = { count: 2, names: defaultNames(), seats: { ...defaultSeats(), c: 'greedy' as const } };
    render(<GameScreen config={cfg} onExit={() => {}} />);

    // Opens in Peacock's rotate phase; the AI driver should act on its own.
    expect(screen.getByText(/Peacock to move/i)).toBeTruthy();

    // Drive the timers through the AI's rotate → roll → walk → place chain.
    act(() => void vi.advanceTimersByTime(4000));

    // The AI completed its turn and handed off to player 1 (Saffron).
    expect(screen.getByText(/Saffron/i)).toBeTruthy();
  });
});

describe('save / resume', () => {
  it('persists a snapshot and Home offers Resume', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { unmount } = render(<GameScreen config={config()} onExit={() => {}} />);
    // The persistence effect writes at the first stable state (mount).
    expect(localStorage.getItem('marrakech.save.v1')).toBeTruthy();
    unmount();

    render(<App />);
    expect(screen.getByRole('button', { name: /Resume Game/i })).toBeTruthy();
  });

  it('hides Resume when there is no save', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /Resume Game/i })).toBeNull();
  });
});

describe('accessibility', () => {
  it('opens the pause menu and closes it with Escape', () => {
    render(<GameScreen config={config()} onExit={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Menu/i }));
    expect(screen.getByRole('dialog', { name: /paused/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /paused/i })).toBeNull();
  });
});
