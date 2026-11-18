// Save / load with a session fallback: if localStorage is blocked or
// the stored JSON is corrupt, the game keeps playing with an
// in-memory save instead of crashing or losing the session.

import { SAVE_KEY } from './config.js';

let memorySave = null;
let storageWorks = null;

function storageAvailable() {
  if (storageWorks !== null) return storageWorks;
  try {
    const probe = '__solara_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    storageWorks = true;
  } catch (err) {
    storageWorks = false;
  }
  return storageWorks;
}

export function saveGame(data) {
  const payload = { version: 1, savedAt: Date.now(), ...data };
  memorySave = payload;
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadGame() {
  if (storageAvailable()) {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return memorySave;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return null;
      memorySave = parsed;
      return parsed;
    } catch (err) {
      return memorySave;
    }
  }
  return memorySave;
}

export function hasSave() {
  return loadGame() !== null && loadGame() !== undefined;
}

export function clearSave() {
  memorySave = null;
  if (storageAvailable()) {
    try { window.localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
  }
}

export function describeSave(save) {
  if (!save) return '';
  const mission = Math.min(6, (save.missionIndex || 0) + 1);
  return `Saved game: mission ${mission} of 6, $${save.cash || 0}`;
}
