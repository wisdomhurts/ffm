// Client tests for src/online (cloud saves + high scores) against a fake Supabase (default) or the real
// SQL in a local Postgres (SAS_PG=<psql conninfo>, see pg-backend.mjs). Run:
//   node --test tests/online/online.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './fake-supabase.mjs';
import { createPgBackend } from './pg-backend.mjs';

// ------------------------------------------------------------------ a browser-ish global scope
class MemStorage {
  constructor() {
    this.m = new Map();
  }
  get length() {
    return this.m.size;
  }
  key(i) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
globalThis.window = globalThis;
Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), configurable: true, writable: true });
const realNavigator = globalThis.navigator;
const setOnline = (on) => Object.defineProperty(globalThis, 'navigator', { value: { onLine: on }, configurable: true, writable: true });
setOnline(true);

const backend = process.env.SAS_PG ? createPgBackend(process.env.SAS_PG) : createFakeSupabase();
if (process.env.SAS_PG) backend.reset();
let fetchCalls = 0;
globalThis.fetch = async (...a) => {
  fetchCalls++;
  return backend.fetch(...a);
};
const configure = (on) => {
  globalThis.__SAS_ONLINE__ = on ? { url: backend.url, key: backend.key } : { url: '', key: '' };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 3000, what = 'condition') {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what);
    await sleep(15);
  }
}

const { bus } = await import('../../src/core/events.js');
const profiles = await import('../../src/core/profiles.js');
const { save: lsSave, load: lsLoad } = await import('../../src/core/save.js');
const api = await import('../../src/online/api.js');
const rpcMod = await import('../../src/online/rpc.js');
const { attachCloudSync } = await import('../../src/online/sync.js');
const codes = await import('../../src/online/codes.js');

const errCode = async (p) => {
  try {
    await p;
  } catch (e) {
    return e.code;
  }
  return 'resolved';
};

// console noise would show up in the game's console-error checks
const noise = [];
const origErr = console.error;
const origWarn = console.warn;
before(() => {
  console.error = (...a) => noise.push(a.join(' '));
  console.warn = (...a) => noise.push(a.join(' '));
});
after(() => {
  console.error = origErr;
  console.warn = origWarn;
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', { value: realNavigator, configurable: true });
});

// ------------------------------------------------------------------ tests

test('codes: normalize, format and explain', () => {
  assert.equal(codes.normalizeCode('seed 7k4q 9xpm'), 'SEED-7K4Q-9XPM');
  assert.equal(codes.normalizeCode('7K4Q-9XPM'), 'SEED-7K4Q-9XPM');
  assert.equal(codes.normalizeCode('SEED-0K4Q-9XPM'), null);
  assert.equal(codes.normalizeCode('SEED-7K4Q-9XP'), null);
  assert.equal(codes.formatCodeInput('7k4q9x'), 'SEED-7K4Q-9X');
  assert.equal(codes.formatCodeInput('se'), 'SE');
  assert.equal(codes.formatCodeInput('SEED-7K4Q-9XPMZZ'), 'SEED-7K4Q-9XPM');
  assert.match(codes.codeProblem('SEED-0K4Q-9XPM'), /0 \(zero\)/);
  assert.equal(codes.codeProblem('SEED-7K4Q'), null);
});

test('not configured: everything is off and nothing touches the network', async () => {
  configure(false);
  fetchCalls = 0;
  assert.equal(api.onlineReady(), false);
  const maddie = profiles.getProfile('maddie');
  assert.equal(await errCode(api.cloudLink(maddie)), 'not_configured');
  assert.equal(await errCode(api.topScores('networth')), 'not_configured');
  const app = { profileId: 'maddie', get profile() { return profiles.getProfile(this.profileId); }, state: 'title' };
  // even a (stale) linked profile stays quiet
  profiles.updateProfile('maddie', { cloud: { id: 'x', secret: 'y', code: 'SEED-2222-2222', listed: true } });
  const sync = attachCloudSync(app, { debounce: 0.01, scoreDelay: 0.01, tick: 0.01, pushEvery: 0.01 });
  profiles.updateProfile('maddie', (p) => (p.stars = 3));
  bus.emit('app:state', { state: 'title' });
  await sleep(120);
  sync.dispose();
  profiles.updateProfile('maddie', { cloud: null, stars: 0 });
  assert.equal(fetchCalls, 0);
  // the family board still works
  const fam = api.familyScores('steals', app);
  assert.equal(fam.length, 4);
  assert.ok(fam.some((r) => r.me && r.profileId === 'maddie'));
});

