// Low-level WebAudio voices shared by the music engine and the SFX.
// Every function takes any BaseAudioContext (live AudioContext or OfflineAudioContext), an output
// node and a start time, builds a short-lived voice, and cleans it up (disconnect) when it ends.

/** Live voice bookkeeping (voices = one-shot node groups currently alive). */
export const stats = { active: 0, created: 0 };

const KITS = new WeakMap();
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function periodic(ac, amps) {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  for (let i = 0; i < amps.length; i++) imag[i + 1] = amps[i];
  return ac.createPeriodicWave(real, imag);
}

/** Per-context shared resources: one noise buffer and a few wavetables (built once, reused forever). */
export function kit(ac) {
  let k = KITS.get(ac);
  if (k) return k;
  const sr = ac.sampleRate;
  const len = Math.floor(sr * 2);
  const noise = ac.createBuffer(1, len, sr);
  const d = noise.getChannelData(0);
  let s = 0x2f6b1d;
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    d[i] = s / 2147483648 - 1;
  }
  const glottal = [];
  for (let n = 1; n <= 36; n++) glottal.push(1 / Math.pow(n, 1.15));
  k = {
    noise,
    noiseLen: 2,
    // steel pan: strong octave partial, a touch of the twelfth
    pan: periodic(ac, [1, 0.52, 0.16, 0.06, 0.02]),
    // warm round bass with just enough upper harmonics to read on phone speakers
    bass: periodic(ac, [1, 0.42, 0.2, 0.09, 0.045, 0.02]),
    // cuatro / ukulele-ish pluck
    pluck: periodic(ac, [1, 0.62, 0.42, 0.26, 0.17, 0.1, 0.06, 0.035]),
    // brass: bright but not buzzy
    brass: periodic(ac, [1, 0.8, 0.62, 0.46, 0.34, 0.24, 0.16, 0.1, 0.06, 0.035]),
    // glottal pulse for the formant voice
    voice: periodic(ac, glottal),
    // tension bass (saw-ish, band limited)
    saw: periodic(ac, [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.13, 0.1, 0.08, 0.06, 0.05, 0.04]),
  };
  KITS.set(ac, k);
  return k;
}

// Live voices are held here until they end, so `ended` can't be lost to garbage collection,
// and a time-based sweep retires any voice whose `ended` event never arrived.
const live = new Set();

function endVoice(v) {
  if (v.done) return;
  v.done = true;
  live.delete(v);
  stats.active = live.size;
  for (const n of v.nodes) n.disconnect();
}

/** Stop all sources at `stopAt` and disconnect every node once the voice has ended. */
export function finish(sources, nodes, stopAt) {
  for (const s of sources) s.stop(stopAt);
  const v = { nodes, stopAt, done: false };
  live.add(v);
  stats.created++;
  stats.active = live.size;
  sources[0].onended = () => endVoice(v);
}

/** Retire voices that should have ended more than half a second ago. */
export function sweepVoices(ac) {
  const t = ac.currentTime - 0.5;
  for (const v of live) if (v.stopAt < t) endVoice(v);
}

export function noiseSource(ac, t) {
  const k = kit(ac);
  const src = ac.createBufferSource();
  src.buffer = k.noise;
  src.loop = true;
  src.start(t, Math.random() * (k.noiseLen - 0.1));
  return src;
}

function oscOf(ac, type, f, t) {
  const o = ac.createOscillator();
  if (typeof type === 'string') o.type = type;
  else o.setPeriodicWave(type);
  o.frequency.setValueAtTime(f, t);
  return o;
}

/** Percussive envelope: linear attack to `peak`, then exponential decay reaching ~-55 dB after `decay` s. */
function perc(param, t, peak, attack, decay) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(0, t + attack, decay / 6.5);
}

// ------------------------------------------------------------------ pitched instruments

/**
 * Steel pan: FM (1:1) on a partial-rich carrier. The modulation index falls fast, so each note
 * starts bright and metallic and settles into a round, bell-like tone.
 */
