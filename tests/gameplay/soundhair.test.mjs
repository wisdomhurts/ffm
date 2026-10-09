// Sound settings (music and sound effects switches, volumes, mute all, the old-save carry-over, the audio
// engine's levels and music resume) and white / silver hair (palette, random looks, saves and the network).
// No browser: a fake localStorage and a fake AudioContext stand in. Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

// An old save from before the switches: muted (both volumes zeroed), the real levels waiting under ui:unmute.
const store = new Map([
  ['steal-a-seed:v1:settings', JSON.stringify({ music: 0, sfx: 0, muted: true, quality: 'low', tips: false })],
  ['steal-a-seed:v1:ui:unmute', JSON.stringify({ music: 0.35, sfx: 0.9 })],
]);
const listeners = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  addEventListener: (t, fn) => listeners.set(t, fn),
};
globalThis.document = { hidden: false, addEventListener() {} };

const { settings, migrateSound } = await import('../../src/core/settings.js');
const { bus } = await import('../../src/core/events.js');
const levels = await import('../../src/audio/levels.js');
const { audio } = await import('../../src/audio/audio.js');
const { createMixer } = await import('../../src/audio/mixer.js');
const { MusicEngine, STEP } = await import('../../src/audio/music.js');
const { stats: voices } = await import('../../src/audio/synth.js');
const cos = await import('../../src/characters/cosmetics.js');
const net = await import('../../src/net/protocol.js');
const { getProfile, replaceProfile } = await import('../../src/core/profiles.js');
const { Game } = await import('../../src/gameplay/game.js');
const { CHARACTER } = await import('../../src/config.js');

const { level, isOn, isSilent, setChannelOn, setVolume, setAllMuted, toggleChannel } = levels;
const saved = () => JSON.parse(store.get('steal-a-seed:v1:settings'));
const WHITE = '#f2f1ec';
const SILVER = '#cfd3dc';

// A do-nothing AudioContext: every node and AudioParam exists, nothing makes sound.
function fakeAudioContext() {
  const param = () => {
    const p = { value: 0 };
    for (const m of ['setValueAtTime', 'setTargetAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime', 'setValueCurveAtTime']) p[m] = () => p;
    return p;
  };
  const NOOP = new Set(['start', 'stop', 'disconnect', 'setPeriodicWave', 'addEventListener', 'removeEventListener']);
  const node = () => new Proxy({ connect: (n) => n }, {
    get(t, k) {
      if (k in t || typeof k === 'symbol' || k === 'then') return t[k];
      t[k] = NOOP.has(k) ? () => {} : param();
      return t[k];
    },
  });
  const ac = {
    currentTime: 0, sampleRate: 8000, state: 'running', made: 0,
    createBuffer: (ch, len, sr) => {
      const d = Array.from({ length: ch }, () => new Float32Array(len));
      return { length: len, sampleRate: sr, numberOfChannels: ch, duration: len / sr, getChannelData: (i) => d[i] };
    },
    createPeriodicWave: () => ({}),
  };
  ac.destination = node();
  return new Proxy(ac, {
    get(t, k) {
      if (k in t || typeof k !== 'string' || !k.startsWith('create')) return t[k];
      return () => {
        t.made++;
        return node();
      };
    },
  });
}

test('settings: an old muted save keeps its volumes and comes back exactly as it was before muting', () => {
  // migrated at load: both switches off (muted), the remembered levels back on the sliders, other keys kept
  assert.equal(settings.musicOn, false);
  assert.equal(settings.sfxOn, false);
  assert.equal(settings.muted, true);
  assert.equal(settings.music, 0.35);
  assert.equal(settings.sfx, 0.9);
  assert.equal(settings.quality, 'low');
  assert.equal(saved().musicOn, false, 'the carried-over settings are saved right away');
  assert.deepEqual(JSON.parse(store.get('steal-a-seed:v1:ui:unmute')), { musicOn: true, sfxOn: true });
  assert.equal(level('music'), 0);
  assert.equal(isSilent(), true);
  setAllMuted(false);
  assert.equal(settings.muted, false);
  assert.equal(level('music'), 0.35);
  assert.equal(level('sfx'), 0.9);
  assert.equal(store.has('steal-a-seed:v1:ui:unmute'), false);
});

