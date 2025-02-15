// Turn controls. Which buttons are enabled depends on the current phase.
import type { Colour, GameState } from '../game/types';
import { PLAYER_NAME } from './players';

export type Controls = {
  state: GameState;
  die: number | null;
  message: string;
  winner: Colour | 'tie' | null;
  canCancel: boolean;
  onRotate: (deg: 0 | 90 | 270) => void;
  onRoll: () => void;
  onCancel: () => void;
  onNewGame: (players: number) => void;
};

export function Controls(p: Controls) {
  const { state, phase } = { state: p.state, phase: p.state.phase };
  const current = state.players[state.turnIndex];

  return (
    <section className="controls">
      <p className="message" role="status">
        {p.winner
          ? p.winner === 'tie'
            ? "It's a tie!"
            : `${PLAYER_NAME[p.winner]} wins!`
          : p.message}
      </p>

      {!p.winner && (
        <>
          <div className="phase-steps">
            <span className={phase === 'rotate' ? 'step on' : 'step'}>1 · Rotate</span>
            <span className={phase === 'move' ? 'step on' : 'step'}>2 · Roll</span>
            <span className={phase === 'place' ? 'step on' : 'step'}>3 · Place</span>
          </div>

          {phase === 'rotate' && (
            <div className="btn-row">
              <button type="button" onClick={() => p.onRotate(270)}>↺ Turn left</button>
              <button type="button" onClick={() => p.onRotate(0)}>↑ Keep straight</button>
              <button type="button" onClick={() => p.onRotate(90)}>↻ Turn right</button>
            </div>
          )}

          {phase === 'move' && (
            <div className="btn-row">
              <button type="button" className="primary" onClick={p.onRoll}>
                🎲 Roll die {p.die ? `— rolled ${p.die}` : ''}
              </button>
            </div>
          )}

          {phase === 'place' && (
            <div className="btn-row">
              <span className="hint">
                {current && `${PLAYER_NAME[current.colour]}: click a tile next to Assam, then its partner.`}
              </span>
              {p.canCancel && (
                <button type="button" onClick={p.onCancel}>Cancel</button>
              )}
            </div>
          )}
        </>
      )}

      <div className="btn-row new-game">
        <span className="hint">New game:</span>
        {[2, 3, 4].map((n) => (
          <button key={n} type="button" onClick={() => p.onNewGame(n)}>
            {n}P
          </button>
        ))}
      </div>
    </section>
  );
}
