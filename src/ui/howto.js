// "How to Play" guide (static, illustrated with the UI's own icons).
import { RARITIES, BIOMES, MUTATIONS, EVENTS, PLANTERS, LOCK } from '../config.js';
import { h } from './dom.js';
import { ICON, ITEM_ICONS, NOODLE, EVENT_ICON } from './icons.js';

const LOOP = [
  [ICON.sprout, 'Grab a seed', 'Run up the Seed Road. Further = rarer.'],
  [ICON.home, 'Run it home', 'Walk into your garden. It plants itself.'],
  [ICON.coin, 'Collect cash', 'Grown plants pay every second. Step on COLLECT.'],
  [ICON.bolt, 'Get faster', 'Train at the Speed Shop to reach rarer biomes.'],
  [ICON.eye, 'Steal!', "Hold E on a family member's grown plant, then run home."],
  [ICON.lock, 'Lock up', `Step on LOCK: nobody else gets in for ${LOCK.duration}s.`],
];

const CONTROLS = [
  [ICON.keyboard, 'Keyboard + mouse', [['WASD', 'Move'], ['Space', 'Jump'], ['E', 'Grab (hold to Steal / Sell)'], ['Click / F', 'Bonk with the noodle'], ['1-5', 'Use items'], ['Right-drag', 'Turn camera'], ['Wheel', 'Zoom'], ['Esc', 'Menu']]],
  [ICON.touch, 'Touch', [['Left thumb', 'Move (joystick)'], ['Right side drag', 'Turn camera'], ['Pinch', 'Zoom'], ['Action', 'Grab / hold to Steal'], ['Bonk', 'Swing the noodle'], ['Jump', 'Jump'], ['Hotbar', 'Tap to use items']]],
  [ICON.gamepad, 'Gamepad', [['Left stick', 'Move'], ['Right stick', 'Camera'], ['A', 'Jump'], ['B', 'Grab / hold to Steal'], ['X', 'Bonk'], ['Y', 'Use item'], ['LB / RB', 'Pick item'], ['Start', 'Menu']]],
];

const TIPS = [
  'Road monsters only chase players carrying something. Bonk monsters BEFORE you grab. You can\'t swing while carrying.',
  'Bonk a thief to make them drop your plant. It flies straight home.',
  'Banana peels and water balloons make runners drop what they carry.',
  `You start with ${PLANTERS.startUnlocked} planters. Walk up to a locked one to unlock more.`,
  'Garden full? Hold E on a grown plant to sell it for 90 seconds of income.',
  'Rebirth at the altar for a permanent income boost and a crown star.',
];

export function buildHowTo() {
  const sec = (title, icon, ...kids) => h('section', { class: 'ht-sec' }, h('h3', { html: `<span class="bi">${icon}</span>${title}` }), ...kids);
  const loop = h('ol', { class: 'ht-loop' }, LOOP.map(([ic, t, d], i) =>
    h('li', { style: `--d:${i * 60}ms` }, h('span', { class: 'hl-n', text: String(i + 1) }), h('span', { class: 'hl-ic', html: ic }), h('b', { text: t }), h('span', { text: d }))));
  const controls = h('div', { class: 'ht-controls' }, CONTROLS.map(([ic, name, rows]) =>
    h('div', { class: 'ht-ctl' }, h('h4', { html: `<span class="bi">${ic}</span>${name}` }),
      h('dl', {}, rows.map(([k, v]) => [h('dt', {}, h('kbd', { text: k })), h('dd', { text: v })])))));
  const biomeFor = (r) => (r.id === 'secret' ? 'Starbloom (super rare)' : BIOMES.find((b) => b.rarity === r.id)?.name || '');
  const rarities = h('div', { class: 'ht-chips' }, RARITIES.map((r) =>
    h('div', { class: 'ht-rar' }, h('span', { class: `rar rar-${r.id}`, text: r.name }), h('span', { class: 'ht-where', text: biomeFor(r) }))));
  const muts = h('div', { class: 'ht-chips' }, Object.values(MUTATIONS).filter((m) => m.name).map((m) =>
    h('div', { class: 'ht-rar' }, h('span', { class: `mut mut-${m.id}`, text: m.name }), h('span', { class: 'ht-where', text: `×${m.mult} cash` }))));
  const weather = h('div', { class: 'ht-weather' }, EVENTS.types.map((e) =>
    h('div', { class: `ht-ev ev-${e.id}` }, h('span', { class: 'bi', html: EVENT_ICON[e.id] }), h('b', { text: e.name }), h('span', { text: `${Math.round(e.chance * 100)}% of new seeds turn ${MUTATIONS[e.mutation].name}!` }))));
  const items = h('div', { class: 'ht-items' },
    h('div', { class: 'ht-item' }, h('span', { class: 'hi-ic', html: NOODLE }), h('span', {}, h('b', { text: 'Pool noodle' }), ' Bonk with empty hands. You can\'t swing while carrying.')),
    ...Object.entries(ITEM_ICONS).map(([id, ic]) => h('div', { class: 'ht-item' }, h('span', { class: 'hi-ic', html: ic }), h('span', { text: itemLine(id) }))));
  return h('div', { class: 'ht-body' },
    h('div', { class: 'mh' }, h('span', { class: 'mh-ic', html: ICON.help }), h('h2', { text: 'How to Play' })),
    sec('The loop', ICON.reset, loop),
    sec('Controls', ICON.gamepad, controls),
    sec('Rarities', ICON.star, h('p', { class: 'ht-p', text: 'Each biome up the Seed Road grows a rarer seed. Rarer = way more cash.' }), rarities),
    sec('Mutations', ICON.diamond, h('p', { class: 'ht-p', text: 'Some seeds spawn mutated and pay extra.' }), muts),
    sec('Weather', ICON.sun, h('p', { class: 'ht-p', text: 'Every few minutes the sky changes for 60 seconds.' }), weather),
    sec('Items', ICON.shop, items),
    sec('Tips', ICON.target, h('ul', { class: 'ht-tips' }, TIPS.map((t) => h('li', { text: t })))));
}

function itemLine(id) {
  return {
    banana: 'Banana Peel: drop it behind you. Whoever slips drops their loot.',
    balloon: 'Water Balloon: throw it! The splash stuns and drops loot.',
    coil: 'Speed Coil: +50% speed for 15 seconds.',
    cloak: 'Invisibility Cloak: monsters and family ignore you for 10 s.',
    bucket: 'Water Bucket: halves the growing time left on a nearby plant.',
  }[id];
}
