// Solara Bay — the city itself. A seeded, deterministic grid: streets every
// 40 units, five districts with their own building heights and palettes, a
// Marina waterfront to the west, palms, lamps, billboards and clouds. Builds
// one static Mesh (drawn in a single call) plus the collision boxes, the
// traffic loops, the Sun Coin spots and the pickup spots the game uses.
import { CFG, DISTRICTS, COIN_SPOTS, PICKUP_SPOTS } from './config.js';
import { mulberry32 } from './math3d.js';
import { newTriList, pushBox, pushFlat } from './engine.js';

function shade(rgb, f) { return [rgb[0] * f, rgb[1] * f, rgb[2] * f]; }
function jitter(rng, rgb, amt) {
  const f = 1 - amt / 2 + rng() * amt;
  return [rgb[0] * f, rgb[1] * f, rgb[2] * f];
}

export function buildCity(renderer) {
  const rng = mulberry32(7); // fixed seed: the same city on every load
  const list = newTriList();
  const colliders = []; // {x0,z0,x1,z1} building footprints, for collision
  const H = CFG.worldHalf;

  // Ground: grass-green base, then the beach and the sea west of the Marina.
  pushFlat(list, 0, 0, H * 2 + 160, H * 2 + 160, -0.05, [0.42, 0.62, 0.35]);
  pushFlat(list, -H - 30, 0, 60, H * 2 + 160, 0.0, [0.93, 0.82, 0.6]); // sand
  pushFlat(list, -H - 90, 0, 120, H * 2 + 160, 0.02, [0.15, 0.45, 0.65]); // sea
  // Distant skyline silhouettes outside the playable area, for depth.
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2;
    const r = 300 + rng() * 90;
    const bx = Math.cos(ang) * r, bz = Math.sin(ang) * r;
    if (bx < -H - 20) continue; // keep the sea horizon clean
    const h = 25 + rng() * 55;
    pushBox(list, bx, h / 2 - 1, bz, 22 + rng() * 18, h, 22 + rng() * 18,
      shade([0.55, 0.5, 0.55], 0.8 + rng() * 0.3));
  }
  // A few flat white clouds drifting high above the city.
  for (let i = 0; i < 9; i++) {
    const cx = -180 + rng() * 360, cz = -180 + rng() * 360, cy = 70 + rng() * 25;
    pushBox(list, cx, cy, cz, 26 + rng() * 22, 3, 10 + rng() * 8, [0.98, 0.97, 0.95]);
  }
  // The low sun disc, west over the sea.
  pushBox(list, -260, 55, -60, 26, 26, 1, [1.0, 0.85, 0.45], [1.0, 0.9, 0.55]);

  // Streets: asphalt strips on every grid line, sidewalks beside them.
  const lines = [];
  for (let v = -160; v <= 160; v += CFG.streetGap) lines.push(v);
  for (const v of lines) {
    pushFlat(list, v, 0, CFG.streetHalfWidth * 2, H * 2, 0.03, [0.28, 0.28, 0.3]);
    pushFlat(list, 0, v, H * 2, CFG.streetHalfWidth * 2, 0.03, [0.28, 0.28, 0.3]);
    pushFlat(list, v, 0, CFG.streetHalfWidth * 2 + 7, H * 2, 0.02, [0.68, 0.66, 0.62]);
    pushFlat(list, 0, v, H * 2, CFG.streetHalfWidth * 2 + 7, 0.02, [0.68, 0.66, 0.62]);
    // Centre dashes down each street.
    for (let d = -180; d <= 180; d += 16) {
      pushFlat(list, v, d, 0.7, 3.5, 0.05, [0.9, 0.85, 0.4]);
      pushFlat(list, d, v, 3.5, 0.7, 0.05, [0.9, 0.85, 0.4]);
    }
  }
  // City square plaza at the centre, with a fountain block off to one side
  // so the plaza's middle stays clear for mission drop-offs.
  pushFlat(list, 0, 0, 30, 30, 0.04, [0.78, 0.72, 0.62]);
  pushBox(list, -10, 1.2, -10, 8, 2.4, 8, [0.3, 0.55, 0.75], [0.55, 0.8, 0.95]);

  // Buildings, one or two per block. Blocks sit BETWEEN streets, so block
  // centres are offset 20 from the street lines and never overlap a road.
  const palettes = {
    tall: [[0.72, 0.68, 0.75], [0.55, 0.62, 0.72], [0.8, 0.72, 0.6], [0.6, 0.66, 0.6]],
    mid: [[0.85, 0.66, 0.48], [0.78, 0.6, 0.55], [0.7, 0.62, 0.5], [0.62, 0.68, 0.62]],
    low: [[0.95, 0.85, 0.68], [0.9, 0.75, 0.6], [0.85, 0.8, 0.7], [0.75, 0.82, 0.85]],
    houses: [[0.9, 0.7, 0.55], [0.85, 0.6, 0.5], [0.7, 0.75, 0.6], [0.8, 0.72, 0.6]],
  };
  for (let bx = -160; bx < 180; bx += CFG.streetGap) {
    for (let bz = -160; bz < 180; bz += CFG.streetGap) {
      const cx = bx + 20, cz = bz + 20;
      if (Math.abs(cx) < 22 && Math.abs(cz) < 22) continue; // keep the square clear
      const district = DISTRICTS.find((d) => d.test(cx, cz)) || DISTRICTS[1];
      const pal = palettes[district.skyline] || palettes.mid;
      const count = district.skyline === 'tall' ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const ox = count === 1 ? 0 : (k === 0 ? -8 : 8);
        const oz = count === 1 ? 0 : (k === 0 ? -8 : 8);
        const w = 12 + rng() * 8, d = 12 + rng() * 8;
        let h;
        if (district.skyline === 'tall') h = 22 + rng() * 26;
        else if (district.skyline === 'houses') h = 4 + rng() * 4;
        else if (district.skyline === 'low') h = 6 + rng() * 7;
        else h = 9 + rng() * 12;
        const col = jitter(rng, pal[Math.floor(rng() * pal.length)], 0.25);
        const top = shade(col, 1.25);
        pushBox(list, cx + ox, h / 2, cz + oz, w, h, d, col, top);
        // Rooftop box and a window band so tall buildings read as towers.
        pushBox(list, cx + ox, h + 0.8, cz + oz, w * 0.35, 1.6, d * 0.35, shade(col, 0.7));
        if (h > 12) {
          pushBox(list, cx + ox, h * 0.62, cz + oz + d / 2 + 0.15, w * 0.8, h * 0.3, 0.3,
            shade(col, 0.55));
          pushBox(list, cx + ox + w / 2 + 0.15, h * 0.62, cz + oz, 0.3, h * 0.3, d * 0.8,
            shade(col, 0.6));
        }
        colliders.push({ x0: cx + ox - w / 2, z0: cz + oz - d / 2, x1: cx + ox + w / 2, z1: cz + oz + d / 2 });
      }
    }
  }

  // Palms along the Marina boardwalk, lamps along the main streets.
  for (let z = -180; z <= 180; z += 20) {
    pushBox(list, -192, 3, z, 0.8, 6, 0.8, [0.45, 0.32, 0.2]);
    pushBox(list, -192, 6.8, z, 5, 2.2, 5, [0.25, 0.55, 0.3], [0.4, 0.7, 0.35]);
  }
  // Lamps sit on sidewalk corners (offset from both street lines) so they
  // never stand in a driving lane.
  for (let v = -160; v <= 160; v += 80) {
    for (let d = -160; d <= 160; d += 40) {
      pushBox(list, v + 7, 2.5, d + 7, 0.4, 5, 0.4, [0.2, 0.2, 0.22]);
      pushBox(list, v + 7, 5.2, d + 7, 1.6, 0.7, 1.6, [1.0, 0.9, 0.55], [1.0, 0.95, 0.7]);
      pushBox(list, d + 7, 2.5, v + 7, 0.4, 5, 0.4, [0.2, 0.2, 0.22]);
      pushBox(list, d + 7, 5.2, v + 7, 1.6, 0.7, 1.6, [1.0, 0.9, 0.55], [1.0, 0.95, 0.7]);
    }
  }
  // Downtown billboards on tall poles.
  const ads = [[0.95, 0.3, 0.35], [0.2, 0.6, 0.9], [0.95, 0.75, 0.2]];
  [[-40, -40], [40, 40], [0, -80]].forEach(([x, z], i) => {
    pushBox(list, x, 6, z, 1, 12, 1, [0.25, 0.25, 0.28]);
    pushBox(list, x, 14, z, 14, 7, 0.6, ads[i % 3], ads[i % 3]);
  });

  const mesh = renderer.makeMesh(list);

  // Traffic loops: rectangles around blocks, driven on street centrelines.
  const loops = [];
  for (let bx = -160; bx <= 120; bx += 80) {
    for (let bz = -160; bz <= 120; bz += 80) {
      loops.push([
        [bx, bz], [bx + 80, bz], [bx + 80, bz + 80], [bx, bz + 80],
      ]);
    }
  }
  // Sun Coins and pickups, as placed in config.
  const coins = COIN_SPOTS.slice(0, CFG.coinCount).map(([x, z]) => ({ x, z, taken: false, spin: Math.random() * 6 }));
  const pickups = PICKUP_SPOTS.map((p) => ({ ...p, x: p.pos[0], z: p.pos[1], active: true, timer: 0 }));
  return { mesh, colliders, loops, coins, pickups };
}

// Circle (player / car) vs building AABB: push the circle out, return the
// corrected position. Used for both on-foot and driving collision.
export function collideCircleBox(x, z, r, colliders) {
  let nx = x, nz = z;
  for (const b of colliders) {
    const cx = Math.max(b.x0, Math.min(nx, b.x1));
    const cz = Math.max(b.z0, Math.min(nz, b.z1));
    const dx = nx - cx, dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      nx = cx + (dx / d) * r; nz = cz + (dz / d) * r;
    } else if (d2 <= 0.0001) {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = nx - b.x0, pr = b.x1 - nx, pt = nz - b.z0, pb = b.z1 - nz;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) nx = b.x0 - r; else if (m === pr) nx = b.x1 + r;
      else if (m === pt) nz = b.z0 - r; else nz = b.z1 + r;
    }
  }
  return [nx, nz];
}
export function pointInBox(x, z, b, pad) {
  return x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;
}
