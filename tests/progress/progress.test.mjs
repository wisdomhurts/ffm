// Node test for the progress engine (src/progress/tracker.js): counters, quests, claims, badges, day rollover,
// persistence. Drives a real Game plus synthetic bus events. Run: node tests/progress/progress.test.mjs
// A fake localStorage stands in for the browser so profiles really save and reload.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};

const { bus } = await import('../../src/core/events.js');
const profiles = await import('../../src/core/profiles.js');
const { Game } = await import('../../src/gameplay/game.js');
const { BotController } = await import('../../src/ai/bot.js');
const { CHARACTERS, PLANTS, RARITIES, BIOMES, LOCK } = await import('../../src/config.js');
const { createTracker, localDay, dayNumber } = await import('../../src/progress/tracker.js');
const cat = await import('../../src/progress/catalog.js');

let failed = 0;
let passed = 0;
const check = (cond, msg) => {
  if (cond) passed++;
  else {
    failed++;
    console.log('FAIL ' + msg);
  }
  if (process.env.VERBOSE || !cond) return;
};
const section = (s) => console.log('-- ' + s);

// ------------------------------------------------------------------ fake app
const clock = { t: new Date(2026, 8, 25, 10, 0, 0).getTime() };
const acts = [];
const app = {
  profileId: 'maddie',
  get profile() {
    return profiles.getProfile(this.profileId);
  },
  human: null,
  game: null,
  state: 'title',
  online: { available: false },
  act(name, ...args) {
    acts.push([name, ...args]);
    if (!this.game || !this.human) return false;
    if (name === 'addCash' && Number.isFinite(args[0]) && args[0] > 0) this.human.cash += Math.floor(args[0]);
    return true;
  },
};
const events = [];
for (const n of ['quest:done', 'quest:claimed', 'badge:earned', 'stars:changed', 'progress:settled', 'progress:delivered', 'quest:bonus']) {
  bus.on(n, (e) => events.push([n, e]));
}
const count = (n, id) => events.filter((e) => e[0] === n && (!id || e[1]?.quest?.id === id)).length;

const tr = createTracker(app, { now: () => clock.t, interval: 0 });

function startGame(mode = 'endless', difficulty = 'normal', seed = 11) {
  const prof = app.profile;
  const slots = CHARACTERS.map((c) => (c.id === prof.base ? { kind: 'local', profile: prof } : { kind: 'bot' }));
  const game = new Game({ mode, difficulty, slots, seed });
  app.game = game;
  app.human = game.human;
  app.state = 'playing';
  bus.emit('game:start', { game, human: game.human, resumed: false });
  return game;
}
function endGame() {
  bus.emit('game:dispose', { game: app.game });
  app.game = null;
  app.human = null;
  app.state = 'title';
}

// ------------------------------------------------------------------ 1. attract mode is ignored
section('attract mode');
{
  const demo = new Game({ humanId: null, mode: 'endless', difficulty: 'normal', seed: 3 });
  app.game = demo; // title screen: a game runs, but nobody is the local player
  for (const p of demo.players) p.controller = new BotController(p.char.personality, 'normal', { seed: p.slot + 1 });
  for (let i = 0; i < 30 * 60; i++) demo.update(1 / 30);
  tr.tick();
  const c = app.profile.counters;
  check(!c.seeds && !c.planted && !c.steals, 'bot deeds in attract mode never count: ' + JSON.stringify(c));
  app.game = null;
}