export function steelPan(ac, out, t, midi, vel = 0.8, o = {}) {
  const k = kit(ac);
  const f = mtof(midi);
  const dec = clamp(2.1 - (midi - 60) * 0.04, 0.45, 2.3) * (o.decay || 1);
  if (o.cheap) {
    // roll strikes / quiet doublings: no FM (half the nodes), the attack is masked anyway
    const x = oscOf(ac, k.pan, f, t);
    const g = ac.createGain();
    perc(g.gain, t, vel * 0.3 * (o.gain ?? 1), 0.004, dec);
    x.connect(g);
    g.connect(out);
    x.start(t);
    finish([x], [x, g], t + dec * 0.8);
    return;
  }
  const car = oscOf(ac, k.pan, f, t);
  const mod = oscOf(ac, 'sine', f, t);
  const mg = ac.createGain();
  const idx = (o.bright ?? 1) * (0.9 + vel * 1.5);
  mg.gain.setValueAtTime(f * idx, t);
  mg.gain.setTargetAtTime(f * 0.12, t, 0.045);
  mod.connect(mg);
  mg.connect(car.frequency);
  const amp = ac.createGain();
  perc(amp.gain, t, vel * 0.3 * (o.gain ?? 1), 0.004, dec);
  car.connect(amp);
  amp.connect(out);
  if (o.send) amp.connect(o.send);
  car.start(t);
  mod.start(t);
  finish([car, mod], [car, mod, mg, amp], t + dec * 0.8);
}

/** Marimba: sine fundamental plus the bar's quick-dying 4th partial (the mallet "tock"). */
export function marimba(ac, out, t, midi, vel = 0.8, o = {}) {
  const f = mtof(midi);
  const dec = clamp(1.5 - (midi - 48) * 0.028, 0.28, 1.5) * (o.decay || 1);
  const o1 = oscOf(ac, 'sine', f, t);
  const o2 = oscOf(ac, 'sine', f * 3.93, t);
  const g1 = ac.createGain();
  const g2 = ac.createGain();
  const peak = vel * 0.34 * (o.gain ?? 1);
  perc(g1.gain, t, peak, 0.003, dec);
  perc(g2.gain, t, peak * 0.32, 0.001, Math.min(0.14, dec * 0.25));
  o1.connect(g1);
  o2.connect(g2);
  g1.connect(out);
  g2.connect(out);
  if (o.send) g1.connect(o.send);
  o1.start(t);
  o2.start(t);
  finish([o1, o2], [o1, o2, g1, g2], t + dec * 0.8);
}

/** Warm round bass with a tiny pitch "thump" at the start. */
export function bass(ac, out, t, midi, vel = 0.8, dur = 0.3) {
  const k = kit(ac);
  const f = mtof(midi);
  const o = oscOf(ac, k.bass, f * 1.018, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
  const g = ac.createGain();
  const peak = vel * 0.42;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  g.gain.setTargetAtTime(peak * 0.62, t + 0.008, 0.09);
  g.gain.setTargetAtTime(0, t + dur, 0.045);
  o.connect(g);
  g.connect(out);
  o.start(t);
  finish([o], [o, g], t + dur + 0.3);
}

/** Tension bass for the chase layer: resonant filtered saw with a snappy filter envelope. */
export function tensionBass(ac, out, t, midi, vel = 0.8, dur = 0.12) {
  const k = kit(ac);
  const f = mtof(midi);
  const o = oscOf(ac, k.saw, f, t);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 5;
  lp.frequency.setValueAtTime(f * (4 + vel * 5), t);
  lp.frequency.setTargetAtTime(f * 1.4, t, 0.05);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.004);
  g.gain.setTargetAtTime(0, t + dur, 0.03);
  o.connect(lp);
  lp.connect(g);
  g.connect(out);
  o.start(t);
  finish([o], [o, lp, g], t + dur + 0.2);
}

/** Short chord stab (the off-beat "chuck" of island strumming). */
export function pluck(ac, out, t, midis, vel = 0.7, o = {}) {
  const k = kit(ac);
  const dec = o.decay ?? 0.22;
  const g = ac.createGain();
  perc(g.gain, t, vel * 0.3 * (o.gain ?? 1), 0.003, dec);
  const srcs = [];
  for (let i = 0; i < midis.length; i++) {
    const x = oscOf(ac, k.pluck, mtof(midis[i]), t + i * (o.strum ?? 0.006));
    x.detune.value = (Math.random() - 0.5) * 10;
    x.connect(g);
    x.start(t + i * (o.strum ?? 0.006));
    srcs.push(x);
  }
  g.connect(out);
  if (o.send) g.connect(o.send);
  finish(srcs, [...srcs, g], t + dec + midis.length * 0.006 + 0.02);
}

