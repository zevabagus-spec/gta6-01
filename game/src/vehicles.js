// Solara Bay — vehicles. Every car is a box-built mesh: one shared mesh
// per model (body, cabin, wheels, plus police light bar or taxi sign),
// drawn with a model matrix. Traffic cars patrol the city loops, parked
// cars wait on street edges to be stolen, and police cars hunt the player
// while the wanted level is up.
import { CAR_MODELS, CFG } from './config.js';
import { mulberry32, clamp, angleLerp, dist2 } from './math3d.js';
import { newTriList, pushBox } from './engine.js';
import { collideCircleBox } from './city.js';

// Scale an RGB triple by a brightness factor (darker glass, lighter roof).
function shade(rgb, f) { return [rgb[0] * f, rgb[1] * f, rgb[2] * f]; }

// Build one mesh per model, shared by all cars of that model. Forward is
// +Z in model space.
export function buildCarMeshes(renderer) {
  const meshes = {};
  for (const [key, model] of Object.entries(CAR_MODELS)) {
    const list = newTriList();
    const c = model.color;
    const sporty = key === 'sunray' || key === 'police';
    // Lower body, cabin, and a dark glass band on top of the cabin.
    pushBox(list, 0, 0.55, 0, 1.9, 0.7, 4.2, c, shade(c, 1.15));
    pushBox(list, 0, 1.15, -0.3, 1.6, 0.6, 2.2, shade(c, 0.55), shade(c, 0.7));
    pushBox(list, 0, 1.25, -0.3, 1.4, 0.15, 2.0, [0.1, 0.12, 0.16]);
    if (key === 'pickup') pushBox(list, 0, 1.0, -1.2, 1.7, 0.5, 1.4, shade(c, 0.8));
    if (key === 'van') pushBox(list, 0, 1.5, -0.6, 1.8, 1.1, 2.6, shade(c, 0.9));
    const wheel = [0.08, 0.08, 0.1];
    for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      pushBox(list, wx, 0.35, wz, 0.3, 0.7, 0.7, wheel);
    }
    if (sporty) pushBox(list, 0, 0.95, -2.0, 1.8, 0.25, 0.4, [0.1, 0.1, 0.12]);
    if (key === 'police') {
      pushBox(list, -0.4, 1.55, -0.3, 0.6, 0.25, 0.5, [0.9, 0.1, 0.1]);
      pushBox(list, 0.4, 1.55, -0.3, 0.6, 0.25, 0.5, [0.1, 0.2, 0.95]);
      pushBox(list, 0, 0.62, 2.12, 1.7, 0.35, 0.15, [0.9, 0.9, 0.85]);
    }
    if (key === 'taxi') pushBox(list, 0, 1.55, -0.3, 1.0, 0.3, 0.8, [0.95, 0.85, 0.2]);
    meshes[key] = renderer.makeMesh(list);
  }
  return meshes;
}

export function makeCar(id, modelKey, x, z, yaw) {
  const model = CAR_MODELS[modelKey];
  return {
    id, modelKey, model, x, z, yaw, speed: 0, health: 100,
    traffic: false, parked: false, police: modelKey === 'police',
    loop: null, loopIndex: 0, loopSpeed: 0, stuck: 0,
  };
}

// Fill the city's loops with traffic, staggered along random segments.
export function spawnTraffic(city, rng) {
  const cars = [];
  const keys = ['sedan', 'coupe', 'pickup', 'van', 'taxi'];
  for (let i = 0; i < CFG.trafficCount; i++) {
    const loop = city.loops[i % city.loops.length];
    const seg = Math.floor(rng() * loop.length);
    const a = loop[seg], b = loop[(seg + 1) % loop.length];
    const t = rng();
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const car = makeCar('traffic' + i, keys[Math.floor(rng() * keys.length)], x, z, 0);
    car.traffic = true; car.loop = loop; car.loopIndex = (seg + 1) % loop.length;
    car.loopSpeed = 8 + rng() * 5;
    car.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    cars.push(car);
  }
  return cars;
}

