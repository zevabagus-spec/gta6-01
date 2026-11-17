// main: Solara Bay bootstrap and game loop. Builds the world (city, cars,
// pedestrians, player, missions, HUD, audio, save), runs the frame loop,
// owns input and the third-person camera, and exposes a small test hook
// (window.__solara) the playtest reads. Staged screenshots (?shot=) bypass
// the title screen and jump straight into a deterministic scene.
import * as THREE from '../vendor/three.min.js';
import { WORLD, ROADS, DISTRICTS, SPAWN, SHOT_SEED, START_CASH, INTERACT_RADIUS, makeRng, clamp, dist2d } from './config.js';
import { buildCity, resolveCircle } from './city.js';
import { spawnParkedCars, spawnTraffic, updateTraffic } from './vehicles.js';
import { spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { createPlayer, updatePlayerOnFoot, punch, shoot, nearestCar, enterCar, exitCar, damagePlayer, respawnPlayer } from './player.js';
import { updateDriving, drivingCamera } from './driving.js';
import { createWantedApi, updateWanted } from './wanted.js';
import { createMissions, startMission, updateMissions, missionInteract } from './missions.js';
import { createHudApi } from './hud.js';
import { createAudio } from './audio.js';
import { createSaveApi } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || SHOT_SEED) || SHOT_SEED;

const g = {
  seed, time: 0, frameRng: makeRng(seed + 99),
  screen: 'title', completed: false,
  cash: START_CASH, clockMinutes: 540,
  keys: {}, camYaw: Math.PI, camPitch: 0.32, camDist: 8.5,
  punchCooldown: 0, shootCooldown: 0, punchFlash: 0, muzzle: 0,
  cameraShake: 0, recentViolence: 0, tracer: null,
  nearCar: false, nearLoot: false, nearMissionMarker: false,
  colliders: [], buildingBoxes: [], districts: DISTRICTS, roads: ROADS,
  lastSaveAt: 0, orbitAngle: 0,
};

function boot() {
  const canvas = document.getElementById('game');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    document.getElementById('fallback').style.display = 'flex';
    return;
  }
  if (!renderer.getContext()) {
    document.getElementById('fallback').style.display = 'flex';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  g.renderer = renderer;
  g.scene = new THREE.Scene();
  g.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 800);

  buildCity(g);
  spawnParkedCars(g);
  spawnTraffic(g);
  spawnPedestrians(g);
  createPlayer(g);
  createHudApi(g);
  createAudio(g);
  createWantedApi(g);
  createSaveApi(g);
  createMissions(g);
  g.rivals = [];
  g.cops = g.cops || [];
  g.sunray.taken = false;

  // Tracer line for pistol shots + muzzle flash light.
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  g.tracerLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), tracerMat);
  g.tracerLine.visible = false;
  g.scene.add(g.tracerLine);
  g.muzzleLight = new THREE.PointLight(0xffd28a, 0, 18);
  g.scene.add(g.muzzleLight);

  bindInput();
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && g.screen === 'playing') pauseGame();
  });

  // Continue button appears when a save exists.
  if (g.saveApi.hasSave()) document.getElementById('btn-continue').style.display = 'inline-block';

  if (shotName) {
    const staged = stageShot(g, shotName);
    g.shotOrbit = staged.orbit;
    if (!staged.orbit) g.screen = 'playing';
    g.hudApi.showHud(!!staged.hud);
    if (staged.orbit) g.hudApi.showScreen('title');
  }
  g.ready = true;
  window.__solara = {
    g,
    start: () => startGame(false),
    state: () => ({
      screen: g.screen, cash: g.cash, health: g.health, armour: g.armour,
      ammo: g.ammo, wanted: g.wanted, missionIndex: g.missionIndex,
      x: g.playerPos.x, z: g.playerPos.z, driving: g.driving,
      objective: document.getElementById('objective-text').textContent,
    }),
  };
  window.__solaraReady = true;
  renderer.setAnimationLoop(tick);
}

function onResize() {
  g.camera.aspect = window.innerWidth / window.innerHeight;
  g.camera.updateProjectionMatrix();
  g.renderer.setSize(window.innerWidth, window.innerHeight);
}

