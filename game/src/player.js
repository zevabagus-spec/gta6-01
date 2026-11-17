// player: Dario Voss on foot — third-person movement, punch and pistol
// combat, entering / exiting cars, taking damage, and respawning.
import * as THREE from '../vendor/three.min.js';
import { SPAWN, clamp, dist2d } from './config.js';
import { resolveCircle } from './city.js';
import { makePersonMesh, knockPed } from './pedestrians.js';

export function createPlayer(g) {
  const mesh = makePersonMesh(0x2f6fb4, 0x2a2a33);
  // Dario: teal jacket, dark jeans, a little taller than a random ped.
  mesh.scale.set(1.05, 1.08, 1.05);
  mesh.position.set(SPAWN.x, 0, SPAWN.z);
  g.scene.add(mesh);
  g.playerMesh = mesh;
  g.playerPos = { x: SPAWN.x, z: SPAWN.z };
  g.playerHeading = Math.PI;
  g.playerSpeed = 0;
  g.health = 100; g.armour = 0; g.ammo = 12; g.weapon = 'fists';
  g.driving = false; g.playerCar = null; g.carSpeed = 0;
}

export function respawnPlayer(g) {
  g.playerPos.x = SPAWN.x; g.playerPos.z = SPAWN.z;
  g.playerHeading = Math.PI;
  g.health = 100;
  if (g.playerCar) { g.playerCar = null; g.driving = false; g.carSpeed = 0; }
  g.playerMesh.visible = true;
  g.playerMesh.position.set(SPAWN.x, 0, SPAWN.z);
}

// Damage goes to armour first, then health. Returns true if wasted.
export function damagePlayer(g, amount) {
  if (g.screen !== 'playing') return false;
  let rest = amount;
  if (g.armour > 0) {
    const absorbed = Math.min(g.armour, rest);
    g.armour -= absorbed; rest -= absorbed;
  }
  g.health -= rest;
  if (g.health <= 0) { g.health = 0; return true; }
  return false;
}

// On-foot movement, relative to the camera yaw. Returns nothing; sets speed.
export function updatePlayerOnFoot(g, dt) {
  const k = g.keys;
  const run = k['shift'] ? 1.7 : 1;
  const speed = 6.5 * run;
  let mx = 0, mz = 0;
  if (k['w']) mz += 1;
  if (k['s']) mz -= 1;
  if (k['a']) mx -= 1;
  if (k['d']) mx += 1;
  const len = Math.hypot(mx, mz);
  g.playerSpeed = len > 0 ? speed : 0;
  if (len > 0) {
    mx /= len; mz /= len;
    const yaw = g.camYaw;
    // Camera-relative: forward is away from the camera.
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const vx = (fx * mz + rx * mx) * speed;
    const vz = (fz * mz + rz * mx) * speed;
    g.playerPos.x += vx * dt;
    g.playerPos.z += vz * dt;
    g.playerHeading = Math.atan2(vx, vz);
    resolveCircle(g, g.playerPos, 0.6);
    g.playerMesh.rotation.y = g.playerHeading;
    // Walk bob.
    g.playerMesh.position.y = Math.abs(Math.sin(g.time * 10)) * 0.06;
  } else {
    g.playerMesh.position.y = 0;
  }
  g.playerMesh.position.x = g.playerPos.x;
  g.playerMesh.position.z = g.playerPos.z;
}

// Punch: short range, wide cone, knocks peds down and hurts rivals/cops.
export function punch(g) {
  if (g.screen !== 'playing' || g.driving || g.punchCooldown > 0) return;
  g.punchCooldown = 0.45;
  g.audio.punch();
  const px = g.playerPos.x, pz = g.playerPos.z;
  const hx = Math.sin(g.playerHeading), hz = Math.cos(g.playerHeading);
  const hitOne = (tx, tz) => {
    const dx = tx - px, dz = tz - pz;
    const d = Math.hypot(dx, dz);
    if (d > 2.4) return false;
    const dot = (dx * hx + dz * hz) / (d || 1);
    return dot > 0.3;
  };
  let crime = false;
  for (const p of g.peds) {
    if (!p.down && hitOne(p.x, p.z)) { if (knockPed(g, p)) crime = true; }
  }
  for (const r of g.rivals) {
    if (r.hp > 0 && hitOne(r.x, r.z)) { hurtEnemy(g, r, 25); }
  }
  for (const c of g.cops) {
    if (c.hp > 0 && hitOne(c.x, c.z)) { hurtEnemy(g, c, 25); }
  }
  if (crime) g.wantedApi.addWanted(1, 'assault');
  g.punchFlash = 0.15;
}

