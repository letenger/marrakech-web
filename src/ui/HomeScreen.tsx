// The title screen: the first thing players see. Start a new game or read
// the rules. Owns its own rules toggle.
import { useState } from 'react';
import { RulesPanel } from './RulesPanel';

export function HomeScreen({ onNewGame }: { onNewGame: () => void }) {
  const [showRules, setShowRules] = useState(false);

  return (
    <div className="scene scene-home">
      <div className="home-inner">
        <div className="home-die" aria-hidden="true">🎲</div>
        <h1 className="home-title">Marrakech</h1>
        <p className="home-tagline">Rug merchants of the medina</p>

        <div className="home-actions">
          <button type="button" className="home-btn primary" onClick={onNewGame}>
            New Game
          </button>
          <button type="button" className="home-btn" onClick={() => setShowRules(true)}>
            How to Play
          </button>
        </div>
      </div>

      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
    </div>
  );
}
