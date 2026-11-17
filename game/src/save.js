// save: localStorage persistence with a session-only fallback when storage
// is unavailable (private mode, disabled cookies). Autosaves every 15 s.
import { SAVE_KEY } from './config.js';

export function createSaveApi(g) {
  let memoryOnly = false;
  let memorySave = null;
  const api = {
    available() {
      try {
        localStorage.setItem('__solara_probe', '1');
        localStorage.removeItem('__solara_probe');
        return true;
      } catch (e) { return false; }
    },
    save() {
      if (g.screen !== 'playing' && !g.completed) return;
      const data = {
        v: 1, cash: Math.floor(g.cash), missionIndex: g.missionIndex,
        health: g.health, armour: g.armour, ammo: g.ammo,
        x: g.playerPos.x, z: g.playerPos.z,
        coins: g.coins.map((c) => c.taken ? 1 : 0).join(''),
        pickups: g.pickups.map((p) => p.taken ? 1 : 0).join(''),
        clockMinutes: g.clockMinutes, time: Date.now(),
      };
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      } catch (e) {
        memoryOnly = true;
        memorySave = data;
      }
      g.lastSaveAt = g.time;
    },
    load() {
      let raw = null;
      try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
      if (!raw && memorySave) raw = JSON.stringify(memorySave);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    hasSave() { return api.load() !== null; },
    apply(data) {
      g.cash = data.cash ?? 250;
      g.health = data.health ?? 100;
      g.armour = data.armour ?? 0;
      g.ammo = data.ammo ?? 12;
      g.clockMinutes = data.clockMinutes ?? 540;
      g.playerPos.x = data.x ?? 20;
      g.playerPos.z = data.z ?? -128;
      g.playerMesh.position.set(g.playerPos.x, 0, g.playerPos.z);
      if (data.coins) for (let i = 0; i < data.coins.length && i < g.coins.length; i++) {
        if (data.coins[i] === '1') { g.coins[i].taken = true; g.coins[i].mesh.visible = false; }
      }
      if (data.pickups) for (let i = 0; i < data.pickups.length && i < g.pickups.length; i++) {
        if (data.pickups[i] === '1') { g.pickups[i].taken = true; g.pickups[i].mesh.visible = false; g.pickups[i].cap.visible = false; }
      }
      return data.missionIndex ?? 0;
    },
    clear() {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      memorySave = null;
    },
  };
  g.saveApi = api;
  return api;
}
