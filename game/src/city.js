// Solmar Bay: a procedural sun-soaked grid city, built deterministically from
// a seed. Exports geometry specs (boxes + flat ground quads) for the
// renderer, collision boxes, road lines for traffic, named mission
// locations, and the 20 sun-coin spots.
import { clampNumber, distance2D, randomInt, randomRange, pickFrom } from './rng.js';

export const WORLD_HALF = 236;
export const ROAD_SPACING = 60;
export const ROAD_WIDTH = 14;
export const ROAD_LINES = [-210, -150, -90, -30, 30, 90, 150, 210];

const PALETTE = [
  [0.93, 0.82, 0.68], [0.88, 0.72, 0.58], [0.95, 0.88, 0.74], [0.78, 0.82, 0.86],
  [0.92, 0.68, 0.55], [0.72, 0.78, 0.72], [0.96, 0.78, 0.62], [0.82, 0.68, 0.78],
  [0.65, 0.75, 0.85], [0.90, 0.85, 0.60],
];
const ROOF_COLORS = [
  [0.62, 0.35, 0.28], [0.45, 0.45, 0.48], [0.35, 0.55, 0.60], [0.70, 0.45, 0.30],
];
const WINDOW_LIT = [1.0, 0.85, 0.45];
const WINDOW_DARK = [0.25, 0.32, 0.42];

function box(x, y, z, sx, sy, sz, ry, color, glow) {
  return { x, y, z, sx, sy, sz, ry: ry || 0, color, glow: glow || 0 };
}

function groundQuad(x, z, sx, sz, color, glow, y) {
  return { x, z, sx, sz, color, glow: glow || 0, y: y === undefined ? 0.02 : y };
}

