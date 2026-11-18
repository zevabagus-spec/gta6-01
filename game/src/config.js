// Solara Bay — game configuration: world size, districts, story missions,
// vehicle models, pickups and tuning. All names, places and people are
// original inventions for this game; nothing here comes from any other game.
export const CFG = {
  worldHalf: 200, // playable area is x,z in [-200, 200]
  streetGap: 40, // distance between parallel streets
  streetHalfWidth: 5,
  gravity: 30,
  walkSpeed: 6,
  runSpeed: 9.5,
  playerRadius: 0.7,
  maxHealth: 100,
  maxArmour: 100,
  pistolAmmo: 12,
  pistolRange: 34,
  pistolDamage: 34,
  punchRange: 2.4,
  punchDamage: 20,
  punchCooldown: 0.45,
  shotCooldown: 0.28,
  coinCount: 30,
  coinValue: 25,
  startCash: 250,
  saveKey: 'solara-bay-save-v1',
  autosaveSeconds: 15,
  wantedDecaySeconds: 25,
  copBustSeconds: 1.0,
  maxPoliceCars: 4,
  maxCops: 3,
  trafficCount: 14,
  pedCount: 24,
  parkedCount: 10,
};

// Five districts of Solara Bay, each with its own look and building style.
// districtAt(x, z) returns the district name for a map position.
export const DISTRICTS = [
  { name: 'Marina', test: (x, z) => x < -100, skyline: 'low', palette: [0.96, 0.87, 0.72] },
  { name: 'Downtown', test: (x, z) => x >= -100 && x < 60 && z >= -60 && z < 80, skyline: 'tall', palette: [0.62, 0.68, 0.78] },
  { name: 'Old Town', test: (x, z) => x >= 60 && z < -60, skyline: 'mid', palette: [0.85, 0.68, 0.5] },
  { name: 'Harbor', test: (x, z) => x >= 60 && z >= 80, skyline: 'mid', palette: [0.55, 0.62, 0.6] },
  { name: 'The Hills', test: (x, z) => z >= 80 && x < 60, skyline: 'houses', palette: [0.78, 0.72, 0.6] },
];
export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d.name;
  return 'Downtown';
}

// Vehicle models: name, top speed, acceleration, handling, body colour.
// The Sunray is the gold sportscar at the heart of mission 2.
export const CAR_MODELS = {
  sedan: { name: 'Coral Sedan', topSpeed: 26, accel: 14, grip: 2.6, color: [0.75, 0.3, 0.28] },
  coupe: { name: 'Breeze Coupe', topSpeed: 29, accel: 16, grip: 3.0, color: [0.25, 0.45, 0.75] },
  pickup: { name: 'Dune Pickup', topSpeed: 24, accel: 12, grip: 2.2, color: [0.85, 0.6, 0.25] },
  van: { name: 'Harbor Van', topSpeed: 21, accel: 10, grip: 2.0, color: [0.8, 0.8, 0.78] },
  taxi: { name: 'Solara Cab', topSpeed: 27, accel: 15, grip: 2.8, color: [0.95, 0.8, 0.15] },
  sunray: { name: 'Sunray GT', topSpeed: 35, accel: 20, grip: 3.6, color: [0.95, 0.75, 0.15] },
  police: { name: 'Bay Patrol', topSpeed: 32, accel: 19, grip: 3.4, color: [0.12, 0.14, 0.2] },
};