let maddieCode = null;

test('cloudLink registers, stores the secret locally and uploads the save (no secret, no photo)', async () => {
  configure(true);
  assert.equal(api.onlineReady(), true);
  // some progress to carry
  profiles.updateProfile('maddie', (p) => {
    p.stars = 12;
    p.counters.steals = 7;
    p.best.netWorth = 125000;
    p.badges.firstSteal = 1;
    p.photo = 'data:image/jpeg;base64,SNEAKYPHOTO'; // a photo that wandered into the profile is still never uploaded
  });
  lsSave('save:endless:maddie', { v: 1, humanId: 'maddie', players: [{}, {}, { id: 'maddie', cash: 5000, rebirths: 2 }, {}], gardens: [{}, {}, { planters: [{ plant: { speciesId: 'daisy' } }, { plant: null }] }, {}] });
  lsSave('face:maddie', 'data:image/png;base64,SECRETPHOTO');
  const r = await api.cloudLink(profiles.getProfile('maddie'));
  assert.equal(r.created, true);
  assert.match(r.code, /^SEED-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  const p = profiles.getProfile('maddie');
  assert.equal(p.cloud.code, r.code);
  assert.match(p.cloud.secret, /^[0-9a-f]{64}$/);
  assert.equal(api.cloudState(p), 'linked');
  const stored = backend.stored(p.cloud.id);
  assert.ok(stored, 'save uploaded');
  assert.equal(stored.profile.stars, 12);
  assert.equal(stored.endless.players[2].cash, 5000);
  assert.equal(stored.summary.netWorth, 125000);
  assert.equal(stored.summary.rebirths, 2);
  assert.equal(stored.summary.pid, 'maddie');
  const text = JSON.stringify(stored);
  assert.ok(!text.includes(p.cloud.secret), 'secret never uploaded');
  assert.ok(!text.includes('SECRETPHOTO') && !text.includes('SNEAKYPHOTO'), 'photos never uploaded');
  assert.ok(!('cloud' in stored.profile));
  // linking again is a no-op
  assert.deepEqual(await api.cloudLink(p), { code: r.code, created: false });
  maddieCode = r.code;
});

test('cloudPush skips unchanged data, is rate limited, and uploads changes', async () => {
  const p = profiles.getProfile('maddie');
  const n0 = backend.state.calls.length;
  assert.equal((await api.cloudPush(p)).pushed, false);
  assert.equal(backend.state.calls.length, n0, 'no request for an unchanged save');
  assert.equal(await errCode(api.cloudPush(p, { force: true })), 'rate_limited');
  backend.clearRateLimits();
  profiles.updateProfile('maddie', (x) => (x.stars = 13));
  const r = await api.cloudPush(profiles.getProfile('maddie'));
  assert.equal(r.pushed, true);
  assert.equal(backend.stored(p.cloud.id).profile.stars, 13);
});

test('cloudPeek previews without changing anything; bad and unknown codes', async () => {
  const peek = await api.cloudPeek(maddieCode.toLowerCase().replace(/-/g, ' '));
  assert.equal(peek.name, 'Mati');
  assert.equal(peek.base, 'maddie');
  assert.equal(peek.summary.stars, 13);
  assert.equal(peek.hasSave, true);
  assert.equal(api.cloudState(profiles.getProfile('maddie')), 'linked');
  const before = fetchCalls;
  assert.equal(await errCode(api.cloudPeek('SEED-0000-1111')), 'bad_code');
  assert.equal(fetchCalls, before, 'malformed codes never reach the server');
  assert.equal(await errCode(api.cloudPeek('SEED-2222-2222')), 'not_found');
});

test('moving a save: pull on "another device", restore safely, old device sees "moved", undo works', async () => {
  // Another device = this device's state after we note what Mati had here.
  const plan = api.restorePlan(await api.cloudPeek(maddieCode));
  assert.equal(plan.why, 'linked');
  assert.equal(plan.target.id, 'maddie');
  assert.equal(plan.targetHasProgress, true);

  const oldSecret = profiles.getProfile('maddie').cloud.secret;
  const pulled = await api.cloudPull(maddieCode);
  assert.notEqual(pulled.secret, oldSecret, 'loading a code issues a new secret');
  assert.equal(pulled.save.profile.stars, 13);

  // this device still holds the OLD secret: its next upload finds out the save moved
  backend.clearRateLimits();
  profiles.updateProfile('maddie', (x) => (x.stars = 99));
  assert.equal(await errCode(api.cloudPush(profiles.getProfile('maddie'))), 'bad_secret');
  assert.equal(api.cloudState(profiles.getProfile('maddie')), 'moved');
  assert.equal(await errCode(api.cloudPush(profiles.getProfile('maddie'))), 'moved');

  // restore into Mati: the local profile is backed up first
  const res = api.restoreCloud(pulled, { into: 'maddie' });
  assert.equal(res.replaced, true);
  const m = profiles.getProfile('maddie');
  assert.equal(m.stars, 13);
  assert.equal(m.cloud.secret, pulled.secret);
  assert.equal(api.cloudState(m), 'linked');
  assert.equal(lsLoad('save:endless:maddie').players[2].cash, 5000);
  assert.deepEqual(api.restoreBackup()?.id, 'maddie');
  // nothing changed since the pull, so no upload is needed
  assert.equal((await api.cloudPush(m)).pushed, false);

  // undo puts this device's version (stars 99) back
  const undone = api.undoRestore();
  assert.equal(undone.stars, 99);
  assert.equal(api.restoreBackup(), null);
  // and restore again for the rest of the tests
  api.restoreCloud(pulled, { into: 'maddie' });
  assert.equal(profiles.getProfile('maddie').stars, 13);
});

test('restoring as a NEW player never touches existing profiles', async () => {
  const pulled = await api.cloudPull(maddieCode);
  const before = profiles.listProfiles().length;
  const res = api.restoreCloud(pulled, { into: null });
  assert.equal(res.created, true);
  const np = res.profile;
  assert.match(np.id, /^p_/);
  assert.equal(np.name, 'Mati 2', 'a family name gets a number');
  assert.equal(np.base, 'maddie');
  assert.notEqual(np.look.face, 'photo', 'photo faces stay with the family profile');
  assert.equal(profiles.listProfiles().length, before + 1);
  assert.equal(profiles.getProfile('maddie').cloud, null, 'one cloud identity per device');
  assert.equal(lsLoad('save:endless:' + np.id).players[2].cash, 5000);
  // hand the code back to Mati for the next tests
  const again = await api.cloudPull(maddieCode);
  api.restoreCloud(again, { into: 'maddie' });
  profiles.deleteProfile(np.id);
  assert.equal(profiles.getProfile('maddie').cloud.code, maddieCode);
});

test('scores: best is kept, ranks, "me", week board, hidden players, family board', async () => {
  backend.clearRateLimits();
  const maddie = profiles.getProfile('maddie');
  assert.deepEqual(await api.submitScore(maddie, 'steals', 40), { best: 40, week: 40 });
  backend.clearRateLimits();
  assert.equal((await api.submitScore(maddie, 'steals', 10)).best, 40);
  // three more players
  for (const [name, base, v] of [['Dorian', 'dorian', 80], ['Esther', 'esther', 40], ['Micah', 'micah', 5]]) {
    const p = profiles.getProfile(base);
    await api.cloudLink(p);
    await api.submitScore(profiles.getProfile(base), 'steals', v);
    assert.equal(profiles.getProfile(base).name, name);
  }
  const top = await api.topScores('steals', { me: profiles.getProfile('maddie'), fresh: true });
  assert.deepEqual(top.map((r) => [r.rank, r.name, r.value]), [[1, 'Dorian', 80], [2, 'Mati', 40], [2, 'Esther', 40], [4, 'Micah', 5]]);
  assert.deepEqual(top.filter((r) => r.me).map((r) => r.name), ['Mati']);
  const two = await api.topScores('steals', { limit: 2, me: profiles.getProfile('micah'), fresh: true });
  assert.deepEqual(two.map((r) => [r.rank, r.name, r.me]), [[1, 'Dorian', false], [2, 'Mati', false], [4, 'Micah', true]]);
  assert.equal((await api.topScores('steals', { period: 'week', fresh: true })).length, 4);
  assert.equal(await errCode(api.submitScore(maddie, 'coins', 1)), 'bad_board');
  backend.clearRateLimits();
  assert.equal(await errCode(api.submitScore(maddie, 'rebirths', 5000)), 'bad_value');
  // hide Micah
  await api.setListed(profiles.getProfile('micah'), false);
  assert.equal(profiles.getProfile('micah').cloud.listed, false);
  assert.equal(await errCode(api.submitScore(profiles.getProfile('micah'), 'steals', 6)), 'not_listed');
  const after = await api.topScores('steals', { fresh: true });
  assert.ok(!after.some((r) => r.name === 'Micah'));
  await api.setListed(profiles.getProfile('micah'), true);
  // offline family board: this device's profiles, best first, ties share a rank
  profiles.updateProfile('dorian', (p) => (p.counters.steals = 80));
  profiles.updateProfile('esther', (p) => (p.counters.steals = 40));
  profiles.updateProfile('micah', (p) => (p.counters.steals = 5));
  profiles.updateProfile('maddie', (p) => (p.counters.steals = 40));
  const fam = api.familyScores('steals', { profileId: 'esther' });
  assert.deepEqual(fam.map((r) => [r.rank, r.name, r.value, r.me]), [[1, 'Dorian', 80, false], [2, 'Esther', 40, true], [2, 'Mati', 40, false], [4, 'Micah', 5, false]]);
  assert.equal(api.familyScores('rebirths', {}).find((r) => r.profileId === 'maddie').value, 2, 'rebirths come from the Endless save');
});

test('backoff: failures back off exponentially, background calls wait, success resets', async () => {
  let t = 1_000_000;
  rpcMod._test.setClock(() => t);
  rpcMod._test.setRandom(() => 0.5);
  rpcMod.resetBackoff();
  backend.state.mode = 'down';
  try {
    assert.equal(await errCode(api.topScores('networth', { fresh: true })), 'network');
    assert.equal(rpcMod.backoffLeft(), 5000);
    assert.equal(await errCode(api.topScores('networth', { fresh: true })), 'network');
    assert.equal(rpcMod.backoffLeft(), 10000);
    assert.equal(await errCode(api.topScores('networth', { fresh: true })), 'network');
    assert.equal(rpcMod.backoffLeft(), 20000);
    // background work doesn't even try while backing off
    const n = fetchCalls;
    assert.equal(await errCode(rpcMod.rpc('sas_top', { p_board: 'steals' }, { background: true })), 'backoff');
    assert.equal(fetchCalls, n);
    for (let i = 0; i < 30; i++) {
      t += 11 * 60 * 1000;
      await errCode(api.topScores('networth', { fresh: true }));
    }
    assert.ok(rpcMod.backoffLeft() <= 10 * 60 * 1000 * 1.25, 'capped at ~10 minutes');
    // server errors count too
    backend.state.mode = '500';
    t += 11 * 60 * 1000;
    const e = await errCode(api.topScores('networth', { fresh: true }));
    assert.equal(e, 'server');
    backend.state.mode = 'up';
    t += 11 * 60 * 1000;
    await api.topScores('networth', { fresh: true });
    assert.equal(rpcMod.backoffLeft(), 0, 'success resets the backoff');
  } finally {
    backend.state.mode = 'up';
    rpcMod._test.setClock(null);
    rpcMod._test.setRandom(null);
    rpcMod.resetBackoff();
  }
});

test('offline: no requests, friendly error', async () => {
  setOnline(false);
  const n = fetchCalls;
  try {
    assert.equal(api.onlineReady(), false);
    assert.equal(await errCode(api.topScores('steals', { fresh: true })), 'offline');
    assert.equal(await errCode(api.cloudPeek(maddieCode)), 'offline');
    assert.equal(fetchCalls, n);
  } finally {
    setOnline(true);
  }
});

test('unknown RPC and bad key map to clean errors', async () => {
  assert.equal(await errCode(rpcMod.rpc('sas_nope', {})), 'not_found');
  const k = globalThis.__SAS_ONLINE__.key;
  globalThis.__SAS_ONLINE__.key = 'wrong';
  try {
    assert.equal(await errCode(api.topScores('steals', { fresh: true })), 'invalid');
  } finally {
    globalThis.__SAS_ONLINE__.key = k;
    rpcMod.resetBackoff();
  }
});

test('server names and looks: real names kept, rude ones replaced, oversized looks dropped (never an error)', async () => {
  const reg = (name, look = {}) => rpcMod.rpc('sas_register', { p_name: name, p_base: 'micah', p_look: look });
  const nameOf = async (r) => (await api.cloudPeek(r.code)).name;
  backend.clearRateLimits();
  for (const n of ['Killian', 'Ana Lopez', 'Scunthorpe', '李明']) assert.equal(await nameOf(await reg(n)), n);
  for (const n of ['k.i.l.l', 'f u c k', 'fück']) assert.equal(await nameOf(await reg(n)), 'Player');
  // 32 fields of 40 two-byte letters: every field is "clean" but together they're ~3.5 KB
  const look = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [String(i + 1).padStart(24, 'k'), 'é'.repeat(40)]));
  const r = await reg('Big Look', look);
  assert.match(r.code, /^SEED-/);
  assert.deepEqual((await api.cloudPeek(r.code)).look, {});
  assert.equal((await rpcMod.rpc('sas_save', { p_id: r.id, p_secret: r.secret, p_save: { v: 1 }, p_look: look })).ok, true);
});

