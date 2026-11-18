// Combat: Mara's punch and pistol. Melee hits the nearest hostile in front
// of her; the pistol fires a tracer at the nearest hostile inside her
// facing cone (or straight ahead), spends ammo, scares walkers and draws
// police attention. Enemies drop ammo when they fall.
import { clampNumber, distance2D } from './rng.js';
import { damagePed } from './pedestrians.js';

export const PISTOL_DAMAGE = 34;
export const PUNCH_DAMAGE = 20;
export const PISTOL_RANGE = 55;
export const PUNCH_RANGE = 2.6;

function facingScore(player, tx, tz) {
  const fx = Math.sin(player.heading);
  const fz = -Math.cos(player.heading);
  const dx = tx - player.x;
  const dz = tz - player.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  return (fx * dx + fz * dz) / len;
}

function nearestHostileInCone(player, peds, range, minFacing) {
  let best = null;
  let bestDist = range;
  for (const ped of peds) {
    if (ped.dead) continue;
    if (ped.kind !== 'thug' && ped.kind !== 'officer') continue;
    const d = distance2D(player.x, player.z, ped.x, ped.z);
    if (d > bestDist) continue;
    if (facingScore(player, ped.x, ped.z) < minFacing) continue;
    best = ped;
    bestDist = d;
  }
  return best;
}

export function tryPunch(player, pedManager, audio, effects, onKill) {
  if (player.inCar) return false;
  if (player.meleeCooldown > 0) return false;
  player.meleeCooldown = 0.45;
  player.punchSwing = 0.22;
  audio.punch();
  pedManager.scareNearby(player.x, player.z, 12);
  const target = nearestHostileInCone(player, pedManager.peds, PUNCH_RANGE, 0.2);
  if (!target) return true;
  const killed = damagePed(target, PUNCH_DAMAGE, effects);
  if (killed) onKill(target);
  return true;
}

export function tryShoot(player, pedManager, audio, effects, onKill, onNoise) {
  if (player.inCar) return false;
  if (player.weapon !== 'pistol') return false;
  if (player.shootCooldown > 0) return false;
  if (player.reloadTimer > 0) return false;
  if (player.ammo <= 0) {
    startReload(player);
    return false;
  }
  player.shootCooldown = 0.28;
  player.ammo -= 1;
  audio.gunshot();
  onNoise();
  const muzzleX = player.x + Math.sin(player.heading) * 0.8;
  const muzzleZ = player.z - Math.cos(player.heading) * 0.8;
  effects.muzzleFlash(muzzleX, 1.35, muzzleZ);
  const target = nearestHostileInCone(player, pedManager.peds, PISTOL_RANGE, 0.55);
  let endX;
  let endZ;
  if (target) {
    endX = target.x;
    endZ = target.z;
    const killed = damagePed(target, PISTOL_DAMAGE, effects);
    if (killed) onKill(target);
  } else {
    endX = player.x + Math.sin(player.heading) * PISTOL_RANGE;
    endZ = player.z - Math.cos(player.heading) * PISTOL_RANGE;
    effects.hitSparks(endX, 0.6, endZ);
  }
  effects.addTracer(muzzleX, 1.35, muzzleZ, endX, 1.3, endZ);
  return true;
}

export function startReload(player) {
  if (player.weapon !== 'pistol') return false;
  if (player.reloadTimer > 0) return false;
  if (player.ammo >= 24 || player.reserveAmmo <= 0) return false;
  player.reloadTimer = 1.1;
  return true;
}

export function switchWeapon(player, weapon) {
  if (weapon !== 'fists' && weapon !== 'pistol') return;
  player.weapon = weapon;
}

export function ammoPickupValue() {
  return 12;
}

export function clampAmmo(player) {
  player.ammo = clampNumber(player.ammo, 0, 999);
  player.reserveAmmo = clampNumber(player.reserveAmmo, 0, 999);
}
