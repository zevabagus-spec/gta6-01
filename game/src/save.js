// Solara Bay — saving. Progress (mission, cash, coins, health, armour,
// ammo, clock) goes to localStorage, autosaved every 15 seconds and on
// mission completion. If storage is unavailable or the saved data is corrupt,
// the game falls back to a session-only save and keeps playing.
import { CFG, MISSIONS } from './config.js';

export class SaveGame {
  constructor() {
    this.available = true;
    this.sessionOnly = null;
    try {
      const probe = '__solara_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
    } catch {
      this.available = false;
    }
  }

  save(world) {
    const data = {
      version: 1,
      missionIndex: Math.min(world.missions.index, MISSIONS.length - 1),
      cash: world.cash,
      coins: world.city.coins.filter((c) => c.taken).map((c) => `${c.x},${c.z}`),
      health: world.player.health,
      armour: world.player.armour,
      ammo: world.player.ammo,
      clockMinutes: world.clockMinutes,
      savedAt: Date.now(),
    };
    if (this.available) {
      try { localStorage.setItem(CFG.saveKey, JSON.stringify(data)); return true; }
      catch { this.available = false; }
    }
    this.sessionOnly = data;
    return false;
  }

  load() {
    let raw = null;
    if (this.available) {
      try { raw = localStorage.getItem(CFG.saveKey); } catch { raw = null; }
    } else if (this.sessionOnly) {
      return this.sessionOnly;
    }
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || typeof data.missionIndex !== 'number') return null;
      if (data.missionIndex < 0 || data.missionIndex >= MISSIONS.length) return null;
      return data;
    } catch {
      return null; // corrupt save: start fresh rather than crash
    }
  }

  hasSave() { return this.load() !== null; }

  clear() {
    this.sessionOnly = null;
    if (this.available) { try { localStorage.removeItem(CFG.saveKey); } catch { /* ignore */ } }
  }
}

// Apply a loaded save to a fresh world. Coins taken stay taken; the player
// restarts at the Downtown plaza at the start of the saved mission.
export function applySave(world, data) {
  world.missions.index = data.missionIndex;
  world.missions.step = 0;
  world.cash = data.cash;
  world.player.health = data.health ?? 100;
  world.player.armour = data.armour ?? 0;
  world.player.ammo = data.ammo ?? CFG.pistolAmmo;
  world.clockMinutes = data.clockMinutes ?? 540;
  const taken = new Set(data.coins || []);
  for (const coin of world.city.coins) coin.taken = taken.has(`${coin.x},${coin.z}`);
  world.player.x = -40; world.player.z = 60;
}
