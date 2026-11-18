// Solara Bay — entry point. Wires input, the game loop, the camera,
// the screens (title / pause / busted / wasted / complete), saving,
// and the read-only debug handle used by playtests.

import { CONTROLS_TEXT, MISSIONS, PLACES, START_CASH, AUTOSAVE_SECONDS } from './config.js';
import { Renderer } from './engine.js';
import { buildCity, drawBeacon, drawCity } from './city.js';
import { SoundBank } from './audio.js';
import { clearSave, describeSave, hasSave, loadGame, saveGame } from './save.js';
import { createPlayer, damagePlayer, drawPlayer, healPlayer, playerAttack, updatePlayerOnFoot } from './player.js';
import { createTraffic, drawVehicles, exitCar, tryEnterCar, updatePlayerCar, updatePolice, updateTraffic } from './vehicles.js';
import { createPedestrians, drawPeople, fleePeds, updateCops, updatePedestrians, updateRivals } from './pedestrians.js';
import { addWanted, clearWanted, setWanted, syncPolice, updateWanted } from './wanted.js';
import { drawMissionProps, startMission, updateMissions, updateObjective } from './missions.js';
import { Hud } from './hud.js';
import { applyShot, shotName } from './shots.js';
import { dist2D } from './math3d.js';

const canvas = document.getElementById('game');
const hud = new Hud();
const sounds = new SoundBank();

const input = {
  keys: new Set(),
  pressed: new Set(),
  consumePress(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  },
};

const G = {
  mode: 'title',
  time: 0,
  cameraYaw: Math.PI,
  shake: 0,
  speedKmh: 0,
  cash: START_CASH,
  wanted: 0,
  wantedLocked: false,
  lastCrimeAt: -99,
  godUntil: 0,
  coinsTaken: new Set(),
  missionIndex: 0,
  missionStep: 0,
  missionData: {},
  flags: {},
  objective: '',
  marker: null,
  markerColor: [1, 0.85, 0.2],
  input,
  sounds,
  city: null,
  player: null,
  cars: [],
  peds: [],
  rivals: [],
  cops: [],
  hud,
  toastOnceSeen: new Set(),
  toast(text) { hud.toast(text); },
  toastOnce(key, text) {
    if (this.toastOnceSeen.has(key)) return;
    this.toastOnceSeen.add(key);
    hud.toast(text);
  },
  addWanted(amount, reason) { addWanted(this, amount, reason); },
  fleePeds(x, z, radius) { fleePeds(this, x, z, radius); },
  onCarStolen() { this.flags.stolen = true; },
  onSunrayTaken() { this.flags.sunray = true; },
  saveNow() { persistSave(); },
  startPlaying() { startPlaying(); },
  enterBusted() { enterBusted(); },
  enterWasted() { enterWasted(); },
  enterComplete() { enterComplete(); },
};

function seedFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('seed') || 'solara-bay-1';
  } catch (err) {
    return 'solara-bay-1';
  }
}

function buildWorld() {
  const seed = seedFromUrl();
  G.city = buildCity(seed);
  G.player = createPlayer(PLACES.spawn);
  G.cars = createTraffic(seed);
  G.peds = createPedestrians(seed);
  G.rivals = [];
  G.cops = [];
  G.cash = START_CASH;
  G.wanted = 0;
  G.wantedLocked = false;
  G.coinsTaken = new Set();
  G.time = 0;
  G.cameraYaw = Math.PI;
  startMission(G, 0);
}

function persistSave() {
  const p = G.player;
  saveGame({
    missionIndex: Math.min(6, G.missionIndex),
    cash: G.cash,
    coinsTaken: [...G.coinsTaken],
    health: Math.ceil(p.health),
    ammo: p.ammo,
    weapon: p.weapon,
    x: Math.round(p.x),
    z: Math.round(p.z),
  });
}

