// Circular family photo avatars for the DOM UI. Falls back to a coloured disc with the initial.
// Avatars refresh themselves when a face changes in the Photo Booth ('face:changed').
import { familyFaceData, faceInfo, cartoonFaceUrl } from '../characters/faces.js';
import { getProfile } from '../core/profiles.js';
import { CHARACTER } from '../config.js';
import { bus } from '../core/events.js';
import { h } from './dom.js';

const urls = new Map();

export function avatarUrl(id) {
  if (!urls.has(id)) {
    const d = familyFaceData(id);
    // no photo: draw the player's cartoon face (their chosen expression and skin) instead of an initial
    const look = getProfile(id)?.look || CHARACTER[id]?.look || { skin: faceInfo(id).skin };
    urls.set(id, d?.avatar || d?.face || cartoonFaceUrl(look) || null);
  }
  return urls.get(id);
}

function fill(el, id) {
  const url = avatarUrl(id);
  el.textContent = '';
  el.classList.toggle('noimg', !url);
  if (url) {
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.src = url;
    el.appendChild(img);
  } else {
    el.appendChild(h('b', { text: (faceInfo(id).name || '?')[0] }));
  }
}

/** <span class="ava ..."> with the photo; `cls` adds size/style classes. */
export function avatarEl(id, cls = '') {
  const el = h('span', { class: 'ava ' + cls, 'data-face': id, style: `--c:${faceInfo(id).color}`, 'aria-hidden': 'true' });
  fill(el, id);
  return el;
}

/** Replace every <i data-ava="id" class="..."> placeholder inside root with a real avatar. */
export function hydrateAvatars(root) {
  root.querySelectorAll('[data-ava]').forEach((ph) => ph.replaceWith(avatarEl(ph.dataset.ava, ph.className)));
  return root;
}

/**
 * A flat front-view "paper doll" of a Look (blocky R6 body, cartoon face) as an SVG string, used by the
 * New Player flow to preview starting looks. Unknown shirts/hair fall back to plain shapes.
 */
