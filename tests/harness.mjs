// Shared Playwright helpers for smoke tests and automated playtests.
// Usage: import { launch, openGame, shot, press, hold, state } from './harness.mjs'
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// DIST_DIR / OUT_DIR env vars let parallel workers use their own build + screenshot folders.
export const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, 'dist');
export const OUT = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, 'tests', 'output');
fs.mkdirSync(OUT, { recursive: true });

export async function launch({ mobile = false, width = 1280, height = 720 } = {}) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
      : { viewport: { width, height } },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return { browser, context, page, errors };
}

// file: 'family.html' (with photos) or 'index.html'
export async function openGame(page, file = 'family.html') {
  const f = path.join(DIST, fs.existsSync(path.join(DIST, file)) ? file : 'index.html');
  await page.goto('file://' + f, { timeout: 300000 });
  await page.waitForFunction(() => window.__app && window.__app.game, null, { timeout: 300000 });
}

export async function shot(page, name) {
  const p = path.join(OUT, name.endsWith('.png') ? name : name + '.png');
  await page.screenshot({ path: p, timeout: 180000 });
  return p;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function press(page, key, ms = 60) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
}

export async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await sleep(ms);
  for (const k of keys) await page.keyboard.up(k);
}

// Start a match directly through the app API (bypasses menus).
export async function startMatch(page, charId = 'dorian', mode = 'endless', difficulty = 'normal') {
  await page.evaluate(([c, m, d]) => window.__app.startGame({ charId: c, mode: m, difficulty: d, fresh: true }), [charId, mode, difficulty]);
  await sleep(300);
}

// Snapshot of useful game state.
export async function state(page) {
  return page.evaluate(() => {
    const a = window.__app;
    const g = a.game;
    const h = g.human;
    return {
      appState: a.state,
      time: g.time,
      fps: a.engine.fps,
      human: h && { pos: { ...h.pos }, cash: h.cash, carrying: h.carrying && { kind: h.carrying.kind }, speedLevel: h.speedLevel, interact: h.interact && { key: h.interact.key, label: h.interact.label, verb: h.interact.verb } },
      players: g.players.map((p) => ({ id: p.id, pos: { x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1) }, cash: Math.floor(p.cash), carrying: p.carrying?.kind || null, planted: p.stats.planted, steals: p.stats.steals })),
      gardens: g.gardens.map((gd) => ({ slot: gd.slot, plants: gd.planters.filter((x) => x.plant).length, pile: Math.floor(gd.cashPile) })),
    };
  });
}

// Teleport the human (test-only helper).
export async function teleport(page, x, z) {
  await page.evaluate(([x, z]) => {
    const h = window.__app.game.human;
    h.pos.x = x;
    h.pos.z = z;
    h.pos.y = 0;
    h.vel.x = h.vel.z = h.vel.y = 0;
  }, [x, z]);
}

// Fast-forward the simulation by `seconds` (runs game.update in fixed steps without rendering).
export async function fastForward(page, seconds, step = 1 / 30) {
  await page.evaluate(([s, st]) => {
    const g = window.__app.game;
    for (let t = 0; t < s; t += st) g.update(st);
  }, [seconds, step]);
}

// Deterministic stepping: stop the rAF loop and advance whole frames (sim + render) by hand.
// Use this instead of wall-clock sleeps so tests pass on slow/loaded machines.
export async function manualFrames(page) {
  await page.evaluate(() => window.__app.engine.stop());
}

export async function stepFrames(page, n = 1, dt = 1 / 30) {
  await page.evaluate(([n, dt]) => {
    for (let i = 0; i < n; i++) window.__app.engine.frame(dt);
    // drain the GL queue so screenshots don't time out on slow software rendering
    const gl = window.__app.engine.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }, [n, dt]);
}