/** Harp / kalimba style single pluck. */
export function harp(ac, out, t, midi, vel = 0.7, o = {}) {
  const k = kit(ac);
  const f = mtof(midi);
  const dec = o.decay ?? clamp(1.4 - (midi - 60) * 0.02, 0.4, 1.4);
  const x = oscOf(ac, k.pluck, f, t);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(16000, f * 7), t);
  lp.frequency.setTargetAtTime(f * 2, t, dec / 4);
  const g = ac.createGain();
  perc(g.gain, t, vel * 0.2 * (o.gain ?? 1), 0.002, dec);
  x.connect(lp);
  lp.connect(g);
  g.connect(out);
  if (o.send) g.connect(o.send);
  x.start(t);
  finish([x], [x, lp, g], t + dec + 0.02);
}

/** Soft pad chord: detuned triangles with a slow attack. */
export function pad(ac, out, t, midis, vel = 0.5, dur = 2) {
  const g = ac.createGain();
  const peak = vel * 0.07;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + Math.min(0.5, dur * 0.3));
  g.gain.setValueAtTime(peak, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.18);
  const srcs = [];
  for (const m of midis) {
    for (const det of [-7, 7]) {
      const x = oscOf(ac, 'triangle', mtof(m), t);
      x.detune.value = det;
      x.connect(g);
      x.start(t);
      srcs.push(x);
    }
  }
  g.connect(out);
  finish(srcs, [...srcs, g], t + dur + 1.1);
}

/** FM bell / glockenspiel / chime. ratio ~3.5 = glassy, 2 = bright chime, 1.4 = gong-ish. */
export function bell(ac, out, t, freq, o = {}) {
  const dec = o.decay ?? 0.9;
  const ratio = o.ratio ?? 3.5;
  freq = Math.min(freq, ac.sampleRate * 0.2);
  const mf = Math.min(freq * ratio, ac.sampleRate * 0.45);
  const car = oscOf(ac, 'sine', freq, t);
  const mod = oscOf(ac, 'sine', mf, t);
  const mg = ac.createGain();
  mg.gain.setValueAtTime(mf * (o.index ?? 1.2), t);
  mg.gain.setTargetAtTime(0, t, dec / 5);
  mod.connect(mg);
  mg.connect(car.frequency);
  const g = ac.createGain();
  perc(g.gain, t, o.vol ?? 0.2, o.attack ?? 0.002, dec);
  car.connect(g);
  g.connect(out);
  if (o.send) g.connect(o.send);
  car.start(t);
  mod.start(t);
  finish([car, mod], [car, mod, mg, g], t + dec + 0.02);
}

/** Brass note (two detuned saws, filter swell, slight pitch scoop). `dur` = held length. */
export function brass(ac, out, t, midi, vel = 0.8, dur = 0.4, o = {}) {
  const k = kit(ac);
  const f = mtof(midi);
  const a = ac.createOscillator();
  const b = ac.createOscillator();
  a.setPeriodicWave(k.brass);
  b.setPeriodicWave(k.brass);
  for (const x of [a, b]) {
    x.frequency.setValueAtTime(f * 0.985, t);
    x.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  }
  a.detune.value = -6;
  b.detune.value = 6;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.linearRampToValueAtTime(Math.min(12000, f * (2.5 + vel * 5)), t + 0.06);
  lp.frequency.setTargetAtTime(f * (2 + vel * 2), t + 0.08, 0.25);
  const g = ac.createGain();
  const peak = vel * 0.13 * (o.gain ?? 1);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.03);
  g.gain.setTargetAtTime(peak * 0.75, t + 0.03, 0.12);
  g.gain.setTargetAtTime(0, t + dur, 0.07);
  a.connect(lp);
  b.connect(lp);
  lp.connect(g);
  g.connect(out);
  if (o.send) g.connect(o.send);
  a.start(t);
  b.start(t);
  finish([a, b], [a, b, lp, g], t + dur + 0.45);
}

