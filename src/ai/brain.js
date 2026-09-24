// Utility brain: scores every option (farm a pod, steal a plant, defend, shop, ...) in one currency,
// "income per second gained, per second of effort", and returns the best goal. Personality weights
// and difficulty knobs bend the scores; the bot adds hysteresis so it does not dither.
import { PLANT, PLANTS, PLANTERS, ITEM, PLAYER, REBIRTH, BIOMES, speedCost } from '../config.js';
import { gardenContains } from '../gameplay/layout.js';
import {
  hyp, clamp, gardenInfo, podSpot, seedIncome, runSpeed, carrySeedSpeed, carryPlantSpeed, approxDist, runSafety, podGuards,
} from './util.js';
import { getBoard, podClaimedByOther, stealersOn } from './blackboard.js';
import {
  FarmGoal, StealGoal, LurkGoal, DefendGoal, MugGoal, GroundGoal, ShopGoal, UnlockGoal, WaterGoal, CollectGoal,
  LockGoal, PatrolGoal,
} from './goals.js';

const MIN_REF = 0.02;
const STEAL_SCALE = 0.6; // stealing is the spice, farming is the meal

// Typical income of a seed from each biome (a relaxed bot does not chase the shiny ones).
const BIOME_INC = BIOMES.map((b) => {
  const list = PLANTS.filter((x) => x.rarity === b.rarity);
  return list.reduce((a, x) => a + x.income, 0) / list.length;
});

/**
 * How much a seed is worth to this bot. Chill bots barely notice lucky and mutated seeds (they grab
 * what's handy), and the more relaxed a bot plays the less it cares.
 */
function wantInc(bot, p, speciesId, mutation, biome) {
  const inc = seedIncome(p, speciesId, mutation);
  const k = bot.diff.shiny * (1 - bot.ease);
  if (k >= 1 || biome < 0) return inc;
  const base = Math.min(inc, BIOME_INC[biome] * REBIRTH.incomeMult(p.rebirths));
  return base + (inc - base) * k;
}

function bestFarm(bot, game, p, info) {
  const now = game.time;
  const pers = bot.pers;
  const spd = runSpeed(game, p), cs = carrySeedSpeed(game, p);
  const home = bot.home.inside;
  const hasCoil = (p.items.coil || 0) > 0 && bot.personality === 'speedster';
  const toHome = info.free === 0 ? approxDist(p.pos.x, p.pos.z, home.x, home.z) : 0;
  let best = null;
  for (const pod of game.pods) {
    const seed = pod.seed;
    if (!seed || pod.biome > bot.biomeCap) continue;
    const inc = wantInc(bot, p, seed.speciesId, seed.mutation, pod.biome);
    let gain, needRoom = false;
    if (info.free > 0) gain = inc;
    else if (info.weakest && inc >= info.weakestInc * 1.5) {
      gain = inc - info.weakestInc;
      needRoom = true;
    } else continue;
    let P = runSafety(game, p, pod.biome, pers.risk + bot.diff.riskPad, hasCoil) * bot.biomeConfidence(pod.biome, now);
    if (P < 0.2) continue;
    // two guards near the pod: we can bonk one, the other gets us
    if (P < 0.97 && podGuards(game, p, pod, cs) >= 2) P *= 0.3;
    if (P < 0.12) continue;
    const spot = podSpot(pod);
    const dGo = needRoom ? toHome + approxDist(home.x, home.z, spot.x, spot.z) : approxDist(p.pos.x, p.pos.z, spot.x, spot.z);
    const dBack = approxDist(spot.x, spot.z, home.x, home.z);
    const T = dGo / spd + dBack / cs + 3 + (needRoom ? 5 : 0) + PLANT[seed.speciesId].grow * 0.1;
    let u = (gain * P) / T;
    if (pers.homeBias) u /= 1 + (dGo + dBack) / pers.homeBias;
    if (podClaimedByOther(game, p.slot, pod.id, dGo / spd)) u *= 0.05;
    if ((bot.podBlock.get(pod.id) || 0) > now) u *= 0.1;
    u *= pers.farm;
    if (!best || u > best.u) best = { pod, u, needRoom, P, inc };
  }
  return best;
}