export function buildCity(rand) {
  const boxes = [];
  const ground = [];
  const colliders = [];
  const palms = [];
  const lamps = [];
  const windowQuads = [];

  // Base ground: warm grass-concrete, then beach + water on the west edge.
  // Heights are staggered (base 0, paint 0.02, dashes 0.05) so overlapping
  // ground quads never z-fight.
  ground.push(groundQuad(10, 0, 472, 472, [0.55, 0.62, 0.42], 0, 0));
  ground.push(groundQuad(-224, 0, 26, 472, [0.92, 0.83, 0.60], 0, 0.01)); // sand
  ground.push(groundQuad(-240, 0, 8, 472, [0.15, 0.45, 0.65], 0.6, 0.005)); // water
  ground.push(groundQuad(-216, 0, 6, 472, [0.80, 0.76, 0.68], 0, 0.03)); // promenade

  // Roads: dark asphalt strips both ways + center dashes. East-west roads
  // stop at the coastal road so no asphalt crosses the sand or the water.
  ROAD_LINES.forEach((line) => {
    ground.push(groundQuad(line, 0, ROAD_WIDTH, 472, [0.22, 0.22, 0.25], 0, 0.02));
    ground.push(groundQuad(18, line, 456, ROAD_WIDTH, [0.22, 0.22, 0.25], 0, 0.02));
  });
  ROAD_LINES.forEach((line) => {
    for (let t = -228; t <= 228; t += 12) {
      ground.push(groundQuad(line, t, 0.7, 4, [0.92, 0.85, 0.55], 0, 0.05));
    }
    for (let t = -204; t <= 228; t += 12) {
      ground.push(groundQuad(t, line, 4, 0.7, [0.92, 0.85, 0.55], 0, 0.05));
    }
  });

  // City blocks: sidewalks, buildings, alleys.
  const blockCenters = [-180, -120, -60, 0, 60, 120, 180];
  blockCenters.forEach((bx) => {
    blockCenters.forEach((bz) => {
      ground.push(groundQuad(bx, bz, 46, 46, [0.74, 0.70, 0.62]));
      const downtown = Math.abs(bx) <= 60 && Math.abs(bz) <= 60;
      const count = downtown ? randomInt(rand, 2, 3) : randomInt(rand, 1, 4);
      for (let i = 0; i < count; i += 1) {
        const cols = count === 1 ? 1 : 2;
        const ox = cols === 1 ? 0 : (i % 2 === 0 ? -11 : 11);
        const oz = cols === 1 ? 0 : (i < 2 ? -11 : 11);
        const w = cols === 1 ? 34 : 20;
        const d = count <= 2 ? 34 : 20;
        const h = downtown ? randomRange(rand, 26, 62) : randomRange(rand, 8, 26);
        const cx = bx + ox;
        const cz = bz + oz;
        const color = pickFrom(rand, PALETTE);
        boxes.push(box(cx, h / 2, cz, w, h, d, 0, color));
        boxes.push(box(cx, h + 0.5, cz, w * 0.92, 1, d * 0.92, 0, pickFrom(rand, ROOF_COLORS)));
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        // Window grid on the two street-facing sides, every other floor:
        // dense enough to read as windows from the chase camera, light
        // enough to keep the static buffer small.
        const floors = Math.max(1, Math.floor(h / 5));
        const colsW = Math.max(2, Math.min(5, Math.floor(w / 5)));
        for (let f = 0; f < floors; f += 2) {
          for (let c = 0; c < colsW; c += 1) {
            const lit = rand() < 0.3;
            const wy = 3 + f * 5;
            const wx = cx - w / 2 + 3 + c * ((w - 5) / Math.max(1, colsW - 1));
            windowQuads.push({ x: wx, y: wy, z: cz + d / 2 + 0.15, w: 2.2, h: 2.4, facing: 'south', color: lit ? WINDOW_LIT : WINDOW_DARK, glow: lit ? 0.7 : 0 });
            windowQuads.push({ x: wx, y: wy, z: cz - d / 2 - 0.15, w: 2.2, h: 2.4, facing: 'north', color: lit ? WINDOW_LIT : WINDOW_DARK, glow: lit ? 0.7 : 0 });
          }
        }
        if (rand() < 0.5) boxes.push(box(cx + w * 0.3, h + 2, cz - d * 0.25, 3, 3, 3, 0, [0.6, 0.6, 0.62]));
      }
      // Corner palms on some blocks.
      if (rand() < 0.6) {
        const px = bx + pickFrom(rand, [-19, 19]);
        const pz = bz + pickFrom(rand, [-19, 19]);
        addPalm(boxes, palms, px, pz, rand);
      }
    });
  });

  // Landmarks: Solmar Tower, lighthouse, market hall, clinic, station, garage.
  addTower(boxes, colliders, windowQuads, rand);
  addLighthouse(boxes, colliders);
  addLandmarkHall(boxes, colliders, -60, -180, [0.85, 0.55, 0.35], 'MARKET');
  addLandmarkHall(boxes, colliders, 180, -60, [0.90, 0.90, 0.92], 'CLINIC');
  addLandmarkHall(boxes, colliders, 60, 180, [0.35, 0.50, 0.75], 'STATION');
  addLandmarkHall(boxes, colliders, -180, 60, [0.75, 0.60, 0.30], 'GARAGE');

  // Street lamps along every road, palms along the promenade.
  ROAD_LINES.forEach((line) => {
    for (let t = -210; t <= 210; t += 60) {
      addLamp(boxes, lamps, line + 9, t + 9);
      addLamp(boxes, lamps, t + 9, line - 9);
    }
  });
  for (let z = -210; z <= 210; z += 30) addPalm(boxes, palms, -216, z, rand);

  // Docks jutting into the water.
  [-120, -30, 60, 150].forEach((z) => {
    ground.push(groundQuad(-232, z, 10, 8, [0.55, 0.42, 0.30]));
    boxes.push(box(-236, 1.2, z, 1.5, 2.4, 1.5, 0, [0.5, 0.38, 0.26]));
  });

  // Every target sits on an intersection or open promenade — never inside a
  // building footprint — so each objective is always reachable on foot.
  const locations = {
    hideout: { x: -30, z: 30, name: 'Mara\u2019s Hideout' },
    ilsaOffice: { x: 30, z: -30, name: 'Ilsa\u2019s Office' },
    garage: { x: -150, z: 90, name: 'Rook\u2019s Garage' },
    warehouse: { x: 150, z: 150, name: 'Harbor Warehouse' },
    docks: { x: -222, z: -30, name: 'Solmar Docks' },
    bankFront: { x: 90, z: -90, name: 'Bay Trust Bank' },
    clinic: { x: 150, z: -90, name: 'Marina Clinic' },
    station: { x: 90, z: 210, name: 'Police Station' },
    market: { x: -90, z: -150, name: 'Old Market' },
    towerPlaza: { x: 30, z: 30, name: 'Tower Plaza' },
  };

  const coinSpots = buildCoinSpots(rand);
  return { boxes, ground, windowQuads, colliders, palms, lamps, locations, coinSpots };
}

