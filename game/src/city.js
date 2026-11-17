// buildCity: the whole 3D city of Solara Bay — ground, district tints, roads,
// procedural buildings (with window textures drawn on a canvas, no files),
// street lamps, Marina palms and pier, Harbor containers, coins and pickups.
// Every solid building registers an AABB collider in g.colliders.
import * as THREE from '../vendor/three.min.js';
import { WORLD, ROADS, ROAD_HALF, DISTRICTS, SPAWN, MARKER_1, COIN_COUNT, districtAt, makeRng, dist2d } from './config.js';

function windowTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      ctx.fillStyle = Math.random() < 0.45 ? lit : '#1c2733';
      ctx.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Push a circle (x,z,r) out of every AABB collider it overlaps. Returns true if it hit.
export function resolveCircle(g, p, r) {
  let hit = false;
  for (const c of g.colliders) {
    const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = Math.min(p.x - c.minX, c.maxX - p.x);
      const pz = Math.min(p.z - c.minZ, c.maxZ - p.z);
      if (pl < pz) p.x = p.x - c.minX < c.maxX - p.x ? c.minX - r : c.maxX + r;
      else p.z = p.z - c.minZ < c.maxZ - p.z ? c.minZ - r : c.maxZ + r;
    }
  }
  p.x = Math.max(-WORLD.bound, Math.min(WORLD.bound, p.x));
  p.z = Math.max(-WORLD.bound, Math.min(WORLD.bound, p.z));
  return hit;
}

export function isOnRoad(x, z) {
  for (const r of ROADS) if (Math.abs(x - r) < ROAD_HALF + 1 || Math.abs(z - r) < ROAD_HALF + 1) return true;
  return false;
}

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

export function buildCity(g) {
  const rng = makeRng(g.seed);
  const scene = g.scene;
  g.colliders = [];
  g.coins = [];
  g.pickups = [];

  scene.background = new THREE.Color(0x87b5d9);
  scene.fog = new THREE.Fog(0x9fc3dd, 120, 420);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a6b52, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6b0, 1.6);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  sunBall.position.set(180, 150, -260);
  scene.add(sunBall);

  // Base ground + one tinted slab per district.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshLambertMaterial({ color: 0x6f7f66 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
  scene.add(ground);
  for (const d of DISTRICTS) {
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(d.x1 - d.x0, d.z1 - d.z0), new THREE.MeshLambertMaterial({ color: d.ground }));
    slab.rotation.x = -Math.PI / 2;
    slab.position.set((d.x0 + d.x1) / 2, 0, (d.z0 + d.z1) / 2);
    scene.add(slab);
  }
  // Roads: dark strips along every grid line.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  for (const r of ROADS) {
    for (const horiz of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(320, ROAD_HALF * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = horiz ? 0 : Math.PI / 2;
      road.position.set(horiz ? 0 : r, 0.02, horiz ? r : 0);
      scene.add(road);
    }
  }
  // Centre dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c95a });
  for (const r of ROADS) {
    for (let t = -140; t < 140; t += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(t, 0.04, r);
      scene.add(dash);
    }
  }

  // Buildings: one per block cell, skipped on roads and kept clear of the
  // spawn point and the first mission marker (spawn-bug fix by design).
  const texCache = new Map();
  const texFor = (d) => {
    if (!texCache.has(d.name)) {
      const hex = '#' + d.color.toString(16).padStart(6, '0');
      texCache.set(d.name, windowTexture(hex, d.tall ? '#ffe9a8' : '#9fd8ff'));
    }
    return texCache.get(d.name);
  };
  for (let bx = -135; bx <= 135; bx += 30) {
    for (let bz = -135; bz <= 135; bz += 30) {
      const cx = bx + 15, cz = bz + 15;
      if (isOnRoad(cx, cz)) continue;
      if (dist2d(cx, cz, SPAWN.x, SPAWN.z) < 26) continue;
      if (dist2d(cx, cz, MARKER_1.x, MARKER_1.z) < 14) continue;
      if (rng() < 0.18) continue; // empty lots / plazas
      const d = districtAt(cx, cz);
      const w = 12 + rng() * 8, dep = 12 + rng() * 8;
      const h = d.hMin + rng() * (d.hMax - d.hMin);
      const mat = new THREE.MeshLambertMaterial({ map: texFor(d) });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), mat);
      b.position.set(cx, h / 2, cz);
      scene.add(b);
      // Roof trim.
      const roof = box(w + 0.6, 0.5, dep + 0.6, 0x3a3f47, cx, h + 0.25, cz);
      scene.add(roof);
      g.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - dep / 2, maxZ: cz + dep / 2 });
      g.buildingBoxes.push({ x: cx, z: cz, w, d: dep });
    }
  }

  // Marina pier: wooden deck + posts out over the water edge at z=-146.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 10), pierMat);
  pier.position.set(24, 0.5, -142);
  scene.add(pier);
  for (let x = 12; x <= 36; x += 6) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 6), pierMat);
    post.position.set(x, -0.5, -146);
    scene.add(post);
  }
  // Marina palms.
  const palmTrunk = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const palmLeaf = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  for (let i = 0; i < 16; i++) {
    const x = -130 + rng() * 260, z = -138 + rng() * 30;
    if (isOnRoad(x, z)) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 7, 6), palmTrunk);
    trunk.position.set(x, 3.5, z); scene.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), palmLeaf);
    top.position.set(x, 7.4, z); top.scale.y = 0.5; scene.add(top);
  }
  // Harbor containers.
  const contColors = [0xc65a3a, 0x3a7ac6, 0x4a9e5a, 0xc6a03a];
  for (let i = 0; i < 18; i++) {
    const x = 78 + rng() * 58, z = -70 + rng() * 110;
    if (isOnRoad(x, z)) continue;
    const c = box(9, 3, 3.4, contColors[i % 4], x, 1.5, z);
    c.rotation.y = (i % 2) * Math.PI / 2;
    scene.add(c);
    g.colliders.push({ minX: x - 4.5, maxX: x + 4.5, minZ: z - 1.8, maxZ: z + 1.8 });
  }
  // Street lamps along the main roads.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const r of [-60, 0, 60]) {
    for (let t = -120; t <= 120; t += 40) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), poleMat);
      pole.position.set(r + 6, 3.5, t); scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), lampMat);
      lamp.position.set(r + 6, 7.1, t); scene.add(lamp);
    }
  }

  // Sun Coins: 30 gold spinners spread across the districts, clear of roads' centres.
  const coinGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.18, 20);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffc93e, emissive: 0x8a6d00 });
  for (let i = 0; i < COIN_COUNT; i++) {
    const x = -138 + rng() * 276, z = -138 + rng() * 276;
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, 1.2, z);
    scene.add(mesh);
    g.coins.push({ mesh, x, z, taken: false, spin: rng() * 6 });
  }
  // Health (green cross) and armour (blue) pickups.
  const mkPickup = (x, z, color, kind) => {
    const mesh = box(1.6, 1.6, 1.6, color, x, 1, z);
    const cap = box(1.9, 0.4, 1.9, 0xffffff, x, 2, z);
    scene.add(mesh); scene.add(cap);
    g.pickups.push({ mesh, cap, x, z, kind, taken: false });
  };
  const spots = [[-40, -100], [40, -40], [-100, 20], [100, -40], [0, 100], [-80, 110], [80, 80], [-20, -60], [60, 120], [-120, -40]];
  spots.forEach(([x, z], i) => mkPickup(x, z, i % 2 ? 0x2f7de1 : 0x2fd67a, i % 2 ? 'armour' : 'health'));
}
