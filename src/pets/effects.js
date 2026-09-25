// Gameplay effect of an equipped pet. OWNER: pets agent. Contract (docs/ONLINE.md):
// petMods(petId|null) -> {income, speed, hold, magnet, bonkCd}
//   income/speed: multipliers (1 = none); hold: multiplier on grab/steal/sell hold time (<1 = faster);
//   magnet: extra studs of collect-pad radius; bonkCd: multiplier on the bonk cooldown (<1 = faster).
import { PET } from './catalog.js';

const NONE = Object.freeze({ income: 1, speed: 1, hold: 1, magnet: 0, bonkCd: 1 });

export function petMods(petId) {
  const m = petId && PET[petId]?.mods;
  if (!m) return NONE;
  return { ...NONE, ...m };
}
