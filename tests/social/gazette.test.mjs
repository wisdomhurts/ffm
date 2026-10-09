// The Seed Gazette (no browser): synthetic gameplay events give the expected headlines, every template line
// is kid-safe (the network's isCleanLine) with names filled in, Mom and Dad only for the family's own
// profiles, one story per kind and actor every 20 s, bot-only stories at most one per 15 s, nothing from
// the title screen's demo game, the front page's boxes, and the last 20 stories kept per profile.
// Run: node --test tests/social/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

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
const { PLANTS, PLANT, BIOMES, CHARACTER } = await import('../../src/config.js');
const { PETS } = await import('../../src/pets/catalog.js');
const { isCleanLine } = await import('../../src/net/protocol.js');
const { createGazette, LINES, BOXES, KEEP, DEDUPE, BOT_GAP, fill } = await import('../../src/social/gazette.js');

const player = (profileId, { kind = 'bot', name = CHARACTER[profileId]?.name || 'Zoe', slot = 0 } = {}) => ({
  name, kind, profileId, slot, char: { id: profileId, color: CHARACTER[profileId]?.color || '#2f80ed' }, pos: { x: 0, y: 0, z: 0 }, petNames: [],
});

function setup(profileId = 'micah') {
  let t = Date.UTC(2026, 9, 9, 15, 0, 0);
  const shown = [];
  const me = player(profileId, { kind: 'local', slot: 3 });
  const dad = player('dorian', { slot: 0 });
  const mom = player('esther', { slot: 1 });
  const mati = player('maddie', { slot: 2 });
  const app = {
    profileId,
    get profile() {
      return profiles.getProfile(this.profileId);
    },
    human: me,
    game: { players: [dad, mom, mati, me] },
    state: 'playing',
    online: null,
    world: { gazette: { show: (f) => shown.push(f) } },
  };
  store.delete('steal-a-seed:v1:gazette:' + profileId);
  const gz = createGazette(app, { now: () => t });
  return { app, gz, me, dad, mom, mati, shown, tick: (ms) => (t += ms) };
}
const plant = (rarity, mutation = 'normal') => ({ speciesId: PLANTS.find((p) => p.rarity === rarity && !p.family).id, mutation });

