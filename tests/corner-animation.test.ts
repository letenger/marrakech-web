import { describe, expect, it } from 'vitest';
import { assamAfterMove, assamPath, type Facing } from '@marrakech/engine';
import { cornerAnimation } from '../src/ui/cornerAnimation';

describe('printed corner loop animation', () => {
  it.each([
    { col: 6, row: 0, from: 'E', to: 'S', start: 90, end: -180 },
    { col: 6, row: 0, from: 'N', to: 'W', start: 0, end: 270 },
    { col: 0, row: 6, from: 'W', to: 'N', start: 270, end: 0 },
    { col: 0, row: 6, from: 'S', to: 'E', start: 180, end: 450 },
  ])('follows the long printed arc at ($col,$row) from $from to $to', ({ col, row, from, to, start, end }) => {
    const assam = { pos: { col, row }, facing: from as Facing };
    const next = assamAfterMove(assam, 1);
    expect(next).toEqual({ pos: { col, row }, facing: to });
    const frames = cornerAnimation(assam, next)!;
    expect(frames[0]).toEqual({ col, row, rotation: start, offset: 0 });
    expect(frames.at(-1)).toEqual({ col, row, rotation: end, offset: 1 });
    expect(Math.abs(end - start)).toBe(270);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].offset).toBeGreaterThan(frames[i - 1].offset);
      expect((frames[i].rotation - frames[i - 1].rotation) * Math.sign(end - start)).toBeGreaterThanOrEqual(0);
    }
    if (col === 6) {
      expect(Math.max(...frames.map(frame => frame.col))).toBeCloseTo(7);
      expect(Math.min(...frames.map(frame => frame.row))).toBeCloseTo(-1);
    } else {
      expect(Math.min(...frames.map(frame => frame.col))).toBeCloseTo(-1);
      expect(Math.max(...frames.map(frame => frame.row))).toBeCloseTo(7);
    }
    // Visual routing never changes the game rules or consumes extra die steps.
    for (const die of [1, 2, 3, 4]) {
      const path = assamPath(assam, die);
      expect(path.at(-1)).toEqual(assamAfterMove(assam, die));
      expect(path).toHaveLength(die);
    }
  });

  it('does not replace normal edge U-turns with corner loops', () => {
    const from = { pos: { col: 6, row: 1 }, facing: 'E' as const };
    expect(cornerAnimation(from, assamAfterMove(from, 1))).toBeNull();
  });
});
