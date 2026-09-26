// Daily quest templates, badges and the reward maths. Pure data + helpers (no DOM), so Node tests can use it.
// OWNER: progress agent (docs/ONLINE.md "Progress").
//
// Quests listen to "facts" the tracker derives from bus events for the LOCAL player:
//   seed {tier, mutation} · plant {tier, mutation} · grow · sell · cash {amount} · steal {victim} · foil
//   bonk {target} · monster · item {item} · water · speed {level} · rebirth · planter · lock · hatch {rarity}
//   emote {id} · chat · gift · trade · online · showdown {rank, win, difficulty} · slip · splash
//   biome {index} (max) · networth {value} (max)
// A template: {id, tier, group, icon, on, amount?(data,p), max?(data,p), when?(data,p), gate?(ctx), make(ctx,rng) -> {target,p?}, text(target,p)}
// `money: true` marks quests whose numbers are cash (the UI formats them as $). Targets that depend on the
// player's progress stage are re-fitted at game start while the quest is still untouched (tracker.js).
import { BIOMES, RARITIES, CHARACTERS, CHARACTER, PLANTS, PLAYER, REBIRTH, speedAt } from '../config.js';
import { EGGS } from '../pets/catalog.js';
import { EMOTE, QUICK_CHAT } from '../social/catalog.js';

export const TIERS = {
  easy: { id: 'easy', name: 'Easy', stars: 5, secs: 60, minCash: 250 },
  medium: { id: 'medium', name: 'Medium', stars: 10, secs: 120, minCash: 500 },
  hard: { id: 'hard', name: 'Hard', stars: 20, secs: 240, minCash: 1000 },
};
export const TIER_ORDER = ['easy', 'medium', 'hard'];
/** Finishing all three quests of a day opens the Daily Chest. */
export const BONUS = { stars: 25, secs: 240, minCash: 1500 };

// ------------------------------------------------------------------ progress estimate

const AVG_INCOME = {};
for (const p of PLANTS) if (!p.family) (AVG_INCOME[p.rarity] ||= []).push(p.income);
for (const k of Object.keys(AVG_INCOME)) AVG_INCOME[k] = AVG_INCOME[k].reduce((a, b) => a + b, 0) / AVG_INCOME[k].length;
const PLANTERS_AT_STAGE = [4, 5, 6, 7, 8, 9];

/**
 * How deep up the Seed Road this player can farm: the last biome whose monster they outrun while
 * carrying a seed (Normal difficulty). 0 = Sunny Field ... 5 = Starbloom.
 */
export function stageOf(speedLevel = 0, rebirths = 0) {
  const carry = speedAt(speedLevel, rebirths) * PLAYER.carrySeedMult;
  let reach = 0;
  for (let i = 1; i < BIOMES.length; i++) {
    if (BIOMES[i].monster && carry > BIOMES[i].monster.speed + 1e-6) reach = i;
    else break;
  }
  return reach;
}

/** A rough "cash per second" for a player at this stage (used to scale money targets and rewards). */
export function incomeEstimate(stage, rebirths = 0) {
  const s = Math.max(0, Math.min(BIOMES.length - 1, stage | 0));
  return (AVG_INCOME[BIOMES[s].rarity] || 3) * PLANTERS_AT_STAGE[s] * REBIRTH.incomeMult(rebirths);
}

/** Round to a friendly number: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 x 10^k. */
export function nice(x) {
  if (!(x > 0)) return 0;
  const k = Math.pow(10, Math.floor(Math.log10(x)));
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const f = x / k;
  let best = steps[0];
  for (const s of steps) if (Math.abs(s - f) < Math.abs(best - f)) best = s;
  return Math.round(best * k);
}

