// missions: "The Solara Job" — six story jobs from fixer Mara Quinn.
// Each mission has an objective, a beacon marker, and a step machine.
// The HUD arrow and the beacon always point at the current target.
import * as THREE from '../vendor/three.min.js';
import { MARKER_1, HIDEOUT, INTERACT_RADIUS, dist2d, clamp } from './config.js';
import { makePersonMesh } from './pedestrians.js';
import { damagePlayer } from './player.js';

export const MISSIONS = [
  { title: '1 — First Pickup', text: 'Mara Quinn needs a package. Go to the Marina pier and pick it up.' },
  { title: '2 — The Sunray', text: 'Steal the yellow Sunray sportscar at Downtown and deliver it to the garage.' },
  { title: '3 — Taxi Rush', text: 'Drive the taxi. Three fares, each on a 60-second clock. Don\'t keep them waiting.' },
  { title: '4 — Rival Shootout', text: 'The Harbor crew jumped Mara\'s people. Take out all four rivals at the docks.' },
  { title: '5 — The Escape', text: 'Wanted level 4. Lose the heat and reach the Hills hideout in 90 seconds.' },
  { title: '6 — Marina Heist', text: 'Grab the 3 loot bags at the Marina bank, then get to the hideout at wanted 5.' },
];

const GARAGE = { x: -40, z: 40 };
const FARES = [
  { from: { x: -60, z: -30 }, to: { x: 90, z: 0 } },
  { from: { x: 60, z: -90 }, to: { x: -120, z: 60 } },
  { from: { x: 0, z: 90 }, to: { x: 120, z: -60 } },
];
const RIVAL_SPOTS = [[118, 10], [118, 30], [122, 20], [118, 40]];
const LOOT_SPOTS = [[-8, -104], [8, -96], [0, -112]];

export function createMissions(g) {
  g.missionIndex = 0;
  g.missionStep = 0;
  g.missionTimer = 0;
  g.fareIndex = 0;
  g.farePassenger = false;
  g.rivals = [];
  g.lootBags = [];
  g.lootTaken = 0;
  g.markerTarget = { ...MARKER_1 };
  // Beacon: a glowing cylinder + a floating diamond over the target.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35 });
  g.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true), beaconMat);
  g.beacon.position.set(MARKER_1.x, 15, MARKER_1.z);
  g.scene.add(g.beacon);
  const dia = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  dia.position.set(MARKER_1.x, 6, MARKER_1.z);
  g.scene.add(dia);
  g.beaconDiamond = dia;
  g.hudApi.setObjective(MISSIONS[0].title, MISSIONS[0].text);
}

export function startMission(g, i) {
  g.missionIndex = i;
  g.missionStep = 0;
  g.missionTimer = 0;
  g.fareIndex = 0;
  g.farePassenger = false;
  const m = MISSIONS[i];
  g.hudApi.setObjective(m.title, m.text);
  if (i === 0) g.markerTarget = { ...MARKER_1 };
  if (i === 1) g.markerTarget = { x: g.sunray.x, z: g.sunray.z };
  if (i === 2) g.markerTarget = { ...FARES[0].from };
  if (i === 2) g.missionTimer = 60;
  if (i === 3) { g.markerTarget = { x: 118, z: 20 }; spawnRivals(g); }
  if (i === 4) { g.markerTarget = { ...HIDEOUT }; g.wantedApi.setWanted(4); g.missionTimer = 90; }
  if (i === 5) { g.markerTarget = { ...LOOT_SPOTS[0] }; spawnLoot(g); }
  g.hudApi.toast(m.title + ' — ' + m.text);
  g.audio.missionStart();
}

function spawnRivals(g) {
  g.rivals = [];
  for (const [x, z] of RIVAL_SPOTS) {
    const mesh = makePersonMesh(0xc23b3b, 0x1c1c22);
    mesh.position.set(x, 0, z);
    g.scene.add(mesh);
    g.rivals.push({ mesh, x, z, hp: 100, kind: 'rival', shootTimer: 1 + Math.random() * 2 });
  }
}

function spawnLoot(g) {
  g.lootBags = [];
  g.lootTaken = 0;
  for (const [x, z] of LOOT_SPOTS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.8), new THREE.MeshLambertMaterial({ color: 0x2f8f4e }));
    mesh.position.set(x, 0.6, z);
    g.scene.add(mesh);
    g.lootBags.push({ mesh, x, z, taken: false });
  }
}

function completeMission(g, reward, text) {
  g.cash += reward;
  g.hudApi.toast(text + '  +$' + reward);
  g.audio.missionComplete();
  if (g.missionIndex >= MISSIONS.length - 1) {
    g.onComplete();
    return;
  }
  startMission(g, g.missionIndex + 1);
  // Save after advancing, so Continue resumes at the next job, not the done one.
  g.saveApi.save();
}

function playerAt(g) {
  return g.driving ? { x: g.playerCar.position.x, z: g.playerCar.position.z } : g.playerPos;
}