// ------------------------------------------------------------------ percussion

export function kick(ac, out, t, vel = 0.9) {
  const o = oscOf(ac, 'sine', 140, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
  const g = ac.createGain();
  perc(g.gain, t, vel * 0.8, 0.002, 0.34);
  o.connect(g);
  g.connect(out);
  o.start(t);
  finish([o], [o, g], t + 0.38);
}

export function clap(ac, out, t, vel = 0.7) {
  const n = noiseSource(ac, t);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1150;
  bp.Q.value = 1.3;
  const g = ac.createGain();
  const p = vel * 0.95;
  const G = g.gain;
  G.setValueAtTime(0, t);
  for (const off of [0, 0.011, 0.022]) {
    G.setValueAtTime(p, t + off);
    G.setTargetAtTime(p * 0.15, t + off + 0.001, 0.003);
  }
  G.setValueAtTime(p * 0.8, t + 0.031);
  G.setTargetAtTime(0, t + 0.032, 0.035);
  n.connect(bp);
  bp.connect(g);
  g.connect(out);
  finish([n], [n, bp, g], t + 0.3);
}

/** Wooden clave / rim click. */
export function clave(ac, out, t, vel = 0.6) {
  const o = oscOf(ac, 'sine', 2350, t);
  const o2 = oscOf(ac, 'triangle', 1180, t);
  const g = ac.createGain();
  perc(g.gain, t, vel * 0.2, 0.001, 0.07);
  o.connect(g);
  o2.connect(g);
  g.connect(out);
  o.start(t);
  o2.start(t);
  finish([o, o2], [o, o2, g], t + 0.09);
}

/** Conga: 'lo' | 'mid' | 'hi', optional slap. */
const CONGA = { lo: 165, mid: 225, hi: 300 };
export function conga(ac, out, t, which = 'mid', vel = 0.6, slap = false) {
  const f = CONGA[which] || 225;
  const o = oscOf(ac, 'sine', f * 1.3, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.025);
  const g = ac.createGain();
  perc(g.gain, t, vel * 0.42, 0.002, slap ? 0.12 : 0.26);
  o.connect(g);
  g.connect(out);
  o.start(t);
  if (!slap) {
    finish([o], [o, g], t + 0.28);
    return;
  }
  const n = noiseSource(ac, t);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  bp.Q.value = 0.9;
  const ng = ac.createGain();
  perc(ng.gain, t, vel * 0.3, 0.001, 0.05);
  n.connect(bp);
  bp.connect(ng);
  ng.connect(out);
  finish([o, n], [o, g, n, bp, ng], t + 0.28);
}

export function tom(ac, out, t, f = 140, vel = 0.7) {
  const o = oscOf(ac, 'sine', f * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  const g = ac.createGain();
  perc(g.gain, t, vel * 0.55, 0.002, 0.4);
  o.connect(g);
  g.connect(out);
  o.start(t);
  finish([o], [o, g], t + 0.42);
}

/** Splash / crash cymbal: bright filtered noise with a long tail. */
export function cymbal(ac, out, t, vel = 0.5, dur = 1.3) {
  const n = noiseSource(ac, t);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5200;
  const g = ac.createGain();
  perc(g.gain, t, vel * 0.22, 0.003, dur);
  n.connect(hp);
  hp.connect(g);
  g.connect(out);
  finish([n], [n, hp, g], t + dur + 0.02);
}

/** Snare: noise body + short tone. */
export function snare(ac, out, t, vel = 0.6) {
  const n = noiseSource(ac, t);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1400;
  const g = ac.createGain();
  perc(g.gain, t, vel * 0.32, 0.001, 0.16);
  const o = oscOf(ac, 'triangle', 240, t);
  o.frequency.exponentialRampToValueAtTime(170, t + 0.05);
  const og = ac.createGain();
  perc(og.gain, t, vel * 0.25, 0.001, 0.08);
  n.connect(hp);
  hp.connect(g);
  o.connect(og);
  g.connect(out);
  og.connect(out);
  o.start(t);
  finish([n, o], [n, hp, g, o, og], t + 0.18);
}

// ------------------------------------------------------------------ generic SFX building blocks

/**
 * Enveloped oscillator with optional pitch sweep and vibrato.
 * o: {type|wave, f0, f1, pts:[[dt, f], ...], exp=true, dur, attack, hold, vol, vib:{rate, depth, fade}, send, delay}
 */
export function tone(ac, out, t, o) {
  t += o.delay || 0;
  const dur = o.dur ?? 0.2;
  const x = oscOf(ac, o.wave || o.type || 'sine', o.f0, t);
  const F = x.frequency;
  const exp = o.exp !== false;
  if (o.pts) {
    for (const [dt, f] of o.pts) exp ? F.exponentialRampToValueAtTime(f, t + dt) : F.linearRampToValueAtTime(f, t + dt);
  } else if (o.f1 && o.f1 !== o.f0) {
    exp ? F.exponentialRampToValueAtTime(o.f1, t + (o.sweep ?? dur)) : F.linearRampToValueAtTime(o.f1, t + (o.sweep ?? dur));
  }
  if (o.detune) x.detune.value = o.detune;
  const g = ac.createGain();
  const a = o.attack ?? 0.004;
  const hold = o.hold ?? 0;
  const vol = o.vol ?? 0.3;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  if (hold) g.gain.setValueAtTime(vol, t + a + hold);
  g.gain.setTargetAtTime(0, t + a + hold, Math.max(0.005, (dur - a - hold) / 6));
  x.connect(g);
  g.connect(out);
  if (o.send) g.connect(o.send);
  const srcs = [x];
  const nodes = [x, g];
  if (o.vib) {
    const l = oscOf(ac, o.vib.type || 'sine', o.vib.rate, t);
    const lg = ac.createGain();
    lg.gain.setValueAtTime(o.f0 * o.vib.depth, t);
    if (o.vib.fade) lg.gain.setTargetAtTime(0, t, o.vib.fade);
    l.connect(lg);
    lg.connect(F);
    l.start(t);
    srcs.push(l);
    nodes.push(l, lg);
  }
  x.start(t);
  finish(srcs, nodes, t + dur + 0.02);
}

/**
 * Filtered noise burst with an optional filter sweep.
 * o: {filter='bandpass', f0, f1, pts, q, dur, attack, hold, vol, send, delay, lfo:{rate, depth}}
 */
export function noise(ac, out, t, o) {
  t += o.delay || 0;
  const dur = o.dur ?? 0.2;
  const n = noiseSource(ac, t);
  const bq = ac.createBiquadFilter();
  bq.type = o.filter || 'bandpass';
  bq.Q.value = o.q ?? 1;
  const F = bq.frequency;
  F.setValueAtTime(o.f0, t);
  if (o.pts) for (const [dt, f] of o.pts) F.exponentialRampToValueAtTime(f, t + dt);
  else if (o.f1) F.exponentialRampToValueAtTime(o.f1, t + (o.sweep ?? dur));
  const g = ac.createGain();
  const a = o.attack ?? 0.003;
  const hold = o.hold ?? 0;
  const vol = o.vol ?? 0.3;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  if (hold) g.gain.setValueAtTime(vol, t + a + hold);
  g.gain.setTargetAtTime(0, t + a + hold, Math.max(0.004, (dur - a - hold) / 6));
  n.connect(bq);
  bq.connect(g);
  g.connect(out);
  if (o.send) g.connect(o.send);
  const srcs = [n];
  const nodes = [n, bq, g];
  if (o.lfo) {
    const l = oscOf(ac, o.lfo.type || 'sine', o.lfo.rate, t);
    const lg = ac.createGain();
    lg.gain.value = o.lfo.depth;
    l.connect(lg);
    lg.connect(F);
    l.start(t);
    srcs.push(l);
    nodes.push(l, lg);
  }
  finish(srcs, nodes, t + dur + 0.02);
}

/**
 * Formant voice: a glottal source through three vowel formant filters, then an optional
 * fricative tail. Used for the cartoon "oof".
 * o: {f0, drop (pitch ratio at end), formants:[[f,q,g],...], dur, vol, fric: {f, dur, vol}}
 */
export function formantVoice(ac, out, t, o) {
  const k = kit(ac);
  const dur = o.dur ?? 0.22;
  const src = oscOf(ac, k.voice, o.f0 * (o.rise ?? 1.15), t);
  src.frequency.exponentialRampToValueAtTime(o.f0, t + 0.04);
  src.frequency.exponentialRampToValueAtTime(o.f0 * (o.drop ?? 0.78), t + dur);
  // a little jitter makes it sound less like a synth
  const jit = oscOf(ac, 'sine', 23, t);
  const jg = ac.createGain();
  jg.gain.value = o.f0 * 0.025;
  jit.connect(jg);
  jg.connect(src.frequency);
  const env = ac.createGain();
  const vol = o.vol ?? 0.5;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.012);
  env.gain.setValueAtTime(vol * 0.9, t + dur * 0.55);
  env.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.12);
  const nodes = [src, jit, jg, env];
  for (const [f, q, gg] of o.formants) {
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const fg = ac.createGain();
    fg.gain.value = gg;
    src.connect(bp);
    bp.connect(fg);
    fg.connect(env);
    nodes.push(bp, fg);
  }
  env.connect(out);
  src.start(t);
  jit.start(t);
  finish([src, jit], nodes, t + dur + 0.05);
  if (o.fric) {
    noise(ac, out, t + dur * 0.75, { filter: 'highpass', f0: o.fric.f || 2200, q: 0.6, attack: 0.02, dur: o.fric.dur || 0.12, vol: o.fric.vol || 0.06 });
  }
}

