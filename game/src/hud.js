// HUD: cash, health, weapon, sun coins, wanted stars, mission panel, speed,
// toasts and prompts in the DOM, plus a live canvas minimap showing roads,
// the player arrow, police, the mission marker and nearby coins.
import { clampNumber, distance2D } from './rng.js';
import { ROAD_LINES, WORLD_HALF, districtAt } from './city.js';

export function createHud(documentRef) {
  const $ = (id) => documentRef.getElementById(id);
  const els = {
    hud: $('hud'),
    cash: $('cash-display'),
    healthFill: $('health-fill'),
    weapon: $('weapon-label'),
    ammo: $('ammo-display'),
    coins: $('collectible-display'),
    stars: $('wanted-stars'),
    missionTitle: $('mission-title'),
    missionObjective: $('mission-objective'),
    missionDistance: $('mission-distance'),
    speed: $('speed-display'),
    toast: $('message-toast'),
    prompt: $('interaction-prompt'),
    hint: $('controls-hint'),
  };
  const minimap = $('minimap-canvas');
  const mctx = minimap.getContext('2d');
  let toastTimer = 0;
  let lastObjectiveKey = '';

  function showToast(text, seconds) {
    els.toast.textContent = text;
    els.toast.classList.remove('hidden');
    toastTimer = seconds || 3.5;
  }

  function drawMinimap(world, objective) {
    const size = minimap.width;
    const half = size / 2;
    const range = 130;
    const scale = half / range;
    mctx.clearRect(0, 0, size, size);
    mctx.save();
    mctx.beginPath();
    mctx.arc(half, half, half - 2, 0, Math.PI * 2);
    mctx.clip();
    mctx.fillStyle = '#2c3e46';
    mctx.fillRect(0, 0, size, size);
    const px = world.player.x;
    const pz = world.player.z;
    const toMap = (x, z) => [half + (x - px) * scale, half + (z - pz) * scale];
    // City blocks.
    mctx.fillStyle = '#4a5a52';
    for (let bx = -180; bx <= 180; bx += 60) {
      for (let bz = -180; bz <= 180; bz += 60) {
        const [mx, mz] = toMap(bx, bz);
        mctx.fillRect(mx - 23 * scale, mz - 23 * scale, 46 * scale, 46 * scale);
      }
    }
    // Roads.
    mctx.strokeStyle = '#20262b';
    mctx.lineWidth = 14 * scale;
    for (const line of ROAD_LINES) {
      const [mx] = toMap(line, 0);
      mctx.beginPath();
      mctx.moveTo(mx, 0);
      mctx.lineTo(mx, size);
      mctx.stroke();
      const [, mz] = toMap(0, line);
      mctx.beginPath();
      mctx.moveTo(0, mz);
      mctx.lineTo(size, mz);
      mctx.stroke();
    }
    // Water on the west edge.
    const [waterX] = toMap(-236, 0);
    mctx.fillStyle = '#2e7fa8';
    mctx.fillRect(0, 0, waterX + 6 * scale, size);
    // Coins.
    mctx.fillStyle = '#ffd76a';
    for (const coin of world.coins) {
      if (coin.collected) continue;
      const [mx, mz] = toMap(coin.x, coin.z);
      if (mx < -5 || mx > size + 5 || mz < -5 || mz > size + 5) continue;
      mctx.beginPath();
      mctx.arc(mx, mz, 3, 0, Math.PI * 2);
      mctx.fill();
    }
    // Police blips.
    for (const car of world.vehicles.cars) {
      if (car.kind !== 'police' || car.dead) continue;
      const [mx, mz] = toMap(car.x, car.z);
      mctx.fillStyle = '#ff5a3c';
      mctx.fillRect(mx - 3, mz - 3, 6, 6);
    }
    for (const ped of world.peds.peds) {
      if (ped.kind !== 'officer' || ped.dead) continue;
      const [mx, mz] = toMap(ped.x, ped.z);
      mctx.fillStyle = '#ff8a5c';
      mctx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    // Mission marker: gold diamond, clamped to the rim when far.
    if (objective && objective.x !== null && objective.x !== undefined) {
      let dx = (objective.x - px) * scale;
      let dz = (objective.z - pz) * scale;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const maxR = half - 14;
      if (dist > maxR) { dx = (dx / dist) * maxR; dz = (dz / dist) * maxR; }
      const mx = half + dx;
      const mz = half + dz;
      mctx.fillStyle = '#ffd76a';
      mctx.beginPath();
      mctx.moveTo(mx, mz - 8);
      mctx.lineTo(mx + 6, mz);
      mctx.lineTo(mx, mz + 8);
      mctx.lineTo(mx - 6, mz);
      mctx.closePath();
      mctx.fill();
      mctx.strokeStyle = '#7a5200';
      mctx.lineWidth = 1.5;
      mctx.stroke();
    }
    // Player arrow: rotate the up-pointing triangle to the facing on the
    // map, where +x is right and +z is down.
    mctx.save();
    mctx.translate(half, half);
    mctx.rotate(Math.atan2(-Math.cos(world.player.heading), Math.sin(world.player.heading)) + Math.PI / 2);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -9);
    mctx.lineTo(6, 7);
    mctx.lineTo(0, 3);
    mctx.lineTo(-6, 7);
    mctx.closePath();
    mctx.fill();
    mctx.strokeStyle = '#1a0f2e';
    mctx.lineWidth = 1.5;
    mctx.stroke();
    mctx.restore();
    mctx.restore();
    // Rim ring.
    mctx.strokeStyle = 'rgba(255,255,255,0.7)';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.arc(half, half, half - 2, 0, Math.PI * 2);
    mctx.stroke();
  }

  return {
    show() { els.hud.classList.remove('hidden'); },
    hide() { els.hud.classList.add('hidden'); },
    showToast,
    setPrompt(text) {
      if (!text) {
        els.prompt.classList.add('hidden');
        return;
      }
      els.prompt.textContent = text;
      els.prompt.classList.remove('hidden');
    },
    update(dt, world, objective) {
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) els.toast.classList.add('hidden');
      }
      const player = world.player;
      els.cash.textContent = '$' + player.cash.toLocaleString('en-US');
      els.healthFill.style.width = clampNumber((player.health / player.maxHealth) * 100, 0, 100) + '%';
      els.weapon.textContent = player.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
      els.ammo.textContent = player.weapon === 'pistol'
        ? (player.reloadTimer > 0 ? 'RELOADING…' : player.ammo + ' / ' + player.reserveAmmo)
        : '';
      const found = world.coins.filter((c) => c.collected).length;
      els.coins.textContent = found + ' / ' + world.coins.length;
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < player.wanted ? '★' : '☆';
      els.stars.textContent = player.wanted > 0 ? stars : '';
      els.stars.classList.toggle('cooling', player.cooling && player.wanted > 0);
      els.missionTitle.textContent = objective.title;
      els.missionObjective.textContent = objective.text;
      let distText = districtAt(player.x, player.z);
      if (objective.x !== null && objective.x !== undefined) {
        const d = Math.round(distance2D(player.x, player.z, objective.x, objective.z));
        distText += '  ·  ' + d + 'm to objective';
      }
      if (objective.timer > 0) distText += '  ·  ' + Math.ceil(objective.timer) + 's left';
      els.missionDistance.textContent = distText;
      if (player.inCar && player.car) {
        els.speed.classList.remove('hidden');
        els.speed.textContent = Math.round(Math.abs(player.car.speed) * 2.2) + ' mph';
      } else {
        els.speed.classList.add('hidden');
      }
      const key = objective.title + '|' + objective.text;
      if (key !== lastObjectiveKey) lastObjectiveKey = key;
      drawMinimap(world, objective);
      void WORLD_HALF;
    },
  };
}
