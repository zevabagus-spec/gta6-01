// Mara Voss: on-foot movement, health, cash, wanted level, weapon state,
// and getting in and out of cars. Mara is drawn as a distinct figure —
// teal jacket, dark jeans — so she reads at a glance in every screenshot.
import { clampNumber, distance2D, turnToward } from './rng.js';
import { WORLD_HALF, resolveCircleCollision } from './city.js';

export function createPlayer(spawnX, spawnZ) {
  return {
    x: spawnX,
    z: spawnZ,
    heading: Math.PI,
    moveHeading: Math.PI,
    speed: 0,
    walkPhase: 0,
    health: 100,
    maxHealth: 100,
    cash: 120,
    wanted: 0,
    cooling: false,
    coolTimer: 0,
    weapon: 'fists',
    ammo: 24,
    reserveAmmo: 48,
    meleeCooldown: 0,
    shootCooldown: 0,
    reloadTimer: 0,
    inCar: false,
    car: null,
    kills: 0,
    carsStolen: 0,
    coinsFound: 0,
    punchSwing: 0,
    hurtFlash: 0,
  };
}

export function updatePlayerOnFoot(player, moveX, moveZ, sprint, cameraYaw, dt, colliders) {
  player.meleeCooldown = Math.max(0, player.meleeCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.punchSwing = Math.max(0, player.punchSwing - dt);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt);
  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) {
      const need = 24 - player.ammo;
      const take = Math.min(need, player.reserveAmmo);
      player.ammo += take;
      player.reserveAmmo -= take;
    }
  }
  const moving = moveX !== 0 || moveZ !== 0;
  if (!moving) {
    player.speed = Math.max(0, player.speed - 30 * dt);
    return;
  }
  // Movement is camera-relative: W runs away from the camera.
  const forwardX = Math.sin(cameraYaw);
  const forwardZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = Math.sin(cameraYaw);
  let dx = forwardX * -moveZ + rightX * moveX;
  let dz = forwardZ * -moveZ + rightZ * moveX;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  dx /= len;
  dz /= len;
  const targetSpeed = sprint ? 9.5 : 5.5;
  player.speed += clampNumber(targetSpeed - player.speed, -30 * dt, 22 * dt);
  const desiredHeading = Math.atan2(dx, -dz);
  player.heading = turnToward(player.heading, desiredHeading, 10 * dt);
  const nx = player.x + dx * player.speed * dt;
  const nz = player.z + dz * player.speed * dt;
  const [rx, rz] = resolveCircleCollision(nx, nz, 0.8, colliders);
  player.x = rx;
  player.z = rz;
  player.walkPhase = (player.walkPhase + player.speed * dt * 1.7) % (Math.PI * 2);
  player.x = clampNumber(player.x, -WORLD_HALF, WORLD_HALF);
  player.z = clampNumber(player.z, -WORLD_HALF, WORLD_HALF);
}

export function damagePlayer(player, amount) {
  if (player.health <= 0) return true;
  player.health = Math.max(0, player.health - amount);
  player.hurtFlash = 0.35;
  return player.health <= 0;
}

export function healPlayer(player, amount) {
  player.health = Math.min(player.maxHealth, player.health + amount);
}

export function addCash(player, amount) {
  player.cash = Math.max(0, player.cash + amount);
}

export function raiseWanted(player, amount) {
  player.wanted = clampNumber(player.wanted + amount, 0, 5);
  player.cooling = false;
  player.coolTimer = 0;
}

export function lowerWanted(player) {
  player.wanted = 0;
  player.cooling = false;
  player.coolTimer = 0;
}

export function enterCar(player, car, stolen) {
  player.inCar = true;
  player.car = car;
  car.kind = 'player';
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  player.speed = 0;
  if (stolen) player.carsStolen += 1;
}

