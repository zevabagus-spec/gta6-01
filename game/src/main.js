// Solara Bay — the game itself: world state, the main loop, input, camera,
// screens (title / pause / busted / wasted / complete), damage and saving.
// Everything is wired here; the systems themselves live in their own files.
import { CFG, MISSIONS, CAR_MODELS } from './config.js';
import { clamp, dist2, angleLerp, mat4Model, mulberry32 } from './math3d.js';
import { Renderer, newTriList, pushBox } from './engine.js';
import { buildCity } from './city.js';
import { buildCarMeshes, spawnTraffic, spawnParked, updateTraffic, updatePoliceCars, resolveCarBumps } from './vehicles.js';
import { buildPersonMeshes, spawnPeds, updatePeds, updateRivals, updateCops } from './pedestrians.js';
import { createPlayer, updateOnFoot, tryPunch, tryShoot, nearestCar, collectAt } from './player.js';
import { updateDriving } from './driving.js';
import { createWanted, addWanted, updateWanted, syncPolice } from './wanted.js';
import { createMissionState, currentMission, currentStep, missionObjective, markerPos, enterStep, updateMissions } from './missions.js';
import { createHud, updateHud } from './hud.js';
import { AudioEngine } from './audio.js';
import { SaveGame, applySave } from './save.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');

function buildWorld() {
  const renderer = new Renderer(canvas);
  const rng = mulberry32(20261118);
  const city = buildCity(renderer);
  const carMeshes = buildCarMeshes(renderer);
  const personMeshes = buildPersonMeshes(renderer);
  // The player: teal jacket, dark jeans — easy to spot in a crowd.
  const playerList = newTriList();
  pushBox(playerList, 0, 0.45, 0, 0.5, 0.9, 0.3, [0.2, 0.22, 0.28]);
  pushBox(playerList, 0, 1.15, 0, 0.62, 0.7, 0.36, [0.1, 0.6, 0.55], [0.15, 0.72, 0.65]);
  pushBox(playerList, 0, 1.75, 0, 0.42, 0.42, 0.42, [0.85, 0.6, 0.45]);
  pushBox(playerList, 0, 2.0, 0, 0.44, 0.1, 0.44, [0.12, 0.12, 0.14]);
  const playerMesh = renderer.makeMesh(playerList);
  // A spinning Sun Coin, a loot bag and the three pickup kinds.
  const coinList = newTriList();
  pushBox(coinList, 0, 0, 0, 0.7, 0.7, 0.15, [1.0, 0.85, 0.25], [1.0, 0.95, 0.5]);
  const coinMesh = renderer.makeMesh(coinList);
  const bagList = newTriList();
  pushBox(bagList, 0, 0.4, 0, 0.9, 0.8, 0.6, [0.25, 0.45, 0.2], [0.4, 0.6, 0.3]);
  pushBox(bagList, 0, 0.9, 0, 0.9, 0.2, 0.6, [0.95, 0.8, 0.25]);
  const bagMesh = renderer.makeMesh(bagList);
  const pickupMeshes = {};
  const pickupCols = { health: [0.2, 0.85, 0.35], armour: [0.25, 0.5, 0.95], ammo: [0.95, 0.75, 0.2] };
  for (const [kind, col] of Object.entries(pickupCols)) {
    const l = newTriList();
    pushBox(l, 0, 0.5, 0, 0.9, 1.0, 0.9, col, col);
    pushBox(l, 0, 0.5, 0.46, 0.9, 0.3, 0.1, [1, 1, 1]);
    pickupMeshes[kind] = renderer.makeMesh(l);
  }
  // The mission marker: a slim tall gold beam the player can see across town.
  const beaconList = newTriList();
  pushBox(beaconList, 0, 10, 0, 0.6, 20, 0.6, [1.0, 0.8, 0.2], [1.0, 0.9, 0.45]);
  const beaconMesh = renderer.makeMesh(beaconList);

  const world = {
    renderer, city, carMeshes, personMeshes, playerMesh, coinMesh, bagMesh, pickupMeshes, beaconMesh,
    time: 0, clockMinutes: 540, cash: CFG.startCash,
    player: createPlayer(),
    cars: [], policeCars: [], cops: [], rivals: [], lootBags: [],
    peds: spawnPeds(rng),
    wanted: createWanted(),
    missions: createMissionState(),
    audio: new AudioEngine(),
    save: new SaveGame(),
    camera: { yaw: Math.PI, pitch: 0.28, dist: 11 },
    cameraTarget: null,
    state: 'title', frozen: false, hudVisible: false,
    toastText: '', toastUntil: 0, promptText: '', objectiveText: '',
    marker: null, scare: null, saveSoon: false, saveTimer: CFG.autosaveSeconds,
    input: { forward: false, back: false, left: false, right: false, run: false, handbrake: false },
    shake: 0,
  };
  world.cars = [...spawnTraffic(city, rng), ...spawnParked()];
  world.toast = (text, seconds) => { world.toastText = text; world.toastUntil = world.time + seconds; };
  return world;
}

