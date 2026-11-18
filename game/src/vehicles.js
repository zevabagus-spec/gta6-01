// Vehicles: invented Solmar Bay models, traffic flow along the road grid,
// parked cars to steal, the player's driving physics, and police pursuit
// cars. Cars are drawn as stacked boxes with wheels, lights and shadows.
import { clampNumber, distance2D, pickFrom, randomRange, turnToward } from './rng.js';
import { ROAD_LINES, WORLD_HALF, resolveCircleCollision } from './city.js';

export const CAR_MODELS = [
  { name: 'Kestrel Coupe', length: 4.4, width: 2.0, topSpeed: 34, accel: 16, colors: [[0.80, 0.20, 0.18], [0.15, 0.35, 0.70], [0.90, 0.75, 0.25]] },
  { name: 'Bayliner Sedan', length: 4.6, width: 2.0, topSpeed: 28, accel: 12, colors: [[0.75, 0.75, 0.78], [0.25, 0.45, 0.35], [0.55, 0.55, 0.60]] },
  { name: 'Dune Runner', length: 4.8, width: 2.2, topSpeed: 30, accel: 14, colors: [[0.85, 0.55, 0.20], [0.40, 0.30, 0.20], [0.70, 0.65, 0.45]] },
  { name: 'Mule Pickup', length: 5.0, width: 2.1, topSpeed: 26, accel: 11, colors: [[0.30, 0.45, 0.55], [0.60, 0.25, 0.20], [0.45, 0.50, 0.40]] },
  { name: 'Comet GT', length: 4.2, width: 1.9, topSpeed: 40, accel: 20, colors: [[0.95, 0.60, 0.10], [0.20, 0.20, 0.25], [0.85, 0.85, 0.88]] },
  { name: 'Patrol Interceptor', length: 4.6, width: 2.0, topSpeed: 36, accel: 18, colors: [[0.12, 0.16, 0.22]] },
];

let nextCarId = 1;

export function makeCar(modelIndex, x, z, heading, kind, rand) {
  const model = CAR_MODELS[modelIndex];
  return {
    id: nextCarId++,
    modelIndex,
    model,
    x, z, heading,
    speed: 0,
    color: pickFrom(rand, model.colors),
    kind,
    health: 100,
    axis: 'x',
    line: 0,
    dir: 1,
    lane: 3.5,
    cruiseSpeed: randomRange(rand, 9, 13),
    sirenPhase: rand() * 6.28,
    steerVisual: 0,
    dead: false,
  };
}

