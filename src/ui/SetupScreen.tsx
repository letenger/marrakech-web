// Pre-game lobby: choose how many merchants play (2–4), rename each colour, and
// decide who controls each seat (you or one of the AI agents). Hands a finished
// config back to App when Start is pressed.
import { useState } from 'react';
import type { Colour } from '@marrakech/engine';
import { PLAYER_HEX, PLAYER_NAME, defaultNames, defaultSeats } from './players';
import type { GameConfig, SeatKind } from './players';

// Colours fill in the same fixed order the game assigns them (see setup.ts).
const COLOURS: Colour[] = ['c', 'y', 'r', 'p'];
const NAME_LIMIT = 12;

// The control options for each seat, in the order they cycle.
const SEAT_KINDS: { kind: SeatKind; label: string }[] = [
  { kind: 'human', label: 'You' },
  { kind: 'random', label: 'AI · Random' },
  { kind: 'greedy', label: 'AI · Greedy' },
  { kind: 'search', label: 'AI · Search' },
];
const seatLabel = (k: SeatKind) => SEAT_KINDS.find((s) => s.kind === k)!.label;

export function SetupScreen({
  onStart,
  onBack,
}: {
  onStart: (config: GameConfig) => void;
  onBack: () => void;
}) {
  const [count, setCount] = useState(4);
  const [names, setNames] = useState(defaultNames);
  const [seats, setSeats] = useState(defaultSeats);

  const active = COLOURS.slice(0, count);

  // Cycle a seat through You → Random → Greedy → Search → You.
  function cycleSeat(c: Colour) {
    setSeats((prev) => {
      const i = SEAT_KINDS.findIndex((s) => s.kind === prev[c]);
      const next = SEAT_KINDS[(i + 1) % SEAT_KINDS.length].kind;
      return { ...prev, [c]: next };
    });
  }

  function start() {
    // Blank fields fall back to the default colour name.
    const resolved = { ...names };
    for (const c of COLOURS) {
      if (!resolved[c].trim()) resolved[c] = PLAYER_NAME[c];
    }
    onStart({ count, names: resolved, seats: { ...seats } });
  }

  return (
    <div className="scene scene-setup">
      <div className="setup-inner">
        <h1 className="setup-title">New Game</h1>

        <div className="setup-section">
          <span className="setup-label">Players</span>
          <div className="count-row">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={`count-btn ${n === count ? 'on' : ''}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <span className="setup-label">Players</span>
          <div className="name-list">
            {active.map((c) => (
              <div key={c} className="name-row">
                <span className="swatch" style={{ background: PLAYER_HEX[c] }} />
                <input
                  className="name-input"
                  value={names[c]}
                  maxLength={NAME_LIMIT}
                  placeholder={PLAYER_NAME[c]}
                  onChange={(e) => setNames((prev) => ({ ...prev, [c]: e.target.value }))}
                />
                <button
                  type="button"
                  className={`seat-btn ${seats[c] === 'human' ? '' : 'is-ai'}`}
                  onClick={() => cycleSeat(c)}
                  aria-label={`${names[c] || PLAYER_NAME[c]} controlled by ${seatLabel(seats[c])}`}
                >
                  {seatLabel(seats[c])}
                </button>
              </div>
            ))}
          </div>
          <span className="setup-foot">Names up to {NAME_LIMIT} letters. Tap a seat to hand it to the AI.</span>
        </div>

        <div className="setup-actions">
          <button type="button" className="home-btn" onClick={onBack}>
            Back
          </button>
          <button type="button" className="home-btn primary" onClick={start}>
            Start Market
          </button>
        </div>
      </div>
    </div>
  );
}
