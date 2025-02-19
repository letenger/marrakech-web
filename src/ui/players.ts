import type { Colour } from '../game/types';

export const PLAYER_HEX: Record<Colour, string> = {
  c: '#1FA8B8',
  y: '#E6B422',
  r: '#C0392B',
  p: '#7D3C98',
};

export const PLAYER_NAME: Record<Colour, string> = {
  c: 'Cyan',
  y: 'Yellow',
  r: 'Red',
  p: 'Purple',
};

// Per-game display names: defaults to the colour names, overridden in Setup.
export type PlayerNames = Record<Colour, string>;

export const defaultNames = (): PlayerNames => ({ ...PLAYER_NAME });
