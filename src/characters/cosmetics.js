// Cosmetics catalog for the Wardrobe (docs/ONLINE.md "Customization").
//
// Look = { build: 'adult'|'kid', skin, hair, hairColor, shirt, shirtColor, shirtColor2, pants, shoes,
//          hat: null|id, face: 'photo'|expression, acc: null|id, noodle: null|'#hex', trail: null|id,
//          // optional extras (older looks without them keep working):
//          legs: 'jeans'|'pants'|'shorts'|'skirt' (default: from the shirt, as the family wore it),
//          hatColor, accColor: '#hex' (tintable hats/accessories), num: 0..99 (jersey number) }
//
// Items: { id, name, price (stars, 0 = free starter item), unlock? (badge id: owning the badge unlocks it;
// with a price it can also be bought), ...render data }. Owned ids live in profile.unlocks as
// '<cat>:<id>' (unlockKey). Everything renders from ids, so looks travel over the network as plain data;
// sanitizeLook() cleans anything that arrives from outside.
import { CHARACTER, CHARACTERS } from '../config.js';

// ------------------------------------------------------------------ colour palettes

export const COLORS = {
  cloth: [
    '#ffffff', '#c9ced8', '#4a4f5c', '#1d1d1d', '#e8323c', '#ff6b5a', '#ff8a1a', '#ffd23f', '#9be34a', '#2fb84f', '#8ff0d8',
    '#1ec8a5', '#5cc8ff', '#2f80ed', '#2b3a55', '#8a5cc8', '#c9a6ff', '#ff4f9a', '#ffb3d1', '#8a5a34', '#c8b48a',
  ],
  hair: ['#17110f', '#3a2a20', '#5a3b28', '#8a4b2a', '#c8642a', '#e2b85c', '#f3e3b5', '#b9b9c4', '#e8323c', '#ff6fb5', '#9b5cff', '#3d9bff', '#2fd6a0'],
  skin: ['#f7d7c4', '#eec1a4', '#e0ac8a', '#d19a82', '#c98d78', '#b87a5a', '#9c6444', '#7d4a30', '#5c3622', '#3f2518', '#f5cd30'],
  noodle: ['#ff4f9a', '#2f80ed', '#9b5cff', '#1ec8a5', '#ffd23f', '#ff8a1a', '#e8323c', '#63d45a', '#5cc8ff', '#ffffff', '#1d1d1d', '#ffb3d1'],
  shoes: ['#ffffff', '#1d1d1d', '#e8323c', '#ff8a1a', '#ffd23f', '#2fb84f', '#1ec8a5', '#2f80ed', '#8a5cc8', '#ff4f9a', '#8a5a34', '#f2d0b8'],
};

// ------------------------------------------------------------------ items

export const BUILDS = [
  { id: 'adult', name: 'Grown-up', price: 0 },
  { id: 'kid', name: 'Kid', price: 0 },
];

// fit: how hats sit on this hair: {lift: how far the hair's top sits above the head, s: hat scale,
// capLift: for styles with tall parts (bun, spikes, crest, the crown of curls), the height of the hair
// under them: hats sit there; covering hats hide the tall parts, open ones (crowns) let them poke
// through}. sling: which way the noodle is slung ('long' = further off the back, over hair that falls
// down it). The head's painted sides/back per style live in outfits.js (HEAD_PAINT).
export const HAIR = [
  { id: 'short', name: 'Crew Cut', price: 0, fit: { lift: 0.08, s: 1.04 }, sling: 'short' },
  { id: 'short-thick', name: 'Mop Top', price: 0, fit: { lift: 0.4, s: 1.13 }, sling: 'short' },
  { id: 'long', name: 'Long Hair', price: 0, fit: { lift: 0.2, s: 1.1 }, sling: 'long' },
  { id: 'buzz', name: 'Buzz Cut', price: 0, fit: { lift: 0.03, s: 1.02 }, sling: 'short' },
  { id: 'bald', name: 'Shiny Bald', price: 0, fit: { lift: 0, s: 1 }, sling: 'short' },
  { id: 'ponytail', name: 'Ponytail', price: 10, fit: { lift: 0.18, s: 1.08 }, sling: 'long' },
  { id: 'bob', name: 'Bob', price: 10, fit: { lift: 0.24, s: 1.12 }, sling: 'short' },
  { id: 'pigtails', name: 'Pigtails', price: 15, fit: { lift: 0.18, s: 1.08 }, sling: 'short' },
  { id: 'bun', name: 'Top Bun', price: 15, fit: { lift: 0.62, s: 1.08, capLift: 0.18 }, sling: 'short' },
  { id: 'spiky', name: 'Spiky', price: 20, fit: { lift: 0.62, s: 1.1, capLift: 0.3 }, sling: 'short' },
  { id: 'curly', name: 'Big Curls', price: 20, fit: { lift: 0.62, s: 1.3, capLift: 0.3 }, sling: 'short' },
  { id: 'mohawk', name: 'Mohawk', price: 30, fit: { lift: 0.08, s: 1.03, capLift: 0.04 }, sling: 'short' },
];

