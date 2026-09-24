// Hand-drawn SVG icons (no emoji, no external assets). Item icons are full-colour "sticker" art;
// UI glyphs use currentColor so buttons can tint them.
const INK = '#10163a';
const O = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;

function starPath(cx, cy, R, r, n = 5, rot = -Math.PI / 2) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2);
  }
  return d + 'Z';
}

function gearPath(cx, cy, R, r, teeth = 8) {
  let d = '';
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [[a - step * 0.28, r], [a - step * 0.16, R], [a + step * 0.16, R], [a + step * 0.28, r]];
    for (const [ang, rad] of pts) d += (d ? 'L' : 'M') + (cx + Math.cos(ang) * rad).toFixed(2) + ' ' + (cy + Math.sin(ang) * rad).toFixed(2);
  }
  return d + 'Z';
}

const svg = (vb, body, cls = '') => `<svg class="ico ${cls}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const ui = (body, extra = '') => svg('0 0 24 24', `<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</g>`);

export const ITEM_ICONS = {
  banana: svg('0 0 64 64', `<g ${O}>
    <path d="M27 42 C 24 31, 25 20, 30 11 C 32 8, 37 9, 37 13 C 39 22, 40 32, 38 42 Z" fill="#fff6cf"/>
    <path d="M30.5 11 L 29.5 5 L 35 5 L 35.5 10.5" fill="#7a5320"/>
    <path d="M34 41 C 36 31, 43 25, 50 22 C 48 31, 44 39, 39 45 Z" fill="#e8b400"/>
    <path d="M30 41 C 21 38, 11 44, 6 55 C 17 56, 26 51, 33 46 Z" fill="#ffd93b"/>
    <path d="M35 41 C 44 41, 53 47, 58 57 C 47 58, 38 53, 32 47 Z" fill="#ffd93b"/>
    <path d="M28 43 C 26 49, 26 55, 29 61 C 34 59, 38 53, 38 44 Z" fill="#ffe46e"/></g>`, 'item'),
  balloon: svg('0 0 64 64', `<g ${O}>
    <path d="M32 14 C 17 14, 9 28, 11 40 C 13 52, 23 59, 32 59 C 41 59, 51 52, 53 40 C 55 28, 47 14, 32 14 Z" fill="#43b8ff"/>
    <path d="M26 5 L 38 5 L 32 14 Z" fill="#1f86d1"/></g>
    <path d="M19 33 C 19 26, 23 21, 29 19.5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" opacity=".9"/>
    <circle cx="19.5" cy="40" r="2.6" fill="#fff" opacity=".85"/>
    <path d="M42 48 C 45 46, 47 43, 48 39" fill="none" stroke="#1f86d1" stroke-width="3" stroke-linecap="round"/>`, 'item'),
  coil: svg('0 0 64 64', `
    <path d="M6 22 L 14 22 M4 32 L 12 32 M6 42 L 14 42" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" opacity=".55"/>
    <path d="M22 50 L 50 44 L 22 38 L 50 32 L 22 26 L 50 20 L 22 14" fill="none" stroke="${INK}" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M22 50 L 50 44 L 22 38 L 50 32 L 22 26 L 50 20 L 22 14" fill="none" stroke="#ff4d6d" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M24 49 L 34 47 M24 37 L 34 35 M24 25 L 34 23" stroke="#ffb3c1" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="15" y="50" width="42" height="9" rx="4" fill="#ffd23f" ${O}/>`, 'item'),
  cloak: svg('0 0 64 64', `<g ${O}>
    <path d="M32 6 C 19 6, 13 17, 13 29 C 13 40, 9 50, 6 59 L 58 59 C 55 50, 51 40, 51 29 C 51 17, 45 6, 32 6 Z" fill="#8a5cff"/>
    <path d="M32 15 C 24 15, 21 22, 21 29 C 21 37, 26 42, 32 42 C 38 42, 43 37, 43 29 C 43 22, 40 15, 32 15 Z" fill="#1d1540"/>
    <path d="M32 44 L 32 58" fill="none" stroke-width="3"/></g>
    <ellipse cx="27.5" cy="30" rx="2.6" ry="3.4" fill="#aef3ff"/><ellipse cx="36.5" cy="30" rx="2.6" ry="3.4" fill="#aef3ff"/>
    <path d="M18 24 C 19 18, 23 13, 28 11" fill="none" stroke="#c9b2ff" stroke-width="3" stroke-linecap="round"/>
    <path d="${starPath(53, 12, 7, 2.4, 4, 0)}" fill="#fff" stroke="${INK}" stroke-width="2"/>`, 'item'),
  bucket: svg('0 0 64 64', `<g ${O}>
    <path d="M13 27 C 13 8, 51 8, 51 27" fill="none"/>
    <path d="M12 27 L 17 56 C 22 60, 42 60, 47 56 L 52 27 Z" fill="#a9bfe3"/>
    <ellipse cx="32" cy="27" rx="20" ry="6.5" fill="#43b8ff"/>
    <path d="M15 42 C 25 45, 39 45, 49 42" fill="none"/>
    <path d="M52 3 C 48 9, 47 12, 49.5 14.5 C 52 16.5, 56 14.5, 55.5 11.5 C 55 9, 54 6.5, 52 3 Z" fill="#43b8ff" stroke-width="2.6"/></g>
    <path d="M19 31 L 22 50" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`, 'item'),
};

