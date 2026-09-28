// Pet species and eggs. OWNER: pets agent (see docs/ONLINE.md). The integrator's game rules read
// PETS/EGGS/PET only through the fields documented here.
//   PET: {id, name, rarity ('common'|'rare'|'epic'|'legendary'|'mythic'|'divine'), boost (short text),
//         mods: {income?, speed?, hold?, magnet?, bonkCd?, grow?}}
//         (+ UI extras: flies, blurb, egg: the egg it hatches from)
//   EGG: {id, name, price (cash), odds: [[petId, weight], ...], shop (sold at the stand; false = egg drops only)}
//         (+ UI extras: blurb, colors)
//
// Balance notes (see config.js):
// * Speed boosts stay small (max +12%) so Speed Shop levels remain THE way to out-run road monsters:
//   the best pet saves ~2 levels against the Star Lurker (38 studs/s) and nothing at max level.
// * income multiplies every plant's pay (and so net worth); hold multiplies grab/steal/sell hold time;
//   magnet widens the COLLECT pad (radius 2.6); bonkCd multiplies the 0.8 s noodle cooldown; grow speeds up
//   the owner's growing plants (1.1 = 10% faster).
// * Up to three pets can be equipped (slots open at Base Lv 1/4/8); their boosts stack (effects.js teamMods).
// * Egg prices span the economy: Garden ~3-4 minutes into a fresh garden (4 Commons pay ~$14/s),
//   Jungle once Rare/Epic plants pay, Volcano in the Legendary era, Galaxy is a post-rebirth goal. Farm sits
//   between Garden and Jungle; Ocean between Jungle and Volcano; Frost, Candy and Cloud are for the far worlds.
//   The Rainbow Egg is never sold: it only falls as an egg drop (DROPS in config.js).
//   Pets live on the profile, so they survive rebirths and carry into every game.

