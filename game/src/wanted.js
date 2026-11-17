// wanted: the 0–5 star heat system. Crimes raise stars (with a short
// per-crime cooldown so one punch cannot jump you to five); the heat cools
// when you lay low. Police cars chase and ram; from 3 stars, on-foot cops
// spawn, shoot at you, and bust you on touch.
import * as THREE from '../vendor/three.min.js';
import { MAX_WANTED, dist2d, clamp } from './config.js';
import { makePersonMesh } from './pedestrians.js';
import { createCar } from './vehicles.js';
import { damagePlayer } from './player.js';

export function createWantedApi(g) {
  g.wanted = 0;
  g.wantedCooldowns = {};
  g.policeCars = [];
  g.cops = [];
  g.heatTimer = 0;
  const api = {
    addWanted(n, kind) {
      const now = g.time;
      if (g.wantedCooldowns[kind] && now - g.wantedCooldowns[kind] < 2) return;
      g.wantedCooldowns[kind] = now;
      g.wanted = clamp(g.wanted + n, 0, MAX_WANTED);
      g.heatTimer = 0;
      if (n >= 2) g.hudApi.toast('WANTED LEVEL ' + g.wanted + ' — the police are coming');
      g.audio.siren(g.wanted > 0);
    },
    setWanted(n) {
      g.wanted = clamp(n, 0, MAX_WANTED);
      g.heatTimer = 0;
      g.audio.siren(g.wanted > 0);
    },
    clearWanted() {
      g.wanted = 0;
      g.audio.siren(false);
    },
    // Deterministic staging helpers for ?shot= screenshots.
    spawnPoliceCarForShot(x, z, heading) {
      const pc = spawnPoliceCar(g);
      pc.mesh.position.set(x, 0, z);
      pc.mesh.rotation.y = heading || 0;
      pc.speed = 34;
      return pc;
    },
    spawnCopsForShot(spots) {
      for (const [x, z] of spots) {
        const cop = spawnCop(g);
        cop.x = x; cop.z = z;
        cop.mesh.position.set(x, 0, z);
      }
    },
  };
  g.wantedApi = api;
  return api;
}

function spawnPoliceCar(g) {
  const car = createCar(0x1c1c22, 'police');
  const a = Math.random() * Math.PI * 2;
  const x = clamp(g.playerPos.x + Math.cos(a) * 55, -140, 140);
  const z = clamp(g.playerPos.z + Math.sin(a) * 55, -140, 140);
  car.position.set(x, 0, z);
  g.scene.add(car);
  const pc = { mesh: car, speed: 0, ramCooldown: 0 };
  g.policeCars.push(pc);
  return pc;
}

function spawnCop(g) {
  const mesh = makePersonMesh(0x1d2a44, 0x14181f);
  const a = Math.random() * Math.PI * 2;
  const x = clamp(g.playerPos.x + Math.cos(a) * 28, -140, 140);
  const z = clamp(g.playerPos.z + Math.sin(a) * 28, -140, 140);
  mesh.position.set(x, 0, z);
  g.scene.add(mesh);
  const cop = { mesh, x, z, hp: 100, kind: 'cop', shootTimer: 1 + Math.random() };
  g.cops.push(cop);
  return cop;
}

export function updateWanted(g, dt) {
  // Heat cools off after 20 quiet seconds, one star at a time.
  if (g.wanted > 0) {
    g.heatTimer += dt;
    if (g.heatTimer > 20) { g.wanted -= 1; g.heatTimer = 0; g.audio.siren(g.wanted > 0); }
  }
  // Police cars: one per star, up to 4.
  const wantCars = Math.min(g.wanted, 4);
  while (g.policeCars.length < wantCars) spawnPoliceCar(g);
  // On-foot cops from 3 stars: one per star above 2.
  const wantCops = g.wanted >= 3 ? g.wanted - 2 : 0;
  const liveCops = g.cops.filter((c) => c.hp > 0).length;
  if (liveCops < wantCops) spawnCop(g);

  const px = g.driving ? g.playerCar.position.x : g.playerPos.x;
  const pz = g.driving ? g.playerCar.position.z : g.playerPos.z;
  for (const pc of g.policeCars) {
    const m = pc.mesh;
    const dx = px - m.position.x, dz = pz - m.position.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - m.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    m.rotation.y += clamp(diff, -2.4 * dt, 2.4 * dt);
    pc.speed = Math.min(pc.speed + 12 * dt, d > 25 ? 42 : 34);
    m.position.x += Math.sin(m.rotation.y) * pc.speed * dt;
    m.position.z += Math.cos(m.rotation.y) * pc.speed * dt;
    for (const w of m.userData.wheels) w.rotation.x += pc.speed * dt * 1.4;
    // Flashing light bar.
    const on = Math.floor(g.time * 6) % 2 === 0;
    if (m.userData.lights) {
      m.userData.lights[0].material.color.setHex(on ? 0xff2222 : 0x550000);
      m.userData.lights[1].material.color.setHex(on ? 0x000055 : 0x2244ff);
    }
    // Ram: damage the player on contact, then back off briefly.
    pc.ramCooldown -= dt;
    if (d < 3.2 && pc.ramCooldown <= 0) {
      pc.ramCooldown = 1.2;
      g.audio.crash();
      g.cameraShake = 0.4;
      if (g.driving) g.carSpeed *= 0.5;
      if (damagePlayer(g, 8)) g.onWasted();
    }
  }
  // Cops on foot: close in, shoot, bust on touch.
  for (const c of g.cops) {
    if (c.hp <= 0) continue;
    const dx = px - c.x, dz = pz - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.8 && !g.driving) { g.onBusted(); return; }
    if (d > 6) {
      const sp = 5.2;
      c.x += (dx / d) * sp * dt;
      c.z += (dz / d) * sp * dt;
      c.mesh.rotation.y = Math.atan2(dx, dz);
    }
    c.mesh.position.set(c.x, 0, c.z);
    c.shootTimer -= dt;
    if (c.shootTimer <= 0 && d < 38 && !g.driving) {
      c.shootTimer = 1.6;
      g.audio.enemyShot();
      if (Math.random() < 0.55 && damagePlayer(g, 6)) g.onWasted();
    }
  }
  // Despawn police far away once the heat is off.
  if (g.wanted === 0) {
    for (const pc of g.policeCars) g.scene.remove(pc.mesh);
    g.policeCars = [];
    for (const c of g.cops) if (c.hp > 0) g.scene.remove(c.mesh);
    g.cops = g.cops.filter((c) => c.hp <= 0);
  }
}
