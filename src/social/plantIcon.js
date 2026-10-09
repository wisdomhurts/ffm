// Little potted-plant stickers for the gift picker and the trade window (the 3D plants are too heavy
// to render per card). One archetype per plant `look`, tinted with the species colours; mutations add
// sparkles (gold/diamond) or a rainbow behind the plant. plantIcon(speciesId, mutation) -> '<svg ...>'.
import { PLANT } from '../config.js';
import { INK, st, ink, star, sparkle, svg } from './icons.js';

const LEAF = '#4fcf62';
// Sticker archetype per plant look (a look missing here falls back to a plain bloom).
export const KIND = {
  daisy: 'bloom', sunflower: 'bloom', marigold: 'bloom', lotus: 'lotus', orchid: 'bloom',
  tulip: 'cup', rose: 'cup', lily: 'cup',
  mushroom: 'shroom', glowcap: 'shroom',
  pea: 'pod', berry: 'berry', melon: 'fruit', tater: 'tater', pepper: 'pepper', dragonfruit: 'dragon', bubble: 'bubble',
  fern: 'fern', clover: 'clover', aloe: 'aloe', phoenix: 'flame',
  cactus: 'cactus', flytrap: 'trap',
  snowflake: 'snowflake', icerose: 'crystal', frostbell: 'bells',
  lollipop: 'lollipop', gumdrop: 'gumdrop', candycane: 'cane',
  cloudpuff: 'cloud', halolily: 'halo', thunder: 'bolt',
  prismpetal: 'prism', geodegourd: 'geode', glimmergrape: 'grapes',
  coralcrown: 'coral', pearlclam: 'clam', jellybell: 'jelly',
  infinityrose: 'infinity', aurorafern: 'aurora', starfruit: 'starfruit',
};
const SPECTRUM = ['#ff3d5e', '#ff8f1f', '#ffd91f', '#3ae36a', '#1fb8ff', '#a640ff'];

const POT = `${st('<rect x="14" y="45" width="36" height="7" rx="2.5"/>', '#e8894b')}${st('<path d="M17 51 H47 L44 61 H20 Z"/>', '#d06a33')}
  <path d="M20 54 H44" stroke="#b8552a" stroke-width="2" opacity=".7"/>`;
const stem = (top = 24) => `<path d="M32 46 V${top}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M32 46 V${top}" stroke="#3aa655" stroke-width="3.2" stroke-linecap="round"/>`;
const leaves = (y = 38, c = LEAF) =>
  st(`<path d="M32 ${y} C24 ${y} 19 ${y - 4} 16 ${y - 9} C23 ${y - 10} 29 ${y - 7} 32 ${y - 2} Z"/><path d="M32 ${y} C40 ${y} 45 ${y - 4} 48 ${y - 9} C41 ${y - 10} 35 ${y - 7} 32 ${y - 2} Z"/>`, c, 5.5);