test('settings: migration rules (?? keeps a remembered 0 as "that channel was off")', () => {
  const D = { music: 0.6, sfx: 0.8, musicOn: true, sfxOn: true, muted: false };
  // muted, music had been turned all the way down before muting: music stays off after un-muting
  let out = { ...D, music: 0, sfx: 0, muted: true };
  assert.deepEqual(migrateSound(out, { music: 0, sfx: 0, muted: true }, { music: 0, sfx: 0.5 }).unmute, { musicOn: false, sfxOn: true });
  assert.deepEqual([out.music, out.sfx, out.musicOn, out.sfxOn, out.muted], [0.6, 0.5, false, false, true]);
  // muted without a note: defaults, everything comes back
  out = { ...D, music: 0, sfx: 0, muted: true };
  assert.deepEqual(migrateSound(out, { muted: true }, null).unmute, { musicOn: true, sfxOn: true });
  // not muted: a volume of 0 meant "off"; the switch takes over and the slider gets a usable level
  out = { ...D, music: 0, sfx: 0.3 };
  assert.deepEqual(migrateSound(out, { music: 0, sfx: 0.3 }, null), { unmute: null });
  assert.deepEqual([out.music, out.sfx, out.musicOn, out.sfxOn, out.muted], [0.6, 0.3, false, true, false]);
  // a save that has the switches but was muted the old way (both volumes zeroed) is carried over too
  out = { ...D, music: 0, sfx: 0, muted: true };
  assert.deepEqual(migrateSound(out, { music: 0, sfx: 0, muted: true, musicOn: true, sfxOn: true }, { music: 0.5, sfx: 0.5 }).unmute, { musicOn: true, sfxOn: true });
  assert.deepEqual([out.music, out.sfx, out.muted], [0.5, 0.5, true]);
  // new saves and first runs are left alone
  assert.equal(migrateSound({ ...D }, { music: 0.2, musicOn: true }, null), null);
  assert.equal(migrateSound({ ...D }, {}, null), null);
  assert.equal(migrateSound({ ...D }, null, null), null);
});

test('levels: two independent switches; off keeps the volume, turning a volume up switches it on', () => {
  setAllMuted(false);
  setVolume('music', 0.4);
  setVolume('sfx', 0.7);
  assert.equal(level('music'), 0.4);
  setChannelOn('music', false);
  assert.equal(level('music'), 0, 'music off');
  assert.equal(settings.music, 0.4, '...but its volume is remembered');
  assert.equal(level('sfx'), 0.7, 'effects are not touched');
  assert.equal(settings.muted, false);
  setChannelOn('music', true);
  assert.equal(level('music'), 0.4);
  // effects off, then the effects slider moved up: on again
  toggleChannel('sfx');
  assert.equal(isOn('sfx'), false);
  setVolume('sfx', 0.5);
  assert.equal(isOn('sfx'), true);
  assert.equal(level('sfx'), 0.5);
  // a switch turned on at 0% brings a usable volume back
  setVolume('music', 0);
  assert.equal(isOn('music'), true);
  assert.equal(isSilent(), false, 'effects still play');
  setChannelOn('music', false);
  setChannelOn('music', true);
  assert.equal(settings.music, levels.DEFAULT_VOLUME.music);
  // saved for next time
  assert.equal(saved().music, levels.DEFAULT_VOLUME.music);
  assert.equal(saved().sfxOn, true);
  // junk volumes are clamped
  setVolume('sfx', 7);
  assert.equal(settings.sfx, 1);
  setVolume('sfx', 'loud');
  assert.equal(settings.sfx, 0);
});

test('levels: mute all switches both off without touching the volumes, and un-mute restores the switches', () => {
  setVolume('music', 0.3);
  setVolume('sfx', 0.6);
  setChannelOn('music', false); // the player had music off already
  setAllMuted(true);
  assert.equal(settings.muted, true);
  assert.equal(isSilent(), true);
  assert.deepEqual([settings.music, settings.sfx], [0.3, 0.6], 'volumes untouched');
  setAllMuted(false);
  assert.equal(isOn('music'), false, 'music stays off: it was off before muting');
  assert.equal(isOn('sfx'), true);
  assert.equal(level('sfx'), 0.6);
  // muted = both switches off, whichever way they got there; un-muting then brings both back
  setChannelOn('sfx', false);
  assert.equal(settings.muted, true);
  setAllMuted(false);
  assert.equal(isOn('music') && isOn('sfx'), true);
  // a switch flipped on while muted un-mutes just that channel
  setAllMuted(true);
  setChannelOn('sfx', true);
  assert.equal(settings.muted, false);
  assert.equal(isOn('music'), false);
  assert.equal(isOn('sfx'), true);
  setChannelOn('music', true);
});

