// Hand-drawn SVG glyphs for quests and badges, and the medal they sit on. No emoji, no external assets.
// Glyphs are 24x24 "sticker" art (ink outline, flat colours); a few reuse ui/icons.js and are tinted via `color`.
import { ICON, ITEM_ICONS, NOODLE } from '../ui/icons.js';

const INK = '#10163a';
const S = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
const svg = (body) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

function starPath(cx, cy, R, r, n = 5, rot = -Math.PI / 2) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2);
  }
  return d + 'Z';
}

const CUSTOM = {
  seed: svg(`<path d="M12 4.2 C 16.8 8.4, 18.4 13, 16.6 16.9 C 15.1 20.2, 8.9 20.2, 7.4 16.9 C 5.6 13, 7.2 8.4, 12 4.2 Z" fill="#d18f4f" ${S}/>
    <path d="M10.1 9.2 C 9.1 11, 8.8 13, 9.3 14.8" fill="none" stroke="#f6cf9b" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M12 4.4 C 12 2.4, 13.8 1.3, 16.4 1.5 C 16.2 3.8, 14.4 4.9, 12 4.7 Z" fill="#4fcf62" ${S}/>`),
  sprout: svg(`<path d="M12 21.5 V12" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M12 21.5 V12" fill="none" stroke="#2e9c46" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 12.5 C 12 7.5, 15 4.5, 21 4.5 C 21 9.5, 17.5 12.5, 12 12.5 Z" fill="#6fe07a" ${S}/>
    <path d="M12 14.5 C 12 10.5, 9.4 8, 3.5 8 C 3.5 12.2, 6.5 14.5, 12 14.5 Z" fill="#4fcf62" ${S}/>`),
  wave: svg(`<path d="M7.2 13.4 V7 a1.45 1.45 0 0 1 2.9 0 V11.2 V5.2 a1.45 1.45 0 0 1 2.9 0 V11.2 V6 a1.45 1.45 0 0 1 2.9 0 V12 V8.6 a1.45 1.45 0 0 1 2.9 0 V14.6 C 18.8 18.8, 16 21.6, 12.2 21.6 C 9.6 21.6, 7.9 20.4, 6.6 18.2 L 3.9 14 a1.55 1.55 0 0 1 2.6 -1.7 Z" fill="#ffcf9f" ${S}/>
    <path d="M19.6 2.6 C 21.2 3.6, 22 5, 22 6.8 M2.6 4.6 C 1.8 5.8, 1.6 7, 1.9 8.4" fill="none" ${S}/>`),
  dance: svg(`<path d="M9 18.4 V6.2 L19 3.6 V15.8" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M9 9.4 L19 6.8" stroke="${INK}" stroke-width="2.4"/>
    <ellipse cx="6.6" cy="18.4" rx="3.1" ry="2.5" fill="#ff5fa2" ${S}/><ellipse cx="16.6" cy="15.8" rx="3.1" ry="2.5" fill="#ff5fa2" ${S}/>`),
  chat: svg(`<path d="M4 4.5 H20 a2 2 0 0 1 2 2 V15 a2 2 0 0 1 -2 2 H11.5 L6.8 20.8 V17 H4 a2 2 0 0 1 -2 -2 V6.5 a2 2 0 0 1 2 -2 Z" fill="#fff" ${S}/>
    <circle cx="7.6" cy="10.8" r="1.45" fill="${INK}"/><circle cx="12" cy="10.8" r="1.45" fill="${INK}"/><circle cx="16.4" cy="10.8" r="1.45" fill="${INK}"/>`),
  monster: svg(`<path d="M4.8 21 V9.6 C 4.8 6.2, 8 4.6, 12 4.6 C 16 4.6, 19.2 6.2, 19.2 9.6 V21 Z" fill="#a0673b" ${S}/>
    <ellipse cx="12" cy="7.4" rx="5.8" ry="2.2" fill="#e8bb84" ${S}/><ellipse cx="12" cy="7.4" rx="2.4" ry=".9" fill="none" stroke="#b07a45" stroke-width="1"/>
    <path d="M7.6 11.2 L10.6 12.6 M16.4 11.2 L13.4 12.6" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="9.3" cy="14" r="1.2" fill="${INK}"/><circle cx="14.7" cy="14" r="1.2" fill="${INK}"/>
    <path d="M9.4 18.2 C 11 16.8, 13 16.8, 14.6 18.2" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`),
  compass: svg(`<circle cx="12" cy="12" r="10" fill="#fff" ${S}/><circle cx="12" cy="12" r="7.6" fill="#e3f1ff" stroke="#9fb6d8" stroke-width="1"/>
    <g transform="rotate(35 12 12)"><path d="M12 4.6 L14.4 12 H9.6 Z" fill="#ff4d6d" ${S}/><path d="M12 19.4 L14.4 12 H9.6 Z" fill="#3d4a94" ${S}/></g>
    <circle cx="12" cy="12" r="1.3" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`),
  mask: svg(`<path d="M2.4 10.2 C 5 7.2, 9 7.6, 12 9.1 C 15 7.6, 19 7.2, 21.6 10.2 C 21.1 14.2, 18.2 15.7, 15.6 15.2 C 14 14.9, 13 13.6, 12 13.6 C 11 13.6, 10 14.9, 8.4 15.2 C 5.8 15.7, 2.9 14.2, 2.4 10.2 Z" fill="#2b2f55" ${S}/>
    <ellipse cx="7.6" cy="11.3" rx="2.3" ry="1.6" fill="#fff"/><ellipse cx="16.4" cy="11.3" rx="2.3" ry="1.6" fill="#fff"/>
    <circle cx="8.1" cy="11.4" r=".9" fill="${INK}"/><circle cx="16.9" cy="11.4" r=".9" fill="${INK}"/>
    <path d="M3 10.6 L0.9 8.6 M3 11.3 L0.8 12.8" fill="none" ${S}/>`),
  shield: svg(`<path d="M12 2.4 L20.2 5.4 V11 C 20.2 16.2, 16.6 19.7, 12 21.6 C 7.4 19.7, 3.8 16.2, 3.8 11 V5.4 Z" fill="#3d9bff" ${S}/>
    <path d="M12 5 L17.6 7.2 V11 C 17.6 14.6, 15.3 17.3, 12 18.9 Z" fill="#8fd0ff"/>
    <path d="M8.2 11.8 L10.9 14.4 L16 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  egg: svg(`<path d="M12 2.4 C 16.6 2.4, 19.6 9, 19.6 13.6 C 19.6 18.1, 16.1 21.6, 12 21.6 C 7.9 21.6, 4.4 18.1, 4.4 13.6 C 4.4 9, 7.4 2.4, 12 2.4 Z" fill="#fff4d6" ${S}/>
    <circle cx="9.4" cy="10" r="1.7" fill="#ffb627"/><circle cx="14.6" cy="14.2" r="2.1" fill="#4cd964"/><circle cx="9.8" cy="17" r="1.3" fill="#3d9bff"/>
    <path d="${starPath(18.6, 4.6, 3.6, 1.3, 4, 0)}" fill="#ffd23f" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`),
  moneybag: svg(`<path d="M8.8 5.6 L7.4 2.4 H16.6 L15.2 5.6 Z" fill="#c9985c" ${S}/>
    <path d="M8.8 5.6 C 4.8 8.2, 3.4 12, 3.4 15 C 3.4 19.1, 7 21.6, 12 21.6 C 17 21.6, 20.6 19.1, 20.6 15 C 20.6 12, 19.2 8.2, 15.2 5.6 Z" fill="#e7b774" ${S}/>
    <path d="M14.2 11 C 13.7 10.1, 13 9.8, 12 9.8 C 10.8 9.8, 10 10.5, 10 11.4 C 10 13.6, 14.3 12.7, 14.3 15 C 14.3 16, 13.3 16.7, 12 16.7 C 11 16.7, 10.2 16.2, 9.8 15.4 M12 8.3 V18.2" fill="none" stroke="#1d7a33" stroke-width="1.7" stroke-linecap="round"/>`),
  keyhole: svg(`<circle cx="12" cy="12" r="10" fill="#1b1446" ${S}/><circle cx="12" cy="12" r="7.8" fill="none" stroke="#ff66d9" stroke-width="1.2" stroke-dasharray="2 2"/>
    <path d="M12 6.2 a2.9 2.9 0 0 1 1.6 5.3 L14.6 17.2 H9.4 L10.4 11.5 A2.9 2.9 0 0 1 12 6.2 Z" fill="#ffd23f" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`),
  planter: svg(`<path d="M12 10.5 V6.5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M12 10.5 V6.5" stroke="#2e9c46" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M12 7.4 C 12 4.8, 14 3.2, 17.2 3.2 C 17.2 5.8, 15.2 7.4, 12 7.4 Z" fill="#6fe07a" ${S}/><path d="M12 8.4 C 12 6.3, 10.4 5, 7.6 5 C 7.6 7.1, 9.2 8.4, 12 8.4 Z" fill="#4fcf62" ${S}/>
    <path d="M5.2 13 H18.8 L17.3 21.4 H6.7 Z" fill="#e07a3f" ${S}/><rect x="4" y="10.4" width="16" height="3.6" rx="1.2" fill="#f39a5d" ${S}/>`),
  fire: svg(`<path d="${starPath(12, 12, 11, 5.6, 8, -Math.PI / 2)}" fill="#ff4d6d" ${S}/><path d="${starPath(12, 12, 6.6, 3.4, 8, -Math.PI / 2 + Math.PI / 8)}" fill="#ffd23f" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`),
  flame: svg(`<path d="M12 2.4 C 13 6, 18.6 8.6, 18.6 14.6 C 18.6 18.6, 15.6 21.6, 12 21.6 C 8.4 21.6, 5.4 18.6, 5.4 14.6 C 5.4 11, 7.9 9.6, 8.5 7 C 10 8.6, 10.5 10, 10.5 11.1 C 11.5 8.6, 12 6, 12 2.4 Z" fill="#ff7a1f" ${S}/>
    <path d="M12 11 C 13 13.1, 15.5 14.1, 15.5 16.9 C 15.5 18.9, 14 20.1, 12 20.1 C 10 20.1, 8.5 18.9, 8.5 16.9 C 8.5 15.1, 10 14.1, 10.5 12.6 C 11 13.3, 11.3 13.9, 11.3 14.4 C 11.8 13.3, 12 12.3, 12 11 Z" fill="#ffd23f"/>`),
  butterfly: svg(`<path d="M11.4 11.6 C 8.4 3.6, 2.6 3.4, 2.6 7.4 C 2.6 10.6, 6.6 11.8, 11.4 11.6 Z" fill="#ff7cbc" ${S}/><path d="M12.6 11.6 C 15.6 3.6, 21.4 3.4, 21.4 7.4 C 21.4 10.6, 17.4 11.8, 12.6 11.6 Z" fill="#ff7cbc" ${S}/>
    <path d="M11.4 12.4 C 7 12.4, 4.4 14.2, 4.9 17 C 5.4 19.6, 9 19.4, 11.4 14.8 Z" fill="#b36bff" ${S}/><path d="M12.6 12.4 C 17 12.4, 19.6 14.2, 19.1 17 C 18.6 19.6, 15 19.4, 12.6 14.8 Z" fill="#b36bff" ${S}/>
    <path d="M12 7.4 V18.6" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M12 7.6 L10.2 3.8 M12 7.6 L13.8 3.8" fill="none" ${S}/>`),
  gift: svg(`<rect x="3.6" y="10.2" width="16.8" height="11" rx="1.6" fill="#ff4f9a" ${S}/><rect x="2.4" y="7" width="19.2" height="4.2" rx="1.3" fill="#ff86c0" ${S}/>
    <path d="M12 7.4 V20.8" stroke="#ffd23f" stroke-width="3.2"/>
    <path d="M12 7.2 C 10 3, 5.8 3.6, 6.8 6.2 C 7.3 7.2, 10 7.2, 12 7.2 C 14 7.2, 16.7 7.2, 17.2 6.2 C 18.2 3.6, 14 3, 12 7.2 Z" fill="#ffd23f" ${S}/>`),
  handshake: svg(`<path d="M3.5 8.4 H16.8 M13.4 4.8 L17 8.4 L13.4 12" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3.5 8.4 H16.8 M13.4 4.8 L17 8.4 L13.4 12" fill="none" stroke="#3fd65a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20.5 15.6 H7.2 M10.6 12 L7 15.6 L10.6 19.2" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20.5 15.6 H7.2 M10.6 12 L7 15.6 L10.6 19.2" fill="none" stroke="#5cb8ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  paw: svg(`<path d="M12 11.2 C 15.6 11.2, 18.2 14.4, 18.2 17.2 C 18.2 19.8, 15.6 20.8, 12 19.6 C 8.4 20.8, 5.8 19.8, 5.8 17.2 C 5.8 14.4, 8.4 11.2, 12 11.2 Z" fill="#c98a4b" ${S}/>
    <ellipse cx="4.8" cy="10.4" rx="1.9" ry="2.5" fill="#c98a4b" ${S}/><ellipse cx="9" cy="6.2" rx="2" ry="2.7" fill="#c98a4b" ${S}/>
    <ellipse cx="15" cy="6.2" rx="2" ry="2.7" fill="#c98a4b" ${S}/><ellipse cx="19.2" cy="10.4" rx="1.9" ry="2.5" fill="#c98a4b" ${S}/>
    <ellipse cx="12" cy="15.8" rx="2.4" ry="1.6" fill="#f2c08a"/>`),
  hat: svg(`<rect x="6.8" y="3.4" width="10.4" height="12" rx="1.3" fill="#2b2f55" ${S}/><rect x="6.8" y="11.2" width="10.4" height="2.8" fill="#ff4f9a" stroke="${INK}" stroke-width="1.2"/>
    <rect x="2.6" y="15.2" width="18.8" height="3.6" rx="1.8" fill="#2b2f55" ${S}/><path d="M9 5.6 V9.4" stroke="#5a64a8" stroke-width="1.6" stroke-linecap="round"/>`),
  scroll: svg(`<path d="M6.2 3.6 H17.4 a2.4 2.4 0 0 1 0 4.8 H17 V18.4 a2.6 2.6 0 0 1 -2.6 2.6 H5.4 a2.4 2.4 0 0 1 0 -4.8 H6.2 Z" fill="#fff1c9" ${S}/>
    <path d="M8.8 12.2 L10.9 14.4 L14.9 9.8" fill="none" stroke="#1fb043" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  chest: svg(`<path d="M3 11.2 C 3 6.4, 6 4.2, 12 4.2 C 18 4.2, 21 6.4, 21 11.2 Z" fill="#d38636" ${S}/><rect x="3" y="11.2" width="18" height="9.6" rx="1.3" fill="#a85f22" ${S}/>
    <path d="M7.2 4.9 V20.6 M16.8 4.9 V20.6" stroke="#ffd23f" stroke-width="2.2"/><rect x="10" y="9.4" width="4" height="4.8" rx="1" fill="#ffd23f" ${S}/>`),
  trophy: svg(`<path d="M7 5.8 H3.8 V7.4 C 3.8 9.5, 5.4 11, 7.4 11 M17 5.8 H20.2 V7.4 C 20.2 9.5, 18.6 11, 16.6 11" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M7 3.4 H17 V9 C 17 12, 14.8 14.2, 12 14.2 C 9.2 14.2, 7 12, 7 9 Z" fill="#ffd23f" ${S}/><path d="M9.4 5.4 V9" stroke="#fff6b0" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M10.5 14.2 H13.5 V17.6 H10.5 Z" fill="#f0a000" ${S}/><rect x="7" y="17.6" width="10" height="3.6" rx="1.1" fill="#8a5a2b" ${S}/>`),
  sparkle: svg(`<path d="${starPath(12, 12, 10.5, 3.2, 4, 0)}" fill="#fff" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`),
};

// glyph key -> [svg, tint colour for currentColor icons]
const REUSE = {
  coin: [ICON.coin],
  noodle: [NOODLE],
  balloon: [ITEM_ICONS.balloon],
  banana: [ITEM_ICONS.banana],
  bucket: [ITEM_ICONS.bucket],
  coil: [ITEM_ICONS.coil],
  lock: [ICON.lock, '#ffd23f'],
  family: [ICON.family, '#ffffff'],
  diamond: [ICON.diamond],
  bolt: [ICON.bolt, '#ffd23f'],
  rainbow: [ICON.rainbow],
  crown: [ICON.crown, '#ffd23f'],
  star: [ICON.star, '#ffd23f'],
  timer: [ICON.timer, '#c9d3ff'],
  check: [ICON.check, '#ffffff'],
  close: [ICON.close, '#ffffff'],
};

/** A glyph as HTML: <span class="pg-g">svg</span>. */
export function glyph(key, cls = '') {
  const r = REUSE[key];
  const body = r ? r[0] : CUSTOM[key] || CUSTOM.sparkle;
  const tint = r?.[1];
  return `<span class="pg-g ${cls}"${tint ? ` style="color:${tint}"` : ''}>${body || ''}</span>`;
}

/** Just the SVG string of a glyph, and the colour to tint it with (currentColor icons), or ''. */
export const glyphSvg = (key) => REUSE[key]?.[0] || CUSTOM[key] || CUSTOM.sparkle;
export const glyphTint = (key) => REUSE[key]?.[1] || '';

// Medal metals by tier; single-tier badges are gold, two tiers go silver -> gold, three bronze -> silver -> gold.
const METALS = {
  bronze: { rim: '#b8662f', face: '#f0a86a', light: '#ffd9b3', ribbon: '#3d9bff' },
  silver: { rim: '#7f8cab', face: '#dde6f5', light: '#ffffff', ribbon: '#b36bff' },
  gold: { rim: '#d98a00', face: '#ffd23f', light: '#fff6b8', ribbon: '#ff4d6d' },
  locked: { rim: '#2c3363', face: '#1f2550', light: 'rgba(255,255,255,.12)', ribbon: '#2a3060' },
};

export function metalFor(tier, tiers) {
  const order = tiers >= 3 ? ['bronze', 'silver', 'gold'] : tiers === 2 ? ['silver', 'gold'] : ['gold'];
  return order[Math.max(0, Math.min(order.length - 1, tier))];
}

const ROSETTE = starPath(32, 28, 26, 23.2, 18, -Math.PI / 2);

/** The medal base (ribbons, rosette, face) as an SVG string; the glyph goes on top via CSS. */
export function medalSvg(metal = 'gold') {
  const m = METALS[metal] || METALS.gold;
  return `<svg class="pg-medal-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M22 40 L14 60 L21.5 56.5 L26.5 62.5 L32 45 Z" fill="${m.ribbon}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M42 40 L50 60 L42.5 56.5 L37.5 62.5 L32 45 Z" fill="${m.ribbon}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="${ROSETTE}" fill="${m.rim}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="32" cy="28" r="18.6" fill="${m.face}" stroke="${m.rim}" stroke-width="2"/>
    <path d="M18.6 24.5 A 14.5 14.5 0 0 1 29.5 13.8" fill="none" stroke="${m.light}" stroke-width="3" stroke-linecap="round" opacity=".9"/>
  </svg>`;
}

/** Medal + glyph as HTML. */
export function medal(icon, metal = 'gold', cls = '') {
  return `<span class="pg-medal m-${metal} ${cls}">${medalSvg(metal)}${glyph(icon)}</span>`;
}

export const TIER_COLOR = { easy: '#2fbf4a', medium: '#2a7fe6', hard: '#8a45e0' };
