// The wanted system: stars 0-5, police cars and foot officers scaled
// to the level, decay after a quiet spell, and a locked escape mode
// for the Heat Wave mission where decay only happens at the hideout.

import { WANTED_DECAY_SECONDS } from './config.js';
import { makeCar } from './vehicles.js';
import { spawnCop } from './pedestrians.js';
import { dist2D } from './math3d.js';

export function policeCarTarget(wanted) {
  return Math.min(5, Math.max(0, wanted));
}

export function footCopTarget(wanted) {
  if (wanted >= 4) return 3;
  if (wanted >= 2) return 2;
  if (wanted >= 1) return 1;
  return 0;
}

export function addWanted(G, amount, reason) {
  if (G.wantedLocked) return;
  const before = G.wanted;
  G.wanted = Math.min(5, G.wanted + amount);
  G.lastCrimeAt = G.time;
  if (G.wanted > before) {
    G.toast(`Wanted level ${G.wanted} — ${reason}`);
    G.sounds.sirenBlip();
  }
  syncPolice(G);
}

export function setWanted(G, level, locked) {
  G.wanted = Math.max(0, Math.min(5, level));
  G.wantedLocked = !!locked;
  G.lastCrimeAt = G.time;
  syncPolice(G);
}

export function clearWanted(G) {
  G.wanted = 0;
  G.wantedLocked = false;
  syncPolice(G);
  G.sounds.setSiren(false);
}

export function syncPolice(G) {
  const p = G.player;
  // Police cars: spawn ahead of the player on the road grid, despawn extras.
  const cars = G.cars.filter((c) => c.kind === 'police');
  const want = policeCarTarget(G.wanted);
  while (cars.length < want) {
    const angle = Math.random() * Math.PI * 2;
    const car = makeCar('police', p.x + Math.sin(angle) * 55, p.z + Math.cos(angle) * 55, angle, [0.1, 0.15, 0.35]);
    G.cars.push(car);
    cars.push(car);
  }
  while (cars.length > want) {
    const car = cars.pop();
    const idx = G.cars.indexOf(car);
    if (idx >= 0) G.cars.splice(idx, 1);
  }
  // Foot officers spawn near the player, never on top of them.
  const cops = G.cops.filter((c) => c.health > 0);
  const wantCops = footCopTarget(G.wanted);
  while (cops.length < wantCops) {
    const angle = Math.random() * Math.PI * 2;
    const cop = spawnCop(G, p.x + Math.sin(angle) * 26, p.z + Math.cos(angle) * 26);
    G.cops.push(cop);
    cops.push(cop);
  }
  if (G.cops.length > wantCops) {
    G.cops = G.cops.filter((c) => c.health <= 0).concat(G.cops.filter((c) => c.health > 0).slice(0, wantCops));
  }
  G.sounds.setSiren(G.wanted > 0);
}

export function updateWanted(G, dt) {
  if (G.wanted <= 0) return;
  // Locked (mission escape): only the hideout clears the heat.
  if (G.wantedLocked) return;
  const quietFor = G.time - G.lastCrimeAt;
  const nearestCop = Math.min(
    ...G.cops.filter((c) => c.health > 0).map((c) => dist2D(c.x, c.z, G.player.x, G.player.z)),
    ...G.cars.filter((c) => c.kind === 'police').map((c) => dist2D(c.x, c.z, G.player.x, G.player.z)),
    999,
  );
  // Heat fades after a quiet spell out of sight of the patrols.
  if (quietFor > WANTED_DECAY_SECONDS && nearestCop > 30) {
    G.wanted -= 1;
    G.lastCrimeAt = G.time;
    G.toast(G.wanted === 0 ? 'You lost the cops!' : `Heat cooling — wanted level ${G.wanted}`);
    syncPolice(G);
    if (G.wanted === 0) G.sounds.setSiren(false);
  }
}