// sleeve: studs of sleeve from the top of the arm (0 = sleeveless); legs: default legwear.
export const SHIRTS = [
  { id: 'tee', name: 'T-Shirt', price: 0, sleeve: 0.9 },
  { id: 'stripes', name: 'Striped Tee', price: 0, sleeve: 0.9 },
  { id: 'tank', name: 'Tank Top', price: 0, sleeve: 0 },
  { id: 'hawaiian', name: 'Hawaiian Shirt', price: 0, sleeve: 0.8, legs: 'shorts' },
  { id: 'floral', name: 'Floral Jacket', price: 0, sleeve: 1.72 },
  { id: 'faceprint', name: 'Family Face Shirt', price: 0, sleeve: 0.85 },
  { id: 'dress', name: 'Party Dress', price: 0, sleeve: 0, legs: 'skirt' },
  { id: 'hoodie', name: 'Hoodie', price: 10, sleeve: 1.85 },
  { id: 'jersey', name: 'Sports Jersey', price: 15, sleeve: 0.75 },
  { id: 'sweater', name: 'Cozy Sweater', price: 15, sleeve: 1.85 },
  { id: 'overalls', name: 'Overalls', price: 20, sleeve: 0.9 },
  { id: 'suit', name: 'Fancy Suit', price: 30, sleeve: 1.85 },
];

export const LEGS = [
  { id: 'jeans', name: 'Jeans', price: 0 },
  { id: 'pants', name: 'Trousers', price: 0 },
  { id: 'shorts', name: 'Shorts', price: 0 },
  { id: 'skirt', name: 'Skirt', price: 0 },
];

// h: how far the hat reaches above the head top (tall hats tuck away while carrying a pot);
// covers: sits over the hair (tall hair parts are hidden under it); tint: default colour (tintable).
export const HATS = [
  { id: 'cap', name: 'Baseball Cap', price: 0, tint: '#e8323c', covers: true, h: 0.35 },
  { id: 'beanie', name: 'Beanie', price: 0, tint: '#2f80ed', covers: true, h: 0.55 },
  { id: 'party', name: 'Party Hat', price: 10, tint: '#ff4f9a', covers: true, h: 1.5 },
  { id: 'flowers', name: 'Flower Crown', price: 15, h: 0.3 },
  { id: 'headphones', name: 'Headphones', price: 15, tint: '#ff4f9a', h: 0.3 },
  { id: 'bunny', name: 'Bunny Ears', price: 20, h: 1.7 },
  { id: 'cowboy', name: 'Cowboy Hat', price: 20, tint: '#b07a3e', covers: true, h: 0.95 },
  { id: 'propeller', name: 'Propeller Cap', price: 25, covers: true, h: 0.9 },
  { id: 'tophat', name: 'Top Hat', price: 30, tint: '#23232b', covers: true, h: 1.45 },
  { id: 'wizard', name: 'Wizard Hat', price: 35, tint: '#5b3fc4', covers: true, h: 2.1 },
  { id: 'viking', name: 'Viking Helmet', price: 40, unlock: 'thief2', covers: true, h: 1.1 },
  { id: 'crown', name: 'Royal Crown', price: 60, unlock: 'champ1', h: 0.85 },
  { id: 'halo', name: 'Halo', price: 50, unlock: 'generous', h: 0.9 },
];

// at: where it attaches ('face' on the head front, 'neck', 'back'); back items push the slung noodle
// a little further off the back.
export const ACCS = [
  { id: 'sunglasses', name: 'Sunglasses', price: 0, at: 'face' },
  { id: 'roundglasses', name: 'Smart Glasses', price: 0, at: 'face' },
  { id: 'starglasses', name: 'Star Glasses', price: 15, at: 'face' },
  { id: 'mustache', name: 'Mustache', price: 10, at: 'face' },
  { id: 'bowtie', name: 'Bow Tie', price: 10, tint: '#e8323c', at: 'neck' },
  { id: 'scarf', name: 'Scarf', price: 15, tint: '#e8323c', at: 'neck' },
  { id: 'lei', name: 'Flower Lei', price: 15, at: 'neck' },
  { id: 'backpack', name: 'Backpack', price: 20, tint: '#ff8a1a', at: 'back' },
  { id: 'cape', name: 'Super Cape', price: 30, tint: '#e8323c', at: 'back' },
  { id: 'wings', name: 'Fairy Wings', price: 45, unlock: 'secret', at: 'back' },
];

