import { describe, it, expect } from 'vitest';
import { BOARD_SIZE } from '../src/game/types';

// Smoke test: proves the Vitest + TypeScript toolchain runs.
// Replace with real rule tests as you port Marrakech.java (REWRITE.md §9, step 3).
describe('toolchain', () => {
  it('runs tests and sees the game types', () => {
    expect(BOARD_SIZE).toBe(7);
  });
});