// ------------------------------------------------------------------ 2. quests roll deterministically
section('daily quests');
const q0 = tr.quests();
check(q0.length === 3, 'three quests today');
check(q0.map((q) => q.tier).join() === 'easy,medium,hard', 'one easy, one medium, one hard: ' + q0.map((q) => q.tier));
check(new Set(q0.map((q) => cat.QUEST[q.id].group)).size === 3, 'three different kinds of quest');
check(app.profile.quests.day === localDay(clock.t), 'stored under today: ' + app.profile.quests.day);
check(q0.every((q) => q.text && !/undefined|NaN/.test(q.text)), 'quest texts read well: ' + q0.map((q) => q.text).join(' | '));
check(q0.every((q) => q.stars > 0 && q.cash > 0), 'every quest pays stars and cash');
check(q0.map((q) => q.id).join() === cat.STARTER.map((x) => x.id).join(), 'the first quests ever follow the tutorial: ' + q0.map((q) => q.id));
{
  // a quest we can't read (another version's data) is replaced; the others keep their progress
  const list = app.profile.quests.list;
  list[1].progress = 1;
  const keep = list[1].id;
  list[0] = { id: 'no-such-quest', target: 3, progress: 0 };
  const fixed = tr.quests();
  check(cat.QUEST[fixed[0].id] && fixed[0].tier === 'easy' && fixed[1].id === keep && fixed[1].progress === 1, 'unknown quest repaired, others untouched: ' + fixed.map((q) => q.id));
  list[1].progress = 0;
}
{
  // same day + same profile = same quests; another profile gets its own
  const again = tr.quests();
  check(JSON.stringify(again.map((q) => q.id)) === JSON.stringify(q0.map((q) => q.id)), 'same quests when asked again');
  const saved = app.profileId;
  app.profileId = 'micah';
  const other = tr.quests();
  check(other.length === 3, 'micah has quests too');
  app.profileId = saved;
}
// every template can be rolled, reads well and fits the stage
for (const stage of [0, 3, 5]) {
  const ctx = cat.questContext({ speedLevel: [0, 8, 15][[0, 3, 5].indexOf(stage)], base: 'maddie', online: true, netWorth: 5e6 });
  check(ctx.stage === stage, `speed level maps to stage ${stage} (got ${ctx.stage})`);
  for (const t of cat.QUESTS) {
    const m = t.make(ctx, { pick: (a) => a[0] });
    const text = t.text(m.target, m.p);
    check(m.target >= 1 && typeof text === 'string' && !/undefined|NaN/.test(text), `template ${t.id} at stage ${stage}: "${text}"`);
  }
}
{
  const s0 = cat.questContext({ speedLevel: 0 });
  const s5 = cat.questContext({ speedLevel: 16, rebirths: 2 });
  const c0 = cat.QUEST.collectM.make(s0).target;
  const c5 = cat.QUEST.collectM.make(s5).target;
  check(c0 >= 1000 && c0 <= 10000, 'a new player collects a few $K: ' + c0);
  check(c5 > c0 * 50, 'a Starbloom player with rebirths collects far more: ' + c5);
  check(cat.questReward('hard', s5).cash > cat.questReward('hard', s0).cash, 'rewards grow with progress');
  check(cat.cashText(100000) === '$100K' && cat.cashText(2500) === '$2.5K' && cat.cashText(1200000) === '$1.2M', 'cash text: ' + cat.cashText(100000));
}

// ------------------------------------------------------------------ 3. counters from a real game
section('counters (real game, bot-driven local player)');
let game = startGame('endless', 'normal', 21);
let me = app.human;
{
  // let a bot brain drive the local player so the real rules emit real events
  for (const p of game.players) p.controller = new BotController(p.char.personality, 'chaos', { seed: 40 + p.slot });
  me.controller = new BotController('thief', 'chaos', { seed: 99 });
  me.cash = 5000;
  for (let i = 0; i < 30 * 60 * 8; i++) {
    game.update(1 / 30);
    if (i % 30 === 0) {
      clock.t += 1000;
      tr.tick();
    }
  }
  tr.tick(); // the snapshots below are taken once a second: one more so a buy in the last second is in them too
  const c = app.profile.counters;
  const s = me.stats;
  console.log('   human stats', JSON.stringify(s), 'counters', JSON.stringify({ seeds: c.seeds, planted: c.planted, steals: c.steals, bonks: c.bonks, cash: c.cash }));
  check(c.planted === s.planted, `planted ${c.planted} == game stat ${s.planted}`);
  check((c.steals || 0) === s.steals, `steals ${c.steals} == game stat ${s.steals}`);
  check((c.cash || 0) === s.collected, `cash collected ${c.cash} == game stat ${s.collected}`);
  check((c.bonks || 0) + (c.splashes || 0) + (c.slips || 0) === s.bonks, `bonk+splash+slip ${(c.bonks || 0) + (c.splashes || 0) + (c.slips || 0)} == game stat ${s.bonks}`);
  check((c.seeds || 0) >= s.seeds && s.seeds > 0, `seeds ${c.seeds} >= pod grabs ${s.seeds}`);
  check(c.deepest >= 1, 'deepest biome sampled: ' + c.deepest);
  check(app.profile.best.netWorth > 0, 'best net worth sampled: ' + app.profile.best.netWorth);
  check(!!app.profile.badges.firstseed, 'First Seed badge earned');
  check(c.lastSpeed === me.speedLevel, 'last speed snapshot for tomorrow: ' + c.lastSpeed);
}
for (const p of game.players) p.controller = null;
me.controller = null;

