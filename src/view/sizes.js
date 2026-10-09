// Giant Harvests and Family Hero on screen (view/gameView.js reads these):
//   sizeOf(plant)              the plant's size id ('normal' for growing plants and anything unknown)
//   shownSize(plant, now)      what size to draw: a fresh Big / GIANT / TITAN stays normal through its drumroll
//                              (REVEAL seconds after markReveal), then pops up to its size
//   markReveal(uid, at)        start a plant's drumroll (fx/giants.js does, on 'plant:grown'); `at` = game time it pops
//   sizeChip(size)             the size chip on a plant label ('' for normal)
//   heroRibbon(p, now)         the gold HERO ribbon over a name tag while p.heroUntil runs ('' otherwise)
//   addTitanBeam(view, mutation)   the light beam over a TITAN plant: a child of its view, so it goes when the view goes
// Styles for the chip and the ribbon: injectSizeStyles() (fx/giants.js calls it once).
import { SIZES } from '../config.js';
import { createGlowBeam } from '../pets/dropView.js';

export const REVEAL = 1.2;
const reveals = new Map(); // plant uid -> game time its size shows

const known = (s) => typeof s === 'string' && Object.prototype.hasOwnProperty.call(SIZES, s);
export const sizeOf = (plant) => (plant && known(plant.size) ? plant.size : 'normal');

export function markReveal(uid, at) {
  reveals.set(uid, at);
  if (reveals.size > 32) reveals.delete(reveals.keys().next().value);
}

export function shownSize(plant, now) {
  const size = sizeOf(plant);
  if (size === 'normal' || !reveals.size) return size;
  const at = reveals.get(plant.uid);
  if (at == null) return size;
  // done, or a stale entry (the clock jumped, an online host changed)
  if (now >= at || at - now > REVEAL + 1) {
    reveals.delete(plant.uid);
    return size;
  }
  return 'normal';
}

const CHIPS = Object.fromEntries(Object.values(SIZES).map((s) => [s.id, s.name ? `<span class="sz sz-${s.id}">${s.name}</span>` : '']));
export const sizeChip = (size) => CHIPS[known(size) ? size : 'normal'];

const RIBBON = '<div class="nt-hero">HERO</div>';
export const heroRibbon = (p, now) => (now < (p.heroUntil || 0) ? RIBBON : '');

/** The TITAN light beam (the egg drops' beam shader), riding on the plant view's root (`soil`: how high the
 *  view's origin sits above the ground; the beam's ring lies on the ground round the planter). */
export function addTitanBeam(view, mutation, soil = 1.2) {
  const k = view.object3d.scale.x || 1; // the view is scaled up by its size: undo it across, keep it up the beam
  const rainbow = mutation === 'rainbow';
  const beam = createGlowBeam(rainbow ? '#ff5c8a' : mutation === 'diamond' ? '#7ee8ff' : '#ffd23f', '#ffffff', {
    rainbow,
    y: () => (view.topY + soil) / k, // the plant's crown, in the beam's own units
  });
  beam.object3d.scale.set(1.3 / k, 1, 1.3 / k);
  beam.object3d.position.y = -soil / k;
  view.object3d.add(beam.object3d);
  return beam;
}

let injected = false;
export function injectSizeStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'sas-sizes';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
/* Giant Harvests: the size chip on a plant label (next to the mutation chip) */
.plantlbl .sz{display:inline-block;margin:0 3px 2px 0;padding:1px 7px 2px;border-radius:9px;font:900 11px/1.15 var(--fd,system-ui);letter-spacing:.06em;
  color:#10163a;background:linear-gradient(180deg,#d8ffb8,#7fd65a);box-shadow:0 2px 0 rgba(10,14,40,.45);text-transform:uppercase;vertical-align:middle}
.plantlbl .sz-giant{background:linear-gradient(180deg,#fff2a8,#ff9f1a);font-size:12.5px}
.plantlbl .sz-titan{color:#fff;background:linear-gradient(90deg,#ff4d6d,#ff9f1a,#ffe94d,#4cd964,#3dc9ff,#b36bff);font-size:13.5px;
  text-shadow:0 1px 0 rgba(10,14,40,.7);animation:szTitan 1.6s ease-in-out infinite}
@keyframes szTitan{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
/* Family Hero: the gold HERO ribbon over a name tag */
.nametag .nt-hero{display:table;margin:0 auto 3px;padding:2px 12px 3px;font:900 12px/1 var(--fd,system-ui);letter-spacing:.14em;color:#4a2a00;
  background:linear-gradient(180deg,#fff3a0,#ffc21f 55%,#e8930c);border-radius:4px;box-shadow:0 2px 0 rgba(10,14,40,.5),inset 0 0 0 1.5px rgba(255,255,255,.55);
  clip-path:polygon(0 0,100% 0,94% 50%,100% 100%,0 100%,6% 50%);animation:ntHero 1.2s ease-in-out infinite}
@keyframes ntHero{0%,100%{filter:brightness(1)}50%{filter:brightness(1.25)}}
@media (prefers-reduced-motion:reduce){.plantlbl .sz-titan,.nametag .nt-hero{animation:none}}
`;