// Parked cars live on street edges: one coordinate on a street line, nudged
// to the asphalt edge, never inside a block. The gold Sunray waits on Coral
// Row (the z=-40 street) for mission 2; a taxi waits by the square.
export function spawnParked() {
  const spots = [
    ['sunray', 100, -44, Math.PI / 2], ['sedan', -124, -100, 0], ['coupe', 60, 124, Math.PI],
    ['pickup', -84, 60, -Math.PI / 2], ['van', 124, -60, Math.PI], ['sedan', 20, -124, 0],
    ['taxi', -5, 4, Math.PI / 2], ['coupe', -100, 84, 0], ['sedan', 164, 60, -Math.PI / 2],
    ['pickup', 60, -84, Math.PI / 2],
  ];
  return spots.map(([key, x, z, yaw], i) => {
    const car = makeCar('parked' + i, key, x, z, yaw);
    car.parked = true;
    return car;
  });
}

// Traffic steers between its loop's waypoints and pauses when another car
// is directly ahead, so cars queue instead of passing through each other.
export function updateTraffic(cars, dt, allCars) {
  for (const car of cars) {
    if (!car.traffic) continue;
    const target = car.loop[car.loopIndex];
    const d = dist2(car.x, car.z, target[0], target[1]);
    if (d < 3) { car.loopIndex = (car.loopIndex + 1) % car.loop.length; continue; }
    const wantYaw = Math.atan2(target[0] - car.x, target[1] - car.z);
    car.yaw = angleLerp(car.yaw, wantYaw, Math.min(1, dt * 3));
    let blocked = false;
    for (const other of allCars) {
      if (other === car) continue;
      const ox = other.x - car.x, oz = other.z - car.z;
      const forward = ox * Math.sin(car.yaw) + oz * Math.cos(car.yaw);
      const side = Math.abs(ox * Math.cos(car.yaw) - oz * Math.sin(car.yaw));
      if (forward > 0 && forward < 7 && side < 2.4) { blocked = true; break; }
    }
    car.speed = blocked ? 0 : car.loopSpeed;
    car.x += Math.sin(car.yaw) * car.speed * dt;
    car.z += Math.cos(car.yaw) * car.speed * dt;
  }
}

// Police cars steer at the player and ram on contact; they despawn once the
// wanted level clears (handled by the caller).
export function updatePoliceCars(cars, player, dt, city, onRam) {
  for (const car of cars) {
    if (!car.police) continue;
    const d = dist2(car.x, car.z, player.x, player.z);
    const wantYaw = Math.atan2(player.x - car.x, player.z - car.z);
    car.yaw = angleLerp(car.yaw, wantYaw, Math.min(1, dt * 2.2));
    const targetSpeed = d > 6 ? car.model.topSpeed : car.model.topSpeed * 0.55;
    car.speed = clamp(car.speed + (targetSpeed - car.speed) * dt * 1.2, 0, car.model.topSpeed);
    car.x += Math.sin(car.yaw) * car.speed * dt;
    car.z += Math.cos(car.yaw) * car.speed * dt;
    [car.x, car.z] = collideCircleBox(car.x, car.z, 1.6, city.colliders);
    car.x = clamp(car.x, -CFG.worldHalf, CFG.worldHalf);
    car.z = clamp(car.z, -CFG.worldHalf, CFG.worldHalf);
    // One ram per car per 1.2 s: without this cooldown a touching police
    // car would empty the player's health bar within a single second.
    car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
    if (d < 3.2 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.2;
      onRam(car, d);
    }
  }
}

// Push overlapping cars apart (circle-vs-circle) and bleed their speed.
export function resolveCarBumps(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const ux = dx / d, uz = dz / d;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
        a.speed *= 0.7; b.speed *= 0.7;
      }
    }
  }
}
export { mulberry32 };