// A candy-coloured line with an ink outline (arms, sticks, canes).
const stroke = (d, c, w = 3.4) => `${ink(d, w + 3.6)}<path d="${d}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const bellAt = (x, y, k = 1) =>
  `<path d="M${x - 6 * k} ${y + 10 * k} C${x - 6 * k} ${y + 2 * k} ${x - 4 * k} ${y} ${x} ${y} C${x + 4 * k} ${y} ${x + 6 * k} ${y + 2 * k} ${x + 6 * k} ${y + 10 * k} L${x + 8 * k} ${y + 13 * k} H${x - 8 * k} Z"/>`;
const dropAt = (x, y, k = 1) => `<path d="M${x - 4 * k} ${y + 3 * k} C${x - 4 * k} ${y - 4 * k} ${x + 4 * k} ${y - 4 * k} ${x + 4 * k} ${y + 3 * k} Z"/>`;

function petals(n, r, rx, ry, cy, c) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i;
    s += `<ellipse cx="32" cy="${cy - r}" rx="${rx}" ry="${ry}" transform="rotate(${a} 32 ${cy})"/>`;
  }
  return st(s, c, 5);
}

function body(kind, c0, c1) {
  switch (kind) {
    case 'bloom':
      return `${stem(22)}${leaves()}${petals(8, 9, 4.6, 8, 20, c0)}${st('<circle cx="32" cy="20" r="6.5"/>', c1, 5)}`;
    case 'lotus':
      return `${stem(26)}${leaves(40)}${st('<path d="M32 30 C22 30 15 24 13 14 C21 15 27 20 32 28 Z"/><path d="M32 30 C42 30 49 24 51 14 C43 15 37 20 32 28 Z"/>', c1, 5)}
        ${st('<path d="M32 31 C25 26 24 16 32 6 C40 16 39 26 32 31 Z"/>', c0, 5)}`;
    case 'cup':
      return `${stem(26)}${leaves()}${st('<path d="M20 9 L26 15 L32 6 L38 15 L44 9 C47 22 42 31 32 31 C22 31 17 22 20 9 Z"/>', c0)}
        <path d="M27 20 C28 25 30 28 32 29" stroke="${c1}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>`;
    case 'shroom':
      return `${st('<rect x="26" y="26" width="12" height="21" rx="5"/>', '#fff4e0')}${st('<path d="M11 29 C11 15 21 7 32 7 C43 7 53 15 53 29 Z"/>', c0)}
        <circle cx="23" cy="18" r="3.4" fill="${c1}"/><circle cx="37" cy="14" r="2.8" fill="${c1}"/><circle cx="44" cy="23" r="3" fill="${c1}"/><circle cx="30" cy="24" r="2.4" fill="${c1}"/>`;
    case 'pod':
      return `${stem(28)}${st('<path d="M14 26 C16 12 34 6 50 12 C46 26 30 32 14 26 Z"/>', c1)}
        <circle cx="23" cy="21" r="4" fill="${c0}" stroke="${INK}" stroke-width="2"/><circle cx="32" cy="18" r="4" fill="${c0}" stroke="${INK}" stroke-width="2"/><circle cx="41" cy="15" r="4" fill="${c0}" stroke="${INK}" stroke-width="2"/>`;
    case 'berry':
      return `${stem(30)}${leaves(40, c1)}${st('<circle cx="24" cy="24" r="8"/><circle cx="40" cy="24" r="8"/><circle cx="32" cy="13" r="8"/>', c0)}
        <circle cx="21" cy="21" r="2" fill="#fff" opacity=".7"/><circle cx="29" cy="10" r="2" fill="#fff" opacity=".7"/><circle cx="37" cy="21" r="2" fill="#fff" opacity=".7"/>`;
    case 'fruit':
      return `${leaves(44, LEAF)}${st('<circle cx="32" cy="27" r="16"/>', c0)}${ink(`M24 14 C21 22 21 32 24 40 M32 11 V43 M40 14 C43 22 43 32 40 40`, 2.2).replaceAll(INK, c1)}
        <ellipse cx="25" cy="20" rx="4" ry="2.6" transform="rotate(-35 25 20)" fill="#fff" opacity=".6"/>`;
    case 'tater':
      return `${leaves(44, c1)}${st('<path d="M15 30 C13 18 24 11 34 12 C46 13 52 22 49 32 C46 42 34 45 25 42 C18 40 16 36 15 30 Z"/>', c0)}
        <circle cx="26" cy="22" r="1.8" fill="#7a5a30"/><circle cx="38" cy="30" r="1.8" fill="#7a5a30"/><circle cx="30" cy="35" r="1.6" fill="#7a5a30"/>`;
    case 'pepper':
      return `${st('<path d="M32 14 C31 8 34 5 38 4" fill="none"/>', c1, 5)}${st('<path d="M22 16 C28 12 38 12 43 17 C47 22 43 34 36 41 C31 46 25 47 25 44 C27 37 20 30 20 22 C20 19 20 17 22 16 Z"/>', c0)}
        <path d="M26 19 C25 24 26 30 28 34" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>`;
    case 'dragon':
      return `${st('<path d="M32 44 C20 44 14 36 15 26 C16 16 24 10 32 10 C40 10 48 16 49 26 C50 36 44 44 32 44 Z"/>', c0)}
        ${st('<path d="M21 20 L14 14 L24 16 Z"/><path d="M43 20 L50 14 L40 16 Z"/><path d="M32 12 L32 3 L37 11 Z"/><path d="M19 33 L11 34 L19 38 Z"/><path d="M45 33 L53 34 L45 38 Z"/>', c1, 4.5)}`;
    case 'bubble':
      return `${stem(30)}${leaves()}${st('<circle cx="24" cy="24" r="9"/><circle cx="40" cy="20" r="7"/><circle cx="33" cy="9" r="5.5"/>', c0, 4.5)}
        <circle cx="21" cy="21" r="2.6" fill="#fff"/><circle cx="38" cy="18" r="2" fill="#fff"/><circle cx="31.5" cy="7.5" r="1.6" fill="#fff"/>`;
    case 'fern':
      return `${st('<path d="M32 46 C20 36 12 24 12 10 C22 18 28 30 32 44 Z"/><path d="M32 46 C44 36 52 24 52 10 C42 18 36 30 32 44 Z"/><path d="M32 46 C28 32 28 18 32 5 C36 18 36 32 32 46 Z"/>', c0)}
        ${ink('M32 44 C31 32 31 20 32 8 M31 44 C24 34 18 24 15 14 M33 44 C40 34 46 24 49 14', 1.8).replaceAll(INK, c1)}`;
    case 'clover':
      return `${stem(26)}${st('<circle cx="24" cy="22" r="8"/><circle cx="40" cy="22" r="8"/><circle cx="32" cy="12" r="8"/><circle cx="32" cy="28" r="7"/>', c0)}
        <circle cx="32" cy="21" r="3.6" fill="${c1}" stroke="${INK}" stroke-width="2"/>`;
    case 'aloe':
      return `${st('<path d="M32 47 C24 38 16 26 14 12 C22 22 28 32 33 45 Z"/><path d="M32 47 C40 38 48 26 50 12 C42 22 36 32 31 45 Z"/><path d="M31 47 C27 33 27 18 32 4 C37 18 37 33 33 47 Z"/>', c0)}
        <path d="M31 40 C30 30 30 20 32 10" stroke="${c1}" stroke-width="2" fill="none" opacity=".7"/>`;
    case 'flame':
      return `${st('<path d="M32 47 C18 42 14 30 20 18 C21 26 25 29 28 30 C24 20 28 10 36 4 C35 14 42 18 44 26 C46 20 45 16 44 13 C52 22 52 40 32 47 Z"/>', c0)}
        ${st('<path d="M32 44 C26 41 24 35 27 29 C29 33 31 34 33 34 C32 29 34 25 37 22 C38 28 42 31 41 36 C40 41 36 43 32 44 Z"/>', c1, 4)}`;
    case 'cactus':
      return `${st('<rect x="25" y="8" width="14" height="40" rx="7"/><path d="M25 32 H18 C15 32 14 30 14 27 V19 C14 16 20 16 20 19 V26 H25 Z"/><path d="M39 28 H45 C48 28 49 26 49 23 V15 C49 12 43 12 43 15 V22 H39 Z"/>', c0)}
        ${st('<circle cx="32" cy="8" r="4.5"/>', c1, 4.5)}${ink('M29 18 l-2 -1 M35 24 l2 -1 M29 32 l-2 -1 M35 38 l2 -1', 1.6)}`;
    case 'trap':
      return `${stem(30)}${leaves(42)}${st('<path d="M14 26 C14 14 24 8 32 8 C40 8 50 14 50 26 C44 20 38 19 32 19 C26 19 20 20 14 26 Z"/>', c0)}
        ${st('<path d="M16 29 C22 23 27 22 32 22 C37 22 42 23 48 29 C44 35 38 37 32 37 C26 37 20 35 16 29 Z"/>', c1)}
        <path d="M20 25 l2 4 l2 -4 l2 4 l2 -4 l2 4 l2 -4 l2 4 l2 -4 l2 4 l2 -4 l2 4" stroke="#fff" stroke-width="1.6" fill="none"/>`;
    case 'snowflake': {
      let arms = '';
      for (let i = 0; i < 6; i++) arms += `<path transform="rotate(${i * 60} 32 20)" d="M32 20 V6 M32 10.5 L27.5 7 M32 10.5 L36.5 7 M32 14.5 L29 12 M32 14.5 L35 12"/>`;
      return `${stem(32)}${leaves(42, '#7fd8d0')}<g fill="none" stroke="${INK}" stroke-width="6.6" stroke-linecap="round" stroke-linejoin="round">${arms}</g>
        <g fill="none" stroke="${c1}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${arms}</g>${st('<path d="M32 14 L37.2 17 V23 L32 26 L26.8 23 V17 Z"/>', c0, 4.5)}`;
    }
    case 'crystal':
      return `${stem(28)}${leaves(40, '#5fc0c8')}${st('<path d="M32 31 L17 21 L20 8 L27 14 L32 4 L37 14 L44 8 L47 21 Z"/>', c1)}
        ${st('<path d="M32 29 L24 20 L28 13 L32 17 L36 13 L40 20 Z"/>', c0, 4)}<path d="M21 11 L24 17 M31 8 L32 12" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/>`;
    case 'bells':
      return `${leaves(44, '#5fb8a8')}${stroke('M31 46 C29 30 31 12 41 10 C47 9 49 13 48 17', '#5fb8a8', 3)}${stroke('M33 46 C33 34 28 25 20 23 C16 22 14 24 15 27', '#5fb8a8', 2.6)}
        ${st(`${bellAt(48, 17, 1.05)}${bellAt(15, 27, 0.8)}`, c0, 5)}
        <circle cx="48" cy="33" r="2.2" fill="${c1}" stroke="${INK}" stroke-width="1.6"/><circle cx="15" cy="40" r="1.8" fill="${c1}" stroke="${INK}" stroke-width="1.5"/>
        <path d="M44 21 C44 24 44 26 45 28" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`;
    case 'lollipop':
      return `${stroke('M32 46 V30', '#fff', 3.2)}${leaves(41, '#45d488')}${st('<circle cx="32" cy="18" r="14"/>', c0)}
        <path d="M32 18 a2 2 0 0 1 4 0 a4 4 0 0 1 -8 0 a6 6 0 0 1 12 0 a8 8 0 0 1 -16 0 a10 10 0 0 1 20 0 a12 12 0 0 1 -24 0" fill="none" stroke="${c1}" stroke-width="3.4" stroke-linecap="round"/>
        <ellipse cx="25" cy="10" rx="3.2" ry="1.8" transform="rotate(-35 25 10)" fill="#fff" opacity=".75"/>`;
    case 'gumdrop':
      return `${st('<rect x="29" y="35" width="6" height="11" rx="2"/>', '#c98a5a', 5)}${st('<circle cx="32" cy="23" r="14"/><circle cx="19" cy="30" r="9"/><circle cx="45" cy="30" r="9"/>', c0)}
        ${st(dropAt(32, 9, 1.3), c1, 4)}${st(dropAt(21, 22), '#ffd84a', 4)}${st(dropAt(42, 21), '#b77bff', 4)}${st(dropAt(26, 32), '#4fc3ff', 4)}${st(dropAt(40, 33), '#ff8a3d', 4)}
        <circle cx="30" cy="7" r="1.2" fill="#fff"/><circle cx="20" cy="21" r="1" fill="#fff"/><circle cx="41" cy="20" r="1" fill="#fff"/>`;
    case 'cane': {
      const big = 'M27 46 V19 C27 9 40 7 41 15 C42 19 39 21 37 19', small = 'M41 46 V32 C41 26 48 24 50 29 C51 32 48 33 47 31';
      const cane = (d, w) => `${ink(d, w + 3.8)}<path d="${d}" stroke="${c1}" stroke-width="${w}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${c0}" stroke-width="${w}" fill="none" stroke-dasharray="3.4 3.4"/>`;
      let mint = '';
      for (let i = 0; i < 4; i++) mint += `<path transform="rotate(${i * 90} 18 34)" d="M18 34 L18 27.5 A6.5 6.5 0 0 1 22.6 29.4 Z"/>`;
      return `${leaves(44, '#56dc9c')}${cane(small, 4.2)}${cane(big, 5)}${st('<circle cx="18" cy="34" r="6.5"/>', '#fff', 4)}<g fill="${c0}">${mint}</g>`;
    }
    case 'cloud':
      return `${stem(32)}${leaves(43, '#8fcfb0')}${st('<path d="M14 31 C8 31 7 22 14 21 C13 13 22 10 26 15 C28 7 39 7 41 14 C46 11 53 16 50 22 C56 23 55 31 49 31 Z"/>', c0)}
        ${st('<circle cx="22" cy="37" r="3.2"/><circle cx="27" cy="39.5" r="2.8"/><circle cx="41" cy="37" r="3.2"/><circle cx="29" cy="11" r="3"/><circle cx="41" cy="12.5" r="2.6"/>', c1, 4)}
        <circle cx="21" cy="36" r="1" fill="#fff"/><circle cx="40" cy="36" r="1" fill="#fff"/><circle cx="28" cy="10" r="1" fill="#fff"/>`;
    case 'halo':
      return `${stem(30)}${leaves(41)}${st('<path d="M32 34 C26 34 20 29 15 20 C21 21 25 23 28 26 C27 20 28 16 32 11 C36 16 37 20 36 26 C39 23 43 21 49 20 C44 29 38 34 32 34 Z"/>', c0)}
        <path d="M32 32 V24" stroke="${c1}" stroke-width="2.4" stroke-linecap="round"/><circle cx="32" cy="23" r="2.2" fill="${c1}"/>
        <ellipse cx="32" cy="6.5" rx="10" ry="3.2" fill="none" stroke="${INK}" stroke-width="6"/><ellipse cx="32" cy="6.5" rx="10" ry="3.2" fill="none" stroke="${c1}" stroke-width="2.6"/>`;
    case 'bolt':
      return `${stem(24)}${leaves(40, '#4a6fd0')}${petals(8, 10, 4.2, 7.5, 19, c0)}${st('<path d="M35 8 L26 21 H31 L28 31 L39 16 H33.5 Z"/>', c1, 4.5)}
        ${ink('M8 14 L12 12 L10 17 L14 15', 2.2).replaceAll(INK, c1)}${ink('M52 26 L56 24 L54 29 L58 27', 2.2).replaceAll(INK, c1)}`;
    case 'prism': {
      // a crystal star in front of a fan of rainbow rays
      let rays = '';
      SPECTRUM.forEach((c, i) => (rays += `<path transform="rotate(${-75 + i * 30} 32 20)" d="M32 18 L28.6 1.5 H35.4 Z" fill="${c}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`));
      return `${stem(30)}${leaves(41, '#3fcf9f')}${rays}${st(`<path d="${star(32, 20, 13.5, 5.6)}"/>`, c0, 5)}
        ${st('<path d="M32 15 L36.5 19 L32 25 L27.5 19 Z"/>', '#e9fff7', 3.5)}<path d="M29 16 L31 14.5" stroke="${c1}" stroke-width="2" stroke-linecap="round"/>`;
    }
    case 'geode':
      return `${leaves(45, '#3f9f86')}${st('<path d="M30 6 L33 21 L27 21 Z"/><path d="M22 10 L27 22 L20 22 Z"/><path d="M39 9 L43 22 L36 22 Z"/><path d="M45 15 L47 23 L42 23 Z"/><path d="M17 15 L20 23 L15 23 Z"/>', c0, 4)}
        <path d="M30 10 L32 21 L29 21 Z M39 13 L41 21 L38 21 Z" fill="${c1}"/>
        ${st('<path d="M11 22 H53 C53 37 44 46 32 46 C20 46 11 37 11 22 Z"/>', '#7a7090')}
        <path d="M11.5 22 H52.5" stroke="#efe6ff" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M20 26 V40 M32 27 V44 M44 26 V40" stroke="#5f5676" stroke-width="2" stroke-linecap="round"/>
        ${st('<path d="M44 7 C44 2 56 2 56 7 Z"/>', '#7a7090', 3.5)}`;
    case 'grapes': {
      const g = [[38, 21], [45, 21], [41.5, 27], [48, 27], [35, 27], [38.5, 33], [45, 33], [41.8, 39]];
      return `${stroke('M18 46 C13 32 15 14 29 9 C37 6 42 10 42 16', '#5a4258', 3.6)}${st('<path d="M22 13 C14 6 24 1 28 7 C31 1 40 4 35 11 Z"/>', c1, 5)}
        ${st(g.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6"/>`).join(''), c0, 4)}
        ${g.slice(0, 5).map(([x, y]) => `<circle cx="${x - 1.4}" cy="${y - 1.5}" r="1.3" fill="#fff" opacity=".8"/>`).join('')}`;
    }
    case 'coral':
      return `${stroke('M23 18 L17 7 M20 13 L14 11 M28 15 L26 3 M36 15 L38 3 M41 18 L47 7 M44 13 L50 11', c0, 3.4)}
        ${st('<circle cx="17" cy="7" r="2.4"/><circle cx="26" cy="3.5" r="2.4"/><circle cx="38" cy="3.5" r="2.4"/><circle cx="47" cy="7" r="2.4"/>', c1, 3)}
        ${st('<rect x="27" y="33" width="10" height="14" rx="4"/>', c0)}${st('<circle cx="32" cy="27" r="11"/>', c1)}
        <path d="M24 25 C27 22 29 28 32 25 C35 22 37 28 40 25 M25 31 C28 28 30 34 33 31 C35 29 37 33 39 31" stroke="${c0}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        ${st('<path d="M20 19 C26 14 38 14 44 19 L43 22.5 C37 18.5 27 18.5 21 22.5 Z"/>', c0, 4)}`;
    case 'clam': {
      let ribs = '';
      for (let i = 0; i < 6; i++) ribs += `<path transform="rotate(${-62 + i * 25} 32 25)" d="M32 25 V6" stroke="${c1}" stroke-width="2" stroke-linecap="round"/>`;
      return `${stem(40)}${leaves(45, '#4fbf9a')}${st('<path d="M11 25 C12 13 21 4 32 4 C43 4 52 13 53 25 C46 22 39 21 32 21 C25 21 18 22 11 25 Z"/>', c0)}${ribs}
        ${st('<path d="M10 28 C10 37 20 42 32 42 C44 42 54 37 54 28 Z"/>', c0)}${st('<circle cx="32" cy="26" r="7.5"/>', '#fff', 4)}
        <circle cx="29.5" cy="23.5" r="2.2" fill="${c1}" opacity=".6"/>`;
    }
    case 'jelly':
      return `${stroke('M32 47 C29 41 35 37 32 31', c1, 2.4)}${stroke('M19 26 C16 32 22 36 19 43', c0, 2.6)}${stroke('M26 28 C24 34 29 37 27 44', c1, 2.6)}
        ${stroke('M38 28 C40 34 35 37 37 44', c1, 2.6)}${stroke('M45 26 C48 32 42 36 45 43', c0, 2.6)}
        ${st('<path d="M11 27 C11 13 20 5 32 5 C44 5 53 13 53 27 C49 29 45 25 41 28 C37 31 27 31 23 28 C19 25 15 29 11 27 Z"/>', c0)}
        <ellipse cx="25" cy="13" rx="6" ry="3.4" transform="rotate(-25 25 13)" fill="${c1}" opacity=".7"/><circle cx="40" cy="12" r="1.6" fill="#fff"/><circle cx="45" cy="18" r="1.2" fill="#fff"/>`;
    case 'infinity': {
      const lobe = (d, c) => `<path d="${d}" stroke="${c}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
      return `${stem(30)}${leaves(41)}${ink('M32 16 C28 9 13 8 13 16 C13 24 28 23 32 16 C36 9 51 8 51 16 C51 24 36 23 32 16', 7.6)}
        ${lobe('M32 16 C28 9 13 8 13 16', SPECTRUM[0])}${lobe('M13 16 C13 24 28 23 32 16', SPECTRUM[2])}${lobe('M32 16 C36 9 51 8 51 16', SPECTRUM[4])}${lobe('M51 16 C51 24 36 23 32 16', SPECTRUM[5])}
        ${st('<path d="M23 15 L27 19 L32 12 L37 19 L41 15 C43 25 39 31 32 31 C25 31 21 25 23 15 Z"/>', c0)}<path d="M28 23 C30 27 34 27 36 23" stroke="${c1}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    }
    case 'aurora':
      return `${st('<path d="M32 46 C22 34 15 22 16 6 C24 16 28 30 32 44 Z"/>', '#3ae36a')}${st('<path d="M32 46 C42 34 49 22 48 6 C40 16 36 30 32 44 Z"/>', '#7a6bff')}
        ${st('<path d="M31 46 C26 32 26 16 32 2 C38 16 38 32 33 46 Z"/>', '#1fb8ff')}
        <path d="M17 9 L19 15 M47 9 L45 15 M32 5 V11" stroke="#ff7ad9" stroke-width="3" stroke-linecap="round"/>
        ${stroke('M32 44 C33 36 39 32 39 26 C39 21 33 20 32 24 C31 27 35 28 35 25', c0, 3)}`;
    case 'starfruit':
      return `${stem(34)}${leaves(42, '#5cc860')}${st(`<path d="${star(32, 20, 16, 7.6)}"/>`, c0)}
        ${ink('M32 20 L32 6 M32 20 L45.2 15.7 M32 20 L40.2 31.4 M32 20 L23.8 31.4 M32 20 L18.8 15.7', 1.8).replaceAll(INK, c1)}
        ${st(`<path d="${star(9, 10, 4.2, 1.9)}"/>`, '#ff7ad9', 3)}${st(`<path d="${star(55, 12, 3.6, 1.6)}"/>`, '#5ce8ff', 3)}`;
    default:
      return `${stem(22)}${leaves()}${st('<circle cx="32" cy="20" r="10"/>', c0)}`;
  }
}