/** Short money string for quest text ($1.5K, $2M). */
export function cashText(n) {
  n = Math.floor(n);
  if (n < 1000) return '$' + n;
  for (const [u, v] of [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]]) {
    if (n >= v) {
      const x = n / v;
      const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      // trim zeros after the decimal point only ($100K must stay $100K)
      return '$' + (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s) + u;
    }
  }
  return '$' + n;
}

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const rarityName = (t) => RARITIES[t]?.name || 'Rare';
const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const otherFamily = (ctx, rng) => {
  const list = CHARACTERS.filter((c) => c.id !== ctx.base);
  return (rng ? rng.pick(list) : list[0]).id;
};
const famName = (id) => CHARACTER[id]?.name || 'someone';

// ------------------------------------------------------------------ quest templates

export const QUESTS = [
  // ---------------- easy
  { id: 'grab', tier: 'easy', group: 'seed', icon: 'seed', on: 'seed', make: () => ({ target: 6 }), text: (n) => `Grab ${plural(n, 'seed')}` },
  { id: 'plant5', tier: 'easy', group: 'plant', icon: 'sprout', on: 'plant', make: () => ({ target: 5 }), text: (n) => `Plant ${plural(n, 'seed')}` },
  { id: 'sell', tier: 'easy', group: 'sell', icon: 'coin', on: 'sell', make: () => ({ target: 3 }), text: (n) => `Sell ${plural(n, 'grown plant')}` },
  { id: 'collectS', tier: 'easy', group: 'cash', icon: 'coin', on: 'cash', money: true, amount: (d) => d.amount,
    make: (ctx) => ({ target: Math.max(500, nice(ctx.inc * 120)) }), text: (n) => `Collect ${cashText(n)} from your garden` },
  { id: 'bonk4', tier: 'easy', group: 'bonk', icon: 'noodle', on: 'bonk', make: () => ({ target: 4 }), text: (n) => `Bonk ${plural(n, 'player')} with your noodle` },
  { id: 'items', tier: 'easy', group: 'items', icon: 'balloon', on: 'item', make: () => ({ target: 3 }), text: (n) => `Use ${plural(n, 'item')} from the Gear Shop` },
  { id: 'lock', tier: 'easy', group: 'lock', icon: 'lock', on: 'lock', make: () => ({ target: 2 }), text: (n) => `Lock your garden ${n === 1 ? 'once' : n + ' times'}` },
  { id: 'wave', tier: 'easy', group: 'social', icon: 'wave', on: 'emote', when: (d) => d.id === 'wave', gate: () => !!EMOTE.wave,
    make: () => ({ target: 1 }), text: () => 'Wave at someone' },
  { id: 'dance', tier: 'easy', group: 'social', icon: 'dance', on: 'emote', when: (d) => /^dance/.test(d.id), gate: () => !!EMOTE.dance1,
    make: () => ({ target: 2 }), text: (n) => `Dance ${n === 1 ? 'once' : n + ' times'}` },
  { id: 'chat', tier: 'easy', group: 'social', icon: 'chat', on: 'chat', gate: () => QUICK_CHAT.length > 0, make: () => ({ target: 3 }), text: (n) => `Send ${plural(n, 'quick chat')}` },
  { id: 'monster2', tier: 'easy', group: 'monster', icon: 'monster', on: 'monster', make: () => ({ target: 2 }), text: (n) => `Bonk ${plural(n, 'road monster')}` },
  { id: 'water', tier: 'easy', group: 'water', icon: 'bucket', on: 'water', make: () => ({ target: 1 }), text: () => 'Water a growing plant with a bucket' },
  { id: 'visit', tier: 'easy', group: 'explore', icon: 'compass', on: 'biome', max: (d, p) => (d.index >= p ? 1 : 0),
    make: (ctx) => ({ target: 1, p: Math.min(BIOMES.length - 1, Math.max(2, ctx.stage + 2)) }), text: (n, p) => `Visit ${BIOMES[p].name}` },

  // ---------------- medium
  { id: 'plant10', tier: 'medium', group: 'plant', icon: 'sprout', on: 'plant', make: () => ({ target: 10 }), text: (n) => `Plant ${plural(n, 'seed')}` },
  { id: 'grow', tier: 'medium', group: 'grow', icon: 'sprout', on: 'grow', make: () => ({ target: 6 }), text: (n) => `Grow ${plural(n, 'plant')} to full size` },
  { id: 'collectM', tier: 'medium', group: 'cash', icon: 'coin', on: 'cash', money: true, amount: (d) => d.amount,
    make: (ctx) => ({ target: Math.max(1000, nice(ctx.inc * 300)) }), text: (n) => `Collect ${cashText(n)} from your garden` },
  { id: 'steal2', tier: 'medium', group: 'steal', icon: 'mask', on: 'steal', make: () => ({ target: 2 }), text: (n) => `Steal ${plural(n, 'plant')}` },
  { id: 'stealFrom', tier: 'medium', group: 'steal', icon: 'mask', on: 'steal', when: (d, p) => d.victim === p,
    make: (ctx, rng) => ({ target: 1, p: otherFamily(ctx, rng) }), text: (n, p) => `Steal a plant from ${famName(p)}` },
  { id: 'foil2', tier: 'medium', group: 'foil', icon: 'shield', on: 'foil', make: () => ({ target: 2 }), text: (n) => `Stop ${plural(n, 'thief', 'thieves')}` },
  { id: 'bonkWho', tier: 'medium', group: 'bonk', icon: 'noodle', on: 'bonk', when: (d, p) => d.target === p,
    make: (ctx, rng) => ({ target: 3, p: otherFamily(ctx, rng) }), text: (n, p) => `Bonk ${famName(p)} ${n === 1 ? 'once' : n + ' times'}` },
  { id: 'grabTier', tier: 'medium', group: 'seed', icon: 'seed', on: 'seed', when: (d, p) => d.tier >= p,
    make: (ctx) => ({ target: 1, p: Math.min(5, ctx.stage + 1) }), text: (n, p) => `Grab ${an(rarityName(p))} seed${p < 5 ? ' or better' : ''}` },
  { id: 'mutant', tier: 'medium', group: 'mutant', icon: 'diamond', on: 'seed', when: (d) => d.mutation && d.mutation !== 'normal',
    make: () => ({ target: 1 }), text: () => 'Grab a Gold, Diamond or Rainbow seed' },
  { id: 'speed2', tier: 'medium', group: 'speed', icon: 'bolt', on: 'speed', gate: (ctx) => ctx.speedLevel <= PLAYER.maxSpeedLevel - 2,
    make: () => ({ target: 2 }), text: (n) => `Buy ${plural(n, 'Speed level')}` },
  { id: 'hatch', tier: 'medium', group: 'pets', icon: 'egg', on: 'hatch', gate: (ctx) => ctx.pets && ctx.stage >= 1,
    make: () => ({ target: 1 }), text: () => 'Hatch a pet egg' },
  { id: 'monster5', tier: 'medium', group: 'monster', icon: 'monster', on: 'monster', make: () => ({ target: 5 }), text: (n) => `Bonk ${plural(n, 'road monster')}` },
  { id: 'slip', tier: 'medium', group: 'items', icon: 'banana', on: 'slip', make: () => ({ target: 2 }), text: (n) => `Make ${plural(n, 'player')} slip on your bananas` },
  { id: 'splash', tier: 'medium', group: 'items', icon: 'balloon', on: 'splash', make: () => ({ target: 2 }), text: (n) => `Splash ${plural(n, 'player')} with water balloons` },
  { id: 'online', tier: 'medium', group: 'social', icon: 'family', on: 'online', gate: (ctx) => ctx.online,
    make: () => ({ target: 1 }), text: () => 'Play online with a friend' },
  { id: 'podium', tier: 'medium', group: 'showdown', icon: 'trophy', on: 'showdown', when: (d) => d.rank <= 2,
    make: () => ({ target: 1 }), text: () => 'Finish a Family Showdown in the top 2' },

  // ---------------- hard
  { id: 'steal5', tier: 'hard', group: 'steal', icon: 'mask', on: 'steal', make: () => ({ target: 5 }), text: (n) => `Steal ${plural(n, 'plant')}` },
  { id: 'collectL', tier: 'hard', group: 'cash', icon: 'coin', on: 'cash', money: true, amount: (d) => d.amount,
    make: (ctx) => ({ target: Math.max(2500, nice(ctx.inc * 800)) }), text: (n) => `Collect ${cashText(n)} from your garden` },
  { id: 'foil4', tier: 'hard', group: 'foil', icon: 'shield', on: 'foil', make: () => ({ target: 4 }), text: (n) => `Stop ${plural(n, 'thief', 'thieves')}` },
  { id: 'bonk15', tier: 'hard', group: 'bonk', icon: 'noodle', on: 'bonk', make: () => ({ target: 15 }), text: (n) => `Bonk ${plural(n, 'player')} with your noodle` },
  { id: 'plantTier', tier: 'hard', group: 'seed', icon: 'sprout', on: 'plant', when: (d, p) => d.tier >= p,
    make: (ctx) => ({ target: 1, p: Math.min(5, ctx.stage + 1) }), text: (n, p) => `Plant ${an(rarityName(p))} seed${p < 5 ? ' or better' : ''}` },
  { id: 'grow12', tier: 'hard', group: 'grow', icon: 'sprout', on: 'grow', make: () => ({ target: 12 }), text: (n) => `Grow ${plural(n, 'plant')} to full size` },
  { id: 'win', tier: 'hard', group: 'showdown', icon: 'trophy', on: 'showdown', when: (d) => d.win, make: () => ({ target: 1 }), text: () => 'Win a Family Showdown' },
  { id: 'speed4', tier: 'hard', group: 'speed', icon: 'bolt', on: 'speed', gate: (ctx) => ctx.speedLevel <= PLAYER.maxSpeedLevel - 4,
    make: () => ({ target: 4 }), text: (n) => `Buy ${plural(n, 'Speed level')}` },
  { id: 'monster10', tier: 'hard', group: 'monster', icon: 'monster', on: 'monster', make: () => ({ target: 10 }), text: (n) => `Bonk ${plural(n, 'road monster')}` },
  { id: 'mutantPlant', tier: 'hard', group: 'mutant', icon: 'rainbow', on: 'plant', when: (d) => d.mutation && d.mutation !== 'normal',
    make: () => ({ target: 1 }), text: () => 'Plant a Gold, Diamond or Rainbow seed' },
  { id: 'rebirth', tier: 'hard', group: 'rebirth', icon: 'crown', on: 'rebirth', gate: (ctx) => ctx.netWorth >= 0.45 * REBIRTH.threshold(ctx.rebirths),
    make: () => ({ target: 1 }), text: () => 'Rebirth at the Rebirth Altar' },
];
export const QUEST = Object.assign(Object.create(null), Object.fromEntries(QUESTS.map((q) => [q.id, q])));
/** A player's very first quests follow the tutorial (grab, plant, steal); tier = the reward level. */
export const STARTER = [{ id: 'grab', tier: 'easy' }, { id: 'plant10', tier: 'medium' }, { id: 'steal2', tier: 'hard' }];

