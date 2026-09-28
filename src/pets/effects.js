// Gameplay effect of equipped pets. OWNER: pets agent. Contract (docs/ONLINE.md):
// petMods(petId|null) -> {income, speed, hold, magnet, bonkCd, grow}
//   income/speed/grow: multipliers (1 = none); hold: multiplier on grab/steal/sell hold time (<1 = faster);
//   magnet: extra studs of collect-pad radius; bonkCd: multiplier on the bonk cooldown (<1 = faster).
// teamMods([petId...]) -> the same shape for a team of up to 3 equipped pets: multipliers multiply,
//   magnets add, and the totals are capped (TEAM) so no team can break the game.
// Values are clamped to safe ranges so a bad catalog edit (or odd data from the network) can never
// break the game: one pet's speed <= +15% (road monsters must stay a threat), hold/bonkCd >= 0.75, magnet <= 4.
import { PET } from './catalog.js';

const NONE = Object.freeze({ income: 1, speed: 1, hold: 1, magnet: 0, bonkCd: 1, grow: 1 });
const LIMITS = { income: [1, 1.5], speed: [1, 1.15], hold: [0.75, 1], magnet: [0, 4], bonkCd: [0.75, 1], grow: [1, 1.25] };
const TEAM = { income: [1, 2.5], speed: [1, 1.3], hold: [0.6, 1], magnet: [0, 6], bonkCd: [0.6, 1], grow: [1, 1.5] };
export const MAX_TEAM = 3;
const cache = new Map();
const teamCache = new Map();

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
      grow: clamp(m.grow, LIMITS.grow, 1),
    });
    cache.set(petId, out);
  }
  return out;
}

/** Combined boosts of a team (the first MAX_TEAM valid pet ids). */
export function teamMods(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => id && PET[id]).slice(0, MAX_TEAM);
  if (!list.length) return NONE;
  if (list.length === 1) return petMods(list[0]);
  const key = list.join('|');
  let out = teamCache.get(key);
  if (!out) {
    const t = { income: 1, speed: 1, hold: 1, magnet: 0, bonkCd: 1, grow: 1 };
    for (const id of list) {
      const m = petMods(id);
      t.income *= m.income;
      t.speed *= m.speed;
      t.hold *= m.hold;
      t.magnet += m.magnet;
      t.bonkCd *= m.bonkCd;
      t.grow *= m.grow;
    }
    out = Object.freeze(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, clamp(v, TEAM[k], NONE[k])])));
    teamCache.set(key, out);
  }
  return out;
}
