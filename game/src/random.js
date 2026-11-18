// Deterministic seeded random numbers so the city, traffic and
// pedestrians look identical on every load with the same seed.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return mulberry32(hash >>> 0);
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}