export function lookFigure(look = {}) {
  const L = { skin: '#d6a08a', hair: 'short', hairColor: '#3a2a20', shirt: 'plain', shirtColor: '#3d9bff', shirtColor2: '#ffffff', pants: '#2b3a55', shoes: '#222222', build: 'adult', ...look };
  const c = (v) => (/^#[0-9a-f]{3,8}$/i.test(String(v)) ? v : '#888888');
  const o = 'stroke="#10163a" stroke-width="2.4" stroke-linejoin="round"';
  const skin = c(L.skin), hair = c(L.hairColor), s1 = c(L.shirtColor), s2 = c(L.shirtColor2), pants = c(L.pants), shoes = c(L.shoes);
  const dress = L.shirt === 'dress';
  const shorts = L.shirt === 'hawaiian';
  let p = '';
  if (L.hair === 'long') p += `<path d="M17.5 13a8 8 0 0 1 8-8h13a8 8 0 0 1 8 8v26a4 4 0 0 1-4 4h-21a4 4 0 0 1-4-4z" fill="${hair}" ${o}/>`;
  // legs + shoes
  const legTop = dress ? 64 : 58;
  for (const x of [20, 32]) {
    p += `<rect x="${x}" y="${legTop}" width="12" height="${84 - legTop}" fill="${dress ? skin : pants}" ${o}/>`;
    if (shorts) p += `<rect x="${x}" y="70" width="12" height="14" fill="${skin}" ${o}/>`;
    p += `<rect x="${x - 1}" y="81" width="14" height="7" rx="2.5" fill="${shoes}" ${o}/>`;
  }
  // arms: sleeves in the shirt colour, then skin
  for (const x of [8, 46]) {
    p += `<rect x="${x}" y="33" width="10" height="24" rx="2" fill="${skin}" ${o}/>`;
    p += `<rect x="${x}" y="33" width="10" height="${L.shirt === 'floral' ? 20 : 11}" rx="2" fill="${L.shirt === 'floral' ? s2 : s1}" ${o}/>`;
  }
  // torso (+ skirt)
  if (dress) p += `<path d="M18.5 52h27l5.5 15h-38z" fill="${s1}" ${o}/>`;
  p += `<rect x="18" y="32" width="28" height="${dress ? 24 : 27}" rx="3" fill="${s1}" ${o}/>`;
  if (L.shirt === 'faceprint') p += `<g fill="${s2}"><circle cx="25" cy="39" r="2.4"/><circle cx="38" cy="41" r="2.4"/><circle cx="30" cy="49" r="2.4"/><circle cx="41" cy="52" r="1.8"/><circle cx="23" cy="53" r="1.8"/></g>`;
  else if (L.shirt === 'hawaiian') p += `<path d="M28 32l4 6 4-6" fill="none" stroke="${s2}" stroke-width="2.4"/><g fill="${s2}"><circle cx="24" cy="44" r="2.6"/><circle cx="39" cy="40" r="2.6"/><circle cx="36" cy="52" r="2.6"/></g><g fill="#fff"><circle cx="24" cy="44" r="1"/><circle cx="39" cy="40" r="1"/><circle cx="36" cy="52" r="1"/></g>`;
  else if (L.shirt === 'floral') p += `<path d="M19.2 33.2h6.3v25.3h-6.3zM38.5 33.2h6.3v25.3h-6.3z" fill="${s2}"/><g fill="#fff6c2"><circle cx="22.3" cy="40" r="1.5"/><circle cx="41.7" cy="47" r="1.5"/><circle cx="22.3" cy="52" r="1.5"/></g>`;
  else if (dress) p += `<path d="M18.5 60h32" stroke="${s2}" stroke-width="2.6"/>`;
  // head, face, hair front
  p += `<rect x="20" y="6" width="24" height="25" rx="7" fill="${skin}" ${o}/>`;
  p += '<g fill="#1b1b1b"><ellipse cx="27.6" cy="18.5" rx="1.7" ry="2.5"/><ellipse cx="36.4" cy="18.5" rx="1.7" ry="2.5"/></g>';
  p += '<path d="M27.5 23.5c2.8 2.6 6.2 2.6 9 0" fill="none" stroke="#1b1b1b" stroke-width="1.8" stroke-linecap="round"/>';
  const thick = L.hair === 'short-thick';
  p += `<path d="M19 ${thick ? 16 : 15}V${thick ? 9 : 11}a${thick ? 8 : 7} ${thick ? 8 : 7} 0 0 1 ${thick ? 8 : 7}-${thick ? 8 : 7}h${thick ? 10 : 12}a${thick ? 8 : 7} ${thick ? 8 : 7} 0 0 1 ${thick ? 8 : 7} ${thick ? 8 : 7}v${thick ? 7 : 4}c-4-3.2-8.5-4.4-13-4.4s-9 1.2-13 4.4z" fill="${hair}" ${o}/>`;
  if (L.hair === 'long') p += `<path d="M19 15v14M45 15v14" stroke="${hair}" stroke-width="3.2" stroke-linecap="round"/>`;
  const kid = L.build === 'kid';
  const body = kid ? `<g transform="translate(32 88) scale(.84) translate(-32 -88)">${p}</g>` : p;
  return `<svg class="ico fig" viewBox="0 0 64 92" aria-hidden="true" focusable="false"><ellipse cx="32" cy="88.5" rx="20" ry="3.2" fill="rgba(10,14,40,.35)"/>${body}</svg>`;
}

bus.on('profile:changed', ({ profile } = {}) => {
  if (!profile || familyFaceData(profile.id)) return;
  urls.delete(profile.id);
  document.querySelectorAll(`.ava[data-face="${profile.id}"]`).forEach((el) => fill(el, profile.id));
});

bus.on('face:changed', ({ id } = {}) => {
  if (!id) return;
  urls.delete(id);
  document.querySelectorAll(`.ava[data-face="${id}"]`).forEach((el) => fill(el, id));
});