/** Everything a template needs to pick its target: {stage, rebirths, speedLevel, inc, netWorth, base, online, pets}. */
export function questContext({ speedLevel = 0, rebirths = 0, netWorth = 0, base = CHARACTERS[0].id, online = false } = {}) {
  const stage = stageOf(speedLevel, rebirths);
  return { stage, rebirths, speedLevel, netWorth, base, online, pets: EGGS.length > 0, inc: incomeEstimate(stage, rebirths) };
}

/** Rewards for a quest of this tier at this progress stage. */
export function questReward(tier, ctx) {
  const t = TIERS[tier] || TIERS.easy;
  return { stars: t.stars, cash: Math.max(t.minCash, nice(ctx.inc * t.secs)) };
}

export function bonusReward(ctx) {
  return { stars: BONUS.stars, cash: Math.max(BONUS.minCash, nice(ctx.inc * BONUS.secs)) };
}

// ------------------------------------------------------------------ badges
// A badge family has one or more tiers; each tier is its own badge id (family id, or id + tier number).
// stat(c, best, profile) reads the lifetime counters (see tracker.js COUNTERS).

const unlocks = (c, b, p) => (Array.isArray(p?.unlocks) ? p.unlocks.length : 0);

export const BADGES = [
  { id: 'firstseed', name: 'First Seed', icon: 'seed', stat: (c) => c.seeds, tiers: [1], stars: [5], how: () => 'Grab your first seed on the Seed Road' },
  { id: 'firststeal', name: 'First Heist', icon: 'mask', stat: (c) => c.steals, tiers: [1], stars: [10], how: () => 'Steal a plant and get it home' },
  { id: 'thief', name: 'Master Thief', icon: 'mask', stat: (c) => c.steals, tiers: [10, 100, 1000], stars: [15, 40, 100], how: (n) => `Steal ${n} plants` },
  { id: 'green', name: 'Green Thumb', icon: 'sprout', stat: (c) => c.planted, tiers: [10, 100, 1000], stars: [10, 25, 80], how: (n) => `Plant ${n} seeds` },
  { id: 'guardian', name: 'Guardian', icon: 'shield', stat: (c) => c.foils, tiers: [10, 50, 250], stars: [20, 50, 120], how: (n) => `Stop ${n} thieves` },
  { id: 'bonker', name: 'Noodle Ninja', icon: 'noodle', stat: (c) => c.bonks, tiers: [25, 250, 2500], stars: [10, 30, 80], how: (n) => `Bonk ${n} players` },
  { id: 'tamer', name: 'Monster Tamer', icon: 'monster', stat: (c) => c.monsters, tiers: [25, 150], stars: [20, 60], how: (n) => `Bonk ${n} road monsters` },
  { id: 'market', name: 'Market Day', icon: 'coin', stat: (c) => c.sold, tiers: [25, 250], stars: [10, 40], how: (n) => `Sell ${n} plants` },
  { id: 'millionaire', name: 'Millionaire', icon: 'moneybag', money: true, stat: (c, b) => b.netWorth, tiers: [1e6], stars: [30], how: () => 'Reach $1M net worth' },
  { id: 'billionaire', name: 'Billionaire', icon: 'diamond', money: true, stat: (c, b) => b.netWorth, tiers: [1e9], stars: [150], how: () => 'Reach $1B net worth' },
  { id: 'speeddemon', name: 'Speed Demon', icon: 'bolt', stat: (c) => c.speedMax, tiers: [PLAYER.maxSpeedLevel], stars: [40], how: () => `Reach Speed level ${PLAYER.maxSpeedLevel}` },
  { id: 'reborn', name: 'Reborn', icon: 'star', stat: (c) => c.rebirthMax, tiers: [1, 5, 10], stars: [30, 80, 200], how: (n) => (n === 1 ? 'Rebirth once' : `Rebirth ${n} times`) },
  { id: 'explorer', name: 'Explorer', icon: 'compass', stat: (c) => c.deepest, tiers: [BIOMES.length], stars: [15], how: () => `Reach every biome, all the way to ${BIOMES[BIOMES.length - 1].name}` },
  { id: 'starcatcher', name: 'Star Catcher', icon: 'star', stat: (c) => c.seed_mythic, tiers: [1], stars: [30], how: () => 'Grab a Mythic seed' },
  { id: 'rainbow', name: 'Rainbow Hunter', icon: 'rainbow', stat: (c) => c.rainbowOwned, tiers: [1], stars: [30], how: () => 'Own a Rainbow plant' },
  { id: 'secret', name: 'Secret Keeper', icon: 'keyhole', stat: (c) => c.secretOwned, tiers: [1], stars: [50], how: () => 'Own a Secret family plant' },
  { id: 'namesake', name: "That's Me!", icon: 'family', stat: (c) => c.namesakeOwned, tiers: [1], stars: [60], how: () => 'Own your own family Secret plant' },
  { id: 'landlord', name: 'Full Garden', icon: 'planter', stat: (c) => c.plantersMax, tiers: [10], stars: [40], how: () => 'Unlock all 10 planters' },
  { id: 'locksmith', name: 'Locksmith', icon: 'lock', stat: (c) => c.locks, tiers: [25], stars: [15], how: (n) => `Lock your garden ${n} times` },
  { id: 'gadgeteer', name: 'Gadgeteer', icon: 'coil', stat: (c) => c.items, tiers: [50], stars: [20], how: (n) => `Use ${n} items` },
  { id: 'slippery', name: 'Slippery!', icon: 'banana', stat: (c) => c.slips, tiers: [10], stars: [15], how: (n) => `Make ${n} players slip on your bananas` },
  { id: 'champ', name: 'Showdown Champ', icon: 'trophy', stat: (c) => c.showdownWins, tiers: [1, 10], stars: [25, 80], how: (n) => (n === 1 ? 'Win a Family Showdown' : `Win ${n} Family Showdowns`) },
  { id: 'chaos', name: 'Chaos Conqueror', icon: 'fire', stat: (c) => c.chaosWins, tiers: [1], stars: [60], how: () => 'Win a Showdown on Chaos' },
  { id: 'social', name: 'Social Butterfly', icon: 'butterfly', stat: (c) => c.onlineGames, tiers: [1], stars: [20], how: () => 'Play an online game' },
  { id: 'generous', name: 'Generous', icon: 'gift', stat: (c) => c.gifts, tiers: [1], stars: [15], how: () => 'Gift a plant to a friend' },
  { id: 'dealmaker', name: 'Deal Maker', icon: 'handshake', stat: (c) => c.trades, tiers: [1], stars: [20], how: () => 'Finish a trade with a friend' },
  { id: 'petlover', name: 'Pet Lover', icon: 'paw', stat: (c) => c.hatches, tiers: [1, 10], stars: [10, 40], how: (n) => (n === 1 ? 'Hatch a pet egg' : `Hatch ${n} pet eggs`) },
  { id: 'legendary', name: 'Legendary Luck', icon: 'egg', stat: (c) => c.legendaryPets, tiers: [1], stars: [50], how: () => 'Hatch a Legendary pet (or rarer)' },
  { id: 'dancer', name: 'Dancer', icon: 'dance', stat: (c) => c.dances, tiers: [10], stars: [15], how: (n) => `Dance ${n} times` },
  { id: 'chatter', name: 'Chatterbox', icon: 'chat', stat: (c) => c.chats, tiers: [25], stars: [10], how: (n) => `Send ${n} quick chats` },
  { id: 'fashion', name: 'Fashionista', icon: 'hat', stat: unlocks, tiers: [5], stars: [25], how: (n) => `Own ${n} Wardrobe items` },
  { id: 'streak', name: 'Daily Streak', icon: 'flame', stat: (c) => c.streakBest, tiers: [3, 7, 30], stars: [20, 50, 150], how: (n) => `Finish a quest ${n} days in a row` },
  { id: 'questmaster', name: 'Quest Master', icon: 'scroll', stat: (c) => c.questsDone, tiers: [10, 50, 200], stars: [20, 50, 150], how: (n) => `Finish ${n} daily quests` },
];
export const BADGE = Object.assign(Object.create(null), Object.fromEntries(BADGES.map((b) => [b.id, b])));

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
export const badgeId = (fam, i) => (fam.tiers.length === 1 ? fam.id : fam.id + (i + 1));
export const badgeName = (fam, i) => (fam.tiers.length === 1 ? fam.name : `${fam.name} ${ROMAN[i]}`);

/** Every badge id with its family and tier. */
export const ALL_BADGES = BADGES.flatMap((fam) => fam.tiers.map((goal, i) => ({
  id: badgeId(fam, i), family: fam.id, tier: i, tiers: fam.tiers.length, goal, name: badgeName(fam, i), icon: fam.icon,
  stars: fam.stars[i] ?? fam.stars[fam.stars.length - 1], how: fam.how(goal),
})));
export const BADGE_BY_ID = Object.assign(Object.create(null), Object.fromEntries(ALL_BADGES.map((b) => [b.id, b])));