// ------------------------------------------------------------------ 4. every quest template completes from its events
section('every quest template completes');
const P = () => app.profile;
const other = game.players.find((p) => p !== me);
const byChar = (id) => game.players.find((p) => p.char.id === id) || other;
const rarityOf = (tier) => RARITIES[Math.min(6, tier)].id;
const speciesOf = (tier) => PLANTS.find((x) => x.rarity === rarityOf(tier)).id;
const DRIVE = {
  seed: (q) => bus.emit('seed:grabbed', { player: me, speciesId: speciesOf(q.p || 0), mutation: q.id === 'mutant' ? 'gold' : 'normal', rarity: rarityOf(q.p || 0) }),
  plant: (q) => bus.emit('plant:planted', { player: me, plant: { speciesId: speciesOf(q.p || 0), mutation: q.id === 'mutantPlant' ? 'rainbow' : 'normal' } }),
  grow: () => bus.emit('plant:grown', { plant: {}, planter: {}, garden: game.gardens[me.slot] }),
  sell: () => bus.emit('plant:sold', { player: me, value: 10 }),
  cash: (q) => bus.emit('cash:collected', { player: me, amount: Math.ceil(q.target / 3) }),
  steal: (q) => bus.emit('steal:success', { thief: me, victim: q.p ? byChar(q.p) : other, plant: {} }),
  foil: () => bus.emit('steal:foiled', { thief: other, victim: other, by: me, cause: 'bonk' }),
  bonk: (q) => bus.emit('player:hit', { target: q.p ? byChar(q.p) : other, by: me, cause: 'bonk' }),
  monster: () => bus.emit('monster:bonked', { monster: {}, by: me }),
  item: () => bus.emit('item:used', { player: me, item: 'banana' }),
  water: () => bus.emit('plant:watered', { player: me }),
  speed: () => bus.emit('speed:up', { player: me, level: me.speedLevel + 1 }),
  rebirth: () => bus.emit('rebirth', { player: me, rebirths: 1 }),
  lock: () => bus.emit('lock:on', { player: me }),
  hatch: () => bus.emit('pet:hatched', { player: me, egg: 'garden', pet: 'bunny' }),
  emote: (q) => bus.emit('emote', { player: me, id: q.id === 'wave' ? 'wave' : 'dance1' }),
  chat: () => bus.emit('chat', { player: me, text: 'Hi!', quick: true, phrase: 'hi' }),
  online: () => bus.emit('net:joined', {}),
  showdown: () => bus.emit('match:end', { ranking: [me, ...game.players.filter((p) => p !== me)].map((p) => ({ player: p, netWorth: 1000 })) }),
  slip: () => bus.emit('banana:slip', { target: other, owner: me }),
  splash: () => bus.emit('player:hit', { target: other, by: me, cause: 'balloon' }),
  drop: () => bus.emit('drop:claimed', { player: me, drop: { egg: 'farm', x: 0, z: 0 }, pet: 'piglet' }),
  base: () => bus.emit('base:upgraded', { player: me, level: 2, cost: 5000 }),
  boost: () => bus.emit('boost:start', { player: me }),
  pump: () => bus.emit('pump:start', { player: me, tier: 0, bonus: 0.1, until: 60 }),
  boss: () => bus.emit('boss:hit', { by: me, n: 1, hp: 10, max: 20, cause: 'bonk', x: 0, z: 0 }),
  biome: () => {
    me.pos.z = BIOMES.length * 150 + 50; // Starbloom
    tr.tick();
    me.pos.z = 0;
  },
};
for (const t of cat.QUESTS) {
  const ctx = cat.questContext({ speedLevel: 3, base: P().base, online: true, netWorth: 1e9 });
  const m = t.make(ctx, { pick: (a) => a[a.length - 1] });
  const fillers = cat.QUESTS.filter((x) => x.on !== t.on).slice(0, 2).map((x) => ({ id: x.id, target: 99, progress: 0, claimed: false, t: x.tier, st: 5, c: 100 }));
  P().quests.list = [{ id: t.id, target: m.target, progress: 0, claimed: false, t: t.tier, st: 5, c: 100, p: m.p }, ...fillers];
  // noise first: another player's deeds must not count
  const before = P().quests.list[0].progress;
  bus.emit('steal:success', { thief: other, victim: me, plant: {} });
  bus.emit('seed:grabbed', { player: other, speciesId: 'daisy', mutation: 'gold', rarity: 'common' });
  bus.emit('player:hit', { target: me, by: other, cause: 'bonk' });
  check(P().quests.list[0].progress === before, `${t.id}: other players' deeds don't count`);
  const done0 = count('quest:done', t.id);
  let guard = 0;
  while (P().quests.list[0].progress < P().quests.list[0].target && guard++ < 40) DRIVE[t.on](P().quests.list[0]);
  check(P().quests.list[0].progress >= P().quests.list[0].target, `${t.id} ("${t.text(m.target, m.p)}") completes (${P().quests.list[0].progress}/${m.target})`);
  check(count('quest:done', t.id) === done0 + 1, `${t.id}: quest:done fires exactly once`);
}

