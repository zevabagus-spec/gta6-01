// Solara Bay — the player on foot: third-person movement relative to the
// camera, punch and pistol combat, entering and leaving cars, and collecting
// Sun Coins and pickups. Damage and bust/wasted handling live in main.js;
// this file owns movement, combat targeting and interaction.
import { CFG } from './config.js';
import { clamp, dist2, angleLerp } from './math3d.js';
import { collideCircleBox } from './city.js';

export function createPlayer() {
  return {
    x: -40, z: 60, yaw: Math.PI, speed: 0,
    health: CFG.maxHealth, armour: CFG.maxArmour, ammo: CFG.pistolAmmo,
    inCar: false, car: null, carSpeed: 0,
    punchTimer: 0, shotTimer: 0, moving: false,
  };
}

// WASD moves relative to the camera yaw; Shift runs. The player model turns
// to face the direction of travel.
export function updateOnFoot(player, input, camYaw, dt, city) {
  player.punchTimer = Math.max(0, player.punchTimer - dt);
  player.shotTimer = Math.max(0, player.shotTimer - dt);
  let mx = 0, mz = 0;
  // Camera forward is (sin camYaw, cos camYaw); right is (-cos, sin).
  if (input.forward) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
  if (input.back) { mx += -Math.sin(camYaw); mz += -Math.cos(camYaw); }
  if (input.left) { mx += Math.cos(camYaw); mz += -Math.sin(camYaw); }
  if (input.right) { mx += -Math.cos(camYaw); mz += Math.sin(camYaw); }
  const len = Math.hypot(mx, mz);
  player.moving = len > 0;
  if (len > 0) {
    mx /= len; mz /= len;
    const speed = input.run ? CFG.runSpeed : CFG.walkSpeed;
    player.speed = speed;
    const nx = player.x + mx * speed * dt;
    const nz = player.z + mz * speed * dt;
    const [cx, cz] = collideCircleBox(nx, nz, CFG.playerRadius, city.colliders);
    player.x = clamp(cx, -CFG.worldHalf, CFG.worldHalf);
    player.z = clamp(cz, -CFG.worldHalf, CFG.worldHalf);
    const wantYaw = Math.atan2(mx, mz);
    player.yaw = angleLerp(player.yaw, wantYaw, Math.min(1, dt * 10));
  } else {
    player.speed = 0;
  }
}

// Punch: hits the nearest living person within range in front of the player.
export function tryPunch(player, targets) {
  if (player.punchTimer > 0 || player.inCar) return null;
  player.punchTimer = CFG.punchCooldown;
  let best = null, bestD = CFG.punchRange;
  for (const t of targets) {
    if (t.health <= 0) continue;
    const d = dist2(player.x, player.z, t.x, t.z);
    if (d < bestD) { best = t; bestD = d; }
  }
  if (best) best.health -= CFG.punchDamage;
  return best;
}

// Pistol: hits the nearest living target within range and inside a cone
// around the camera's forward direction. Returns the target hit, or null.
export function tryShoot(player, camYaw, targets) {
  if (player.shotTimer > 0 || player.inCar || player.ammo <= 0) return null;
  player.shotTimer = CFG.shotCooldown;
  player.ammo -= 1;
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  let best = null, bestD = CFG.pistolRange;
  for (const t of targets) {
    if (t.health <= 0) continue;
    const dx = t.x - player.x, dz = t.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > CFG.pistolRange) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.82) continue; // outside the firing cone
    if (d < bestD) { best = t; bestD = d; }
  }
  if (best) best.health -= CFG.pistolDamage;
  return best;
}

// Nearest drivable car within reach of the player (parked or traffic).
export function nearestCar(player, cars, maxDist) {
  let best = null, bestD = maxDist;
  for (const car of cars) {
    if (car.police) continue;
    const d = dist2(player.x, player.z, car.x, car.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

// Walk over a Sun Coin to collect it; walk over a pickup to use it.
export function collectAt(player, city, world) {
  let got = null;
  for (const coin of city.coins) {
    if (!coin.taken && dist2(player.x, player.z, coin.x, coin.z) < 2) {
      coin.taken = true;
      world.cash += CFG.coinValue;
      got = { kind: 'coin', value: CFG.coinValue };
    }
  }
  for (const p of city.pickups) {
    if (!p.active) continue;
    if (dist2(player.x, player.z, p.x, p.z) < 2.2) {
      p.active = false; p.timer = 60;
      if (p.kind === 'health') player.health = CFG.maxHealth;
      if (p.kind === 'armour') player.armour = CFG.maxArmour;
      if (p.kind === 'ammo') player.ammo = CFG.pistolAmmo;
      got = { kind: p.kind };
    }
  }
  return got;
}
