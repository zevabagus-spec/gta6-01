// hud: the DOM overlay — cash, wanted stars, clock, objective, health /
// armour bars, ammo, speedometer, the canvas minimap, toasts, and the
// title / pause / busted / wasted / complete screens.
import { WORLD, fmtClock } from './config.js';

export function createHudApi(g) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'), cash: $('cash'), stars: $('stars'), clock: $('clock'),
    objTitle: $('objective-title'), objText: $('objective-text'),
    health: $('health-fill'), armour: $('armour-fill'),
    weapon: $('weapon'), ammo: $('ammo'), speed: $('speed'),
    toast: $('toast'), crosshair: $('crosshair'), interact: $('interact'),
    minimap: $('minimap'),
  };
  const mm = el.minimap.getContext('2d');
  let toastTimer = 0;
  const api = {
    showHud(on) { el.hud.classList.toggle('on', on); },
    setObjective(title, text) { el.objTitle.textContent = title; el.objText.textContent = text; },
    toast(text) { el.toast.textContent = text; toastTimer = 3.5; },
    showScreen(name) {
      for (const s of ['screen-title', 'screen-pause', 'screen-busted', 'screen-wasted', 'screen-complete']) {
        $(s).classList.toggle('on', s === 'screen-' + name);
      }
    },
    hideScreens() { api.showScreen(''); },
    update(dt) {
      el.cash.textContent = '$' + Math.floor(g.cash);
      el.stars.textContent = '★'.repeat(g.wanted) + '☆'.repeat(5 - g.wanted);
      el.clock.textContent = fmtClock(g.clockMinutes);
      el.health.style.width = Math.max(0, g.health) + '%';
      el.armour.style.width = Math.max(0, g.armour) + '%';
      el.weapon.textContent = g.driving ? 'DRIVING' : g.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
      el.ammo.textContent = g.driving ? '' : g.weapon === 'pistol' ? 'AMMO ' + g.ammo : '';
      el.speed.textContent = g.driving ? String(Math.round(Math.abs(g.carSpeed) * 2.2)) : '0';
      el.crosshair.style.display = (!g.driving && g.weapon === 'pistol' && g.screen === 'playing') ? 'block' : 'none';
      const showInteract = g.screen === 'playing' && !g.driving && (g.nearMissionMarker || g.nearCar || g.nearLoot);
      el.interact.style.display = showInteract ? 'block' : 'none';
      if (showInteract) el.interact.textContent = g.nearCar ? 'Press E — steal car' : 'Press E';
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el.toast.textContent = ''; }
      drawMinimap(g, mm);
    },
  };
  g.hudApi = api;
  return api;
}

function drawMinimap(g, ctx) {
  const S = 170, scale = S / (WORLD.half * 2 + 20);
  const toMap = (x, z) => [(x + WORLD.half + 10) * scale, (z + WORLD.half + 10) * scale];
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#0d2036';
  ctx.fillRect(0, 0, S, S);
  // District tints.
  for (const d of g.districts) {
    ctx.fillStyle = '#' + d.ground.toString(16).padStart(6, '0');
    const [x0, y0] = toMap(d.x0, d.z0);
    const [x1, y1] = toMap(d.x1, d.z1);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  // Roads.
  ctx.strokeStyle = '#3a3f47';
  ctx.lineWidth = 4;
  for (const r of g.roads) {
    const [x0, y0] = toMap(r, -WORLD.half);
    const [x1, y1] = toMap(r, WORLD.half);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const [hx0, hy0] = toMap(-WORLD.half, r);
    const [hx1, hy1] = toMap(WORLD.half, r);
    ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.stroke();
  }
  const dot = (x, z, color, r) => {
    const [mx, my] = toMap(x, z);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
  };
  for (const c of g.coins) if (!c.taken) dot(c.x, c.z, '#ffc93e', 1.5);
  for (const t of g.traffic) dot(t.mesh.position.x, t.mesh.position.z, '#ffffff', 1.5);
  for (const pc of g.policeCars) dot(pc.mesh.position.x, pc.mesh.position.z, '#ff4444', 2.5);
  // Mission marker: pulsing yellow diamond.
  const pulse = 3 + Math.sin(g.time * 5) * 1.5;
  const [mx, my] = toMap(g.markerTarget.x, g.markerTarget.z);
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(mx, my - pulse); ctx.lineTo(mx + pulse, my); ctx.lineTo(mx, my + pulse); ctx.lineTo(mx - pulse, my);
  ctx.closePath(); ctx.fill();
  // Player: white arrow pointing along the heading.
  const px = g.driving ? g.playerCar.position.x : g.playerPos.x;
  const pz = g.driving ? g.playerCar.position.z : g.playerPos.z;
  const heading = g.driving ? g.carHeading : g.playerHeading;
  const [ax, ay] = toMap(px, pz);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
