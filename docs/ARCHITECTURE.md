# Architecture

Plain ES modules bundled by esbuild into one self-contained HTML file (three.js is bundled; no
network needed at runtime). Read `docs/DESIGN.md` first for what the game is.

```
src/
  main.js                 App shell: engine, world, attract mode, start/pause/quit, save, frame loop  [integrator]
  config.js               ALL tunable data: plants, biomes, items, characters, chat lines, prices     [integrator]
  core/                   engine.js (renderer/lights/loop), input.js, camera.js, physics.js,
                          events.js (bus), settings.js, save.js, rng.js                                [integrator]
  gameplay/               game.js (the rules), player.js, layout.js (positions), humanController.js   [integrator]
  view/                   gameView.js (binds game state -> 3D objects + labels), labels.js           [integrator]
  world/                  the map art: baseplate, gardens, road biomes, shops, sky, weather          [world agent]
  characters/             avatar.js (R6 avatar + photo face + animation), faces.js, monsters.js     [character agent]
  plants/                 plantMeshes.js (+ helpers): plants, seeds, pods, carried pots              [plant agent]
  ui/                     styles.js, hud.js, menus.js, touch.js (+ helpers)                          [ui agent]
  audio/                  audio.js: procedural music + sfx                                           [audio agent]
  fx/                     effects.js (particles, floating text), props.js (banana, balloon, noodle)  [fx agent]
  ai/                     bot.js: bot brains                                                          [ai agent]
```

## Coordinate system and units
* Units are Roblox studs. A character is ≈5.2 studs tall (legs 2, torso 2, head ~1.2).
* Y up. **+Z is north** (the Seed Road runs from z=60 to z=960). Plaza/gardens are around the origin.
* Facing/yaw: forward = `(sin(yaw), 0, cos(yaw))`; yaw 0 faces +Z. A model built facing +Z
  and rotated with `object3d.rotation.y = yaw` faces correctly.
* All positions come from `gameplay/layout.js` (`LAYOUT`): gardens (bounds, gate, planters,
  pads, sign), pods, shops, spawn, road gate, biome z-ranges, static colliders.

## Data flow
```
Input ─► HumanController ─┐
                          ├─► Intent ─► Game.update(dt) ─► state + bus events
BotController (ai/) ──────┘                                  │
                                                             ├─► GameView (3D objects, labels)
                                                             ├─► ui/ (HUD reads state each frame; menus)
                                                             ├─► fx/ (listens to bus)
                                                             └─► audio/ (listens to bus)
```
`Game` is pure simulation (no DOM, no three.js scene). Everything visual/audible reacts to its
state or to events on `bus` (`core/events.js`).

## Game state (read-only for non-gameplay modules)
* `game.time` (sim seconds), `game.players[4]` (slot order = `CHARACTERS` order: dorian, esther, maddie, micah),
  `game.human` (Player or null in attract mode), `game.gardens[4]` (index = slot),
  `game.pods[]`, `game.ground[]` (dropped seeds, banana peels), `game.projectiles[]` (balloons),
  `game.monsters[]`, `game.event` (`{type, def, startedAt, endsAt}` or null), `game.match` (`{endsAt}` in showdown),
  `game.netWorth` (Map player→number, refreshed 4×/s), `game.ranking()`, `game.timeLeft()`.
* Player: `slot, id, name, char, isHuman, pos{x,y,z}, vel, yaw, onGround, cash, speedLevel, rebirths,
  items{banana,balloon,coil,cloak,bucket}, selectedItem, carrying, stunUntil, invulnUntil, bonkReadyAt,
  swingStart, coilUntil, cloakUntil, celebrateUntil, interact{key,t,hold,label,verb,rarity}, stats{...}`,
  `maxSpeed(now)`, `invisible(now)`.
  * `carrying`: `null | {kind:'seed', speciesId, mutation, podId} | {kind:'plant', plant, fromSlot, fromIndex}`
  * `interact`: the current proximity prompt. `key` null = nothing. `t/hold` = hold progress.
* Garden: `slot, L (layout), owner (Player), planters[10]{index,x,z,unlocked,plant,stealer}, cashPile,
  lockedUntil, lockReadyAt`. `game.isLocked(g)`, `game.gardenIncome(g)`, `game.plantIncome(plant)`.
* Plant: `{uid, speciesId, mutation, growTotal, growLeft, owner}` — grown when `growLeft <= 0`.
* Pod: `{id, biome, side, x, z, seed: {speciesId, mutation, lucky} | null, respawnAt}`.
* Monster: `{uid, biome, type, def, x, y, z, yaw, vx, vz, state:'patrol'|'chase'|'stunned', target, stunUntil, attackAt}`.

Game actions usable by bots/UI: `grabPodSeed, stealPlant, sellPlant, unlockPlanter, lockGarden,
buyItem(p,id,qty), buySpeed(p), rebirth(p), canRebirth(p), useItem(p,id), findInteraction(p), say(p, category, vars)`.
Purchases require being near the matching shop (`LAYOUT.shops`).

