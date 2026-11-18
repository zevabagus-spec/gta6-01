// Seeded random numbers so the city, traffic and screenshot staging are
// deterministic for a given seed. Mulberry32: small, fast, repeatable.
export function createSeededRandom(seed) {
  let state = (Number.isFinite(seed) ? seed : 1) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomRange(rand, min, max) {
  if (max < min) {
    const tmp = min;
    min = max;
    max = tmp;
  }
  return min + rand() * (max - min);
}

export function randomInt(rand, min, max) {
  return Math.floor(randomRange(rand, min, max + 1));
}

export function pickFrom(rand, items) {
  if (!items || items.length === 0) return undefined;
  return items[Math.floor(rand() * items.length)];
}

export function shuffleCopy(rand, items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerpNumber(a, b, t) {
  return a + (b - a) * clampNumber(t, 0, 1);
}

// Shortest signed turn from angle a to angle b, in radians.
export function angleDifference(a, b) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function turnToward(current, target, maxStep) {
  const diff = angleDifference(current, target);
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

export function distance2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}
