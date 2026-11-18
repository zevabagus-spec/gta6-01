// Solara Bay — deterministic screenshot staging. ?shot=cover|street|mission
// |title (plus &seed=) poses the live game as a frozen scene that shows
// the systems at their best, so every screenshot is a reproducible render
// of the real game. The simulation freezes (world.frozen) once the scene
// is posed, so the captured frame is exactly the staged one.
import { MISSIONS } from './config.js';
import { makeCar } from './vehicles.js';

// Grow the police fleet to `count` cars, parked at the origin until posed.
function spawnShotPolice(world, count) {
  while (world.policeCars.length < count) {
    const car = makeCar('shot-police' + world.policeCars.length, 'police', 0, 0, 0);
    car.speed = 20;
    world.policeCars.push(car);
    world.cars.push(car);
  }
}

// Set the police cars flanking the player's car, slightly behind it, so the
// pursuit reads in frame instead of hiding behind the camera.
function placePoliceChase(world) {
  const p = world.player;
  const behind = p.yaw + Math.PI;
  world.policeCars.forEach((car, i) => {
    const side = i === 0 ? -6 : 6;
    const back = 5;
    car.x = p.x + Math.sin(behind) * back + Math.cos(p.yaw) * side;
    car.z = p.z + Math.cos(behind) * back - Math.sin(p.yaw) * side;
    car.yaw = p.yaw;
    car.speed = 20;
  });
}

export function applyShot(world, name) {
  const p = world.player;
  world.frozen = true;
  world.audio = world.audio || { setSiren() {}, setEngine() {} };
  if (name === 'title') {
    world.state = 'title';
    world.camera.yaw = -Math.PI / 2; world.camera.pitch = 0.3; world.camera.dist = 90;
    world.cameraTarget = { x: -100, z: 0 }; // look west over the Marina to the sunset
    world.clockMinutes = 1020; // golden hour over the Marina
    return;
  }
  world.state = 'play';
  world.hudVisible = true;
  if (name === 'cover') {
    // Chase cover: mission 5, wanted 4, the Sunray at speed down the z=40
    // street with police on its tail; the square fountain sits behind us.
    world.missions.index = 4; world.missions.step = 0;
    world.missions.timer = 60;
    world.wanted.locked = 4; world.wanted.level = 4;
    const sunray = world.cars.find((c) => c.modelKey === 'sunray');
    p.x = 0; p.z = 40; p.yaw = Math.PI / 2;
    if (sunray) {
      sunray.x = 0; sunray.z = 40; sunray.yaw = Math.PI / 2; sunray.parked = false;
      p.inCar = true; p.car = sunray; p.carSpeed = 24;
      sunray.speed = 24;
    }
    world.camera.yaw = Math.PI / 2; world.camera.pitch = 0.26; world.camera.dist = 12;
    spawnShotPolice(world, 2);
    placePoliceChase(world);
    // Two traffic cars ahead on the same street, so the chase has a city in it.
    const traffic = world.cars.filter((c) => c.traffic);
    if (traffic[0]) { traffic[0].x = 35; traffic[0].z = 40; traffic[0].yaw = Math.PI / 2; traffic[0].speed = 0; }
    if (traffic[1]) { traffic[1].x = 65; traffic[1].z = 37; traffic[1].yaw = Math.PI / 2; traffic[1].speed = 0; }
    world.clockMinutes = 1000;
    world.toastText = 'Wanted level 4 — reach the Marina safehouse!';
    world.toastUntil = 999999;
  } else if (name === 'street') {
    // On-foot street life: mission 1, facing the Marina pier marker, with
    // pedestrians and a traffic car staged nearby on the same street.
    world.missions.index = 0; world.missions.step = 0;
    world.wanted.level = 0; world.wanted.locked = 0;
    p.x = -160; p.z = 20; p.yaw = Math.atan2(-8, -20); // facing the pier marker
    p.inCar = false; p.car = null;
    world.camera.yaw = p.yaw; world.camera.pitch = 0.35; world.camera.dist = 8;
    const pedSpots = [[-155, 8, 0.4], [-166, 32, -0.6], [-152, 34, 2.4]];
    world.peds.slice(0, 3).forEach((ped, i) => {
      [ped.x, ped.z, ped.yaw] = pedSpots[i];
      ped.tx = ped.x; ped.tz = ped.z;
    });
    const traffic = world.cars.find((c) => c.traffic);
    if (traffic) { traffic.x = -160; traffic.z = 62; traffic.yaw = Math.PI; traffic.speed = 0; }
    world.clockMinutes = 960;
    world.toastText = 'Mission 1 — First Pickup: go to the Marina pier marker';
    world.toastUntil = 999999;
  } else if (name === 'mission') {
    // Heist in progress: mission 6, wanted 5, standing by the first loot
    // bag under its gold beacon, police closing in from behind.
    world.missions.index = 5; world.missions.step = 0;
    world.wanted.locked = 5; world.wanted.level = 5;
    world.lootBags = [
      { x: -160, z: -40, taken: false },
      { x: -140, z: 0, taken: false },
      { x: -170, z: 100, taken: false },
    ];
    world.missions.bagsSpawned = true;
    p.x = -148; p.z = -26; p.yaw = Math.atan2(-12, -14); // facing loot bag 1, offset so the bag shows beside its beacon, not behind it
    p.inCar = false; p.car = null;
    world.camera.yaw = p.yaw; world.camera.pitch = 0.32; world.camera.dist = 10;
    spawnShotPolice(world, 2);
    // Police closing in on both flanks of the loot bag, visible in frame.
    world.policeCars[0].x = -152; world.policeCars[0].z = -42; world.policeCars[0].yaw = p.yaw;
    world.policeCars[1].x = -164; world.policeCars[1].z = -32; world.policeCars[1].yaw = p.yaw;
    world.clockMinutes = 1030;
    world.toastText = 'The Marina Heist — collect loot bag 1 of 3';
    world.toastUntil = 999999;
  } else {
    // Unknown shot name: plain gameplay, mission 1.
    world.missions.index = 0; world.missions.step = 0;
    p.x = -40; p.z = 60; p.yaw = Math.PI;
  }
  world.objectiveText = missionObjectiveText(world);
  world.marker = markerFor(world);
}

function missionObjectiveText(world) {
  const m = MISSIONS[world.missions.index];
  if (!m) return '';
  const step = m.steps[world.missions.step] || m.steps[0];
  return `${m.id}. ${m.title}: ${step.text}`;
}
function markerFor(world) {
  const m = MISSIONS[world.missions.index];
  if (!m) return null;
  const step = m.steps[world.missions.step] || m.steps[0];
  return { x: step.pos[0], z: step.pos[1], radius: step.radius || 5 };
}