export const PET_CAPACITY = 60;

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
  // ---- Farm Egg
  { id: 'piglet', name: 'Piglet', rarity: 'common', boost: '+6% income', mods: { income: 1.06 }, blurb: 'Oinks at every coin.' },
  { id: 'lamb', name: 'Lamb', rarity: 'common', boost: 'Plants grow 5% faster', mods: { grow: 1.05 }, blurb: 'Fluffy and very sleepy.' },
  { id: 'calf', name: 'Calf', rarity: 'rare', boost: '+8% income, plants grow 5% faster', mods: { income: 1.08, grow: 1.05 }, blurb: 'Moo-ves the crops along.' },
  { id: 'pony', name: 'Pony', rarity: 'epic', boost: '+8% speed', mods: { speed: 1.08 }, blurb: 'Gallops like the wind.' },
  // ---- Ocean Egg
  { id: 'turtle', name: 'Sea Turtle', rarity: 'rare', boost: 'Grabs 10% faster, plants grow 5% faster', mods: { hold: 0.9, grow: 1.05 }, blurb: 'Slow and steady wins the seed.' },
  { id: 'octopus', name: 'Octopus', rarity: 'epic', boost: 'Grabs 15% faster', mods: { hold: 0.85 }, blurb: 'Eight arms, zero dropped seeds.' },
  { id: 'dolphin', name: 'Dolphin', rarity: 'legendary', boost: '+10% speed, +10% income', mods: { speed: 1.1, income: 1.1 }, blurb: 'Clicks, whistles and zooms!', flies: true },
  { id: 'narwhal', name: 'Narwhal', rarity: 'mythic', boost: '+25% income, magnet +3', mods: { income: 1.25, magnet: 3 }, blurb: 'The unicorn of the sea.', flies: true },
  // ---- Frost Egg
  { id: 'penguin', name: 'Penguin', rarity: 'epic', boost: '+12% income, grabs 8% faster', mods: { income: 1.12, hold: 0.92 }, blurb: 'Slides everywhere on its tummy.' },
  { id: 'polarbear', name: 'Polar Bear', rarity: 'legendary', boost: '+22% income', mods: { income: 1.22 }, blurb: 'A big, warm, fluffy hug.' },
  { id: 'yeticub', name: 'Yeti Cub', rarity: 'legendary', boost: 'Bonks 20% faster, +8% speed', mods: { bonkCd: 0.8, speed: 1.08 }, blurb: 'Snowball fights every day.' },
  { id: 'icedragon', name: 'Ice Dragon', rarity: 'mythic', boost: '+30% income, plants grow 10% faster', mods: { income: 1.3, grow: 1.1 }, blurb: 'Breathes sparkly snowflakes.', flies: true },
  // ---- Candy Egg
  { id: 'donutpup', name: 'Donut Pup', rarity: 'epic', boost: '+14% income', mods: { income: 1.14 }, blurb: 'Sprinkles on everything.' },
  { id: 'cupcakecat', name: 'Cupcake Cat', rarity: 'legendary', boost: '+18% income, grabs 12% faster', mods: { income: 1.18, hold: 0.88 }, blurb: 'Frosting whiskers!' },
  { id: 'cottonsheep', name: 'Cotton Candy Sheep', rarity: 'legendary', boost: 'Plants grow 15% faster, magnet +2', mods: { grow: 1.15, magnet: 2 }, blurb: 'Soft as a cloud of sugar.', flies: true },
  { id: 'gummydragon', name: 'Gummy Dragon', rarity: 'mythic', boost: '+32% income, +10% speed', mods: { income: 1.32, speed: 1.1 }, blurb: 'Chewy, fruity and fearless.', flies: true },
  // ---- Cloud Egg
  { id: 'cloudbunny', name: 'Cloud Bunny', rarity: 'legendary', boost: '+20% income, +8% speed', mods: { income: 1.2, speed: 1.08 }, blurb: 'Hops from cloud to cloud.', flies: true },
  { id: 'angelcat', name: 'Angel Kitty', rarity: 'mythic', boost: '+35% income, grabs 15% faster', mods: { income: 1.35, hold: 0.85 }, blurb: 'Purrs like a tiny harp.', flies: true },
  { id: 'pegasus', name: 'Pegasus', rarity: 'divine', boost: '+40% income, +12% speed', mods: { income: 1.4, speed: 1.12 }, blurb: 'Wings of pure starlight.', flies: true },
  { id: 'sunlion', name: 'Sun Lion', rarity: 'divine', boost: '+45% income, bonks 20% faster', mods: { income: 1.45, bonkCd: 0.8 }, blurb: 'Roars sunshine.' },
  // ---- Rainbow Egg (egg drops only)
  { id: 'rainbowjelly', name: 'Rainbow Jelly', rarity: 'legendary', boost: 'Magnet +3, plants grow 10% faster', mods: { magnet: 3, grow: 1.1 }, blurb: 'Wobbles in every colour.', flies: true },
  { id: 'prismfox', name: 'Prism Fox', rarity: 'mythic', boost: '+28% income, +12% speed', mods: { income: 1.28, speed: 1.12 }, blurb: 'Leaves rainbows in its paw prints.' },
  { id: 'rainbowdragon', name: 'Rainbow Dragon', rarity: 'divine', boost: '+50% income, plants grow 15% faster', mods: { income: 1.5, grow: 1.15 }, blurb: 'The rarest egg-drop legend.', flies: true },
];
export const PET = Object.assign(Object.create(null), Object.fromEntries(PETS.map((p) => [p.id, p])));

