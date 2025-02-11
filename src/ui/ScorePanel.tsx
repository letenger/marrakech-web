// Shows each player's money (dirhams) and rugs left, with a drawn coin.
import type { Colour, GameState } from '../game/types';
import { scoreOf } from '../game/rules';

const PLAYER_HEX: Record<Colour, string> = { c: '#1FA8B8', y: '#E6B422', r: '#C0392B', p: '#7D3C98' };
const PLAYER_NAME: Record<Colour, string> = { c: 'Cyan', y: 'Yellow', r: 'Red', p: 'Purple' };

function Coin() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="10" fill="#e6b422" stroke="#b8860b" strokeWidth="1.5" />
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="#b8860b" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

export function ScorePanel({ state }: { state: GameState }) {
  return (
    <aside className="score-panel">
      <h2>Players</h2>
      {state.players.map((p, i) => (
        <div key={p.colour} className={`player-row ${i === state.turnIndex ? 'is-turn' : ''}`}>
          <span className="swatch" style={{ background: PLAYER_HEX[p.colour] }} />
          <span className="player-name">{PLAYER_NAME[p.colour]}</span>
          <span className="stat">
            <Coin /> {p.dirhams}
          </span>
          <span className="stat rugs">🧶 {p.rugsLeft}</span>
          <span className="stat total">{scoreOf(state, p)} pts</span>
        </div>
      ))}
    </aside>
  );
}