function bindInput() {
  const key = (e) => e.key.toLowerCase();
  window.addEventListener('keydown', (e) => {
    const k = key(e);
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    g.keys[k] = true;
    g.audio.init();
    if (k === 'enter' && g.screen === 'title') startGame(false);
    if (k === 'p') {
      if (g.screen === 'playing') pauseGame();
      else if (g.screen === 'paused') resumeGame();
    }
    if (k === 'm') g.audio.toggleMute();
    if (k === '1') { g.weapon = 'fists'; }
    if (k === '2') { g.weapon = 'pistol'; }
    if (k === 'c' && g.driving) { g.camDist = g.camDist > 9 ? 7 : 12; }
    if (k === 'f' && g.screen === 'playing') punch(g);
    if (k === 'e' && g.screen === 'playing') interactKey();
  });
  window.addEventListener('keyup', (e) => { g.keys[key(e)] = false; });
  const canvas = document.getElementById('game');
  canvas.addEventListener('mousedown', (e) => {
    g.audio.init();
    if (g.screen !== 'playing') return;
    if (e.button === 0) shoot(g);
    g.dragging = true; g.dragX = e.clientX; g.dragY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!g.dragging) return;
    g.camYaw -= (e.clientX - g.dragX) * 0.005;
    g.camPitch = clamp(g.camPitch + (e.clientY - g.dragY) * 0.003, 0.08, 0.9);
    g.dragX = e.clientX; g.dragY = e.clientY;
  });
  window.addEventListener('mouseup', () => { g.dragging = false; });
  canvas.addEventListener('wheel', (e) => {
    g.camDist = clamp(g.camDist + Math.sign(e.deltaY) * 1.5, 5, 16);
  }, { passive: true });
  document.getElementById('btn-start').addEventListener('click', () => { g.audio.init(); startGame(true); });
  document.getElementById('btn-continue').addEventListener('click', () => { g.audio.init(); startGame(false); });
  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-quit-title').addEventListener('click', () => { g.screen = 'title'; g.hudApi.showScreen('title'); g.hudApi.showHud(false); });
  document.getElementById('btn-busted').addEventListener('click', () => { g.cash = Math.max(0, g.cash - 100); g.wantedApi.clearWanted(); respawnPlayer(g); resumeGame(); });
  document.getElementById('btn-wasted').addEventListener('click', () => { g.cash = Math.max(0, g.cash - 150); g.wantedApi.clearWanted(); respawnPlayer(g); resumeGame(); });
  document.getElementById('btn-again').addEventListener('click', () => { g.completed = false; resumeGame(); });
}

function interactKey() {
  if (g.driving) { exitCar(g); return; }
  if (missionInteract(g)) return;
  const car = nearestCar(g);
  if (car) { enterCar(g, car); return; }
}

function startGame(fresh) {
  g.audio.init();
  if (fresh) {
    g.saveApi.clear();
    g.cash = START_CASH; g.health = 100; g.armour = 0; g.ammo = 12;
    g.clockMinutes = 540;
    g.playerPos.x = SPAWN.x; g.playerPos.z = SPAWN.z;
    g.playerMesh.position.set(SPAWN.x, 0, SPAWN.z);
    startMission(g, 0);
  } else {
    const save = g.saveApi.load();
    if (save) {
      const mi = g.saveApi.apply(save);
      startMission(g, Math.min(mi, 5));
    } else {
      startMission(g, 0);
    }
  }
  g.screen = 'playing';
  g.hudApi.hideScreens();
  g.hudApi.showHud(true);
}

function pauseGame() {
  g.screen = 'paused';
  g.hudApi.showScreen('pause');
  g.audio.engine(0, false);
}
function resumeGame() {
  g.screen = 'playing';
  g.hudApi.hideScreens();
  g.hudApi.showHud(true);
}

g.onBusted = () => {
  if (g.screen !== 'playing') return;
  g.screen = 'busted';
  g.hudApi.showScreen('busted');
};
g.onWasted = () => {
  if (g.screen !== 'playing') return;
  g.screen = 'wasted';
  g.hudApi.showScreen('wasted');
};
g.onComplete = () => {
  g.completed = true;
  g.screen = 'complete';
  document.getElementById('complete-text').textContent =
    'The Marina heist is done. Dario Voss walks away with $' + Math.floor(g.cash) + ' — richer, and still free.';
  g.hudApi.showScreen('complete');
  g.saveApi.save();
};

// Coins and pickups.
function updatePickups(g, dt) {
  const p = g.driving ? { x: g.playerCar.position.x, z: g.playerCar.position.z } : g.playerPos;
  for (const c of g.coins) {
    if (c.taken) continue;
    c.spin += dt * 3;
    c.mesh.rotation.y = c.spin;
    c.mesh.position.y = 1.2 + Math.sin(g.time * 2 + c.spin) * 0.15;
    if (dist2d(p.x, p.z, c.x, c.z) < 2.2) {
      c.taken = true;
      c.mesh.visible = false;
      g.cash += 25;
      g.audio.coin();
      g.hudApi.toast('SUN COIN  +$25');
    }
  }
  for (const pk of g.pickups) {
    if (pk.taken) continue;
    pk.mesh.rotation.y += dt;
    if (dist2d(p.x, p.z, pk.x, pk.z) < 2.2) {
      pk.taken = true;
      pk.mesh.visible = false; pk.cap.visible = false;
      if (pk.kind === 'health') { g.health = Math.min(100, g.health + 50); g.hudApi.toast('HEALTH +50'); }
      else { g.armour = Math.min(100, g.armour + 50); g.hudApi.toast('ARMOUR +50'); }
      g.audio.coin();
    }
  }
}

