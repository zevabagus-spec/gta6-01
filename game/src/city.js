// Solara Bay itself: a road grid, five districts of buildings, a
// beach and sea to the south, palms, lamps, crates, and the 30 Sun
// Coins. Generation is seeded, so the same city appears every run.

import { BEACH_Z, CAR_COLORS, COIN_COUNT, DISTRICTS, PLACES, SEA_Z, WORLD_HALF } from './config.js';
import { makeRng, pick, range } from './random.js';
import { dist2D } from './math3d.js';

export const ROAD_LINES = [-160, -96, -32, 32, 96, 160];
const ROAD_HALF = 7;

export function isOnRoad(x, z) {
  for (const line of ROAD_LINES) {
    if (Math.abs(x - line) < ROAD_HALF || Math.abs(z - line) < ROAD_HALF) return true;
  }
  return false;
}

export function buildCity(seedText) {
  const rng = makeRng(seedText);
  const buildings = [];
  const colliders = [];
  const palms = [];
  const lamps = [];
  const crates = [];

  // Blocks sit between the roads; each block holds 1-4 buildings.
  for (let bx = 0; bx < ROAD_LINES.length - 1; bx++) {
    for (let bz = 0; bz < ROAD_LINES.length - 1; bz++) {
      const x0 = ROAD_LINES[bx] + ROAD_HALF + 2;
      const x1 = ROAD_LINES[bx + 1] - ROAD_HALF - 2;
      const z0 = ROAD_LINES[bz] + ROAD_HALF + 2;
      const z1 = ROAD_LINES[bz + 1] - ROAD_HALF - 2;
      if (z0 > BEACH_Z - 10) continue;
      const district = DISTRICTS[Math.floor(rng() * DISTRICTS.length)];
      const count = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < count; i++) {
        const w = range(rng, 12, Math.max(13, (x1 - x0) / count - 3));
        const d = range(rng, 12, Math.max(13, (z1 - z0) / 1.6));
        const x = range(rng, x0 + w / 2, Math.max(x0 + w / 2 + 1, x1 - w / 2));
        const z = range(rng, z0 + d / 2, Math.max(z0 + d / 2 + 1, z1 - d / 2));
        const tall = district.name === 'Glass Towers';
        const h = tall ? range(rng, 26, 52) : range(rng, 8, 26);
        const tint = district.tint;
        const shade = range(rng, 0.82, 1.05);
        const color = [tint[0] * shade, tint[1] * shade, tint[2] * shade];
        const roof = [Math.min(1, color[0] * 0.7 + 0.15), color[1] * 0.6, color[2] * 0.6];
        buildings.push({ x, z, w, d, h, color, roof, district: district.name });
        colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
      }
    }
  }

  // Palms line the beach and the marina promenade, kept clear of the
  // pier so the getaway boat stays visible and reachable.
  for (let i = 0; i < 42; i++) {
    const x = range(rng, -WORLD_HALF + 12, WORLD_HALF - 12);
    const z = range(rng, BEACH_Z - 6, BEACH_Z + 22);
    if (Math.abs(x - PLACES.boat.x) < 12 && z > 155) continue;
    palms.push({ x, z, h: range(rng, 7, 11), lean: range(rng, -0.14, 0.14) });
  }
  for (let i = 0; i < 18; i++) {
    const line = pick(rng, ROAD_LINES);
    const along = range(rng, -170, 150);
    if (rng() < 0.5) palms.push({ x: line + ROAD_HALF + 3, z: along, h: range(rng, 6, 9), lean: 0 });
    else palms.push({ x: along, z: line + ROAD_HALF + 3, h: range(rng, 6, 9), lean: 0 });
  }

  // Street lamps at road crossings.
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      if (z > BEACH_Z) continue;
      lamps.push({ x: x + ROAD_HALF + 1.5, z: z + ROAD_HALF + 1.5 });
    }
  }

  // Crates near the freight yard and warehouse.
  for (let i = 0; i < 14; i++) {
    const nearYard = i < 8;
    const cx = nearYard ? PLACES.yard.x : PLACES.warehouse.x;
    const cz = nearYard ? PLACES.yard.z : PLACES.warehouse.z;
    crates.push({ x: cx + range(rng, -16, 16), z: cz + range(rng, -12, 12), s: range(rng, 1.6, 2.6), rot: range(rng, 0, 3) });
  }

  // Sun Coins: scattered along roads and plazas, never inside buildings.
  const coins = [];
  let guard = 0;
  while (coins.length < COIN_COUNT && guard < 900) {
    guard++;
    const x = range(rng, -180, 180);
    const z = range(rng, -180, 175);
    if (!isOnRoad(x, z) && rng() < 0.6) continue;
    if (collidesAt(colliders, x, z, 1.2)) continue;
    if (coins.some((c) => dist2D(c.x, c.z, x, z) < 14)) continue;
    coins.push({ x, z, taken: false, spin: rng() * 6.28 });
  }

  return { buildings, colliders, palms, lamps, crates, coins, rngSeed: seedText };
}

export function collidesAt(colliders, x, z, radius) {
  for (const c of colliders) {
    if (Math.abs(x - c.x) < c.hw + radius && Math.abs(z - c.z) < c.hd + radius) return c;
  }
  return null;
}