const world = buildWorld();
const hud = createHud();
window.__solara = world; // exposed for automated playtests, not for play

// ---------- screens ----------
const screens = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  busted: document.getElementById('screen-busted'),
  wasted: document.getElementById('screen-wasted'),
  complete: document.getElementById('screen-complete'),
};
function showScreen(name) {
  for (const [key, node] of Object.entries(screens)) node.classList.toggle('hidden', key !== name);
  document.getElementById('hud').classList.toggle('hidden', name === 'title' || !world.hudVisible);
  if (name) statusLine.textContent = `Solara Bay — ${name} screen`;
}
function refreshTitleButtons() {
  document.getElementById('btn-continue').classList.toggle('hidden', !world.save.hasSave());
  const save = world.save.load();
  document.getElementById('title-save-line').textContent = save
    ? `Saved game: mission ${save.missionIndex + 1} of 6, $${save.cash}`
    : 'No saved game yet — start a new job.';
}

// ---------- damage / bust / wasted ----------
function damagePlayer(amount, source) {
  const p = world.player;
  if (world.state !== 'play') return;
  let left = amount;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, left * 0.6);
    p.armour -= absorbed; left -= absorbed;
  }
  p.health -= left;
  world.shake = Math.min(1, world.shake + 0.4);
  if (p.health <= 0) {
    p.health = 0;
    world.state = 'wasted';
    world.audio.wasted();
    showScreen('wasted');
    document.getElementById('wasted-line').textContent =
      `${source || 'You went down'} — the medics patch you up, minus $50.`;
  }
}
function bustPlayer() {
  if (world.state !== 'play') return;
  world.state = 'busted';
  world.audio.busted();
  showScreen('busted');
  document.getElementById('busted-line').textContent =
    `The Bay Patrol caught you — bail is $100. Mission progress is kept.`;
}

// ---------- starting / respawning ----------
function startGame(fresh) {
  if (fresh) {
    world.save.clear();
    world.missions = createMissionState();
    world.cash = CFG.startCash;
    world.player = createPlayer();
    world.wanted = createWanted();
    for (const coin of world.city.coins) coin.taken = false;
    for (const p of world.city.pickups) { p.active = true; p.timer = 0; }
    world.rivals = []; world.lootBags = []; world.cops = [];
    while (world.policeCars.length) {
      const car = world.policeCars.pop();
      const i = world.cars.indexOf(car);
      if (i >= 0) world.cars.splice(i, 1);
    }
  } else {
    const save = world.save.load();
    if (save) applySave(world, save);
  }
  world.audio.unlock();
  world.state = 'play';
  world.hudVisible = true;
  world.frozen = false;
  enterStep(world);
  const m = currentMission(world.missions);
  world.toast(`Mission ${m.id} — ${m.title}: ${m.briefing}`, 6);
  showScreen(null);
}
function respawnAfterTrouble(fine) {
  world.cash = Math.max(0, world.cash - fine);
  const p = world.player;
  p.health = CFG.maxHealth; p.armour = CFG.maxArmour; p.ammo = CFG.pistolAmmo;
  p.x = -40; p.z = 60; p.yaw = Math.PI;
  if (p.inCar && p.car) { p.car.parked = true; p.inCar = false; p.car = null; }
  world.wanted = createWanted();
  while (world.policeCars.length) {
    const car = world.policeCars.pop();
    const i = world.cars.indexOf(car);
    if (i >= 0) world.cars.splice(i, 1);
  }
  world.cops = [];
  world.state = 'play';
  showScreen(null);
  world.toast('Back on the streets of Solara Bay. Stay sharp.', 3);
}

