// "The Solara Job" — six missions with Dario Voss and Mara Quinn.
// A small step machine per mission: proximity markers, timed fares,
// a rival fight, a police escape, and the warehouse-to-boat finale.

import { MISSIONS, PLACES } from './config.js';
import { dist2D } from './math3d.js';
import { spawnRivals } from './pedestrians.js';
import { clearWanted, setWanted } from './wanted.js';
import { drawPerson, makePerson } from './pedestrians.js';

const FARES = [
  { from: { x: 32, z: -56 }, to: { x: -96, z: 104 }, name: 'the marina' },
  { from: { x: -96, z: 104 }, to: { x: 96, z: -96 }, name: 'Glass Towers' },
  { from: { x: 96, z: -96 }, to: { x: 32, z: -8 }, name: 'the diner' },
];
const FARE_TIME = 75;

export function startMission(G, index) {
  G.missionIndex = index;
  G.missionStep = 0;
  G.missionData = {};
  G.flags = {};
  const m = MISSIONS[index];
  if (!m) return;
  G.toast(`${m.title} — ${m.giver}: ${m.brief}`);
  if (index === 3) {
    // Rivals spawn when the player reaches the yard, not before.
  }
  if (index === 4) {
    setWanted(G, 4, true);
    G.toast('Every patrol in Solara Bay is after you. Reach the hideout!');
  }
  if (index === 5) {
    G.toast('The warehouse is guarded. Grab the loot and run for the boat.');
  }
  updateObjective(G);
}

export function updateObjective(G) {
  const i = G.missionIndex;
  const step = G.missionStep;
  const d = G.missionData;
  let text = '';
  let marker = null;
  if (i === 0) {
    if (step === 0) { text = 'Meet Dario at the garage on Coral Row'; marker = PLACES.garage; }
    else if (step === 1) { text = 'Get in the gold Sunray coupe (press F)'; marker = PLACES.sunrayParked; }
    else { text = 'Drive the Sunray to Mara at the diner'; marker = PLACES.diner; }
  } else if (i === 1) {
    if (step === 0) { text = 'Steal any car on the street (press F beside one)'; marker = null; }
    else { text = 'Deliver the stolen car to the chop shop'; marker = PLACES.chopShop; }
  } else if (i === 2) {
    const fare = FARES[d.fare || 0];
    if (d.phase === 'dropoff') {
      text = `Drop the fare at ${fare.name} — ${Math.ceil(d.timer || 0)}s left`;
      marker = fare.to;
    } else {
      text = `Pick up fare ${(d.fare || 0) + 1} of 3 at the taxi stand`;
      marker = fare.from;
    }
  } else if (i === 3) {
    if (step === 0) { text = 'Go to the freight yard'; marker = PLACES.yard; }
    else if (step === 1) {
      const left = G.rivals.filter((r) => r.health > 0).length;
      text = `Send the Rust Vipers packing — ${left} left`;
      marker = PLACES.yard;
    } else { text = 'Meet Mara at the diner'; marker = PLACES.diner; }
  } else if (i === 4) {
    text = 'Escape the patrols — reach the hideout';
    marker = PLACES.hideout;
  } else if (i === 5) {
    if (step === 0) { text = 'Reach the warehouse'; marker = PLACES.warehouse; }
    else if (step === 1) {
      const left = (d.loot || []).filter((l) => !l.taken).length;
      text = `Grab the loot bags — ${left} left`;
      marker = nearestLoot(G);
    } else { text = 'Escape to the boat at the marina!'; marker = PLACES.boat; }
  }
  G.objective = text;
  G.marker = marker;
  G.markerColor = i === 5 && step === 2 ? [1, 0.3, 0.3] : [1, 0.85, 0.2];
}

function nearestLoot(G) {
  const d = G.missionData;
  if (!d.loot) return PLACES.warehouse;
  let best = null;
  let bestD = Infinity;
  for (const bag of d.loot) {
    if (bag.taken) continue;
    const dist = dist2D(bag.x, bag.z, G.player.x, G.player.z);
    if (dist < bestD) { bestD = dist; best = bag; }
  }
  return best || PLACES.warehouse;
}

function advance(G) {
  G.missionStep++;
  updateObjective(G);
}

export function completeMission(G) {
  const m = MISSIONS[G.missionIndex];
  G.cash += m.reward;
  G.sounds.cash();
  G.sounds.missionDone();
  G.toast(`Mission complete: ${m.title} — +$${m.reward}`);
  if (G.missionIndex >= 5) {
    G.missionIndex = 6;
    G.enterComplete();
    return;
  }
  startMission(G, G.missionIndex + 1);
  // Save AFTER advancing, so a continued game resumes the next mission.
  G.saveNow();
}

