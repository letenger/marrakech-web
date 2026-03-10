// Renders the real photographed board with real rug / Assam pieces laid on top,
// matching the physical game (see assets/example-game-state.png).
// Pieces are positioned in *fractions of the board image*, measured from the
// printed grid, so everything scales responsively with the board.
import type { Colour, Coord, GameState, Rug } from '@marrakech/engine';
import boardImg from '../assets/board.webp';
import assamImg from '../assets/assam.png';
import rugCyan from '../assets/rug_cyan.png';
import rugYellow from '../assets/rug_yellow.png';
import rugRed from '../assets/rug_red.png';
import rugPurple from '../assets/rug_purple.png';

const RUG_IMG: Record<Colour, string> = { c: rugCyan, y: rugYellow, r: rugRed, p: rugPurple };

// Playing-area geometry as fractions of the board image (measured from the grid).
const GEO = { left: 0.1458, top: 0.146, cell: 0.1038 };
const BOARD_ASPECT = 2216 / 2213;
const FACING_ANGLE = { N: 0, E: 90, S: 180, W: 270 } as const;

const pct = (n: number) => `${n * 100}%`;

// A clickable/highlighted cell during the placement phase.
export type Overlay = { coord: Coord; variant: 'anchor' | 'second' | 'selected'; onClick?: () => void };

export function BoardView({ state, overlays = [] }: { state: GameState; overlays?: Overlay[] }) {
  return (
    <div className="board-wrap" style={{ aspectRatio: String(BOARD_ASPECT) }}>
      <img className="board-img" src={boardImg} alt="Marrakech board" draggable={false} />
      {state.rugs.map((rug, i) => (
        <RugPiece key={i} rug={rug} z={i + 1} />
      ))}
      <AssamPiece state={state} />
      {overlays.map((o, i) => (
        <button
          key={i}
          type="button"
          className={`cell-overlay overlay-${o.variant}`}
          disabled={!o.onClick}
          onClick={o.onClick}
          aria-label={`cell ${o.coord.col},${o.coord.row}`}
          style={{
            left: pct(GEO.left + o.coord.col * GEO.cell),
            top: pct(GEO.top + o.coord.row * GEO.cell),
            width: pct(GEO.cell),
            height: pct(GEO.cell),
          }}
        />
      ))}
    </div>
  );
}

function RugPiece({ rug, z }: { rug: Rug; z: number }) {
  const cols = rug.squares.map((s) => s.col);
  const rows = rug.squares.map((s) => s.row);
  const minCol = Math.min(...cols);
  const minRow = Math.min(...rows);
  const vertical = Math.max(...rows) - minRow === 1; // 2 cells tall

  // Centre of the rug's 2-cell footprint, in board fractions.
  const cx = GEO.left + (minCol + (vertical ? 0.5 : 1)) * GEO.cell;
  const cy = GEO.top + (minRow + (vertical ? 1 : 0.5)) * GEO.cell;

  // Pre-rotation the carpet is laid landscape (2 cells long, 1 tall); a vertical
  // rug is the same carpet rotated 90°. A small inset lets the grid breathe.
  const INSET = 0.93;
  const longF = 2 * GEO.cell * INSET;
  const shortF = 1 * GEO.cell * INSET;

  return (
    <img
      className="rug"
      src={RUG_IMG[rug.colour]}
      alt=""
      draggable={false}
      style={{
        left: pct(cx - longF / 2),
        top: pct(cy - shortF / 2),
        width: pct(longF),
        height: pct(shortF),
        transform: `rotate(${vertical ? 90 : 0}deg)`,
        zIndex: z,
      }}
    />
  );
}

function AssamPiece({ state }: { state: GameState }) {
  const { pos, facing } = state.assam;
  const cx = GEO.left + (pos.col + 0.5) * GEO.cell;
  const cy = GEO.top + (pos.row + 0.5) * GEO.cell;
  const sizeF = GEO.cell * 1.0;
  return (
    <img
      className="assam"
      src={assamImg}
      alt="Assam"
      draggable={false}
      style={{
        left: pct(cx - sizeF / 2),
        top: pct(cy - sizeF / 2),
        width: pct(sizeF),
        height: pct(sizeF),
        transform: `rotate(${FACING_ANGLE[facing]}deg)`,
        zIndex: 1000,
      }}
    />
  );
}