// ---------- input ----------
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run', Space: 'handbrake',
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  const mapped = KEYMAP[e.code];
  if (mapped) world.input[mapped] = true;
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (world.state === 'play') { world.state = 'pause'; showScreen('pause'); }
    else if (world.state === 'pause') { world.state = 'play'; showScreen(null); }
  }
  if (e.code === 'Enter' && world.state === 'title') startGame(false);
  if (e.code === 'KeyE' && world.state === 'play') interact();
  if (e.code === 'KeyF' && world.state === 'play') shoot();
  if (e.code === 'Space' && world.state === 'play' && !world.player.inCar) punch();
  if (e.code === 'KeyR' && world.state === 'play') {
    world.player.ammo = CFG.pistolAmmo;
    world.toast('Pistol reloaded.', 1.5);
  }
});
window.addEventListener('keyup', (e) => {
  const mapped = KEYMAP[e.code];
  if (mapped) world.input[mapped] = false;
});
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('mousedown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  if (world.state === 'play' && !world.player.inCar) shoot();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  world.camera.yaw -= (e.clientX - lastX) * 0.005;
  world.camera.pitch = clamp(world.camera.pitch + (e.clientY - lastY) * 0.003, 0.08, 0.7);
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  world.camera.dist = clamp(world.camera.dist + Math.sign(e.deltaY) * 1.5, 7, 20);
}, { passive: false });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && world.state === 'play') { world.state = 'pause'; showScreen('pause'); }
});

// Buttons on the screens.
document.getElementById('btn-start').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume').addEventListener('click', () => { world.state = 'play'; showScreen(null); });
document.getElementById('btn-quit').addEventListener('click', () => { world.state = 'title'; refreshTitleButtons(); showScreen('title'); });
document.getElementById('btn-busted').addEventListener('click', () => respawnAfterTrouble(100));
document.getElementById('btn-wasted').addEventListener('click', () => respawnAfterTrouble(50));
document.getElementById('btn-complete').addEventListener('click', () => { world.state = 'play'; showScreen(null); });

// ---------- combat and interaction ----------
function allTargets() {
  return [...world.peds, ...world.rivals, ...world.cops];
}
function punch() {
  const hit = tryPunch(world.player, allTargets());
  if (hit) {
    world.audio.punch();
    world.scare = { x: hit.x, z: hit.z };
    if (hit.kind === 'ped') addWanted(world, 1, 'Assault on a pedestrian');
    if (hit.kind === 'cop') addWanted(world, 1, 'Assault on an officer');
    if (hit.health <= 0 && hit.kind === 'rival') world.toast('Rival down.', 1.5);
  }
}
function shoot() {
  const before = world.player.ammo;
  const hit = tryShoot(world.player, world.camera.yaw, allTargets());
  if (world.player.ammo === before) return; // on cooldown, out of ammo, or in a car
  world.audio.gunshot();
  world.scare = { x: world.player.x, z: world.player.z };
  if (hit) {
    if (hit.kind === 'ped') addWanted(world, 2, 'Shots fired at a pedestrian');
    if (hit.kind === 'cop') addWanted(world, 1, 'Shots fired at an officer');
    if (hit.health <= 0) {
      if (hit.kind === 'rival') world.toast('Rival down.', 1.5);
      if (hit.kind === 'ped') world.toast('That pedestrian is down. The police will hear about this.', 3);
    }
  }
}
function interact() {
  const p = world.player;
  const step = currentStep(world.missions);
  const events = { interacted: true, enteredCar: false, deliveredCar: false };
  if (!p.inCar) {
    const car = nearestCar(p, world.cars, 4.5);
    const missionWantsCar = step && step.type === 'enterCar';
    const missionWantsInteract = step && (step.type === 'interact' || step.type === 'taxiPickup');
    const nearMarker = step && dist2(p.x, p.z, step.pos[0], step.pos[1]) < (step.radius || 5);
    if (missionWantsInteract && nearMarker) {
      updateMissions(world, 0, events);
      return;
    }
    if (car && (!step || !nearMarker || missionWantsCar)) {
      p.inCar = true; p.car = car; p.carSpeed = 0; car.speed = 0;
      if (car.parked) { car.parked = false; car.stolen = true; addWanted(world, 1, 'Grand theft auto'); }
      world.audio.carDoor();
      world.toast(`You took the ${car.model.name}.`, 2);
      if (missionWantsCar) updateMissions(world, 0, { interacted: false, enteredCar: true, deliveredCar: false });
      return;
    }
    if (car) {
      p.inCar = true; p.car = car; p.carSpeed = 0; car.speed = 0;
      world.audio.carDoor();
      world.toast(`You took the ${car.model.name}.`, 2);
    }
  } else {
    // Step out beside the car.
    p.inCar = false;
    const car = p.car;
    p.x = car.x + Math.cos(car.yaw) * 3; p.z = car.z - Math.sin(car.yaw) * 3;
    p.yaw = car.yaw;
    p.car = null; p.carSpeed = 0;
    world.audio.carDoor();
  }
}

