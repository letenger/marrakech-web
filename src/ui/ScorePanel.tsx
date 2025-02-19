// Shows each player's money (dirhams) and rugs left, with a real coin image.
import type { GameState } from '../game/types';
import { scoreOf } from '../game/rules';
import { PLAYER_HEX } from './players';
import type { PlayerNames } from './players';
import coinGold from '../assets/coin_gold.png';

export function ScorePanel({ state, names }: { state: GameState; names: PlayerNames }) {
  return (
    <aside className="score-panel">
      <h2>Players</h2>
      {state.players.map((p, i) => (
        <div
          key={p.colour}
          className={`player-row ${i === state.turnIndex && !p.out ? 'is-turn' : ''} ${p.out ? 'is-out' : ''}`}
        >
          <span className="swatch" style={{ background: PLAYER_HEX[p.colour] }} />
          <span className="player-name">
            {names[p.colour]}
            {p.out && <span className="out-tag">out</span>}
          </span>
          <span className="stat">
            <img className="coin" src={coinGold} alt="dirhams" /> {p.dirhams}
          </span>
          <span className="stat rugs">🧶 {p.rugsLeft}</span>
          <span className="stat total">{scoreOf(state, p)} pts</span>
        </div>
      ))}
    </aside>
  );
}
