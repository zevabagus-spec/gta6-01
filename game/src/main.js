// Solmar Heat: boot, game loop, screen state machine, chase camera, save
// flow and the debug handle. Wires every system together and owns the
// per-frame draw list. No network, no libraries — just these modules.
import { createSeededRandom, clampNumber, distance2D, lerpNumber } from './rng.js';
import { perspectiveMatrix, lookAtMatrix, multiplyMatrices } from './vecmath.js';
import { buildCity, resolveCircleCollision } from './city.js';
import { createRenderer, buildStaticVertices } from './renderer.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSaveData, saveGameData, defaultSaveData, hasSaveData } from './savegame.js';
import { createVehicleManager, CAR_MODELS } from './vehicles.js';
import { createPedestrianManager } from './pedestrians.js';
import { createPlayer, updatePlayerOnFoot, damagePlayer, healPlayer, raiseWanted, lowerWanted, enterCar, exitCar, syncPlayerToCar, drawPlayer } from './player.js';
import { tryPunch, tryShoot, startReload, switchWeapon, ammoPickupValue } from './combat.js';
import { createPoliceSystem, bustPenalty, wastedPenalty } from './police.js';
import { createMissionManager, MISSIONS } from './missions.js';
import { createHud } from './hud.js';
import { createEffects } from './effects.js';
import { parseShotParams, stageShotScene } from './shots.js';

const $ = (id) => document.getElementById(id);
window.__gameErrors = [];
window.addEventListener('error', (event) => {
  window.__gameErrors.push(String(event.message || 'unknown error'));
});

function showOnly(overlayId) {
  const ids = ['title-screen', 'help-screen', 'pause-screen', 'busted-screen', 'wasted-screen', 'mission-screen', 'story-screen'];
  for (const id of ids) $(id).classList.toggle('hidden', id !== overlayId);
  if (!overlayId) {
    for (const id of ids) $(id).classList.add('hidden');
  }
}

