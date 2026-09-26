// The progress engine: lifetime counters, personal bests, daily quests, badges and ⭐ stars for the LOCAL
// player. Pure logic (no DOM) so Node tests can drive it with a real Game and synthetic bus events.
// OWNER: progress agent (docs/ONLINE.md "Progress").
//
// Everything is keyed off `app.human` (the local player), so the same code works solo, as an online host,
// and as an online client (the net layer re-emits the host's events on the client's mirror game).
// Data lives in the active profile (app.profile): counters, best, badges, quests, stars. The profile object
// is mutated in place (core/profiles.js caches it, so the Wardrobe and cloud save see the same object) and
// saved with updateProfile() at most every 10 s, right away after claims/badges, and on quit/pagehide.
//
// Bus events emitted: quest:progress {quest, profile} · quest:done {quest, profile} · quest:claimed {quest,
// profile, stars, cash, banked} · quest:bonus {profile, stars, cash, banked} · badge:earned {badge, profile}
// · stars:changed {profile, stars, delta, reason} · progress:changed {profile} · progress:delivered {amount}
// · progress:settled {profile, stars, cash} (yesterday's finished quests were claimed at midnight).
import { bus } from '../core/events.js';
import { getProfile, updateProfile } from '../core/profiles.js';
import { makeRng } from '../core/rng.js';
import { PLANT, RARITY, biomeIndexAtZ } from '../config.js';
import { PET } from '../pets/catalog.js';
import {
  QUESTS, QUEST, STARTER, TIER_ORDER, questContext, questReward, bonusReward, BADGES, BADGE_BY_ID, ALL_BADGES, badgeId, badgeName,
} from './catalog.js';

export const SAVE_EVERY_MS = 10000;

