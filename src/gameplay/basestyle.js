// Base Studio choices: sanitizing what a player picked (it arrives from saves and the network) and working
// out what their garden actually shows at its base level (anything above the level falls back to the default).
import { BASE, BASE_STYLES, DEFAULT_BASE_STYLE, decorSpotsFor } from '../config.js';

const byId = (list) => Object.assign(Object.create(null), Object.fromEntries(list.map((x) => [x.id, x])));
export const FLOOR = byId(BASE_STYLES.floors);
export const FENCE = byId(BASE_STYLES.fences);
export const LASER = byId(BASE_STYLES.lasers);
export const DECOR = byId(BASE_STYLES.decor);
export const DECOR_SPOTS = BASE.decorAt.length;

const pick = (table, id, d) => (typeof id === 'string' && table[id] ? id : d);

/** A clean style object: known ids only, exactly DECOR_SPOTS decoration slots. */
export function sanitizeBaseStyle(s) {
  const o = s && typeof s === 'object' ? s : {};
  const decor = Array.from({ length: DECOR_SPOTS }, (_, i) => pick(DECOR, Array.isArray(o.decor) ? o.decor[i] : null, null));
  return {
    floor: pick(FLOOR, o.floor, DEFAULT_BASE_STYLE.floor),
    fence: pick(FENCE, o.fence, DEFAULT_BASE_STYLE.fence),
    laser: pick(LASER, o.laser, DEFAULT_BASE_STYLE.laser),
    decor,
  };
}

export const sameBaseStyle = (a, b) =>
  !!a && !!b && a.floor === b.floor && a.fence === b.fence && a.laser === b.laser && a.decor.length === b.decor.length && a.decor.every((d, i) => d === b.decor[i]);

/** What a garden at `level` shows for `style`: locked choices fall back to the defaults, locked spots stay empty. */
export function effectiveBaseStyle(style, level) {
  const s = sanitizeBaseStyle(style);
  const L = Math.max(1, level | 0);
  const ok = (item) => item && item.min <= L;
  const spots = decorSpotsFor(L);
  return {
    floor: ok(FLOOR[s.floor]) ? s.floor : DEFAULT_BASE_STYLE.floor,
    fence: ok(FENCE[s.fence]) ? s.fence : DEFAULT_BASE_STYLE.fence,
    laser: ok(LASER[s.laser]) ? s.laser : DEFAULT_BASE_STYLE.laser,
    decor: s.decor.map((d, i) => (i < spots && d && ok(DECOR[d]) ? d : null)),
  };
}

// The look each family bot builds towards as its base levels up (online, their garden shows whatever
// the level allows).
export const BOT_STYLES = {
  dorian: { floor: 'stone', fence: 'castle', laser: 'blue', decor: ['fountain', 'oak', 'lamp', 'statue', 'windmill', 'rocket'] },
  esther: { floor: 'meadow', fence: 'hedge', laser: 'pink', decor: ['flowerbed', 'pethouse', 'hottub', 'gnome', 'rainbowarch', 'candytree'] },
  maddie: { floor: 'space', fence: 'neon', laser: 'purple', decor: ['trampoline', 'lamp', 'rocket', 'campfire', 'rainbowarch', 'snowman'] },
  micah: { floor: 'beach', fence: 'picket', laser: 'green', decor: ['palm', 'hottub', 'campfire', 'trampoline', 'palm', 'gnome'] },
};
