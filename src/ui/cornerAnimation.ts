import type { Assam } from '@marrakech/engine';

type RouteFrame = { col: number; row: number; rotation: number; offset: number };
const ANGLE = { N: 0, E: 90, S: 180, W: 270 };

// The two 270° printed loops re-enter the SAME corner square. Their long
// rotation cannot be inferred from the final cardinal facing alone.
export function cornerAnimation(from: Assam, to: Assam): RouteFrame[] | null {
  const { col, row } = from.pos;
  if (col !== to.pos.col || row !== to.pos.row) return null;
  let center: { col: number; row: number };
  let startAngle: number;
  let sweep: number;
  if (col === 6 && row === 0 && from.facing === 'E' && to.facing === 'S') {
    center = { col: 6.5, row: -.5 }; startAngle = 90; sweep = -270;
  } else if (col === 6 && row === 0 && from.facing === 'N' && to.facing === 'W') {
    center = { col: 6.5, row: -.5 }; startAngle = 180; sweep = 270;
  } else if (col === 0 && row === 6 && from.facing === 'W' && to.facing === 'N') {
    center = { col: -.5, row: 6.5 }; startAngle = -90; sweep = -270;
  } else if (col === 0 && row === 6 && from.facing === 'S' && to.facing === 'E') {
    center = { col: -.5, row: 6.5 }; startAngle = 0; sweep = 270;
  } else return null;

  const frames: RouteFrame[] = [{ col, row, rotation: ANGLE[from.facing], offset: 0 }];
  for (let step = 0; step <= 18; step++) {
    const progress = step / 18;
    const angle = (startAngle + sweep * progress) * Math.PI / 180;
    frames.push({
      col: center.col + .5 * Math.cos(angle),
      row: center.row + .5 * Math.sin(angle),
      rotation: ANGLE[from.facing] + sweep * progress,
      offset: .12 + .76 * progress,
    });
  }
  frames.push({ col, row, rotation: ANGLE[from.facing] + sweep, offset: 1 });
  return frames;
}
