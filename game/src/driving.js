// Solara Bay — arcade driving. One car, simple and forgiving: accelerate and
// brake on W/S, steer with A/D scaled by speed, drag and a handbrake on
// Space, building collision that scrapes speed off instead of stopping dead,
// and a camera-friendly heading the renderer follows.
import { CFG } from './config.js';
import { clamp, dist2 } from './math3d.js';
import { collideCircleBox } from './city.js';

export function updateDriving(car, input, dt, city, allCars) {
  const model = car.model;
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  if (forward) car.speed += model.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? model.accel * 1.4 : model.accel * 0.6) * dt;
  if (!forward && !back) car.speed -= Math.sign(car.speed) * 6 * dt;
  if (input.handbrake) car.speed -= Math.sign(car.speed) * 22 * dt;
  car.speed -= car.speed * 0.35 * dt; // rolling drag
  car.speed = clamp(car.speed, -model.topSpeed * 0.45, model.topSpeed);
  if (Math.abs(car.speed) < 0.05 && !forward && !back) car.speed = 0;
  // Steering only bites while moving; reverse flips it, as drivers expect.
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const grip = model.grip * clamp(Math.abs(car.speed) / 8, 0, 1);
  car.yaw += steer * grip * (car.speed >= 0 ? 1 : -1) * dt * Math.sign(car.speed || 1) * 0.55;
  const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
  const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
  const [cx, cz] = collideCircleBox(nx, nz, 1.7, city.colliders);
  if (cx !== nx || cz !== nz) {
    // Scraped a building: lose some speed, keep sliding along the wall.
    car.speed *= 0.55;
    car.x = cx; car.z = cz;
  } else {
    car.x = nx; car.z = nz;
  }
  car.x = clamp(car.x, -CFG.worldHalf, CFG.worldHalf);
  car.z = clamp(car.z, -CFG.worldHalf, CFG.worldHalf);
  // Bump into other cars: shove apart and bleed speed on both sides.
  for (const other of allCars) {
    if (other === car || other.parked) continue;
    const d = dist2(car.x, car.z, other.x, other.z);
    if (d < 3.6 && d > 0.01) {
      const push = (3.6 - d) / 2;
      const ux = (other.x - car.x) / d, uz = (other.z - car.z) / d;
      car.x -= ux * push; car.z -= uz * push;
      other.x += ux * push; other.z += uz * push;
      car.speed *= 0.75;
      if (other.traffic) other.speed = 0;
      if (other.police) other.speed *= 0.8;
    }
  }
  return car.speed;
}
