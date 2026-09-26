// Pet species and eggs. OWNER: pets agent (see docs/ONLINE.md). The integrator's game rules read
// PETS/EGGS/PET only through the fields documented here.
//   PET: {id, name, rarity ('common'|'rare'|'epic'|'legendary'|'mythic'), boost (short text),
//         mods: {income?, speed?, hold?, magnet?, bonkCd?}}
//         (+ UI extras: flies, blurb)
//   EGG: {id, name, price (cash), odds: [[petId, weight], ...]}   (+ UI extras: blurb, colors)
//
// Balance notes (see config.js):
// * Speed boosts stay small (max +12%) so Speed Shop levels remain THE way to out-run road monsters:
//   the best pet saves ~2 levels against the Star Lurker (38 studs/s) and nothing at max level.
// * income multiplies every plant's pay (and so net worth); hold multiplies grab/steal/sell hold time;
//   magnet widens the COLLECT pad (radius 2.6); bonkCd multiplies the 0.8 s noodle cooldown.
// * Egg prices span the economy: Garden ~3-4 minutes into a fresh garden (4 Commons pay ~$14/s),
//   Jungle once Rare/Epic plants pay, Volcano in the Legendary era, Galaxy is a post-rebirth goal.
//   Pets live on the profile, so they survive rebirths and carry into every game.

export const PET_CAPACITY = 30;

export const PETS = [
  // ---- common
  { id: 'bunny', name: 'Bunny', rarity: 'common', boost: '+4% speed', mods: { speed: 1.04 }, blurb: 'Hop hop hooray!' },
  { id: 'chick', name: 'Chick', rarity: 'common', boost: '+5% income', mods: { income: 1.05 }, blurb: 'Tiny, fluffy, loves seeds.' },
  { id: 'hamster', name: 'Hamster', rarity: 'common', boost: 'Grabs 5% faster', mods: { hold: 0.95 }, blurb: 'Stuffs its cheeks with snacks.' },
  { id: 'frog', name: 'Frog', rarity: 'common', boost: 'Cash magnet +1', mods: { magnet: 1 }, blurb: 'Ribbit! Catches coins with its tongue.' },
  // ---- rare
  { id: 'kitty', name: 'Kitty', rarity: 'rare', boost: 'Grabs 10% faster', mods: { hold: 0.9 }, blurb: 'Sneaky paws, speedy steals.' },
  { id: 'puppy', name: 'Puppy', rarity: 'rare', boost: '+10% income', mods: { income: 1.1 }, blurb: 'A very good garden dog.' },
  { id: 'bee', name: 'Bumble Bee', rarity: 'rare', boost: 'Bonks 12% faster', mods: { bonkCd: 0.88 }, blurb: 'Buzz off, seed thieves!', flies: true },
  // ---- epic
  { id: 'fox', name: 'Fox', rarity: 'epic', boost: '+7% speed, grabs 8% faster', mods: { speed: 1.07, hold: 0.92 }, blurb: 'Quick and clever.' },
  { id: 'panda', name: 'Panda', rarity: 'epic', boost: '+15% income', mods: { income: 1.15 }, blurb: 'Munches bamboo, grows money.' },
  { id: 'owl', name: 'Night Owl', rarity: 'epic', boost: 'Bonks 15% faster, magnet +2', mods: { bonkCd: 0.85, magnet: 2 }, blurb: 'Sees every sneaky thief.', flies: true },
  // ---- legendary
  { id: 'unicorn', name: 'Unicorn', rarity: 'legendary', boost: '+10% speed, +10% income', mods: { speed: 1.1, income: 1.1 }, blurb: 'Leaves a trail of sparkles.' },
  { id: 'dragon', name: 'Dragon', rarity: 'legendary', boost: '+22% income, bonks 12% faster', mods: { income: 1.22, bonkCd: 0.88 }, blurb: 'Guards your garden gold.', flies: true },
  // ---- mythic
  { id: 'phoenix', name: 'Phoenix', rarity: 'mythic', boost: '+25% income, +12% speed', mods: { income: 1.25, speed: 1.12 }, blurb: 'Born from Emberroot flames.', flies: true },
  { id: 'axolotl', name: 'Golden Axolotl', rarity: 'mythic', boost: '+30% income, grabs 20% faster, magnet +3', mods: { income: 1.3, hold: 0.8, magnet: 3 }, blurb: 'The rarest smile in Starbloom.', flies: true },
];
export const PET = Object.assign(Object.create(null), Object.fromEntries(PETS.map((p) => [p.id, p])));

