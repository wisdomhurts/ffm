// Full screen toggle (Fullscreen API with the webkit fallbacks). Owned by the UI shell (menus agent).
// fsAvailable() is false on iPhone Safari (no Fullscreen API for pages) and in sandboxed iframes such as
// the claude.ai artifact viewer: callers hide their button then (iPhones get an "Add to Home Screen" tip).
import { h, noFocus } from './dom.js';
import { ICON } from './icons.js';

const doc = document;

export const fsAvailable = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
export const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

/** iPhone / iPod (and iPads that report as Macs), not already launched from the Home Screen. */
export function iosNeedsHomeScreen() {
  try {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPod|iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
    return ios && !standalone && !fsAvailable();
  } catch {
    return false;
  }
}

export const IOS_TIP = 'iPhone tip: Share → Add to Home Screen to play full screen.';

/** Must be called from the click / pointer handler itself (browsers need the user gesture). */
export function toggleFullscreen() {
  try {
    const el = doc.documentElement;
    let p;
    if (isFullscreen()) p = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.();
    else if (el.requestFullscreen) p = el.requestFullscreen({ navigationUI: 'hide' });
    else p = el.webkitRequestFullscreen?.();
    p?.catch?.(() => {});
  } catch {
    /* refused (no gesture, iframe policy): nothing to do */
  }
}

/** Calls fn(isFullscreen) whenever full screen starts or ends (our button, Esc, the browser UI). */
export function onFullscreenChange(fn) {
  const cb = () => fn(isFullscreen());
  doc.addEventListener('fullscreenchange', cb);
  doc.addEventListener('webkitfullscreenchange', cb);
  return () => {
    doc.removeEventListener('fullscreenchange', cb);
    doc.removeEventListener('webkitfullscreenchange', cb);
  };
}

/**
 * A round/square icon button that toggles full screen and keeps its icon + label in sync.
 * Returns null when full screen isn't available (callers simply skip it). Call `button._dispose()` when
 * it goes away. `bind(el, fn)` lets the HUD attach its own pointer handling (second-finger safe);
 * the default is a click handler.
 */
export function fullscreenButton(cls, { bind, onToggle, hud = false } = {}) {
  if (!fsAvailable()) return null;
  const b = h('button', { class: cls + ' fs-btn', type: 'button' });
  // HUD buttons never keep focus (Space would press them again instead of jumping)
  if (hud) noFocus(b);
  const paint = (on) => {
    b.innerHTML = on ? ICON.collapse : ICON.expand;
    b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    b.title = on ? 'Exit full screen' : 'Full screen';
    b.classList.toggle('on', on);
  };
  paint(isFullscreen());
  const act = () => {
    onToggle?.();
    toggleFullscreen();
  };
  if (bind) bind(b, act);
  else b.addEventListener('click', act);
  const off = onFullscreenChange(paint);
  b._dispose = off;
  return b;
}
