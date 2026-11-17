// vehicles: car meshes (built from boxes — body, cabin, wheels, light bar for
// police), parked cars the player can steal, and the 14 traffic cars that
// loop the road grid.
import * as THREE from '../vendor/three.min.js';
import { ROADS, TRAFFIC_COUNT, makeRng, pick, clamp } from './config.js';
import { resolveCircle, isOnRoad } from './city.js';

const CAR_COLORS = [0xc23b3b, 0x3b6fc2, 0xe8e4d8, 0x2f2f33, 0x4a9e5a, 0xd8a03a, 0x7a4a9e, 0x9fb4c6];

// One car: a group with body/cabin/wheels; userData holds kind + wheel refs.
export function createCar(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.1), new THREE.MeshLambertMaterial({ color: 0x1d2733 }));
  cabin.position.set(0, 1.05, -0.2); g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [x, z] of [[-1.05, 1.45], [1.05, 1.45], [-1.05, -1.45], [1.05, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z);
    g.add(w); wheels.push(w);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.42, -0.2); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.3, 1.55, -0.2); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.3, 1.55, -0.2); g.add(blue);
    g.userData.lights = [red, blue];
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe23e }));
    sign.position.set(0, 1.45, -0.2); g.add(sign);
  }
  g.userData = { ...g.userData, kind, wheels, speed: 0, heading: 0 };
  return g;
}

export function spawnParkedCars(g) {
  const rng = makeRng(g.seed + 11);
  g.parkedCars = [];
  const spots = [
    [34, -108, 0], [-52, -52, 1], [70, -12, 0], [-108, 52, 1], [52, 108, 0],
    [-12, 92, 1], [108, 52, 0], [-70, -108, 1], [8, -52, 0], [-40, 8, 1],
  ];
  for (let [x, z, rot] of spots) {
    // Never embed a parked car in a building: snap onto the nearest road.
    const inside = g.colliders.some((c) => x > c.minX - 3 && x < c.maxX + 3 && z > c.minZ - 3 && z < c.maxZ + 3);
    if (inside) {
      const nearRoad = ROADS.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a, ROADS[0]);
      x = nearRoad;
    }
    const color = pick(rng, CAR_COLORS);
    const car = createCar(color, 'parked');
    car.position.set(x, 0, z);
    car.rotation.y = rot * Math.PI / 2;
    g.scene.add(car);
    g.parkedCars.push({ mesh: car, x, z, taken: false, color });
    const alongX = rot === 1;
    g.colliders.push(alongX
      ? { minX: x - 2.4, maxX: x + 2.4, minZ: z - 1.4, maxZ: z + 1.4, car }
      : { minX: x - 1.4, maxX: x + 1.4, minZ: z - 2.4, maxZ: z + 2.4, car });
  }
  // The Sunray sportscar (mission 2 target) and the taxi (mission 3).
  const sunray = createCar(0xffc93e, 'sunray');
  sunray.position.set(60, 0, -60); sunray.rotation.y = Math.PI / 2;
  g.scene.add(sunray);
  g.sunray = { mesh: sunray, x: 60, z: -60, taken: false };
  const taxi = createCar(0xffc93e, 'taxi');
  taxi.position.set(-8, 0, -112); taxi.rotation.y = 0;
  g.scene.add(taxi);
  g.taxi = { mesh: taxi, x: -8, z: -112, taken: false };
}

export function spawnTraffic(g) {
  const rng = makeRng(g.seed + 23);
  g.traffic = [];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const road = ROADS[Math.floor(rng() * ROADS.length)];
    const horiz = rng() < 0.5;
    const t = -130 + rng() * 260;
    const car = createCar(pick(rng, CAR_COLORS), 'traffic');
    car.position.set(horiz ? t : road, 0, horiz ? road : t);
    g.scene.add(car);
    // Rectangular loop around the block the car starts on.
    const loop = [];
    const a = road, b = road + (rng() < 0.5 ? 60 : -60);
    for (const [x, z] of [[a, a], [b, a], [b, b], [a, b]]) loop.push({ x, z });
    g.traffic.push({ mesh: car, loop, wp: 0, speed: 9 + rng() * 5, horiz, road });
  }
}

// Traffic follows its loop; it slows when another car is right ahead.
export function updateTraffic(g, dt) {
  for (const t of g.traffic) {
    if (g.playerCar === t.mesh) continue;
    const target = t.loop[t.wp];
    const dx = target.x - t.mesh.position.x, dz = target.z - t.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 4) { t.wp = (t.wp + 1) % t.loop.length; continue; }
    const want = Math.atan2(dx, dz);
    let diff = want - t.mesh.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    t.mesh.rotation.y += clamp(diff, -1.6 * dt, 1.6 * dt);
    // Slow for the car ahead.
    let speed = t.speed;
    for (const o of g.traffic) {
      if (o === t) continue;
      const od = Math.hypot(o.mesh.position.x - t.mesh.position.x, o.mesh.position.z - t.mesh.position.z);
      if (od < 9) {
        const ahead = Math.cos(t.mesh.rotation.y) * (o.mesh.position.z - t.mesh.position.z) + Math.sin(t.mesh.rotation.y) * (o.mesh.position.x - t.mesh.position.x);
        if (ahead > 0) speed = Math.min(speed, 3);
      }
    }
    t.mesh.position.x += Math.sin(t.mesh.rotation.y) * speed * dt;
    t.mesh.position.z += Math.cos(t.mesh.rotation.y) * speed * dt;
    for (const w of t.mesh.userData.wheels) w.rotation.x += speed * dt * 2;
  }
}
