// Sticker-style SVG icons for emotes, quick chat and the social HUD (no emoji, no external assets).
// Same look as ui/icons.js ITEM_ICONS: bright fills with a chunky ink outline around each silhouette.
const INK = '#10163a';

// Outline pass (thick ink stroke + ink fill) under a fill pass, so each part gets one clean outer
// border and no internal seams. `shapes` are plain elements without fill/stroke attributes.
const st = (shapes, fill, w = 7) =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
// Stroked detail line (ink under, colour on top).
const line = (d, color = '#fff', w = 4) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 4}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ink = (d, w = 3.5) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (body, cls = '') => `<svg class="ico sico ${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${body}</svg>`;

function star(cx, cy, R, r, n = 5, rot = -Math.PI / 2) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1);
  }
  return d + 'Z';
}
const sparkle = (cx, cy, s, fill = '#fff') => `<path d="${star(cx, cy, s, s * 0.32, 4, 0)}" fill="${fill}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;

const SKIN = '#ffd28a';
const HAND = `<rect x="17" y="12" width="8" height="26" rx="4"/><rect x="25.5" y="7" width="8" height="31" rx="4"/>
  <rect x="34" y="9" width="8" height="29" rx="4"/><rect x="42.5" y="15" width="7" height="23" rx="3.5"/>
  <path d="M17 30 L49.5 30 L49.5 42 C49.5 52 43 58 34 58 C26 58 21 54 17 47 Z"/>
  <path d="M19 45 C13 41 8 35 7 31 C6 27 10 25 13 28 L21 35 Z"/>`;
const waveHand = `<g transform="rotate(-12 32 34)">${st(HAND, SKIN)}${ink('M25.5 30 V36 M34 30 V36 M42.5 30 V36', 2.2)}</g>`;

export const SOCIAL_ICONS = {
  // ------------------------------------------------------------ emotes
  wave: svg(`${waveHand}${ink('M53 9 C57 12 59 16 59 21')}${ink('M50 3 C55 5 58 8 60 12', 3)}`),
  cheer: svg(`${st('<path d="M8 57 L20 27 L37 44 Z"/>', '#ff4f9a')}
    ${line('M13 46 L27 52', '#ffd23f', 3.5)}${line('M17 37 L33 46', '#ffd23f', 3.5)}
    ${st('<rect x="38" y="6" width="6" height="11" rx="1.5" transform="rotate(24 41 11)"/>', '#3dd6ff', 5)}
    ${st('<circle cx="51" cy="25" r="4"/>', '#ffd23f', 5)}
    ${st('<rect x="26" y="7" width="5" height="10" rx="1.5" transform="rotate(-32 28 12)"/>', '#4cd964', 5)}
    ${st('<circle cx="55" cy="11" r="3"/>', '#b36bff', 5)}
    ${line('M40 33 q4 -5 8 0 t8 0', '#ff4d6d', 3)}${sparkle(46, 45, 5, '#fff')}`),
  laugh: svg(`${st('<circle cx="32" cy="33" r="24"/>', '#ffd23f')}
    ${ink('M18 27 Q23 20 28 27', 3.8)}${ink('M36 27 Q41 20 46 27', 3.8)}
    <path d="M18 35 Q32 59 46 35 Z" fill="#8a1c3a" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M25 46 Q32 40 39 46 Q32 52 25 46 Z" fill="#ff7a9c"/>
    <path d="M9 30 C5 37 6 41 9.5 41 C13 41 14 37 9 30 Z" fill="#7fd4ff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M55 30 C51 37 52 41 55.5 41 C59 41 60 37 55 30 Z" fill="#7fd4ff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`),
  point: svg(`${st('<rect x="27" y="23" width="30" height="10" rx="5"/><rect x="9" y="23" width="26" height="28" rx="9"/><path d="M16 24 C17 16 25 15 29 21 L31 27 Z"/>', SKIN)}
    ${ink('M35 36 H27 M35 43 H27', 2.4)}${ink('M60 19 l3 -3', 3)}${ink('M61 28 h3', 3)}${ink('M60 37 l3 3', 3)}`),
  dance1: svg(`${st(`<rect x="23" y="13" width="5.5" height="34" rx="2"/><rect x="45.5" y="8" width="5.5" height="32" rx="2"/>
    <path d="M23 13 L51 6 L51 16 L23 23 Z"/><ellipse cx="18.5" cy="47.5" rx="8.5" ry="6.5" transform="rotate(-22 18.5 47.5)"/>
    <ellipse cx="41" cy="41" rx="8.5" ry="6.5" transform="rotate(-22 41 41)"/>`, '#b36bff')}
    <ellipse cx="16" cy="45" rx="3" ry="1.8" transform="rotate(-22 16 45)" fill="#fff" opacity=".75"/>
    <ellipse cx="38.5" cy="38.5" rx="3" ry="1.8" transform="rotate(-22 38.5 38.5)" fill="#fff" opacity=".75"/>${sparkle(56, 50, 5, '#ffd23f')}`),
  dance2: svg(`${ink('M32 8 V16', 3.5)}${st('<circle cx="32" cy="7" r="4"/>', '#ff4d6d', 5)}
    ${st('<rect x="7" y="27" width="8" height="14" rx="3"/><rect x="49" y="27" width="8" height="14" rx="3"/>', '#7d8fb8')}
    ${st('<rect x="13" y="15" width="38" height="37" rx="9"/>', '#b9c7e6')}
    ${st('<rect x="20" y="24" width="9" height="9" rx="2"/><rect x="35" y="24" width="9" height="9" rx="2"/>', '#3dd6ff', 4)}
    <rect x="21" y="39" width="22" height="7" rx="2" fill="${INK}"/>${ink('M26.5 39.5 V45.5 M32 39.5 V45.5 M37.5 39.5 V45.5', 1.6).replaceAll(INK, '#fff')}`),
  dance3: svg(`${st('<rect x="20" y="37" width="7" height="19" rx="2.5" transform="rotate(14 23.5 37)"/><rect x="29" y="37" width="7" height="19" rx="2.5" transform="rotate(10 32.5 37)"/>', '#2f80ed')}
    ${st('<rect x="37" y="21" width="6.5" height="18" rx="3" transform="rotate(-48 40 22)"/>', SKIN)}
    ${st('<rect x="22" y="19" width="17" height="19" rx="3"/>', '#1ec8a5')}
    ${st('<rect x="24" y="4" width="14" height="13" rx="3.5"/><rect x="32" y="22" width="6.5" height="18" rx="3" transform="rotate(-62 35 23)"/>', SKIN)}
    ${ink('M52 36 q6 -6 1 -13', 3)}${ink('M11 42 q-5 -6 1 -12', 3)}${sparkle(55, 12, 5, '#ffd23f')}`),
  sit: svg(`${st('<rect x="15" y="6" width="10" height="34" rx="4"/><rect x="17" y="40" width="6" height="18" rx="2"/><rect x="41" y="40" width="6" height="18" rx="2"/>', '#b8743e')}
    ${st('<rect x="13" y="33" width="38" height="9" rx="3"/>', '#d99255')}
    ${st('<path d="M27 33 C27 26 31 24 38 24 C45 24 49 26 49 33 Z"/>', '#ff4f9a', 6)}
    ${ink('M17 12 V32', 2)}`),

  // ------------------------------------------------------------ quick chat
  hi: '',
  bye: svg(`<g transform="translate(64 0) scale(-1 1)">${waveHand}</g>${ink('M11 9 C7 12 5 16 5 21')}${ink('M14 3 C9 5 6 8 4 12', 3)}`),
  gg: svg(`${line('M19 13 H10 C10 23 14 27 20 27', '#ffd23f', 4.5)}${line('M45 13 H54 C54 23 50 27 44 27', '#ffd23f', 4.5)}
    ${st('<rect x="21" y="46" width="22" height="10" rx="3"/>', '#a0522d')}${st('<rect x="28" y="36" width="8" height="11"/>', '#ffb627')}
    ${st('<path d="M18 7 H46 V20 C46 32 40 39 32 39 C24 39 18 32 18 20 Z"/>', '#ffd23f')}
    <path d="${star(32, 21, 7.5, 3.2)}" fill="#fff" opacity=".9"/><path d="M23 11 V21" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`),
  thanks: svg(`${st('<path d="M32 56 C12 43 6 31 10 20 C14 10 27 9 32 19 C37 9 50 10 54 20 C58 31 52 43 32 56 Z"/>', '#ff4f9a')}
    <ellipse cx="20" cy="22" rx="5" ry="3.5" transform="rotate(-35 20 22)" fill="#fff" opacity=".7"/>${sparkle(54, 8, 5)}`),
  nice: svg(`${st('<rect x="7" y="29" width="11" height="26" rx="3"/>', '#3d9bff')}
    ${st('<rect x="26" y="5" width="11" height="27" rx="5.5" transform="rotate(8 31 18)"/><rect x="17" y="26" width="31" height="29" rx="8"/>', SKIN)}
    ${ink('M48 34 H40 M48 41 H40 M47 48 H40', 2.4)}${sparkle(55, 11, 5, '#ffd23f')}`),
  wow: svg(`${st(`<path d="${star(32, 34, 25, 11)}"/>`, '#ffd23f')}<path d="${star(32, 34, 13, 5.6)}" fill="#fff5b0"/>
    ${sparkle(55, 9, 6)}${sparkle(9, 12, 5)}`),
  yes: svg(`${st('<circle cx="32" cy="32" r="25"/>', '#3fd65a')}${line('M20 33 L29 42 L45 23', '#fff', 6)}`),
  no: svg(`${st('<circle cx="32" cy="32" r="25"/>', '#8a94c8')}${line('M23 23 L41 41 M41 23 L23 41', '#fff', 6)}`),
  mine: svg(`${st('<path d="M31 30 C31 20 36 13 46 11 C47 21 41 28 31 30 Z"/><path d="M33 34 C33 25 27 19 17 18 C16 27 22 33 33 34 Z"/>', '#4fcf62', 6)}
    ${st('<rect x="6" y="38" width="52" height="7" rx="2"/><path d="M8 58 V33 L14 27 L20 33 V58 Z"/><path d="M26 58 V37 L32 31 L38 37 V58 Z"/><path d="M44 58 V33 L50 27 L56 33 V58 Z"/>', '#f4d7a1')}
    ${ink('M32 31 V37', 3)}`),
  nicesteal: svg(`${st('<path d="M33 30 C33 20 38 14 48 12 C49 22 43 28 33 30 Z"/><path d="M31 32 C31 24 25 18 15 17 C14 26 20 31 31 32 Z"/>', '#4fcf62', 6)}
    ${ink('M32 44 V30', 4)}${st('<rect x="14" y="38" width="36" height="8" rx="2.5"/>', '#e8894b')}${st('<path d="M17 45 H47 L44 59 H20 Z"/>', '#d06a33')}
    ${sparkle(53, 32, 7, '#ffd23f')}${sparkle(10, 32, 5, '#fff')}`),
  race: svg(`${st('<rect x="10" y="5" width="6" height="54" rx="3"/>', '#c9d3ff')}
    ${st('<rect x="16" y="8" width="40" height="28" rx="2"/>', '#fff')}
    <path d="M16 8h8v7h-8zM32 8h8v7h-8zM48 8h8v7h-8zM24 15h8v7h-8zM40 15h8v7h-8zM16 22h8v7h-8zM32 22h8v7h-8zM48 22h8v7h-8zM24 29h8v7h-8zM40 29h8v7h-8z" fill="${INK}"/>
    <rect x="16" y="8" width="40" height="28" rx="2" fill="none" stroke="${INK}" stroke-width="3.5"/>`),
  trade: svg(`${st('<circle cx="32" cy="32" r="25"/>', '#3d9bff')}${line('M16 25 H44 M37 18 L44 25 L37 32', '#fff', 5)}${line('M48 40 H20 M27 33 L20 40 L27 47', '#ffd23f', 5)}`),
  help: svg(`<circle cx="32" cy="32" r="19" fill="none" stroke="${INK}" stroke-width="18"/>
    <circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="11"/>
    <circle cx="32" cy="32" r="19" fill="none" stroke="#ff4d6d" stroke-width="11" stroke-dasharray="14.9 14.9" stroke-dashoffset="7.5"/>
    <circle cx="26" cy="25" r="2.2" fill="#fff" opacity=".8"/>`),
  oops: svg(`${st('<circle cx="30" cy="34" r="23"/>', '#ffd23f')}
    <circle cx="22" cy="31" r="3.2" fill="${INK}"/><circle cx="38" cy="31" r="3.2" fill="${INK}"/>${ink('M17 23 L25 21 M43 23 L35 21', 3)}
    ${ink('M19 44 q3 -3 5.5 0 t5.5 0 t5.5 0 t5.5 0', 3.2)}
    <path d="M52 6 C46 16 47 21 52 21 C57 21 58 16 52 6 Z" fill="#7fd4ff" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>`),
  watch: svg(`${st('<path d="M32 6 L59 55 H5 Z"/>', '#ffd23f', 8)}<rect x="28.5" y="22" width="7" height="19" rx="3.5" fill="${INK}"/><circle cx="32" cy="48" r="4" fill="${INK}"/>`),
  catch: svg(`${ink('M3 31 H13 M1 39 H11 M4 47 H11', 3.5)}
    ${st('<path d="M15 41 C15 30 19 23 25 23 L31 23 C33 29 39 31 47 33 C55 35 59 39 59 45 L59 48 H15 Z"/>', '#ff4d6d')}
    ${st('<rect x="13" y="46" width="48" height="9" rx="4"/>', '#fff')}${ink('M31 29 l5 -3 M35 32 l5 -3 M39 34 l5 -3', 2.6)}`),

  // ------------------------------------------------------------ HUD
  smile: svg(`${st('<circle cx="32" cy="32" r="25"/>', '#ffd23f')}<circle cx="23" cy="27" r="3.6" fill="${INK}"/><circle cx="41" cy="27" r="3.6" fill="${INK}"/>
    <path d="M19 36 Q32 52 45 36 Z" fill="#8a1c3a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="16" cy="36" r="3.5" fill="#ff8a6b" opacity=".6"/><circle cx="48" cy="36" r="3.5" fill="#ff8a6b" opacity=".6"/>`),
  bubble: svg(`${st('<path d="M8 14 C8 9 12 6 17 6 H47 C52 6 56 9 56 14 V36 C56 41 52 44 47 44 H26 L15 55 L17 44 C12 44 8 41 8 36 Z"/>', '#fff')}
    <circle cx="21" cy="25" r="4" fill="#3d9bff"/><circle cx="32" cy="25" r="4" fill="#3d9bff"/><circle cx="43" cy="25" r="4" fill="#3d9bff"/>`),
  gift: svg(`${st('<rect x="10" y="28" width="44" height="30" rx="4"/>', '#ff4f9a')}${st('<rect x="7" y="20" width="50" height="11" rx="3"/>', '#ff7ab8')}
    <rect x="28" y="20" width="8" height="38" fill="#ffd23f" stroke="${INK}" stroke-width="2.5"/>
    ${st('<path d="M32 20 C24 8 12 10 16 17 C18 21 26 21 32 20 Z"/><path d="M32 20 C40 8 52 10 48 17 C46 21 38 21 32 20 Z"/>', '#ffd23f', 6)}`),
};
SOCIAL_ICONS.hi = SOCIAL_ICONS.wave;

// drawing helpers shared with plantIcon.js
export { INK, st, line, ink, star, sparkle, svg };