const pad2 = (n) => String(n).padStart(2, '0');
/** Local calendar day, 'YYYY-MM-DD' (quests reset at local midnight). */
export function localDay(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Whole-day number of a 'YYYY-MM-DD' string (consecutive days differ by exactly 1, DST-proof). */
export function dayNumber(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : 0;
}
/** Milliseconds until the next local midnight. */
export function msToMidnight(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - ms;
}

function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const MUTANT = (m) => !!m && m !== 'normal';
const RARE_PETS = new Set(['legendary', 'mythic', 'secret']);

export function createTracker(app, { now = () => Date.now(), interval = 1000, autoSave = true } = {}) {
  const offs = [];
  const on = (name, fn) => offs.push(bus.on(name, fn));
  const dirtyIds = new Set();
  let lastSave = now();
  let bankTimer = 0;

  /** The profile that earns progress: the active profile on this device (the local player). */
  const profile = () => app.profile || null;
  const isMe = (p) => !!p && p === app.human;
  const markDirty = (p) => p && dirtyIds.add(p.id);
  const changed = (p) => bus.emit('progress:changed', { profile: p });

  // ---------------------------------------------------------------- counters

  function add(key, n = 1) {
    const p = profile();
    if (!p || !(n > 0)) return;
    p.counters[key] = (p.counters[key] || 0) + n;
    markDirty(p);
  }
  function setMax(key, v) {
    const p = profile();
    if (!p || !Number.isFinite(v)) return;
    if (v > (p.counters[key] || 0)) {
      p.counters[key] = v;
      markDirty(p);
    }
  }
  function setVal(key, v) {
    const p = profile();
    if (!p || !Number.isFinite(v) || p.counters[key] === v) return;
    p.counters[key] = v;
    markDirty(p);
  }
  function bestMax(key, v) {
    const p = profile();
    if (!p || !Number.isFinite(v)) return;
    if (v > (p.best[key] || 0)) {
      p.best[key] = Math.floor(v);
      markDirty(p);
    }
  }

  function addStars(p, n, reason) {
    if (!(n > 0)) return;
    p.stars = Math.max(0, Math.floor(p.stars || 0)) + n;
    markDirty(p);
    bus.emit('stars:changed', { profile: p, stars: p.stars, delta: n, reason });
  }

  // ---------------------------------------------------------------- quests

  function ctxFor(p) {
    const h = app.human;
    const g = app.game;
    const c = p.counters;
    // a live Endless (or online) garden is the best guide; a Showdown always starts from zero
    const live = !!h && !!g && g.mode !== 'showdown';
    return questContext({
      speedLevel: live ? h.speedLevel : c.lastSpeed || 0,
      rebirths: live ? h.rebirths : c.lastRebirths || 0,
      netWorth: live ? g.netWorth?.get(h) || 0 : c.lastNetWorth || 0,
      base: p.base,
      online: !!app.online?.available,
    });
  }

  function pickTemplate(tier, ctx, rng, groups, excludeIds = new Set()) {
    const ok = (t) => t.tier === tier && !groups.has(t.group) && !excludeIds.has(t.id) && (!t.gate || t.gate(ctx));
    let pool = QUESTS.filter(ok);
    if (!pool.length) pool = QUESTS.filter((t) => t.tier === tier && !excludeIds.has(t.id) && (!t.gate || t.gate(ctx)));
    if (!pool.length) pool = QUESTS.filter((t) => t.tier === tier);
    const t = rng.pick(pool);
    groups.add(t.group);
    return t;
  }

  function makeQuest(t, ctx, rng, tier = t.tier) {
    const m = t.make(ctx, rng);
    const r = questReward(tier, ctx);
    const q = { id: t.id, target: Math.max(1, Math.floor(m.target)), progress: 0, claimed: false, t: tier, st: r.stars, c: r.cash, s: ctx.stage };
    if (m.p !== undefined) q.p = m.p;
    return q;
  }

  function roll(p, day) {
    const ctx = ctxFor(p);
    const rng = makeRng(hash(day + '|' + p.id));
    // the very first quests ever follow the tutorial
    if (!p.quests?.day && !p.counters.questsDone) return STARTER.map((s) => makeQuest(QUEST[s.id], ctx, rng, s.tier));
    const groups = new Set();
    return TIER_ORDER.map((tier) => makeQuest(pickTemplate(tier, ctx, rng, groups), ctx, rng));
  }

  const validQuest = (q) => q && QUEST[q.id] && Number.isFinite(q.target) && q.target > 0 && Number.isFinite(q.progress);

  // Yesterday's finished-but-unclaimed quests (and the chest) are claimed for the player at midnight.
  function settle(p, old) {
    if (!old?.day || !Array.isArray(old.list)) return;
    const dn = dayNumber(old.day);
    let stars = 0;
    let cash = 0;
    let finished = 0;
    for (const q of old.list) {
      if (!validQuest(q)) continue;
      if (q.claimed) {
        finished++;
        continue;
      }
      if (q.progress < q.target) continue;
      q.claimed = true;
      finished++;
      stars += q.st | 0;
      cash += Math.floor(q.c) || 0;
      p.counters.questsDone = (p.counters.questsDone || 0) + 1;
      noteQuestDay(p, dn);
    }
    if (finished >= 3 && old.list.length >= 3 && (p.counters.bonusDay || 0) !== dn) {
      p.counters.bonusDay = dn;
      const r = bonusReward(ctxFor(p));
      stars += r.stars;
      cash += r.cash;
    }
    if (!stars && !cash) return;
    addStars(p, stars, 'quest');
    if (cash) p.counters.bankCash = (p.counters.bankCash || 0) + cash;
    markDirty(p);
    bus.emit('progress:settled', { profile: p, stars, cash });
    // midnight in the middle of an Endless game: the cash arrives right away
    clearTimeout(bankTimer);
    bankTimer = setTimeout(deliverBank, 1500);
  }

  /** Make sure `p` has today's quests (rolls new ones after midnight). Returns true when it rolled. */
  function ensureDay(p = profile()) {
    if (!p) return false;
    const today = localDay(now());
    const qs = p.quests;
    if (qs?.day === today && Array.isArray(qs.list) && qs.list.length === 3) {
      if (qs.list.every(validQuest)) return false;
      // repair entries we can't read (e.g. data from another version) without touching the good ones
      const ctx = ctxFor(p);
      const rng = makeRng(hash(today + '|' + p.id + '|fix'));
      const groups = new Set(qs.list.filter(validQuest).map((q) => QUEST[q.id].group));
      qs.list = qs.list.map((q, i) => (validQuest(q) ? q : makeQuest(pickTemplate(TIER_ORDER[i], ctx, rng, groups), ctx, rng)));
      markDirty(p);
      changed(p);
      return true;
    }
    if (qs?.day && qs.day !== today) settle(p, qs);
    p.quests = { day: today, list: roll(p, today) };
    markDirty(p);
    changed(p);
    return true;
  }

  // Quests rolled before a game (e.g. from yesterday's snapshot) are re-fitted to the player's real progress
  // at game start, as long as nothing has happened on them yet.
  function refit(p) {
    const g = app.game;
    if (!p || !app.human || !g || g.mode === 'showdown') return;
    const ctx = ctxFor(p);
    let any = false;
    p.quests.list.forEach((q, i) => {
      if (q.claimed || q.progress > 0 || q.s === ctx.stage) return;
      const t = QUEST[q.id];
      if (!t) return;
      const m = t.make(ctx, makeRng(hash(p.quests.day + '|' + p.id + '|' + i)));
      const r = questReward(q.t || t.tier, ctx);
      q.target = Math.max(1, Math.floor(m.target));
      if (m.p !== undefined && typeof m.p === 'number') q.p = m.p; // stage-based params only (not "steal from Micah")
      q.st = r.stars;
      q.c = r.cash;
      q.s = ctx.stage;
      any = true;
    });
    if (any) {
      markDirty(p);
      changed(p);
    }
  }

  function questView(q, i) {
    const t = QUEST[q.id];
    const target = Math.max(1, Math.floor(q.target) || 1);
    return {
      index: i, id: q.id, tier: q.t || t?.tier || 'easy', icon: t?.icon || 'star', text: t ? t.text(target, q.p) : 'Quest',
      target, progress: Math.min(q.progress, target), frac: Math.min(1, q.progress / target), done: q.progress >= target,
      claimed: !!q.claimed, stars: q.st | 0, cash: Math.floor(q.c) || 0, money: !!t?.money, swapped: !!q.sw, p: q.p,
    };
  }

  function quests() {
    const p = profile();
    if (!p) return [];
    ensureDay(p);
    return p.quests.list.map(questView);
  }

  /** Feed one fact to today's quests. */
  function fact(type, data = {}) {
    const p = profile();
    if (!p) return;
    ensureDay(p);
    p.quests.list.forEach((q, i) => {
      const t = QUEST[q.id];
      if (!t || t.on !== type || q.claimed || q.progress >= q.target) return;
      if (t.when && !t.when(data, q.p)) return;
      const before = q.progress;
      if (t.max) q.progress = Math.max(q.progress, Math.min(q.target, t.max(data, q.p) || 0));
      else q.progress = Math.min(q.target, q.progress + Math.max(0, (t.amount ? t.amount(data, q.p) : 1) || 0));
      if (q.progress === before) return;
      markDirty(p);
      const view = questView(q, i);
      bus.emit('quest:progress', { quest: view, profile: p });
      if (view.done) {
        q.done = true;
        bus.emit('quest:done', { quest: view, profile: p });
      }
      changed(p);
    });
  }

  function noteQuestDay(p, dn) {
    const c = p.counters;
    const last = c.streakDay || 0;
    if (last === dn) return;
    if (last > dn) return; // settling an older day after a newer claim: never shortens the streak
    c.streak = last === dn - 1 ? (c.streak || 0) + 1 : 1;
    c.streakDay = dn;
    if (c.streak > (c.streakBest || 0)) c.streakBest = c.streak;
  }

  // Quest cash is paid into a solo Endless garden. Otherwise it waits in the bank and arrives at the start of
  // the next one: a Showdown is a fair race, and an online room is a shared world (the host never takes
  // reward cash from other devices, so nobody can print money over the network).
  function inCashGame() {
    const g = app.game;
    return !!app.human && !!g && !app.online?.room && g.mode !== 'showdown' && !g.over && app.state !== 'title' && app.state !== 'ended';
  }
  function payCash(p, amount) {
    if (!(amount > 0)) return true;
    if (inCashGame()) {
      const r = app.act?.('addCash', amount);
      if (r !== false) return true;
    }
    p.counters.bankCash = (p.counters.bankCash || 0) + amount;
    markDirty(p);
    return false;
  }
  function deliverBank() {
    const p = profile();
    const amt = p?.counters.bankCash || 0;
    if (!(amt > 0) || !inCashGame()) return false;
    if (app.act?.('addCash', amt) === false) return false;
    p.counters.bankCash = 0;
    markDirty(p);
    flush();
    bus.emit('progress:delivered', { profile: p, amount: amt });
    return true;
  }

  function claim(i) {
    const p = profile();
    if (!p) return null;
    ensureDay(p);
    const q = p.quests.list[i];
    if (!q || q.claimed || q.progress < q.target) return null;
    q.claimed = true;
    q.done = true;
    addStars(p, q.st | 0, 'quest');
    const cashAmt = Math.floor(q.c) || 0;
    const paid = payCash(p, cashAmt);
    p.counters.questsDone = (p.counters.questsDone || 0) + 1;
    noteQuestDay(p, dayNumber(p.quests.day));
    markDirty(p);
    const view = questView(q, i);
    const res = { quest: view, stars: q.st | 0, cash: cashAmt, banked: !paid };
    bus.emit('quest:claimed', { ...res, profile: p });
    checkBadges(p);
    flush();
    changed(p);
    return res;
  }

  function bonus() {
    const p = profile();
    if (!p) return { ready: false, claimed: false, count: 0, stars: 0, cash: 0 };
    ensureDay(p);
    const count = p.quests.list.filter((q) => q.claimed).length;
    const claimed = (p.counters.bonusDay || 0) === dayNumber(p.quests.day);
    const r = bonusReward(ctxFor(p));
    return { ready: count >= 3 && !claimed, claimed, count, stars: r.stars, cash: r.cash };
  }

  function claimBonus() {
    const p = profile();
    const b = bonus();
    if (!p || !b.ready) return null;
    p.counters.bonusDay = dayNumber(p.quests.day);
    addStars(p, b.stars, 'bonus');
    const paid = payCash(p, b.cash);
    markDirty(p);
    const res = { stars: b.stars, cash: b.cash, banked: !paid };
    bus.emit('quest:bonus', { ...res, profile: p });
    checkBadges(p);
    flush();
    changed(p);
    return res;
  }

  /** One free swap per day for a quest that isn't finished (e.g. one you can't do right now). */
  function canSwap(i) {
    const p = profile();
    if (!p) return false;
    ensureDay(p);
    const q = p.quests.list[i];
    return !!q && !q.claimed && q.progress < q.target && !p.quests.list.some((x) => x.sw);
  }

  function swap(i) {
    if (!canSwap(i)) return null;
    const p = profile();
    const list = p.quests.list;
    const old = list[i];
    const ctx = ctxFor(p);
    const rng = makeRng(hash(p.quests.day + '|' + p.id + '|swap|' + i));
    const groups = new Set(list.filter((x, j) => j !== i).map((x) => QUEST[x.id]?.group).filter(Boolean));
    groups.add(QUEST[old.id]?.group);
    const t = pickTemplate(old.t || QUEST[old.id]?.tier || 'easy', ctx, rng, groups, new Set(list.map((x) => x.id)));
    const q = makeQuest(t, ctx, rng);
    q.sw = 1;
    list[i] = q;
    markDirty(p);
    flush();
    changed(p);
    return questView(q, i);
  }

  // ---------------------------------------------------------------- badges

  function checkBadges(p = profile()) {
    if (!p) return [];
    const got = [];
    for (const fam of BADGES) {
      let v = 0;
      try {
        v = Number(fam.stat(p.counters, p.best, p)) || 0;
      } catch {
        v = 0;
      }
      fam.tiers.forEach((goal, i) => {
        const id = badgeId(fam, i);
        if (p.badges[id] || v < goal) return;
        const b = BADGE_BY_ID[id];
        p.badges[id] = now();
        markDirty(p);
        addStars(p, b.stars, 'badge');
        got.push(b);
      });
    }
    if (got.length) {
      for (const b of got) bus.emit('badge:earned', { badge: b, profile: p });
      flush();
      changed(p);
    }
    return got;
  }

  /** One entry per badge family: current tier, next goal, value (for the Badges tab and the HUD chip). */
  function badges() {
    const p = profile();
    if (!p) return [];
    return BADGES.map((fam) => {
      let value = 0;
      try {
        value = Number(fam.stat(p.counters, p.best, p)) || 0;
      } catch {
        value = 0;
      }
      const tiers = fam.tiers.map((goal, i) => {
        const id = badgeId(fam, i);
        return { id, goal, name: badgeName(fam, i), stars: BADGE_BY_ID[id].stars, earnedAt: p.badges[id] || 0, how: fam.how(goal) };
      });
      let earned = -1;
      tiers.forEach((t, i) => t.earnedAt && (earned = i));
      const next = tiers.find((t) => !t.earnedAt) || null;
      return { id: fam.id, name: fam.name, icon: fam.icon, money: !!fam.money, value, tiers, earned, next, maxed: !next, current: earned >= 0 ? tiers[earned] : null };
    });
  }

  /** Lifetime stats and personal bests for display. */
  function bests() {
    const p = profile();
    const c = p?.counters || {};
    const b = p?.best || {};
    const earned = p ? ALL_BADGES.filter((x) => p.badges[x.id]).length : 0;
    const today = dayNumber(localDay(now()));
    const streak = (c.streakDay || 0) >= today - 1 ? c.streak || 0 : 0;
    return {
      stars: p?.stars || 0, netWorth: b.netWorth || 0, showdownWins: b.showdownWins || 0, showdownBest: b.showdownBest || 0,
      steals: c.steals || 0, bonks: c.bonks || 0, planted: c.planted || 0, foils: c.foils || 0, collected: c.cash || 0,
      questsDone: c.questsDone || 0, streak, streakBest: c.streakBest || 0, badges: earned, totalBadges: ALL_BADGES.length,
      bank: c.bankCash || 0,
    };
  }

  // ---------------------------------------------------------------- sampling (position, net worth, garden)

  function tick() {
    const p = profile();
    if (!p) return;
    ensureDay(p);
    const h = app.human;
    const g = app.game;
    if (h && g && app.state !== 'title') {
      const bi = biomeIndexAtZ(h.pos.z);
      if (bi >= 0) {
        setMax('deepest', bi + 1);
        fact('biome', { index: bi });
      }
      const nw = g.netWorth?.get(h) || 0;
      bestMax('netWorth', nw);
      setMax('speedMax', h.speedLevel);
      setMax('rebirthMax', h.rebirths);
      const garden = g.gardens?.[h.slot];
      if (garden) {
        let rainbow = 0, secret = 0, mine = 0, unlocked = 0;
        for (const pl of garden.planters) {
          if (pl.unlocked) unlocked++;
          const pt = pl.plant;
          if (!pt) continue;
          if (pt.mutation === 'rainbow') rainbow++;
          const sp = PLANT[pt.speciesId];
          if (sp?.rarity === 'secret') {
            secret++;
            if (sp.family && sp.family === h.id) mine++;
          }
        }
        setMax('rainbowOwned', rainbow);
        setMax('secretOwned', secret);
        setMax('namesakeOwned', mine);
        setMax('plantersMax', unlocked);
      }
      // the next day's quests are sized from the player's Endless progress
      if (g.mode !== 'showdown') {
        setVal('lastSpeed', h.speedLevel);
        setVal('lastRebirths', h.rebirths);
        setVal('lastNetWorth', Math.floor(nw));
      }
    }
    checkBadges(p);
    if (autoSave && dirtyIds.size && now() - lastSave >= SAVE_EVERY_MS) flush();
  }

  /** Persist every profile we changed. */
  function flush() {
    lastSave = now();
    const ids = [...dirtyIds];
    dirtyIds.clear();
    for (const id of ids) {
      if (!getProfile(id)) continue;
      try {
        updateProfile(id, () => {});
      } catch (e) {
        console.warn('[progress] save failed', e);
      }
    }
  }

  // ---------------------------------------------------------------- bus: the local player's deeds

  on('seed:grabbed', ({ player, mutation, rarity }) => {
    if (!isMe(player)) return;
    const tier = RARITY[rarity]?.tier ?? 0;
    add('seeds');
    add('seed_' + (RARITY[rarity] ? rarity : 'common'));
    if (MUTANT(mutation)) add('mut_' + mutation);
    setMax('seedTierMax', tier);
    fact('seed', { tier, mutation, rarity });
    checkBadges();
  });
  on('plant:planted', ({ player, plant }) => {
    if (!isMe(player)) return;
    const sp = PLANT[plant?.speciesId];
    add('planted');
    fact('plant', { tier: RARITY[sp?.rarity]?.tier ?? 0, mutation: plant?.mutation });
    tick(); // owned rainbow/secret plants
  });
  on('plant:grown', ({ garden }) => {
    if (!app.human || garden?.owner !== app.human) return;
    add('grown');
    fact('grow');
  });
  on('plant:sold', ({ player }) => {
    if (!isMe(player)) return;
    add('sold');
    fact('sell');
    checkBadges();
  });
  on('cash:collected', ({ player, amount }) => {
    if (!isMe(player) || !(amount > 0)) return;
    add('cash', amount);
    fact('cash', { amount });
  });
  on('steal:success', ({ thief, victim }) => {
    if (!isMe(thief)) return;
    add('steals');
    fact('steal', { victim: victim?.char?.id || victim?.id });
    tick();
  });
  on('steal:foiled', ({ thief, by }) => {
    if (!isMe(by) || thief === by) return;
    add('foils');
    fact('foil');
    checkBadges();
  });
  on('player:hit', ({ target, by, cause }) => {
    if (!isMe(by) || !target || target === by) return;
    if (cause === 'bonk') {
      add('bonks');
      fact('bonk', { target: target.char?.id || target.id });
    } else if (cause === 'balloon') {
      add('splashes');
      fact('splash');
    }
    checkBadges();
  });
  on('banana:slip', ({ target, owner }) => {
    if (!isMe(owner) || !target || target === owner) return;
    add('slips');
    fact('slip');
    checkBadges();
  });
  on('monster:bonked', ({ by }) => {
    if (!isMe(by)) return;
    add('monsters');
    fact('monster');
    checkBadges();
  });
  on('item:used', ({ player, item }) => {
    if (!isMe(player)) return;
    add('items');
    fact('item', { item });
    checkBadges();
  });
  on('plant:watered', ({ player }) => {
    if (!isMe(player)) return;
    add('waters');
    fact('water');
  });
  on('speed:up', ({ player, level }) => {
    if (!isMe(player)) return;
    add('speedUps');
    setMax('speedMax', level);
    fact('speed', { level });
    checkBadges();
  });
  on('rebirth', ({ player, rebirths }) => {
    if (!isMe(player)) return;
    add('rebirths');
    setMax('rebirthMax', rebirths);
    fact('rebirth');
    checkBadges();
    flush();
  });
  on('planter:unlocked', ({ player }) => {
    if (!isMe(player)) return;
    add('planters');
    fact('planter');
    tick();
  });
  on('lock:on', ({ player }) => {
    if (!isMe(player)) return;
    add('locks');
    fact('lock');
    checkBadges();
  });
  on('pet:hatched', ({ player, pet }) => {
    if (!isMe(player)) return;
    const rarity = PET[pet]?.rarity;
    add('hatches');
    if (RARE_PETS.has(rarity)) add('legendaryPets');
    fact('hatch', { pet, rarity });
    checkBadges();
  });
  on('emote', ({ player, id }) => {
    if (!isMe(player)) return;
    add('emotes');
    if (/^dance/.test(id || '')) add('dances');
    fact('emote', { id });
    checkBadges();
  });
  on('chat', ({ player, quick }) => {
    if (!isMe(player) || !quick) return;
    add('chats');
    fact('chat');
    checkBadges();
  });
  on('gift', ({ from, to }) => {
    if (isMe(from) && to && to !== from) {
      add('gifts');
      fact('gift');
      checkBadges();
    } else if (isMe(to)) add('giftsReceived');
  });
  on('trade:done', ({ a, b }) => {
    if (!isMe(a) && !isMe(b)) return;
    add('trades');
    fact('trade');
    checkBadges();
  });
  on('net:joined', () => {
    add('onlineGames');
    fact('online');
    checkBadges();
    clearTimeout(bankTimer);
    bankTimer = setTimeout(deliverBank, 2500);
  });
  on('match:end', ({ ranking }) => {
    const h = app.human;
    const p = profile();
    if (!h || !p || !Array.isArray(ranking)) return;
    const i = ranking.findIndex((r) => (r?.player || r) === h);
    if (i < 0) return;
    const nw = Number(ranking[i].netWorth ?? app.game?.netWorth?.get(h)) || 0;
    const win = i === 0;
    const difficulty = app.game?.difficultyId || 'normal';
    add('showdowns');
    if (win) {
      add('showdownWins');
      p.best.showdownWins = (p.best.showdownWins || 0) + 1;
      if (difficulty === 'chaos') add('chaosWins');
    }
    bestMax('showdownBest', nw);
    bestMax('netWorth', nw);
    fact('showdown', { rank: i + 1, win, difficulty });
    checkBadges(p);
    flush();
  });
  on('game:start', ({ human }) => {
    if (!human) return;
    const p = profile();
    add('games');
    ensureDay(p);
    refit(p);
    tick();
    clearTimeout(bankTimer);
    bankTimer = setTimeout(deliverBank, 1500);
  });
  on('game:dispose', () => {
    tick();
    flush();
  });
  on('profile:active', ({ profile: p }) => {
    ensureDay(p || profile());
    changed(p || profile());
  });

  const timer = interval > 0 && typeof setInterval === 'function' ? setInterval(tick, interval) : 0;
  const onHide = () => flush();
  const onVis = () => typeof document !== 'undefined' && document.hidden && flush();
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', onHide);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
  }

  return {
    profile,
    quests,
    claim,
    canSwap,
    swap,
    bonus,
    claimBonus,
    badges,
    bests,
    checkBadges,
    ensureDay: () => ensureDay(),
    resetsIn: () => msToMidnight(now()),
    deliverBank,
    fact,
    tick,
    flush,
    get stars() {
      return profile()?.stars || 0;
    },
    dispose() {
      offs.forEach((f) => f());
      if (timer) clearInterval(timer);
      clearTimeout(bankTimer);
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('pagehide', onHide);
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
      }
      flush();
    },
  };
}
