// Full screen on every kind of screen. Owned by the UI shell (menus agent). fsMode() says which kind we have:
//   'api'  the Fullscreen API (computers, Android, iPad): the buttons toggle it, and touch screens also go
//          full screen by themselves when a game starts (settings.autoFullscreen).
//   'home' iPhone: Safari has no Fullscreen API for pages. Games added to the Home Screen open without
//          Safari's bars (build.mjs writes the web app manifest + icons), so the buttons open a short
//          "Add to Home Screen" guide instead (callers pass `onHelp`).
//   'none' already full screen (opened from the Home Screen), or a frame that doesn't allow it (such as the
//          claude.ai artifact viewer): callers skip their button.
import { h, noFocus } from './dom.js';
import { ICON } from './icons.js';
import { settings } from '../core/settings.js';

const doc = document;

export const fsAvailable = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
export const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

const media = (q) => {
  try {
    return matchMedia(q).matches;
  } catch {
    return false;
  }
};

/** Touch-first screens (phones, tablets): where the browser's bars eat the most room. */
const touchFirst = () => media('(hover: none) and (pointer: coarse)');

/** iPhone / iPod / iPad (iPads can report as Macs). */
export function isIOS() {
  try {
    const ua = navigator.userAgent || '';
    return /iPhone|iPod|iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch {
    return false;
  }
}

/** Opened from a Home Screen icon: iOS web apps, or an installed app with display "fullscreen". */
export function launchedFullscreen() {
  // (display-mode: fullscreen) also matches while our own button has the page full screen: not "launched"
  if (isFullscreen()) return false;
  try {
    if (navigator.standalone === true) return true;
  } catch {
    /* ignore */
  }
  // (display-mode: fullscreen) also matches a computer's F11 browser full screen: only phones/tablets count
  return (touchFirst() && media('(display-mode: fullscreen)')) || (isIOS() && media('(display-mode: standalone)'));
}

function framed() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** 'api' | 'home' | 'none' (see the top of this file). */
export function fsMode() {
  if (launchedFullscreen()) return 'none';
  if (fsAvailable()) return 'api';
  if (isIOS() && !framed()) return 'home';
  return 'none';
}

/** True on iPhones where "Add to Home Screen" is the way to play full screen. */
export const iosNeedsHomeScreen = () => fsMode() === 'home';

export const IOS_TIP = 'On iPhone, add the game to your Home Screen (Share → Add to Home Screen) to play full screen.';

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

/** The "Full screen when playing" setting applies here (and Settings only shows it here). */
export const autoFullscreenApplies = () => fsMode() === 'api' && touchFirst();

/**
 * Called as a game starts: phones and tablets go full screen by themselves (settings.autoFullscreen).
 * Only while the tap that started the game still counts as a user gesture; otherwise it quietly does nothing.
 */
export function autoFullscreen() {
  if (!settings.autoFullscreen || isFullscreen() || !autoFullscreenApplies()) return;
  try {
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
  } catch {
    /* ignore */
  }
  toggleFullscreen();
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
 * A round/square icon button that toggles full screen and keeps its icon + label in sync. On iPhones it
 * opens the Home Screen guide instead (`onHelp`). Returns null when there's nothing to offer (callers simply
 * skip it). Call `button._dispose()` when it goes away. `bind(el, fn)` lets the HUD attach its own pointer
 * handling (second-finger safe); the default is a click handler.
 */
export function fullscreenButton(cls, { bind, onToggle, onHelp, hud = false } = {}) {
  const mode = fsMode();
  if (mode === 'none' || (mode === 'home' && !onHelp)) return null;
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
    if (mode === 'home') onHelp();
    else toggleFullscreen();
  };
  if (bind) bind(b, act);
  else b.addEventListener('click', act);
  const off = mode === 'api' ? onFullscreenChange(paint) : () => {};
  b._dispose = off;
  return b;
}