export const EGGS = [
  {
    id: 'garden', name: 'Garden Egg', price: 1000, blurb: 'Cute critters from the Sunny Field.',
    colors: ['#fff6df', '#7bd35a'],
    odds: [['bunny', 30], ['chick', 28], ['hamster', 22], ['frog', 15], ['kitty', 3.5], ['puppy', 1.5]],
  },
  {
    id: 'farm', name: 'Farm Egg', price: 8000, blurb: 'Moo! Baa! Oink!',
    colors: ['#fff3d6', '#e0564a'],
    odds: [['piglet', 36], ['lamb', 34], ['calf', 24], ['pony', 6]],
  },
  {
    id: 'jungle', name: 'Jungle Egg', price: 25000, blurb: 'Rustles with rare friends.',
    colors: ['#3fbf5a', '#ffd23f'],
    odds: [['frog', 10], ['kitty', 26], ['puppy', 24], ['bee', 22], ['fox', 10], ['panda', 8]],
  },
  {
    id: 'ocean', name: 'Ocean Egg', price: 150_000, blurb: 'Washed up on the beach. Splash!',
    colors: ['#4fd1ff', '#1f5fd0'],
    odds: [['turtle', 44], ['octopus', 38], ['dolphin', 16], ['narwhal', 2]],
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
  {
    id: 'frost', name: 'Frost Egg', price: 30_000_000, blurb: 'Found frozen in Frostfall.',
    colors: ['#e6f7ff', '#5fc8ff'],
    odds: [['penguin', 40], ['polarbear', 34], ['yeticub', 20], ['icedragon', 6]],
  },
  {
    id: 'candy', name: 'Candy Egg', price: 150_000_000, blurb: 'Smells like strawberry frosting.',
    colors: ['#ffc2e0', '#8fe3ff'],
    odds: [['donutpup', 40], ['cupcakecat', 32], ['cottonsheep', 22], ['gummydragon', 6]],
  },
  {
    id: 'cloud', name: 'Cloud Egg', price: 750_000_000, blurb: 'Floated down from Cloud Kingdom.',
    colors: ['#ffffff', '#ffe75e'],
    odds: [['cloudbunny', 42], ['angelcat', 36], ['pegasus', 16], ['sunlion', 6]],
  },
  {
    id: 'rainbow', name: 'Rainbow Egg', price: 0, shop: false, blurb: 'Only falls from the sky as an egg drop!',
    colors: ['#ff5c8a', '#5cc8ff'],
    odds: [['rainbowjelly', 50], ['prismfox', 38], ['rainbowdragon', 12]],
  },
];
for (const e of EGGS) {
  e.shop = e.shop !== false;
  for (const [id] of e.odds) if (PET[id] && !PET[id].egg) PET[id].egg = e.id;
}
export const EGG = Object.assign(Object.create(null), Object.fromEntries(EGGS.map((e) => [e.id, e])));
/** The eggs sold at the PET EGGS stand (cheapest first). */
export const SHOP_EGGS = EGGS.filter((e) => e.shop).sort((a, b) => a.price - b.price);

// ------------------------------------------------------------------ helpers for the UI

export const PET_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic', 'divine'];
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

/** One line per boost, for cards: [{kind, text}] (kind: income|speed|hold|magnet|bonkCd|grow). */
export function boostLines(pet) {
  const m = pet?.mods || {};
  const out = [];
  const pct = (v) => Math.round(Math.abs(v - 1) * 100);
  if (m.income && m.income !== 1) out.push({ kind: 'income', text: `+${pct(m.income)}% income` });
  if (m.speed && m.speed !== 1) out.push({ kind: 'speed', text: `+${pct(m.speed)}% speed` });
  if (m.hold && m.hold !== 1) out.push({ kind: 'hold', text: `Grabs ${pct(m.hold)}% faster` });
  if (m.bonkCd && m.bonkCd !== 1) out.push({ kind: 'bonkCd', text: `Bonks ${pct(m.bonkCd)}% faster` });
  if (m.magnet) out.push({ kind: 'magnet', text: `Cash magnet +${m.magnet}` });
  if (m.grow && m.grow !== 1) out.push({ kind: 'grow', text: `Plants grow ${pct(m.grow)}% faster` });
  return out;
}

/** Rough "how good is it" score for sorting and Equip Best (rarity first, then boost size). */
export function petScore(petId) {
  const p = PET[petId];
  if (!p) return -1;
  const m = p.mods || {};
  const s = ((m.income || 1) - 1) * 1.2 + ((m.speed || 1) - 1) * 1.5 + (1 - (m.hold || 1)) + (1 - (m.bonkCd || 1)) * 0.6 + (m.magnet || 0) * 0.03 + ((m.grow || 1) - 1);
  return rarityRank(p.rarity) * 10 + s;
}
