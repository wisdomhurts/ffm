// The Seed Gazette: a family newspaper the game writes as you play ("MICAH PINCHES DAD'S RAINBOW CACTUS!"),
// shown on a plaza billboard (world/gazetteBoard.js) and as a front page you can save for the fridge
// (ui/gazette.js). Pure JS (no DOM) so the Node tests drive it with synthetic bus events.
//
// Client-only: every device writes its own paper from the gameplay events on its bus (online, the host's
// events are replayed on the mirror game), so nothing new crosses the network. Events of features that are
// not in this build simply never fire.
//
// createGazette(app, {now, keep}) -> {
//   stories()      newest first: [{k: kind, t: ms, s: score 0-100, head, sub, who: [{n: name, c: colour}]}]
//   front()        the front page: {date, lead, more: [up to 3], boxes: [{id, title, story, empty}] x 6}
//   onChange(fn)   -> off; called after every new story (the billboard and an open front page redraw)
//   dispose()
// }
// Rules: stories come from templates only (LINES, kind words), filled with player names (sanitizeName'd
// already), catalog names and numbers; never typed text. The family profiles' Dorian and Esther are "Dad" and
// "Mom" (not a friend or a stranger who happens to share the name). One story per kind and lead actor every
// DEDUPE ms; stories where only bots took part at most one per BOT_GAP ms. Faces are coloured initials, never
// photos. The last KEEP stories (and today's bonk counts) live in localStorage `gazette:<profileId>`, out of
// the profile and the cloud.
import { bus } from '../core/events.js';
import { load, save } from '../core/save.js';
import { PLANT, RARITY, MUTATIONS, CHARACTER, BIOMES, biomeIndexAtZ } from '../config.js';
import { PET } from '../pets/catalog.js';
import { roomIsPrivate } from './chat.js';

export const KEEP = 20;
export const DEDUPE = 20000;
export const BOT_GAP = 15000;

const MYTHIC = RARITY.mythic.tier;
const SECRET = RARITY.secret.tier;
const NICK = { dorian: 'Dad', esther: 'Mom' };
const MUT_BONUS = { gold: 6, diamond: 10, rainbow: 16 };
const PET_SCORE = { common: 25, rare: 35, epic: 45, legendary: 60, mythic: 70, divine: 85, secret: 95 };
const TRICK = { backflip: 'a backflip', spin: 'a spin', jump: 'a big jump', dance: 'a happy dance', roll: 'a roll', loop: 'a loop the loop', barrel: 'a barrel roll', spinrise: 'a twirl', dive: 'a dive' };

