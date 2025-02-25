// The playable scene: renders the board, controls and overlays for the turn
// flow owned by useTurnFlow. Owns only view-level state (the pause menu).
import { useState } from 'react';
import { BoardView } from './BoardView';
import { ScorePanel } from './ScorePanel';
import { Controls } from './Controls';
import { DiceRoll } from './DiceRoll';
import { PaymentPrompt } from './PaymentPrompt';
import { GameMenu } from './GameMenu';
import { GameOver } from './GameOver';
import type { GameConfig } from './players';
import { useTurnFlow } from './useTurnFlow';
import type { GameState } from '../game/types';

export type { GameConfig };

export function GameScreen({
  config,
  resumeState,
  onExit,
}: {
  config: GameConfig;
  resumeState?: GameState;
  onExit: () => void;
}) {
  const { names } = config;
  const flow = useTurnFlow(config, resumeState);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app scene scene-play">
      <header className="app-header game-header">
        <div>
          <h1>Marrakech</h1>
          <p className="tagline">Rug merchants of the medina</p>
        </div>
        <button type="button" className="menu-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          ❖
        </button>
      </header>
      <main className="layout">
        <BoardView state={flow.state} overlays={flow.overlays} />
        <div className="side">
          <Controls
            state={flow.state}
            die={flow.die}
            message={flow.message}
            winner={flow.winner}
            names={names}
            busy={flow.busy}
            canCancel={flow.canCancel}
            onRotate={flow.onRotate}
            onRoll={flow.onRoll}
            onCancel={flow.onCancel}
          />
          <ScorePanel state={flow.state} names={names} />
        </div>
      </main>

      {flow.rolling && <DiceRoll value={flow.rolling.value} onDone={flow.rolling.commit} />}
      {flow.prompt && <PaymentPrompt r={flow.prompt.result} names={names} onContinue={flow.prompt.onContinue} />}
      {menuOpen && (
        <GameMenu
          onResume={() => setMenuOpen(false)}
          onRestart={() => {
            setMenuOpen(false);
            flow.reset();
          }}
          onQuit={onExit}
        />
      )}
      {flow.gameOver && (
        <GameOver
          state={flow.state}
          winner={flow.winner!}
          names={names}
          onPlayAgain={flow.reset}
          onMenu={onExit}
        />
      )}
    </div>
  );
}