## Events on `bus`
Gameplay (payload fields; `player`/`thief`/`victim`/`by`/`target` are Player objects):
| event | payload |
|---|---|
| `seed:grabbed` | player, speciesId, mutation, rarity, pod? / ground? |
| `seed:dropped` | player, item (ground seed), by, cause |
| `seed:expired`, `ground:expired` | item |
| `plant:planted` | player, plant, planter, garden |
| `plant:grown` | plant, planter, garden |
| `plant:sold` | player, plant, value, planter |
| `plant:returned` | plant, planter (or null), garden, refund? |
| `plant:watered` | player, planter |
| `planter:unlocked` | player, index, cost |
| `steal:start` / `steal:cancel` | thief, victim, plant, garden / thief |
| `steal:grabbed` | thief, victim, plant, garden |
| `steal:success` | thief, victim, plant, planter, garden, soldFor? |
| `steal:foiled` | thief, victim, plant, by (Player or null), cause: 'bonk'/'balloon'/'banana'/'monster' |
| `cash:collected` | player, amount, x, z |
| `lock:on` / `lock:off` | player, garden, until |
| `garden:full` | player |
| `bonk:swing` / `bonk:miss` | player |
| `player:hit` | target, by, cause, dropped |
| `player:jump` | player |
| `monster:aggro` / `monster:caught` / `monster:bonked` | monster, target / monster, target, lost / monster, by |
| `item:used` / `item:empty` / `item:fail` | player, item(, reason) |
| `balloon:splash` | x, y, z, owner |
| `banana:slip` | target, owner, x, z |
| `purchase` / `purchase:fail` | player, what, cost, qty / player, reason, cost |
| `speed:up` | player, level, cost |
| `rebirth` | player, rebirths |
| `pod:respawn` | pod |
| `event:start` / `event:end` | event |
| `match:end` | ranking: [{player, netWorth}] |
| `chat` | player, text |
| `shop:open` | player, shop: 'gear'/'speed'/'rebirth' |

App: `game:start {game, human, resumed}`, `game:dispose {game}`, `app:state {state: 'title'|'playing'|'paused'|'shop'|'ended'}`,
`settings:changed {key, value}`, `face:changed {id}`, `camera:shake {amount}` (emit it to shake the camera),
`engine:resize {w,h}`.

Many events fire for bots too: filter with `player === game.human` (or `victim === game.human`) when an
effect/sound/alert should only happen for the local player, and scale by distance to the camera otherwise.

## Module contracts
The placeholder file for each module documents its exact exported API at the top. Keep those signatures.
* `world/world.js` → `buildWorld(engine, layout, quality)`.
* `characters/avatar.js` → `createAvatar(charDef, faceImage, skinHex)`; `characters/monsters.js` → `createMonster(type)`.
* `plants/plantMeshes.js` → `createPlantView`, `createSeedView`, `createCarriedPlantView`, `createPodView`.
* `fx/effects.js` → `createEffects(engine, container)` (+ `attach(game)`); `fx/props.js` → `createBanana`, `createBalloon`, `createNoodle`.
* `audio/audio.js` → `audio` singleton (`unlock, attach, setMusicMode, play, update, setMuted`). Named sounds for
  `audio.play(name, opts)`: UI `click`, `hover`, `error`, `shopBell`, `confetti`; gameplay `coins {amount}`,
  `grab {tier, mutation}`, `purchase`, `speedUp`, `unlock`, `rebirth`, `event {type}`; pass `{x, z}` for positional sounds.
* `ui/*` → `injectStyles()`, `createHUD(app)`, `createMenus(app)`, `createTouchControls(app)`.
* `ai/bot.js` → `new BotController(personality, difficultyId)` with `getIntent(game, player, dt)`.

The `app` object (see `main.js`) exposes: `engine, input, game, human, cam, labels, fx, audio, settings, bus,
root (#ui element), menus, touch, state, startGame({charId, mode, difficulty, fresh}), hasSave(charId),
pause(), resume(), quitToTitle(), saveNow()`.

## Rules for contributors (humans and agents)
* Only edit files you own. Need something from a shared file (config, game, main, view)? Describe the
  change in your report; the integrator applies it.
* No network at runtime: no external images/fonts/scripts except Google Fonts CSS with system fallbacks.
  Generate textures procedurally (canvas) and sounds with WebAudio.
* Family photos live only in `private/` (git-ignored) and are injected at build time as
  `window.__FAMILY_FACES__`. Never commit them and never print their base64.
* Performance budget: 60 fps on a mid laptop, 30+ on a phone. Share geometries/materials, use
  `InstancedMesh`/merged geometry for repeated props, no per-frame allocations in hot paths,
  respect `engine.quality` (`low|medium|high`, `decorDensity`, `shadows`).
* Build: `node build.mjs --out <your-dir>`; dev galleries: `node build.mjs --entry src/<module>/dev/gallery.js --out <dir>`.
* Test: `DIST_DIR=<dir> OUT_DIR=<dir> node tests/smoke.mjs` and your own Playwright scripts using
  `tests/harness.mjs` (headless Chromium with SwiftShader WebGL; slow but accurate). Look at your screenshots.