function addPalm(boxes, palms, x, z, rand) {
  const h = randomRange(rand, 7, 10);
  boxes.push(box(x, h / 2, z, 0.9, h, 0.9, 0, [0.45, 0.32, 0.20]));
  const leaf = [0.20, 0.55, 0.25];
  boxes.push(box(x, h + 0.6, z, 5.5, 0.5, 1.2, 0, leaf));
  boxes.push(box(x, h + 0.6, z, 1.2, 0.5, 5.5, 0, leaf));
  boxes.push(box(x, h + 1.0, z, 3.6, 0.5, 3.6, 0.78, leaf));
  palms.push({ x, z });
}

function addLamp(boxes, lamps, x, z) {
  boxes.push(box(x, 3, z, 0.5, 6, 0.5, 0, [0.25, 0.25, 0.28]));
  boxes.push(box(x, 6.3, z, 1.4, 0.6, 1.4, 0, [1.0, 0.9, 0.55], 0.9));
  lamps.push({ x, z });
}

function addTower(boxes, colliders, windowQuads, rand) {
  const cx = 0;
  const cz = 0;
  const h = 88;
  boxes.push(box(cx, h / 2, cz, 26, h, 26, 0, [0.70, 0.78, 0.86]));
  boxes.push(box(cx, h + 2, cz, 18, 4, 18, 0, [0.55, 0.62, 0.72]));
  boxes.push(box(cx, h + 5, cz, 2, 4, 2, 0, [1.0, 0.4, 0.3], 1.0));
  colliders.push({ minX: cx - 13, maxX: cx + 13, minZ: cz - 13, maxZ: cz + 13 });
  for (let f = 0; f < 16; f += 1) {
    for (let c = 0; c < 5; c += 1) {
      const lit = rand() < 0.35;
      const wx = cx - 10 + c * 5;
      windowQuads.push({ x: wx, y: 5 + f * 5, z: cz + 13.15, w: 2.6, h: 2.6, facing: 'south', color: lit ? WINDOW_LIT : WINDOW_DARK, glow: lit ? 0.7 : 0 });
    }
  }
}

function addLighthouse(boxes, colliders) {
  const x = -222;
  const z = 195;
  boxes.push(box(x, 9, z, 5, 18, 5, 0, [0.94, 0.92, 0.88]));
  boxes.push(box(x, 7, z, 5.4, 3, 5.4, 0, [0.85, 0.30, 0.25]));
  boxes.push(box(x, 14, z, 5.4, 3, 5.4, 0, [0.85, 0.30, 0.25]));
  boxes.push(box(x, 19.5, z, 4, 3, 4, 0, [1.0, 0.95, 0.6], 1.0));
  boxes.push(box(x, 21.5, z, 5, 1.5, 5, 0, [0.25, 0.25, 0.28]));
  colliders.push({ minX: x - 3, maxX: x + 3, minZ: z - 3, maxZ: z + 3 });
}

