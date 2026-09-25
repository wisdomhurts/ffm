// Pet species and eggs. OWNER: pets agent (see docs/ONLINE.md). The integrator's game rules read
// PETS/EGGS/PET only through the fields documented here.
//   PET: {id, name, rarity ('common'|'rare'|'epic'|'legendary'|'mythic'), boost (short text),
//         mods: {income?, speed?, hold?, magnet?, bonkCd?}}
//   EGG: {id, name, price (cash), odds: [[petId, weight], ...]}
export const PETS = [
  { id: 'bunny', name: 'Bunny', rarity: 'common', boost: '+5% speed', mods: { speed: 1.05 } },
  { id: 'chick', name: 'Chick', rarity: 'common', boost: '+5% income', mods: { income: 1.05 } },
  { id: 'kitty', name: 'Kitty', rarity: 'rare', boost: 'Faster grabs', mods: { hold: 0.85 } },
  { id: 'puppy', name: 'Puppy', rarity: 'rare', boost: '+10% income', mods: { income: 1.1 } },
  { id: 'fox', name: 'Fox', rarity: 'epic', boost: '+12% speed', mods: { speed: 1.12 } },
  { id: 'dragon', name: 'Dragon', rarity: 'legendary', boost: '+25% income', mods: { income: 1.25 } },
];
export const PET = Object.fromEntries(PETS.map((p) => [p.id, p]));

export const EGGS = [
  { id: 'garden', name: 'Garden Egg', price: 2000, odds: [['bunny', 45], ['chick', 45], ['kitty', 6], ['puppy', 4]] },
  { id: 'jungle', name: 'Jungle Egg', price: 150000, odds: [['kitty', 40], ['puppy', 40], ['fox', 18], ['dragon', 2]] },
];
export const EGG = Object.fromEntries(EGGS.map((e) => [e.id, e]));
