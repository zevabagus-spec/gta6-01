// Pedestrians: sidewalk walkers who flee gunfire, mission thugs who fight,
// on-foot police officers who chase and bust, and story contacts who wait
// at markers. People are animated box figures with swinging legs.
import { clampNumber, distance2D, pickFrom, randomRange, turnToward } from './rng.js';
import { WORLD_HALF, resolveCircleCollision } from './city.js';

const SHIRTS = [
  [0.85, 0.30, 0.25], [0.25, 0.50, 0.85], [0.90, 0.70, 0.20], [0.35, 0.70, 0.40],
  [0.75, 0.45, 0.70], [0.90, 0.90, 0.88], [0.30, 0.75, 0.70], [0.95, 0.55, 0.25],
];
const PANTS = [[0.20, 0.25, 0.40], [0.35, 0.30, 0.25], [0.15, 0.15, 0.18], [0.45, 0.45, 0.50]];
const SKINS = [[0.95, 0.78, 0.62], [0.75, 0.55, 0.40], [0.55, 0.38, 0.26], [0.88, 0.68, 0.52]];

let nextPedId = 1;

export function makePed(kind, x, z, rand, name) {
  return {
    id: nextPedId++,
    kind,
    name: name || '',
    x, z,
    heading: rand() * Math.PI * 2,
    speed: 0,
    walkPhase: rand() * 6.28,
    shirt: kind === 'officer' ? [0.15, 0.25, 0.55] : pickFrom(rand, SHIRTS),
    pants: kind === 'officer' ? [0.12, 0.14, 0.20] : pickFrom(rand, PANTS),
    skin: pickFrom(rand, SKINS),
    health: kind === 'thug' ? 60 : 100,
    maxHealth: kind === 'thug' ? 60 : 100,
    targetX: x,
    targetZ: z,
    state: 'walk',
    fleeTimer: 0,
    attackCooldown: 0,
    bustTimer: 0,
    dead: false,
    scared: false,
  };
}

