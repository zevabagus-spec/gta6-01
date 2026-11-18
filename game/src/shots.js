// Deterministic screenshot staging: ?shot=<scene>&seed=<n> puts the game in
// an exact composed scene so screenshots are reproducible. Unknown scene
// names are ignored and the game starts normally at the title screen.
import { raiseWanted } from './player.js';
import { CAR_MODELS } from './vehicles.js';

export const SHOT_SCENES = ['cover', 'street', 'drive', 'mission'];

export function parseShotParams(search) {
  const params = new URLSearchParams(search || '');
  const shot = params.get('shot') || '';
  const seedRaw = parseInt(params.get('seed') || '', 10);
  return {
    shot: SHOT_SCENES.includes(shot) ? shot : '',
    seed: Number.isFinite(seedRaw) ? seedRaw : 20261118,
    autostart: params.get('autostart') === '1' || SHOT_SCENES.includes(shot),
  };
}

function placePlayerInCar(world, x, z, heading, modelIndex) {
  const car = world.vehicles.spawnParkedCar();
  car.modelIndex = modelIndex;
  car.model = CAR_MODELS[modelIndex];
  car.color = CAR_MODELS[modelIndex].colors[0];
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = 0;
  world.player.x = x;
  world.player.z = z;
  world.player.heading = heading;
  world.enterCarDirect(car);
  return car;
}

function spawnChase(world, x, z) {
  const spots = [
    [x - 18, z + 14], [x - 26, z - 6], [x + 16, z + 20],
  ];
  for (const [cx, cz] of spots) {
    const car = world.vehicles.spawnPoliceCar(cx, cz);
    car.heading = Math.atan2(x - cx, -(z - cz));
    car.speed = 20;
  }
}

export function stageShotScene(world, scene) {
  const player = world.player;
  if (scene === 'cover') {
    // Chase + wanted + minimap + mission objective, all at once: jump to
    // the timed Harbor Run delivery leg, which already raises 2 stars.
    world.missions.debugJumpToStep(world, 3, 1);
    raiseWanted(world.player, 1);
    const car = placePlayerInCar(world, -30, 60, Math.PI, 4);
    car.speed = 24;
    spawnChase(world, -30, 60);
    world.cameraYaw = Math.PI;
    world.cameraPitch = 0.32;
    world.hud.showToast('Harbor Run — reach the docks buyer!', 6);
  } else if (scene === 'street') {
    // On foot on the beach promenade: open sightlines, palms, water to the
    // west, skyline to the east, walkers around Mara.
    player.x = -214;
    player.z = 20;
    player.heading = 0;
    world.cameraYaw = 0;
    world.cameraPitch = 0.28;
    for (let i = 0; i < 6; i += 1) {
      const ped = world.peds.spawnWalker();
      ped.x = -214 + (i % 3) * 4 - 4;
      ped.z = 8 - i * 5;
      ped.targetX = -214;
      ped.targetZ = -40 + i * 12;
    }
    world.hud.showToast('Solmar Beach promenade — explore on foot', 6);
  } else if (scene === 'drive') {
    // Waterfront drive along the promenade at speed.
    const car = placePlayerInCar(world, -212, -120, 0, 0);
    car.speed = 26;
    world.cameraYaw = 0;
    world.cameraPitch = 0.30;
    world.hud.showToast('Coastal drive — Solmar Beach', 6);
  } else if (scene === 'mission') {
    // Mission 5 shootout: thugs closing in, pistol out, objective live.
    // Player stands south of Tower Plaza facing north (heading 0) toward it.
    world.missions.startMission(world, 4);
    player.x = 30;
    player.z = 60;
    player.heading = 0;
    player.weapon = 'pistol';
    player.ammo = 24;
    world.cameraYaw = 0;
    world.cameraPitch = 0.30;
    world.hud.showToast('The Exchange — clear the Gulls at Tower Plaza', 6);
  }
}
