# MATI's Campout

*Keep the fire alive. Survive the night.* A cozy-meets-scary wilderness
survival game for families, made in Godot 4.7.2 (GDScript). Runs on Windows,
macOS and in the browser, including phones and tablets (landscape, touch
controls). Architecture and contracts: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run

```sh
godot --path .                      # play (desktop, Forward+)
godot --path . -- --autostart       # skip the title screen
# Preview the phone/browser version on a desktop:
godot --path . --resolution 1266x585 --rendering-method gl_compatibility -- --touch --dpr=1.5 --quality=phone
```

`--touch` turns mouse clicks into touches and shows the touch controls,
`--dpr=1.5` makes the UI scale like a phone, `--quality=phone` uses the
phone preset for that run only.

## Test

```sh
tools/check.sh                                              # import, parse, unit tests, smoke test
godot --headless --path . -s res://ui/ui_selftest_launcher.gd
godot --headless --path . res://tests/player_drive.tscn
godot --headless --path . --fixed-fps 60 res://tests/monster_sim.tscn
godot --headless --path . res://tests/touch_drive.tscn      # phone / touch controls
```

Browser check (Playwright + Chromium, software WebGL, slow):

```sh
tools/export_web.sh --no-copy
NODE_PATH=$(npm root -g) node tests/web/web_check.cjs        # --only=desktop | --only=phone
```

Screenshots land in `tests/output/web/`.

## Export

Export templates for 4.7.2 must be installed. Presets live in
`export_presets.cfg`; builds go to `build/` (gitignored).

| Preset | Command | Output |
|---|---|---|
| Web (desktop + phones) | `tools/export_web.sh` | `build/web/` and a copy in `web/site/play/` |
| Windows Desktop | `godot --headless --path . --export-release "Windows Desktop" build/windows/MATIsCampout.exe` | one exe (data embedded) |
| macOS | `godot --headless --path . --export-release "macOS" build/macos/MATIsCampout.zip` | universal .app in a zip, unsigned |

`tools/export_web.sh` also builds the custom page (`web/shell/shell.src.html`
-> `web/shell/index.html`, the loading screen with "Tap to start"), fixes the
PWA service worker and prints the download sizes. Serve `build/web/` with any
static server (`python3 -m http.server`); no special headers are needed (the
no-threads template does not use SharedArrayBuffer). The web build is a PWA:
"Add to Home Screen" on iPhone / Android opens it fullscreen in landscape.

Publishing: `web/site/` is the campout.quest website and serves the game at
`/play/`. `web/site/play/` is gitignored for now; commit it or upload it to
the host when the build should go live.

macOS: the zip is unsigned, so players right-click the app and pick
**Open** the first time (or sign and notarize it with an Apple Developer ID).