// ------------------------------------------------------------------ 5. claims: stars + cash, bank when not in a game
section('claims');
tr.flush();
P().quests = { day: '', list: [] };
const today = tr.quests();
const stars0 = P().stars;
const cash0 = me.cash;
for (const q of today) {
  const lq = P().quests.list[q.index];
  lq.progress = lq.target;
}
check(tr.claim(0).banked === false, 'claim in an Endless game pays right away');
check(me.cash === cash0 + today[0].cash, `cash arrives via app.act('addCash'): ${me.cash - cash0} == ${today[0].cash}`);
check(acts.some((a) => a[0] === 'addCash' && a[1] === today[0].cash), 'addCash went through the actions gateway');
check(P().stars >= stars0 + today[0].stars, 'stars added');
check(tr.claim(0) === null, 'no double claims');
check(tr.bonus().ready === false, 'chest waits for all three');
endGame();
const r1 = tr.claim(1);
check(r1 && r1.banked === true && P().counters.bankCash === today[1].cash, 'no game: cash is banked for the next game: ' + P().counters.bankCash);
tr.claim(2);
const b = tr.bonus();
check(b.ready && b.count === 3, 'daily chest ready after all three');
const bankBefore = P().counters.bankCash;
const rb = tr.claimBonus();
check(rb && rb.stars === cat.BONUS.stars && P().counters.bankCash === bankBefore + rb.cash, 'chest pays stars and banks cash');
check(tr.claimBonus() === null && tr.bonus().claimed, 'chest opens once a day');
check(P().counters.questsDone >= 3, 'quests done counted: ' + P().counters.questsDone);
check(P().counters.streak === 1 && P().counters.streakDay === dayNumber(localDay(clock.t)), 'streak day 1');
{
  // Showdowns never receive banked cash; the next Endless game does
  game = startGame('showdown', 'normal', 5);
  me = app.human;
  check(tr.deliverBank() === false && me.cash === 100, 'banked cash does not go into a Showdown');
  endGame();
  game = startGame('endless', 'normal', 6);
  me = app.human;
  const bank = P().counters.bankCash;
  const got = tr.deliverBank();
  check(got && me.cash === 100 + bank && !P().counters.bankCash, `banked cash delivered at the next Endless game (+${bank})`);
  check(count('progress:delivered') === 1, 'delivery announced');
}

function badgeStarsSince() {
  return 0;
}

// ------------------------------------------------------------------ 6. swap
section('swap');
{
  clock.t += 86400000; // tomorrow
  tr.tick();
  const qs = tr.quests();
  const i = qs.findIndex((q) => !q.done);
  check(tr.canSwap(i), 'an unfinished quest can be swapped');
  const oldId = qs[i].id;
  const nq = tr.swap(i);
  check(nq && nq.id !== oldId && nq.tier === qs[i].tier && nq.swapped, `swapped ${oldId} -> ${nq?.id} (same tier)`);
  check(!tr.canSwap((i + 1) % 3), 'only one swap a day');
  check(new Set(tr.quests().map((q) => cat.QUEST[q.id].group)).size === 3, 'still three different kinds after the swap');
}

// ------------------------------------------------------------------ 7. day rollover: settle, streak, reset
section('day rollover');
{
  const qs = tr.quests();
  // finish two of today's quests but don't claim them
  for (const i of [0, 1]) P().quests.list[i].progress = P().quests.list[i].target;
  tr.claim(2); // claim-less... quest 2 isn't done: must refuse
  const s0 = P().stars;
  const dayBefore = P().quests.day;
  clock.t += 86400000;
  tr.tick();
  check(P().quests.day !== dayBefore && P().quests.day === localDay(clock.t), 'new quests at midnight');
  check(P().quests.list.every((q) => q.progress === 0 && !q.claimed), 'fresh progress');
  check(P().stars >= s0 + qs[0].stars + qs[1].stars, `yesterday's finished quests were claimed for you (+${P().stars - s0} stars)`);
  check(count('progress:settled') === 1, 'settled once');
  check(P().counters.streak === 2, 'streak counts consecutive days: ' + P().counters.streak);
  // and a quest finished today makes three days in a row
  P().quests.list[0].progress = P().quests.list[0].target;
  tr.claim(0);
  check(P().counters.streak === 3 && !!P().badges.streak1, 'three days in a row: Daily Streak I badge');
  // skip a day: streak breaks
  clock.t += 2 * 86400000;
  tr.tick();
  for (const q of P().quests.list) q.progress = q.target;
  tr.claim(0);
  check(P().counters.streak === 1 && P().counters.streakBest === 3, 'missed a day: streak restarts, best stays 3');
}