export function updateMissions(G, dt) {
  const p = G.player;
  const i = G.missionIndex;
  const d = G.missionData;
  if (i > 5 || G.mode !== 'playing') return;

  if (i === 0) {
    if (G.missionStep === 0 && dist2D(p.x, p.z, PLACES.garage.x, PLACES.garage.z) < 9) {
      G.toast('Dario: "Take the Sunray, kid. Mara is waiting at the diner."');
      advance(G);
    } else if (G.missionStep === 1 && p.car && p.car.isSunray) {
      advance(G);
    } else if (G.missionStep === 2 && dist2D(p.x, p.z, PLACES.diner.x, PLACES.diner.z) < 9) {
      completeMission(G);
    }
  } else if (i === 1) {
    if (G.missionStep === 0 && G.flags.stolen) advance(G);
    else if (G.missionStep === 1 && p.car && dist2D(p.x, p.z, PLACES.chopShop.x, PLACES.chopShop.z) < 10) {
      completeMission(G);
    } else if (G.missionStep === 1 && !p.car && dist2D(p.x, p.z, PLACES.chopShop.x, PLACES.chopShop.z) < 10) {
      const near = G.cars.find((c) => c.stolen && dist2D(c.x, c.z, p.x, p.z) < 12);
      if (near) completeMission(G);
    }
  } else if (i === 2) {
    if (d.fare === undefined) { d.fare = 0; d.phase = 'pickup'; d.timer = FARE_TIME; }
    const fare = FARES[d.fare];
    if (d.phase === 'pickup') {
      if (p.car && dist2D(p.x, p.z, fare.from.x, fare.from.z) < 7) {
        d.phase = 'dropoff';
        d.timer = FARE_TIME;
        G.toast(`Fare aboard — take them to ${fare.name}, fast!`);
      } else if (!p.car && dist2D(p.x, p.z, fare.from.x, fare.from.z) < 7) {
        G.toastOnce('taxi-car', 'You need a car to carry fares.');
      }
    } else {
      d.timer -= dt;
      if (p.car && dist2D(p.x, p.z, fare.to.x, fare.to.z) < 8) {
        G.cash += 0;
        G.sounds.cash();
        G.toast(`Fare delivered! +$80 tip banked.`);
        G.cash += 80;
        d.fare++;
        if (d.fare >= 3) {
          // The mission reward covers the fares; the $80s above are the
          // same money, so complete without double-paying.
          G.cash -= 240;
          completeMission(G);
        } else {
          d.phase = 'pickup';
          d.timer = FARE_TIME;
        }
      } else if (d.timer <= 0) {
        G.toast('Too slow — the fare walks away. Try again.');
        d.phase = 'pickup';
        d.timer = FARE_TIME;
      }
    }
    updateObjective(G);
  } else if (i === 3) {
    if (G.missionStep === 0 && dist2D(p.x, p.z, PLACES.yard.x, PLACES.yard.z) < 14) {
      G.rivals = spawnRivals(G);
      G.toast('Rust Vipers: "This yard is ours now!"');
      advance(G);
    } else if (G.missionStep === 1 && G.rivals.length > 0 && G.rivals.every((r) => r.health <= 0)) {
      G.toast('Yard clear. Mara is waiting at the diner.');
      advance(G);
    } else if (G.missionStep === 2 && dist2D(p.x, p.z, PLACES.diner.x, PLACES.diner.z) < 9) {
      completeMission(G);
    }
  } else if (i === 4) {
    if (dist2D(p.x, p.z, PLACES.hideout.x, PLACES.hideout.z) < 11) {
      clearWanted(G);
      G.toast('Dario: "Clean record. Nice driving."');
      completeMission(G);
    }
  } else if (i === 5) {
    if (G.missionStep === 0 && dist2D(p.x, p.z, PLACES.warehouse.x, PLACES.warehouse.z) < 11) {
      d.loot = [
        { x: PLACES.warehouse.x, z: PLACES.warehouse.z - 12, taken: false },
        { x: PLACES.warehouse.x, z: PLACES.warehouse.z, taken: false },
        { x: PLACES.warehouse.x, z: PLACES.warehouse.z + 12, taken: false },
      ];
      advance(G);
    } else if (G.missionStep === 1) {
      for (const bag of d.loot || []) {
        if (!bag.taken && dist2D(p.x, p.z, bag.x, bag.z) < 3.5) {
          bag.taken = true;
          G.sounds.coin();
          G.toast(`Loot bag grabbed — ${(d.loot || []).filter((l) => !l.taken).length} left`);
          if (G.wanted < 5) setWanted(G, 5, true);
        }
      }
      if ((d.loot || []).every((l) => l.taken)) {
        G.toast('All loot grabbed — run for the boat!');
        advance(G);
      }
    } else if (G.missionStep === 2 && dist2D(p.x, p.z, PLACES.boat.x, PLACES.boat.z) < 9) {
      completeMission(G);
    }
  }
  if (i !== 2) updateObjective(G);
}

export function drawMissionProps(renderer, G) {
  const d = G.missionData;
  if (G.missionIndex === 2 && d.phase === 'pickup' && d.fare !== undefined) {
    const fare = FARES[d.fare];
    if (fare) {
      const waiting = makePerson('ped', fare.from.x, fare.from.z, [0.95, 0.85, 0.3]);
      waiting.heading = Math.sin(G.time * 0.7) * 0.5;
      drawPerson(renderer, waiting, G.time);
    }
  }
  if (G.missionIndex === 5 && G.missionStep >= 1 && d.loot) {
    for (const bag of d.loot) {
      if (bag.taken) continue;
      const bob = Math.sin(G.time * 3 + bag.x) * 0.15;
      renderer.drawBox(bag.x, 0.7 + bob, bag.z, 0.4, 1.6, 1.4, 1.2, [0.95, 0.75, 0.2]);
      renderer.drawBox(bag.x, 1.55 + bob, bag.z, 0.4, 1.0, 0.4, 0.8, [0.7, 0.5, 0.1]);
    }
  }
  // Dario waits by the garage during mission 1; Mara by the diner.
  if (G.missionIndex === 0 && G.missionStep === 0) {
    const dario = makePerson('ped', PLACES.garage.x + 3, PLACES.garage.z + 2, [0.2, 0.35, 0.7]);
    dario.heading = 2.4;
    drawPerson(renderer, dario, G.time);
  }
  if ((G.missionIndex === 0 && G.missionStep === 2) || (G.missionIndex === 3 && G.missionStep === 2)) {
    const mara = makePerson('ped', PLACES.diner.x + 3, PLACES.diner.z, [0.85, 0.25, 0.5]);
    mara.heading = -1.2;
    drawPerson(renderer, mara, G.time);
  }
}
