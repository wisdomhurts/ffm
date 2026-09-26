// Little potted-plant stickers for the gift picker and the trade window (the 3D plants are too heavy
// to render per card). One archetype per plant `look`, tinted with the species colours; mutations add
// sparkles (gold/diamond) or a rainbow behind the plant. plantIcon(speciesId, mutation) -> '<svg ...>'.
import { PLANT } from '../config.js';
import { INK, st, ink, sparkle, svg } from './icons.js';

const LEAF = '#4fcf62';
const KIND = {
  daisy: 'bloom', sunflower: 'bloom', marigold: 'bloom', lotus: 'lotus', orchid: 'bloom',
  tulip: 'cup', rose: 'cup', lily: 'cup',
  mushroom: 'shroom', glowcap: 'shroom',
  pea: 'pod', berry: 'berry', melon: 'fruit', tater: 'tater', pepper: 'pepper', dragonfruit: 'dragon', bubble: 'bubble',
  fern: 'fern', clover: 'clover', aloe: 'aloe', phoenix: 'flame',
  cactus: 'cactus', flytrap: 'trap',
};

const POT = `${st('<rect x="14" y="45" width="36" height="7" rx="2.5"/>', '#e8894b')}${st('<path d="M17 51 H47 L44 61 H20 Z"/>', '#d06a33')}
  <path d="M20 54 H44" stroke="#b8552a" stroke-width="2" opacity=".7"/>`;
const stem = (top = 24) => `<path d="M32 46 V${top}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M32 46 V${top}" stroke="#3aa655" stroke-width="3.2" stroke-linecap="round"/>`;
const leaves = (y = 38, c = LEAF) =>
  st(`<path d="M32 ${y} C24 ${y} 19 ${y - 4} 16 ${y - 9} C23 ${y - 10} 29 ${y - 7} 32 ${y - 2} Z"/><path d="M32 ${y} C40 ${y} 45 ${y - 4} 48 ${y - 9} C41 ${y - 10} 35 ${y - 7} 32 ${y - 2} Z"/>`, c, 5.5);

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
