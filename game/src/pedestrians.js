// pedestrians: 24 walkers on the sidewalks. They stroll between random
// waypoints, flee when the player attacks or speeds at them, and fall when
// punched or shot (which the wanted system counts as a crime).
import * as THREE from '../vendor/three.min.js';
import { PED_COUNT, makeRng, pick, dist2d } from './config.js';
import { resolveCircle } from './city.js';

const SHIRTS = [0xd8e4f0, 0xe8b4b4, 0xb4d8b4, 0xe8d8a0, 0xc4b4e8, 0xf0f0f0, 0x8fc4d8];

export function makePersonMesh(shirt, pants) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 1.15; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8a882 }));
  head.position.y = 1.85; g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35), new THREE.MeshLambertMaterial({ color: pants }));
  legs.position.y = 0.35; g.add(legs);
  return g;
}

export function spawnPedestrians(g) {
  const rng = makeRng(g.seed + 37);
  g.peds = [];
  for (let i = 0; i < PED_COUNT; i++) {
    const x = -135 + rng() * 270, z = -135 + rng() * 270;
    const mesh = makePersonMesh(pick(rng, SHIRTS), pick(rng, [0x2a2a33, 0x4a3a2a, 0x33455a]));
    mesh.position.set(x, 0, z);
    g.scene.add(mesh);
    g.peds.push({ mesh, x, z, hp: 50, down: false, flee: 0, speed: 1.6 + rng() * 1.2, tx: x, tz: z, wait: rng() * 2 });
  }
}

function newTarget(g, p, rng) {
  p.tx = Math.max(-140, Math.min(140, p.x + (rng() - 0.5) * 70));
  p.tz = Math.max(-140, Math.min(140, p.z + (rng() - 0.5) * 70));
}

export function updatePedestrians(g, dt) {
  const rng = g.frameRng;
  const px = g.playerPos.x, pz = g.playerPos.z;
  const playerSpeed = g.driving ? Math.abs(g.carSpeed) : g.playerSpeed;
  for (const p of g.peds) {
    if (p.down) continue;
    const d = dist2d(p.x, p.z, px, pz);
    if (d < 12 && (g.recentViolence > 0 || playerSpeed > 14)) p.flee = 2.5;
    if (p.flee > 0) {
      p.flee -= dt;
      const a = Math.atan2(p.x - px, p.z - pz);
      p.x += Math.sin(a) * 5 * dt; p.z += Math.cos(a) * 5 * dt;
      p.mesh.rotation.y = a;
    } else if (p.wait > 0) {
      p.wait -= dt;
    } else {
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const dd = Math.hypot(dx, dz);
      if (dd < 2) { p.wait = 1 + rng() * 3; newTarget(g, p, rng); continue; }
      p.x += (dx / dd) * p.speed * dt;
      p.z += (dz / dd) * p.speed * dt;
      p.mesh.rotation.y = Math.atan2(dx, dz);
    }
    resolveCircle(g, p, 0.5);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.position.y = Math.abs(Math.sin(g.time * 6 + p.x)) * 0.05;
  }
}

// Knock a pedestrian down (punch / shot / car hit). Returns true if it fell.
export function knockPed(g, p) {
  if (p.down) return false;
  p.down = true;
  p.mesh.rotation.x = -Math.PI / 2;
  p.mesh.position.y = 0.4;
  return true;
}
