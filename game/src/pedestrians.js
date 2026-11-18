// People on the street: wandering pedestrians, the Rust Vipers
// rivals, and on-foot police officers. Civilians flee gunfire;
// rivals close in and swing; officers chase and, at high wanted
// levels, shoot.

import { PED_COUNT, PED_SHIRTS, PLACES } from './config.js';
import { clampToWorld, resolveCollision } from './city.js';
import { angleLerp, dist2D } from './math3d.js';
import { makeRng, pick, range } from './random.js';
import { damagePlayer } from './player.js';

export function makePerson(kind, x, z, shirt) {
  return {
    kind,
    x, z,
    heading: range(Math.random, 0, 6.28),
    speed: 0,
    shirt,
    pants: [0.25, 0.28, 0.4],
    health: kind === 'rival' ? 2 : kind === 'cop' ? 3 : 1,
    targetX: x,
    targetZ: z,
    retarget: 0,
    fleeing: false,
    aggressive: false,
    flash: 0,
    fallenAt: -1,
    swingCd: 0,
    shootCd: 0,
  };
}

export function createPedestrians(seedText) {
  const rng = makeRng(seedText + '-peds');
  const peds = [];
  for (let i = 0; i < PED_COUNT; i++) {
    const x = range(rng, -170, 170);
    const z = range(rng, -170, 160);
    const ped = makePerson('ped', x, z, pick(rng, PED_SHIRTS));
    ped.heading = range(rng, 0, 6.28);
    ped.targetX = range(rng, -170, 170);
    ped.targetZ = range(rng, -170, 160);
    peds.push(ped);
  }
  return peds;
}

export function spawnRivals(G) {
  const rivals = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const rival = makePerson(
      'rival',
      PLACES.yard.x + Math.sin(angle) * 12,
      PLACES.yard.z + Math.cos(angle) * 12,
      [0.55, 0.15, 0.15],
    );
    rival.aggressive = true;
    rivals.push(rival);
  }
  return rivals;
}

export function spawnCop(G, x, z) {
  const cop = makePerson('cop', x, z, [0.1, 0.2, 0.55]);
  cop.pants = [0.1, 0.12, 0.2];
  cop.aggressive = true;
  return cop;
}

function walkToward(G, person, tx, tz, speed, dt) {
  const d = dist2D(person.x, person.z, tx, tz);
  if (d < 0.6) return true;
  const targetHeading = Math.atan2(tx - person.x, tz - person.z);
  person.heading = angleLerp(person.heading, targetHeading, Math.min(1, dt * 8));
  let nx = person.x + Math.sin(person.heading) * speed * dt;
  let nz = person.z + Math.cos(person.heading) * speed * dt;
  const fixed = resolveCollision(G.city.colliders, nx, nz, 0.7);
  const clamped = clampToWorld(fixed.x, fixed.z);
  person.x = clamped.x;
  person.z = clamped.z;
  person.moving = true;
  return false;
}

export function updatePedestrians(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.health <= 0) continue;
    if (ped.flash > 0) ped.flash -= dt;
    ped.retarget -= dt;
    if (ped.fleeing) {
      const away = Math.atan2(ped.x - p.x, ped.z - p.z);
      walkToward(G, ped, ped.x + Math.sin(away) * 20, ped.z + Math.cos(away) * 20, 7, dt);
      if (dist2D(ped.x, ped.z, p.x, p.z) > 45) ped.fleeing = false;
      continue;
    }
    if (ped.retarget <= 0) {
      ped.targetX = ped.x + (Math.random() - 0.5) * 70;
      ped.targetZ = ped.z + (Math.random() - 0.5) * 70;
      ped.retarget = 4 + Math.random() * 5;
    }
    if (walkToward(G, ped, ped.targetX, ped.targetZ, 2.6, dt)) ped.retarget = 0;
  }
  // Fallen pedestrians get back up after a while, away from the action.
  for (const ped of G.peds) {
    if (ped.health <= 0 && G.time - ped.fallenAt > 25 && dist2D(ped.x, ped.z, p.x, p.z) > 40) {
      ped.health = 1;
      ped.fleeing = false;
      ped.x = p.x + (Math.random() - 0.5) * 120;
      ped.z = p.z + (Math.random() - 0.5) * 120;
      const clamped = clampToWorld(ped.x, ped.z);
      ped.x = clamped.x;
      ped.z = clamped.z;
    }
  }
}