// E was pressed: try the current mission interaction. Returns true if used.
export function missionInteract(g) {
  const p = playerAt(g);
  const i = g.missionIndex;
  const near = (t, r) => dist2d(p.x, p.z, t.x, t.z) < r;
  if (i === 0 && near(MARKER_1, INTERACT_RADIUS)) {
    completeMission(g, 50, 'PACKAGE SECURED');
    return true;
  }
  if (i === 5) {
    for (const bag of g.lootBags) {
      if (!bag.taken && near(bag, 3.5)) {
        bag.taken = true;
        g.scene.remove(bag.mesh);
        g.lootTaken += 1;
        g.cash += 150;
        g.audio.coin();
        g.hudApi.toast('LOOT BAG ' + g.lootTaken + '/3  +$150');
        g.wantedApi.setWanted(5);
        if (g.lootTaken >= 3) { g.markerTarget = { ...HIDEOUT }; g.hudApi.setObjective(MISSIONS[5].title, 'All 3 bags — get to the Hills hideout!'); }
        else g.markerTarget = { ...LOOT_SPOTS[g.lootTaken] };
        return true;
      }
    }
  }
  return false;
}

export function updateMissions(g, dt) {
  const p = playerAt(g);
  const i = g.missionIndex;
  if (g.completed) return;
  // Beacon follows the current target.
  g.beacon.position.set(g.markerTarget.x, 15, g.markerTarget.z);
  g.beaconDiamond.position.set(g.markerTarget.x, 6 + Math.sin(g.time * 3) * 0.5, g.markerTarget.z);
  g.beaconDiamond.rotation.y += dt * 2;

  if (i === 1) {
    if (g.missionStep === 0 && g.sunray.taken) {
      g.missionStep = 1;
      g.markerTarget = { ...GARAGE };
      g.hudApi.setObjective(MISSIONS[1].title, 'Deliver the Sunray to the garage in Old Town.');
    } else if (g.missionStep === 1 && g.driving && dist2d(p.x, p.z, GARAGE.x, GARAGE.z) < 8) {
      completeMission(g, 300, 'SUNRAY DELIVERED');
    }
  }
  if (i === 2) {
    const fare = FARES[g.fareIndex];
    if (!fare) return;
    g.missionTimer -= dt;
    if (g.missionTimer <= 0 && g.fareIndex < FARES.length) {
      // Fare expired: skip it, move on.
      g.hudApi.toast('FARE MISSED — next customer');
      g.fareIndex += 1;
      g.farePassenger = false;
      if (g.fareIndex >= FARES.length) { completeMission(g, 0, 'TAXI SHIFT DONE'); return; }
      g.markerTarget = { ...FARES[g.fareIndex].from };
      g.missionTimer = 60;
      return;
    }
    if (!g.farePassenger) {
      g.markerTarget = { ...fare.from };
      if (g.driving && dist2d(p.x, p.z, fare.from.x, fare.from.z) < 7) {
        g.farePassenger = true;
        g.markerTarget = { ...fare.to };
        g.hudApi.toast('PASSENGER IN — drive to the drop-off');
        g.audio.coin();
      }
    } else if (g.driving && dist2d(p.x, p.z, fare.to.x, fare.to.z) < 7) {
      g.cash += 80;
      g.hudApi.toast('FARE PAID  +$80');
      g.audio.missionComplete();
      g.fareIndex += 1;
      g.farePassenger = false;
      if (g.fareIndex >= FARES.length) { completeMission(g, 120, 'ALL FARES DONE — SHIFT BONUS'); return; }
      g.markerTarget = { ...FARES[g.fareIndex].from };
      g.missionTimer = 60;
    }
  }
  if (i === 3) {
    // Rivals shoot back when close.
    for (const r of g.rivals) {
      if (r.hp <= 0) continue;
      const d = dist2d(r.x, r.z, p.x, p.z);
      if (d < 40) {
        r.shootTimer -= dt;
        if (r.shootTimer <= 0) {
          r.shootTimer = 1.8;
          g.audio.enemyShot();
          if (Math.random() < 0.4 && !g.driving && damagePlayer(g, 5)) g.onWasted();
        }
      }
    }
    if (g.rivals.length && g.rivals.every((r) => r.hp <= 0)) completeMission(g, 400, 'RIVALS DOWN — HARBOR IS YOURS');
  }
  if (i === 4) {
    g.missionTimer -= dt;
    if (dist2d(p.x, p.z, HIDEOUT.x, HIDEOUT.z) < 9) {
      g.wantedApi.clearWanted();
      completeMission(g, 500, 'ESCAPED — THE HEAT IS OFF');
    } else if (g.missionTimer <= 0) {
      g.missionTimer = 90;
      g.wantedApi.setWanted(4);
      g.hudApi.toast('TOO SLOW — the heat is back on. Try again!');
    }
  }
  if (i === 5 && g.lootTaken >= 3) {
    if (dist2d(p.x, p.z, HIDEOUT.x, HIDEOUT.z) < 9) {
      g.wantedApi.clearWanted();
      completeMission(g, 1000, 'THE SOLARA JOB — $1,000 SCORE');
    }
  }
  // Mission 1 reminder radius: the marker is right by the spawn.
  if (i === 0) g.nearMissionMarker = dist2d(p.x, p.z, MARKER_1.x, MARKER_1.z) < INTERACT_RADIUS;
}
