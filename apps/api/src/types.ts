// Types at the API boundary. GameState comes from the shared engine; the
// persisted config mirrors the web app's GameConfig but is declared here so the
// server never imports from the UI layer.
import type { GameState } from '@marrakech/engine';

export type { GameState };

// Player display names + who controls each seat, as sent by the web client.
// Kept structural (not imported from the UI) to keep the server decoupled.
export type GameConfig = {
  count: number;
  names: Record<string, string>;
  seats: Record<string, string>;
};
