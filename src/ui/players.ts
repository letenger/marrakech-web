import type { Colour } from '@marrakech/engine';

export const PLAYER_HEX: Record<Colour, string> = {
  c: '#1FA8B8',
  y: '#E6B422',
  r: '#C0392B',
  p: '#7D3C98',
};

// Evocative default names that still match each rug's real colour.
export const PLAYER_NAME: Record<Colour, string> = {
  c: 'Peacock',
  y: 'Saffron',
  r: 'Crimson',
  p: 'Amethyst',
};

// Per-game display names: defaults to the colour names, overridden in Setup.
export type PlayerNames = Record<Colour, string>;

export const defaultNames = (): PlayerNames => ({ ...PLAYER_NAME });

// Who controls a seat: the player, one of the local algorithmic agents, or the
// server-hosted LLM opponent (which calls the API).
export type SeatKind = 'human' | 'random' | 'greedy' | 'search' | 'llm';
export type SeatKinds = Record<Colour, SeatKind>;

export const defaultSeats = (): SeatKinds => ({ c: 'human', y: 'human', r: 'human', p: 'human' });

// The choices made on the Setup screen that define a match.
export type GameConfig = { count: number; names: PlayerNames; seats: SeatKinds };