/** How likely a steal from garden g gets home without the owner catching us. */
function stealSafety(bot, game, p, g) {
  const now = game.time;
  const o = g.owner;
  const cloak = (p.items.cloak || 0) > 0 && bot.personality === 'thief';
  if (o.invisible(now)) return 0.5;
  if (gardenContains(g.L, o.pos.x, o.pos.z)) return cloak ? 0.7 : 0.07;
  const cps = carryPlantSpeed(game, p);
  const oSpd = Math.max(8, runSpeed(game, o));
  const dOwner = approxDist(o.pos.x, o.pos.z, g.L.outside.x, g.L.outside.z);
  const react = o.isHuman ? 1.2 : o.controller?.diff?.reaction ?? 0.5;
  const tOwner = dOwner / oSpd + react + (o.carrying ? 2.5 : 0);
  const home = bot.home.inside;
  const tExpose = PLAYER.stealHold + 3 + approxDist(g.L.outside.x, g.L.outside.z, home.x, home.z) / cps;
  let P = clamp(0.5 + (tOwner - tExpose * 0.55) / 7, 0.06, 0.95);
  if (o.controller?.personality === 'guardian') P *= 0.8;
  if (cloak) P = Math.max(P, 0.72);
  return P;
}

function bestSteal(bot, game, p, info) {
  const now = game.time;
  const pers = bot.pers, diff = bot.diff;
  const board = getBoard(game);
  const spd = runSpeed(game, p), cps = carryPlantSpeed(game, p);
  const home = bot.home.inside;
  const rivalry = game.mode === 'showdown' ? 0.7 : 0.35;
  const gap = pers.stealGap / Math.max(0.2, diff.stealRate);
  if (now - bot.lastStealAt < gap) return { best: null, blocked: null };
  let best = null, blocked = null;
  for (const g of game.gardens) {
    if (g.slot === p.slot) continue;
    if (game.isLocked(g) && g.lockedUntil > now + 2) continue;
    const victim = g.owner;
    if (victim.isHuman) {
      if (now < board.humanStealUntil || now < diff.humanGrace) continue;
      let grown = 0;
      for (const pl of g.planters) if (pl.plant && pl.plant.growLeft <= 0) grown++;
      if (grown <= diff.humanMinGrown) continue;
    }
    const P = stealSafety(bot, game, p, g);
    const others = stealersOn(game, g.slot, p.slot);
    for (const pl of g.planters) {
      if (!pl.plant || pl.plant.growLeft > 0 || (pl.stealer != null && pl.stealer !== p.slot)) continue;
      const inc = game.plantIncome(pl.plant, p);
      const vInc = game.plantIncome(pl.plant, victim);
      const gain = info.free > 0 ? inc : Math.max(inc - info.weakestInc, inc * 0.3);
      const value = gain + vInc * rivalry;
      const dGo = approxDist(p.pos.x, p.pos.z, pl.x, pl.z);
      const dBack = approxDist(pl.x, pl.z, home.x, home.z);
      const T = dGo / spd + PLAYER.stealHold + dBack / cps + 3;
      let u = (value / T) * pers.steal * diff.stealRate * STEAL_SCALE;
      // comeback: while the human is last, leave their garden (mostly) alone
      if (victim.isHuman) u *= diff.humanStealMult * (bot.humanLast ? diff.lastStealMult : 1);
      if (others) u *= 0.25;
      if (bot.revenge === victim && now < bot.revengeUntil) u *= 1.6;
      // spread the misery: someone who was just robbed is a less tempting target
      if (now - (board.lastStealOn.get(g.slot) ?? -99) < 60) u *= 0.4;
      const safe = u * P;
      if (!best || safe > best.u) best = { g, pl, u: safe, P, value };
      if (P < 0.35 && (!blocked || u > blocked.u)) blocked = { g, u };
    }
  }
  return { best, blocked };
}