// ------------------------------------------------------------------ 8. badges
section('badges');
{
  const earned0 = count('badge:earned');
  for (let i = 0; i < 10; i++) bus.emit('steal:success', { thief: me, victim: other, plant: {} });
  check(!!P().badges.firststeal && !!P().badges.thief1, 'First Heist + Master Thief I');
  for (let i = 0; i < 10; i++) bus.emit('steal:foiled', { thief: other, victim: me, by: me, cause: 'bonk' });
  check(!!P().badges.guardian1, 'Guardian I after stopping 10 thieves');
  for (let i = 0; i < 25; i++) bus.emit('monster:bonked', { monster: {}, by: me });
  check(!!P().badges.tamer1, 'Monster Tamer I after 25 monster bonks');
  bus.emit('pet:hatched', { player: me, egg: 'jungle', pet: 'dragon' });
  check(!!P().badges.legendary && !!P().badges.petlover1, 'Legendary Luck + Pet Lover I');
  bus.emit('gift', { from: me, to: other, plant: {} });
  bus.emit('trade:done', { a: other, b: me });
  check(!!P().badges.generous && !!P().badges.dealmaker, 'Generous + Deal Maker');
  for (let i = 0; i < 10; i++) bus.emit('emote', { player: me, id: 'dance2' });
  check(!!P().badges.dancer, 'Dancer after 10 dances');
  // the garden: rainbow + secret + own family plant, all planters
  const g = game.gardens[me.slot];
  g.planters.forEach((pl) => (pl.unlocked = true));
  const mine = PLANTS.find((x) => x.family === me.id);
  g.planters[0].plant = { uid: 9001, speciesId: 'daisy', mutation: 'rainbow', growTotal: 1, growLeft: 0, owner: me.slot };
  g.planters[1].plant = { uid: 9002, speciesId: mine.id, mutation: 'normal', growTotal: 1, growLeft: 0, owner: me.slot };
  me.speedLevel = 25;
  me.rebirths = 5;
  me.pos.z = 60 + 5 * 150 + 20;
  me.cash = 2e6;
  game._recomputeNetWorth();
  tr.tick();
  check(!!P().badges.rainbow && !!P().badges.secret && !!P().badges.namesake, 'Rainbow Hunter, Secret Keeper, That\'s Me!');
  check(!!P().badges.landlord && !!P().badges.speeddemon && !!P().badges.reborn2 && !!P().badges.explorer, 'Full Garden, Speed Demon, Reborn II, Explorer');
  check(!!P().badges.millionaire, 'Millionaire from net worth: ' + P().best.netWorth);
  P().unlocks = ['hat:a', 'hat:b', 'acc:c', 'trail:d', 'face:e'];
  tr.tick();
  check(!!P().badges.fashion, 'Fashionista from 5 Wardrobe unlocks');
  const n = count('badge:earned') - earned0;
  check(n >= 10, 'badge:earned fired for each new badge: ' + n);
  const all = tr.badges();
  check(all.length === cat.BADGES.length && all.every((b) => b.tiers.length >= 1), 'badge list for the UI: ' + all.length + ' families, ' + cat.ALL_BADGES.length + ' badges');
  const thief = all.find((b) => b.id === 'thief');
  check(thief.earned === 0 && thief.next.goal === 100 && thief.value >= 10, 'Master Thief shows tier I earned, next goal 100');
  // badges pay stars once
  const s = P().stars;
  tr.checkBadges();
  check(P().stars === s, 'no double badge stars');
}

