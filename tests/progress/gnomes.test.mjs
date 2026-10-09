// Golden Gnome Hunt (no browser): every spot is reachable (outside the layout colliders, off the pod line,
// inside the island or the road lane, never in a garden, low enough to jump to), walking up to each gnome
// fills profile.gnomes, the badge tiers, stars and the Gnome Hat / Golden Gnome Noodle unlocks follow, the pot of
// gold needs a hop, and the giggle only plays near an unfound gnome, at most every 6 s.
// The world's prop colliders (fountain, palms, shops) are checked in the browser: tests/gnomes.mjs.
// Run: node --test tests/progress/gnomes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

// a fake localStorage so profiles really save
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
const { WORLD, BIOMES } = await import('../../src/config.js');
const { LAYOUT, GNOMES, gardenContains } = await import('../../src/gameplay/layout.js');
const { createGnomeHunt, HUNT, gnomesFound, GNOME } = await import('../../src/progress/gnomes.js');
const { createTracker } = await import('../../src/progress/tracker.js');
const { BADGE_BY_ID } = await import('../../src/progress/catalog.js');
const { isOwned, sanitizeLook, unownedParts, findItem } = await import('../../src/characters/cosmetics.js');
const { isCleanLine } = await import('../../src/net/protocol.js');

const R = WORLD.playerRadius;

function fakeApp(profileId) {
  const calls = { sounds: [], found: [], popped: [], alerts: [] };
  const app = {
    profileId,
    get profile() {
      return profiles.getProfile(this.profileId);
    },
    human: { pos: { x: 0, y: 0, z: 0 }, name: 'Kid' },
    game: null,
    state: 'playing',
    world: { gnomes: { setFound: (ids) => calls.found.push([...ids]), pop: (id) => calls.popped.push(id) } },
    audio: { play: (name, o) => calls.sounds.push([name, o]) },
    hud: { alerts: { show: (o) => calls.alerts.push(o), announce: (o) => calls.alerts.push(o) } },
  };
  return { app, calls };
}

test('every gnome spot is a fair hiding place', () => {
  assert.ok(GNOMES.length >= 12, 'at least a dozen gnomes');
  assert.equal(new Set(GNOMES.map((g) => g.id)).size, GNOMES.length, 'ids are unique');
  for (const bi of [9, 10, 11]) assert.ok(GNOMES.some((g) => g.biome === bi), `${BIOMES[bi].name} has a gnome`);
  for (const g of GNOMES) {
    const at = `${g.id} (${g.x}, ${g.y}, ${g.z})`;
    assert.ok(g.id.length <= 24 && /^[a-z]+$/.test(g.id), `${at}: a short id (profiles keep ids up to 24 chars)`);
    assert.ok(g.name && g.hint && !g.hint.includes('{'), `${at}: a name and a finished hint`);
    assert.ok(isCleanLine(g.hint) && isCleanLine(g.name), `${at}: kid-safe copy`);
    assert.ok(g.y >= 0 && g.y <= 6, `${at}: a jump (~6.9) reaches it`);
    if (g.biome < 0) {
      assert.ok(Math.abs(g.x) <= WORLD.homeHalfW - R && g.z >= WORLD.homeMinZ + R && g.z <= WORLD.road.startZ - R, `${at}: inside the island walls`);
      assert.ok(!LAYOUT.gardens.some((gd) => gardenContains(gd, g.x, g.z, -1.5)), `${at}: not inside (or on the fence of) a garden`);
    } else {
      const B = LAYOUT.biomeRanges[g.biome];
      assert.ok(g.z > B.minZ + 1 && g.z < B.maxZ - 1, `${at}: inside ${BIOMES[g.biome].name}`);
      assert.ok(Math.abs(g.x) <= WORLD.road.width / 2 - 3, `${at}: inside the road lane`);
      const pod = LAYOUT.pods.reduce((d, p) => Math.min(d, Math.hypot(p.x - g.x, p.z - g.z)), Infinity);
      assert.ok(pod >= 4.8, `${at}: off the pod line (nearest seed pod ${pod.toFixed(1)} studs away)`);
    }
    // a kid can stand right on the spot: nothing solid between the gnome's feet and a kid's head height
    for (const b of LAYOUT.colliders) {
      if (b.minY > g.y + WORLD.playerHeight || b.maxY <= g.y + 0.7) continue; // a top within a step (0.7) is what it sits on
      const hit = g.x + R > b.minX && g.x - R < b.maxX && g.z + R > b.minZ && g.z - R < b.maxZ;
      assert.ok(!hit, `${at}: clear of the ${b.tag} collider`);
    }
  }
});