function applySave(save) {
  G.missionIndex = Math.min(5, save.missionIndex || 0);
  G.cash = save.cash || 0;
  G.coinsTaken = new Set(save.coinsTaken || []);
  G.city.coins.forEach((coin, i) => { coin.taken = G.coinsTaken.has(i); });
  G.player.health = save.health || 100;
  G.player.ammo = save.ammo === undefined ? 12 : save.ammo;
  G.player.weapon = save.weapon || 'fists';
  if (typeof save.x === 'number') G.player.x = save.x;
  if (typeof save.z === 'number') G.player.z = save.z;
  startMission(G, G.missionIndex);
}

function showScreen(id) {
  for (const name of ['title-screen', 'pause-screen', 'busted-screen', 'wasted-screen', 'complete-screen']) {
    const el = document.getElementById(name);
    if (el) el.classList.toggle('hidden', name !== id);
  }
  const hudEl = document.getElementById('hud');
  if (hudEl) hudEl.classList.toggle('hidden', id === 'title-screen' || id === null);
}

function startPlaying() {
  sounds.unlock();
  G.mode = 'playing';
  showScreen(null);
  document.getElementById('hud').classList.remove('hidden');
  updateObjective(G);
}

function startFresh() {
  clearSave();
  buildWorld();
  startPlaying();
  hud.toast('Welcome to Solara Bay. Follow the gold beacon.');
}

function continueGame() {
  const save = loadGame();
  buildWorld();
  if (save) applySave(save);
  startPlaying();
  hud.toast('Welcome back to Solara Bay.');
}

function enterBusted() {
  if (G.mode !== 'playing') return;
  G.mode = 'busted';
  sounds.busted();
  sounds.setSiren(false);
  sounds.setEngine(false, 0);
  const bail = Math.min(100, G.cash);
  G.cash -= bail;
  const el = document.getElementById('busted-detail');
  if (el) el.textContent = `Bail posted: $${bail}. The cops let you walk — this time.`;
  showScreen('busted-screen');
  persistSave();
}

function enterWasted() {
  if (G.mode !== 'playing') return;
  G.mode = 'wasted';
  sounds.wasted();
  sounds.setSiren(false);
  sounds.setEngine(false, 0);
  showScreen('wasted-screen');
  persistSave();
}

function resumeAfterBusted() {
  clearWanted(G);
  G.player.health = 100;
  if (G.player.car) exitCar(G);
  G.player.x = PLACES.spawn.x;
  G.player.z = PLACES.spawn.z;
  G.godUntil = G.time + 3;
  startPlaying();
}

function resumeAfterWasted() {
  clearWanted(G);
  healPlayer(G, 100);
  if (G.player.car) exitCar(G);
  G.player.x = PLACES.spawn.x;
  G.player.z = PLACES.spawn.z;
  G.godUntil = G.time + 3;
  startPlaying();
}

function enterComplete() {
  G.mode = 'complete';
  sounds.setSiren(false);
  sounds.setEngine(false, 0);
  clearWanted(G);
  const el = document.getElementById('complete-detail');
  if (el) {
    el.textContent = `Final cash: $${G.cash} · Sun Coins: ${G.coinsTaken.size} / 30 · The Solara Job is done. Dario and Mara split the score, and the bay is yours.`;
  }
  showScreen('complete-screen');
  persistSave();
}

function togglePause() {
  if (G.mode === 'playing') {
    G.mode = 'paused';
    sounds.setEngine(false, 0);
    showScreen('pause-screen');
  } else if (G.mode === 'paused') {
    G.mode = 'playing';
    showScreen(null);
  }
}

// ---- Input -------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (!e.repeat) input.pressed.add(e.code);
  input.keys.add(e.code);
  if ((e.code === 'Escape' || e.code === 'KeyP') && (G.mode === 'playing' || G.mode === 'paused')) {
    e.preventDefault();
    togglePause();
  }
  if (e.code === 'KeyM' && !e.repeat) {
    const on = sounds.toggleMusic();
    hud.toast(on ? 'Music on' : 'Music off');
  }
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
window.addEventListener('blur', () => input.keys.clear());

