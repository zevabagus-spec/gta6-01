// Solara Bay — shared tuning, palette, districts and mission data.
// Every number the rest of the game agrees on lives here so a single
// edit retunes the whole city. All names, places and story beats are
// original inventions for this game.

export const WORLD_HALF = 200;
export const BEACH_Z = 168;
export const SEA_Z = 196;
export const SAVE_KEY = 'solara-bay-save-v1';
export const COIN_COUNT = 30;
export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 24;
export const START_CASH = 0;
export const START_HEALTH = 100;
export const START_AMMO = 12;
export const MAX_AMMO = 12;
export const RAM_COOLDOWN = 1.2;
export const WANTED_DECAY_SECONDS = 22;
export const AUTOSAVE_SECONDS = 15;

// Sun-soaked late-afternoon palette: warm sand, teal sea, coral roofs.
export const SKY_TOP = [0.36, 0.62, 0.86];
export const SKY_HORIZON = [1.0, 0.78, 0.55];
export const FOG_COLOR = [0.98, 0.8, 0.62];
export const SUN_DIR = [0.45, 0.72, 0.35];

export const DISTRICTS = [
  { name: 'Marina Quarter', cx: -120, cz: 120, r: 78, tint: [0.92, 0.62, 0.45] },
  { name: 'Palm Heights', cx: 120, cz: 120, r: 78, tint: [0.95, 0.8, 0.5] },
  { name: 'Old Market', cx: -120, cz: -120, r: 78, tint: [0.85, 0.55, 0.6] },
  { name: 'Glass Towers', cx: 120, cz: -120, r: 78, tint: [0.6, 0.75, 0.9] },
  { name: 'Downtown Solara', cx: 0, cz: 0, r: 95, tint: [0.9, 0.7, 0.55] },
];

export function districtAt(x, z) {
  let best = DISTRICTS[4];
  let bestD = Infinity;
  for (const d of DISTRICTS) {
    const dx = x - d.cx;
    const dz = z - d.cz;
    const dist = Math.sqrt(dx * dx + dz * dz) - d.r;
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best.name;
}

// Key places. Coordinates are world units; y is always ground level.
export const PLACES = {
  spawn: { x: 0, z: 32 },
  garage: { x: -56, z: 32 },
  sunrayParked: { x: -48, z: 32 },
  diner: { x: 32, z: -8 },
  chopShop: { x: -96, z: -56 },
  taxiStand: { x: 32, z: -56 },
  yard: { x: 96, z: 56 },
  hideout: { x: -160, z: 136 },
  warehouse: { x: 160, z: -40 },
  boat: { x: 24, z: 186 },
};

export const MISSIONS = [
  {
    title: 'Welcome to Solara',
    giver: 'Dario Voss',
    brief: 'Dario runs the garage on Coral Row. Meet him, then take the gold Sunray coupe to Mara at the diner.',
    reward: 250,
  },
  {
    title: 'Hot Property',
    giver: 'Dario Voss',
    brief: 'Dario needs a fresh car with no questions attached. Steal any car on the street and deliver it to the chop shop.',
    reward: 200,
  },
  {
    title: 'Fares on the Clock',
    giver: 'Mara Quinn',
    brief: 'Mara’s cab contact is short a driver. Pick up three fares and drop each one off before the timer runs out.',
    reward: 240,
  },
  {
    title: 'Rivals at the Yard',
    giver: 'Mara Quinn',
    brief: 'The Rust Vipers are muscling in on the freight yard. Go to the yard, send all five packing, then meet Mara.',
    reward: 200,
  },
  {
    title: 'Heat Wave',
    giver: 'Dario Voss',
    brief: 'The whole bay is looking for you. Shake the patrols and reach the hideout with a clean record.',
    reward: 300,
  },
  {
    title: 'The Solara Job',
    giver: 'Mara Quinn',
    brief: 'One last score: grab the three loot bags from the warehouse and escape to the boat at the marina. Do not get caught.',
    reward: 680,
  },
];

export const CAR_COLORS = [
  [0.75, 0.16, 0.14], [0.15, 0.3, 0.65], [0.9, 0.85, 0.8], [0.2, 0.2, 0.24],
  [0.15, 0.55, 0.35], [0.85, 0.55, 0.1], [0.55, 0.25, 0.6], [0.75, 0.75, 0.78],
  [0.1, 0.5, 0.55], [0.9, 0.7, 0.15], [0.4, 0.35, 0.3], [0.25, 0.65, 0.75],
];

export const PED_SHIRTS = [
  [0.9, 0.3, 0.25], [0.25, 0.5, 0.9], [0.95, 0.8, 0.3], [0.3, 0.7, 0.4],
  [0.85, 0.5, 0.75], [0.4, 0.8, 0.85], [0.95, 0.6, 0.2], [0.5, 0.45, 0.85],
];

export const CONTROLS_TEXT = 'WASD move / drive · Mouse drag look · Click punch / shoot · 1 fists · 2 pistol · F enter / steal car · E interact · Shift sprint · R reload · M music · P pause';
