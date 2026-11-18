// The story: Mara Voss owes fixer Ilsa Marek one debt, and six jobs pay it
// off. Missions are data-driven steps — go, talk, steal, deliver, fight,
// collect, escape — with cash rewards, timers, and a gold beacon guiding
// every objective. Between jobs, Ilsa's office starts the next one.
import { distance2D } from './rng.js';
import { CAR_MODELS } from './vehicles.js';

export const MISSIONS = [
  {
    title: 'First Errand',
    intro: 'Ilsa: "One package, one drop. Drive like the bay is watching — it is."',
    reward: 150,
    steps: [
      { type: 'talk', target: 'ilsaOffice', radius: 6, text: 'Meet Ilsa at her office', contact: 'Ilsa Marek' },
      { type: 'goto', target: 'docks', radius: 7, text: 'Deliver the package to the Solmar Docks' },
    ],
  },
  {
    title: 'Wheels Up',
    intro: 'Ilsa: "Rook needs a Comet GT. There is one parked by the Old Market. Borrow it permanently."',
    reward: 250,
    steps: [
      { type: 'steal', target: 'market', radius: 30, text: 'Steal the marked Comet GT at the Old Market', carModel: 4 },
      { type: 'deliver', target: 'garage', radius: 9, text: 'Deliver the Comet GT to Rook\u2019s Garage' },
    ],
  },
  {
    title: 'Corner Talk',
    intro: 'Petey saw something he should not have. Hear him out, then handle the Gulls who followed him.',
    reward: 350,
    steps: [
      { type: 'talk', target: 'market', radius: 6, text: 'Hear out Petey at the Old Market', contact: 'Petey Lark' },
      { type: 'fight', target: 'market', radius: 40, text: 'Fight off the Gulls', count: 3 },
      { type: 'collect', target: 'market', radius: 4, text: 'Pick up Petey\u2019s package' },
      { type: 'goto', target: 'ilsaOffice', radius: 7, text: 'Bring the package back to Ilsa' },
    ],
  },
  {
    title: 'Harbor Run',
    intro: 'Ilsa: "A crate at the warehouse, a buyer at the docks, and 75 seconds of patience. Go."',
    reward: 500,
    steps: [
      { type: 'collect', target: 'warehouse', radius: 5, text: 'Pick up the crate at the Harbor Warehouse' },
      { type: 'deliver', target: 'docks', radius: 9, text: 'Reach the docks buyer before the timer ends', timeLimit: 75, wantedOnStart: 2 },
    ],
  },
  {
    title: 'The Exchange',
    intro: 'The Gulls set a meet at Tower Plaza. It is a setup. Take the briefcase anyway.',
    reward: 750,
    steps: [
      { type: 'fight', target: 'towerPlaza', radius: 45, text: 'Clear the Gulls at Tower Plaza', count: 5 },
      { type: 'collect', target: 'towerPlaza', radius: 4, text: 'Take the briefcase' },
      { type: 'goto', target: 'hideout', radius: 7, text: 'Escape to the hideout', wantedOnStart: 1 },
    ],
  },
  {
    title: 'Solmar Payday',
    intro: 'Last job. The Gulls keep their cut behind Bay Trust Bank. Take it, and the debt dies with it.',
    reward: 1200,
    steps: [
      { type: 'fight', target: 'bankFront', radius: 45, text: 'Clear the guards at Bay Trust Bank', count: 4 },
      { type: 'collect', target: 'bankFront', radius: 4, text: 'Take the Gulls\u2019 cut' },
      { type: 'goto', target: 'hideout', radius: 8, text: 'Lose the heat and reach the hideout', wantedOnStart: 3 },
    ],
  },
];

