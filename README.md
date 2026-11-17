# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zevabagus-spec/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zevabagus-spec/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solara Bay** — an original 3D open-world crime game for make.fun's "Make GTA 6" bounty: a sun-soaked coastal city of five districts, explored on foot and by car. You are Dario Voss, a courier pulled into fixer Mara Quinn's six-job heist, "The Solara Job". Steal cars, outrun the police, fight rivals, collect Sun Coins, and pull off the Marina heist — all offline, in a desktop browser, from static files. Every name, character, place, story beat, sound and piece of art is original; nothing comes from Rockstar Games or any other commercial game.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

## How it plays

- **On foot (third person):** WASD move, Shift run, mouse drag to orbit the camera, F punch, click to fire the pistol, 1/2 switch fists / pistol, E interact / enter a car, P pause, M mute.
- **Driving:** W accelerate, S brake / reverse, A/D steer, Space handbrake, E exit the car, C change camera.
- **The city:** five districts — Marina, Downtown, Old Town, Harbor, The Hills — with 14 traffic cars, 24 pedestrians, parked cars to steal, 30 Sun Coins and health / armour pickups.
- **Wanted 0–5:** crimes raise your stars; police cars chase and ram you, and from 3 stars on-foot cops shoot at you and bust you on touch. Lay low and the heat cools off.
- **Missions:** six story jobs from Mara Quinn — a pickup, stealing the Sunray sportscar, three timed taxi fares, a rival shootout, a wanted-4 escape, and the Marina heist at wanted 5. The HUD shows your cash, health, armour, stars, ammo, the clock, the current objective and a live minimap.
- **Save:** progress autosaves every 15 seconds to localStorage (or session-only if storage is unavailable) and can be continued from the title screen.

## Approach

The game is built in small modules with one job each under `game/src/` (city, vehicles, pedestrians, player, driving, wanted, missions, HUD, audio, save, shots) on top of three.js 0.186.1, vendored as `game/vendor/three.min.js`. The world is procedural: a seeded city generator lays out districts, roads, buildings, traffic loops and pedestrians, so the same seed always builds the same city. Combat is hitscan with a short tracer and muzzle flash; police AI chases, rams and (on foot) shoots; traffic follows road loops and yields. Sound and the synthwave loop are synthesized live with WebAudio — no audio files. Screenshot scenes are staged deterministically with `?shot=chase|street|mission|title&seed=7`, which replays the real game forward from a fixed seed so each shot is a real render of the game's own code.

---

<sub>Entered on [make.fun](https://make.fun/?ref=pkrtjm47&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