// Headline and sub-line templates by kind. {a} {b} {c} are names ({a_s}: "Dad's"), {plant} {pet} {m} are
// catalog names, {n} a number, {an_plant} / {an_pet} with "a" or "an". The headline picks one at random.
export const LINES = {
  heist: { head: ['{a} pinches {b_s} {plant}!', '{a} sneaks off with {b_s} {plant}!', 'Garden heist! {a} grabs {b_s} {plant}!'], sub: ['{b} wants it back!', 'Lock those gates, everyone!'] },
  rescue: { head: ['Hero {a} rescues {b_s} {plant}!', '{a} to the rescue!'], sub: ['{c} had to drop {b_s} {plant}.', '{b} says thank you!'] },
  foil: { head: ['{a} saves the day!', 'Not so fast, {c}!'], sub: ['{c} dropped {b_s} {plant}.', '{a} stopped {c} with a big bonk.'] },
  guard: { head: ['Guard Gnome on duty!'], sub: ['{c} got bonked in {b_s} garden.'] },
  chomp: { head: ['A {m} stops a seed thief!'], sub: ['{c} dropped {b_s} {plant}.'] },
  slip: { head: ['Whoops! {a} slips on {b_s} banana!', 'Banana alert! {a} goes flying!'], sub: ['Watch where you step!', '{b} laughs all the way home.'] },
  seed: { head: ['{a} finds {an_plant}!', 'Wow! {a} grabs {an_plant}!'], sub: ['A shiny {r} seed!', 'Straight from {z}!'] },
  secret: { head: ['Secret seed! {a} finds the {plant}!'], sub: ['Shhh! Keep it safe!'] },
  giant: { head: ['{a} grows a {size} {plant}!', 'Look how big! {a_s} {plant} is {size}!'], sub: ['Bigger plants earn more cash!'] },
  boss: { head: ['Big Chomp is beaten!', 'Bye bye, Big Chomp!'], sub: ['{a} led the charge.', 'The gardens are safe again!'] },
  drop: { head: ['{a} catches a falling egg!'], sub: ['Look for the light beam!'] },
  hatch: { head: ['{a} hatches {an_pet}!', 'Welcome home, little {pet}!'], sub: ['A brand new {r} friend for {a}!'] },
  base: { head: ['{a_s} base reaches level {n}!'], sub: ['What a fancy garden!'] },
  rebirth: { head: ['{a} is reborn!', 'A fresh start for {a}!'], sub: ['Rebirth number {n}. Plants grow more cash now!'] },
  match: { head: ['{a} wins the Family Showdown!'], sub: ['{b} came second. What a game!', 'Hooray for {a}!'] },
  away: { head: ['Welcome back, {a}!'], sub: ['Your garden made {cash} while you were away!', 'The garden kept growing!'] },
  trick: { head: ['{a_s} {pet} does {trick}!'], sub: ['Give that pet a treat!'] },
  trade: { head: ['{a} and {b} shake on a deal!'], sub: ['Happy trading!'] },
  gnome: { head: ['{a} finds Golden Gnome {n}!', 'Gnome spotted! {a} finds number {n}!'], sub: ['{left} more still hiding!'] },
  gnomeAll: { head: ['{a} finds every Golden Gnome!'], sub: ['Gnome Hat and Golden Gnome Noodle unlocked!'] },
  caught: { head: ['A {m} boops {a}!'], sub: ['{a} dropped the seed and ran!'] },
  bonked: { head: [], sub: ['Bonked {n} times today. Ouch!', '{n} bonks today. Keep running!'] },
};

/** The six front page boxes: the story kinds they show (best score wins). 'bonked' counts today's bonks. */
export const BOXES = [
  { id: 'heist', title: 'Biggest Heist', kinds: ['heist'], empty: 'No heists yet. Guard your garden!' },
  { id: 'rescue', title: 'Best Rescue', kinds: ['rescue', 'foil', 'guard'], empty: 'Bonk a thief to save a plant!' },
  { id: 'seed', title: 'Top Seed', kinds: ['secret', 'seed', 'giant'], empty: 'Grab a Mythic seed or better!' },
  { id: 'slip', title: 'Slipperiest Moment', kinds: ['slip'], empty: 'Drop a banana and wait...' },
  { id: 'pet', title: 'Pet of the Day', kinds: ['hatch', 'drop', 'trick'], empty: 'Hatch an egg or tap your pet!' },
  { id: 'bonked', title: 'Most Bonked', kinds: [], empty: 'Nobody bonked yet!' },
];

const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const possessive = (n) => (/s$/i.test(n) ? n + "'" : n + "'s");
const plantName = (pl) => {
  const sp = PLANT[pl?.speciesId];
  if (!sp) return 'plant';
  const m = MUTATIONS[pl.mutation]?.name;
  return (m ? m + ' ' : '') + sp.name;
};
const short = (n) => {
  n = Math.floor(Math.max(0, +n || 0));
  if (n < 1000) return '$' + n;
  for (const [u, v] of [['B', 1e9], ['M', 1e6], ['K', 1e3]]) if (n >= v) return '$' + +(n / v).toFixed(n >= v * 10 ? 0 : 1) + u;
  return '$' + n;
};
const pad2 = (n) => String(n).padStart(2, '0');
const dayOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Fill a template: {a} {b_s} {plant}... from vars (unknown slots are left out). */
export function fill(line, vars) {
  return line.replace(/\{([a-z_]+)\}/g, (_, k) => {
    if (vars[k] != null) return String(vars[k]);
    if (k.endsWith('_s') && vars[k.slice(0, -2)] != null) return possessive(String(vars[k.slice(0, -2)]));
    if (k.startsWith('an_') && vars[k.slice(3)] != null) return an(String(vars[k.slice(3)]));
    return '';
  }).replace(/\s+/g, ' ').trim();
}