// Cartoon expressions for players without a photo (or who pick one). 'photo' = the Photo Booth /
// family photo when there is one (falls back to 'smile').
export const FACES = [
  { id: 'photo', name: 'My Photo', price: 0 },
  { id: 'smile', name: 'Smile', price: 0 },
  { id: 'grin', name: 'Big Grin', price: 0 },
  { id: 'happy', name: 'Happy', price: 0 },
  { id: 'wink', name: 'Wink', price: 0 },
  { id: 'cool', name: 'Cool', price: 5 },
  { id: 'surprised', name: 'Surprised', price: 5 },
  { id: 'silly', name: 'Silly', price: 5 },
  { id: 'shy', name: 'Shy', price: 10 },
  { id: 'determined', name: 'Determined', price: 10 },
  { id: 'starry', name: 'Starstruck', price: 15 },
  { id: 'sleepy', name: 'Sleepy', price: 10 },
];

export const TRAILS = [
  { id: 'sparkles', name: 'Sparkles', price: 15 },
  { id: 'hearts', name: 'Hearts', price: 15 },
  { id: 'bubbles', name: 'Bubbles', price: 15 },
  { id: 'leaves', name: 'Leaves', price: 15 },
  { id: 'fire', name: 'Fire', price: 40, unlock: 'chaos' },
  { id: 'rainbow', name: 'Rainbow', price: 50, unlock: 'rainbow' },
];

/** The catalog, by category (contract shape plus the extras the Wardrobe uses). */
export const COSMETICS = { builds: BUILDS, hair: HAIR, shirts: SHIRTS, legs: LEGS, hats: HATS, accs: ACCS, faces: FACES, trails: TRAILS, colors: COLORS };

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const HAIR_BY_ID = byId(HAIR);
export const SHIRT_BY_ID = byId(SHIRTS);
export const LEGS_BY_ID = byId(LEGS);
export const HAT_BY_ID = byId(HATS);
export const ACC_BY_ID = byId(ACCS);
export const FACE_BY_ID = byId(FACES);
export const TRAIL_BY_ID = byId(TRAILS);

// Look field -> {cat (unlock prefix), items}
export const SLOTS = {
  build: { cat: 'build', items: BUILDS },
  hair: { cat: 'hair', items: HAIR },
  shirt: { cat: 'shirt', items: SHIRTS },
  legs: { cat: 'legs', items: LEGS },
  hat: { cat: 'hat', items: HATS },
  acc: { cat: 'acc', items: ACCS },
  face: { cat: 'face', items: FACES },
  trail: { cat: 'trail', items: TRAILS },
};

// ------------------------------------------------------------------ ownership

export const unlockKey = (cat, id) => cat + ':' + id;

export function findItem(cat, id) {
  const s = Object.values(SLOTS).find((x) => x.cat === cat);
  return s?.items.find((x) => x.id === id) || null;
}

/** Owned: free starter items, bought ones (profile.unlocks) and badge rewards (profile.badges). */
export function isOwned(profile, cat, id) {
  if (id == null) return true;
  const it = findItem(cat, id);
  if (!it) return false;
  if (!it.price && !it.unlock) return true;
  if (profile?.unlocks?.includes(unlockKey(cat, id))) return true;
  return !!(it.unlock && profile?.badges?.[it.unlock]);
}

/** Every item in a look the profile doesn't own yet: [{field, cat, item}]. */
export function unownedParts(profile, look) {
  const out = [];
  for (const [field, s] of Object.entries(SLOTS)) {
    const id = look[field];
    if (id == null || isOwned(profile, s.cat, id)) continue;
    const item = s.items.find((x) => x.id === id);
    if (item) out.push({ field, cat: s.cat, item });
  }
  return out;
}

// ------------------------------------------------------------------ looks

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, def) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def);

/** Which legwear a look shows (older looks have no `legs`: derived from the shirt as the family wore it). */
export function legsOf(look) {
  if (look.shirt === 'dress') return 'dress';
  if (LEGS_BY_ID[look.legs]) return look.legs;
  return SHIRT_BY_ID[look.shirt]?.legs || 'jeans';
}

