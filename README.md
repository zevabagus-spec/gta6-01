# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zevabagus-spec/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zevabagus-spec/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solara Bay — "The Solara Job": a complete open-world crime game that plays offline in desktop Chrome from static files. Explore five districts on foot and by car, steal cars, dodge police at wanted levels 0-5, fight with fists and a pistol, collect 30 Sun Coins, and run six story missions with Dario Voss and Mara Quinn, from the gold Sunray coupe to the warehouse-to-boat finale. HUD with canvas minimap, title/pause/busted/wasted/complete screens, localStorage saves with autosave, and procedural WebAudio sound and music.

Approach: a hand-written vanilla WebGL engine — my own matrices, shaders, city generator, traffic, pedestrian, police, mission and HUD code, split into one-job modules under game/src/. No library or engine is vendored and no code is copied: every line was written for this entry, so the game has zero network requests and zero external assets. All names, characters, story, art and sounds are original; nothing comes from Rockstar Games or any commercial game. The city is seeded and deterministic, police rams carry a per-car cooldown, and ?shot= staging makes each screenshot show several systems at once.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Keyboard and mouse: WASD move/drive, drag mouse to look, click punch/shoot, F enter/steal car, E interact, 1/2 weapons, R reload, M music, P pause.

---

<sub>Entered on [make.fun](https://make.fun/?ref=pkrtjm47&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
