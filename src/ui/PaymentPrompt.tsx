// A turn-result prompt: pops up after Assam lands on another player's rug to
// spell out the rent — who pays whom, how many dirhams, and the resulting
// scores — before play continues. Dismissed with Continue.
import type { Colour } from '../game/types';
import { PLAYER_HEX } from './players';
import type { PlayerNames } from './players';
import { useDialog } from './useDialog';
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
  name,
  delta,
  dirhams,
  score,
}: {
  colour: Colour;
  name: string;
  delta: number;
  dirhams: number;
  score: number;
}) {
  const sign = delta > 0 ? '+' : '';
  return (
    <div className="pp-party">
      <Swatch colour={colour} />
      <span className="pp-party-name">{name}</span>
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

export function PaymentPrompt({
  r,
  names,
  onContinue,
}: {
  r: PaymentResult;
  names: PlayerNames;
  onContinue: () => void;
}) {
  const ref = useDialog<HTMLDivElement>(onContinue);
  return (
    <div className="pp-backdrop" onClick={onContinue}>
      <div
        className="pp-card"
        role="dialog"
        aria-modal="true"
        aria-label="Rent due"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={r.bankrupt ? 'pp-title danger' : 'pp-title'}>
          🎲 {r.die} · {r.bankrupt ? 'Bankrupt!' : 'Rent due'}
        </h3>

        <p className="pp-line">
          <strong>{names[r.payer]}</strong> landed on{' '}
          <strong>{names[r.owner]}</strong>'s rug ({r.owed}{' '}
          {r.owed === 1 ? 'tile' : 'tiles'}) — pays <strong>{r.paid}</strong> 🪙.
          {r.bankrupt && ` Can't cover ${r.owed} and is out.`}
        </p>

        <div className="pp-ledger">
          <Party colour={r.payer} name={names[r.payer]} delta={-r.paid} dirhams={r.payerDirhams} score={r.payerScore} />
          <Party colour={r.owner} name={names[r.owner]} delta={r.paid} dirhams={r.ownerDirhams} score={r.ownerScore} />
        </div>

        <button type="button" className="pp-continue" onClick={onContinue} autoFocus>
          Continue
        </button>
      </div>
    </div>
  );
}
