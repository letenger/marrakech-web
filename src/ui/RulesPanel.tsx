// The rules of (this implementation of) Marrakech, shown as a dismissable
// overlay. Reused from the Home screen and the in-game menu.
import { useDialog } from './useDialog';

export function RulesPanel({ onClose }: { onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className="rules-card"
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rules-head">
          <h2>How to play</h2>
          <button type="button" className="icon-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="rules-body">
          <p>
            You are a rug merchant in the medina, steering <strong>Assam</strong> around a 7×7
            market and laying down your rugs. Charge rivals rent when they tread on your colour.
          </p>

          <h3>Setup</h3>
          <ul>
            <li>Each player starts with <strong>30 dirhams</strong> and <strong>15 rugs</strong>.</li>
            <li>Assam begins in the centre, facing a random direction.</li>
          </ul>

          <h3>Your turn</h3>
          <ol>
            <li>
              <strong>Rotate Assam</strong> a quarter-turn left, right, or keep him straight
              (he can never spin a full half-turn).
            </li>
            <li>
              <strong>Roll the die</strong> (faces 1, 2, 2, 3, 3, 4) and walk Assam that many
              squares forward. At the board's edge he folds back along the track.
            </li>
            <li>
              <strong>Pay rent.</strong> If he lands on an opponent's rug, you pay them one
              dirham per tile in that connected patch of their colour. Can't pay in full?
              You hand over what you have and drop out.
            </li>
            <li>
              <strong>Lay a rug</strong> covering two squares, at least one next to Assam. It may
              partly overlap others, but can't completely bury a single rug.
            </li>
          </ol>

          <h3>Winning</h3>
          <p>
            The game ends once the players still in it have placed all their rugs. Your score is
            your <strong>dirhams + every visible square of your colour</strong>. Highest score
            wins; ties are broken by dirhams.
          </p>
        </div>

        <button type="button" className="pp-continue" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
