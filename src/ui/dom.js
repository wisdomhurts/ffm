// Tiny DOM helpers shared by the UI modules.

import { settings, setSetting } from '../core/settings.js';
import { load, save } from '../core/save.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * h('div', {class:'x', style:'...', onclick: fn, html:'<b>..</b>', text:'..', ...attrs}, ...children)
 * Children may be nodes, strings or arrays; null/false are skipped.
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/** Write text only when it changed (keeps per-frame HUD updates cheap). */
export function setText(el, s) {
  if (el._t !== s) {
    el._t = s;
    el.textContent = s;
  }
}

export function setHTML(el, s) {
  if (el._h !== s) {
    el._h = s;
    el.innerHTML = s;
  }
}

export function setStyle(el, prop, v) {
  const k = '_s_' + prop;
  if (el[k] !== v) {
    el[k] = v;
    if (prop.startsWith('--')) el.style.setProperty(prop, v);
    else el.style[prop] = v;
  }
}

export function toggle(el, cls, on) {
  const k = '_c_' + cls;
  if (el[k] !== on) {
    el[k] = on;
    el.classList.toggle(cls, on);
  }
}

/** 1234 -> 1.23K, 640000 -> 640K, 2000000 -> 2M (only zeros after a decimal point are trimmed). */
export function fmtNum(n) {
  n = Math.floor(Math.max(0, n || 0));
  if (n < 1000) return String(n);
  for (const [u, v] of [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]]) {
    if (n >= v * 0.9995) {
      const x = n / v;
      const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + u;
    }
  }
  return String(n);
}

export const money = (n) => '$' + fmtNum(n);

export function clock(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** HUD buttons should never keep keyboard focus (Space would re-click them instead of jumping). */
export function noFocus(el) {
  el.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('click', () => el.blur());
  return el;
}

/** Mute = music and sfx volume to 0 (the previous levels are remembered and restored on unmute). */
export function setMuted(app, muted) {
  muted = !!muted;
  if (muted === !!settings.muted) return;
  if (muted) {
    save('ui:unmute', { music: settings.music, sfx: settings.sfx });
    setSetting('muted', true);
    setSetting('music', 0);
    setSetting('sfx', 0);
  } else {
    const prev = load('ui:unmute', null) || {};
    setSetting('muted', false);
    if (!settings.music) setSetting('music', prev.music || 0.6);
    if (!settings.sfx) setSetting('sfx', prev.sfx || 0.8);
  }
  try {
    app.audio?.setMuted?.(muted);
  } catch {
    /* audio is optional */
  }
}

export function uiSound(app, name) {
  try {
    app.audio?.play?.(name);
  } catch {
    /* sound is optional */
  }
}

/** Screen direction (radians, clockwise from "up") of a world point relative to the camera yaw. */
export function screenAngle(from, to, camYaw) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const fwd = dx * Math.sin(camYaw) + dz * Math.cos(camYaw);
  const right = -dx * Math.cos(camYaw) + dz * Math.sin(camYaw);
  return Math.atan2(right, fwd);
}

export const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