/** The base family character's default look (the exact outfit from config.js). */
export function baseLook(base) {
  const c = CHARACTER[base] || CHARACTERS[0];
  return { ...c.look, hat: null, acc: null, face: 'photo', noodle: null, trail: null };
}

/**
 * A complete, valid Look from anything (profiles, the network, older saves). Unknown ids fall back to
 * the base character's look; colours must be '#rrggbb'.
 */
export function sanitizeLook(look, base = CHARACTERS[0].id) {
  const d = baseLook(base);
  const l = look && typeof look === 'object' ? look : {};
  const pick = (v, map, def) => (typeof v === 'string' && map[v] ? v : def);
  const out = {
    build: l.build === 'kid' || l.build === 'adult' ? l.build : d.build,
    skin: hex(l.skin, d.skin),
    hair: pick(l.hair, HAIR_BY_ID, d.hair),
    hairColor: hex(l.hairColor, d.hairColor),
    shirt: pick(l.shirt, SHIRT_BY_ID, d.shirt),
    shirtColor: hex(l.shirtColor, d.shirtColor),
    shirtColor2: hex(l.shirtColor2, d.shirtColor2),
    pants: hex(l.pants, d.pants),
    shoes: hex(l.shoes, d.shoes),
    hat: l.hat == null ? null : pick(l.hat, HAT_BY_ID, null),
    face: pick(l.face, FACE_BY_ID, 'photo'),
    acc: l.acc == null ? null : pick(l.acc, ACC_BY_ID, null),
    noodle: l.noodle == null ? null : hex(l.noodle, null),
    trail: l.trail == null ? null : pick(l.trail, TRAIL_BY_ID, null),
  };
  if (LEGS_BY_ID[l.legs]) out.legs = l.legs;
  if (l.hatColor != null) out.hatColor = hex(l.hatColor, undefined);
  if (l.accColor != null) out.accColor = hex(l.accColor, undefined);
  if (Number.isFinite(l.num)) out.num = Math.max(0, Math.min(99, Math.round(l.num)));
  for (const k of ['hatColor', 'accColor']) if (out[k] === undefined) delete out[k];
  return out;
}

/** Same outfit? (ignores key order and missing optional fields) */
export function sameLook(a, b) {
  if (!a || !b) return a === b;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? null) !== (b[k] ?? null)) return false;
  return true;
}

const pickOf = (arr, r) => arr[Math.floor(r() * arr.length)];

/**
 * A random outfit from what the profile owns (keeps build and skin; Randomize in the Wardrobe).
 * `r` = () => 0..1 (Math.random by default).
 */
export function randomLook(profile, current, r = Math.random) {
  const own = (cat, list) => list.filter((it) => isOwned(profile, cat, it.id));
  const c = current || baseLook(profile?.base);
  const cloth = COLORS.cloth;
  let c1 = pickOf(cloth, r);
  let c2 = pickOf(cloth, r);
  while (c2 === c1) c2 = pickOf(cloth, r);
  const shirt = pickOf(own('shirt', SHIRTS), r).id;
  const look = {
    ...c,
    hair: pickOf(own('hair', HAIR), r).id,
    hairColor: r() < 0.75 ? pickOf(COLORS.hair.slice(0, 8), r) : pickOf(COLORS.hair, r),
    shirt,
    shirtColor: c1,
    shirtColor2: c2,
    legs: pickOf(own('legs', LEGS), r).id,
    pants: pickOf(['#2b3a55', '#3b4b8a', '#1d1d1d', '#c8b48a', '#8a5a34', '#4a4f5c', ...cloth], r),
    shoes: pickOf(COLORS.shoes, r),
    hat: r() < 0.6 ? pickOf(own('hat', HATS), r).id : null,
    hatColor: pickOf(cloth, r),
    acc: r() < 0.5 ? pickOf(own('acc', ACCS), r).id : null,
    accColor: pickOf(cloth, r),
    noodle: r() < 0.5 ? pickOf(COLORS.noodle, r) : null,
    trail: r() < 0.4 ? own('trail', TRAILS).map((t) => t.id).concat([null])[Math.floor(r() * (own('trail', TRAILS).length + 1))] : c.trail,
  };
  if (c.face !== 'photo' || r() < 0.3) look.face = pickOf(own('face', FACES).filter((f) => f.id !== 'photo'), r).id;
  if (shirt === 'jersey') look.num = Math.floor(r() * 99) + 1;
  return look;
}