test('audio: effects at 0 do no work, music switched off stops its scheduler', () => {
  const ac = fakeAudioContext();
  audio.ctx = ac;
  audio.mixer = createMixer(ac);
  audio.music = new MusicEngine(ac, audio.mixer);
  audio.setMusicMode('play');
  setAllMuted(false);
  setChannelOn('sfx', true);
  setVolume('sfx', 0.8);
  assert.ok(audio.stats().levels.sfx > 0);
  let before = voices.created;
  audio.play('coins', { amount: 50 });
  assert.ok(voices.created > before, 'effects on: a voice plays');
  setChannelOn('sfx', false);
  assert.equal(audio.stats().levels.sfx, 0);
  before = voices.created;
  const made = ac.made;
  ac.currentTime += 1;
  audio.play('coins', { amount: 50 });
  audio.play('click');
  assert.equal(voices.created, before, 'effects off: nothing is synthesised');
  assert.equal(ac.made, made, 'not a single node');
  setVolume('sfx', 0);
  setChannelOn('sfx', true);
  assert.ok(audio.stats().levels.sfx > 0, 'switching on at 0% comes back audible');
  // music: off fades and goes idle; on again resumes
  assert.equal(audio.music.active, true);
  setChannelOn('music', false);
  assert.equal(audio.stats().levels.music, 0);
  for (let i = 0; i < 30; i++) {
    ac.currentTime += 0.1;
    audio.music.scheduleUntil(ac.currentTime + 0.12);
  }
  assert.equal(audio.music.active, false, 'idle after the fade');
  const idle = ac.made;
  for (let i = 0; i < 30; i++) {
    ac.currentTime += 0.1;
    audio.music.scheduleUntil(ac.currentTime + 0.12);
  }
  assert.equal(ac.made, idle, 'nothing scheduled while the music is off');
  setChannelOn('music', true);
  assert.equal(audio.music.active, true);
  assert.equal(audio.music.mode, 'play');
  setAllMuted(true);
  assert.equal(audio.muted, true);
  setAllMuted(false);
  assert.equal(audio.muted, false);
  assert.ok(audio.stats().levels.music > 0 && audio.stats().levels.sfx > 0);
  audio.ctx = audio.mixer = audio.music = null;
});

test('music: switched back on, the song picks up at the top of the next bar, on the beat', () => {
  const ac = fakeAudioContext();
  const eng = new MusicEngine(ac, createMixer(ac));
  eng.setMode('play', 0);
  const run = (sec) => {
    for (let t = 0; t < sec; t += 0.05) {
      ac.currentTime += 0.05;
      eng.scheduleUntil(ac.currentTime + 0.12);
    }
  };
  run(9.3); // a few bars in, mid-bar
  eng.setMode('off', ac.currentTime);
  run(2.5);
  assert.equal(eng.active, false);
  const held = { ...eng.held };
  assert.equal(held.mode, 'play');
  run(5);
  eng.setMode('play');
  assert.equal(eng.active, true);
  assert.equal(eng.step, 0, 'on a downbeat');
  // where the song should be: the bar after the held one (a fresh engine walks the same arrangement)
  const ref = new MusicEngine(ac, createMixer(ac));
  Object.assign(ref, { mode: 'play', secIdx: held.secIdx, bar: held.bar, step: 15, iter: held.iter });
  ref._advance();
  assert.ok(held.secIdx > 0 || held.bar > 0, 'the fade stopped it past the first bar: ' + JSON.stringify(held));
  assert.deepEqual([eng.secIdx, eng.bar, eng.iter], [ref.secIdx, ref.bar, ref.iter], 'resumes on the next bar, not the intro');
  assert.ok(eng.nextTime > ac.currentTime && eng.nextTime < ac.currentTime + 0.1, 'starts right away');
  run(STEP * 16 * 2 - 0.06); // two bars later it has kept time
  for (let i = 0; i < 32; i++) ref._advance();
  assert.deepEqual([eng.secIdx, eng.bar], [ref.secIdx, ref.bar]);
  // a different song (title) after 'off' starts from its top
  eng.setMode('off', ac.currentTime);
  run(2.5);
  eng.setMode('title');
  assert.deepEqual([eng.secIdx, eng.bar, eng.step], [0, 0, 0]);
});

