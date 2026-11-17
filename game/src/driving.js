// driving: arcade car physics for the player's car — accelerate, brake,
// reverse, steering that tightens at speed, handbrake, and collisions with
// buildings, traffic and pedestrians.
import { clamp } from './config.js';
import { resolveCircle } from './city.js';
import { knockPed } from './pedestrians.js';

const MAX_SPEED = 38;
const SUNRAY_MAX = 48;
const ACCEL = 16;
const BRAKE = 30;
const REVERSE_MAX = 12;

export function updateDriving(g, dt) {
  const car = g.playerCar;
  if (!car) return;
  const k = g.keys;
  const maxSpeed = car.userData.kind === 'sunray' ? SUNRAY_MAX : MAX_SPEED;
  if (k['w']) g.carSpeed += ACCEL * dt;
  else if (k['s']) {
    if (g.carSpeed > 0.5) g.carSpeed -= BRAKE * dt;
    else g.carSpeed -= ACCEL * 0.6 * dt;
  } else {
    // Drag / rolling resistance.
    g.carSpeed -= Math.sign(g.carSpeed) * Math.min(Math.abs(g.carSpeed), 6 * dt);
  }
  if (k[' ']) g.carSpeed -= Math.sign(g.carSpeed) * Math.min(Math.abs(g.carSpeed), 34 * dt);
  g.carSpeed = clamp(g.carSpeed, -REVERSE_MAX, maxSpeed);
  const steerInput = (k['a'] ? 1 : 0) - (k['d'] ? 1 : 0);
  const steerAuthority = clamp(Math.abs(g.carSpeed) / 8, 0, 1) * (k[' '] ? 1.5 : 1);
  const steerRate = 1.9 * steerAuthority * (g.carSpeed >= 0 ? 1 : -1);
  g.carHeading += steerInput * steerRate * dt;
  car.rotation.y = g.carHeading;
  const nx = car.position.x + Math.sin(g.carHeading) * g.carSpeed * dt;
  const nz = car.position.z + Math.cos(g.carHeading) * g.carSpeed * dt;
  const p = { x: nx, z: nz };
  const hitWall = resolveCircle(g, p, 2.2);
  if (hitWall && Math.abs(g.carSpeed) > 4) {
    g.carSpeed *= 0.35;
    g.audio.crash();
    g.cameraShake = 0.3;
  }
  car.position.x = p.x; car.position.z = p.z;
  for (const w of car.userData.wheels) w.rotation.x += g.carSpeed * dt * 1.4;

  // Ram traffic cars: shove them and slow down.
  for (const t of g.traffic) {
    if (t.mesh === car) continue;
    const dx = t.mesh.position.x - car.position.x, dz = t.mesh.position.z - car.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      t.mesh.position.x += (dx / d) * 2.2;
      t.mesh.position.z += (dz / d) * 2.2;
      g.carSpeed *= 0.7;
      if (Math.abs(g.carSpeed) > 8) g.audio.crash();
    }
  }
  // Run over pedestrians (a crime, and it slows the car).
  for (const ped of g.peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.x - car.position.x, ped.z - car.position.z);
    if (d < 2.4 && Math.abs(g.carSpeed) > 3) {
      if (knockPed(g, ped)) {
        g.wantedApi.addWanted(2, 'vehicular assault');
        g.carSpeed *= 0.8;
        g.audio.thud();
      }
    }
  }
  g.audio.engine(Math.abs(g.carSpeed) / maxSpeed, g.driving);
}

// Camera chase for driving: behind the car, looking forward.
export function drivingCamera(g, dt) {
  const car = g.playerCar;
  if (!car) return;
  const back = 8.5 + Math.abs(g.carSpeed) * 0.04;
  const tx = car.position.x - Math.sin(g.carHeading) * back;
  const tz = car.position.z - Math.cos(g.carHeading) * back;
  const ty = 4.2 + Math.abs(g.carSpeed) * 0.02;
  g.camera.position.x += (tx - g.camera.position.x) * Math.min(1, 5 * dt);
  g.camera.position.y += (ty - g.camera.position.y) * Math.min(1, 5 * dt);
  g.camera.position.z += (tz - g.camera.position.z) * Math.min(1, 5 * dt);
  g.camera.lookAt(car.position.x + Math.sin(g.carHeading) * 6, 1.4, car.position.z + Math.cos(g.carHeading) * 6);
}
