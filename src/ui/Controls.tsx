// Turn controls. Which buttons are enabled depends on the current phase.
import type { Colour, Facing, GameState } from '@marrakech/engine';
import type { PlayerNames } from './players';
import assamImg from '../assets/assam.png';

const DIRECTIONS: { facing: Facing; label: string; arrow: string }[] = [
  { facing: 'N', label: 'up', arrow: '↑' },
  { facing: 'E', label: 'right', arrow: '→' },
  { facing: 'S', label: 'down', arrow: '↓' },
  { facing: 'W', label: 'left', arrow: '←' },
];

export type Controls = {
  state: GameState;
  die: number | null;
  message: string;
  winner: Colour | 'tie' | null;
  names: PlayerNames;
  busy?: boolean; // a roll/walk/prompt is in progress — freeze the controls
  canCancel: boolean;
  onRotate: (deg: 0 | 90 | 270) => void;
  onRoll: () => void;
  onCancel: () => void;
};

export function Controls(p: Controls) {
  const { state, phase } = { state: p.state, phase: p.state.phase };
  const current = state.players[state.turnIndex];
  const facingIndex = DIRECTIONS.findIndex(direction => direction.facing === state.assam.facing);
  const facing = DIRECTIONS[facingIndex];

  return (
    <section className="controls">
      <p className="message" role="status">
        {p.winner
          ? p.winner === 'tie'
            ? "It's a tie!"
            : `${p.names[p.winner]} wins!`
          : p.message}
      </p>

      {!p.winner && (
        <>
          <div className="phase-steps">
            <span className={phase === 'rotate' ? 'step on' : 'step'}>1 · Direction</span>
            <span className={phase === 'move' ? 'step on' : 'step'}>2 · Roll</span>
            <span className={phase === 'place' ? 'step on' : 'step'}>3 · Place</span>
          </div>

          {phase === 'rotate' && (
            <div className="direction-picker">
              <p className="direction-label" id="direction-help">Choose a board direction</p>
              <div className="direction-pad" role="group" aria-label="Assam direction" aria-describedby="direction-help direction-rule">
                {DIRECTIONS.map((direction, index) => {
                  const rotation = ((index - facingIndex + 4) % 4) * 90;
                  const backwards = rotation === 180;
                  return <button
                    key={direction.facing}
                    type="button"
                    className={`direction-button direction-${direction.facing}`}
                    aria-label={`Face ${direction.label}`}
                    title={backwards ? `Cannot face ${direction.label} — Assam cannot turn back` : `Face ${direction.label} on the board`}
                    disabled={p.busy || backwards}
                    onClick={() => { if (!backwards) p.onRotate(rotation as 0 | 90 | 270); }}
                  ><span aria-hidden="true">{direction.arrow}</span></button>;
                })}
                <div className="direction-center" aria-hidden="true">
                  <div className="direction-preview" style={{ transform: `rotate(${facingIndex * 90}deg)` }}>
                    <img src={assamImg} alt="" draggable={false} />
                    <span className="direction-preview-tip">▲</span>
                  </div>
                </div>
              </div>
              <p className="direction-facing">Facing <strong>{facing.arrow} {facing.label}</strong></p>
              <p className="direction-rule" id="direction-rule">Arrows follow the board. Assam cannot turn back.</p>
            </div>
          )}

          {phase === 'move' && (
            <div className="btn-row">
              <button type="button" className="primary" disabled={p.busy} onClick={p.onRoll}>
                🎲 {p.busy ? 'Rolling…' : `Roll die${p.die ? ` — rolled ${p.die}` : ''}`}
              </button>
            </div>
          )}

          {phase === 'place' && (
            <div className="btn-row">
              <span className="hint">
                {current && `${p.names[current.colour]}: click a tile next to Assam, then its partner.`}
              </span>
              {p.canCancel && (
                <button type="button" onClick={p.onCancel}>Cancel</button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
