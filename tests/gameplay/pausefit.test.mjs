// The pause menu on small phones (ui/soundControls.js + the pause rules in ui/styles.js): a vertical swipe over a
// volume slider scrolls instead of changing the volume, and short portrait screens show just the two sound switches
// side by side (no sliders) and drop the player card, so the menu fits down to Save & Quit. The layout itself was
// measured in Chromium at 375x667 and 320x568 (portrait) and 667x375; this checks the rules that make it so.
// No browser: the injected stylesheet is read from a fake document. Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const injected = [];
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = {
  documentElement: { classList: { toggle() {}, add() {}, remove() {}, contains: () => false } },
  head: { appendChild: (el) => injected.push(el) },
  getElementById: () => null,
  createElement: () => ({}),
  addEventListener() {},
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const { injectSoundStyles } = await import('../../src/ui/soundControls.js');
injectSoundStyles();
const soundCss = injected.map((el) => el.textContent || '').join('\n');
const appCss = fs.readFileSync(new URL('../../src/ui/styles.js', import.meta.url), 'utf8');

/** The top-level rules and @media blocks of a stylesheet: [{media: '' | condition, body}]. */
function blocks(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < src.length && depth) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0, j++;
    const body = src.slice(open + 1, j - 1);
    out.push(head.startsWith('@media') ? { media: head.slice(6).trim(), body } : { media: '', body: head + '{' + body + '}' });
    i = j;
  }
  return out;
}
const squash = (s) => s.replace(/\s+/g, '');
const has = (list, media, rule) => list.some((b) => media(b.media) && squash(b.body).includes(squash(rule)));
const shortPortrait = (m) => /orientation:portrait/.test(m) && /max-height:\s*7\d\dpx/.test(m);

test('a vertical swipe over a pause-menu volume slider scrolls the menu', () => {
  const css = blocks(soundCss);
  assert.ok(has(css, (m) => m === '', '#ui .snd input[type=range]{touch-action:pan-y}'), 'sound sliders let vertical pans through');
});

test('short portrait phones: just the two sound switches side by side, and no player card', () => {
  const css = blocks(soundCss);
  assert.ok(has(css, shortPortrait, '.pause-btns .snd.compact{grid-template-columns:1fr 1fr}'), 'the switches sit side by side');
  assert.ok(has(css, shortPortrait, '.pause-btns .snd.compact .snd-sl{display:none}'), 'no sliders (they stay in Settings and the speaker pop-up)');
  assert.ok(!has(css, (m) => m === '', '.snd-sl{display:none}'), 'Settings and the pop-up keep their sliders');
  assert.ok(has(blocks(appCss.slice(appCss.indexOf('`') + 1)), shortPortrait, '.pause-me{display:none}'), 'the player card makes room (as on phones on their side)');
});