function bestGround(bot, game, p, info) {
  const spd = runSpeed(game, p), cs = carrySeedSpeed(game, p);
  const home = bot.home.inside;
  const drops = getBoard(game).humanDrops;
  let best = null;
  for (const gi of game.ground) {
    if (gi.kind !== 'seed') continue;
    // the human's own lost seed: give them a fair chance to pick it back up
    if (drops.has(gi.uid) && game.time - drops.get(gi.uid) < bot.diff.humanDropGrace) continue;
    const d = hyp(gi.x - p.pos.x, gi.z - p.pos.z);
    if (d > 70) continue;
    const bi = game.biomeAt(gi.z);
    if (bi > bot.biomeCap) continue;
    const inc = wantInc(bot, p, gi.speciesId, gi.mutation, Math.max(0, bi));
    if (info.free === 0 && inc < info.weakestInc * 1.5) continue;
    const gain = info.free > 0 ? inc : inc - info.weakestInc;
    // someone else is closer to it?
    let rival = false;
    for (const q of game.players) if (q !== p && !q.carrying && hyp(gi.x - q.pos.x, gi.z - q.pos.z) < d - 4) rival = true;
    const left = gi.expiresAt - game.time;
    if (d / spd > left - 0.5) continue;
    const P = runSafety(game, p, Math.max(0, game.biomeAt(gi.z)), bot.pers.risk + bot.diff.riskPad);
    const T = d / spd + approxDist(gi.x, gi.z, home.x, home.z) / cs + 1;
    const u = ((gain * P) / T) * (rival ? 0.3 : 1.2);
    if (!best || u > best.u) best = { gi, u };
  }
  return best;
}

