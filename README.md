# Steal A Seed! Family Edition

A Roblox-style 3D browser game starring **Dorian, Esther, Maddie and Micah**, inspired by the Roblox
hit *Steal A Seed!*. Run up the Seed Road, grab seeds, grow them into money-making plants, train your
speed to reach rarer biomes, and steal your family's best plants (while stopping them from stealing yours).

* One self-contained HTML file: three.js is bundled, textures and music are generated in code, and
  nothing is downloaded at runtime.
* Works on desktop (keyboard/mouse or gamepad) and phones/tablets (touch controls).
* Pick your family member; the other three are AI rivals with their own personalities.
* Two modes: **Endless** (auto-saves in the browser) and **Family Showdown** (8-minute match with a podium).

## Controls
| | Keyboard & mouse | Touch | Gamepad |
|---|---|---|---|
| Move | WASD / arrows | left thumb joystick | left stick |
| Camera | right-drag or left-drag, wheel to zoom | drag right side, pinch | right stick |
| Jump | Space | Jump button | A |
| Grab / Steal / Sell | E (hold to steal) | Action button | B |
| Pool-noodle bonk | click or F | Bonk button | X |
| Items | 1–5 | tap hotbar | Y / bumpers |
| Pause | Esc | pause button | Start |

## Family photos (kept private)
Real faces are **not** in this repository. Put aligned face crops in `private/faces/`
(`<id>_face.jpg` 512×512 with eyes at 42% height, `<id>_avatar.jpg` 256×256, optional `skin.json`),
and the build embeds them into `dist/family.html` and `dist/artifact.html`. `private/` is git-ignored.
Without photos the game uses classic cartoon faces. Players can also set a face for any character
in the in-game **Photo Booth**; it stays on their device.

## Develop
```bash
npm install
node build.mjs            # dist/index.html (public), dist/family.html + dist/artifact.html (with photos)
node tests/smoke.mjs      # headless Playwright smoke test of the core loop
```
Read `docs/DESIGN.md` for the game design and `docs/ARCHITECTURE.md` for how the code fits together.