// a stored story read back from localStorage: only plain, short fields survive
function cleanStory(x) {
  if (!x || typeof x !== 'object' || typeof x.head !== 'string' || !LINES[x.k]) return null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const who = Array.isArray(x.who) ? x.who.slice(0, 3).filter((w) => w && typeof w.n === 'string').map((w) => ({ n: w.n.slice(0, 24), c: /^#[0-9a-f]{6}$/i.test(w.c) ? w.c : '#556070' })) : [];
  return { k: x.k, t: Number.isFinite(x.t) ? x.t : 0, s: Math.max(0, Math.min(100, +x.s || 0)), head: str(x.head, 120), sub: str(x.sub, 120), who };
}

export function createGazette(app, { now = () => Date.now(), keep = KEEP } = {}) {
  const offs = [];
  const on = (name, fn) => offs.push(bus.on(name, (e) => {
    try {
      if (live()) fn(e || {});
    } catch (err) {
      console.warn('[gazette] story failed', name, err);
    }
  }));
  const listeners = new Set();
  let pid = null;
  let list = []; // newest first
  let bonks = { day: '', who: Object.create(null) };
  const lastBy = new Map(); // kind:name -> ms
  let lastBotOnly = -Infinity;
  let bonkSave = 0;

  // only real games: not the title screen's demo match
  const live = () => !!app.human && !!app.game && app.state !== 'title';
  const key = () => 'gazette:' + pid;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)] || '';

  function load_() {
    pid = app.profile?.id || null;
    const d = pid ? load(key(), null) : null;
    list = Array.isArray(d?.list) ? d.list.map(cleanStory).filter(Boolean).slice(0, keep) : [];
    // today's bonk counts: plain numbers and names only (a null-prototype map: names are any player's)
    const b = d?.bonk;
    bonks = { day: typeof b?.day === 'string' ? b.day : '', who: Object.create(null) };
    if (b?.who && typeof b.who === 'object') {
      for (const [k, v] of Object.entries(b.who).slice(0, 16)) {
        if (Number.isFinite(v?.n)) bonks.who[k.slice(0, 24)] = { n: v.n, c: /^#[0-9a-f]{6}$/i.test(v.c) ? v.c : '#556070', r: typeof v.r === 'string' ? v.r.slice(0, 24) : k };
      }
    }
    lastBy.clear();
  }
  function persist() {
    if (pid) save(key(), { v: 1, list, bonk: bonks });
  }

  /** Display name: the family profiles' Dorian and Esther are Dad and Mom (also their bots). */
  function nameOf(p) {
    if (!p) return 'Someone';
    const nick = NICK[p.profileId];
    const family = nick && p.name === CHARACTER[p.profileId]?.name;
    if (family && (p.kind !== 'remote' || roomIsPrivate(app.online?.room))) return nick;
    return p.name || 'Someone';
  }
  const face = (p) => ({ n: p?.name || '?', c: p?.char?.color || '#556070' });
  const isBot = (p) => !p || p.kind === 'bot';

  /** Post a story: kind, score, the players in it (first = lead actor) and the template vars. */
  function post(k, s, players, vars = {}, { force = false } = {}) {
    const t = now();
    const lead = players[0];
    const dk = k + ':' + (lead?.name || '');
    if (!force) {
      if (t - (lastBy.get(dk) ?? -Infinity) < DEDUPE) return null;
      if (players.every(isBot)) {
        if (t - lastBotOnly < BOT_GAP) return null;
        lastBotOnly = t;
      }
    }
    lastBy.set(dk, t);
    const L = LINES[k];
    const story = { k, t, s: Math.round(Math.max(0, Math.min(100, s))), head: fill(pick(L.head), vars), sub: fill(pick(L.sub), vars), who: players.filter(Boolean).slice(0, 3).map(face) };
    // a rescue and the bonk that made it are one moment: keep the rescue
    if (k === 'rescue') list = list.filter((x) => !(x.k === 'foil' && t - x.t < 3000));
    list.unshift(story);
    if (list.length > keep) list.length = keep;
    persist();
    changed();
    return story;
  }
  function changed() {
    const f = front();
    try {
      app.world?.gazette?.show?.(f);
    } catch (e) {
      console.warn('[gazette] board failed', e);
    }
    for (const fn of listeners) {
      try {
        fn(f);
      } catch (e) {
        console.warn('[gazette] listener failed', e);
      }
    }
  }

  const tierOf = (pl) => RARITY[PLANT[pl?.speciesId]?.rarity]?.tier ?? 0;
  const mutBonus = (pl) => MUT_BONUS[pl?.mutation] || 0;

  // ---------------------------------------------------------------- the news (bus events)

  on('steal:success', ({ thief, victim, plant }) => {
    if (!thief || !victim || thief === victim) return;
    const tier = tierOf(plant);
    post('heist', tier >= SECRET ? 90 : 30 + tier * 5 + mutBonus(plant), [thief, victim], { a: nameOf(thief), b: nameOf(victim), plant: plantName(plant) });
  });
  on('steal:rescued', ({ hero, victim, thief, plant }) => {
    if (!hero || !victim) return;
    post('rescue', 60 + tierOf(plant) * 3, [hero, victim, thief], { a: nameOf(hero), b: nameOf(victim), c: nameOf(thief), plant: plantName(plant) });
  });
  on('steal:foiled', ({ thief, victim, plant, by, cause }) => {
    if (!thief || !victim || !plant) return;
    const vars = { a: nameOf(by), b: nameOf(victim), c: nameOf(thief), plant: plantName(plant) };
    if (cause === 'guard') return post('guard', 30, [victim, thief], vars);
    if (cause === 'monster') {
      const m = BIOMES[biomeIndexAtZ(thief.pos?.z ?? 0)]?.monster?.name;
      return post('chomp', 25, [thief, victim], { ...vars, m: m || 'road monster' });
    }
    if (!by || by === thief) return;
    // the rescue story (Family Hero) tells this one better
    if (list.some((x) => x.k === 'rescue' && now() - x.t < 3000)) return;
    post('foil', 35 + tierOf(plant) * 2, [by, thief, victim], vars);
  });
  on('banana:slip', ({ target, owner }) => {
    if (!target || !owner || target === owner) return;
    post('slip', 25, [target, owner], { a: nameOf(target), b: nameOf(owner) });
  });
  on('seed:grabbed', ({ player, speciesId, mutation, rarity }) => {
    const tier = RARITY[rarity]?.tier ?? 0;
    if (!player || (tier < MYTHIC && mutation !== 'rainbow')) return;
    const pl = { speciesId, mutation };
    const z = BIOMES[biomeIndexAtZ(player.pos?.z ?? 0)]?.name;
    if (tier >= SECRET) return post('secret', 95, [player], { a: nameOf(player), plant: plantName(pl) });
    post('seed', 40 + Math.max(0, tier - MYTHIC) * 6 + mutBonus(pl), [player], { a: nameOf(player), plant: plantName(pl), r: RARITY[rarity]?.name || 'rare', z: z || 'the Seed Road' });
  });
  on('plant:giant', ({ garden, plant, size }) => {
    const owner = garden?.owner;
    if (!owner || !plant) return;
    const titan = (size || plant.size) === 'titan';
    post('giant', titan ? 90 : 70, [owner], { a: nameOf(owner), plant: plantName(plant), size: titan ? 'titan' : 'giant' });
  });
  on('boss:defeated', (e) => {
    const top = e.top || e.crown || e.by || e.player || null;
    post('boss', 85, [top].filter(Boolean), { a: top ? nameOf(top) : 'The family' }, { force: true });
  });
  on('drop:claimed', ({ player }) => {
    if (player) post('drop', 45, [player], { a: nameOf(player) });
  });
  on('pet:hatched', ({ player, pet }) => {
    const def = PET[pet];
    if (!player || !def) return;
    post('hatch', PET_SCORE[def.rarity] || 30, [player], { a: nameOf(player), pet: def.name, r: def.rarity.charAt(0).toUpperCase() + def.rarity.slice(1) });
  });
  on('base:upgraded', ({ player, level }) => {
    if (!player || !(level >= 2)) return;
    post('base', Math.min(70, 20 + level * 4), [player], { a: nameOf(player), n: level });
  });
  on('rebirth', ({ player, rebirths }) => {
    if (player) post('rebirth', 75, [player], { a: nameOf(player), n: rebirths || 1 });
  });
  on('match:end', ({ ranking }) => {
    const ps = (Array.isArray(ranking) ? ranking : []).map((r) => r?.player || r).filter(Boolean);
    if (ps.length) post('match', 92, ps.slice(0, 2), { a: nameOf(ps[0]), b: ps[1] ? nameOf(ps[1]) : 'Everyone' }, { force: true });
  });
  on('away:report', (e) => {
    const p = e.player || app.human;
    post('away', 50, [p], { a: nameOf(p), cash: short(e.cash ?? e.credit) }, { force: true });
  });
  on('pet:trick', ({ owner, k, pet, trick }) => {
    const p = app.game?.players?.[owner];
    const def = PET[pet];
    if (!p || !def) return;
    post('trick', 12, [p], { a: nameOf(p), pet: p.petNames?.[k] || def.name, trick: TRICK[trick] || 'a trick' });
  });
  on('trade:done', ({ a, b }) => {
    if (a && b) post('trade', 45, [a, b], { a: nameOf(a), b: nameOf(b) });
  });
  on('gnome:found', ({ player, count, total }) => {
    const p = player || app.human;
    if (count >= total) post('gnomeAll', 95, [p], { a: nameOf(p) }, { force: true });
    else post('gnome', 55, [p], { a: nameOf(p), n: count, left: total - count }, { force: true });
  });
  on('monster:caught', ({ monster, target, lost }) => {
    if (!target || !lost || lost.kind === 'plant') return; // a stolen plant: the steal:foiled story tells it
    const m = BIOMES.find((b) => b.monster?.id === monster?.type)?.monster?.name;
    post('caught', 20, [target], { a: nameOf(target), m: m || 'road monster' });
  });
  // today's bonks (the Most Bonked box): counted, never a story of their own
  on('player:hit', ({ target, by, cause }) => {
    if (cause !== 'bonk' || !target || !by || target === by) return;
    const d = dayOf(now());
    if (bonks.day !== d) bonks = { day: d, who: Object.create(null) };
    const w = (bonks.who[nameOf(target)] ||= { n: 0, c: target.char?.color || '#556070', r: target.name });
    w.n++;
    clearTimeout(bonkSave);
    bonkSave = setTimeout(persist, 2000);
  });
  offs.push(bus.on('profile:active', () => {
    load_();
    changed();
  }));

  // ---------------------------------------------------------------- the front page

  function front() {
    const t = now();
    // the lead: big news first, a little fresher wins a tie
    const rank = (x) => x.s - Math.min(30, (t - x.t) / 60000);
    const lead = list.length ? list.reduce((a, b) => (rank(b) > rank(a) ? b : a)) : null;
    const more = list.filter((x) => x !== lead).slice(0, 3);
    const boxes = BOXES.map((b) => {
      if (b.id === 'bonked') {
        const day = dayOf(t);
        const top = bonks.day === day ? Object.entries(bonks.who).sort((x, y) => y[1].n - x[1].n)[0] : null;
        const story = top ? { k: 'bonked', t, s: 0, head: top[0], sub: fill(LINES.bonked.sub[top[1].n % 2], { n: top[1].n }), who: [{ n: top[1].r || top[0], c: top[1].c }] } : null;
        return { id: b.id, title: b.title, story, empty: b.empty };
      }
      const story = list.filter((x) => b.kinds.includes(x.k)).reduce((a, x) => (!a || x.s > a.s ? x : a), null);
      return { id: b.id, title: b.title, story, empty: b.empty };
    });
    const date = new Date(t).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return { date, lead, more, boxes, count: list.length };
  }

  load_();
  changed(); // the billboard shows the last paper straight away
  return {
    stories: () => list.slice(),
    front,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    refresh: changed,
    dispose() {
      offs.forEach((f) => f());
      clearTimeout(bonkSave);
      listeners.clear();
    },
  };
}
