// Solara Bay — "The Solara Job", the six-mission story. Each mission is a
// list of steps; a step is a small goal (go somewhere, press E, steal a car,
// drive a taxi fare, defeat rivals, collect loot, escape the police). This
// file advances the current step, spawns what a step needs (rivals, loot
// bags), and pays out when a mission finishes. The world object owns the
// live state; this file only reads it and moves it forward.
import { MISSIONS, CFG } from './config.js';
import { dist2 } from './math3d.js';

export function createMissionState() {
  return {
    index: 0, step: 0, timer: 0, kills: 0, bags: 0,
    rivalsSpawned: false, bagsSpawned: false, farePassenger: false,
    done: false,
  };
}

export function currentMission(ms) {
  return MISSIONS[ms.index] || null;
}
export function currentStep(ms) {
  const m = currentMission(ms);
  return m ? m.steps[ms.step] : null;
}
export function missionObjective(ms) {
  if (ms.done) return 'The Solara Job is complete — Solara Bay is yours.';
  const step = currentStep(ms);
  const m = currentMission(ms);
  if (!step || !m) return '';
  let text = step.text;
  if (step.type === 'kill') text += ` (${ms.kills}/${step.count})`;
  if (step.type === 'collect') text += ` (${ms.bags}/${step.count})`;
  if (ms.timer > 0) text += ` — ${Math.ceil(ms.timer)}s`;
  return `${m.id}. ${m.title}: ${text}`;
}
export function markerPos(ms) {
  const step = currentStep(ms);
  return step ? { x: step.pos[0], z: step.pos[1], radius: step.radius || 5 } : null;
}

// Called when a mission step needs its actors in the world (once per step).
export function enterStep(world) {
  const ms = world.missions;
  const step = currentStep(ms);
  if (!step) return;
  ms.timer = step.time || 0;
  ms.kills = 0; ms.bags = 0;
  if (step.type === 'kill' && !ms.rivalsSpawned) {
    ms.rivalsSpawned = true;
    world.rivals = [];
    const spots = [[140, 140], [150, 130], [130, 150], [155, 145], [135, 125]];
    spots.forEach(([x, z], i) => {
      world.rivals.push({
        id: 'rival' + i, x, z, yaw: 0, health: 100, meshKey: 'rival',
        kind: 'rival', shootTimer: 1 + i * 0.4, speed: 0,
      });
    });
    world.toast('Harbor rivals incoming — take them all down!', 3);
  }
  if (step.type === 'collect' && !ms.bagsSpawned) {
    ms.bagsSpawned = true;
    world.lootBags = [
      { x: -160, z: -40, taken: false },
      { x: -140, z: 0, taken: false },
      { x: -170, z: 100, taken: false },
    ];
    world.toast('Three loot bags are stashed around the Marina.', 3);
  }
  if (step.type === 'escape') {
    world.wanted.locked = step.wanted || 4;
    world.wanted.level = step.wanted || 4;
    world.toast(`Wanted level ${step.wanted} — reach the marker!`, 3);
  }
}

function advance(world, note) {
  const ms = world.missions;
  ms.step += 1;
  const m = currentMission(ms);
  if (note) world.toast(note, 2.5);
  if (m && ms.step >= m.steps.length) {
    // Mission complete: pay, unlock the next, clear mission locks.
    world.cash += m.reward;
    world.toast(`Mission complete: ${m.title} — +$${m.reward}`, 4);
    world.audio.missionComplete();
    world.wanted.locked = 0;
    world.rivals = [];
    world.lootBags = [];
    ms.rivalsSpawned = false; ms.bagsSpawned = false;
    ms.index += 1; ms.step = 0;
    world.saveSoon = true;
    if (ms.index >= MISSIONS.length) {
      ms.done = true;
      world.state = 'complete';
      world.audio.fanfare();
      return;
    }
    const next = currentMission(ms);
    world.toast(`New mission: ${next.title} — ${next.briefing}`, 5);
    enterStep(world);
  } else {
    enterStep(world);
  }
}

// Per-frame mission logic. `events` carries what happened this frame:
// {interacted, enteredCar, deliveredCar}. Returns nothing; toasts announce.
export function updateMissions(world, dt, events) {
  const ms = world.missions;
  if (ms.done) return;
  const step = currentStep(ms);
  if (!step) return;
  const p = world.player;
  if (ms.timer > 0) {
    ms.timer -= dt;
    if (ms.timer <= 0) {
      // Timed step failed: restart the mission from its first step.
      ms.step = 0; ms.timer = 0; ms.kills = 0; ms.bags = 0;
      world.wanted.locked = 0;
      world.toast('Too slow — the mission restarts. Try again!', 3.5);
      enterStep(world);
      return;
    }
  }
  const d = dist2(p.x, p.z, step.pos[0], step.pos[1]);
  switch (step.type) {
    case 'goto':
      if (d < step.radius) advance(world);
      break;
    case 'interact':
      if (d < step.radius && events.interacted) advance(world, 'Done.');
      break;
    case 'enterCar':
      if (events.enteredCar) advance(world, 'The Sunray is yours. Drive!');
      break;
    case 'deliverCar':
      if (p.inCar && p.car && p.car.modelKey === 'sunray' && d < step.radius) {
        advance(world, 'Delivered. The garage crew takes it from here.');
      }
      break;
    case 'taxiPickup':
      if (d < step.radius && events.interacted) {
        ms.farePassenger = true;
        advance(world, 'Fare aboard — drive fast, drive smooth.');
      }
      break;
    case 'taxiDrop':
      if (ms.farePassenger && d < step.radius) {
        ms.farePassenger = false;
        world.cash += 40;
        advance(world, 'Fare paid +$40. Next client.');
      }
      break;
    case 'kill': {
      const alive = world.rivals.filter((r) => r.health > 0).length;
      ms.kills = step.count - alive;
      if (alive <= 0) advance(world, 'Harbor crew down.');
      break;
    }
    case 'collect': {
      for (const bag of world.lootBags) {
        if (!bag.taken && dist2(p.x, p.z, bag.x, bag.z) < 2.5) {
          bag.taken = true; ms.bags += 1;
          world.cash += 100;
          world.audio.pickup();
          world.toast(`Loot bag ${ms.bags} of ${step.count} — +$100`, 2.5);
        }
      }
      if (ms.bags >= step.count) advance(world, 'All loot grabbed. Run for the boat!');
      break;
    }
    case 'escape':
      if (d < step.radius) {
        world.wanted.locked = 0;
        world.wanted.level = 0;
        advance(world, 'You slipped the Bay Patrol.');
      }
      break;
    default:
      break;
  }
}
export { CFG };