function addLandmarkHall(boxes, colliders, bx, bz, color, label) {
  void label;
  boxes.push(box(bx, 5, bz, 30, 10, 22, 0, color));
  boxes.push(box(bx, 10.6, bz, 32, 1.2, 24, 0, [0.30, 0.30, 0.34]));
  boxes.push(box(bx, 12, bz, 8, 3, 6, 0, [0.95, 0.85, 0.55], 0.5));
  colliders.push({ minX: bx - 15, maxX: bx + 15, minZ: bz - 11, maxZ: bz + 11 });
}

function buildCoinSpots(rand) {
  const spots = [];
  const candidates = [];
  [-180, -120, -60, 0, 60, 120, 180].forEach((bx) => {
    [-180, -120, -60, 0, 60, 120, 180].forEach((bz) => {
      candidates.push([bx + 19, bz + 19], [bx - 19, bz - 19], [bx + 19, bz - 19], [bx - 19, bz + 19]);
    });
  });
  candidates.push([-216, -180], [-216, -60], [-216, 90], [-216, 180], [0, 26], [210, 210]);
  const shuffled = candidates.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  for (let i = 0; i < 20; i += 1) {
    spots.push({ x: shuffled[i][0], z: shuffled[i][1], id: i });
  }
  return spots;
}

// Push a circle out of every overlapping building collider, then clamp to
// the world. Returns the corrected position.
export function resolveCircleCollision(x, z, radius, colliders) {
  let px = clampNumber(x, -WORLD_HALF, WORLD_HALF);
  let pz = clampNumber(z, -WORLD_HALF, WORLD_HALF);
  for (let pass = 0; pass < 3; pass += 1) {
    for (const c of colliders) {
      const nearestX = clampNumber(px, c.minX, c.maxX);
      const nearestZ = clampNumber(pz, c.minZ, c.maxZ);
      const dx = px - nearestX;
      const dz = pz - nearestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;
      if (distSq < 1e-8) {
        const pushLeft = px - (c.minX - radius);
        const pushRight = (c.maxX + radius) - px;
        const pushUp = pz - (c.minZ - radius);
        const pushDown = (c.maxZ + radius) - pz;
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) px = c.minX - radius;
        else if (m === pushRight) px = c.maxX + radius;
        else if (m === pushUp) pz = c.minZ - radius;
        else pz = c.maxZ + radius;
      } else {
        const dist = Math.sqrt(distSq);
        px = nearestX + (dx / dist) * radius;
        pz = nearestZ + (dz / dist) * radius;
      }
    }
  }
  return [clampNumber(px, -WORLD_HALF, WORLD_HALF), clampNumber(pz, -WORLD_HALF, WORLD_HALF)];
}

export function circleHitsCollider(x, z, radius, colliders) {
  for (const c of colliders) {
    const nearestX = clampNumber(x, c.minX, c.maxX);
    const nearestZ = clampNumber(z, c.minZ, c.maxZ);
    const dx = x - nearestX;
    const dz = z - nearestZ;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

export function districtAt(x, z) {
  if (x < -200) return 'Solmar Beach';
  if (Math.abs(x) <= 60 && Math.abs(z) <= 60) return 'Downtown';
  if (z < -120) return 'Old Town';
  if (z > 120) return 'Harbor South';
  if (x > 120) return 'Marina East';
  if (x < -120) return 'West End';
  return 'Midtown';
}

export function nearestRoadLine(value) {
  let best = ROAD_LINES[0];
  let bestDist = Math.abs(value - best);
  for (const line of ROAD_LINES) {
    const d = Math.abs(value - line);
    if (d < bestDist) { best = line; bestDist = d; }
  }
  return best;
}

export function distanceToPoint(ax, az, bx, bz) {
  return distance2D(ax, az, bx, bz);
}
