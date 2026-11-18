// Solara Bay — pedestrians, rivals and on-foot police. Pedestrians wander
// the sidewalks and flee from gunfire or a speeding car; Harbor rivals (mission
// 4) hunt the player and shoot; on-foot cops (wanted 3+) chase the player,
// shoot at range, and bust them on touch.
import { CFG } from './config.js';
import { mulberry32, clamp, angleLerp, dist2 } from './math3d.js';
import { newTriList, pushBox } from './engine.js';
import { collideCircleBox } from './city.js';

const SKINS = [
  [0.85, 0.6, 0.45], [0.6, 0.45, 0.35], [0.9, 0.75, 0.6], [0.5, 0.35, 0.28],
];
const SHIRTS = [
  [0.85, 0.3, 0.3], [0.3, 0.5, 0.85], [0.3, 0.7, 0.4], [0.9, 0.7, 0.25],
  [0.7, 0.4, 0.8], [0.85, 0.85, 0.85], [0.2, 0.2, 0.25],
];

// A person is three boxes: legs, torso, head. One mesh per shirt colour.
export function buildPersonMeshes(renderer) {
  const meshes = {};
  for (let i = 0; i < SHIRTS.length; i++) {
    const list = newTriList();
    const shirt = SHIRTS[i];
    pushBox(list, 0, 0.45, 0, 0.5, 0.9, 0.3, [0.25, 0.25, 0.3]); // legs
    pushBox(list, 0, 1.15, 0, 0.6, 0.7, 0.35, shirt, shirt); // torso
    pushBox(list, 0, 1.75, 0, 0.42, 0.42, 0.42, SKINS[i % SKINS.length]); // head
    meshes['person' + i] = renderer.makeMesh(list);
  }
  // Rivals wear red jackets; cops wear navy with a cap.
  const rival = newTriList();
  pushBox(rival, 0, 0.45, 0, 0.5, 0.9, 0.3, [0.15, 0.15, 0.18]);
  pushBox(rival, 0, 1.15, 0, 0.65, 0.7, 0.38, [0.75, 0.12, 0.12], [0.85, 0.2, 0.2]);
  pushBox(rival, 0, 1.75, 0, 0.42, 0.42, 0.42, [0.85, 0.6, 0.45]);
  meshes.rival = renderer.makeMesh(rival);
  const cop = newTriList();
  pushBox(cop, 0, 0.45, 0, 0.5, 0.9, 0.3, [0.1, 0.12, 0.2]);
  pushBox(cop, 0, 1.15, 0, 0.65, 0.7, 0.38, [0.12, 0.16, 0.35], [0.2, 0.25, 0.5]);
  pushBox(cop, 0, 1.75, 0, 0.42, 0.42, 0.42, [0.9, 0.75, 0.6]);
  pushBox(cop, 0, 2.0, 0, 0.46, 0.12, 0.46, [0.08, 0.1, 0.18]);
  meshes.cop = renderer.makeMesh(cop);
  return meshes;
}

export function makePed(id, x, z, meshKey) {
  return {
    id, x, z, yaw: Math.random() * Math.PI * 2, speed: 0, meshKey,
    tx: x, tz: z, wait: 0, health: 100, flee: 0, kind: 'ped',
  };
}

export function spawnPeds(rng) {
  const peds = [];
  for (let i = 0; i < CFG.pedCount; i++) {
    const x = -180 + rng() * 360, z = -180 + rng() * 360;
    const ped = makePed('ped' + i, x, z, 'person' + (i % SHIRTS.length));
    ped.tx = x + (rng() - 0.5) * 40; ped.tz = z + (rng() - 0.5) * 40;
    peds.push(ped);
  }
  return peds;
}

function pickTarget(ped, rng) {
  ped.tx = clamp(ped.x + (rng() - 0.5) * 60, -195, 195);
  ped.tz = clamp(ped.z + (rng() - 0.5) * 60, -195, 195);
  ped.wait = 0;
}