function mutationFx(mutation) {
  if (mutation === 'gold') return `${sparkle(10, 12, 6, '#ffd23f')}${sparkle(54, 20, 5, '#ffd23f')}${sparkle(52, 44, 3.5, '#fff3a6')}`;
  if (mutation === 'diamond') {
    return `${st('<path d="M6 12 L10 7 H18 L22 12 L14 22 Z"/>', '#7ee8ff', 4)}${sparkle(54, 16, 5, '#bff6ff')}${sparkle(53, 42, 3.5, '#fff')}`;
  }
  return '';
}
const RAINBOW = ['#ff4d6d', '#ffb627', '#fff04d', '#4cd964', '#3dd6ff', '#8a6bff'];
const rainbowArc = () => RAINBOW.map((c, i) => `<path d="M${4 + i * 3} 44 A${28 - i * 3} ${28 - i * 3} 0 0 1 ${60 - i * 3} 44" fill="none" stroke="${c}" stroke-width="3.2"/>`).join('');

const cache = new Map();
export function plantIcon(speciesId, mutation = 'normal') {
  const key = speciesId + ':' + mutation;
  let s = cache.get(key);
  if (s) return s;
  const sp = PLANT[speciesId];
  const [c0, c1] = sp?.colors || ['#ff6b9d', '#ffd23f'];
  s = svg(`${mutation === 'rainbow' ? rainbowArc() : ''}${body(KIND[sp?.look] || 'bloom', c0, c1)}${POT}${mutationFx(mutation)}`, 'plant-ic');
  cache.set(key, s);
  return s;
}