test('hair: white and silver are natural colours; random looks still mostly pick natural colours', () => {
  assert.ok(cos.HAIR_NATURAL.includes(WHITE) && cos.HAIR_NATURAL.includes(SILVER));
  assert.deepEqual(cos.COLORS.hair, [...cos.HAIR_NATURAL, ...cos.HAIR_FUN]);
  assert.equal(new Set(cos.COLORS.hair).size, cos.COLORS.hair.length, 'no duplicates');
  for (const c of cos.COLORS.hair) {
    assert.match(c, /^#[0-9a-f]{6}$/);
    assert.ok(cos.HAIR_NAMES[c], 'every swatch has a name: ' + c);
  }
  assert.equal(cos.HAIR_NAMES[WHITE], 'White');
  assert.equal(cos.HAIR_NAMES[SILVER], 'Silver');
  // a seeded random source: count where the hair colours land
  let s = 7;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const profile = getProfile('dorian');
  const seen = new Map();
  let natural = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const c = cos.randomLook(profile, null, r).hairColor;
    assert.ok(cos.COLORS.hair.includes(c), c);
    seen.set(c, (seen.get(c) || 0) + 1);
    if (cos.HAIR_NATURAL.includes(c)) natural++;
  }
  // 3 in 4 from the natural shades, the rest from the whole palette (10 of its 15 are natural): ~92%
  const want = 0.75 + 0.25 * (cos.HAIR_NATURAL.length / cos.COLORS.hair.length);
  assert.ok(Math.abs(natural / N - want) < 0.03, `natural share ${natural / N} (want ${want.toFixed(3)})`);
  assert.ok(seen.get(WHITE) > 50 && seen.get(SILVER) > 50, 'white and silver come up');
  assert.ok(cos.HAIR_FUN.every((c) => seen.get(c) > 10), 'fun dyes still come up');
});

test('hair: white and silver survive saves, old saves still load, and other players see them online', () => {
  for (const c of [WHITE, SILVER, WHITE.toUpperCase()]) {
    assert.equal(cos.sanitizeLook({ hairColor: c }, 'esther').hairColor, c.toLowerCase());
    assert.equal(net.sanitizeLook({ hair: 'bob', hairColor: c }, 'maddie').hairColor, c.toLowerCase());
  }
  // profiles: saved and normalised on load
  const p = getProfile('esther');
  replaceProfile('esther', { ...p, look: { ...p.look, hair: 'long', hairColor: WHITE } });
  assert.equal(JSON.parse(store.get('steal-a-seed:v1:profile:esther')).look.hairColor, WHITE);
  assert.equal(getProfile('esther').look.hairColor, WHITE);
  // an old save from before the new colours (no hairColor at all, or one of the old ones) loads as before
  const old = replaceProfile('micah', { id: 'micah', name: 'Micah', base: 'micah', look: { hair: 'spiky', shirt: 'tee' } });
  assert.equal(old.look.hairColor, CHARACTER.micah.look.hairColor);
  assert.equal(replaceProfile('micah', { id: 'micah', base: 'micah', look: { hairColor: '#b9b9c4' } }).look.hairColor, '#b9b9c4');
  // junk is still refused
  assert.equal(cos.sanitizeLook({ hairColor: 'white' }, 'micah').hairColor, CHARACTER.micah.look.hairColor);
  // who cards and the host's player state carry it to everyone
  const w = net.sanitizeWho({ name: 'Grandpa', base: 'dorian', look: { hair: 'short', hairColor: SILVER } }, 'k0123456789abcde', false);
  assert.equal(w.look.hairColor, SILVER);
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed: 3 });
  game.human.look = cos.sanitizeLook({ ...game.human.look, hair: 'curly', hairColor: WHITE }, 'dorian');
  const raw = JSON.parse(JSON.stringify(game.serializeFull()));
  const full = net.vetFull(raw);
  assert.ok(full, 'the state passes the vetting');
  assert.equal(full.players[game.human.slot].look.hairColor, WHITE);
  assert.equal(full.players[game.human.slot].look.hair, 'curly');
});
