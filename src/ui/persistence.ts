// Save / resume support: snapshot the live match to localStorage so a refresh
// or "Resume" picks up exactly where the player left off.
//
// We store the full UI-level snapshot as JSON (config + GameState) rather than
// reusing game/io.ts: that game-string format is the Java assignment's import/
// export and is lossy — it drops turnIndex, phase and custom names, all of which
// a faithful resume needs. GameState is plain JSON-serialisable data.
import type { GameState } from '@marrakech/engine';
import type { GameConfig } from './players';

export type SavedGame = { config: GameConfig; state: GameState };

const KEY = 'marrakech.save.v1';

export function loadSave(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as SavedGame;
    // Cheap shape check — ignore anything that isn't a recognisable snapshot.
    if (!save?.config?.count || !save?.state?.players?.length) return null;
    return save;
  } catch {
    return null;
  }
}

export function writeSave(save: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage full / unavailable (private mode): saving is best-effort.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