export const NOODLE = svg('0 0 64 64', `<g transform="rotate(-38 32 32)">
  <rect x="4" y="23" width="56" height="18" rx="9" fill="#ff5fa2" ${O}/>
  <path d="M16 23.5 L 16 40.5 M28 23.5 L 28 40.5 M40 23.5 L 40 40.5" stroke="#ff9cc9" stroke-width="3"/>
  <ellipse cx="54" cy="32" rx="4.5" ry="9" fill="#ffa5cd" ${O}/>
  <circle cx="54" cy="32" r="2.6" fill="${INK}"/></g>`, 'item');

export const ICON = {
  pause: svg('0 0 24 24', '<rect x="5" y="4" width="5" height="16" rx="1.8" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.8" fill="currentColor"/>'),
  soundOn: ui('<path d="M3.5 9.5h3.5l5-4v13l-5-4H3.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: ui('<path d="M3.5 9.5h3.5l5-4v13l-5-4H3.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  gear: svg('0 0 24 24', `<path d="${gearPath(12, 12, 10.5, 7.6, 8)}" fill="currentColor"/><circle cx="12" cy="12" r="3.2" fill="var(--ico-hole, #1b2452)"/>`),
  camera: ui('<path d="M3 8.5a2 2 0 0 1 2-2h2.2l1.6-2.2h6.4l1.6 2.2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>'),
  help: ui('<circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.4-2.8 4.2"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/>'),
  close: ui('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="3.2"'),
  back: ui('<path d="M15 5l-7 7 7 7"/>', 'stroke-width="3.2"'),
  play: svg('0 0 24 24', '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor"/>'),
  check: ui('<path d="M4.5 12.5l5 5 10-11"/>', 'stroke-width="3.4"'),
  crown: svg('0 0 24 24', '<path d="M2.5 8l5 4 4.5-7 4.5 7 5-4-2 11h-15z" fill="currentColor" stroke="#10163a" stroke-width="1.6" stroke-linejoin="round"/>'),
  star: svg('0 0 24 24', `<path d="${starPath(12, 12.6, 10.5, 4.6)}" fill="currentColor" stroke="#10163a" stroke-width="1.6" stroke-linejoin="round"/>`),
  trophy: ui('<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H3.5v1.5A3.5 3.5 0 0 0 7 11M17 6h3.5v1.5A3.5 3.5 0 0 1 17 11M12 14v4M8 20.5h8"/>'),
  bolt: svg('0 0 24 24', '<path d="M13.5 2L4.5 13.5h6.5L9.5 22l10-12.5h-6.8z" fill="currentColor" stroke="#10163a" stroke-width="1.5" stroke-linejoin="round"/>'),
  lock: ui('<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.2" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  arrow: svg('0 0 24 24', '<path d="M12 1.8l8.5 19.2L12 16.6 3.5 21z" fill="currentColor" stroke="#10163a" stroke-width="1.8" stroke-linejoin="round"/>'),
  jump: svg('0 0 24 24', '<path d="M12 3l8 9h-4.8v8H8.8v-8H4z" fill="currentColor" stroke="#10163a" stroke-width="1.6" stroke-linejoin="round"/>'),
  timer: ui('<circle cx="12" cy="13.5" r="8"/><path d="M12 9.5v4.5l3 2M9.5 2.5h5"/>'),
  sprout: ui('<path d="M12 21v-9"/><path d="M12 12c0-4 3-6.5 8-6.5 0 4.5-3 6.5-8 6.5z" fill="currentColor"/><path d="M12 14.5c0-3.4-2.6-5.5-7-5.5 0 3.8 2.6 5.5 7 5.5z" fill="currentColor"/>'),
  upload: ui('<path d="M12 15V4M7 8.5L12 4l5 4.5M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>'),
  reset: ui('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>'),
  home: ui('<path d="M3.5 11.5L12 4l8.5 7.5M6 10v10h12V10"/>'),
  infinity: ui('<path d="M12 12c-2-2.6-3.8-4-5.8-4a4 4 0 0 0 0 8c2 0 3.8-1.4 5.8-4zm0 0c2 2.6 3.8 4 5.8 4a4 4 0 0 0 0-8c-2 0-3.8 1.4-5.8 4z"/>'),
  family: ui('<circle cx="8" cy="7.5" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M2.5 20c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6M13 20c0-2.8 1.6-5 3.5-5s3.5 2.2 3.5 5"/>'),
  coin: svg('0 0 24 24', '<circle cx="12" cy="12" r="9.5" fill="#ffd23f" stroke="#10163a" stroke-width="2"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#e0a800" stroke-width="1.6"/><path d="M14.6 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2 0 2.6 5.4 1.5 5.4 4.2 0 1.2-1.2 2.1-2.8 2.1-1.2 0-2.3-.6-2.8-1.5M12 6.3v11.4" fill="none" stroke="#10163a" stroke-width="1.8" stroke-linecap="round"/>'),
  sun: svg('0 0 24 24', `<path d="${starPath(12, 12, 11.5, 7.2, 10, 0)}" fill="#ffb627" stroke="#10163a" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="12" r="5.2" fill="#ffe066" stroke="#10163a" stroke-width="1.4"/>`),
  diamond: svg('0 0 24 24', '<path d="M6 3.5h12l4 5.5-10 12.5L2 9z" fill="#7ee8ff" stroke="#10163a" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 9h20M8.5 3.5L7 9l5 12.5M15.5 3.5L17 9l-5 12.5" fill="none" stroke="#10163a" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.5 8.2l2-3" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>'),
  rainbow: svg('0 0 24 24', '<g fill="none" stroke-linecap="round" stroke-width="2.3"><path d="M2.5 18a9.5 9.5 0 0 1 19 0" stroke="#ff4d6d"/><path d="M5 18a7 7 0 0 1 14 0" stroke="#ffb627"/><path d="M7.4 18a4.6 4.6 0 0 1 9.2 0" stroke="#4cd964"/><path d="M9.8 18a2.2 2.2 0 0 1 4.4 0" stroke="#3d9bff"/></g><path d="M2 19.5h5M17 19.5h5" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'),
  shop: ui('<path d="M4 9h16l-1.2 11H5.2zM8 9V7a4 4 0 0 1 8 0v2"/>'),
  target: ui('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>'),
  keyboard: ui('<rect x="2.5" y="6" width="19" height="12" rx="2.2"/><path d="M6 10h.01M9.3 10h.01M12.6 10h.01M16 10h.01M7.5 14h9"/>'),
  touch: ui('<path d="M9 11V5.5a1.8 1.8 0 0 1 3.6 0V11M12.6 10.2a1.8 1.8 0 0 1 3.6 0V12M16.2 11.4a1.8 1.8 0 0 1 3.6.3V15a6.5 6.5 0 0 1-6.5 6.5h-1a6.5 6.5 0 0 1-5.4-2.9L4.2 15a1.9 1.9 0 0 1 3-2.2L9 14.4"/>'),
  gamepad: ui('<path d="M7 7.5h10a4.5 4.5 0 0 1 4.3 5.7l-1 3.6a2.5 2.5 0 0 1-4.2 1.1L14 16h-4l-2.1 1.9a2.5 2.5 0 0 1-4.2-1.1l-1-3.6A4.5 4.5 0 0 1 7 7.5z"/><path d="M7.5 11v3M6 12.5h3"/><circle cx="16" cy="11.5" r=".7" fill="currentColor"/><circle cx="17.6" cy="13.6" r=".7" fill="currentColor"/>'),
  eye: ui('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  flag: ui('<path d="M5 21V4M5 4.5h12l-2.5 4 2.5 4H5"/>'),
};

export const EVENT_ICON = { golden: ICON.sun, diamond: ICON.diamond, rainbow: ICON.rainbow };

export const LOGO_SPROUT = `<svg class="logo-sprout" viewBox="0 0 120 110" aria-hidden="true">
  <g stroke="${INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M60 104 C 58 84, 60 66, 62 52" fill="none" stroke-width="10"/>
    <path d="M60 104 C 58 84, 60 66, 62 52" fill="none" stroke="#3fbf5a" stroke-width="5"/>
    <path d="M62 56 C 60 30, 78 10, 112 8 C 112 38, 94 58, 62 56 Z" fill="#6fe07a"/>
    <path d="M60 64 C 58 44, 42 26, 10 26 C 10 52, 28 68, 60 64 Z" fill="#4fcf62"/>
  </g>
  <path d="M68 50 C 76 36, 88 24, 104 16" fill="none" stroke="#2e9c46" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M54 58 C 44 48, 32 40, 18 34" fill="none" stroke="#2a8a3e" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M74 22 C 80 17, 88 14, 96 13" fill="none" stroke="#c8ffcf" stroke-width="4" stroke-linecap="round"/>
</svg>`;