// Pedestrians stroll between random points; a gunshot or a near-miss car
// sends them running away from the scare.
export function updatePeds(peds, dt, city, player, scare) {
  const rng = mulberry32(1234 + Math.floor(performance.now() / 1000) % 997);
  for (const ped of peds) {
    if (ped.health <= 0) continue;
    const dPlayer = dist2(ped.x, ped.z, player.x, player.z);
    if (scare && dist2(ped.x, ped.z, scare.x, scare.z) < 30) ped.flee = 2.5;
    if (player.inCar && dPlayer < 6 && Math.abs(player.carSpeed || 0) > 8) ped.flee = 2;
    let speed = 1.6;
    if (ped.flee > 0) {
      ped.flee -= dt; speed = 4.2;
      const away = Math.atan2(ped.x - player.x, ped.z - player.z);
      ped.tx = ped.x + Math.sin(away) * 20; ped.tz = ped.z + Math.cos(away) * 20;
    }
    const d = dist2(ped.x, ped.z, ped.tx, ped.tz);
    if (d < 2) {
      if (ped.wait <= 0) ped.wait = 0.5 + rng() * 2;
      ped.wait -= dt;
      if (ped.wait <= 0) pickTarget(ped, rng);
      ped.speed = 0;
      continue;
    }
    const wantYaw = Math.atan2(ped.tx - ped.x, ped.tz - ped.z);
    ped.yaw = angleLerp(ped.yaw, wantYaw, Math.min(1, dt * 5));
    ped.speed = speed;
    ped.x += Math.sin(ped.yaw) * speed * dt;
    ped.z += Math.cos(ped.yaw) * speed * dt;
    [ped.x, ped.z] = collideCircleBox(ped.x, ped.z, 0.5, city.colliders);
    ped.x = clamp(ped.x, -198, 198); ped.z = clamp(ped.z, -198, 198);
  }
}

// Rivals: spawned for mission 4, they advance on the player and shoot.
// Returns the number of rivals still alive.
export function updateRivals(rivals, dt, player, city, onShoot) {
  let alive = 0;
  for (const r of rivals) {
    if (r.health <= 0) continue;
    alive++;
    const d = dist2(r.x, r.z, player.x, player.z);
    r.shootTimer = (r.shootTimer || 0) - dt;
    if (d > 10) {
      const wantYaw = Math.atan2(player.x - r.x, player.z - r.z);
      r.yaw = angleLerp(r.yaw, wantYaw, Math.min(1, dt * 4));
      r.x += Math.sin(r.yaw) * 3.4 * dt;
      r.z += Math.cos(r.yaw) * 3.4 * dt;
      [r.x, r.z] = collideCircleBox(r.x, r.z, 0.5, city.colliders);
    } else if (r.shootTimer <= 0) {
      r.shootTimer = 1.1 + Math.random() * 0.7;
      onShoot(r, d);
    }
  }
  return alive;
}

// On-foot cops chase the player on foot, shoot inside 26 units, and bust on
// touch after standing close for a second.
export function updateCops(cops, dt, player, city, onShoot, onBust) {
  for (const cop of cops) {
    const d = dist2(cop.x, cop.z, player.x, player.z);
    const wantYaw = Math.atan2(player.x - cop.x, player.z - cop.z);
    cop.yaw = angleLerp(cop.yaw, wantYaw, Math.min(1, dt * 5));
    cop.shootTimer = (cop.shootTimer || 0) - dt;
    if (player.inCar) {
      // Cops cannot catch a car: hold position and radio it in.
      cop.speed = 0;
      continue;
    }
    if (d > 1.6) {
      const speed = 5.2;
      cop.x += Math.sin(cop.yaw) * speed * dt;
      cop.z += Math.cos(cop.yaw) * speed * dt;
      [cop.x, cop.z] = collideCircleBox(cop.x, cop.z, 0.5, city.colliders);
      cop.bustTimer = 0;
    } else {
      cop.bustTimer = (cop.bustTimer || 0) + dt;
      if (cop.bustTimer >= CFG.copBustSeconds) onBust(cop);
    }
    if (d < 26 && d > 2 && cop.shootTimer <= 0) {
      cop.shootTimer = 1.4 + Math.random() * 0.8;
      onShoot(cop, d);
    }
  }
}
export { mulberry32 };
