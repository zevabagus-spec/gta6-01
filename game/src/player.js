// The player on foot: movement, sprint, punching, pistol fire, weapon
// switching, reloading, and stepping into and out of cars.

import { clampToWorld, resolveCollision } from './city.js';
import { MAX_AMMO, START_AMMO, START_HEALTH } from './config.js';
import { angleLerp, clamp, dist2D } from './math3d.js';

export function createPlayer(spawn) {
  return {
    x: spawn.x,
    z: spawn.z,
    heading: Math.PI,
    health: START_HEALTH,
    ammo: START_AMMO,
    weapon: 'fists',
    attackCd: 0,
    reloadUntil: 0,
    reloading: false,
    car: null,
    punchFlash: 0,
    muzzleFlash: 0,
  };
}

export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  if (p.attackCd > 0) p.attackCd -= dt;
  if (p.punchFlash > 0) p.punchFlash -= dt;
  if (p.muzzleFlash > 0) p.muzzleFlash -= dt;
  if (p.reloading && G.time >= p.reloadUntil) {
    p.ammo = MAX_AMMO;
    p.reloading = false;
    G.toast('Pistol reloaded');
  }

  // Camera-relative movement: forward is where the camera looks.
  const yaw = G.cameraYaw;
  let mx = 0;
  let mz = 0;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) { mx += Math.sin(yaw); mz += Math.cos(yaw); }
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) { mx -= Math.sin(yaw); mz -= Math.cos(yaw); }
  if (input.keys.has('KeyA')) { mx += Math.cos(yaw); mz -= Math.sin(yaw); }
  if (input.keys.has('KeyD')) { mx -= Math.cos(yaw); mz += Math.sin(yaw); }
  const len = Math.hypot(mx, mz);
  const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const speed = sprint ? 12 : 7.5;
  if (len > 0) {
    mx /= len;
    mz /= len;
    const targetHeading = Math.atan2(mx, mz);
    p.heading = angleLerp(p.heading, targetHeading, Math.min(1, dt * 12));
    let nx = p.x + mx * speed * dt;
    let nz = p.z + mz * speed * dt;
    const fixed = resolveCollision(G.city.colliders, nx, nz, 0.9);
    const clamped = clampToWorld(fixed.x, fixed.z);
    p.x = clamped.x;
    p.z = clamped.z;
    p.moving = true;
  } else {
    p.moving = false;
  }

  // Arrow keys turn the camera when not walking forward/back.
  if (input.keys.has('ArrowLeft')) G.cameraYaw += dt * 2.2;
  if (input.keys.has('ArrowRight')) G.cameraYaw -= dt * 2.2;

  if (input.consumePress('Digit1')) { p.weapon = 'fists'; G.toast('Fists ready'); }
  if (input.consumePress('Digit2')) { p.weapon = 'pistol'; G.toast('Pistol ready'); }
  if (input.consumePress('KeyR') && p.weapon === 'pistol' && !p.reloading && p.ammo < MAX_AMMO) {
    p.reloading = true;
    p.reloadUntil = G.time + 1.0;
    G.toast('Reloading…');
  }
}

function coneHit(G, range, halfAngle) {
  const p = G.player;
  const targets = [...G.rivals, ...G.cops, ...G.peds];
  let best = null;
  let bestD = Infinity;
  for (const t of targets) {
    if (t.health <= 0) continue;
    const d = dist2D(p.x, p.z, t.x, t.z);
    if (d > range) continue;
    const ang = Math.atan2(t.x - p.x, t.z - p.z);
    let diff = ang - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > halfAngle) continue;
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

export function playerAttack(G) {
  const p = G.player;
  if (p.car || p.attackCd > 0 || p.reloading) return;
  if (p.weapon === 'fists') {
    p.attackCd = 0.45;
    p.punchFlash = 0.18;
    G.sounds.punch();
    const target = coneHit(G, 3.2, 1.1);
    if (target) {
      target.health -= 1;
      target.flash = 0.2;
      target.aggressive = true;
      if (target.kind === 'rival') {
        G.toast('Rival down! ' + G.rivals.filter((r) => r.health > 0).length + ' left');
      } else if (target.kind === 'cop') {
        G.addWanted(1, 'assaulted an officer');
      } else if (target.health <= 0) {
        G.addWanted(2, 'pedestrian down');
        G.toast('The cops saw that!');
      }
      if (target.health <= 0) target.fallenAt = G.time;
    }
  } else {
    if (p.ammo <= 0) {
      G.toast('Out of ammo — press R to reload');
      G.sounds.door();
      p.attackCd = 0.3;
      return;
    }
    p.ammo -= 1;
    p.attackCd = 0.32;
    p.muzzleFlash = 0.09;
    G.sounds.shoot();
    G.fleePeds(p.x, p.z, 30);
    const target = coneHit(G, 46, 0.32);
    if (target) {
      target.health -= 2;
      target.flash = 0.2;
      target.aggressive = true;
      if (target.kind === 'cop') G.addWanted(1, 'shot at police');
      else if (target.kind === 'ped' && target.health <= 0) G.addWanted(2, 'pedestrian down');
      if (target.health <= 0) target.fallenAt = G.time;
    }
    if (G.wanted === 0 && !target) G.addWanted(1, 'shots fired');
    else if (G.wanted > 0) G.lastCrimeAt = G.time;
  }
}

export function damagePlayer(G, amount, cause) {
  const p = G.player;
  if (G.mode !== 'playing' || G.godUntil > G.time) return;
  p.health = Math.max(0, p.health - amount);
  G.shake = Math.min(1, G.shake + 0.4);
  if (p.health <= 0) {
    if (cause === 'busted') G.enterBusted();
    else G.enterWasted();
  }
}

export function healPlayer(G, amount) {
  G.player.health = clamp(G.player.health + amount, 0, START_HEALTH);
}

export function drawPlayer(renderer, G) {
  const p = G.player;
  if (p.car) return;
  const bob = p.moving ? Math.sin(G.time * 10) * 0.08 : 0;
  const shirt = [0.95, 0.55, 0.15];
  const skin = [0.85, 0.62, 0.45];
  renderer.drawBox(p.x, 1.05 + bob, p.z, p.heading, 0.85, 1.1, 0.5, shirt);
  renderer.drawBox(p.x, 1.95 + bob, p.z, p.heading, 0.55, 0.55, 0.55, skin);
  renderer.drawBox(p.x, 0.45 + bob, p.z, p.heading, 0.7, 0.9, 0.45, [0.2, 0.25, 0.55]);
  // Arms swing forward on a punch; pistol arm extends when firing.
  const reach = p.punchFlash > 0 ? 0.9 : p.weapon === 'pistol' ? 0.7 : 0.45;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  renderer.drawBox(p.x + fx * reach, 1.2 + bob, p.z + fz * reach, p.heading, 0.28, 0.28, 0.7, skin);
  if (p.weapon === 'pistol') {
    renderer.drawBox(p.x + fx * (reach + 0.35), 1.2 + bob, p.z + fz * (reach + 0.35), p.heading, 0.14, 0.14, 0.5, [0.12, 0.12, 0.14]);
  }
  if (p.muzzleFlash > 0) {
    renderer.drawBox(p.x + fx * 1.6, 1.2, p.z + fz * 1.6, p.heading, 0.5, 0.5, 0.5, [1.0, 0.9, 0.3]);
  }
}