// ------------------------------------------------------------------ 8b. Family Four: all four Secret plants in the garden
section('family four');
const cos = await import('../../src/characters/cosmetics.js');
const colEvents = [];
for (const n of ['collection:progress', 'collection:complete', 'almanac:sticker']) bus.on(n, (e) => colEvents.push([n, e]));
{
  const g = game.gardens[me.slot];
  const secrets = PLANTS.filter((x) => x.rarity === 'secret');
  const col = cat.COLLECTION.familyfour;
  check(col && col.items.length === 4 && secrets.every((s) => col.items.some((it) => it.id === s.id)), 'Family Four is the four Secret plants');
  check(cat.BADGE.familyfour?.tiers.join() === '4' && cat.BADGE_BY_ID.familyfour.cash?.min === 50000, 'familyfour badge: one tier at 4, pays cash (at least $50K)');
  check(!cos.isOwned(P(), 'hat', 'familycrown'), 'the Family Crown is locked before');
  const hat = cos.HAT_BY_ID.familycrown;
  check(hat && hat.price === 0 && hat.unlock === 'familyfour', 'Family Crown: badge-only hat');
  // a player who has only ever had their own family plant (the garden scan logged it from planter 1)
  for (const s of secrets) if (s.family !== me.id) delete P().almanac.s[s.id];
  tr.tick();
  check(tr.collections()[0].count === 1 && tr.collections()[0].items.find((it) => it.family === me.id).has, 'own family plant logged from the garden: 1/4');
  const cash0 = me.cash;
  const stars0 = P().stars;
  const ev0 = colEvents.length;
  secrets.filter((s) => s.family !== me.id).forEach((s, i) => {
    g.planters[2 + i].plant = { uid: 9100 + i, speciesId: s.id, mutation: 'normal', growTotal: 1, growLeft: 1, owner: me.slot };
  });
  tr.tick();
  const prog = colEvents.slice(ev0).filter((e) => e[0] === 'collection:progress').map((e) => e[1].count);
  check(prog.join() === '2,3,4', 'collection:progress 2/4, 3/4, 4/4: ' + prog);
  const done = colEvents.slice(ev0).filter((e) => e[0] === 'collection:complete');
  check(done.length === 1 && done[0][1].collection.id === 'familyfour', 'collection:complete once');
  check(!!P().badges.familyfour, 'Family Four badge earned at 4/4');
  check(cos.isOwned(P(), 'hat', 'familycrown'), 'the Family Crown is owned');
  const paid = done[0]?.[1].cash || 0;
  check(paid >= 50000 && done[0][1].banked === false && me.cash - cash0 === paid, `cash paid into the Endless garden: +${me.cash - cash0} (${paid})`);
  check(P().stars - stars0 === 200 + 3 * cat.ALMANAC.firstStars, `200 stars + a star per new sticker: +${P().stars - stars0}`);
  const view = tr.collections()[0];
  check(view.count === 4 && view.done && view.earnedAt > 0, 'collections() view: 4/4, done');
  // no double reward
  const s1 = P().stars;
  tr.tick();
  tr.checkBadges();
  check(P().stars === s1 && colEvents.filter((e) => e[0] === 'collection:complete').length === 1, 'no second reward');
  for (let i = 2; i < 5; i++) g.planters[i].plant = null;
  // counts stay consistent: the Badges tab and the online summary count the same badges
  const st = tr.bests();
  const { profileSummary } = await import('../../src/online/boards.js');
  check(st.totalBadges === cat.ALL_BADGES.length && profileSummary(P()).badges === st.badges, `badge counts agree: ${st.badges}/${st.totalBadges}, summary ${profileSummary(P()).badges}`);
}
{
  // completing it with no game running banks the cash for the next Endless game
  const saved = app.profileId;
  const savedGame = [app.game, app.human, app.state];
  app.game = null;
  app.human = null;
  app.state = 'title';
  app.profileId = 'dorian';
  const bank0 = P().counters.bankCash || 0;
  for (const s of PLANTS.filter((x) => x.rarity === 'secret')) tr.stamp(s.id, 'gold');
  const done = colEvents.filter((e) => e[0] === 'collection:complete').pop()[1];
  check(!!P().badges.familyfour && done.banked === true && done.cash >= 50000 && P().counters.bankCash === bank0 + done.cash, `no game: Family Four cash banked (${done.cash})`);
  check(cos.isOwned(P(), 'hat', 'familycrown'), "Dorian's crown is owned too");
  app.profileId = saved;
  [app.game, app.human, app.state] = savedGame;
}