// Pistol: hitscan from the camera centre; nearest valid target in a narrow
// cone takes damage. Returns true if a shot was fired.
export function shoot(g) {
  if (g.screen !== 'playing' || g.driving || g.weapon !== 'pistol') return false;
  if (g.ammo <= 0) { g.audio.dryFire(); g.hudApi.toast('OUT OF AMMO — find a blue pickup'); return false; }
  if (g.shootCooldown > 0) return false;
  g.ammo -= 1;
  g.shootCooldown = 0.28;
  g.audio.shoot();
  g.muzzle = 0.08;
  // Aim from the camera through its centre.
  const origin = g.camera.position.clone();
  const dir = new THREE.Vector3();
  g.camera.getWorldDirection(dir);
  let best = null, bestD = 70;
  const consider = (obj, x, z, y) => {
    const dx = x - origin.x, dy = y - origin.y, dz = z - origin.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > bestD) return;
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
    if (dot < 0.995) return;
    best = obj; bestD = d;
  };
  for (const p of g.peds) if (!p.down) consider({ type: 'ped', ref: p }, p.x, p.z, 1.2);
  for (const r of g.rivals) if (r.hp > 0) consider({ type: 'enemy', ref: r }, r.x, r.z, 1.2);
  for (const c of g.cops) if (c.hp > 0) consider({ type: 'enemy', ref: c }, c.x, c.z, 1.2);
  const end = origin.clone().add(dir.clone().multiplyScalar(best ? bestD : 60));
  g.tracer = { from: origin.clone(), to: end, life: 0.09 };
  if (best) {
    if (best.type === 'ped') {
      if (knockPed(g, best.ref)) g.wantedApi.addWanted(2, 'shooting');
    } else {
      hurtEnemy(g, best.ref, 34);
    }
  } else {
    g.wantedApi.addWanted(1, 'gunfire');
  }
  g.recentViolence = 3;
  return true;
}

export function hurtEnemy(g, e, dmg) {
  e.hp -= dmg;
  if (e.hp <= 0) {
    e.hp = 0;
    e.mesh.rotation.x = -Math.PI / 2;
    e.mesh.position.y = 0.4;
    if (e.kind === 'rival') g.audio.rivalDown();
  }
}

// Nearest stealable car within reach (parked cars, the Sunray, the taxi).
export function nearestCar(g) {
  const px = g.playerPos.x, pz = g.playerPos.z;
  let best = null, bestD = 3.6;
  const consider = (entry, x, z) => {
    if (entry.taken) return;
    const d = dist2d(px, pz, x, z);
    if (d < bestD) { bestD = d; best = entry; }
  };
  for (const c of g.parkedCars) consider(c, c.x, c.z);
  consider(g.sunray, g.sunray.x, g.sunray.z);
  consider(g.taxi, g.taxi.x, g.taxi.z);
  return best;
}

export function enterCar(g, entry) {
  entry.taken = true;
  g.playerCar = entry.mesh;
  g.driving = true;
  g.carSpeed = 0;
  g.carHeading = entry.mesh.rotation.y;
  g.playerMesh.visible = false;
  g.audio.enterCar();
  if (entry !== g.taxi || g.missionIndex !== 2) {
    // Stealing a stranger's car is a crime; mission cars are part of the job.
    if (entry.mesh.userData.kind === 'parked') g.wantedApi.addWanted(1, 'grand theft auto');
  }
  // Remove its static collider while driven (driving.js handles collisions).
  g.colliders = g.colliders.filter((c) => c.car !== entry.mesh);
}

export function exitCar(g) {
  if (!g.playerCar) return;
  const m = g.playerCar;
  g.playerPos.x = m.position.x + Math.sin(m.rotation.y + Math.PI / 2) * 3;
  g.playerPos.z = m.position.z + Math.cos(m.rotation.y + Math.PI / 2) * 3;
  resolveCircle(g, g.playerPos, 0.6);
  g.playerMesh.visible = true;
  g.playerMesh.position.set(g.playerPos.x, 0, g.playerPos.z);
  g.playerCar = null; g.driving = false; g.carSpeed = 0;
  g.audio.exitCar();
}