test('a heist makes the headline, with Dad for the family dad', () => {
  const { gz, me, dad, shown } = setup();
  const pl = plant('rare', 'rainbow');
  bus.emit('steal:success', { thief: me, victim: dad, plant: pl });
  const s = gz.stories()[0];
  assert.equal(s.k, 'heist');
  assert.match(s.head, /Micah/);
  assert.match(s.head, /Dad's Rainbow /);
  assert.ok(s.head.includes(PLANT[pl.speciesId].name));
  assert.deepEqual(s.who.map((w) => w.n), ['Micah', 'Dorian'], 'faces use the real names (coloured initials)');
  assert.ok(s.who.every((w) => /^#[0-9a-f]{6}$/i.test(w.c)), 'and family colours, never photos');
  assert.ok(shown.at(-1)?.lead === s, 'the billboard gets the new front page');
  gz.dispose();
});

test('Mom and Dad only for the family profiles', () => {
  const { app, gz, me } = setup('maddie');
  const friend = player('p_zz12ab', { name: 'Dorian', slot: 1 }); // a friend's profile that happens to share the name
  bus.emit('banana:slip', { target: friend, owner: me });
  assert.match(gz.stories()[0].head, /Dorian/, 'a friend called Dorian keeps the name');
  const remote = player('esther', { kind: 'remote', slot: 2 });
  app.online = { room: { code: 'ABCDE', private: false } };
  bus.emit('banana:slip', { target: remote, owner: me });
  assert.match(gz.stories()[0].head, /Esther/, 'a stranger online is never "Mom"');
  app.online = { room: { code: 'ABCDE', private: true, faceOk: true } };
  const remote2 = player('esther', { kind: 'remote', slot: 2, name: 'Esther' });
  bus.emit('steal:success', { thief: remote2, victim: me, plant: plant('common') });
  assert.match(gz.stories()[0].head, /Mom/, 'the family in a private room is');
  gz.dispose();
});

test('one story per kind and actor every 20 s; bot-only news at most every 15 s', () => {
  const { gz, me, dad, mom, mati, tick } = setup('dorian');
  bus.emit('steal:success', { thief: mati, victim: dad, plant: plant('common') });
  bus.emit('steal:success', { thief: mom, victim: mati, plant: plant('common') });
  assert.equal(gz.stories().length, 1, 'a second bot-only heist straight away is dropped');
  tick(BOT_GAP + 10);
  bus.emit('steal:success', { thief: mom, victim: mati, plant: plant('common') });
  assert.equal(gz.stories().length, 2, 'after the gap it runs');
  bus.emit('steal:success', { thief: me, victim: mom, plant: plant('rare') });
  bus.emit('steal:success', { thief: me, victim: mati, plant: plant('rare') });
  assert.equal(gz.stories().length, 3, "the player's second heist within 20 s is the same story");
  tick(DEDUPE + 10);
  bus.emit('steal:success', { thief: me, victim: mati, plant: plant('rare') });
  assert.equal(gz.stories().length, 4);
  gz.dispose();
});

test('the title screen demo match never makes the news', () => {
  const { app, gz, mom, mati } = setup('esther');
  app.state = 'title';
  bus.emit('steal:success', { thief: mom, victim: mati, plant: plant('epic') });
  app.state = 'playing';
  app.human = null;
  bus.emit('steal:success', { thief: mom, victim: mati, plant: plant('epic') });
  assert.equal(gz.stories().length, 0);
  gz.dispose();
});

test('every kind of news, including features that may not be in this build', () => {
  const { gz, me, dad, mom, mati, tick } = setup('micah');
  const kinds = () => gz.stories().map((s) => s.k);
  const step = () => tick(DEDUPE + BOT_GAP);
  bus.emit('seed:grabbed', { player: me, speciesId: 'starlotus', mutation: 'gold', rarity: 'mythic' });
  bus.emit('seed:grabbed', { player: mom, speciesId: 'daisy', mutation: 'normal', rarity: 'common' });
  assert.deepEqual(kinds(), ['seed'], 'only Mythic seeds or better (or rainbow ones) are news');
  step();
  bus.emit('steal:foiled', { thief: mom, victim: me, plant: plant('rare'), by: me, cause: 'bonk' });
  step();
  bus.emit('steal:foiled', { thief: dad, victim: me, plant: plant('rare'), by: null, cause: 'guard' });
  step();
  bus.emit('steal:foiled', { thief: mati, victim: me, plant: plant('rare'), by: me, cause: 'bonk' });
  bus.emit('steal:rescued', { hero: me, victim: dad, thief: mati, plant: plant('rare'), tip: 50 });
  assert.equal(gz.stories()[0].k, 'rescue', 'Family Hero: the rescue story');
  assert.ok(!gz.stories().slice(1, 2).some((s) => s.k === 'foil' && s.who[1].n === 'Mati'), '...replaces the bonk that made it');
  step();
  bus.emit('plant:giant', { garden: { owner: me }, plant: { ...plant('epic'), size: 'titan' }, size: 'titan' });
  assert.match(gz.stories()[0].head, /titan/);
  bus.emit('boss:defeated', { top: dad });
  assert.match(gz.stories()[0].head, /Big Chomp/);
  step();
  bus.emit('drop:claimed', { player: me, drop: {} });
  step();
  bus.emit('pet:hatched', { player: me, egg: 'garden', pet: PETS.find((p) => p.rarity === 'legendary').id });
  step();
  bus.emit('pet:trick', { player: me, owner: 3, k: 0, trick: 'backflip', pet: PETS[0].id });
  assert.match(gz.stories()[0].head, /backflip/);
  step();
  bus.emit('base:upgraded', { player: me, level: 5 });
  step();
  bus.emit('rebirth', { player: me, rebirths: 2 });
  step();
  bus.emit('away:report', { credit: 3600, cash: 125000, grown: 3 });
  assert.match(gz.stories()[0].sub, /\$125K|garden/);
  bus.emit('trade:done', { a: me, b: mom });
  bus.emit('gnome:found', { player: me, count: 7, total: 16 });
  assert.match(gz.stories()[0].head, /Golden Gnome 7|number 7/);
  bus.emit('monster:caught', { monster: { type: 'golem' }, target: me, lost: { kind: 'seed' } });
  assert.match(gz.stories()[0].head, /Gem Golem/);
  bus.emit('match:end', { ranking: [{ player: mati, netWorth: 9 }, { player: me, netWorth: 5 }] });
  assert.equal(gz.stories()[0].head, 'Mati wins the Family Showdown!');
  for (const k of ['seed', 'foil', 'guard', 'rescue', 'giant', 'boss', 'drop', 'hatch', 'trick', 'base', 'rebirth', 'away', 'trade', 'gnome', 'caught', 'match']) {
    assert.ok(kinds().includes(k), 'a story for ' + k);
  }
  for (const s of gz.stories()) assert.ok(isCleanLine(s.head) && (!s.sub || isCleanLine(s.sub)), `clean: ${s.head} / ${s.sub}`);
  gz.dispose();
});

test('every template is kind and clean with any names filled in', () => {
  const names = ['Micah', 'Dad', 'Mom', 'Mati', 'Zoë', "O'Neil", 'Ann-Marie'];
  const vars = {
    b: 'Dad', c: 'Mati', pet: 'Unicorn', n: 7, left: 9, r: 'Mythic', z: "Rainbow's End", m: 'Gem Golem', size: 'giant', cash: '$1.5K', trick: 'a barrel roll',
  };
  for (const [k, L] of Object.entries(LINES)) {
    for (const line of [...L.head, ...L.sub]) {
      for (const a of names) {
        for (const p of PLANTS) {
          const s = fill(line, { ...vars, a, plant: p.name });
          assert.ok(isCleanLine(s), `${k}: "${s}"`);
          assert.ok(!s.includes('{'), `${k}: every slot is filled in "${s}"`);
        }
      }
    }
  }
  for (const x of [...PETS.map((p) => p.name), ...BIOMES.map((b) => b.name), ...BIOMES.map((b) => b.monster?.name).filter(Boolean)]) assert.ok(isCleanLine(x), x);
  for (const b of BOXES) assert.ok(isCleanLine(b.title) && isCleanLine(b.empty), b.title);
});

test('the front page: lead, more news, six boxes and today\'s most bonked', () => {
  const { gz, me, dad, mom, mati, tick } = setup('esther');
  let f = gz.front();
  assert.equal(f.lead, null, 'an empty paper to start');
  assert.equal(f.boxes.length, 6);
  assert.ok(f.boxes.every((b) => b.story === null && b.empty));
  bus.emit('banana:slip', { target: dad, owner: me });
  tick(DEDUPE + BOT_GAP);
  bus.emit('steal:success', { thief: me, victim: mom, plant: plant('legendary', 'diamond') });
  tick(1000);
  bus.emit('steal:success', { thief: mati, victim: me, plant: plant('common') });
  for (let i = 0; i < 3; i++) bus.emit('player:hit', { target: mati, by: me, cause: 'bonk' });
  bus.emit('player:hit', { target: dad, by: me, cause: 'bonk' });
  bus.emit('player:hit', { target: dad, by: me, cause: 'balloon' });
  f = gz.front();
  assert.equal(f.lead.k, 'heist', 'the biggest news leads');
  assert.match(f.lead.head, /Diamond/);
  assert.equal(f.more.length, 2);
  const box = Object.fromEntries(f.boxes.map((b) => [b.id, b.story]));
  assert.match(box.heist.head, /Diamond/, 'Biggest Heist: the most valuable one');
  assert.equal(box.slip.k, 'slip');
  assert.equal(box.bonked.head, 'Mati');
  assert.match(box.bonked.sub, /3/);
  assert.match(f.date, /October 9/);
  // a player may be called anything that passes the name filter, "__proto__" included
  bus.emit('player:hit', { target: player('p_x1y2z3', { name: '__proto__' }), by: me, cause: 'bonk' });
  assert.equal(({}).n, undefined, 'no prototype pollution from a name');
  gz.dispose();
});

test('the last 20 stories are kept per profile, out of the profile itself', () => {
  const { app, gz, me } = setup('dorian');
  for (let i = 1; i <= KEEP + 5; i++) bus.emit('gnome:found', { player: me, count: i, total: 99 });
  assert.equal(gz.stories().length, KEEP);
  gz.dispose();
  const saved = JSON.parse(store.get('steal-a-seed:v1:gazette:dorian'));
  assert.equal(saved.list.length, KEEP);
  assert.ok(!('gazette' in app.profile), 'nothing in the profile (or the cloud save)');
  const again = createGazette(app, { now: () => Date.now() });
  assert.equal(again.stories().length, KEEP, 'a new session reads them back');
  assert.match(again.stories()[0].head, /25/);
  // other profiles have their own paper
  store.delete('steal-a-seed:v1:gazette:micah');
  app.profileId = 'micah';
  bus.emit('profile:active', { profile: app.profile });
  assert.equal(again.stories().length, 0);
  // junk in storage is ignored
  store.set('steal-a-seed:v1:gazette:micah', JSON.stringify({ v: 1, list: [{ k: 'heist', head: 5 }, { k: 'nope', head: 'x' }, null] }));
  bus.emit('profile:active', { profile: app.profile });
  assert.equal(again.stories().length, 0);
  again.dispose();
});