// The Solara Job — six story missions for courier Dario Voss and fixer Mara Quinn.
export const MISSIONS = [
  {
    id: 1, title: 'First Pickup', reward: 50,
    briefing: 'Mara Quinn needs a package picked up at the Marina pier. Walk to the gold marker and press E.',
    steps: [
      { type: 'goto', pos: [-168, 0], radius: 4, text: 'Go to the Marina pier marker' },
      { type: 'interact', pos: [-168, 0], radius: 4, text: 'Press E to pick up the package' },
      { type: 'goto', pos: [-40, 40], radius: 5, text: 'Deliver the package to Mara at the Downtown plaza' },
      { type: 'interact', pos: [-40, 40], radius: 5, text: 'Press E to hand over the package' },
    ],
  },
  {
    id: 2, title: 'The Sunray', reward: 120,
    briefing: 'A gold Sunray GT is parked on Coral Row. Steal it and bring it to the garage in Old Town. The owner will not be pleased.',
    steps: [
      { type: 'goto', pos: [100, -44], radius: 8, text: 'Find the gold Sunray GT on Coral Row' },
      { type: 'enterCar', pos: [100, -44], radius: 6, text: 'Press E beside the Sunray to steal it' },
      { type: 'deliverCar', pos: [120, -80], radius: 7, text: 'Drive the Sunray to the Old Town garage' },
    ],
  },
  {
    id: 3, title: 'Three Fares', reward: 150,
    briefing: 'Mara has three clients who pay for fast rides. Pick each one up and drop them off before the timer runs out.',
    steps: [
      { type: 'taxiPickup', pos: [-20, -80], radius: 6, text: 'Pick up fare 1 of 3 near the north plaza', fare: 0 },
      { type: 'taxiDrop', pos: [140, 40], radius: 7, text: 'Drop fare 1 at the Harbor gate', fare: 0, time: 75 },
      { type: 'taxiPickup', pos: [140, 40], radius: 6, text: 'Pick up fare 2 of 3 at the Harbor gate', fare: 1 },
      { type: 'taxiDrop', pos: [-140, 120], radius: 7, text: 'Drop fare 2 at the Marina boardwalk', fare: 1, time: 75 },
      { type: 'taxiPickup', pos: [-140, 120], radius: 6, text: 'Pick up fare 3 of 3 at the boardwalk', fare: 2 },
      { type: 'taxiDrop', pos: [0, 0], radius: 7, text: 'Drop fare 3 at the city square', fare: 2, time: 75 },
    ],
  },
  {
    id: 4, title: 'Harbor Heat', reward: 200,
    briefing: 'Rival couriers from the Harbor crew ambushed Mara\'s driver. Take all five of them down. Bring the pistol — press F to fire, Space to punch.',
    steps: [
      { type: 'goto', pos: [140, 140], radius: 10, text: 'Reach the Harbor docks' },
      { type: 'kill', pos: [140, 140], radius: 26, text: 'Defeat the 5 Harbor rivals', count: 5 },
      { type: 'goto', pos: [80, 80], radius: 6, text: 'Meet Mara at the Harbor overpass' },
      { type: 'interact', pos: [80, 80], radius: 5, text: 'Press E to report to Mara' },
    ],
  },
  {
    id: 5, title: 'The Getaway', reward: 180,
    briefing: 'The Bay Patrol is on to you — wanted level 4. Lose them by reaching the Marina safehouse. Do not get busted.',
    steps: [
      { type: 'escape', pos: [-160, 140], radius: 8, text: 'Reach the Marina safehouse at wanted level 4', wanted: 4, time: 70 },
    ],
  },
  {
    id: 6, title: 'The Marina Heist', reward: 500,
    briefing: 'The big one: three loot bags are stashed around the Marina vault. Grab them all, then reach the boat at wanted level 5.',
    steps: [
      { type: 'collect', pos: [-160, -40], radius: 26, text: 'Collect loot bag 1 of 3', count: 3 },
      { type: 'escape', pos: [-185, 160], radius: 8, text: 'Reach the getaway boat at wanted level 5', wanted: 5, time: 90 },
    ],
  },
];

// Fixed collectible / pickup placements. Every spot sits on a street line
// (x or z in -160..160 step 40) or on the plaza, never inside a building.
export const COIN_SPOTS = [
  [-180, -160], [-180, -80], [-180, 0], [-180, 80], [-180, 160],
  [-140, -120], [-140, -40], [-140, 40], [-140, 120],
  [-120, -160], [-120, 0], [-120, 120],
  [-80, -120], [-80, -40], [-80, 80], [-80, 160],
  [-40, -160], [-40, -80], [-40, 80],
  [0, -120], [0, -40], [0, 80], [0, 160],
  [40, -160], [40, -80], [40, 120],
  [80, -120], [80, 40], [80, 160], [120, -80],
];
export const PICKUP_SPOTS = [
  { kind: 'health', pos: [-160, -120] }, { kind: 'health', pos: [20, 120] },
  { kind: 'health', pos: [120, -140] }, { kind: 'health', pos: [-80, -140] },
  { kind: 'armour', pos: [-140, 40] }, { kind: 'armour', pos: [60, 40] },
  { kind: 'armour', pos: [160, 100] }, { kind: 'ammo', pos: [-20, -40] },
  { kind: 'ammo', pos: [100, 0] }, { kind: 'ammo', pos: [-120, 140] },
];
