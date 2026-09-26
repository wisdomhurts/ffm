// Simple HUD for small screens (older iPhones, any phone with the browser's bars showing): marks
// <html class="hud-simple"> and the CSS in ui/styles.js trims the HUD down to what you need while playing:
// the family board becomes a row of faces (tap for the full board), cash and the next goal take one line
// each, the quest tracker is just its ring, the road meter steps aside, the hotbar shows only items you
// have, and the thumb buttons get a little smaller. settings.hudLayout: 'auto' (small screens only),
// 'simple' (always) or 'full' (never).
import { settings } from '../core/settings.js';
import { bus } from '../core/events.js';

// "small": a phone on its side, or a narrow portrait screen that's short (browser bars eat the height)
const SMALL = ['(orientation: landscape) and (max-height: 420px)', '(orientation: portrait) and (max-width: 500px) and (max-height: 700px)'];

let simple = null;
let watching = false;

const query = (q) => {
  try {
    return matchMedia(q);
  } catch {
    return null;
  }
};

export function wantsSimple() {
  if (settings.hudLayout === 'simple') return true;
  if (settings.hudLayout === 'full') return false;
  return SMALL.some((q) => query(q)?.matches);
}

export const isSimpleHud = () => !!simple;

function apply() {
  const next = wantsSimple();
  if (next === simple) return;
  simple = next;
  document.documentElement.classList.toggle('hud-simple', simple);
  bus.emit('hud:layout', { simple });
}

/** Call once at startup: keeps the class in step with the screen size and the setting. */
export function watchHudLayout() {
  apply();
  if (watching) return;
  watching = true;
  for (const q of SMALL) {
    const m = query(q);
    if (!m) continue;
    if (m.addEventListener) m.addEventListener('change', apply);
    else m.addListener?.(apply);
  }
  window.addEventListener('resize', apply);
  bus.on('settings:changed', ({ key }) => key === 'hudLayout' && apply());
}
