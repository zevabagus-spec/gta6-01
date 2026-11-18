// Solara Bay — the HUD and the minimap. Cash, health and armour bars, wanted
// stars, ammo, the in-game clock, the current objective, the speedometer and
// a canvas minimap showing streets, the player, police, the mission marker
// and Sun Coins. All DOM, updated from the world each frame.
import { CFG, districtAt } from './config.js';

function el(id) { return document.getElementById(id); }
function starRow(level) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < level ? '★' : '☆';
  return s;
}

export function createHud() {
  return {
    cash: el('hud-cash'), mission: el('hud-mission'), objective: el('hud-objective'),
    healthFill: el('hud-health-fill'), armourFill: el('hud-armour-fill'),
    healthText: el('hud-health-text'), stars: el('hud-stars'), clock: el('hud-clock'),
    ammo: el('hud-ammo'), speed: el('hud-speed'), district: el('hud-district'),
    toast: el('hud-toast'), minimap: el('minimap'),
    prompt: el('hud-prompt'), coins: el('hud-coins'),
  };
}

export function updateHud(hud, world) {
  const p = world.player;
  hud.cash.textContent = `$${world.cash}`;
  const m = world.missions;
  hud.mission.textContent = m.done ? 'THE SOLARA JOB — COMPLETE' : `MISSION ${m.index + 1}/6`;
  hud.objective.textContent = world.objectiveText || '';
  hud.healthFill.style.width = `${Math.max(0, p.health)}%`;
  hud.armourFill.style.width = `${Math.max(0, p.armour)}%`;
  hud.healthText.textContent = `HP ${Math.ceil(p.health)}  ARM ${Math.ceil(p.armour)}`;
  hud.stars.textContent = starRow(world.wanted.level);
  hud.stars.classList.toggle('hot', world.wanted.level >= 3);
  const hh = String(Math.floor(world.clockMinutes / 60) % 24).padStart(2, '0');
  const mm = String(Math.floor(world.clockMinutes % 60)).padStart(2, '0');
  hud.clock.textContent = `${hh}:${mm}`;
  hud.ammo.textContent = p.inCar ? '—' : `AMMO ${p.ammo}`;
  const kmh = Math.round(Math.abs(p.carSpeed || 0) * 3.2);
  hud.speed.textContent = p.inCar ? `${kmh} km/h` : '';
  hud.district.textContent = districtAt(p.x, p.z);
  const taken = world.city.coins.filter((c) => c.taken).length;
  hud.coins.textContent = `☀ ${taken}/${CFG.coinCount}`;
  if (world.toastUntil > world.time) {
    hud.toast.textContent = world.toastText;
    hud.toast.style.opacity = '1';
  } else {
    hud.toast.style.opacity = '0';
  }
  hud.prompt.textContent = world.promptText || '';
  drawMinimap(hud.minimap, world);
}

function drawMinimap(canvas, world) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const scale = S / (CFG.worldHalf * 2 + 40);
  const toMap = (x, z) => [(x + CFG.worldHalf + 20) * scale, (z + CFG.worldHalf + 20) * scale];
  ctx.fillStyle = 'rgba(10, 18, 28, 0.85)';
  ctx.fillRect(0, 0, S, S);
  // Water on the west edge.
  ctx.fillStyle = '#2a6a8a';
  ctx.fillRect(0, 0, 18 * scale, S);
  // Streets.
  ctx.strokeStyle = '#8a8f96';
  ctx.lineWidth = 3;
  for (let v = -160; v <= 160; v += 40) {
    const [x1, y1] = toMap(v, -200);
    const [x2, y2] = toMap(v, 200);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const [x3, y3] = toMap(-200, v);
    const [x4, y4] = toMap(200, v);
    ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
  }
  // Sun Coins.
  ctx.fillStyle = '#ffd94a';
  for (const coin of world.city.coins) {
    if (coin.taken) continue;
    const [x, y] = toMap(coin.x, coin.z);
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  // Mission marker: pulsing gold diamond.
  const marker = world.marker;
  if (marker) {
    const [x, y] = toMap(marker.x, marker.z);
    const r = 5 + Math.sin(world.time * 5) * 2;
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath(); ctx.fill();
  }
  // Police cars: flashing red/blue dots.
  ctx.fillStyle = world.time % 0.5 < 0.25 ? '#ff4444' : '#4488ff';
  for (const car of world.policeCars) {
    const [x, y] = toMap(car.x, car.z);
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // Player: white arrow pointing along the facing direction.
  const p = world.player;
  const [px, py] = toMap(p.x, p.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI - p.yaw); // arrow drawn pointing up; map x->right, z->down
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  // North tick.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('N', S - 12, 12);
}