test('sync: uploads changes, submits new bests once, flushes on quit, stays silent when the server is down', async () => {
  const app = { profileId: 'maddie', get profile() { return profiles.getProfile(this.profileId); }, state: 'playing', human: null, game: null };
  backend.clearRateLimits();
  const id = profiles.getProfile('maddie').cloud.id;
  api.setCloudMeta('maddie', { sent: {}, sentAt: {} });
  const sync = attachCloudSync(app, { debounce: 0.05, scoreDelay: 0.05, tick: 0.05, pushEvery: 60, minScoreGap: 0 });
  try {
    // bests reach the boards
    profiles.updateProfile('maddie', (p) => {
      p.best.netWorth = 250000;
      p.best.showdownBest = 90000;
      p.counters.steals = 41;
    });
    await until(() => (api.cloudMeta('maddie').sent.steals || 0) === 41 && (api.cloudMeta('maddie').sent.networth || 0) === 250000, 3000, 'scores');
    await until(() => backend.stored(id)?.profile?.best?.netWorth === 250000, 3000, 'upload');
    const top = await api.topScores('networth', { fresh: true });
    assert.equal(top.find((r) => r.name === 'Mati')?.value, 250000);
    // nothing new -> nothing sent
    await sleep(200);
    const before = backend.state.calls.filter((c) => c.fn === 'sas_submit').length;
    profiles.updateProfile('maddie', (p) => (p.stars += 1));
    await sleep(250);
    assert.equal(backend.state.calls.filter((c) => c.fn === 'sas_submit').length, before, 'unchanged bests are not resubmitted');
    // quitting to the title uploads right away
    backend.clearRateLimits();
    profiles.updateProfile('maddie', (p) => (p.stars = 50));
    bus.emit('app:state', { state: 'title' });
    await until(() => backend.stored(id)?.profile?.stars === 50, 3000, 'flush on quit');
    // server down: no errors, no unhandled rejections, and it catches up afterwards
    backend.state.mode = 'down';
    profiles.updateProfile('maddie', (p) => (p.counters.steals = 60));
    await sleep(300);
    assert.ok(rpcMod.backoffLeft() > 0, 'backing off');
    backend.state.mode = 'up';
    rpcMod.resetBackoff();
    backend.clearRateLimits();
    await sync.flush();
    await until(() => (api.cloudMeta('maddie').sent.steals || 0) === 60, 3000, 'catch up');
    // a moved save stops the sync quietly
    await api.cloudPull(maddieCode); // "another device"
    backend.clearRateLimits();
    profiles.updateProfile('maddie', (p) => (p.stars = 51));
    await until(() => api.cloudState(profiles.getProfile('maddie')) === 'moved', 3000, 'moved');
    const n = fetchCalls;
    profiles.updateProfile('maddie', (p) => (p.stars = 52));
    await sleep(250);
    assert.equal(fetchCalls, n, 'no more uploads once moved');
    // "keep this device's progress" takes the code back
    backend.clearRateLimits();
    await api.cloudReclaim(profiles.getProfile('maddie'));
    assert.equal(api.cloudState(profiles.getProfile('maddie')), 'linked');
    assert.equal(backend.stored(id).profile.stars, 52);
  } finally {
    sync.dispose();
  }
  assert.deepEqual(noise, [], 'no console output');
});

test('unlink and delete', async () => {
  backend.clearRateLimits();
  const micah = profiles.getProfile('micah');
  const code = micah.cloud.code;
  await api.cloudDelete(micah);
  assert.equal(profiles.getProfile('micah').cloud, null);
  assert.equal(await errCode(api.cloudPeek(code)), 'not_found');
  api.cloudUnlink(profiles.getProfile('esther'));
  assert.equal(api.cloudState(profiles.getProfile('esther')), 'off');
});