let dragging = false;
let lastMouseX = 0;
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  lastMouseX = e.clientX;
  sounds.unlock();
});
window.addEventListener('mouseup', (e) => {
  if (dragging && Math.abs(e.clientX - lastMouseX) < 6 && G.mode === 'playing' && !G.player.car) {
    playerAttack(G);
  }
  dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMouseX;
  lastMouseX = e.clientX;
  G.cameraYaw -= dx * 0.005;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'playing') togglePause();
});
window.addEventListener('resize', () => renderer.resize());

// ---- Buttons -----------------------------------------------------

function bindButton(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => { sounds.unlock(); fn(); });
}
bindButton('btn-start', startFresh);
bindButton('btn-continue', continueGame);
bindButton('btn-resume', togglePause);
bindButton('btn-restart', () => { showScreen('title-screen'); G.mode = 'title'; refreshTitle(); });
bindButton('btn-busted', resumeAfterBusted);
bindButton('btn-wasted', resumeAfterWasted);
bindButton('btn-again', startFresh);
bindButton('btn-title', () => { showScreen('title-screen'); G.mode = 'title'; refreshTitle(); });

function refreshTitle() {
  const save = loadGame();
  const btn = document.getElementById('btn-continue');
  const info = document.getElementById('save-info');
  if (btn) btn.disabled = !save;
  if (info) info.textContent = save ? describeSave(save) : 'No saved game yet.';
  const controls = document.getElementById('controls-line');
  if (controls) controls.textContent = CONTROLS_TEXT;
}

// ---- Coins, camera, loop ----------------------------------------

function collectCoins() {
  const p = G.player;
  G.city.coins.forEach((coin, i) => {
    if (coin.taken || G.coinsTaken.has(i)) return;
    if (dist2D(p.x, p.z, coin.x, coin.z) < 2.4) {
      coin.taken = true;
      G.coinsTaken.add(i);
      G.cash += 10;
      sounds.coin();
      hud.toast(`Sun Coin! +$10 (${G.coinsTaken.size}/30)`);
    }
  });
}

function cameraFor() {
  const p = G.player;
  const dist = p.car ? 17 : 11;
  const height = p.car ? 6.5 : 5;
  const lookX = Math.sin(G.cameraYaw);
  const lookZ = Math.cos(G.cameraYaw);
  let shakeX = 0;
  let shakeZ = 0;
  if (G.shake > 0.01) {
    shakeX = (Math.random() - 0.5) * G.shake;
    shakeZ = (Math.random() - 0.5) * G.shake;
  }
  return {
    eye: [p.x - lookX * dist + shakeX, height, p.z - lookZ * dist + shakeZ],
    target: [p.x, 2, p.z],
  };
}

const renderer = new Renderer(canvas);
renderer.resize();

let lastTime = performance.now();
let saveTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (G.mode === 'playing') {
    G.time += dt;
    G.shake = Math.max(0, G.shake - dt * 1.6);
    if (input.consumePress('KeyF')) {
      if (G.player.car) exitCar(G);
      else tryEnterCar(G);
    }
    if (input.consumePress('KeyE')) {
      hud.toast(G.objective || 'Follow the gold beacon.');
    }
    if (G.player.car) updatePlayerCar(G, dt);
    else updatePlayerOnFoot(G, dt);
    updateTraffic(G, dt);
    updatePolice(G, dt);
    updatePedestrians(G, dt);
    updateRivals(G, dt);
    updateCops(G, dt);
    updateWanted(G, dt);
    updateMissions(G, dt);
    collectCoins();
    saveTimer += dt;
    if (saveTimer >= AUTOSAVE_SECONDS) {
      saveTimer = 0;
      persistSave();
    }
  } else if (G.mode === 'title') {
    G.time += dt;
    G.cameraYaw += dt * 0.05;
  }
  if (renderer.available) {
    const cam = cameraFor();
    renderer.beginFrame(cam.eye, cam.target);
    drawCity(renderer, G.city, G.time, G.coinsTaken);
    drawMissionProps(renderer, G);
    drawVehicles(renderer, G);
    drawPeople(renderer, G);
    drawPlayer(renderer, G);
    if (G.mode === 'playing' && G.marker) {
      drawBeacon(renderer, G.marker.x, G.marker.z, G.time, G.markerColor);
    }
  }
  if (G.mode === 'playing' || G.mode === 'paused') hud.update(G);
}