export const EGGS = [
  {
    id: 'garden', name: 'Garden Egg', price: 1000, blurb: 'Cute critters from the Sunny Field.',
    colors: ['#fff6df', '#7bd35a'],
    odds: [['bunny', 30], ['chick', 28], ['hamster', 22], ['frog', 15], ['kitty', 3.5], ['puppy', 1.5]],
  },
  {
    id: 'jungle', name: 'Jungle Egg', price: 25000, blurb: 'Rustles with rare friends.',
    colors: ['#3fbf5a', '#ffd23f'],
    odds: [['frog', 10], ['kitty', 26], ['puppy', 24], ['bee', 22], ['fox', 10], ['panda', 8]],
  },
  {
    id: 'volcano', name: 'Volcano Egg', price: 400000, blurb: 'Warm to the touch... is it moving?',
    colors: ['#3a1f1a', '#ff7a1a'],
    odds: [['fox', 31], ['panda', 27], ['owl', 25], ['dragon', 15], ['phoenix', 2]],
  },
  {
    id: 'galaxy', name: 'Galaxy Egg', price: 5000000, blurb: 'Fell from the Starbloom sky.',
    colors: ['#2a1b5c', '#ff66d9'],
    odds: [['owl', 22], ['unicorn', 36], ['dragon', 26], ['phoenix', 9], ['axolotl', 7]],
  },
];
export const EGG = Object.assign(Object.create(null), Object.fromEntries(EGGS.map((e) => [e.id, e])));

// ------------------------------------------------------------------ helpers for the UI

export const PET_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];
export const rarityRank = (r) => PET_RARITIES.indexOf(r);

/** An egg's odds as percentages: [{pet, pct}] (pets that exist, most likely first). */
export function eggOdds(eggId) {
  const e = EGG[eggId];
  if (!e) return [];
  const valid = e.odds.filter(([id, w]) => PET[id] && w > 0);
  const total = valid.reduce((a, [, w]) => a + w, 0) || 1;
  return valid.map(([id, w]) => ({ pet: PET[id], pct: (w / total) * 100 }));
}

/** "30%", "3.5%", "0.5%" */
export const fmtPct = (p) => (p >= 10 ? Math.round(p) + '%' : (Math.round(p * 10) / 10).toString() + '%');

/** One line per boost, for cards: [{kind, text}] (kind: income|speed|hold|magnet|bonkCd). */
export function boostLines(pet) {
  const m = pet?.mods || {};
  const out = [];
  const pct = (v) => Math.round(Math.abs(v - 1) * 100);
  if (m.income && m.income !== 1) out.push({ kind: 'income', text: `+${pct(m.income)}% income` });
  if (m.speed && m.speed !== 1) out.push({ kind: 'speed', text: `+${pct(m.speed)}% speed` });
  if (m.hold && m.hold !== 1) out.push({ kind: 'hold', text: `Grabs ${pct(m.hold)}% faster` });
  if (m.bonkCd && m.bonkCd !== 1) out.push({ kind: 'bonkCd', text: `Bonks ${pct(m.bonkCd)}% faster` });
  if (m.magnet) out.push({ kind: 'magnet', text: `Cash magnet +${m.magnet}` });
  return out;
}

/** Rough "how good is it" score for sorting and Equip Best (rarity first, then boost size). */
export function petScore(petId) {
  const p = PET[petId];
  if (!p) return -1;
  const m = p.mods || {};
  const s = ((m.income || 1) - 1) * 1.2 + ((m.speed || 1) - 1) * 1.5 + (1 - (m.hold || 1)) + (1 - (m.bonkCd || 1)) * 0.6 + (m.magnet || 0) * 0.03;
  return rarityRank(p.rarity) * 10 + s;
}
