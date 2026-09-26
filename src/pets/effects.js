// Gameplay effect of an equipped pet. OWNER: pets agent. Contract (docs/ONLINE.md):
// petMods(petId|null) -> {income, speed, hold, magnet, bonkCd}
//   income/speed: multipliers (1 = none); hold: multiplier on grab/steal/sell hold time (<1 = faster);
//   magnet: extra studs of collect-pad radius; bonkCd: multiplier on the bonk cooldown (<1 = faster).
// Values are clamped to safe ranges so a bad catalog edit (or odd data from the network) can never
// break the game: speed <= +15% (road monsters must stay a threat), hold/bonkCd >= 0.75, magnet <= 4.
import { PET } from './catalog.js';

const NONE = Object.freeze({ income: 1, speed: 1, hold: 1, magnet: 0, bonkCd: 1 });
const LIMITS = { income: [1, 1.5], speed: [1, 1.15], hold: [0.75, 1], magnet: [0, 4], bonkCd: [0.75, 1] };
const cache = new Map();

const clamp = (v, [a, b], d) => (Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);

export function petMods(petId) {
  const m = petId && PET[petId]?.mods;
  if (!m) return NONE;
  let out = cache.get(petId);
  if (!out) {
    out = Object.freeze({
      income: clamp(m.income, LIMITS.income, 1),
      speed: clamp(m.speed, LIMITS.speed, 1),
      hold: clamp(m.hold, LIMITS.hold, 1),
      magnet: clamp(m.magnet, LIMITS.magnet, 0),
      bonkCd: clamp(m.bonkCd, LIMITS.bonkCd, 1),
    });
    cache.set(petId, out);
  }
  return out;
}
