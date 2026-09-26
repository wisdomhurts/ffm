// Detects touch devices (coarse pointer, or the first real touch) and marks <html class="is-touch">.
const subs = new Set();
let touch = false;
try {
  touch = matchMedia('(pointer: coarse)').matches;
} catch {
  /* very old browsers */
}

function mark() {
  document.documentElement.classList.toggle('is-touch', touch);
}
mark();

window.addEventListener('touchstart', () => {
  if (touch) return;
  touch = true;
  mark();
  subs.forEach((fn) => fn(true));
}, { passive: true, capture: true });

export const isTouch = () => touch;

export function onTouchChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
