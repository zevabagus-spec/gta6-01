// Solara Bay — the wanted system. Crimes raise the level from 0 to 5; the
// level decays when the player lies low, but a mission can lock it (escape
// missions). Police cars spawn up to the level's count and on-foot cops join
// at level 3. Spawns happen on streets near the player, never on top of them.
import { CFG } from './config.js';
import { mulberry32, dist2 } from './math3d.js';
import { makeCar } from './vehicles.js';

export function createWanted() {
  return { level: 0, locked: 0, decayTimer: 0, crimeTimer: 0 };
}

export function addWanted(world, amount, reason) {
  const w = world.wanted;
  if (w.locked > 0) return;
  w.level = Math.min(5, w.level + amount);
  w.decayTimer = CFG.wantedDecaySeconds;
  w.crimeTimer = 3;
  if (w.level > 0) world.toast(`Wanted level ${w.level} — ${reason}`, 2.5);
}

// Decay one star at a time while the player commits no crime and no police
// car is close.
export function updateWanted(world, dt, policeCars) {
  const w = world.wanted;
  if (w.locked > 0) { w.level = w.locked; return; }
  w.crimeTimer = Math.max(0, w.crimeTimer - dt);
  if (w.level === 0) return;
  let near = false;
  for (const car of policeCars) {
    if (dist2(car.x, car.z, world.player.x, world.player.z) < 45) { near = true; break; }
  }
  if (w.crimeTimer <= 0 && !near) {
    w.decayTimer -= dt;
    if (w.decayTimer <= 0) {
      w.level -= 1;
      w.decayTimer = CFG.wantedDecaySeconds;
      if (w.level === 0) world.toast('You lost the Bay Patrol.', 2.5);
    }
  } else {
    w.decayTimer = CFG.wantedDecaySeconds;
  }
}

// Keep the right number of police cars and cops alive for the current level.
export function syncPolice(world, rng) {
  const level = world.wanted.level;
  const wantCars = level === 0 ? 0 : Math.min(CFG.maxPoliceCars, level === 5 ? 4 : level + (level >= 4 ? 1 : 0));
  while (world.policeCars.length < wantCars) {
    world.policeCars.push(spawnPoliceCar(world, rng));
  }
  while (world.policeCars.length > wantCars) {
    const car = world.policeCars.pop();
    const i = world.cars.indexOf(car);
    if (i >= 0) world.cars.splice(i, 1);
  }
  const wantCops = level >= 3 ? Math.min(CFG.maxCops, level - 2) : 0;
  while (world.cops.length < wantCops) world.cops.push(spawnCop(world, rng));
  while (world.cops.length > wantCops) world.cops.pop();
}

function streetSpotNear(world, rng, minD, maxD) {
  for (let tries = 0; tries < 12; tries++) {
    const ang = rng() * Math.PI * 2;
    const d = minD + rng() * (maxD - minD);
    const x = world.player.x + Math.cos(ang) * d;
    const z = world.player.z + Math.sin(ang) * d;
    if (Math.abs(x) > CFG.worldHalf - 10 || Math.abs(z) > CFG.worldHalf - 10) continue;
    // Snap onto the nearest street so police appear on roads, not in blocks.
    const sx = Math.round(x / 40) * 40;
    const sz = Math.round(z / 40) * 40;
    const useX = Math.abs(x - sx) < Math.abs(z - sz);
    return useX ? [sx, z] : [x, sz];
  }
  return [world.player.x + 60, world.player.z];
}

function spawnPoliceCar(world, rng) {
  const [x, z] = streetSpotNear(world, rng, 55, 85);
  const car = makeCar('police' + world.policeCars.length + Date.now() % 1000, 'police', x, z, 0);
  car.speed = 12;
  world.cars.push(car);
  return car;
}

function spawnCop(world, rng) {
  const [x, z] = streetSpotNear(world, rng, 25, 45);
  return {
    id: 'cop' + world.cops.length + Date.now() % 1000, x, z,
    yaw: 0, health: 100, meshKey: 'cop', kind: 'cop',
    shootTimer: 1, bustTimer: 0, speed: 0,
  };
}
export { mulberry32 };
