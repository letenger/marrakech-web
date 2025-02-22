// Pre-game lobby: choose how many merchants play (2–4) and let each rename
// their colour. Hands a finished config back to App when Start is pressed.
import { useState } from 'react';
import type { Colour } from '../game/types';
import { PLAYER_HEX, PLAYER_NAME, defaultNames } from './players';
import type { GameConfig } from './GameScreen';

// Colours fill in the same fixed order the game assigns them (see setup.ts).
const COLOURS: Colour[] = ['c', 'y', 'r', 'p'];
const NAME_LIMIT = 12;

export function SetupScreen({
  onStart,
  onBack,
}: {
  onStart: (config: GameConfig) => void;
  onBack: () => void;
}) {
  const [count, setCount] = useState(4);
  const [names, setNames] = useState(defaultNames);

  const active = COLOURS.slice(0, count);

  function start() {
    // Blank fields fall back to the default colour name.
    const resolved = { ...names };
    for (const c of COLOURS) {
      if (!resolved[c].trim()) resolved[c] = PLAYER_NAME[c];
    }
    onStart({ count, names: resolved });
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
          <span className="setup-label">Names</span>
          <div className="name-list">
            {active.map((c) => (
              <label key={c} className="name-row">
                <span className="swatch" style={{ background: PLAYER_HEX[c] }} />
                <input
                  className="name-input"
                  value={names[c]}
                  maxLength={NAME_LIMIT}
                  placeholder={PLAYER_NAME[c]}
                  onChange={(e) => setNames((prev) => ({ ...prev, [c]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <span className="setup-foot">Up to {NAME_LIMIT} letters each.</span>
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
