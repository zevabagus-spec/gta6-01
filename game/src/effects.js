// Particles, muzzle flashes, skid puffs, blood-free hit sparks, pickup
// sparkles and the gold mission beacon. All transient, capped, and drawn as
// boxes/billboards through the dynamic draw list.
import { clampNumber } from './rng.js';

export function createEffects() {
  const particles = [];
  const tracers = [];
  const flashes = [];
  const MAX_PARTICLES = 240;

  function spawnParticle(x, y, z, vx, vy, vz, life, size, color, glow) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({ x, y, z, vx, vy, vz, life, maxLife: life, size, color, glow: glow || 0 });
  }

  return {
    burst(x, y, z, color, count, speed, glow) {
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const up = Math.random() * 4 + 1;
        spawnParticle(x, y, z, Math.cos(a) * speed, up, Math.sin(a) * speed, 0.5 + Math.random() * 0.4, 0.35 + Math.random() * 0.3, color, glow || 0);
      }
    },
    hitSparks(x, y, z) {
      this.burst(x, y, z, [1.0, 0.85, 0.4], 8, 5, 0.8);
    },
    dustPuff(x, y, z) {
      spawnParticle(x, y, z, (Math.random() - 0.5) * 1.5, 0.9, (Math.random() - 0.5) * 1.5, 0.45, 0.5, [0.75, 0.70, 0.60], 0);
    },
    coinSparkle(x, y, z) {
      this.burst(x, y, z, [1.0, 0.9, 0.3], 10, 3, 1.0);
    },
    muzzleFlash(x, y, z) {
      if (flashes.length > 8) flashes.shift();
      flashes.push({ x, y, z, life: 0.07 });
    },
    addTracer(x1, y1, z1, x2, y2, z2) {
      tracers.push({ x1, y1, z1, x2, y2, z2, life: 0.09 });
      if (tracers.length > 24) tracers.shift();
    },
    update(dt) {
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 9 * dt;
        if (p.y < 0.15) { p.y = 0.15; p.vy = 0; }
      }
      for (let i = tracers.length - 1; i >= 0; i -= 1) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) tracers.splice(i, 1);
      }
      for (let i = flashes.length - 1; i >= 0; i -= 1) {
        flashes[i].life -= dt;
        if (flashes[i].life <= 0) flashes.splice(i, 1);
      }
    },
    drawInto(drawList, timeSeconds) {
      for (const p of particles) {
        const fade = clampNumber(p.life / p.maxLife, 0, 1);
        const s = p.size * (0.5 + fade * 0.5);
        drawList.boxes.push({ x: p.x, y: p.y, z: p.z, sx: s, sy: s, sz: s, ry: 0, color: p.color, glow: p.glow });
      }
      for (const t of tracers) {
        const steps = 6;
        for (let i = 0; i <= steps; i += 1) {
          const f = i / steps;
          drawList.boxes.push({
            x: t.x1 + (t.x2 - t.x1) * f, y: t.y1 + (t.y2 - t.y1) * f, z: t.z1 + (t.z2 - t.z1) * f,
            sx: 0.22, sy: 0.22, sz: 0.22, ry: 0, color: [1.0, 0.9, 0.5], glow: 1.0,
          });
        }
      }
      for (const f of flashes) {
        drawList.billboards.push({ x: f.x, y: f.y, z: f.z, size: 2.2, color: [1.0, 0.85, 0.35], glow: 1.0 });
      }
      void timeSeconds;
    },
    // Gold beacon pillar over the active objective.
    drawBeacon(drawList, x, z, timeSeconds) {
      const pulse = 0.75 + 0.25 * Math.sin(timeSeconds * 3);
      for (let y = 1; y <= 26; y += 3) {
        const shrink = 1 - y / 34;
        drawList.boxes.push({ x, y, z, sx: 2.6 * shrink, sy: 2.6, sz: 2.6 * shrink, ry: timeSeconds * 0.6, color: [1.0, 0.82, 0.25], glow: 0.9 * pulse });
      }
      drawList.groundQuads.push({ x, z, sx: 7, sz: 7, color: [1.0, 0.82, 0.25], glow: 0.8, y: 0.06 });
    },
  };
}