test('walking up to every gnome finds it; badges, stars and the hat and noodle follow', () => {
  const { app, calls } = fakeApp('micah');
  const P = () => app.profile;
  P().gnomes = [];
  const tracker = createTracker(app, { interval: 0, autoSave: false, now: () => Date.now() });
  app.progress = tracker;
  const events = [];
  const off = bus.on('gnome:found', (e) => events.push(e));
  const hunt = createGnomeHunt(app, { interval: 0, now: () => 0 });
  const stars0 = P().stars;
  const total = GNOMES.length;
  GNOMES.forEach((g, i) => {
    Object.assign(app.human.pos, { x: g.x + 2.2, y: g.y, z: g.z - 2 });
    const got = hunt.check();
    assert.equal(got?.id, g.id, `standing next to ${g.id} finds it`);
    assert.equal(gnomesFound(P()), i + 1);
    assert.equal(hunt.check(), null, 'a found gnome is not found twice');
    const n = i + 1;
    assert.equal(!!P().badges.gnomes1, n >= 3, `Gnome Hunter I after 3 (${n})`);
    assert.equal(!!P().badges.gnomes2, n >= HUNT.hatAt, `Gnome Hunter II after ${HUNT.hatAt} (${n})`);
    assert.equal(isOwned(P(), 'hat', 'gnome'), n >= HUNT.hatAt, `the Gnome Hat comes with tier II (${n})`);
    assert.equal(isOwned(P(), 'noodle', 'golden'), n >= total, `the Golden Gnome Noodle comes with every gnome (${n})`);
  });
  assert.equal(P().stars - stars0, 10 + 25 + 60, 'the badge stars are paid');
  assert.equal(events.length, total, 'one gnome:found per gnome');
  assert.deepEqual(events.at(-1) && [events.at(-1).count, events.at(-1).total], [total, total]);
  assert.equal(calls.popped.length, total, 'each one pops in the world');
  assert.ok(calls.alerts.some((a) => a.title === 'ALL GNOMES FOUND!'), 'the big finish');
  assert.ok(calls.sounds.some(([n, o]) => n === 'gnomeFound' && o.all), 'the finale sound');
  assert.equal(BADGE_BY_ID.gnomes3.goal, total, 'the top tier is every gnome');
  // saved with the profile (core/profiles.js keeps the ids)
  const saved = JSON.parse(store.get('steal-a-seed:v1:profile:micah'));
  assert.equal(saved.gnomes.length, total);
  off();
  hunt.dispose();
  tracker.dispose();
});

test('the pot of gold needs a hop, and nothing is found off the clock', () => {
  const { app } = fakeApp('esther');
  app.profile.gnomes = [];
  const hunt = createGnomeHunt(app, { interval: 0, now: () => 0 });
  const lucky = GNOMES.find((g) => g.y > HUNT.up);
  assert.ok(lucky, 'a gnome sits up high');
  Object.assign(app.human.pos, { x: lucky.x, y: 0, z: lucky.z - 3 });
  assert.equal(hunt.check(), null, 'standing on the ground below it is not enough');
  app.human.pos.y = lucky.y - HUNT.up + 0.5;
  assert.equal(hunt.check()?.id, lucky.id, 'mid-jump next to it catches it');
  const g = GNOMES.find((x) => x.y === 0 && x.biome >= 0);
  Object.assign(app.human.pos, { x: g.x, y: 0, z: g.z });
  for (const st of ['paused', 'title', 'ended']) {
    app.state = st;
    assert.equal(hunt.check(), null, `nothing while ${st}`);
  }
  app.state = 'playing';
  app.human = null;
  assert.equal(hunt.check(), null, 'nothing without a local player (online spectating, attract mode)');
  hunt.dispose();
});

test('a giggle leads you in: near an unfound gnome only, at most every 6 s', () => {
  const { app, calls } = fakeApp('dorian');
  app.profile.gnomes = [];
  let t = 1000;
  const hunt = createGnomeHunt(app, { interval: 0, now: () => t });
  const g = GNOME.dusty;
  const giggles = () => calls.sounds.filter(([n]) => n === 'gnomeGiggle');
  Object.assign(app.human.pos, { x: g.x, y: 0, z: g.z - 20 });
  hunt.check();
  assert.equal(giggles().length, 1, 'a giggle 20 studs away');
  assert.deepEqual([giggles()[0][1].x, giggles()[0][1].z], [g.x, g.z], 'from where it hides');
  t += 3000;
  hunt.check();
  assert.equal(giggles().length, 1, 'not again within 6 s');
  t += HUNT.giggleEvery * 1000;
  hunt.check();
  assert.equal(giggles().length, 2, 'again after 6 s');
  app.profile.gnomes = ['dusty'];
  t += 60000;
  hunt.check();
  assert.equal(giggles().length, 2, 'found gnomes stay quiet');
  app.profile.gnomes = [];
  Object.assign(app.human.pos, { x: 0, y: 0, z: g.z - HUNT.hear - 5 });
  t += 60000;
  hunt.check();
  assert.equal(giggles().length, 2, 'too far away to hear');
  hunt.dispose();
});

test('the Golden Gnome Noodle and the Gnome Hat are real looks, locked until earned', () => {
  assert.equal(sanitizeLook({ noodle: 'golden' }, 'micah').noodle, 'golden');
  assert.equal(sanitizeLook({ noodle: '#FF4F9A' }, 'micah').noodle, '#ff4f9a', 'colours still work');
  assert.equal(sanitizeLook({ noodle: 'platinum' }, 'micah').noodle, null, 'unknown noodles fall back to the family colour');
  assert.equal(sanitizeLook({ hat: 'gnome' }, 'micah').hat, 'gnome');
  assert.ok(findItem('noodle', 'golden') && !findItem('noodle', '#ff4f9a'));
  const fresh = { unlocks: [], badges: {} };
  const miss = unownedParts(fresh, { ...sanitizeLook(null, 'micah'), hat: 'gnome', noodle: 'golden' }).map((m) => m.field).sort();
  assert.deepEqual(miss, ['hat', 'noodle'], 'both are badge rewards, not free');
  assert.deepEqual(unownedParts(fresh, { ...sanitizeLook(null, 'micah'), noodle: '#ffd23f' }), [], 'a plain colour is always yours');
});