export function createVehicleManager(rand, city, audio, effects) {
  const cars = [];
  const colliders = city.colliders;

  function randomRoadSpot() {
    const line = pickFrom(rand, ROAD_LINES);
    const along = randomRange(rand, -220, 220);
    if (rand() < 0.5) return { x: line, z: along, axis: 'z', line };
    return { x: along, z: line, axis: 'x', line };
  }

  function spotIsClear(x, z, minDist) {
    for (const other of cars) {
      if (!other.dead && distance2D(x, z, other.x, other.z) < minDist) return false;
    }
    return true;
  }

  function spawnTrafficCar() {
    let spot = randomRoadSpot();
    for (let attempt = 0; attempt < 10 && !spotIsClear(spot.x, spot.z, 7); attempt += 1) {
      spot = randomRoadSpot();
    }
    const car = makeCar(Math.floor(rand() * 5), spot.x, spot.z, 0, 'traffic', rand);
    car.axis = spot.axis;
    car.line = spot.line;
    car.dir = rand() < 0.5 ? 1 : -1;
    car.lane = car.dir === 1 ? 3.5 : -3.5;
    car.heading = car.axis === 'x' ? (car.dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (car.dir === 1 ? Math.PI : 0);
    car.speed = car.cruiseSpeed;
    cars.push(car);
    return car;
  }

  function spawnParkedCar() {
    const line = pickFrom(rand, ROAD_LINES);
    const along = randomRange(rand, -210, 210);
    const side = rand() < 0.5 ? 1 : -1;
    let x;
    let z;
    let heading;
    if (rand() < 0.5) { x = line + side * 5.4; z = along; heading = side === 1 ? Math.PI / 2 : -Math.PI / 2; }
    else { x = along; z = line + side * 5.4; heading = side === 1 ? Math.PI : 0; }
    if (!spotIsClear(x, z, 7)) {
      // Nudge along the road until the spot is free; never stack cars.
      for (let shift = 8; shift <= 40; shift += 8) {
        if (spotIsClear(x + shift, z, 7)) { x += shift; break; }
        if (spotIsClear(x, z + shift, 7)) { z += shift; break; }
      }
    }
    const car = makeCar(Math.floor(rand() * 5), x, z, heading, 'parked', rand);
    cars.push(car);
    return car;
  }

  function spawnPoliceCar(x, z) {
    const car = makeCar(5, x, z, 0, 'police', rand);
    car.color = [0.10, 0.14, 0.20];
    cars.push(car);
    return car;
  }

  function nearestCar(x, z, maxDist, kinds) {
    let best = null;
    let bestDist = maxDist;
    for (const car of cars) {
      if (car.dead) continue;
      if (kinds && !kinds.includes(car.kind)) continue;
      const d = distance2D(x, z, car.x, car.z);
      if (d < bestDist) { best = car; bestDist = d; }
    }
    return best;
  }

  function carAhead(car, lookAhead) {
    for (const other of cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const forward = Math.sin(car.heading) * dx + -Math.cos(car.heading) * dz;
      const side = Math.cos(car.heading) * dx + Math.sin(car.heading) * dz;
      if (forward > 0 && forward < lookAhead && Math.abs(side) < 3) return other;
    }
    return null;
  }

  function updateTrafficCar(car, dt) {
    const blocked = carAhead(car, 13);
    const target = blocked ? 0 : car.cruiseSpeed;
    car.speed += clampNumber(target - car.speed, -14 * dt, 6 * dt);
    if (car.axis === 'x') {
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z = car.line + car.lane;
      if (car.x > WORLD_HALF - 4) { car.x = -WORLD_HALF + 4; car.line = pickFrom(rand, ROAD_LINES); car.z = car.line + car.lane; }
      if (car.x < -WORLD_HALF + 4) { car.x = WORLD_HALF - 4; car.line = pickFrom(rand, ROAD_LINES); car.z = car.line + car.lane; }
    } else {
      car.z += -Math.cos(car.heading) * car.speed * dt;
      car.x = car.line + car.lane;
      if (car.z > WORLD_HALF - 4) { car.z = -WORLD_HALF + 4; car.line = pickFrom(rand, ROAD_LINES); car.x = car.line + car.lane; }
      if (car.z < -WORLD_HALF + 4) { car.z = WORLD_HALF - 4; car.line = pickFrom(rand, ROAD_LINES); car.x = car.line + car.lane; }
    }
  }

  function updatePoliceCar(car, dt, targetX, targetZ) {
    const desired = Math.atan2(targetX - car.x, -(targetZ - car.z));
    car.heading = turnToward(car.heading, desired, 2.4 * dt);
    const dist = distance2D(car.x, car.z, targetX, targetZ);
    const targetSpeed = dist > 60 ? car.model.topSpeed : clampNumber(dist * 0.9, 8, car.model.topSpeed);
    car.speed += clampNumber(targetSpeed - car.speed, -20 * dt, 14 * dt);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z - Math.cos(car.heading) * car.speed * dt;
    const [rx, rz] = resolveCircleCollision(nx, nz, 2.3, colliders);
    if (rx !== nx || rz !== nz) {
      car.speed *= 0.55;
      car.heading += 0.6 * dt * (rand() < 0.5 ? 1 : -1);
    }
    car.x = rx;
    car.z = rz;
  }

  // Player driving: arcade physics with steering that tightens at low speed.
  function drivePlayerCar(car, moveX, moveZ, handbrake, dt) {
    const forward = -moveZ;
    if (forward > 0) car.speed += car.model.accel * dt * forward;
    else if (forward < 0) {
      if (car.speed > 0.5) car.speed -= 26 * dt;
      else car.speed -= 8 * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4 * dt);
    }
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
    car.speed = clampNumber(car.speed, -10, car.model.topSpeed);
    const steerAmount = moveX * clampNumber(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.heading += steerAmount * 1.9 * dt * clampNumber(1.4 - Math.abs(car.speed) / 50, 0.55, 1.4);
    car.steerVisual = moveX;
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z - Math.cos(car.heading) * car.speed * dt;
    const [rx, rz] = resolveCircleCollision(nx, nz, 2.3, colliders);
    if ((rx !== nx || rz !== nz) && Math.abs(car.speed) > 6) {
      audio.crash();
      effects.burst(car.x, 1, car.z, [1.0, 0.7, 0.3], 10, 6, 0.6);
      car.health = Math.max(0, car.health - Math.abs(car.speed) * 0.7);
      car.speed *= -0.25;
    }
    car.x = rx;
    car.z = rz;
    return car.speed;
  }

  function collideCars(dt) {
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 4.4 || d < 1e-4) continue;
        const push = (4.4 - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const relSpeed = Math.abs(a.speed - b.speed);
        // Gentle touches only separate the cars: draining speed on every
        // overlapping frame would pin a car that merely spawned or parked
        // close to another. Real impacts still crash and swap momentum.
        if (relSpeed <= 3) continue;
        if (relSpeed > 8) {
          audio.crash();
          effects.burst((a.x + b.x) / 2, 1, (a.z + b.z) / 2, [1.0, 0.7, 0.3], 8, 5, 0.5);
          a.health = Math.max(0, a.health - relSpeed * 0.5);
          b.health = Math.max(0, b.health - relSpeed * 0.5);
        }
        const avg = (a.speed + b.speed) / 2;
        a.speed = avg * 0.8;
        b.speed = avg * 0.8;
      }
    }
    void dt;
  }

  function drawCar(drawList, car, timeSeconds) {
    const m = car.model;
    const half = m.length / 2;
    const heading = car.heading;
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);
    const local = (lx, lz) => [car.x + lx * cosH + lz * sinH, car.z - lx * sinH + lz * cosH];
    drawList.groundQuads.push({ x: car.x, z: car.z, sx: m.width + 0.8, sz: m.length + 0.8, color: [0.10, 0.10, 0.12], glow: 0, y: 0.05 });
    const bodyColor = car.health <= 0 ? [0.25, 0.22, 0.20] : car.color;
    drawList.boxes.push({ x: car.x, y: 0.75, z: car.z, sx: m.width, sy: 0.9, sz: m.length, ry: heading, color: bodyColor, glow: 0 });
    const [cabinX, cabinZ] = local(0, 0.3);
    drawList.boxes.push({ x: cabinX, y: 1.55, z: cabinZ, sx: m.width - 0.5, sy: 0.75, sz: m.length * 0.45, ry: heading, color: [0.15, 0.22, 0.30], glow: 0.15 });
    const wheelY = 0.4;
    const wheelOffsets = [[-m.width / 2, -half + 0.9], [m.width / 2, -half + 0.9], [-m.width / 2, half - 0.9], [m.width / 2, half - 0.9]];
    wheelOffsets.forEach(([lx, lz], i) => {
      const [wx, wz] = local(lx, lz);
      const steer = i < 2 ? car.steerVisual * 0.4 : 0;
      drawList.boxes.push({ x: wx, y: wheelY, z: wz, sx: 0.35, sy: 0.8, sz: 0.8, ry: heading + steer, color: [0.08, 0.08, 0.09], glow: 0 });
    });
    const [h1x, h1z] = local(-m.width / 2 + 0.4, -half - 0.05);
    const [h2x, h2z] = local(m.width / 2 - 0.4, -half - 0.05);
    drawList.boxes.push({ x: h1x, y: 0.85, z: h1z, sx: 0.5, sy: 0.3, sz: 0.15, ry: heading, color: [1.0, 0.95, 0.7], glow: 1.0 });
    drawList.boxes.push({ x: h2x, y: 0.85, z: h2z, sx: 0.5, sy: 0.3, sz: 0.15, ry: heading, color: [1.0, 0.95, 0.7], glow: 1.0 });
    const [t1x, t1z] = local(-m.width / 2 + 0.4, half + 0.05);
    const [t2x, t2z] = local(m.width / 2 - 0.4, half + 0.05);
    drawList.boxes.push({ x: t1x, y: 0.85, z: t1z, sx: 0.5, sy: 0.3, sz: 0.15, ry: heading, color: [0.9, 0.1, 0.1], glow: 0.7 });
    drawList.boxes.push({ x: t2x, y: 0.85, z: t2z, sx: 0.5, sy: 0.3, sz: 0.15, ry: heading, color: [0.9, 0.1, 0.1], glow: 0.7 });
    if (car.kind === 'police') {
      const flash = Math.sin(timeSeconds * 9 + car.sirenPhase) > 0;
      const [lx, lz] = local(0, 0.3);
      drawList.boxes.push({ x: lx, y: 2.1, z: lz, sx: 1.1, sy: 0.35, sz: 0.6, ry: heading, color: flash ? [1.0, 0.15, 0.1] : [0.15, 0.35, 1.0], glow: 1.0 });
    }
    if (car.health <= 0) {
      effects.dustPuff(car.x, 1.5, car.z);
    }
  }

  return {
    cars,
    spawnTrafficCar,
    spawnParkedCar,
    spawnPoliceCar,
    nearestCar,
    drivePlayerCar,
    populate() {
      for (let i = 0; i < 14; i += 1) spawnTrafficCar();
      for (let i = 0; i < 12; i += 1) spawnParkedCar();
    },
    update(dt, player, wantedTarget) {
      for (const car of cars) {
        if (car.dead) continue;
        if (car.kind === 'traffic') updateTrafficCar(car, dt);
        else if (car.kind === 'police') updatePoliceCar(car, dt, player.x, player.z);
      }
      collideCars(dt);
      // Keep traffic topped up near the player.
      const traffic = cars.filter((c) => c.kind === 'traffic' && !c.dead).length;
      if (traffic < 12) spawnTrafficCar();
      void wantedTarget;
    },
    removePoliceCars() {
      for (let i = cars.length - 1; i >= 0; i -= 1) {
        if (cars[i].kind === 'police') cars.splice(i, 1);
      }
    },
    countPolice() {
      return cars.filter((c) => c.kind === 'police' && !c.dead).length;
    },
    drawInto(drawList, timeSeconds) {
      for (const car of cars) {
        if (!car.dead) drawCar(drawList, car, timeSeconds);
      }
    },
  };
}
