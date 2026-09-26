// Renders the home-screen / install icons into assets/icons/ (committed; build.mjs copies them into dist).
// Run after changing the art: node scripts/make-icons.mjs  (needs Playwright's Chromium)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { appIconSvg } from '../src/ui/appIcon.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'assets', 'icons');
fs.mkdirSync(out, { recursive: true });

const ICONS = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.78],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:#1b2440}svg{display:block;width:${size}px;height:${size}px}</style>${appIconSvg(pad)}`);
  await page.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
fs.writeFileSync(path.join(out, 'icon.svg'), appIconSvg(1));
await browser.close();