export function createPedestrianManager(rand, city, audio, effects) {
  const peds = [];
  const colliders = city.colliders;

  function randomSidewalkSpot() {
    const bx = pickFrom(rand, [-180, -120, -60, 0, 60, 120, 180]);
    const bz = pickFrom(rand, [-180, -120, -60, 0, 60, 120, 180]);
    return { x: bx + randomRange(rand, -20, 20), z: bz + randomRange(rand, -20, 20) };
  }

  function spawnWalker() {
    const spot = randomSidewalkSpot();
    const ped = makePed('walker', spot.x, spot.z, rand);
    const dest = randomSidewalkSpot();
    ped.targetX = dest.x;
    ped.targetZ = dest.z;
    peds.push(ped);
    return ped;
  }

  function spawnThug(x, z, name) {
    const ped = makePed('thug', x, z, rand, name);
    ped.shirt = [0.25, 0.22, 0.28];
    ped.state = 'guard';
    peds.push(ped);
    return ped;
  }

  function spawnOfficer(x, z) {
    const ped = makePed('officer', x, z, rand, 'Officer');
    ped.state = 'chase';
    peds.push(ped);
    return ped;
  }

  function spawnContact(x, z, name) {
    const ped = makePed('contact', x, z, rand, name);
    ped.shirt = [0.95, 0.85, 0.30];
    ped.state = 'wait';
    peds.push(ped);
    return ped;
  }

  function movePed(ped, dt, speed) {
    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z - Math.cos(ped.heading) * speed * dt;
    const [rx, rz] = resolveCircleCollision(nx, nz, 0.8, colliders);
    ped.x = rx;
    ped.z = rz;
    ped.speed = speed;
    ped.walkPhase += speed * dt * 1.6;
  }

  function updateWalker(ped, dt, player) {
    if (ped.scared) {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.x - player.x, -(ped.z - player.z));
      ped.heading = turnToward(ped.heading, away, 5 * dt);
      movePed(ped, dt, 6.5);
      if (ped.fleeTimer <= 0) ped.scared = false;
      return;
    }
    const dist = distance2D(ped.x, ped.z, ped.targetX, ped.targetZ);
    if (dist < 3) {
      const dest = randomSidewalkSpot();
      ped.targetX = dest.x;
      ped.targetZ = dest.z;
      return;
    }
    const desired = Math.atan2(ped.targetX - ped.x, -(ped.targetZ - ped.z));
    ped.heading = turnToward(ped.heading, desired, 3 * dt);
    movePed(ped, dt, 2.2);
  }

  function updateThug(ped, dt, player, onPlayerHit) {
    ped.attackCooldown = Math.max(0, ped.attackCooldown - dt);
    const dist = distance2D(ped.x, ped.z, player.x, player.z);
    if (ped.state === 'guard' && dist < 26) ped.state = 'chase';
    if (ped.state !== 'chase') {
      ped.speed = 0;
      return;
    }
    const desired = Math.atan2(player.x - ped.x, -(player.z - ped.z));
    ped.heading = turnToward(ped.heading, desired, 4 * dt);
    if (dist > 1.6) {
      movePed(ped, dt, 4.6);
    } else if (ped.attackCooldown <= 0) {
      ped.attackCooldown = 1.0;
      onPlayerHit(8, ped);
    }
  }

  function updateOfficer(ped, dt, player) {
    const dist = distance2D(ped.x, ped.z, player.x, player.z);
    const desired = Math.atan2(player.x - ped.x, -(player.z - ped.z));
    ped.heading = turnToward(ped.heading, desired, 4.5 * dt);
    if (dist > 1.8) {
      movePed(ped, dt, 5.4);
      ped.bustTimer = 0;
    } else {
      ped.speed = 0;
      ped.bustTimer += dt;
    }
  }

  function drawPed(drawList, ped, timeSeconds) {
    void timeSeconds;
    const swing = Math.sin(ped.walkPhase) * clampNumber(ped.speed / 5, 0, 1) * 0.5;
    const cosH = Math.cos(ped.heading);
    const sinH = Math.sin(ped.heading);
    const local = (lx, lz) => [ped.x + lx * cosH + lz * sinH, ped.z - lx * sinH + lz * cosH];
    drawList.groundQuads.push({ x: ped.x, z: ped.z, sx: 1.4, sz: 1.4, color: [0.10, 0.10, 0.12], glow: 0, y: 0.05 });
    if (ped.dead) {
      drawList.boxes.push({ x: ped.x, y: 0.3, z: ped.z, sx: 1.7, sy: 0.6, sz: 0.7, ry: ped.heading, color: ped.shirt, glow: 0 });
      return;
    }
    const [legLX, legLZ] = local(-0.22, swing * 0.5);
    const [legRX, legRZ] = local(0.22, -swing * 0.5);
    drawList.boxes.push({ x: legLX, y: 0.45, z: legLZ, sx: 0.3, sy: 0.9, sz: 0.3, ry: ped.heading, color: ped.pants, glow: 0 });
    drawList.boxes.push({ x: legRX, y: 0.45, z: legRZ, sx: 0.3, sy: 0.9, sz: 0.3, ry: ped.heading, color: ped.pants, glow: 0 });
    drawList.boxes.push({ x: ped.x, y: 1.25, z: ped.z, sx: 0.75, sy: 0.75, sz: 0.45, ry: ped.heading, color: ped.shirt, glow: 0 });
    const [armLX, armLZ] = local(-0.5, -swing * 0.4);
    const [armRX, armRZ] = local(0.5, swing * 0.4);
    drawList.boxes.push({ x: armLX, y: 1.25, z: armLZ, sx: 0.22, sy: 0.7, sz: 0.22, ry: ped.heading, color: ped.shirt, glow: 0 });
    drawList.boxes.push({ x: armRX, y: 1.25, z: armRZ, sx: 0.22, sy: 0.7, sz: 0.22, ry: ped.heading, color: ped.shirt, glow: 0 });
    drawList.boxes.push({ x: ped.x, y: 1.95, z: ped.z, sx: 0.5, sy: 0.5, sz: 0.5, ry: ped.heading, color: ped.skin, glow: 0 });
    if (ped.kind === 'officer') {
      drawList.boxes.push({ x: ped.x, y: 2.28, z: ped.z, sx: 0.56, sy: 0.18, sz: 0.56, ry: ped.heading, color: [0.10, 0.14, 0.28], glow: 0 });
    }
    if (ped.kind === 'thug' && ped.health < ped.maxHealth) {
      drawList.groundQuads.push({ x: ped.x, z: ped.z, sx: 1.6, sz: 0.3, color: [0.3, 0.05, 0.05], glow: 0, y: 0.08 });
    }
  }

  return {
    peds,
    spawnWalker,
    spawnThug,
    spawnOfficer,
    spawnContact,
    populate() {
      for (let i = 0; i < 26; i += 1) spawnWalker();
    },
    scareNearby(x, z, radius) {
      for (const ped of peds) {
        if (ped.kind !== 'walker' || ped.dead) continue;
        if (distance2D(x, z, ped.x, ped.z) < radius) {
          ped.scared = true;
          ped.fleeTimer = 4;
        }
      }
    },
    update(dt, player, onPlayerHit) {
      for (const ped of peds) {
        if (ped.dead) continue;
        if (ped.kind === 'walker') updateWalker(ped, dt, player);
        else if (ped.kind === 'thug') updateThug(ped, dt, player, onPlayerHit);
        else if (ped.kind === 'officer') updateOfficer(ped, dt, player);
        else ped.speed = 0;
        ped.x = clampNumber(ped.x, -WORLD_HALF, WORLD_HALF);
        ped.z = clampNumber(ped.z, -WORLD_HALF, WORLD_HALF);
      }
      const walkers = peds.filter((p) => p.kind === 'walker' && !p.dead).length;
      if (walkers < 22) spawnWalker();
    },
    removeByKind(kind) {
      for (let i = peds.length - 1; i >= 0; i -= 1) {
        if (peds[i].kind === kind) peds.splice(i, 1);
      }
    },
    countKind(kind) {
      return peds.filter((p) => p.kind === kind && !p.dead).length;
    },
    nearestThug(x, z, maxDist) {
      let best = null;
      let bestDist = maxDist;
      for (const ped of peds) {
        if (ped.kind !== 'thug' || ped.dead) continue;
        const d = distance2D(x, z, ped.x, ped.z);
        if (d < bestDist) { best = ped; bestDist = d; }
      }
      return best;
    },
    drawInto(drawList, timeSeconds) {
      for (const ped of peds) drawPed(drawList, ped, timeSeconds);
    },
  };
}

export function damagePed(ped, amount, effects) {
  if (ped.dead) return false;
  ped.health -= amount;
  effects.hitSparks(ped.x, 1.4, ped.z);
  if (ped.health <= 0) {
    ped.health = 0;
    ped.dead = true;
    ped.speed = 0;
    return true;
  }
  if (ped.kind === 'thug') ped.state = 'chase';
  return false;
}
