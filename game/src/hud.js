// The HUD: cash, health, wanted stars, ammo, mission banner, toasts,
// district banner, speed readout, and the canvas minimap.

import { DISTRICTS, MISSIONS, WORLD_HALF } from './config.js';
import { districtAt } from './config.js';
import { ROAD_LINES } from './city.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['cash', 'health-fill', 'health-text', 'stars', 'ammo', 'mission-title', 'objective', 'district', 'speed', 'toasts', 'minimap', 'weapon', 'coins']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.lastDistrict = '';
    this.districtUntil = 0;
    this.toastQueue = [];
  }

  toast(text, sticky) {
    if (!this.el.toasts) return;
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.el.toasts.appendChild(div);
    while (this.el.toasts.children.length > 3) this.el.toasts.removeChild(this.el.toasts.firstChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, sticky ? 6000 : 3600);
  }

  update(G) {
    const p = G.player;
    if (this.el.cash) this.el.cash.textContent = '$' + G.cash;
    if (this.el['health-fill']) this.el['health-fill'].style.width = Math.max(0, p.health) + '%';
    if (this.el['health-text']) this.el['health-text'].textContent = Math.ceil(p.health) + ' HP';
    if (this.el.stars) {
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
      this.el.stars.textContent = stars;
      this.el.stars.className = G.wanted > 0 ? 'stars hot' : 'stars';
    }
    if (this.el.ammo) this.el.ammo.textContent = p.weapon === 'pistol' ? `Ammo ${p.ammo} / 12` : 'Fists';
    if (this.el.weapon) this.el.weapon.textContent = p.weapon === 'pistol' ? 'Pistol [2]' : 'Fists [1]';
    if (this.el.coins) this.el.coins.textContent = `☀ ${G.coinsTaken.size} / 30`;
    const mission = MISSIONS[Math.min(5, G.missionIndex)];
    if (this.el['mission-title']) {
      this.el['mission-title'].textContent = G.missionIndex > 5 ? 'The Solara Job — Complete' : `Mission ${G.missionIndex + 1}/6: ${mission.title}`;
    }
    if (this.el.objective) this.el.objective.textContent = G.objective || '';
    if (this.el.speed) {
      this.el.speed.textContent = p.car ? `${G.speedKmh || 0} km/h` : '';
    }
    const district = districtAt(p.x, p.z);
    if (district !== this.lastDistrict) {
      this.lastDistrict = district;
      this.districtUntil = G.time + 3;
      if (this.el.district) {
        this.el.district.textContent = district;
        this.el.district.classList.add('show');
      }
    }
    if (this.el.district && G.time > this.districtUntil) this.el.district.classList.remove('show');
    this.drawMinimap(G);
  }

  drawMinimap(G) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const size = 180;
    const scale = size / (WORLD_HALF * 2 + 20);
    const toMap = (x, z) => [(x + WORLD_HALF + 10) * scale, (z + WORLD_HALF + 10) * scale];
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(20, 28, 34, 0.82)';
    ctx.fillRect(0, 0, size, size);
    // Sea and beach.
    ctx.fillStyle = '#1d6f8e';
    ctx.fillRect(0, toMap(0, 196)[1], size, size);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(0, toMap(0, 168)[1], size, toMap(0, 196)[1] - toMap(0, 168)[1]);
    // Roads.
    ctx.strokeStyle = '#5a636e';
    ctx.lineWidth = 4;
    for (const line of ROAD_LINES) {
      const [mx] = toMap(line, 0);
      ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, size); ctx.stroke();
      const [, mz] = toMap(0, line);
      ctx.beginPath(); ctx.moveTo(0, mz); ctx.lineTo(size, mz); ctx.stroke();
    }
    // District labels are skipped at this size; buildings as dots.
    ctx.fillStyle = '#3a4550';
    for (const b of G.city.buildings) {
      const [mx, mz] = toMap(b.x, b.z);
      ctx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    // Coins.
    ctx.fillStyle = '#ffd23f';
    G.city.coins.forEach((coin, i) => {
      if (coin.taken || G.coinsTaken.has(i)) return;
      const [mx, mz] = toMap(coin.x, coin.z);
      ctx.fillRect(mx - 1, mz - 1, 2, 2);
    });
    // Objective marker.
    if (G.marker) {
      const [mx, mz] = toMap(G.marker.x, G.marker.z);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(mx, mz, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Police.
    ctx.fillStyle = '#ff4d4d';
    for (const car of G.cars) {
      if (car.kind !== 'police') continue;
      const [mx, mz] = toMap(car.x, car.z);
      ctx.beginPath(); ctx.arc(mx, mz, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const [px, pz] = toMap(G.player.x, G.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.PI - G.player.heading);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    void DISTRICTS;
  }
}