// ------------------------------------------------------------------ 8c. Seed Almanac
section('seed almanac');
{
  const bitsOf = (id) => P().almanac.s[id] || 0;
  const other2 = game.players.find((p) => p !== me);
  // start from a blank Dustbowl page (the bot-driven game above may have grabbed some)
  for (const pid of cat.ALMANAC_PAGE.dustbowl.plants) delete P().almanac.s[pid];
  check(cat.ALMANAC_PAGES.length === BIOMES.length + 1 && cat.ALMANAC_PAGES.at(-1).id === 'secret', `a page per biome plus Secret (${cat.ALMANAC_PAGES.length})`);
  check(cat.ALMANAC_PAGES.every((pg) => pg.plants.length > 0) && new Set(cat.ALMANAC_PAGES.flatMap((pg) => pg.plants)).size === PLANTS.length, 'every plant is on exactly one page');
  const stars = cat.ALMANAC_PAGES.filter((pg) => pg.badge).map((pg) => pg.stars);
  check(stars[0] === 20 && stars.at(-1) === 60 && stars.every((s, i) => !i || s >= stars[i - 1]), 'page badges pay 20..60 stars, deeper pays more: ' + stars);
  const id = 'desertrose';
  check(!bitsOf(id), 'no Desert Rose sticker yet');
  const s0 = P().stars;
  const n0 = colEvents.filter((e) => e[0] === 'almanac:sticker').length;
  // other players' plants never stamp your book
  bus.emit('seed:grabbed', { player: other2, speciesId: id, mutation: 'gold', rarity: 'rare' });
  bus.emit('steal:success', { thief: other2, victim: me, plant: { speciesId: id, mutation: 'diamond' } });
  check(!bitsOf(id), "other players' grabs and steals don't count");
  bus.emit('seed:grabbed', { player: me, speciesId: id, mutation: 'gold', rarity: 'rare' });
  check(bitsOf(id) === 2 && P().stars === s0 + 1, 'grab a Gold Desert Rose: gold bit, +1 star (first sticker)');
  const last = colEvents.filter((e) => e[0] === 'almanac:sticker').pop()[1];
  check(last.speciesId === id && last.mutation === 'gold' && last.first && cat.stickerName(id, 'gold') === 'Gold Desert Rose', 'almanac:sticker "NEW! Gold Desert Rose"');
  bus.emit('seed:grabbed', { player: me, speciesId: id, mutation: 'gold', rarity: 'rare' });
  check(P().stars === s0 + 1 && colEvents.filter((e) => e[0] === 'almanac:sticker').length === n0 + 1, 'the same sticker again: nothing new');
  bus.emit('plant:planted', { player: me, plant: { speciesId: id, mutation: 'normal' } });
  check(bitsOf(id) === 3, 'plant a normal one: normal bit');
  bus.emit('steal:success', { thief: me, victim: other2, plant: { speciesId: id, mutation: 'diamond' }, planter: null, soldFor: 10 });
  check(bitsOf(id) === 7, 'steal a Diamond one (sold on the spot): diamond bit');
  bus.emit('gift', { from: other2, to: me, plant: { speciesId: id, mutation: 'rainbow' } });
  check(bitsOf(id) === 15 && cat.isMastered(bitsOf(id)), 'gifted a Rainbow one: all four finishes');
  check(P().stars === s0 + cat.ALMANAC.firstStars + cat.ALMANAC.masterStars, `Mastered pays 5 stars (+${P().stars - s0} in all)`);
  check(colEvents.filter((e) => e[0] === 'almanac:sticker').pop()[1].mastered === true, 'almanac:sticker says mastered');
  bus.emit('trade:done', { a: other2, b: me, plantsA: [{ speciesId: 'cactus', mutation: 'normal' }], plantsB: [{ speciesId: 'tater', mutation: 'gold' }] });
  check(bitsOf('cactus') === 1 && !bitsOf('tater'), 'a trade stamps what you got, not what you gave');
  bus.emit('plant:giant', { player: me, plant: { speciesId: 'cactus', mutation: 'normal', size: 'giant' } });
  check(bitsOf('cactus') === (1 | 32), 'a Giant Harvest adds its size stamp (32)');
  bus.emit('plant:giant', { player: other2, plant: { speciesId: 'cactus', mutation: 'normal', size: 'titan' } });
  check(bitsOf('cactus') === 33, "someone else's titan: no stamp");
  // fill the Dustbowl page: every plant in all four finishes -> page badge
  const page = cat.ALMANAC_PAGE.dustbowl;
  check(!P().badges[page.badge], 'Dustbowl page badge not yet');
  const sb = P().stars;
  for (const pid of page.plants) for (const f of cat.FINISHES) bus.emit('seed:grabbed', { player: me, speciesId: pid, mutation: f, rarity: 'rare' });
  check(!!P().badges.alm_dustbowl, 'full page: badge alm_dustbowl');
  const masteredNow = page.plants.filter((x) => x !== id).length; // Desert Rose was already mastered
  const newPlants = page.plants.filter((x) => x !== id && x !== 'cactus').length;
  check(P().stars - sb === page.stars + masteredNow * cat.ALMANAC.masterStars + newPlants * cat.ALMANAC.firstStars, `page stars ${page.stars} + mastered + first stickers (+${P().stars - sb})`);
  const view = tr.almanac().find((pg) => pg.id === 'dustbowl');
  check(view.full && view.stickers === view.total && view.mastered === page.plants.length && view.earnedAt > 0, 'almanac() view: page full, stickers ' + view.stickers + '/' + view.total);
  check(view.plants.find((x) => x.id === 'cactus').sizes.join() === 'giant', 'the view lists size stamps');
  // three full pages: Almanac Ace I -> the Leaf Hat; every page: the Golden Trowel noodle
  check(!cos.isOwned(P(), 'hat', 'leafhat') && !cos.isOwned(P(), 'noodle', 'trowel'), 'Leaf Hat and Golden Trowel locked');
  for (const pgId of ['field', 'greenhollow']) for (const pid of cat.ALMANAC_PAGE[pgId].plants) for (const f of cat.FINISHES) tr.stamp(pid, f);
  check(!!P().badges.almanac1 && cos.isOwned(P(), 'hat', 'leafhat'), 'three full pages: Almanac Ace I, Leaf Hat owned');
  check(!P().badges.almanac2 && !cos.isOwned(P(), 'noodle', 'trowel'), 'not every page yet');
  for (const pg of cat.BADGE_PAGES) for (const pid of pg.plants) for (const f of cat.FINISHES) tr.stamp(pid, f);
  check(!!P().badges.almanac2 && cos.isOwned(P(), 'noodle', 'trowel') && cat.BADGE_PAGES.every((pg) => P().badges[pg.badge]), 'every page: all page badges, Almanac Ace II, Golden Trowel owned');
  check(cos.sanitizeLook({ noodle: 'trowel' }, 'maddie').noodle === 'trowel' && cos.sanitizeLook({ noodle: 'nope' }, 'maddie').noodle === null, 'looks keep the special noodle id, drop unknown ones');
  // the shared log: bits are masked and unknown species dropped when a profile loads
  tr.flush();
  const fresh = await import('../../src/core/profiles.js?almanac=' + Date.now());
  const p2 = fresh.getProfile('maddie');
  check(p2.almanac.v === 1 && p2.almanac.s[id] === 15 && p2.almanac.s.cactus === (15 | 32) && JSON.stringify(p2.almanac.s) === JSON.stringify(P().almanac.s), 'normalize keeps the almanac across a reload');
  const p3 = fresh.replaceProfile('micah', { almanac: { v: 1, s: { daisy: 9, bogus: 3, tulip: 'x', pea: -1, sunflower: 129 } } });
  check(JSON.stringify(p3.almanac.s) === JSON.stringify({ daisy: 9, sunflower: 1 }), 'normalize drops bad entries and masks bits: ' + JSON.stringify(p3.almanac.s));
}