// Push a circle out of building colliders; returns corrected position.
export function resolveCollision(colliders, x, z, radius) {
  for (const c of colliders) {
    const dx = x - c.x;
    const dz = z - c.z;
    const px = c.hw + radius - Math.abs(dx);
    const pz = c.hd + radius - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) x = c.x + Math.sign(dx || 1) * (c.hw + radius);
      else z = c.z + Math.sign(dz || 1) * (c.hd + radius);
    }
  }
  return { x, z };
}

export function clampToWorld(x, z) {
  const lim = WORLD_HALF - 4;
  return {
    x: Math.max(-lim, Math.min(lim, x)),
    z: Math.max(-lim, Math.min(SEA_Z + 4, z)),
  };
}

export function drawCity(renderer, city, time, coinsTakenSet) {
  const r = renderer;
  // Ground: grass-tan base, then road strips, beach, and sea.
  r.drawSlab(0, 0, WORLD_HALF * 2 + 40, WORLD_HALF * 2 + 40, 0.2, [0.62, 0.66, 0.42]);
  for (const line of ROAD_LINES) {
    r.drawSlab(line, 0, ROAD_HALF * 2, WORLD_HALF * 2, 0.3, [0.22, 0.22, 0.26]);
    r.drawSlab(0, line, WORLD_HALF * 2, ROAD_HALF * 2, 0.3, [0.22, 0.22, 0.26]);
  }
  // Road centre dashes.
  for (const line of ROAD_LINES) {
    for (let a = -190; a < 190; a += 16) {
      r.drawSlab(line, a, 0.7, 4, 0.35, [0.9, 0.85, 0.6]);
      r.drawSlab(a, line, 4, 0.7, 0.35, [0.9, 0.85, 0.6]);
    }
  }
  r.drawSlab(0, (BEACH_Z + SEA_Z) / 2 + 4, WORLD_HALF * 2 + 40, SEA_Z - BEACH_Z + 12, 0.25, [0.93, 0.82, 0.6]);
  r.drawSlab(0, SEA_Z + 26, WORLD_HALF * 2 + 60, 60, 0.15, [0.1, 0.5, 0.65]);
  // Marina pier and the getaway boat.
  r.drawSlab(PLACES.boat.x, 178, 8, 26, 0.8, [0.5, 0.38, 0.26]);
  r.drawBox(PLACES.boat.x, 1.2, PLACES.boat.z, 0, 5, 1.6, 11, [0.92, 0.92, 0.95]);
  r.drawBox(PLACES.boat.x, 2.4, PLACES.boat.z - 1, 0, 3.4, 1.4, 4, [0.2, 0.55, 0.7]);

  for (const b of city.buildings) {
    r.drawBox(b.x, b.h / 2, b.z, 0, b.w, b.h, b.d, b.color);
    r.drawBox(b.x, b.h + 0.4, b.z, 0, b.w * 0.92, 0.8, b.d * 0.92, b.roof);
    // Lit windows: a few bright slabs on the sun-facing side.
    const rows = Math.max(1, Math.floor(b.h / 7));
    for (let row = 0; row < rows; row++) {
      const wy = 3 + row * 7;
      if (wy > b.h - 2) break;
      r.drawBox(b.x, wy, b.z + b.d / 2 + 0.15, 0, b.w * 0.7, 1.6, 0.3, [1.0, 0.9, 0.55]);
    }
  }
  for (const p of city.palms) {
    r.drawBox(p.x, p.h / 2, p.z, p.lean, 0.7, p.h, 0.7, [0.45, 0.32, 0.2]);
    r.drawBox(p.x, p.h + 0.4, p.z, 0.6, 5.2, 0.7, 1.4, [0.15, 0.55, 0.25]);
    r.drawBox(p.x, p.h + 0.4, p.z, -0.6, 1.4, 0.7, 5.2, [0.18, 0.6, 0.28]);
  }
  for (const lamp of city.lamps) {
    r.drawBox(lamp.x, 3, lamp.z, 0, 0.4, 6, 0.4, [0.15, 0.15, 0.18]);
    r.drawBox(lamp.x, 6.2, lamp.z, 0, 1.1, 0.5, 1.1, [1.0, 0.9, 0.6]);
  }
  for (const crate of city.crates) {
    r.drawBox(crate.x, crate.s / 2, crate.z, crate.rot, crate.s, crate.s, crate.s, [0.6, 0.45, 0.25]);
  }
  // Sun Coins spin and bob.
  city.coins.forEach((coin, i) => {
    if (coin.taken || (coinsTakenSet && coinsTakenSet.has(i))) return;
    const bob = Math.sin(time * 2 + coin.spin) * 0.35;
    r.drawBox(coin.x, 1.4 + bob, coin.z, time * 2 + coin.spin, 1.1, 1.1, 0.25, [1.0, 0.8, 0.15]);
  });
  void CAR_COLORS;
}

// Tall glowing beacon marking the current objective.
export function drawBeacon(renderer, x, z, time, color) {
  const pulse = 0.75 + Math.sin(time * 4) * 0.25;
  renderer.drawBox(x, 14, z, 0, 1.6, 28, 1.6, [color[0] * pulse, color[1] * pulse, color[2] * pulse]);
  renderer.drawBox(x, 0.6, z, time, 5, 0.5, 5, color);
}
