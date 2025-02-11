// Draws the whole board from a GameState: terracotta grid + textured rugs + Assam.
// Pure presentation — it reads state and renders SVG, nothing more.
import type { Colour, GameState } from '../game/types';
import { BOARD_SIZE } from '../game/types';
import rugCyan from '../assets/rug_cyan.png';
import rugYellow from '../assets/rug_yellow.png';
import rugRed from '../assets/rug_red.png';
import rugPurple from '../assets/rug_purple.png';
import assamImg from '../assets/assam.png';

const RUG_IMG: Record<Colour, string> = { c: rugCyan, y: rugYellow, r: rugRed, p: rugPurple };

// Layout (SVG user units). The board scales to its container via the viewBox.
const CELL = 78;
const PAD = 30; // decorative frame thickness
const BOARD_PX = BOARD_SIZE * CELL;
const SIZE = BOARD_PX + PAD * 2;

// Degrees to rotate Assam so he faces the right way (image points "up" = North).
const FACING_ANGLE = { N: 0, E: 90, S: 180, W: 270 } as const;

const tileX = (col: number) => PAD + col * CELL;
const tileY = (row: number) => PAD + row * CELL;

export function BoardView({ state }: { state: GameState }) {
  return (
    <svg className="board" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Marrakech board">
      <defs>
        {/* soft drop shadow that gives the pieces a material lift off the board */}
        <filter id="piece-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#3a210c" floodOpacity="0.35" />
        </filter>
        {/* faint sand grain for the tiles */}
        <filter id="sand">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" />
          <feComponentTransfer><feFuncA type="linear" slope="0.06" /></feComponentTransfer>
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
        <radialGradient id="tile-grad" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#f0b069" />
          <stop offset="100%" stopColor="#e2954b" />
        </radialGradient>
      </defs>

      {/* frame */}
      <rect x="0" y="0" width={SIZE} height={SIZE} rx="18" fill="#b5641f" />
      <rect x={PAD - 8} y={PAD - 8} width={BOARD_PX + 16} height={BOARD_PX + 16} rx="10" fill="#f6e7c8" />

      {/* tiles */}
      <g>
        {Array.from({ length: BOARD_SIZE }, (_, col) =>
          Array.from({ length: BOARD_SIZE }, (_, row) => (
            <rect
              key={`${col}-${row}`}
              x={tileX(col)}
              y={tileY(row)}
              width={CELL}
              height={CELL}
              fill="url(#tile-grad)"
              stroke="#00000018"
              strokeWidth="1"
            />
          )),
        )}
        {/* grain overlay across the whole playfield */}
        <rect x={PAD} y={PAD} width={BOARD_PX} height={BOARD_PX} fill="#7a4a1d" filter="url(#sand)" />
      </g>

      {/* rugs, drawn in placement order so later rugs overlap earlier ones */}
      {state.rugs.map((rug, i) => {
        const cols = rug.squares.map((s) => s.col);
        const rows = rug.squares.map((s) => s.row);
        const inset = 5;
        const x = tileX(Math.min(...cols)) + inset;
        const y = tileY(Math.min(...rows)) + inset;
        const w = (Math.max(...cols) - Math.min(...cols) + 1) * CELL - inset * 2;
        const h = (Math.max(...rows) - Math.min(...rows) + 1) * CELL - inset * 2;
        const clip = `rug-clip-${i}`;
        return (
          <g key={i} filter="url(#piece-shadow)">
            <clipPath id={clip}>
              <rect x={x} y={y} width={w} height={h} rx="6" />
            </clipPath>
            <image
              href={RUG_IMG[rug.colour]}
              x={x}
              y={y}
              width={w}
              height={h}
              preserveAspectRatio="none"
              clipPath={`url(#${clip})`}
            />
            <rect x={x} y={y} width={w} height={h} rx="6" fill="none" stroke="#00000033" strokeWidth="1.5" />
          </g>
        );
      })}

      {/* Assam */}
      <AssamPiece state={state} />
    </svg>
  );
}

function AssamPiece({ state }: { state: GameState }) {
  const { pos, facing } = state.assam;
  const cx = tileX(pos.col) + CELL / 2;
  const cy = tileY(pos.row) + CELL / 2;
  const s = CELL * 0.62;
  const angle = FACING_ANGLE[facing];
  return (
    <g transform={`rotate(${angle} ${cx} ${cy})`} filter="url(#piece-shadow)">
      <image href={assamImg} x={cx - s / 2} y={cy - s / 2} width={s} height={s} />
      {/* facing pointer so the direction is unambiguous regardless of the photo */}
      <polygon
        points={`${cx},${cy - CELL / 2 + 4} ${cx - 7},${cy - CELL / 2 + 16} ${cx + 7},${cy - CELL / 2 + 16}`}
        fill="#2a1605"
        opacity="0.7"
      />
    </g>
  );
}
