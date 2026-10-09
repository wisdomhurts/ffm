// The Gnome Map (Golden Gnome Hunt; the hunt itself: progress/gnomes.js), opened from the pause menu.
//   openGnomeMap(app)   modal: how many gnomes the active profile has found, the rewards, a little map of the
//                       island and the Seed Road with every gnome's spot (and you), and a card per gnome: gold
//                       once found, a dark silhouette with its riddle hint until then.
//   GNOME_ICON          the gnome glyph (progress/art.js) for buttons
import { h } from './dom.js';
import { BIOMES, WORLD, ROAD_END_Z } from '../config.js';
import { GNOMES, LAYOUT } from '../gameplay/layout.js';
import { gnomesFound, gnomeZone } from '../progress/gnomes.js';
import { glyphSvg } from '../progress/art.js';
import { BADGE_BY_ID } from '../progress/catalog.js';

export const GNOME_ICON = glyphSvg('gnome');
const STAR = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z" fill="#ffd23f" stroke="#10163a" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const CSS = `
.modal-panel.gm-modal{width:min(760px,100%)}
.gm-modal .sh-ic{background:linear-gradient(180deg,#fff3a0,#ffb627);padding:6px}
.gm-count{display:flex;align-items:center;gap:10px;margin:12px 0 4px}
.gm-count b{font:var(--fdw) 26px/1 var(--fd);color:var(--gold);text-shadow:var(--o1);white-space:nowrap}
.gm-bar{position:relative;flex:1;height:16px;border-radius:999px;background:rgba(10,15,40,.55);border:2.5px solid var(--ink);overflow:hidden}
.gm-bar i{position:absolute;inset:0 auto 0 0;border-radius:999px;background:linear-gradient(180deg,#fff3a0,#ffc21f 55%,#e09a00);box-shadow:inset 0 2px 0 rgba(255,255,255,.6)}
.gm-tip{margin:4px 0 10px;font:800 13.5px/1.3 var(--fb);color:var(--txt2)}
.gm-rewards{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.gm-rw{display:inline-flex;align-items:center;gap:6px;padding:5px 11px 6px 6px;border-radius:999px;background:rgba(10,15,40,.45);border:2px solid rgba(255,255,255,.14);font:800 13px/1.1 var(--fb);color:var(--txt2)}
.gm-rw .gm-rw-n{display:grid;place-items:center;min-width:26px;height:26px;padding:0 6px;border-radius:999px;background:#2b387a;border:2px solid var(--ink);font:var(--fdw) 14px/1 var(--fd);color:#fff}
.gm-rw .gm-st{display:inline-flex;align-items:center;gap:2px;color:var(--gold)}
.gm-rw .gm-st i{display:block;width:15px;height:15px}
.gm-rw.on{background:linear-gradient(180deg,rgba(255,210,63,.32),rgba(255,166,0,.22));border-color:#ffd23f;color:#fff}
.gm-rw.on .gm-rw-n{background:#ffc21f;color:var(--ink)}
.gm-map{display:block;width:100%;height:auto;margin:0 0 12px;border-radius:16px;border:3px solid var(--ink);background:#2a8fd0;box-shadow:inset 0 2px 0 rgba(255,255,255,.2)}
.gm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:9px}
.gm-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:9px 9px 11px;border-radius:16px;background:rgba(10,15,40,.42);border:3px solid var(--ink);text-align:center;
  box-shadow:inset 0 2px 0 rgba(255,255,255,.07);animation:fadeIn .35s both;animation-delay:var(--d,0ms)}
.gm-card.found{background:linear-gradient(180deg,rgba(255,226,122,.3),rgba(255,166,0,.16));border-color:#c98a00}
.gm-pic{position:relative;width:54px;height:54px}
.gm-pic svg{width:100%;height:100%}
.gm-card:not(.found) .gm-pic svg{filter:brightness(0);opacity:.55}
.gm-card:not(.found) .gm-pic::after{content:'?';position:absolute;inset:0;display:grid;place-items:center;padding-top:10px;font:var(--fdw) 26px/1 var(--fd);color:#fff;text-shadow:var(--o1)}
.gm-name{font:var(--fdw) 17px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.gm-zone{font:900 10.5px/1 var(--fb);letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:var(--zc,#556);color:var(--zt,#10163a);border:2px solid var(--ink)}
.gm-hint{font:800 12.5px/1.3 var(--fb);color:var(--txt2)}
.gm-card.found .gm-hint{color:#fff3c4}
.gm-got{position:absolute;top:-8px;right:-6px;padding:3px 8px;border-radius:999px;background:var(--cash);color:var(--ink);border:2px solid var(--ink);font:900 11px/1 var(--fb);transform:rotate(6deg)}
@media (max-width:430px){.gm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gm-count b{font-size:21px}}
`;
let styled = false;
function injectStyles() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  document.head.appendChild(h('style', { id: 'sas-gnomes', text: CSS }));
}

// ------------------------------------------------------------------ the map (SVG)
// North (up the road) points right; facing up the road, your left (+x) is up on the map.

const MAP = { w: 1000, h: 220, cy: 110 };
const RX0 = 150, RX1 = 988; // the road's span on the map
const ISL = (x, z) => [14 + (z - WORLD.homeMinZ), MAP.cy - x]; // the island at 1 px per stud
const ROAD = (x, z) => [RX0 + ((z - WORLD.road.startZ) / (ROAD_END_Z - WORLD.road.startZ)) * (RX1 - RX0), MAP.cy - x * 1.5];
const toMap = (x, z) => (z < WORLD.road.startZ ? ISL(x, z) : ROAD(x, z));

function mapSvg(found, me) {
  const f = (n) => n.toFixed(1);
  let s = `<svg class="gm-map" viewBox="0 0 ${MAP.w} ${MAP.h}" role="img" aria-label="Map of the island and the Seed Road">`;
  s += '<defs><linearGradient id="gmGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".55" stop-color="#ffc21f"/><stop offset="1" stop-color="#d98a00"/></linearGradient></defs>';
  // the island: sand rim, grass, the four gardens, the fountain and the shop row
  const [ix0, iy0] = ISL(WORLD.homeHalfW, WORLD.homeMinZ);
  const [ix1, iy1] = ISL(-WORLD.homeHalfW, WORLD.road.startZ);
  s += `<rect x="${f(ix0 - 7)}" y="${f(iy0 - 7)}" width="${f(ix1 - ix0 + 14)}" height="${f(iy1 - iy0 + 14)}" rx="18" fill="#f4dea6"/>`;
  s += `<rect x="${f(ix0)}" y="${f(iy0)}" width="${f(ix1 - ix0)}" height="${f(iy1 - iy0)}" rx="10" fill="#5ec24a" stroke="#10163a" stroke-width="3"/>`;
  for (const g of LAYOUT.gardens) {
    const b = g.bounds;
    const [a, c] = ISL(b.maxX, b.minZ);
    const [d, e] = ISL(b.minX, b.maxZ);
    s += `<rect x="${f(a)}" y="${f(c)}" width="${f(d - a)}" height="${f(e - c)}" rx="4" fill="#8a5a34" stroke="#10163a" stroke-width="2"/>`;
  }
  const [px0, py0] = ISL(10, WORLD.homeMinZ + 10);
  const [px1] = ISL(-10, WORLD.road.startZ);
  s += `<rect x="${f(px0)}" y="${f(py0)}" width="${f(px1 - px0)}" height="20" rx="4" fill="#f4dea6" opacity=".9"/>`;
  const [shx, shy] = ISL(44, WORLD.homeMinZ);
  s += `<rect x="${f(shx)}" y="${f(shy)}" width="12" height="88" rx="3" fill="#ff8a3a" stroke="#10163a" stroke-width="2"/>`;
  // the Seed Road: one band per biome in its colour
  BIOMES.forEach((b, i) => {
    const R = LAYOUT.biomeRanges[i];
    const [x0, y0] = ROAD(WORLD.road.width / 2, R.minZ);
    const [x1, y1] = ROAD(-WORLD.road.width / 2, R.maxZ);
    s += `<rect x="${f(x0)}" y="${f(y0)}" width="${f(x1 - x0 + 0.6)}" height="${f(y1 - y0)}" fill="${b.ground}"/>`;
    s += `<text x="${f((x0 + x1) / 2)}" y="${f(y1 + 22)}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="13" fill="#ffffff" stroke="#10163a" stroke-width="3" paint-order="stroke">${i + 1}</text>`;
  });
  const [rx0, ry0] = ROAD(WORLD.road.width / 2, WORLD.road.startZ);
  const [rx1, ry1] = ROAD(-WORLD.road.width / 2, ROAD_END_Z);
  s += `<rect x="${f(rx0)}" y="${f(ry0)}" width="${f(rx1 - rx0)}" height="${f(ry1 - ry0)}" fill="none" stroke="#10163a" stroke-width="3" rx="4"/>`;
  // the gnomes
  for (const g of GNOMES) {
    const [x, y] = toMap(g.x, g.z);
    if (found.has(g.id)) s += `<circle cx="${f(x)}" cy="${f(y)}" r="8.5" fill="url(#gmGold)" stroke="#10163a" stroke-width="2.5"/><path d="M${f(x - 3.6)} ${f(y + 0.3)}l2.4 2.6 5-5.4" fill="none" stroke="#10163a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    else s += `<circle cx="${f(x)}" cy="${f(y)}" r="8.5" fill="#1f2550" stroke="#ffd23f" stroke-width="2.5"/><text x="${f(x)}" y="${f(y + 4.6)}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="13" fill="#ffd23f">?</text>`;
  }
  // you are here
  if (me) {
    const [x, y] = toMap(me.pos.x, Math.min(ROAD_END_Z, me.pos.z));
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="${me.char?.color || '#ff4f9a'}" stroke="#ffffff" stroke-width="3"/>`;
    s += `<text x="${f(x)}" y="${f(Math.max(16, y - 13))}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="13" fill="#ffffff" stroke="#10163a" stroke-width="3.5" paint-order="stroke">YOU</text>`;
  }
  return s + '</svg>';
}

// ------------------------------------------------------------------ the modal

export function openGnomeMap(app) {
  const p = app.profile;
  if (!p || !app.menus?.openModal) return null;
  injectStyles();
  const found = new Set((p.gnomes || []).filter((id) => GNOMES.some((g) => g.id === id)));
  const n = gnomesFound(p);
  const total = GNOMES.length;
  const reward = (id, extra) => {
    const b = BADGE_BY_ID[id];
    if (!b) return null;
    const on = !!p.badges?.[id];
    return h('span', { class: 'gm-rw' + (on ? ' on' : ''), title: b.how },
      h('span', { class: 'gm-rw-n', text: b.goal === total ? 'All' : String(b.goal) }),
      extra ? h('span', { text: extra }) : null,
      h('span', { class: 'gm-st' }, h('i', { html: STAR }), '+' + b.stars));
  };
  const cards = GNOMES.map((g, i) => {
    const got = found.has(g.id);
    const zc = g.biome < 0 ? '#5ec24a' : BIOMES[g.biome]?.ground || '#7bd35a';
    const n = parseInt(zc.slice(1), 16);
    const zt = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 120 ? '#ffffff' : '#10163a'; // readable on dark zones
    return h('div', { class: 'gm-card' + (got ? ' found' : ''), style: `--d:${Math.min(i, 12) * 30}ms` },
      got ? h('span', { class: 'gm-got', text: 'Found!' }) : null,
      h('span', { class: 'gm-pic', html: GNOME_ICON }),
      h('span', { class: 'gm-name', text: got ? g.name : '???' }),
      h('span', { class: 'gm-zone', style: `--zc:${zc};--zt:${zt}`, text: gnomeZone(g) }),
      h('span', { class: 'gm-hint', text: g.hint }));
  });
  const el = h('div', { class: 'gm-body' },
    h('div', { class: 'shop-head' },
      h('span', { class: 'sh-ic', html: GNOME_ICON }),
      h('div', { class: 'sh-titles' }, h('h2', { text: 'Gnome Map' }), h('span', { class: 'sh-sub', text: 'Tiny golden gnomes are hiding everywhere!' }))),
    h('div', { class: 'gm-count' }, h('b', { text: `${n} / ${total} found` }), h('span', { class: 'gm-bar' }, h('i', { style: `width:${((n / total) * 100).toFixed(1)}%` }))),
    h('p', { class: 'gm-tip', text: n >= total ? 'You found every gnome. Gnome Hunter champion!' : 'Listen for giggles: a gnome giggles when you are close. Walk right up to it to catch it!' }),
    h('div', { class: 'gm-rewards' }, reward('gnomes1'), reward('gnomes2', 'Gnome Hat'), reward('gnomes3', 'Golden Gnome Noodle')),
    h('div', { html: mapSvg(found, app.state === 'title' ? null : app.human) }),
    h('div', { class: 'gm-grid' }, cards));
  let modal = null;
  el.appendChild(app.menus.doneRow(() => modal?.close()));
  modal = app.menus.openModal(el, { cls: 'gm-modal', label: 'Gnome Map' });
  return modal;
}

