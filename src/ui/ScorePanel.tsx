// Shows each player's money (dirhams) and rugs left, with a real coin image.
import type { Colour, GameState } from '../game/types';
import { scoreOf } from '../game/rules';
import coinGold from '../assets/coin_gold.png';

const PLAYER_HEX: Record<Colour, string> = { c: '#1FA8B8', y: '#E6B422', r: '#C0392B', p: '#7D3C98' };
const PLAYER_NAME: Record<Colour, string> = { c: 'Cyan', y: 'Yellow', r: 'Red', p: 'Purple' };

export function ScorePanel({ state }: { state: GameState }) {
  return (
    <aside className="score-panel">
      <h2>Players</h2>
      {state.players.map((p, i) => (
        <div key={p.colour} className={`player-row ${i === state.turnIndex ? 'is-turn' : ''}`}>
          <span className="swatch" style={{ background: PLAYER_HEX[p.colour] }} />
          <span className="player-name">{PLAYER_NAME[p.colour]}</span>
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