// ---------- per-frame update ----------
function update(dt) {
  const p = world.player;
  world.time += dt;
  world.clockMinutes = (world.clockMinutes + dt * 0.5) % 1440;
  world.shake = Math.max(0, world.shake - dt * 2);
  if (world.state !== 'play' || world.frozen) return;

  // Pickups respawn after a minute.
  for (const pk of world.city.pickups) {
    if (!pk.active) { pk.timer -= dt; if (pk.timer <= 0) pk.active = true; }
  }
  for (const coin of world.city.coins) coin.spin += dt * 3;

  const events = { interacted: false, enteredCar: false, deliveredCar: false };
  if (p.inCar && p.car) {
    p.carSpeed = updateDriving(p.car, world.input, dt, world.city, world.cars);
    p.x = p.car.x; p.z = p.car.z; p.yaw = p.car.yaw;
    world.camera.yaw = angleLerp(world.camera.yaw, p.car.yaw, Math.min(1, dt * 1.5));
  } else {
    updateOnFoot(p, world.input, world.camera.yaw, dt, world.city);
    p.carSpeed = 0;
  }
  updateTraffic(world.cars, dt, world.cars);
  resolveCarBumps(world.cars);
  updatePeds(world.peds, dt, world.city, p, world.scare);
  world.scare = null;
  const rivalsAlive = updateRivals(world.rivals, dt, p, world.city, (r, d) => {
    world.audio.gunshot();
    if (Math.random() < clamp(0.55 - d * 0.012, 0.12, 0.55)) damagePlayer(7, 'A Harbor rival shot you');
  });
  updateCops(world.cops, dt, p, world.city, (cop, d) => {
    world.audio.gunshot();
    if (Math.random() < clamp(0.5 - d * 0.012, 0.1, 0.5)) damagePlayer(6, 'A Bay Patrol officer shot you');
  }, () => bustPlayer());
  updatePoliceCars(world.policeCars, p, dt, world.city, (car) => {
    world.audio.crash();
    damagePlayer(p.inCar ? 6 : 15, 'A patrol car rammed you');
  });
  updateWanted(world, dt, world.policeCars);
  syncPolice(world, mulberry32(Math.floor(world.time * 10) + 5));
  updateMissions(world, dt, events);
  if (world.state === 'complete') {
    const taken = world.city.coins.filter((c) => c.taken).length;
    document.getElementById('complete-line').textContent =
      `All six missions done — $${world.cash} in cash, ${taken} Sun Coins found. ` +
      'The Marina heist is yours, the Bay Patrol lost your trail, and Solara Bay is Dario\'s town now.';
    showScreen('complete');
  }
  world.objectiveText = missionObjective(world.missions);
  world.marker = markerPos(world.missions);

  // Collect coins and pickups on foot or in a slow car.
  const got = collectAt(p, world.city, world);
  if (got) {
    if (got.kind === 'coin') { world.audio.coin(); world.toast(`Sun Coin +$${got.value}`, 1.5); }
    else { world.audio.pickup(); world.toast(`${got.kind === 'health' ? 'Health' : got.kind === 'armour' ? 'Armour' : 'Ammo'} restored.`, 2); }
  }
  // Prompt line: what E does right now.
  const step = currentStep(world.missions);
  if (step && !p.inCar) {
    const d = step ? dist2(p.x, p.z, step.pos[0], step.pos[1]) : 999;
    if ((step.type === 'interact' || step.type === 'taxiPickup') && d < (step.radius || 5)) world.promptText = '[E] Interact';
    else {
      const car = nearestCar(p, world.cars, 4.5);
      world.promptText = car ? `[E] Steal the ${car.model.name}` : '';
    }
  } else if (p.inCar) {
    world.promptText = '[E] Leave car   [Space] Handbrake';
  } else world.promptText = '';

  // Audio follows the world.
  world.audio.setEngine(p.carSpeed, p.inCar);
  world.audio.setSiren(world.wanted.level);

  // Saving: every 15 seconds, or right after a mission completes.
  world.saveTimer -= dt;
  if (world.saveSoon || world.saveTimer <= 0) {
    world.save.save(world);
    world.saveSoon = false;
    world.saveTimer = CFG.autosaveSeconds;
  }
}