// ------------------------------------------------------------------ 9. showdown results
section('showdown');
{
  endGame();
  game = startGame('showdown', 'chaos', 8);
  me = app.human;
  const wins0 = P().best.showdownWins;
  const played0 = P().counters.showdowns || 0;
  const chaos0 = P().counters.chaosWins || 0;
  game.netWorth.set(me, 777777);
  bus.emit('match:end', { ranking: [me, ...game.players.filter((p) => p !== me)].map((p) => ({ player: p, netWorth: game.netWorth.get(p) || 0 })) });
  check(P().best.showdownWins === wins0 + 1 && P().counters.chaosWins === chaos0 + 1, 'Showdown win on Chaos counted');
  check(P().best.showdownBest >= 777777, 'best Showdown net worth: ' + P().best.showdownBest);
  check(!!P().badges.chaos && !!P().badges.champ1, 'Chaos Conqueror + Showdown Champ I');
  // a loss
  bus.emit('match:end', { ranking: [...game.players.filter((p) => p !== me), me].map((p) => ({ player: p, netWorth: 5 })) });
  check(P().best.showdownWins === wins0 + 1 && P().counters.showdowns === played0 + 2, 'a 4th place is a Showdown played, not won');
  endGame();
}

// ------------------------------------------------------------------ 10. persistence
section('persistence');
{
  tr.flush();
  const raw = store.get('steal-a-seed:v1:profile:maddie');
  check(!!raw, 'profile saved to storage');
  const snap = JSON.parse(raw);
  // a fresh module instance reads it back like a page reload would
  const fresh = await import('../../src/core/profiles.js?reload=' + Date.now());
  const p2 = fresh.getProfile('maddie');
  check(p2.stars === P().stars && p2.stars > 0, 'stars survive a reload: ' + p2.stars);
  check(JSON.stringify(p2.badges) === JSON.stringify(P().badges), 'badges survive a reload (' + Object.keys(p2.badges).length + ')');
  check(p2.counters.steals === P().counters.steals && p2.counters.questsDone === P().counters.questsDone, 'counters survive a reload');
  check(p2.quests.day === P().quests.day && p2.quests.list.length === 3 && p2.quests.list[0].id === P().quests.list[0].id, 'today\'s quests survive a reload');
  check(p2.best.showdownWins === P().best.showdownWins && p2.best.netWorth === P().best.netWorth, 'personal bests survive a reload');
  check(snap.updatedAt > 0, 'updatedAt stamped');
  // debounced save: a counter bump alone doesn't hit storage until 10 s pass
  const writes = () => store.get('steal-a-seed:v1:profile:maddie');
  const w0 = writes();
  game = startGame('endless', 'normal', 12);
  me = app.human;
  const w1 = writes();
  bus.emit('plant:sold', { player: me, value: 1 });
  tr.tick();
  const soldSaved = JSON.parse(writes()).counters.sold || 0;
  check(soldSaved < P().counters.sold, 'counter bumps wait for the 10 s save');
  clock.t += 11000;
  tr.tick();
  check(JSON.parse(writes()).counters.sold === P().counters.sold, 'saved after 10 s');
  check(w0 !== undefined && w1 !== undefined, 'writes observed');
}

// ------------------------------------------------------------------ 11. refit on game start
section('refit');
{
  endGame();
  clock.t += 86400000;
  P().counters.lastSpeed = 0;
  P().counters.lastRebirths = 0;
  P().quests = { day: '', list: [] };
  tr.quests();
  const before = P().quests.list.map((q) => q.s);
  // the player turns out to be much further along in their Endless garden
  const g = startGame('endless', 'normal', 13);
  g.human.speedLevel = 16;
  bus.emit('game:start', { game: g, human: g.human });
  check(P().quests.list.every((q) => q.s === 5), 'untouched quests are re-fitted to the real progress: ' + before + ' -> ' + P().quests.list.map((q) => q.s));
  endGame();
}

tr.dispose();
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