export function exitCar(player, colliders) {
  const car = player.car;
  if (!car) return;
  const sideX = Math.cos(car.heading);
  const sideZ = Math.sin(car.heading);
  let ex = car.x + sideX * 3.2;
  let ez = car.z + sideZ * 3.2;
  const [rx, rz] = resolveCircleCollision(ex, ez, 0.8, colliders);
  ex = rx;
  ez = rz;
  player.x = ex;
  player.z = ez;
  player.heading = car.heading;
  player.speed = 0;
  player.inCar = false;
  player.car = null;
  car.kind = 'parked';
  car.speed = 0;
}

export function syncPlayerToCar(player) {
  if (player.inCar && player.car) {
    player.x = player.car.x;
    player.z = player.car.z;
    player.heading = player.car.heading;
    player.speed = Math.abs(player.car.speed);
  }
}

export function drawPlayer(drawList, player) {
  if (player.inCar) return;
  const swing = Math.sin(player.walkPhase) * clampNumber(player.speed / 6, 0, 1) * 0.55;
  const cosH = Math.cos(player.heading);
  const sinH = Math.sin(player.heading);
  const local = (lx, lz) => [player.x + lx * cosH + lz * sinH, player.z - lx * sinH + lz * cosH];
  drawList.groundQuads.push({ x: player.x, z: player.z, sx: 1.5, sz: 1.5, color: [0.10, 0.10, 0.12], glow: 0, y: 0.05 });
  const jacket = [0.10, 0.65, 0.62];
  const jeans = [0.18, 0.22, 0.38];
  const [legLX, legLZ] = local(-0.22, swing * 0.5);
  const [legRX, legRZ] = local(0.22, -swing * 0.5);
  drawList.boxes.push({ x: legLX, y: 0.45, z: legLZ, sx: 0.3, sy: 0.9, sz: 0.3, ry: player.heading, color: jeans, glow: 0 });
  drawList.boxes.push({ x: legRX, y: 0.45, z: legRZ, sx: 0.3, sy: 0.9, sz: 0.3, ry: player.heading, color: jeans, glow: 0 });
  drawList.boxes.push({ x: player.x, y: 1.25, z: player.z, sx: 0.78, sy: 0.78, sz: 0.48, ry: player.heading, color: jacket, glow: 0 });
  const punch = player.punchSwing > 0 ? 0.8 : 0;
  const [armLX, armLZ] = local(-0.52, -swing * 0.4 - punch);
  const [armRX, armRZ] = local(0.52, swing * 0.4);
  drawList.boxes.push({ x: armLX, y: 1.25, z: armLZ, sx: 0.22, sy: 0.7, sz: 0.22, ry: player.heading, color: jacket, glow: 0 });
  drawList.boxes.push({ x: armRX, y: 1.25, z: armRZ, sx: 0.22, sy: 0.7, sz: 0.22, ry: player.heading, color: jacket, glow: 0 });
  drawList.boxes.push({ x: player.x, y: 1.97, z: player.z, sx: 0.52, sy: 0.52, sz: 0.52, ry: player.heading, color: [0.88, 0.68, 0.52], glow: 0 });
  drawList.boxes.push({ x: player.x, y: 2.26, z: player.z, sx: 0.56, sy: 0.2, sz: 0.56, ry: player.heading, color: [0.35, 0.20, 0.12], glow: 0 });
  if (player.weapon === 'pistol') {
    const [gunX, gunZ] = local(0.55, -0.7);
    drawList.boxes.push({ x: gunX, y: 1.25, z: gunZ, sx: 0.14, sy: 0.14, sz: 0.55, ry: player.heading, color: [0.12, 0.12, 0.14], glow: 0 });
  }
  // Soft gold ring so Mara is findable in busy shots.
  drawList.groundQuads.push({ x: player.x, z: player.z, sx: 2.0, sz: 2.0, color: [1.0, 0.85, 0.3], glow: 0.25, y: 0.07 });
}

export function distanceToPlayer(player, x, z) {
  return distance2D(player.x, player.z, x, z);
}
