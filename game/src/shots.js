// Deterministic ?shot= staging for screenshots. Each named scene puts
// the player, cars, police and mission state somewhere photogenic and
// starts the game there, so every capture shows several systems at
// once. Unknown values are ignored and the title screen shows.

import { PLACES } from './config.js';
import { setWanted } from './wanted.js';
import { startMission } from './missions.js';
import { tryEnterCar } from './vehicles.js';

export function shotName() {
  try {
    return new URLSearchParams(window.location.search).get('shot') || '';
  } catch (err) {
    return '';
  }
}

export function applyShot(G, name) {
  const p = G.player;
  // Drop the boot-up toasts so the staged scene shows one clean brief.
  const toasts = document.getElementById('toasts');
  if (toasts) toasts.innerHTML = '';
  if (name === 'chase') {
    // Gold Sunray at speed, wanted 4, police flanking, downtown behind.
    startMission(G, 4);
    G.cash = 890;
    p.x = 20; p.z = -20;
    const sunray = G.cars.find((c) => c.isSunray);
    if (sunray) {
      sunray.x = 20; sunray.z = -20; sunray.heading = Math.PI / 2;
      p.x = sunray.x; p.z = sunray.z;
      tryEnterCar(G);
      if (p.car) p.car.speed = 22;
    }
    G.cameraYaw = Math.PI / 2;
    setWanted(G, 4, true);
    // Pull the patrols in close for the frame, spread wide so the
    // gold Sunray stays visible in the middle of the chase.
    const police = G.cars.filter((c) => c.kind === 'police');
    const offsets = [[-8, -9], [-16, 9], [10, -7], [16, 8]];
    police.forEach((car, i) => {
      const off = offsets[i % offsets.length];
      car.x = p.x + off[0];
      car.z = p.z + off[1];
      car.heading = Math.PI / 2;
    });
    G.startPlaying();
  } else if (name === 'street') {
    // On foot on the road north of the diner: traffic passes on the
    // road, the diner beacon glows ahead, a cop closes in. The player
    // stands ON the road so the camera behind stays on the road too
    // and never ends up inside a building.
    startMission(G, 0);
    G.missionStep = 2;
    G.cash = 250;
    p.x = 32; p.z = 40; p.heading = Math.PI;
    p.weapon = 'pistol';
    G.cameraYaw = Math.PI;
    setWanted(G, 1, false);
    const cop = G.cops[0];
    if (cop) { cop.x = 32; cop.z = 26; }
    G.startPlaying();
  } else if (name === 'heist') {
    // The finale: loot in hand, wanted 5, the boat and the sea ahead,
    // patrols closing from the north. Police start well back so the
    // player and the boat stay visible in the frame.
    startMission(G, 5);
    G.missionStep = 2;
    G.missionData.loot = [
      { x: 0, z: 0, taken: true },
      { x: 0, z: 0, taken: true },
      { x: 0, z: 0, taken: true },
    ];
    G.cash = 1190;
    p.x = PLACES.boat.x; p.z = 172; p.heading = 0;
    p.weapon = 'pistol';
    G.cameraYaw = 0;
    setWanted(G, 5, true);
    // Patrols flank the pier so they are visible in the frame instead
    // of approaching from behind the camera.
    const police = G.cars.filter((c) => c.kind === 'police');
    const offsets = [[-14, -4], [14, -4], [-20, -10], [20, -10], [-24, -2]];
    police.forEach((car, i) => {
      const off = offsets[i % offsets.length];
      car.x = p.x + off[0];
      car.z = p.z + off[1];
      car.heading = 0;
    });
    G.startPlaying();
  } else if (name === 'title') {
    // Title screen over a slow view of the city; the game stays put.
    p.x = -8; p.z = 24; p.heading = Math.PI;
    G.cameraYaw = 0.6;
  }
}
