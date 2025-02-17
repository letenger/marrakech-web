// A turn-result prompt: pops up after Assam lands on another player's rug to
// spell out the rent — who pays whom, how many dirhams, and the resulting
// scores — before play continues. Dismissed with Continue.
import type { Colour } from '../game/types';
import { PLAYER_HEX, PLAYER_NAME } from './players';
import coinGold from '../assets/coin_gold.png';

export type PaymentResult = {
  die: number;
  payer: Colour;
  owner: Colour;
  owed: number; // rent the connected region demanded
  paid: number; // what actually changed hands (less than owed if bankrupt)
  bankrupt: boolean;
  // Totals after the rent is settled, for the two players involved.
  payerDirhams: number;
  ownerDirhams: number;
  payerScore: number;
  ownerScore: number;
};

function Swatch({ colour }: { colour: Colour }) {
  return <span className="swatch" style={{ background: PLAYER_HEX[colour] }} />;
}

function Party({
  colour,
  delta,
  dirhams,
  score,
}: {
  colour: Colour;
  delta: number;
  dirhams: number;
  score: number;
}) {
  const sign = delta > 0 ? '+' : '';
  return (
    <div className="pp-party">
      <Swatch colour={colour} />
      <span className="pp-party-name">{PLAYER_NAME[colour]}</span>
      <span className={`pp-delta ${delta < 0 ? 'down' : 'up'}`}>
        {sign}
        {delta}
        <img className="coin" src={coinGold} alt="dirhams" />
      </span>
      <span className="pp-totals">
        {dirhams} 🪙 · {score} pts
      </span>
    </div>
  );
}

export function PaymentPrompt({ r, onContinue }: { r: PaymentResult; onContinue: () => void }) {
  return (
    <div className="pp-backdrop" onClick={onContinue}>
      <div className="pp-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className={r.bankrupt ? 'pp-title danger' : 'pp-title'}>
          🎲 {r.die} · {r.bankrupt ? 'Bankrupt!' : 'Rent due'}
        </h3>

        <p className="pp-line">
          <strong>{PLAYER_NAME[r.payer]}</strong> landed on{' '}
          <strong>{PLAYER_NAME[r.owner]}</strong>'s rug ({r.owed}{' '}
          {r.owed === 1 ? 'tile' : 'tiles'}) — pays <strong>{r.paid}</strong> 🪙.
          {r.bankrupt && ` Can't cover ${r.owed} and is out.`}
        </p>

        <div className="pp-ledger">
          <Party colour={r.payer} delta={-r.paid} dirhams={r.payerDirhams} score={r.payerScore} />
          <Party colour={r.owner} delta={r.paid} dirhams={r.ownerDirhams} score={r.ownerScore} />
        </div>

        <button type="button" className="pp-continue" onClick={onContinue} autoFocus>
          Continue
        </button>
      </div>
    </div>
  );
}
