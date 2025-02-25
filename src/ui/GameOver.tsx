// End-of-game scene: announces the winner and the final standings, then
// offers a rematch (same players) or a trip back to the main menu.
import type { Colour, GameState } from '../game/types';
import { scoreOf } from '../game/rules';
import { countColour } from '../game/board';
import { PLAYER_HEX } from './players';
import type { PlayerNames } from './players';
import { useDialog } from './useDialog';

export function GameOver({
  state,
  winner,
  names,
  onPlayAgain,
  onMenu,
}: {
  state: GameState;
  winner: Colour | 'tie';
  names: PlayerNames;
  onPlayAgain: () => void;
  onMenu: () => void;
}) {
  // Final standings: best score first, dirhams as the tie-breaker.
  const standings = [...state.players].sort((a, b) => {
    const byScore = scoreOf(state, b) - scoreOf(state, a);
    return byScore !== 0 ? byScore : b.dirhams - a.dirhams;
  });

  const ref = useDialog<HTMLDivElement>(); // no Esc-dismiss: a choice is required

  return (
    <div className="overlay-backdrop">
      <div className="over-card scene" role="dialog" aria-modal="true" aria-label="Game over" tabIndex={-1} ref={ref}>
        <div className="over-crown">🏆</div>
        <h2 className="over-title">
          {winner === 'tie' ? "It's a tie!" : `${names[winner]} wins!`}
        </h2>

        <ol className="over-standings">
          {standings.map((p, i) => {
            const tiles = countColour(state.board, p.colour);
            return (
              <li key={p.colour} className={p.out ? 'is-out' : ''}>
                <span className="over-rank">{i + 1}</span>
                <span className="swatch" style={{ background: PLAYER_HEX[p.colour] }} />
                <span className="over-name">
                  {names[p.colour]}
                  {p.out && <span className="out-tag">out</span>}
                </span>
                <span className="over-score">
                  <b>{scoreOf(state, p)} pts</b>
                  <small>{p.dirhams} 🪙 + {tiles} {tiles === 1 ? 'tile' : 'tiles'}</small>
                </span>
              </li>
            );
          })}
        </ol>

        <div className="over-actions">
          <button type="button" className="pp-continue" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="menu-item" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