// ---- Debug handle (read state + staging helpers for playtests) ---

window.__solara = {
  version: 'solara-1',
  get mode() { return G.mode; },
  get missionIndex() { return G.missionIndex; },
  get missionStep() { return G.missionStep; },
  get cash() { return G.cash; },
  get wanted() { return G.wanted; },
  get health() { return G.player ? G.player.health : 0; },
  get ammo() { return G.player ? G.player.ammo : 0; },
  get x() { return G.player ? G.player.x : 0; },
  get z() { return G.player ? G.player.z : 0; },
  get inCar() { return !!(G.player && G.player.car); },
  get coins() { return G.coinsTaken.size; },
  get weapon() { return G.player ? G.player.weapon : ''; },
  get fallenPeds() { return G.peds.filter((t) => t.health <= 0).length; },
  get objective() { return G.objective; },
  get cars() { return G.cars.length; },
  get peds() { return G.peds.length; },
  get rivalsLeft() { return G.rivals.filter((r) => r.health > 0).length; },
  get cops() { return G.cops.filter((c) => c.health > 0).length; },
  get policeCars() { return G.cars.filter((c) => c.kind === 'police').length; },
  teleport(x, z) {
    if (G.player.car) { G.player.car.x = x; G.player.car.z = z; }
    G.player.x = x;
    G.player.z = z;
  },
  setMission(i) { startMission(G, Math.max(0, Math.min(5, i))); },
  setWanted(n) { setWanted(G, n, false); },
  setHealth(n) { G.player.health = n; },
  setCash(n) { G.cash = n; },
  giveAmmo() { G.player.ammo = 12; },
  start() { startPlaying(); },
  attack() { playerAttack(G); },
  enterCar() { return tryEnterCar(G); },
  damage(n) { damagePlayer(G, n, 'debug'); },
  syncPolice() { syncPolice(G); },
  face(x, z) { G.player.heading = Math.atan2(x - G.player.x, z - G.player.z); },
  nearestPed() {
    let best = null;
    let bestD = Infinity;
    for (const t of G.peds) {
      if (t.health <= 0) continue;
      const d = Math.hypot(t.x - G.player.x, t.z - G.player.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best ? { x: best.x, z: best.z, health: best.health, d: bestD } : null;
  },
  nearestTraffic() {
    let best = null;
    let bestD = Infinity;
    for (const c of G.cars) {
      if (c.kind !== 'traffic') continue;
      const d = Math.hypot(c.x - G.player.x, c.z - G.player.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best ? { x: best.x, z: best.z, d: bestD } : null;
  },
  nearestRival() {
    let best = null;
    let bestD = Infinity;
    for (const t of G.rivals) {
      if (t.health <= 0) continue;
      const d = Math.hypot(t.x - G.player.x, t.z - G.player.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best ? { x: best.x, z: best.z, health: best.health, d: bestD } : null;
  },
  fare() {
    const d = G.missionData || {};
    return { fare: d.fare, phase: d.phase, timer: d.timer };
  },
  loot() {
    const d = G.missionData || {};
    return (d.loot || []).map((l) => ({ x: l.x, z: l.z, taken: l.taken }));
  },
};

// ---- Boot --------------------------------------------------------

buildWorld();
refreshTitle();
if (!renderer.available) {
  const fallback = document.getElementById('webgl-fallback');
  if (fallback) fallback.classList.remove('hidden');
}
const shot = shotName();
if (shot) applyShot(G, shot);
else showScreen('title-screen');
requestAnimationFrame(frame);
void MISSIONS;
void PLACES;