// Third-person camera for on-foot play.
function onFootCamera(g, dt) {
  const px = g.playerPos.x, pz = g.playerPos.z;
  const fx = Math.sin(g.camYaw), fz = Math.cos(g.camYaw);
  const tx = px - fx * g.camDist;
  const tz = pz - fz * g.camDist;
  const ty = 2.2 + g.camPitch * 7;
  g.camera.position.x += (tx - g.camera.position.x) * Math.min(1, 8 * dt);
  g.camera.position.y += (ty - g.camera.position.y) * Math.min(1, 8 * dt);
  g.camera.position.z += (tz - g.camera.position.z) * Math.min(1, 8 * dt);
  g.camera.lookAt(px + fx * 3, 1.6, pz + fz * 3);
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  g.time += dt;
  g.clockMinutes += dt * 0.5;
  if (g.punchCooldown > 0) g.punchCooldown -= dt;
  if (g.shootCooldown > 0) g.shootCooldown -= dt;
  if (g.recentViolence > 0) g.recentViolence -= dt;
  if (g.cameraShake > 0) g.cameraShake -= dt;

  if (g.screen === 'playing') {
    // Proximity flags drive the "Press E" prompt.
    const p = g.driving ? { x: g.playerCar.position.x, z: g.playerCar.position.z } : g.playerPos;
    g.nearCar = !g.driving && nearestCar(g) !== null;
    g.nearLoot = g.missionIndex === 5 && g.lootBags.some((b) => !b.taken && dist2d(p.x, p.z, b.x, b.z) < 3.5);
    g.nearMissionMarker = g.missionIndex === 0 && dist2d(p.x, p.z, 24, -118) < INTERACT_RADIUS;
    if (g.driving) updateDriving(g, dt);
    else updatePlayerOnFoot(g, dt);
    updateTraffic(g, dt);
    updatePedestrians(g, dt);
    updateWanted(g, dt);
    updateMissions(g, dt);
    updatePickups(g, dt);
    if (g.time - g.lastSaveAt > 15) g.saveApi.save();
    if (g.driving) drivingCamera(g, dt);
    else onFootCamera(g, dt);
    if (g.shotCam === 'cover' && g.driving) {
      // Cover camera: ahead and to the side, looking back at the Sunray
      // with its police pursuers behind it.
      const car = g.playerCar;
      const fx = Math.sin(g.carHeading), fz = Math.cos(g.carHeading);
      const rx = Math.cos(g.carHeading), rz = -Math.sin(g.carHeading);
      // Left side (lamp posts run down the right side of these roads).
      g.camera.position.set(car.position.x + fx * 13 - rx * 9, 4.5, car.position.z + fz * 13 - rz * 9);
      g.camera.lookAt(car.position.x - fx * 6, 1.2, car.position.z - fz * 6);
    }
  } else if (g.screen === 'title' && g.shotOrbit) {
    // Slow orbit over the city behind the title screen.
    g.orbitAngle += dt * 0.05;
    const r = 120;
    g.camera.position.set(Math.sin(g.orbitAngle) * r, 55, Math.cos(g.orbitAngle) * r);
    g.camera.lookAt(0, 0, 0);
    updateTraffic(g, dt);
    updatePedestrians(g, dt);
  } else if (g.screen === 'title') {
    g.camera.position.set(60, 40, 90);
    g.camera.lookAt(0, 0, -40);
  }

  // Tracer + muzzle flash decay.
  if (g.tracer) {
    g.tracer.life -= dt;
    if (g.tracer.life > 0) {
      g.tracerLine.geometry.setFromPoints([g.tracer.from, g.tracer.to]);
      g.tracerLine.visible = true;
      g.muzzleLight.position.copy(g.tracer.from);
      g.muzzleLight.intensity = 3;
    } else {
      g.tracerLine.visible = false;
      g.muzzleLight.intensity = 0;
      g.tracer = null;
    }
  }
  if (g.cameraShake > 0) {
    g.camera.position.x += (Math.random() - 0.5) * g.cameraShake * 0.6;
    g.camera.position.y += (Math.random() - 0.5) * g.cameraShake * 0.6;
  }
  if (g.screen === 'playing' || g.shotOrbit) g.hudApi.update(dt);
  g.renderer.render(g.scene, g.camera);
}

boot();
