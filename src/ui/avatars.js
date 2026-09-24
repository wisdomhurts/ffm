// Circular family photo avatars for the DOM UI. Falls back to a coloured disc with the initial.
// Avatars refresh themselves when a face changes in the Photo Booth ('face:changed').
import { CHARACTER } from '../config.js';
import { familyFaceData } from '../characters/faces.js';
import { bus } from '../core/events.js';
import { h } from './dom.js';

const urls = new Map();

export function avatarUrl(id) {
  if (!urls.has(id)) {
    const d = familyFaceData(id);
    urls.set(id, d?.avatar || d?.face || null);
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
    el.appendChild(h('b', { text: (CHARACTER[id]?.name || '?')[0] }));
  }
}

/** <span class="ava ..."> with the photo; `cls` adds size/style classes. */
export function avatarEl(id, cls = '') {
  const c = CHARACTER[id];
  const el = h('span', { class: 'ava ' + cls, 'data-face': id, style: `--c:${c?.color || '#888'}`, 'aria-hidden': 'true' });
  fill(el, id);
  return el;
}

/** Replace every <i data-ava="id" class="..."> placeholder inside root with a real avatar. */
export function hydrateAvatars(root) {
  root.querySelectorAll('[data-ava]').forEach((ph) => ph.replaceWith(avatarEl(ph.dataset.ava, ph.className)));
  return root;
}

bus.on('face:changed', ({ id } = {}) => {
  if (!id) return;
  urls.delete(id);
  document.querySelectorAll(`.ava[data-face="${id}"]`).forEach((el) => fill(el, id));
});
