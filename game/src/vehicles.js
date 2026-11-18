// Cars: ambient traffic on the road grid, the parked gold Sunray,
// police pursuit cars, and the car the player is driving — including
// stealing. A police ram carries a per-car cooldown so a touching
// police car can never drain health every frame.

import { CAR_COLORS, PLACES, RAM_COOLDOWN, TRAFFIC_COUNT, WORLD_HALF } from './config.js';
import { clampToWorld, resolveCollision, ROAD_LINES } from './city.js';
import { angleLerp, clamp, dist2D } from './math3d.js';
import { makeRng, pick, range } from './random.js';
import { damagePlayer } from './player.js';

let nextCarId = 1;

export function makeCar(kind, x, z, heading, color) {
  return {
    id: nextCarId++,
    kind,
    x, z, heading,
    speed: 0,
    color,
    stolen: false,
    lastRamAt: -99,
    flashPhase: Math.random() * 6.28,
    road: null,
    line: 0,
    dir: 1,
    lane: 3.5,
    cruise: 11,
  };
}

export function createTraffic(seedText) {
  const rng = makeRng(seedText + '-traffic');
  const cars = [];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const horizontal = rng() < 0.5;
    const line = pick(rng, ROAD_LINES);
    const along = range(rng, -180, 180);
    const dir = rng() < 0.5 ? 1 : -1;
    const car = makeCar(
      'traffic',
      horizontal ? along : line + 3.5 * dir,
      horizontal ? line + 3.5 * dir : along,
      horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      pick(rng, CAR_COLORS),
    );
    car.road = horizontal ? 'h' : 'v';
    car.line = line;
    car.dir = dir;
    car.cruise = range(rng, 9, 14);
    car.speed = car.cruise;
    cars.push(car);
  }
  // The gold Sunray coupe, parked by Dario's garage.
  const sunray = makeCar('parked', PLACES.sunrayParked.x, PLACES.sunrayParked.z, Math.PI / 2, [0.95, 0.72, 0.15]);
  sunray.isSunray = true;
  cars.push(sunray);
  return cars;
}

export function nearestCar(G, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.kind === 'player') continue;
    const d = dist2D(x, z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function tryEnterCar(G) {
  const p = G.player;
  if (p.car) return false;
  const car = nearestCar(G, p.x, p.z, 4.5);
  if (!car) {
    G.toast('No car close by');
    return false;
  }
  const wasParked = car.kind === 'parked';
  const wasTraffic = car.kind === 'traffic';
  car.kind = 'player';
  car.speed = 0;
  p.car = car;
  p.x = car.x;
  p.z = car.z;
  p.heading = car.heading;
  G.sounds.door();
  if (wasTraffic) {
    car.stolen = true;
    G.sounds.steal();
    G.addWanted(1, 'car stolen');
    G.toast('Car stolen! The cops noticed.');
    G.onCarStolen(car);
  } else if (car.isSunray) {
    G.toast('The Sunray — Dario’s gold coupe.');
    G.onSunrayTaken(car);
  } else if (wasParked) {
    G.toast('You take the parked car.');
  }
  return true;
}

export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  car.kind = car.stolen ? 'parked' : 'parked';
  car.speed = 0;
  p.car = null;
  p.x = car.x + Math.cos(car.heading) * 3;
  p.z = car.z - Math.sin(car.heading) * 3;
  const fixed = resolveCollision(G.city.colliders, p.x, p.z, 0.9);
  p.x = fixed.x;
  p.z = fixed.z;
  G.sounds.door();
  G.sounds.setEngine(false, 0);
}

export function updatePlayerCar(G, dt) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const input = G.input;
  const accel = input.keys.has('KeyW') || input.keys.has('ArrowUp');
  const brake = input.keys.has('KeyS') || input.keys.has('ArrowDown');
  const left = input.keys.has('KeyA') || input.keys.has('ArrowLeft');
  const right = input.keys.has('KeyD') || input.keys.has('ArrowRight');
  if (accel) car.speed += 26 * dt;
  else if (brake) car.speed -= 34 * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  car.speed = clamp(car.speed, -10, 34);
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  if (steer !== 0 && Math.abs(car.speed) > 0.5) {
    car.heading += steer * dt * 1.9 * Math.sign(car.speed) * clamp(Math.abs(car.speed) / 12, 0.4, 1);
  }
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let nx = car.x + fx * car.speed * dt;
  let nz = car.z + fz * car.speed * dt;
  const hit = resolveCollision(G.city.colliders, nx, nz, 1.6);
  if (hit.x !== nx || hit.z !== nz) {
    if (Math.abs(car.speed) > 8) {
      G.sounds.crash();
      G.shake = Math.min(1, G.shake + 0.35);
      car.speed *= 0.25;
    } else {
      car.speed *= 0.5;
    }
  }
  const clamped = clampToWorld(hit.x, hit.z);
  car.x = clamped.x;
  car.z = clamped.z;
  p.x = car.x;
  p.z = car.z;
  p.heading = car.heading;
  G.cameraYaw = angleLerp(G.cameraYaw, car.heading, Math.min(1, dt * 1.6));
  G.sounds.setEngine(true, Math.abs(car.speed) / 34);
  G.speedKmh = Math.round(Math.abs(car.speed) * 3.6);
}

