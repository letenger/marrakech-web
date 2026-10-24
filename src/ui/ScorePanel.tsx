// Shared local/online player statistics, including visible board coverage.
import type { CSSProperties } from 'react';
import { countColour, scoreOf, type GameState } from '@marrakech/engine';
import { PLAYER_HEX } from './players';
import type { PlayerNames } from './players';
import coinGold from '../assets/coin_gold.png';

export function ScorePanel({ state, names, lastRoll }: { state: GameState; names: PlayerNames; lastRoll?: number | null }) {
  return (
    <aside className="score-panel">
      <h2>Players</h2>
      <p className="score-legend">
        <span><img className="coin" src={coinGold} alt="" /> Dirhams</span>
        <span><span aria-hidden="true">🧶</span> Rugs</span>
        <span><span aria-hidden="true">▦</span> Squares</span>
        {lastRoll !== undefined && <span aria-label={lastRoll === null ? 'Waiting for the first roll' : `Last roll: ${lastRoll}`} title="Last roll"><span aria-hidden="true">🎲</span> {lastRoll ?? '—'}</span>}
      </p>
      {state.players.map((p, i) => (
        <div
          key={p.colour}
          className={`player-row ${i === state.turnIndex && !p.out ? 'is-turn' : ''} ${p.out ? 'is-out' : ''}`}
          style={{ ['--glow']: PLAYER_HEX[p.colour] } as CSSProperties}
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
          <span className="stat squares" aria-label={`${names[p.colour]}: ${countColour(state.board, p.colour)} visible squares`} title="Visible squares on the board"><span aria-hidden="true">▦</span> {countColour(state.board, p.colour)}</span>
          <span className="stat total">{scoreOf(state, p)} pts</span>
        </div>
      ))}
    </aside>
  );
}
