// The Solmar Bay police response: wanted stars drive how many pursuit cars
// and foot officers hunt Mara. Break line of sight and the stars cool off;
// get caught standing still next to an officer and it is a bust.
import { clampNumber, distance2D } from './rng.js';
import { lowerWanted } from './player.js';

const POLICE_CARS_BY_WANTED = [0, 1, 2, 3, 4, 5];
const OFFICERS_BY_WANTED = [0, 1, 2, 2, 3, 4];
const BUST_HOLD_SECONDS = 1.2;
const COOL_SIGHT_RADIUS = 55;

export function createPoliceSystem(rand, vehicleManager, pedManager, audio) {
  let evadeTimer = 0;

  function spawnPositionNear(player, minDist, maxDist) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = rand() * Math.PI * 2;
      const dist = minDist + rand() * (maxDist - minDist);
      const x = clampNumber(player.x + Math.cos(angle) * dist, -230, 230);
      const z = clampNumber(player.z + Math.sin(angle) * dist, -230, 230);
      if (distance2D(x, z, player.x, player.z) >= minDist) return [x, z];
    }
    return [player.x + minDist, player.z];
  }

  function anyPoliceSeesPlayer(player) {
    for (const car of vehicleManager.cars) {
      if (car.kind !== 'police' || car.dead) continue;
      if (distance2D(car.x, car.z, player.x, player.z) < COOL_SIGHT_RADIUS) return true;
    }
    for (const ped of pedManager.peds) {
      if (ped.kind !== 'officer' || ped.dead) continue;
      if (distance2D(ped.x, ped.z, player.x, player.z) < COOL_SIGHT_RADIUS) return true;
    }
    return false;
  }

  return {
    update(dt, player) {
      const wanted = player.wanted;
      if (wanted <= 0) {
        if (vehicleManager.countPolice() > 0) vehicleManager.removePoliceCars();
        if (pedManager.countKind('officer') > 0) pedManager.removeByKind('officer');
        evadeTimer = 0;
        return { busted: false };
      }
      // Match pursuit strength to the wanted level, trimming extras when
      // the heat drops so old cruisers do not pile up forever.
      const wantCars = POLICE_CARS_BY_WANTED[wanted];
      const wantOfficers = player.inCar ? 0 : OFFICERS_BY_WANTED[wanted];
      while (vehicleManager.countPolice() < wantCars) {
        const [x, z] = spawnPositionNear(player, 45, 80);
        vehicleManager.spawnPoliceCar(x, z);
      }
      if (vehicleManager.countPolice() > wantCars) {
        const cruisers = vehicleManager.cars.filter((c) => c.kind === 'police' && !c.dead);
        cruisers.sort((a, b) => distance2D(b.x, b.z, player.x, player.z) - distance2D(a.x, a.z, player.x, player.z));
        for (let i = 0; i < cruisers.length - wantCars; i += 1) {
          const idx = vehicleManager.cars.indexOf(cruisers[i]);
          if (idx >= 0) vehicleManager.cars.splice(idx, 1);
        }
      }
      while (pedManager.countKind('officer') < wantOfficers) {
        const [x, z] = spawnPositionNear(player, 25, 45);
        pedManager.spawnOfficer(x, z);
      }
      // Bust: an officer standing on Mara while she is slow or still.
      if (!player.inCar) {
        for (const ped of pedManager.peds) {
          if (ped.kind !== 'officer' || ped.dead) continue;
          if (ped.bustTimer >= BUST_HOLD_SECONDS && player.speed < 2.5) {
            return { busted: true };
          }
        }
      }
      // Cooling off: unseen for a while, stars tick down one at a time.
      if (!anyPoliceSeesPlayer(player)) {
        evadeTimer += dt;
        player.cooling = true;
        if (evadeTimer > 6) {
          evadeTimer = 0;
          player.wanted = Math.max(0, player.wanted - 1);
          if (player.wanted === 0) {
            lowerWanted(player);
            vehicleManager.removePoliceCars();
            pedManager.removeByKind('officer');
          }
        }
      } else {
        evadeTimer = 0;
        player.cooling = false;
      }
      return { busted: false };
    },
    clearAll() {
      vehicleManager.removePoliceCars();
      pedManager.removeByKind('officer');
      evadeTimer = 0;
    },
    policeHeat(player) {
      return anyPoliceSeesPlayer(player);
    },
  };
}

export function bustPenalty(player) {
  const fine = Math.min(player.cash, 100 + Math.floor(player.cash * 0.1));
  player.cash -= fine;
  lowerWanted(player);
  return fine;
}

export function wastedPenalty(player) {
  const bill = Math.min(player.cash, 80 + Math.floor(player.cash * 0.1));
  player.cash -= bill;
  lowerWanted(player);
  return bill;
}