export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (car.kind !== 'traffic') continue;
    // Traffic cruises its road and wraps around the city edge.
    if (car.road === 'h') {
      car.x += car.dir * car.cruise * dt;
      car.z = car.line + 3.5 * car.dir;
      if (car.x > WORLD_HALF) car.x = -WORLD_HALF;
      if (car.x < -WORLD_HALF) car.x = WORLD_HALF;
    } else {
      car.z += car.dir * car.cruise * dt;
      car.x = car.line + 3.5 * car.dir;
      if (car.z > WORLD_HALF) car.z = -WORLD_HALF;
      if (car.z < -WORLD_HALF) car.z = WORLD_HALF;
    }
    // Ease off when the player's car is right ahead.
    const p = G.player;
    if (p.car && dist2D(car.x, car.z, p.x, p.z) < 9) {
      const ahead = (car.x - p.x) * Math.sin(car.heading) + (car.z - p.z) * Math.cos(car.heading);
      if (ahead > 0) car.speed = 0;
    }
  }
}

export function updatePolice(G, dt) {
  const p = G.player;
  for (const car of G.cars) {
    if (car.kind !== 'police') continue;
    const d = dist2D(car.x, car.z, p.x, p.z);
    const targetHeading = Math.atan2(p.x - car.x, p.z - car.z);
    car.heading = angleLerp(car.heading, targetHeading, Math.min(1, dt * 2.4));
    const cruise = G.wanted >= 4 ? 30 : 24;
    car.speed = d > 6 ? cruise : 10;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let nx = car.x + fx * car.speed * dt;
    let nz = car.z + fz * car.speed * dt;
    const fixed = resolveCollision(G.city.colliders, nx, nz, 1.6);
    // Police slide along buildings instead of stopping dead.
    if (fixed.x !== nx || fixed.z !== nz) {
      car.heading += dt * 1.4;
      nx = car.x + Math.sin(car.heading) * car.speed * dt * 0.5;
      nz = car.z + Math.cos(car.heading) * car.speed * dt * 0.5;
    }
    const clamped = clampToWorld(nx, nz);
    car.x = clamped.x;
    car.z = clamped.z;
    // Ram: damage with a per-car cooldown — never every frame.
    if (d < 4.2 && G.time - car.lastRamAt >= RAM_COOLDOWN) {
      car.lastRamAt = G.time;
      G.sounds.crash();
      G.shake = Math.min(1, G.shake + 0.5);
      if (p.car) {
        p.car.speed *= 0.4;
        damagePlayer(G, 6, 'ram');
      } else {
        damagePlayer(G, 5, 'ram');
      }
    }
  }
}

export function drawCar(renderer, car, time) {
  const r = renderer;
  const bodyY = 0.75;
  r.drawBox(car.x, bodyY, car.z, car.heading, 2.2, 0.9, 4.6, car.color);
  r.drawBox(car.x, bodyY + 0.75, car.z, car.heading, 1.9, 0.7, 2.4, [0.15, 0.2, 0.28]);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const sx = Math.cos(car.heading);
  const sz = -Math.sin(car.heading);
  for (const [along, side] of [[1.5, 1], [1.5, -1], [-1.5, 1], [-1.5, -1]]) {
    r.drawBox(
      car.x + fx * along + sx * side * 1.05,
      0.4, car.z + fz * along + sz * side * 1.05,
      car.heading, 0.35, 0.8, 0.8, [0.08, 0.08, 0.1],
    );
  }
  // Headlights.
  r.drawBox(car.x + fx * 2.3 + sx * 0.7, bodyY, car.z + fz * 2.3 + sz * 0.7, car.heading, 0.4, 0.3, 0.15, [1.0, 0.95, 0.7]);
  r.drawBox(car.x + fx * 2.3 - sx * 0.7, bodyY, car.z + fz * 2.3 - sz * 0.7, car.heading, 0.4, 0.3, 0.15, [1.0, 0.95, 0.7]);
  if (car.kind === 'police') {
    r.drawBox(car.x, bodyY + 0.6, car.z, car.heading, 2.25, 0.5, 4.65, [0.92, 0.92, 0.95]);
    const phase = Math.sin(time * 9 + car.flashPhase) > 0;
    r.drawBox(car.x - sx * 0.45, bodyY + 1.35, car.z - sz * 0.45, car.heading, 0.8, 0.35, 0.6, phase ? [1, 0.1, 0.1] : [0.2, 0.2, 0.9]);
    r.drawBox(car.x + sx * 0.45, bodyY + 1.35, car.z + sz * 0.45, car.heading, 0.8, 0.35, 0.6, phase ? [0.2, 0.2, 0.9] : [1, 0.1, 0.1]);
  }
  if (car.isSunray) {
    r.drawBox(car.x, bodyY + 1.2, car.z, car.heading, 1.2, 0.25, 1.2, [1.0, 0.9, 0.4]);
  }
}

export function drawVehicles(renderer, G) {
  for (const car of G.cars) drawCar(renderer, car, G.time);
}