/**
 * Growl: a rough, amplitude-modulated saw through a resonant low-pass, plus breathy noise.
 * o: {f0, contour:[r0, r1, r2], rough, formant, q, noise, dur, vol}
 */
export function growl(ac, out, t, o) {
  const k = kit(ac);
  const dur = o.dur ?? 0.7;
  const [r0, r1, r2] = o.contour || [0.9, 1.25, 0.8];
  const src = oscOf(ac, k.saw, o.f0 * r0, t);
  src.frequency.exponentialRampToValueAtTime(o.f0 * r1, t + dur * 0.3);
  src.frequency.exponentialRampToValueAtTime(o.f0 * r2, t + dur);
  // sub-octave only where it is still audible (below ~60 Hz it just eats headroom)
  const subMul = o.f0 >= 120 ? 0.5 : 1;
  const sub = oscOf(ac, 'triangle', o.f0 * r0 * subMul, t);
  sub.frequency.exponentialRampToValueAtTime(o.f0 * r1 * subMul, t + dur * 0.3);
  sub.frequency.exponentialRampToValueAtTime(o.f0 * r2 * subMul, t + dur);
  sub.detune.value = subMul === 1 ? 14 : 0;
  // roughness: amplitude modulation at a sub-audio/audio boundary rate
  const am = ac.createGain();
  am.gain.value = 0.6;
  const lfo = oscOf(ac, 'square', o.rough ?? 30, t);
  const lg = ac.createGain();
  lg.gain.value = 0.4;
  lfo.connect(lg);
  lg.connect(am.gain);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = o.q ?? 4;
  lp.frequency.setValueAtTime(o.formant * 0.6, t);
  lp.frequency.exponentialRampToValueAtTime(o.formant * 1.3, t + dur * 0.3);
  lp.frequency.exponentialRampToValueAtTime(o.formant * 0.5, t + dur);
  const env = ac.createGain();
  const vol = o.vol ?? 0.5;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.05);
  env.gain.setValueAtTime(vol * 0.85, t + dur * 0.6);
  env.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.1);
  src.connect(am);
  sub.connect(am);
  am.connect(lp);
  lp.connect(env);
  env.connect(out);
  src.start(t);
  sub.start(t);
  lfo.start(t);
  finish([src, sub, lfo], [src, sub, am, lfo, lg, lp, env], t + dur + 0.05);
  if (o.noise) {
    noise(ac, out, t, { filter: 'bandpass', f0: o.formant * 1.6, q: 0.8, attack: 0.06, hold: dur * 0.4, dur, vol: vol * o.noise });
  }
}