function bestMug(bot, game, p, info, farm) {
  const now = game.time;
  if (now < p.bonkReadyAt - 0.3 || now < bot.mugReadyAt || now < 45) return null;
  const pers = bot.pers;
  let best = null;
  for (const q of game.players) {
    if (q === p || q.carrying?.kind !== 'seed' || q.invisible(now) || now < q.invulnUntil) continue;
    const mult = pers.mug * (q.isHuman ? bot.diff.humanMug * (bot.humanLast ? bot.diff.lastStealMult : 1) : 1);
    if (mult <= 0) continue;
    const d = hyp(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
    if (d > 13) continue;
    const qHome = game.layout.gardens[q.slot].outside;
    if (hyp(q.pos.x - qHome.x, q.pos.z - qHome.z) < 18) continue;
    const inc = seedIncome(p, q.carrying.speciesId, q.carrying.mutation);
    if (info.free === 0 && inc < info.weakestInc * 1.5) continue;
    if (farm && inc < farm.inc * 1.2) continue;
    const closing = Math.max(2, runSpeed(game, p) - Math.hypot(q.vel.x, q.vel.z) * 0.6);
    const u = ((inc * mult) / (d / closing + 4)) * 0.8;
    if (!best || u > best.u) best = { q, u };
  }
  return best;
}

/** Shopping plan when something is worth buying now, else null. */
function shopPlan(bot, game, p, info) {
  const pers = bot.pers;
  const avail = p.cash + info.g.cashPile;
  // showdown: spending now only lowers net worth (the savvy stop shopping; Chill bots never think of it)
  const late = game.match && game.timeLeft() < bot.diff.endgame;
  if (late) return null;
  const plan = { speed: false, items: [], rebirth: false, cost: 0 };
  if (game.mode !== 'showdown' && avail >= REBIRTH.threshold(p.rebirths) && bot.wantsRebirth(game, p)) {
    plan.rebirth = true;
    plan.cost = REBIRTH.threshold(p.rebirths);
    return plan;
  }
  plan.speed = bot.wantsMoreSpeed(game, p, pers.speedEager * bot.diff.eager * (1 + bot.ease), avail);
  const reserve = plan.speed ? speedCost(p.speedLevel + 1) : 0;
  plan.cost = reserve;
  for (const [id, want] of Object.entries(pers.items)) {
    if ((p.items[id] || 0) < want && avail - reserve >= ITEM[id].price * pers.itemReserve) {
      plan.items.push(id);
      plan.cost += ITEM[id].price;
    }
  }
  if (!plan.speed && !plan.items.length) return null;
  return plan;
}

/** Pick the best goal for this moment (the bot applies hysteresis against its current goal). */
export function chooseGoal(bot, game, p) {
  const now = game.time;
  const pers = bot.pers;
  const info = gardenInfo(game, p.slot);
  bot.info = info;

  // 1. defend beats everything
  const th = bot.threat;
  if (th && now >= th.reactAt && bot.canDefend(game, p, th.q)) return new DefendGoal(th.q, 1e6);

  const farm = bestFarm(bot, game, p, info);
  const { best: steal, blocked } = bestSteal(bot, game, p, info);
  const ground = bestGround(bot, game, p, info);
  const mug = bestMug(bot, game, p, info, farm);
  const ref = Math.max(MIN_REF, farm?.u || 0, steal?.u || 0);
  const cands = [];
  if (farm) cands.push([farm.u * (now < bot.stayHomeUntil ? 0.15 : 1), () => new FarmGoal(farm.pod, farm.u, farm.needRoom)]);
  if (steal && steal.P > 0.25) cands.push([steal.u, () => new StealGoal(steal.g.slot, steal.pl.index, steal.u)]);
  if (ground) cands.push([ground.u, () => new GroundGoal(ground.gi, ground.u)]);
  if (mug) cands.push([mug.u, () => new MugGoal(mug.q, mug.u)]);
  if (blocked && bot.personality === 'thief' && now > (bot.lurkBlock.get(blocked.g.slot) || 0)) {
    cands.push([blocked.u * 0.25, () => new LurkGoal(blocked.g.slot, blocked.u * 0.25)]);
  }

  // 2. home economy
  const avail = p.cash + info.g.cashPile;
  if (info.nextLocked >= 0 && info.free === 0 && avail >= PLANTERS.unlockCost[info.nextLocked] * pers.planterEager * bot.diff.eager * (1 + bot.ease * 1.5) && !(game.match && game.timeLeft() < bot.diff.endgame * 0.8)) {
    cands.push([ref * 1.9 + 0.01, () => new UnlockGoal(info.nextLocked, ref * 1.9)]);
  }
  const plan = shopPlan(bot, game, p, info);
  if (plan) {
    const big = plan.speed || plan.rebirth;
    const shops = game.layout.shops;
    const nearGear = hyp(p.pos.x - shops.gear.x, p.pos.z - shops.gear.z) < 45;
    let k = big ? 1.6 : nearGear || avail > 12 * ITEM[plan.items[0]].price ? 1.05 : 0.4;
    // shopping is an errand for when we're around the plaza, not a reason to abandon a road trip
    const dShop = approxDist(p.pos.x, p.pos.z, shops.speed.x, shops.speed.z);
    k *= clamp(1 - (dShop - 70) / 260, 0.15, 1);
    if (now - bot.lastShopAt < 25 && !plan.rebirth) k *= 0.35;
    cands.push([ref * k + 0.005, () => new ShopGoal(plan, ref * k)]);
  }
  if ((p.items.bucket || 0) > 0 && info.growing && info.growing.plant.growLeft > 25) {
    const dHome = approxDist(p.pos.x, p.pos.z, bot.home.inside.x, bot.home.inside.z);
    cands.push([ref * (dHome < 40 ? 1.3 : 0.35), () => new WaterGoal(info.growing, ref)]);
  }
  const pad = bot.home.collectPad;
  const dPad = hyp(pad.x - p.pos.x, pad.z - p.pos.z);
  const pileWorth = Math.max(40, info.income * 25);
  if (info.g.cashPile >= pileWorth && dPad < 20 && now - bot.lastCollectAt > 20) cands.push([ref * 1.1, () => new CollectGoal(ref)]);
  if (bot.wantsLockNow(game, p)) cands.push([ref * 2.2, () => new LockGoal(ref * 2.2)]);

  // 3. something to do while nothing else is worth it
  const idleU = ref * (now < bot.stayHomeUntil ? 0.5 : pers.patrol ? 0.3 : 0.06) + 1e-4;
  cands.push([idleU, () => new PatrolGoal(idleU, bot.rng.range(4, pers.patrol ? 12 : 7))]);

  let bestC = cands[0];
  for (const c of cands) if (c[0] > bestC[0]) bestC = c;
  const goal = bestC[1]();
  goal.u = bestC[0];
  return goal;
}
