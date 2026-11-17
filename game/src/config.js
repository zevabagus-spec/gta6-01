// Solara Bay shared tuning, world layout and helpers. Every number the other
// modules need lives here so the city, the missions and the police all agree.
export const WORLD = { half: 150, bound: 146 };
export const ROADS = [-120, -60, 0, 60, 120];
export const ROAD_HALF = 5;
export const SPAWN = { x: 20, z: -128 };
export const INTERACT_RADIUS = 20;
export const MARKER_1 = { x: 24, z: -118 };
export const HIDEOUT = { x: -20, z: 120 };
export const SAVE_KEY = 'solara-bay-save-v1';
export const SHOT_SEED = 7;
export const MAX_WANTED = 5;
export const START_CASH = 250;
export const COIN_COUNT = 30;
export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 24;

// Five districts, each a rectangle with its own palette and building style.
export const DISTRICTS = [
  { name: 'Marina', x0: -150, z0: -150, x1: 150, z1: -90, ground: 0x9db8a6, tall: false, color: 0xf2e3c6, hMin: 8, hMax: 20 },
  { name: 'Downtown', x0: -60, z0: -90, x1: 60, z1: 60, ground: 0x8f9bb0, tall: true, color: 0x7fa8c9, hMin: 26, hMax: 64 },
  { name: 'Old Town', x0: -150, z0: -90, x1: -60, z1: 150, ground: 0xb09a7a, tall: false, color: 0xc98f5f, hMin: 8, hMax: 18 },
  { name: 'Harbor', x0: 60, z0: -90, x1: 150, z1: 60, ground: 0x7d8894, tall: false, color: 0x8a7f74, hMin: 8, hMax: 22 },
  { name: 'The Hills', x0: -60, z0: 60, x1: 150, z1: 150, ground: 0x8aa078, tall: false, color: 0xe8dcc0, hMin: 7, hMax: 14 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  return DISTRICTS[1];
}

// Deterministic RNG (mulberry32) so a seed always builds the same city.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const lerp = (a, b, t) => a + (b - a) * t;
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