// ---------- rendering ----------
function render() {
  const r = world.renderer;
  if (!r.ok) return;
  const p = world.player;
  // Camera target: the player, or the staged target for title / shots.
  let tx = p.x, tz = p.z;
  if (world.cameraTarget) { tx = world.cameraTarget.x; tz = world.cameraTarget.z; }
  if (world.state === 'title') {
    world.camera.yaw += 0.0004;
    world.camera.dist = 90;
  }
  const camYaw = world.camera.yaw;
  const dist = world.camera.dist;
  const pitch = world.camera.pitch;
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const eyeX = tx - fx * dist * Math.cos(pitch) + (Math.random() - 0.5) * world.shake * 0.3;
  const eyeY = 2 + dist * Math.sin(pitch) + (Math.random() - 0.5) * world.shake * 0.3;
  const eyeZ = tz - fz * dist * Math.cos(pitch);
  r.beginFrame({ eye: [eyeX, eyeY, eyeZ], target: [tx, 1.5, tz] });
  r.drawStatic(world.city.mesh);
  // Mission beacon.
  if (world.marker && world.state !== 'title') {
    r.drawMesh(world.beaconMesh, mat4Model(world.marker.x, 0, world.marker.z, 0, 1, 1, 1),
      0.12 + Math.sin(world.time * 4) * 0.06);
  }
  // Sun Coins.
  for (const coin of world.city.coins) {
    if (coin.taken) continue;
    r.drawMesh(world.coinMesh, mat4Model(coin.x, 1.1 + Math.sin(world.time * 2 + coin.spin) * 0.15, coin.z, coin.spin, 1, 1, 1), 0.15);
  }
  // Pickups.
  for (const pk of world.city.pickups) {
    if (!pk.active) continue;
    r.drawMesh(world.pickupMeshes[pk.kind], mat4Model(pk.x, 0.3 + Math.sin(world.time * 3) * 0.15, pk.z, world.time * 0.8, 1, 1, 1), 0.1);
  }
  // Loot bags.
  for (const bag of world.lootBags) {
    if (bag.taken) continue;
    r.drawMesh(world.bagMesh, mat4Model(bag.x, 0, bag.z, 0.4, 1, 1, 1), 0.12);
  }
  // Cars: traffic, parked, police, and the player's own.
  for (const car of world.cars) {
    const flash = car.police ? (world.time % 0.6 < 0.3 ? 0.12 : 0.02) : 0;
    r.drawMesh(world.carMeshes[car.modelKey], mat4Model(car.x, 0, car.z, car.yaw, 1, 1, 1), flash);
  }
  // People.
  for (const ped of world.peds) {
    if (ped.health <= 0) continue;
    const bob = ped.speed > 0 ? Math.sin(world.time * 10 + ped.x) * 0.05 : 0;
    r.drawMesh(world.personMeshes[ped.meshKey], mat4Model(ped.x, bob, ped.z, ped.yaw, 1, 1, 1), 0);
  }
  for (const rival of world.rivals) {
    if (rival.health <= 0) continue;
    r.drawMesh(world.personMeshes.rival, mat4Model(rival.x, 0, rival.z, rival.yaw, 1, 1, 1), 0);
  }
  for (const cop of world.cops) {
    r.drawMesh(world.personMeshes.cop, mat4Model(cop.x, 0, cop.z, cop.yaw, 1, 1, 1), 0);
  }
  // The player, on foot only — inside a car the car is the player.
  if (!p.inCar) {
    const bob = p.moving ? Math.sin(world.time * 12) * 0.06 : 0;
    r.drawMesh(world.playerMesh, mat4Model(p.x, bob, p.z, p.yaw, 1, 1, 1), 0.05);
  }
  updateHud(hud, world);
}

// ---------- boot ----------
function boot() {
  const r = world.renderer;
  if (!r.ok) {
    document.getElementById('webgl-fallback').classList.remove('hidden');
    showScreen(null);
    return;
  }
  // Screenshot staging: ?shot=cover|street|mission|title
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    applyShot(world, shot);
    if (shot === 'title') { refreshTitleButtons(); showScreen('title'); }
    else showScreen(null);
  } else {
    refreshTitleButtons();
    showScreen('title');
  }
  world.objectiveText = missionObjective(world.missions);
  world.marker = markerPos(world.missions);
  let last = performance.now();
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot();