export function createMissionManager(city, callbacks) {
  const state = {
    missionIndex: 0,
    stepIndex: 0,
    phase: 'idle',
    armed: true,
    stepTimer: 0,
    spawnedPeds: [],
    spawnedCars: [],
    targetCar: null,
    stepThugs: [],
    storyDone: false,
    completedCount: 0,
  };

  function targetPos(step) {
    const loc = city.locations[step.target];
    return { x: loc.x, z: loc.z, name: loc.name };
  }

  function clearSpawned(world) {
    for (const ped of state.spawnedPeds) {
      const idx = world.peds.peds.indexOf(ped);
      if (idx >= 0) world.peds.peds.splice(idx, 1);
    }
    for (const car of state.spawnedCars) {
      const idx = world.vehicles.cars.indexOf(car);
      if (idx >= 0) world.vehicles.cars.splice(idx, 1);
    }
    state.spawnedPeds = [];
    state.spawnedCars = [];
    state.stepThugs = [];
    state.targetCar = null;
  }

  function spawnStepEntities(world, mission, step) {
    const pos = targetPos(step);
    if (step.type === 'talk' && step.contact) {
      const ped = world.peds.spawnContact(pos.x + 2, pos.z + 2, step.contact);
      state.spawnedPeds.push(ped);
    }
    if (step.type === 'fight') {
      for (let i = 0; i < step.count; i += 1) {
        const angle = (i / step.count) * Math.PI * 2;
        const ped = world.peds.spawnThug(pos.x + Math.cos(angle) * 9, pos.z + Math.sin(angle) * 9, 'Gull ' + (i + 1));
        state.spawnedPeds.push(ped);
        state.stepThugs.push(ped);
      }
    }
    if (step.type === 'steal') {
      const car = world.vehicles.spawnParkedCar();
      car.modelIndex = step.carModel;
      car.model = CAR_MODELS[step.carModel];
      car.color = CAR_MODELS[step.carModel].colors[0];
      car.x = pos.x + 5.4;
      car.z = pos.z;
      car.heading = Math.PI / 2;
      state.spawnedCars.push(car);
      state.targetCar = car;
    }
    if (step.wantedOnStart) {
      world.raiseWanted(step.wantedOnStart);
    }
  }

  function beginStep(world, mission, stepIndex) {
    state.stepIndex = stepIndex;
    const step = mission.steps[stepIndex];
    state.stepTimer = step.timeLimit || 0;
    spawnStepEntities(world, mission, step);
    callbacks.onObjective(mission.title, step.text);
  }

  function startMission(world, index) {
    state.missionIndex = index;
    state.phase = 'active';
    clearSpawned(world);
    const mission = MISSIONS[index];
    callbacks.onMessage(mission.intro);
    callbacks.onMissionStart(mission.title);
    beginStep(world, mission, 0);
  }

  function completeMission(world) {
    const mission = MISSIONS[state.missionIndex];
    state.completedCount += 1;
    state.phase = 'idle';
    // Disarm the office trigger until Mara steps away: finishing a job at
    // the office must not instantly start the next one with no breather.
    state.armed = false;
    clearSpawned(world);
    world.player.cash += mission.reward;
    state.missionIndex += 1;
    if (state.missionIndex >= MISSIONS.length) {
      state.storyDone = true;
      callbacks.onStoryComplete(mission);
    } else {
      callbacks.onMissionComplete(mission);
    }
  }

  function failMission(world, reason) {
    state.phase = 'idle';
    clearSpawned(world);
    callbacks.onMissionFailed(reason);
  }

  function resetToIdle(world) {
    state.phase = 'idle';
    state.armed = true;
    clearSpawned(world);
  }

  // Jump straight to one step of one mission: used by screenshot staging
  // and by automated playtests of the full mission chain.
  function debugJumpToStep(world, missionIndex, stepIndex) {
    state.missionIndex = missionIndex;
    state.phase = 'active';
    clearSpawned(world);
    const mission = MISSIONS[missionIndex];
    beginStep(world, mission, stepIndex);
  }

  return {
    state,
    startMission,
    resetToIdle,
    debugJumpToStep,
    currentObjective(world) {
      if (state.storyDone) {
        return { title: 'FREE ROAM — STORY COMPLETE', text: 'Solmar Bay is yours. Sun coins still pay $25 each.', x: null, z: null, radius: 0, timer: 0 };
      }
      if (state.phase === 'idle') {
        const office = city.locations.ilsaOffice;
        const next = MISSIONS[state.missionIndex];
        return { title: 'NEXT JOB: ' + next.title.toUpperCase(), text: 'Go to Ilsa\u2019s office to start the job', x: office.x, z: office.z, radius: 7, timer: 0 };
      }
      const mission = MISSIONS[state.missionIndex];
      const step = mission.steps[state.stepIndex];
      let pos = targetPos(step);
      if (step.type === 'steal' && state.targetCar) pos = { x: state.targetCar.x, z: state.targetCar.z, name: 'Marked car' };
      if (step.type === 'fight' && state.stepThugs.length > 0) {
        const alive = state.stepThugs.filter((t) => !t.dead);
        if (alive.length > 0) {
          let nearest = alive[0];
          let best = distance2D(world.player.x, world.player.z, nearest.x, nearest.z);
          for (const t of alive) {
            const d = distance2D(world.player.x, world.player.z, t.x, t.z);
            if (d < best) { nearest = t; best = d; }
          }
          pos = { x: nearest.x, z: nearest.z, name: 'Gull' };
        }
      }
      let text = step.text;
      if (step.type === 'fight') {
        const left = state.stepThugs.filter((t) => !t.dead).length;
        text = step.text + ' — ' + left + ' left';
      }
      return { title: mission.title.toUpperCase(), text, x: pos.x, z: pos.z, radius: step.radius || 6, timer: state.stepTimer };
    },
    update(dt, world) {
      if (state.storyDone) return;
      const player = world.player;
      if (state.phase === 'idle') {
        const office = city.locations.ilsaOffice;
        const distToOffice = distance2D(player.x, player.z, office.x, office.z);
        if (distToOffice > 12) state.armed = true;
        if (state.armed && distToOffice < 7) {
          startMission(world, state.missionIndex);
        }
        return;
      }
      const mission = MISSIONS[state.missionIndex];
      const step = mission.steps[state.stepIndex];
      if (state.stepTimer > 0) {
        state.stepTimer -= dt;
        if (state.stepTimer <= 0) {
          failMission(world, 'Out of time — the buyer walked. The job is open again at Ilsa\u2019s office.');
          return;
        }
      }
      const pos = targetPos(step);
      const dist = distance2D(player.x, player.z, pos.x, pos.z);
      let done = false;
      if (step.type === 'goto' || step.type === 'talk' || step.type === 'collect') {
        done = dist < (step.radius || 6);
        if (done && step.type === 'collect') {
          world.effects.coinSparkle(pos.x, 1.5, pos.z);
          world.audio.pickup();
        }
      } else if (step.type === 'deliver') {
        done = player.inCar && dist < (step.radius || 9);
      } else if (step.type === 'steal') {
        done = player.inCar && player.car === state.targetCar;
        if (done) world.raiseWanted(1);
      } else if (step.type === 'fight') {
        done = state.stepThugs.length > 0 && state.stepThugs.every((t) => t.dead);
      }
      if (!done) return;
      if (state.stepIndex + 1 >= mission.steps.length) {
        completeMission(world);
      } else {
        beginStep(world, mission, state.stepIndex + 1);
      }
    },
  };
}