export function bootGame() {
  const params = parseShotParams(window.location.search);
  const rand = createSeededRandom(params.seed);
  const canvas = $('game-canvas');
  const city = buildCity(rand);
  const audio = createAudio();
  const effects = createEffects();
  const input = createInput(canvas);
  const hud = createHud(document);
  const saved = loadSaveData();

  const renderer = createRenderer(canvas, {
    onContextLost() { $('context-lost-screen').classList.remove('hidden'); },
    onContextRestored() { $('context-lost-screen').classList.add('hidden'); },
  });
  if (!renderer.ready) {
    showOnly(null);
    $('no-webgl-screen').classList.remove('hidden');
    $('title-screen').classList.add('hidden');
    return null;
  }
  renderer.setStaticGeometry(buildStaticVertices(city));

  const player = createPlayer(city.locations.hideout.x, city.locations.hideout.z);
  const vehicles = createVehicleManager(rand, city, audio, effects);
  const peds = createPedestrianManager(rand, city, audio, effects);
  vehicles.populate();
  peds.populate();
  const police = createPoliceSystem(rand, vehicles, peds, audio);

  const coins = city.coinSpots.map((spot) => ({ ...spot, collected: false }));
  const world = {
    player, vehicles, peds, city, effects, audio, hud, coins,
    cameraYaw: Math.PI, cameraPitch: 0.32,
    missions: null,
    raiseWanted(amount) { raiseWanted(player, amount); },
    enterCarDirect(car) {
      enterCar(player, car, false);
      car.playerOwned = true;
    },
  };
  const missions = createMissionManager(city, {
    onObjective(title, text) { hud.showToast(title + ' — ' + text, 4); },
    onMessage(text) { hud.showToast(text, 5); },
    onMissionStart() { audio.missionComplete(); },
    onMissionComplete(mission) {
      audio.missionComplete();
      showMissionComplete(mission);
      autosave();
    },
    onMissionFailed(reason) { hud.showToast(reason, 5); },
    onStoryComplete(mission) {
      audio.missionComplete();
      showStoryComplete(mission);
      autosave();
    },
  });
  world.missions = missions;

  let screen = 'title';
  let cameraPos = [player.x, 8, player.z + 12];
  let elapsed = 0;
  let autosaveTimer = 0;
  let ramCooldown = 0;
  let helpReturn = 'title';
  let titleOrbit = 0;

  function collectSaveData() {
    return {
      ...defaultSaveData(),
      cash: player.cash,
      missionIndex: Math.min(missions.state.missionIndex, MISSIONS.length),
      completedMissions: MISSIONS.map((m, i) => i).filter((i) => i < missions.state.missionIndex),
      collectedCoins: coins.filter((c) => c.collected).map((c) => c.id),
      health: Math.max(1, Math.round(player.health)),
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo,
      kills: player.kills,
      carsStolen: player.carsStolen,
      coinsFound: player.coinsFound,
      storyDone: missions.state.storyDone,
      playerX: player.x,
      playerZ: player.z,
      playSeconds: Math.round(elapsed),
    };
  }

  function autosave() {
    saveGameData(collectSaveData());
  }

  function applySave(data) {
    player.cash = data.cash;
    player.health = data.health;
    player.ammo = data.ammo;
    player.reserveAmmo = data.reserveAmmo;
    player.kills = data.kills;
    player.carsStolen = data.carsStolen;
    player.coinsFound = data.coinsFound;
    player.x = data.playerX;
    player.z = data.playerZ;
    missions.state.missionIndex = data.missionIndex;
    missions.state.storyDone = data.storyDone;
    for (const coin of coins) coin.collected = data.collectedCoins.includes(coin.id);
  }

  function startPlaying(fromSave) {
    if (fromSave && saved) applySave(saved);
    screen = 'playing';
    showOnly(null);
    hud.show();
    audio.unlock();
    if (!fromSave) hud.showToast('Go to Ilsa\u2019s office — the gold beacon marks it.', 5);
  }

  function showMissionComplete(mission) {
    screen = 'mission';
    $('mission-complete-title').textContent = mission.title;
    $('mission-complete-text').textContent = 'Ilsa pays up. The debt gets smaller — and Solmar Bay gets louder.';
    $('mission-complete-reward').textContent = '+$' + mission.reward;
    showOnly('mission-screen');
  }

  function showStoryComplete() {
    screen = 'story';
    showOnly('story-screen');
  }

  function pauseGame() {
    if (screen !== 'playing') return;
    screen = 'paused';
    $('pause-summary').textContent = '$' + player.cash + '  ·  Job ' + Math.min(missions.state.missionIndex + 1, 6) + ' of 6  ·  ' + coins.filter((c) => c.collected).length + ' sun coins';
    showOnly('pause-screen');
    autosave();
  }

  function resumeGame() {
    if (screen !== 'paused') return;
    screen = 'playing';
    showOnly(null);
    input.clearAllKeys();
  }

  function triggerBusted() {
    const fine = bustPenalty(player);
    police.clearAll();
    missions.resetToIdle(world);
    if (player.inCar) exitCar(player, city.colliders);
    player.x = city.locations.station.x;
    player.z = city.locations.station.z;
    player.health = Math.max(player.health, 40);
    $('busted-text').textContent = 'The Solmar Bay police hauled Mara in. Bail took $' + fine + '.';
    audio.busted();
    screen = 'busted';
    showOnly('busted-screen');
    autosave();
  }

  function triggerWasted() {
    const bill = wastedPenalty(player);
    police.clearAll();
    missions.resetToIdle(world);
    if (player.inCar) exitCar(player, city.colliders);
    player.x = city.locations.clinic.x;
    player.z = city.locations.clinic.z;
    player.health = player.maxHealth;
    $('wasted-text').textContent = 'Mara woke up at the Marina clinic. The bill was $' + bill + '.';
    audio.wasted();
    screen = 'wasted';
    showOnly('wasted-screen');
    autosave();
  }

  function onPlayerHit(amount) {
    if (screen !== 'playing') return;
    const dead = damagePlayer(player, amount);
    effects.hitSparks(player.x, 1.4, player.z);
    audio.punch();
    if (dead) triggerWasted();
  }

  function onKill(ped) {
    player.kills += 1;
    player.reserveAmmo = Math.min(999, player.reserveAmmo + ammoPickupValue());
    effects.coinSparkle(ped.x, 1.2, ped.z);
    hud.showToast('Down. +12 reserve ammo.', 2);
    raiseWanted(player, 1);
  }

  function onGunNoise() {
    peds.scareNearby(player.x, player.z, 40);
    raiseWanted(player, 1);
  }

  function tryEnterExitCar() {
    if (player.inCar) {
      exitCar(player, city.colliders);
      audio.doorSlam();
      return;
    }
    const car = vehicles.nearestCar(player.x, player.z, 4.5, ['parked', 'traffic']);
    if (!car) return;
    const stolen = !car.playerOwned;
    enterCar(player, car, stolen);
    car.playerOwned = true;
    audio.engineStart();
    if (stolen) {
      raiseWanted(player, 1);
      hud.showToast('Car stolen — ' + car.model.name + '. The bay noticed.', 3);
    }
  }

  function updatePlaying(dt) {
    const [moveX, moveZ] = input.axis();
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    // Camera orbit from mouse drag, then gentle auto-align behind motion.
    world.cameraYaw -= input.state.dragDX * 0.005;
    world.cameraPitch = clampNumber(world.cameraPitch + input.state.dragDY * 0.003, 0.12, 0.9);
    if (input.isDown('KeyQ')) world.cameraYaw += 1.6 * dt;

    if (input.wasPressed('KeyE')) tryEnterExitCar();
    if (input.wasPressed('KeyF')) tryPunch(player, peds, audio, effects, onKill);
    if (input.wasPressed('KeyJ') || input.state.mouseClicked) tryShoot(player, peds, audio, effects, onKill, onGunNoise);
    if (input.wasPressed('Digit1')) switchWeapon(player, 'fists');
    if (input.wasPressed('Digit2')) switchWeapon(player, 'pistol');
    if (input.wasPressed('KeyR')) startReload(player);
    if (input.wasPressed('KeyH') && player.inCar) audio.horn();
    if (input.wasPressed('KeyM')) {
      const muted = audio.toggleMute();
      hud.showToast(muted ? 'Sound muted' : 'Sound on', 2);
    }
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) { pauseGame(); return; }
    // Safety net: health at zero means wasted, whatever reduced it.
    if (player.health <= 0) { triggerWasted(); return; }

    if (player.inCar && player.car) {
      if (player.car.health <= 0) {
        player.car.speed = 0;
        hud.setPrompt('E — GET OUT (engine dead)');
      } else {
        hud.setPrompt('E — GET OUT  ·  H — HORN');
      }
      vehicles.drivePlayerCar(player.car, moveX, moveZ, input.isDown('Space'), dt);
      syncPlayerToCar(player);
      if (Math.abs(player.car.speed) > 20 && Math.random() < 0.18) {
        const side = Math.random() < 0.5 ? 1.2 : -1.2;
        const px = player.x + Math.cos(player.heading) * side - Math.sin(player.heading) * 2;
        const pz = player.z + Math.sin(player.heading) * side + Math.cos(player.heading) * 2;
        effects.dustPuff(px, 0.2, pz);
      }
    } else {
      updatePlayerOnFoot(player, moveX, moveZ, sprint, world.cameraYaw, dt, city.colliders);
      const nearCar = vehicles.nearestCar(player.x, player.z, 4.5, ['parked', 'traffic']);
      hud.setPrompt(nearCar ? 'E — ' + (nearCar.playerOwned ? 'GET IN: ' : 'STEAL: ') + nearCar.model.name : '');
    }
    // Police cars ramming Mara on foot hurt.
    ramCooldown = Math.max(0, ramCooldown - dt);
    if (!player.inCar && ramCooldown <= 0) {
      for (const car of vehicles.cars) {
        if (car.kind !== 'police' || car.dead) continue;
        if (distance2D(car.x, car.z, player.x, player.z) < 2.6 && Math.abs(car.speed) > 5) {
          ramCooldown = 1.0;
          onPlayerHit(12);
          break;
        }
      }
    }
    vehicles.update(dt, player, player.wanted);
    peds.update(dt, player, onPlayerHit);
    const policeResult = police.update(dt, player);
    if (policeResult.busted) { triggerBusted(); return; }
    missions.update(dt, world);
    // Sun coins.
    for (const coin of coins) {
      if (coin.collected) continue;
      if (distance2D(player.x, player.z, coin.x, coin.z) < 2.4) {
        coin.collected = true;
        player.coinsFound += 1;
        player.cash += 25;
        audio.coin();
        effects.coinSparkle(coin.x, 1.2, coin.z);
        hud.showToast('Sun coin! +$25  (' + player.coinsFound + ' / 20)', 2.5);
      }
    }
    effects.update(dt);
    audio.update(dt, player.inCar, player.inCar && player.car ? player.car.speed : 0, player.wanted);
    autosaveTimer += dt;
    if (autosaveTimer > 20) { autosaveTimer = 0; autosave(); }
    // Safety net: a non-finite position can never strand the player.
    if (!Number.isFinite(player.x) || !Number.isFinite(player.z)) {
      player.x = city.locations.hideout.x;
      player.z = city.locations.hideout.z;
      if (player.car) { player.car.x = player.x; player.car.z = player.z; }
    }
  }

  function computeCamera(dt) {
    const targetX = player.x;
    const targetZ = player.z;
    const dist = player.inCar ? 12.5 : 9.5;
    const height = dist * Math.sin(world.cameraPitch) + 2.2;
    const back = dist * Math.cos(world.cameraPitch);
    const desiredX = targetX - Math.sin(world.cameraYaw) * back;
    const desiredZ = targetZ + Math.cos(world.cameraYaw) * back;
    const t = 1 - Math.exp(-6 * dt);
    cameraPos[0] = lerpNumber(cameraPos[0], desiredX, t);
    cameraPos[1] = lerpNumber(cameraPos[1], height, t);
    cameraPos[2] = lerpNumber(cameraPos[2], desiredZ, t);
    // Keep the camera out of buildings.
    const [cx, cz] = resolveCircleCollision(cameraPos[0], cameraPos[2], 1.2, city.colliders);
    cameraPos[0] = cx;
    cameraPos[2] = cz;
    return {
      eye: [cameraPos[0], Math.max(2.2, cameraPos[1]), cameraPos[2]],
      target: [targetX, 2.0, targetZ],
    };
  }

  function drawFrame(dt) {
    let eye;
    let target;
    if (screen === 'title' || screen === 'help') {
      titleOrbit += dt * 0.05;
      const cx = city.locations.towerPlaza.x + Math.sin(titleOrbit) * 55;
      const cz = city.locations.towerPlaza.z + Math.cos(titleOrbit) * 55;
      eye = [cx, 26, cz];
      target = [city.locations.towerPlaza.x, 6, city.locations.towerPlaza.z];
    } else {
      const cam = computeCamera(dt);
      eye = cam.eye;
      target = cam.target;
    }
    const aspect = canvas.width / Math.max(1, canvas.height);
    const proj = perspectiveMatrix(1.05, aspect, 0.5, 900);
    const view = lookAtMatrix(eye, target, [0, 1, 0]);
    const viewProj = multiplyMatrices(proj, view);
    const drawList = { boxes: [], groundQuads: [], wallQuads: [], billboards: [], cameraYaw: world.cameraYaw };
    world.lastCamera = { eye: eye.slice(), target: target.slice() };
    // Sun billboard + drifting clouds.
    drawList.billboards.push({ x: eye[0] + 180, y: 90, z: eye[2] - 260, size: 46, color: [1.0, 0.85, 0.55], glow: 1.0 });
    for (let i = 0; i < 6; i += 1) {
      const cx = ((i * 137 + elapsed * 2) % 480) - 240;
      drawList.boxes.push({ x: cx, y: 78 + (i % 3) * 6, z: -180 + i * 62, sx: 26, sy: 3, sz: 10, ry: 0, color: [1.0, 0.95, 0.92], glow: 0.25 });
    }
    for (const coin of coins) {
      if (coin.collected) continue;
      const bob = 1.1 + Math.sin(elapsed * 2 + coin.id) * 0.25;
      drawList.boxes.push({ x: coin.x, y: bob, z: coin.z, sx: 1.1, sy: 1.1, sz: 0.25, ry: elapsed * 2 + coin.id, color: [1.0, 0.85, 0.25], glow: 0.9 });
    }
    vehicles.drawInto(drawList, elapsed);
    peds.drawInto(drawList, elapsed);
    drawPlayer(drawList, player);
    const objective = missions.currentObjective(world);
    if (objective.x !== null && objective.x !== undefined && screen !== 'title') {
      effects.drawBeacon(drawList, objective.x, objective.z, elapsed);
    }
    effects.drawInto(drawList, elapsed);
    renderer.renderFrame(viewProj, elapsed, drawList, eye);
    if (screen === 'playing' || screen === 'paused') hud.update(dt, world, objective);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.resize(Math.floor(window.innerWidth * dpr), Math.floor(window.innerHeight * dpr));
  }
  window.addEventListener('resize', resize);
  resize();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
  window.addEventListener('keydown', () => audio.unlock());

  // Menu wiring.
  $('start-button').addEventListener('click', () => startPlaying(false));
  $('continue-button').addEventListener('click', () => startPlaying(true));
  $('help-button').addEventListener('click', () => { helpReturn = 'title'; showOnly('help-screen'); });
  $('help-close-button').addEventListener('click', () => showOnly(helpReturn === 'pause' ? 'pause-screen' : 'title-screen'));
  $('resume-button').addEventListener('click', resumeGame);
  $('pause-help-button').addEventListener('click', () => { helpReturn = 'pause'; showOnly('help-screen'); });
  $('restart-button').addEventListener('click', () => {
    const data = loadSaveData();
    if (data) applySave(data);
    lowerWanted(player);
    police.clearAll();
    missions.resetToIdle(world);
    resumeGame();
  });
  $('quit-button').addEventListener('click', () => {
    autosave();
    screen = 'title';
    hud.hide();
    showOnly('title-screen');
  });
  $('busted-button').addEventListener('click', () => { screen = 'playing'; showOnly(null); });
  $('wasted-button').addEventListener('click', () => { screen = 'playing'; showOnly(null); });
  $('mission-continue-button').addEventListener('click', () => { screen = 'playing'; showOnly(null); });
  $('story-continue-button').addEventListener('click', () => { screen = 'playing'; showOnly(null); });

  if (hasSaveData() && saved) {
    $('continue-button').classList.remove('hidden');
    $('title-stats').textContent = 'SAVED GAME — $' + saved.cash + ' · JOB ' + Math.min(saved.missionIndex + 1, 6) + ' OF 6 · ' + saved.collectedCoins.length + ' SUN COINS';
  }
  if (params.shot) {
    // Deterministic staging: skip the title, drop straight into the scene.
    screen = 'playing';
    showOnly(null);
    hud.show();
    stageShotScene(world, params.shot);
    cameraPos = [player.x - Math.sin(world.cameraYaw) * 10, 6, player.z + Math.cos(world.cameraYaw) * 10];
  }

  window.__game = {
    world, player, vehicles, peds, missions, police, city, coins,
    get screen() { return screen; },
    teleport(x, z) {
      player.x = x;
      player.z = z;
      if (player.car) { player.car.x = x; player.car.z = z; }
    },
    setWanted(n) { player.wanted = clampNumber(n, 0, 5); },
    giveCash(n) { player.cash += n; },
    startMission(i) { missions.startMission(world, i); },
    pauseGame, resumeGame,
    damagePlayer(amount) { onPlayerHit(amount); },
    triggerBusted, triggerWasted,
    saveNow() { autosave(); },
    version: 'solmar-heat-round4',
  };
  window.__gameReady = true;

  let lastTime = performance.now();
  function frame(now) {
    const dt = clampNumber((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;
    elapsed += dt;
    if (screen === 'playing') updatePlaying(dt);
    else if (screen === 'title' || screen === 'help') {
      effects.update(dt);
      vehicles.update(dt, player, 0);
      peds.update(dt, player, () => {});
    }
    drawFrame(dt);
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return world;
}

bootGame();