export function updateRivals(G, dt) {
  const p = G.player;
  for (const rival of G.rivals) {
    if (rival.health <= 0) continue;
    if (rival.flash > 0) rival.flash -= dt;
    if (rival.swingCd > 0) rival.swingCd -= dt;
    const d = dist2D(rival.x, rival.z, p.x, p.z);
    if (d > 2.2) {
      walkToward(G, rival, p.x, p.z, 5.2, dt);
    } else if (rival.swingCd <= 0 && !p.car) {
      rival.swingCd = 1.0;
      G.sounds.punch();
      damagePlayer(G, 7, 'rival');
    }
  }
}

export function updateCops(G, dt) {
  const p = G.player;
  for (const cop of G.cops) {
    if (cop.health <= 0) continue;
    if (cop.flash > 0) cop.flash -= dt;
    if (cop.shootCd > 0) cop.shootCd -= dt;
    const d = dist2D(cop.x, cop.z, p.x, p.z);
    // Touching an officer while wanted means getting busted.
    if (d < 1.7 && !p.car && G.wanted >= 1) {
      G.enterBusted();
      return;
    }
    if (d > 1.5) {
      walkToward(G, cop, p.x, p.z, G.wanted >= 3 ? 7.5 : 6, dt);
    }
    // Officers open fire at wanted 3+ from medium range, on a cooldown,
    // but keep closing in — reaching the player means a bust, not a kill.
    if (G.wanted >= 3 && d > 10 && d < 34 && cop.shootCd <= 0 && !p.car) {
      cop.shootCd = 1.6;
      G.sounds.shoot();
      cop.muzzle = 0.1;
      damagePlayer(G, 5, 'gunfire');
    }
    if (cop.muzzle > 0) cop.muzzle -= dt;
  }
}

export function fleePeds(G, x, z, radius) {
  for (const ped of G.peds) {
    if (ped.health > 0 && dist2D(ped.x, ped.z, x, z) < radius) ped.fleeing = true;
  }
}

export function drawPerson(renderer, person, time) {
  if (person.health <= 0) {
    // Fallen: lying flat on the ground.
    renderer.drawBox(person.x, 0.3, person.z, person.heading, 0.85, 0.5, 1.7, person.shirt);
    return;
  }
  const bob = person.moving ? Math.sin(time * 9 + person.x) * 0.06 : 0;
  const shirt = person.flash > 0 ? [1, 1, 1] : person.shirt;
  renderer.drawBox(person.x, 1.05 + bob, person.z, person.heading, 0.85, 1.1, 0.5, shirt);
  renderer.drawBox(person.x, 1.95 + bob, person.z, person.heading, 0.55, 0.55, 0.55, [0.85, 0.62, 0.45]);
  renderer.drawBox(person.x, 0.45 + bob, person.z, person.heading, 0.7, 0.9, 0.45, person.pants);
  if (person.kind === 'cop') {
    renderer.drawBox(person.x, 2.3 + bob, person.z, person.heading, 0.6, 0.2, 0.6, [0.08, 0.12, 0.3]);
    if (person.muzzle > 0) {
      const fx = Math.sin(person.heading);
      const fz = Math.cos(person.heading);
      renderer.drawBox(person.x + fx * 1.4, 1.2, person.z + fz * 1.4, person.heading, 0.45, 0.45, 0.45, [1, 0.9, 0.3]);
    }
  }
  if (person.kind === 'rival') {
    renderer.drawBox(person.x, 2.3 + bob, person.z, person.heading, 0.5, 0.25, 0.5, [0.15, 0.15, 0.15]);
  }
  person.moving = false;
}

export function drawPeople(renderer, G) {
  for (const ped of G.peds) drawPerson(renderer, ped, G.time);
  for (const rival of G.rivals) drawPerson(renderer, rival, G.time);
  for (const cop of G.cops) drawPerson(renderer, cop, G.time);
}
