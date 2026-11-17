// shots: deterministic staging for the four screenshots (?shot=chase|street|
// mission|title&seed=7). Each scene sets the real game state directly —
// positions, wanted level, mission, camera — so every shot is a genuine
// render of the game's own code, and the same seed always gives the same
// frame. Unknown names fall back to the title scene.
import { SPAWN } from './config.js';
import { startMission, MISSIONS } from './missions.js';

function placePlayer(g, x, z, heading) {
  g.playerPos.x = x; g.playerPos.z = z;
  g.playerHeading = heading;
  g.playerMesh.position.set(x, 0, z);
  g.playerMesh.rotation.y = heading;
  g.playerMesh.visible = true;
}

function placeCar(g, entry, x, z, heading, speed) {
  entry.taken = true;
  entry.mesh.position.set(x, 0, z);
  entry.mesh.rotation.y = heading;
  g.playerCar = entry.mesh;
  g.driving = true;
  g.carHeading = heading;
  g.carSpeed = speed;
  g.playerMesh.visible = false;
}

export function stageShot(g, name) {
  if (name === 'title') {
    return { screen: 'title', hud: false, orbit: true };
  }
  g.screen = 'playing';
  g.hudApi.showHud(true);
  g.hudApi.hideScreens();
  if (name === 'street') {
    placePlayer(g, 0, 30, Math.PI);
    g.camYaw = Math.PI;
    g.camPitch = 0.32;
    g.camDist = 8;
    g.wantedApi.clearWanted();
    g.hudApi.setObjective(MISSIONS[0].title, MISSIONS[0].text);
    g.markerTarget = { x: 24, z: -118 };
    return { screen: 'playing', hud: true, orbit: false };
  }
  if (name === 'chase') {
    startMission(g, 4);
    g.missionTimer = 72;
    placeCar(g, g.sunray, -2, -40, 0, 30);
    g.camYaw = 0; g.camPitch = 0.3; g.camDist = 11;
    // Two police cars flanking the Sunray, in frame for the cover shot:
    // beside the player car, so the cover camera sees them the whole time.
    for (const [x, z, h] of [[-5, -38, 0], [1, -36, 0]]) {
      g.wantedApi.spawnPoliceCarForShot(x, z, h);
    }
    // Clear coins on the drive path so no toast pops mid-frame.
    for (const c of g.coins) {
      if (Math.abs(c.x + 2) < 8 && c.z > -45 && c.z < 45) { c.taken = true; c.mesh.visible = false; }
    }
    // Cover camera: ahead-side, looking back at the Sunray and its pursuers.
    g.shotCam = 'cover';
    g.hudApi.toast('');
    // Hold W so the chase is mid-action when the frame is taken.
    g.keys['w'] = true;
    return { screen: 'playing', hud: true, orbit: false, holdW: true };
  }
  if (name === 'mission') {
    startMission(g, 5);
    g.lootTaken = 1;
    if (g.lootBags[0]) { g.lootBags[0].taken = true; g.scene.remove(g.lootBags[0].mesh); }
    g.markerTarget = { x: 8, z: -96 };
    placePlayer(g, 0, -100, Math.PI);
    g.camYaw = Math.PI; g.camPitch = 0.3; g.camDist = 9;
    g.weapon = 'pistol';
    g.ammo = 9;
    g.hudApi.setObjective(MISSIONS[5].title, 'Loot bag 2/3 — grab the bags at the Marina bank!');
    g.wantedApi.setWanted(5);
    g.wantedApi.spawnCopsForShot([[14, -92], [-10, -90]]);
    g.hudApi.toast('');
    return { screen: 'playing', hud: true, orbit: false };
  }
  return { screen: 'title', hud: false, orbit: true };
}
