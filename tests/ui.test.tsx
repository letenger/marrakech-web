// @vitest-environment jsdom
// Interaction tests for the React UI: scene navigation, the timer-driven turn
// flow, save/resume persistence, and overlay accessibility. The pure rules are
// covered elsewhere; these guard the wiring between the engine and the screen.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import App from '../src/App';
import { GameScreen } from '../src/ui/GameScreen';
import { defaultNames, defaultSeats } from '../src/ui/players';
import { Controls } from '../src/ui/Controls';
import { BoardView } from '../src/ui/BoardView';
import { newGame, type Facing } from '@marrakech/engine';

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

describe('board-relative direction controls', () => {
  it('uses the printed corner loop only when walking, not when choosing a direction', () => {
    const original = Element.prototype.animate;
    const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel: vi.fn() }));
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
    try {
      const start = newGame(2, () => 0);
      start.assam = { pos: { col: 6, row: 0 }, facing: 'E' };
      const end = { ...start, assam: { ...start.assam, facing: 'S' as const } };
      const view = render(<BoardView state={start} />);
      view.rerender(<BoardView state={end} walking />);
      const walkingFrames = animate.mock.calls[0][0];
      expect(walkingFrames.length).toBeGreaterThan(2);
      expect(walkingFrames[0].transform).toBe('rotate(90deg)');
      expect(walkingFrames.at(-1)!.transform).toBe('rotate(-180deg)');
      expect(animate).toHaveBeenCalledTimes(2); // piece and its direction marker
      view.unmount();
      animate.mockClear();
      const manual = render(<BoardView state={start} />);
      manual.rerender(<BoardView state={end} />);
      expect(animate.mock.calls[0][0]).toEqual([
        { transform: 'rotate(90deg)' }, { transform: 'rotate(180deg)' },
      ]);
    } finally {
      if (original) Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: original });
      else Reflect.deleteProperty(Element.prototype, 'animate');
    }
  });

  it.each([
    { facing: 'N', blocked: 'down', up: 0, right: 90, left: 270 },
    { facing: 'E', blocked: 'left', up: 270, right: 0, down: 90 },
    { facing: 'S', blocked: 'up', right: 270, down: 0, left: 90 },
    { facing: 'W', blocked: 'right', up: 90, down: 270, left: 0 },
  ])('uses fixed board directions when Assam faces $facing', ({ facing, blocked, ...allowed }) => {
    const state = newGame(2, () => 0);
    state.assam.facing = facing as Facing;
    const onRotate = vi.fn();
    render(<Controls state={state} names={defaultNames()} die={null} message="Choose a direction" winner={null} canCancel={false} onRotate={onRotate} onRoll={() => {}} onCancel={() => {}} />);
    const back = screen.getByRole('button', { name: `Face ${blocked}` }) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    fireEvent.click(back);
    expect(onRotate).not.toHaveBeenCalled();
    for (const [direction, degrees] of Object.entries(allowed)) {
      const button = screen.getByRole('button', { name: `Face ${direction}` }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      fireEvent.click(button);
      expect(onRotate).toHaveBeenLastCalledWith(degrees);
    }
  });

  it('locks all directions while busy', () => {
    render(<Controls state={newGame(2, () => 0)} names={defaultNames()} die={null} message="Waiting" winner={null} busy canCancel={false} onRotate={() => {}} onRoll={() => {}} onCancel={() => {}} />);
    for (const button of screen.getAllByRole('button', { name: /^Face / })) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([['N', 'up'], ['E', 'right'], ['S', 'down'], ['W', 'left']] as const)('marks Assam’s board facing %s', (facing, direction) => {
    const state = newGame(2, () => 0);
    state.assam.facing = facing;
    render(<BoardView state={state} />);
    expect(screen.getByRole('img', { name: `Assam faces ${direction}` })).toBeTruthy();
  });
});

describe('scene navigation', () => {
  it('walks Home → Setup → Play', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Marrakech' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(screen.getByRole('button', { name: 'Start Market' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start Market' }));
    expect(screen.getByText(/choose a direction on the board/i)).toBeTruthy();
  });
});

describe('turn flow', () => {
  it('advances rotate → roll → place across the timer chain', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // Assam faces N, die rolls 1
    vi.useFakeTimers();
    render(<GameScreen config={config()} onExit={() => {}} />);

    // Rotate step → move step.
    fireEvent.click(screen.getByRole('button', { name: 'Face up' }));
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
