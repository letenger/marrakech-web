// The in-game ☰ menu: resume, review the rules, restart, or quit to the
// main menu. Owns its own rules toggle so the rules are reachable mid-game.
import { useState } from 'react';
import { RulesPanel } from './RulesPanel';

export function GameMenu({
  onResume,
  onRestart,
  onQuit,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  const [showRules, setShowRules] = useState(false);

  if (showRules) return <RulesPanel onClose={() => setShowRules(false)} />;

  return (
    <div className="overlay-backdrop" onClick={onResume}>
      <div className="menu-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="menu-title">Paused</h2>
        <button type="button" className="menu-item primary" onClick={onResume}>
          Resume
        </button>
        <button type="button" className="menu-item" onClick={() => setShowRules(true)}>
          How to play
        </button>
        <button type="button" className="menu-item" onClick={onRestart}>
          Restart game
        </button>
        <button type="button" className="menu-item danger" onClick={onQuit}>
          Quit to menu
        </button>
      </div>
    </div>
  );
}
