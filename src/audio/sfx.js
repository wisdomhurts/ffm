// Cartoony procedural sound effects. Each recipe is (ac, out, t, o) => void, where
// o.vol scales the whole effect (distance attenuation), o.send is an optional reverb send, and
// the rest are recipe-specific options. Works on any BaseAudioContext.
import {
  tone, noise, bell, steelPan, marimba, harp, brass, pad, kick, tom, cymbal,
  formantVoice, growl, finish, kit, mtof, clamp,
} from './synth.js';

const V = (o, x) => x * (o.vol ?? 1);
const rnd = (a, b) => a + Math.random() * (b - a);

// Cartoon voice per character: pitch (Hz) and formant scale (kids and mom sit higher).
export const VOICES = {
  dorian: { f0: 112, fs: 1.0, gain: 1 },
  esther: { f0: 212, fs: 1.12, gain: 0.7 },
  maddie: { f0: 282, fs: 1.2, gain: 0.55 },
  micah: { f0: 298, fs: 1.24, gain: 0.55 },
};

// Monster voices: pitch, roughness (AM rate), resonance, breath and length.
export const GROWLS = {
  stump: { gain: 1.25, f0: 60, rough: 24, formant: 560, q: 5, noise: 0.25, dur: 0.8, contour: [0.9, 1.2, 0.72] },
  crab: { gain: 0.7, f0: 150, rough: 46, formant: 1150, q: 3, noise: 0.3, dur: 0.45, contour: [1, 1.3, 0.9], clicks: true },
  snapper: { gain: 0.9, f0: 86, rough: 16, formant: 720, q: 6, noise: 0.2, dur: 0.62, contour: [1, 1.18, 0.68] },
  lavasprout: { gain: 0.65, f0: 112, rough: 34, formant: 1250, q: 3, noise: 0.75, dur: 0.7, contour: [0.85, 1.3, 0.8] },
  lurker: { gain: 1.25, f0: 52, rough: 11, formant: 460, q: 7, noise: 0.4, dur: 1.1, contour: [0.8, 1.12, 0.58], ethereal: true },
};

function oof(ac, out, t, o) {
  const v = VOICES[o.who] || VOICES.micah;
  const fs = v.fs;
  formantVoice(ac, out, t, {
    f0: v.f0 * rnd(0.96, 1.05),
    rise: 1.2,
    drop: 0.7,
    dur: 0.23,
    vol: V(o, 0.6 * (v.gain ?? 1)),
    formants: [[400 * fs, 6, 2.6], [900 * fs, 8, 1.5], [2450 * fs, 11, 0.5]],
    fric: { f: 1900, dur: 0.11, vol: V(o, 0.05) },
  });
}

function bonkKnock(ac, out, t, o, pitch = 1) {
  tone(ac, out, t, { f0: 540 * pitch, f1: 250 * pitch, sweep: 0.035, dur: 0.17, attack: 0.001, vol: V(o, 0.5) });
  tone(ac, out, t, { type: 'triangle', f0: 900 * pitch, f1: 420 * pitch, sweep: 0.025, dur: 0.09, attack: 0.001, vol: V(o, 0.22) });
  noise(ac, out, t, { filter: 'lowpass', f0: 2000, dur: 0.05, attack: 0.001, vol: V(o, 0.35) });
}

/** Resonant saw sweep used by the laser lock (up = power-up, else power-down). */
function laser(ac, out, t, up, o) {
  const k = kit(ac);
  const dur = up ? 0.8 : 0.65;
  const x = ac.createOscillator();
  x.setPeriodicWave(k.saw);
  const y = ac.createOscillator();
  y.type = 'square';
  const f0 = up ? 80 : 340;
  const f1 = up ? 340 : 55;
  for (const [osc, m] of [[x, 1], [y, 2.005]]) {
    osc.frequency.setValueAtTime(f0 * m, t);
    osc.frequency.exponentialRampToValueAtTime(f1 * m, t + dur * 0.75);
  }
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 9;
  lp.frequency.setValueAtTime(up ? 250 : 3600, t);
  lp.frequency.exponentialRampToValueAtTime(up ? 3600 : 180, t + dur * 0.75);
  const yg = ac.createGain();
  yg.gain.value = 0.35;
  const g = ac.createGain();
  const vol = V(o, 0.2);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.03);
  g.gain.setValueAtTime(vol, t + dur * 0.6);
  g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.08);
  // laser shimmer: fast tremolo
  const trem = ac.createOscillator();
  trem.frequency.value = up ? 22 : 16;
  const tg = ac.createGain();
  tg.gain.value = vol * 0.35;
  trem.connect(tg);
  tg.connect(g.gain);
  x.connect(lp);
  y.connect(yg);
  yg.connect(lp);
  lp.connect(g);
  g.connect(out);
  if (o.send) g.connect(o.send);
  x.start(t);
  y.start(t);
  trem.start(t);
  finish([x, y, trem], [x, y, yg, lp, g, trem, tg], t + dur + 0.05);
  tone(ac, out, t, { f0: up ? 1100 : 2600, f1: up ? 2800 : 900, sweep: dur * 0.8, dur, attack: 0.05, hold: dur * 0.4, vol: V(o, 0.045) });
}

function coinTing(ac, out, t, f, v, send) {
  bell(ac, out, t, f, { ratio: 2.76, index: 0.55, vol: v, decay: 0.28, send });
  tone(ac, out, t, { f0: f * 2, dur: 0.06, attack: 0.001, vol: v * 0.35 });
}

function sparkleRun(ac, out, t, base, n, v, send, spacing = 0.035) {
  const pent = [0, 2, 4, 7, 9];
  base = Math.min(base, 88);
  for (let i = 0; i < n; i++) {
    let m = base + pent[i % 5] + 12 * Math.floor(i / 5);
    while (m > 105) m -= 12;
    bell(ac, out, t + i * spacing, mtof(m), { ratio: 3.5, index: 1, vol: v * (1 - i / (n * 1.6)), decay: 0.5, send });
  }
  noise(ac, out, t, { filter: 'highpass', f0: 7000, attack: 0.12, dur: n * spacing + 0.4, vol: v * 0.35 });
}

export const SFX = {
  // ---------------------------------------------------------------- UI
  click(ac, out, t, o) {
    tone(ac, out, t, { f0: 1800, f1: 1150, sweep: 0.03, dur: 0.05, attack: 0.001, vol: V(o, 0.45) });
    tone(ac, out, t, { type: 'triangle', f0: 900, dur: 0.035, attack: 0.001, vol: V(o, 0.2) });
  },
  hover(ac, out, t, o) {
    tone(ac, out, t, { f0: 2500, f1: 2800, dur: 0.04, attack: 0.003, vol: V(o, 0.22) });
  },
  error(ac, out, t, o) {
    tone(ac, out, t, { type: 'triangle', f0: 392, f1: 370, dur: 0.12, vol: V(o, 0.34) });
    tone(ac, out, t, { type: 'triangle', f0: 294, f1: 250, dur: 0.24, delay: 0.12, vol: V(o, 0.34) });
  },
  shopBell(ac, out, t, o) {
    bell(ac, out, t, mtof(88), { ratio: 1.0, index: 0.4, vol: V(o, 0.12), decay: 0.7, send: o.send });
    bell(ac, out, t + 0.16, mtof(84), { ratio: 1.0, index: 0.4, vol: V(o, 0.12), decay: 0.9, send: o.send });
  },

  // ---------------------------------------------------------------- seeds & plants
  /** o.tier 0..6 (rarity), o.mutation */
  grab(ac, out, t, o) {
    const tier = clamp(o.tier ?? 0, 0, 6);
    const mut = o.mutation || 'normal';
    const base = 76 + tier * 2;
    const idx = 0.5 + tier * 0.3;
    const v = V(o, 0.2 - tier * 0.014);
    tone(ac, out, t, { type: 'triangle', f0: 480, f1: 1300, sweep: 0.05, dur: 0.07, vol: V(o, 0.14) });
    bell(ac, out, t, mtof(base), { ratio: 2, index: idx, vol: v, decay: 0.45 + tier * 0.08, send: o.send });
    bell(ac, out, t + 0.07, mtof(base + 7), { ratio: 2, index: idx, vol: v, decay: 0.6 + tier * 0.1, send: o.send });
    if (tier >= 2) bell(ac, out, t + 0.14, mtof(base + 12), { ratio: 2, index: idx, vol: v * 0.8, decay: 0.8, send: o.send });
    if (tier >= 4 || mut !== 'normal') sparkleRun(ac, out, t + 0.18, base + 12, 6 + tier, V(o, 0.06), o.send);
    if (mut === 'gold') {
      bell(ac, out, t + 0.2, mtof(base + 16), { ratio: 1.0, index: 0.3, vol: V(o, 0.12), decay: 1.2, send: o.send });
      noise(ac, out, t + 0.18, { filter: 'bandpass', f0: 5200, q: 3, attack: 0.02, dur: 0.5, vol: V(o, 0.06) });
    } else if (mut === 'diamond') {
      for (let i = 0; i < 5; i++) bell(ac, out, t + 0.22 + i * 0.07, mtof(100 - i * 3), { ratio: 3.5, index: 1.8, vol: V(o, 0.07), decay: 0.9, send: o.send });
    } else if (mut === 'rainbow') {
      [0, 2, 4, 5, 7, 9, 11, 12].forEach((d, i) => harp(ac, out, t + 0.2 + i * 0.045, base + d, 0.5 * (o.vol ?? 1), { decay: 0.6, send: o.send }));
    }
    if (tier >= 6) SFX.secret(ac, out, t + 0.3, o);
  },
  /** Secret seed: a magical lydian arpeggio over a soft swell. */
  secret(ac, out, t, o) {
    const scale = [0, 2, 4, 6, 7, 9, 11];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const m = 65 + scale[i % 7] + 12 * Math.floor(i / 7);
      const tt = t + 1.1 * (1 - Math.pow(1 - i / n, 1.4));
      harp(ac, out, tt, m, 0.55 * (o.vol ?? 1), { decay: 1.0, send: o.send });
    }
    pad(ac, out, t, [65, 69, 72, 76, 79], 1.4 * (o.vol ?? 1), 1.3);
    bell(ac, out, t + 1.15, mtof(89), { ratio: 1.4, index: 0.8, vol: V(o, 0.16), decay: 2.2, send: o.send });
    bell(ac, out, t + 1.15, mtof(96), { ratio: 3.5, index: 0.8, vol: V(o, 0.1), decay: 2.0, send: o.send });
    noise(ac, out, t, { filter: 'highpass', f0: 6500, attack: 0.9, dur: 1.8, vol: V(o, 0.05) });
  },
  plant(ac, out, t, o) {
    tone(ac, out, t, { f0: 420, f1: 105, sweep: 0.07, dur: 0.15, attack: 0.002, vol: V(o, 0.55) });
    noise(ac, out, t, { filter: 'lowpass', f0: 520, dur: 0.09, vol: V(o, 0.4) });
    tone(ac, out, t, { type: 'triangle', delay: 0.1, f0: 470, f1: 1150, sweep: 0.13, dur: 0.2, vol: V(o, 0.32), vib: { rate: 22, depth: 0.03 } });
    bell(ac, out, t + 0.22, mtof(88), { ratio: 2, index: 0.5, vol: V(o, 0.09), decay: 0.35 });
  },
  sprout(ac, out, t, o) {
    tone(ac, out, t, { type: 'triangle', f0: 470, f1: 1150, sweep: 0.13, dur: 0.2, vol: V(o, 0.5), vib: { rate: 22, depth: 0.03 } });
  },
  grown(ac, out, t, o) {
    [84, 88, 91, 96].forEach((m, i) => bell(ac, out, t + i * 0.06, mtof(m), { ratio: 2, index: 0.7, vol: V(o, 0.14 - i * 0.015), decay: 0.6, send: o.send }));
    noise(ac, out, t, { filter: 'highpass', f0: 7000, attack: 0.08, dur: 0.45, vol: V(o, 0.045) });
  },
  /** Coin cascade; o.amount scales the number of coins. */
  coins(ac, out, t, o) {
    const amt = Math.max(1, o.amount || 10);
    const n = clamp(Math.round(2 + Math.log10(amt) * 1.6), 2, 12);
    const pitches = [88, 91, 93, 95, 96, 98, 100, 103];
    let tt = t;
    for (let i = 0; i < n; i++) {
      const m = pitches[Math.min(pitches.length - 1, Math.floor(i * 0.55 + Math.random() * 2))];
      coinTing(ac, out, tt, mtof(m), V(o, 0.1 + 0.04 * (i / n)), o.send);
      tt += rnd(0.04, 0.065);
    }
    if (amt >= 1000) {
      bell(ac, out, tt + 0.02, mtof(96), { ratio: 2.76, index: 0.8, vol: V(o, 0.14), decay: 0.9, send: o.send });
      noise(ac, out, tt, { filter: 'highpass', f0: 7500, attack: 0.03, dur: 0.5, vol: V(o, 0.05) });
    }
  },
  dropped(ac, out, t, o) {
    tone(ac, out, t, { type: 'triangle', f0: 700, f1: 360, dur: 0.15, vol: V(o, 0.28) });
    tone(ac, out, t, { type: 'triangle', delay: 0.13, f0: 480, f1: 190, dur: 0.26, vol: V(o, 0.28) });
  },

  // ---------------------------------------------------------------- stealing
  /** Victim: a rival just grabbed your plant. */
  stolen(ac, out, t, o) {
    const v = o.vol ?? 1;
    const stab = (tt, notes, dur, vel) => notes.forEach((m) => brass(ac, out, tt, m, vel * v, dur, { send: o.send }));
    stab(t, [62, 65, 68], 0.09, 0.85);
    stab(t + 0.15, [62, 65, 68], 0.09, 0.85);
    stab(t + 0.32, [55, 61, 64], 0.65, 1);
    tom(ac, out, t + 0.32, 72, 0.55 * v);
    cymbal(ac, out, t + 0.32, 0.45 * v, 1.2);
  },
  /** Thief (you): sneaky grab. */
  yoink(ac, out, t, o) {
    const v = (o.vol ?? 1) * 0.65;
    [69, 72, 76, 81].forEach((m, i) => marimba(ac, out, t + i * 0.045, m, 0.8 * v));
    noise(ac, out, t, { filter: 'bandpass', f0: 600, f1: 3400, sweep: 0.14, q: 1.6, attack: 0.02, dur: 0.18, vol: V(o, 0.2) });
    tone(ac, out, t + 0.2, { type: 'triangle', f0: 1400, f1: 1900, dur: 0.1, vol: V(o, 0.08), vib: { rate: 30, depth: 0.05 } });
  },
  /** Thief (you): made it home with a stolen plant. */
  heist(ac, out, t, o) {
    const v = (o.vol ?? 1) * 0.8;
    [77, 81, 84, 89].forEach((m, i) => steelPan(ac, out, t + i * 0.07, m, 0.9 * v, { send: o.send }));
    for (let k = 0; k < 7; k++) steelPan(ac, out, t + 0.3 + k * 0.055, 89, 0.4 * v, { decay: 0.5 });
    [65, 69, 72].forEach((m) => brass(ac, out, t + 0.28, m, 0.7 * v, 0.5, { send: o.send }));
    SFX.coins(ac, out, t + 0.3, { vol: v * 0.7, amount: 500, send: o.send });
    cymbal(ac, out, t + 0.28, 0.3 * v, 1);
  },
  /** Victim: the thief got away with it. Original descending "bwomp". */
  robbed(ac, out, t, o) {
    const v = o.vol ?? 1;
    [72, 68, 65].forEach((m, i) => marimba(ac, out, t + i * 0.13, m, 0.8 * v));
    tone(ac, out, t + 0.4, { type: 'triangle', f0: 277, f1: 185, sweep: 0.6, dur: 0.75, attack: 0.02, hold: 0.35, vol: V(o, 0.3), vib: { rate: 6, depth: 0.03 } });
    tone(ac, out, t + 0.4, { type: 'sine', f0: 138, f1: 92, sweep: 0.6, dur: 0.75, attack: 0.02, hold: 0.35, vol: V(o, 0.14) });
  },
  /** Plant saved: triumphant "got it back". */
  saved(ac, out, t, o) {
    const v = (o.vol ?? 1) * 0.8;
    [77, 81, 84, 89].forEach((m, i) => marimba(ac, out, t + i * 0.055, m, 0.85 * v));
    [77, 81, 84].forEach((m) => brass(ac, out, t + 0.24, m, 0.85 * v, 0.45, { send: o.send }));
    steelPan(ac, out, t + 0.24, 89, 0.8 * v, { send: o.send });
    cymbal(ac, out, t + 0.24, 0.3 * v, 1);
  },

  // ---------------------------------------------------------------- combat & movement
  whoosh(ac, out, t, o) {
    noise(ac, out, t, { filter: 'bandpass', q: 1.4, f0: 380, pts: [[0.08, 1900], [0.2, 550]], attack: 0.05, dur: 0.24, vol: V(o, 0.8) });
  },
  /** Foam noodle BONK + spring boing + cartoon "oof" (o.who = character id). */
  hit(ac, out, t, o) {
    bonkKnock(ac, out, t, o);
    tone(ac, out, t + 0.05, { type: 'triangle', f0: 190, f1: 430, sweep: 0.35, dur: 0.45, vol: V(o, 0.2), vib: { rate: 16, depth: 0.12, fade: 0.15 } });
    if (o.voice !== false) oof(ac, out, t + 0.07, o);
  },
  oof(ac, out, t, o) {
    oof(ac, out, t, o);
  },
  jump(ac, out, t, o) {
    tone(ac, out, t, { type: 'triangle', f0: 300, f1: 650, sweep: 0.09, dur: 0.14, vol: V(o, 0.55), vib: { rate: 30, depth: 0.04 } });
  },
  /** Banana slip: slide whistle up and down, then a thud. */
  slip(ac, out, t, o) {
    o = { ...o, vol: (o.vol ?? 1) * 0.5 };
    const env = { attack: 0.02, hold: 0.42, dur: 0.66, vib: { rate: 7, depth: 0.018 } };
    tone(ac, out, t, { ...env, f0: 520, pts: [[0.28, 1500], [0.62, 470]], vol: V(o, 0.22) });
    tone(ac, out, t, { ...env, f0: 1040, pts: [[0.28, 3000], [0.62, 940]], vol: V(o, 0.025), vib: undefined });
    noise(ac, out, t, { filter: 'bandpass', f0: 1500, q: 2, attack: 0.05, hold: 0.35, dur: 0.6, vol: V(o, 0.03) });
    tone(ac, out, t + 0.62, { f0: 170, f1: 60, sweep: 0.08, dur: 0.2, attack: 0.001, vol: V(o, 0.38) });
  },
  splash(ac, out, t, o) {
    o = { ...o, vol: (o.vol ?? 1) * 1.6 };
    noise(ac, out, t, { filter: 'bandpass', f0: 2600, f1: 700, sweep: 0.35, q: 0.9, dur: 0.45, vol: V(o, 0.5), send: o.send });
    noise(ac, out, t, { filter: 'lowpass', f0: 900, dur: 0.2, vol: V(o, 0.32) });
    for (let i = 0; i < 5; i++) {
      const f = rnd(700, 2000);
      tone(ac, out, t + rnd(0.04, 0.38), { f0: f, f1: f * 1.7, sweep: 0.035, dur: 0.07, vol: V(o, 0.08) });
    }
  },
  /** o.item: banana | balloon | coil | cloak | bucket */
  item(ac, out, t, o) {
    const g = { banana: 2.2, balloon: 2.8, coil: 3.5, cloak: 1, bucket: 1.4 }[o.item] ?? 1;
    o = { ...o, vol: (o.vol ?? 1) * g };
    switch (o.item) {
      case 'banana':
        noise(ac, out, t, { filter: 'bandpass', f0: 1800, f1: 600, sweep: 0.12, q: 2, dur: 0.14, vol: V(o, 0.18) });
        tone(ac, out, t + 0.08, { f0: 300, f1: 140, sweep: 0.08, dur: 0.14, vol: V(o, 0.16) });
        noise(ac, out, t + 0.08, { filter: 'lowpass', f0: 900, dur: 0.1, vol: V(o, 0.3) });
        break;
      case 'balloon':
        noise(ac, out, t, { filter: 'bandpass', q: 1.2, f0: 500, pts: [[0.1, 2200], [0.22, 700]], attack: 0.05, dur: 0.25, vol: V(o, 0.28) });
        tone(ac, out, t, { type: 'triangle', f0: 850, f1: 1350, sweep: 0.08, dur: 0.12, vol: V(o, 0.1), vib: { rate: 40, depth: 0.06 } });
        break;
      case 'coil':
        tone(ac, out, t, { type: 'triangle', f0: 180, f1: 520, sweep: 0.3, dur: 0.42, vol: V(o, 0.22), vib: { rate: 18, depth: 0.14, fade: 0.2 } });
        tone(ac, out, t + 0.12, { wave: kit(ac).saw, f0: 140, f1: 2400, sweep: 0.25, dur: 0.3, vol: V(o, 0.08) });
        noise(ac, out, t + 0.12, { filter: 'bandpass', f0: 2500, f1: 9000, sweep: 0.25, q: 2, dur: 0.3, vol: V(o, 0.12), lfo: { rate: 45, depth: 1500 } });
        break;
      case 'cloak':
        [100, 98, 94, 92, 88, 86].forEach((m, i) => bell(ac, out, t + i * 0.07, mtof(m), { ratio: 3.5, index: 1.2, vol: V(o, 0.07), decay: 0.8, send: o.send }));
        noise(ac, out, t, { filter: 'highpass', f0: 5000, f1: 9000, attack: 0.25, dur: 0.9, vol: V(o, 0.08), send: o.send });
        tone(ac, out, t, { f0: 1300, f1: 280, sweep: 0.7, dur: 0.8, attack: 0.05, vol: V(o, 0.07), vib: { rate: 9, depth: 0.04 } });
        break;
      case 'bucket':
        noise(ac, out, t, { filter: 'bandpass', f0: 950, q: 3, attack: 0.08, hold: 0.45, dur: 0.95, vol: V(o, 0.3), lfo: { rate: 9, depth: 380 } });
        noise(ac, out, t, { filter: 'lowpass', f0: 500, attack: 0.1, hold: 0.4, dur: 0.9, vol: V(o, 0.12) });
        for (let i = 0; i < 4; i++) {
          const f = rnd(280, 650);
          tone(ac, out, t + 0.15 + i * rnd(0.12, 0.2), { f0: f, f1: f * 1.8, sweep: 0.05, dur: 0.1, vol: V(o, 0.12) });
        }
        break;
      default:
        SFX.click(ac, out, t, o);
    }
  },

  // ---------------------------------------------------------------- monsters
  /** o.type: monster type id */
  aggro(ac, out, t, o) {
    const d = GROWLS[o.type] || GROWLS.stump;
    growl(ac, out, t, { ...d, vol: V(o, 0.36 * d.gain) });
    if (d.clicks) for (let i = 0; i < 5; i++) noise(ac, out, t + i * 0.075, { filter: 'bandpass', f0: 3200, q: 3, dur: 0.03, attack: 0.001, vol: V(o, 0.25) });
    if (d.ethereal) {
      tone(ac, out, t, { f0: 880, f1: 440, sweep: d.dur, dur: d.dur + 0.3, attack: 0.1, vol: V(o, 0.05), detune: 12, vib: { rate: 5, depth: 0.02 }, send: o.send });
      tone(ac, out, t, { f0: 1320, f1: 660, sweep: d.dur, dur: d.dur + 0.3, attack: 0.1, vol: V(o, 0.03), detune: -12, send: o.send });
    }
  },
  chomp(ac, out, t, o) {
    for (const d of [0, 0.13]) {
      tone(ac, out, t + d, { f0: 230, f1: 85, sweep: 0.06, dur: 0.13, attack: 0.001, vol: V(o, 0.35) });
      noise(ac, out, t + d, { filter: 'bandpass', f0: 2200, q: 1.2, dur: 0.06, attack: 0.001, vol: V(o, 0.9) });
      noise(ac, out, t + d + 0.012, { filter: 'highpass', f0: 3500, dur: 0.08, vol: V(o, 0.3) });
    }
  },
  monsterBonk(ac, out, t, o) {
    o = { ...o, vol: (o.vol ?? 1) * 2.2 };
    bonkKnock(ac, out, t, o, 0.75);
    for (let i = 0; i < 3; i++) tone(ac, out, t + 0.12 + i * 0.11, { f0: 2500, f1: 1800, sweep: 0.06, dur: 0.08, vol: V(o, 0.07) });
  },

  // ---------------------------------------------------------------- garden & shops
  lockOn(ac, out, t, o) {
    o = { ...o, vol: (o.vol ?? 1) * 0.62 };
    laser(ac, out, t, true, o);
    bell(ac, out, t + 0.55, mtof(91), { ratio: 2, index: 0.6, vol: V(o, 0.08), decay: 0.6, send: o.send });
  },
  lockOff(ac, out, t, o) {
    o = { ...o, vol: (o.vol ?? 1) * 0.55 };
    laser(ac, out, t, false, o);
  },
  purchase(ac, out, t, o) {
    o = { ...o, vol: (o.vol ?? 1) * 0.7 };
    noise(ac, out, t, { filter: 'bandpass', f0: 3200, q: 2, dur: 0.04, attack: 0.001, vol: V(o, 0.35) });
    noise(ac, out, t + 0.03, { filter: 'highpass', f0: 5000, dur: 0.08, vol: V(o, 0.12) });
    bell(ac, out, t + 0.07, mtof(96), { ratio: 2.76, index: 0.9, vol: V(o, 0.2), decay: 0.9, send: o.send });
    bell(ac, out, t + 0.07, mtof(100), { ratio: 2.76, index: 0.7, vol: V(o, 0.14), decay: 1.0, send: o.send });
    for (let i = 0; i < 3; i++) coinTing(ac, out, t + 0.12 + i * 0.05, mtof(91 + i * 2), V(o, 0.07), o.send);
  },
  speedUp(ac, out, t, o) {
    o = { ...o, vol: (o.vol ?? 1) * 0.7 };
    const k = kit(ac);
    tone(ac, out, t, { wave: k.saw, f0: 140, f1: 1100, sweep: 0.45, dur: 0.5, attack: 0.02, hold: 0.3, vol: V(o, 0.09) });
    tone(ac, out, t, { type: 'triangle', f0: 280, f1: 2200, sweep: 0.45, dur: 0.5, attack: 0.02, hold: 0.3, vol: V(o, 0.12) });
    noise(ac, out, t, { filter: 'bandpass', f0: 500, f1: 6000, sweep: 0.45, q: 1.5, attack: 0.3, dur: 0.55, vol: V(o, 0.2) });
    bell(ac, out, t + 0.45, mtof(96), { ratio: 2, index: 0.8, vol: V(o, 0.14), decay: 0.8, send: o.send });
    steelPan(ac, out, t + 0.45, 89, 0.8 * (o.vol ?? 1), { send: o.send });
  },
  unlock(ac, out, t, o) {
    noise(ac, out, t, { filter: 'bandpass', f0: 2600, q: 4, dur: 0.03, attack: 0.001, vol: V(o, 0.45) });
    tone(ac, out, t, { f0: 200, f1: 90, sweep: 0.04, dur: 0.08, attack: 0.001, vol: V(o, 0.3) });
    noise(ac, out, t + 0.06, { filter: 'bandpass', f0: 1800, q: 4, dur: 0.04, attack: 0.001, vol: V(o, 0.4) });
    [84, 88, 91].forEach((m, i) => bell(ac, out, t + 0.12 + i * 0.08, mtof(m), { ratio: 2, index: 0.7, vol: V(o, 0.13), decay: 0.7, send: o.send }));
  },
  /** Rebirth: a big magical rise. */
  rebirth(ac, out, t, o) {
    const v = o.vol ?? 1;
    pad(ac, out, t, [53, 57, 60, 64, 67], 1.6 * v, 1.9);
    noise(ac, out, t, { filter: 'bandpass', f0: 350, f1: 6500, sweep: 2.0, q: 1.4, attack: 1.7, dur: 2.3, vol: V(o, 0.16), send: o.send });
    const scale = [0, 2, 4, 6, 7, 9, 11];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const m = 65 + scale[i % 7] + 12 * Math.floor(i / 7);
      harp(ac, out, t + 1.9 * (1 - Math.pow(1 - i / n, 1.5)), m, 0.5 * v, { decay: 0.9, send: o.send });
    }
    const T = t + 2.0;
    kick(ac, out, T, 0.55 * v);
    cymbal(ac, out, T, 0.6 * v, 2.2);
    [89, 93, 96].forEach((m) => bell(ac, out, T, mtof(m), { ratio: 2, index: 0.9, vol: V(o, 0.11), decay: 2.2, send: o.send }));
    [77, 81, 84].forEach((m) => steelPan(ac, out, T, m, 0.8 * v, { send: o.send }));
    [53, 57, 60, 65].forEach((m) => brass(ac, out, T, m, 0.7 * v, 0.9, { send: o.send }));
  },

  // ---------------------------------------------------------------- events
  /** Weather stinger. o.type: golden | diamond | rainbow */
  event(ac, out, t, o) {
    o = { ...o, vol: (o.vol ?? 1) * ({ golden: 0.9, diamond: 1, rainbow: 0.6 }[o.type] ?? 1) };
    const v = o.vol;
    if (o.type === 'diamond') {
      const pent = [0, 2, 4, 7, 9];
      for (let i = 0; i < 14; i++) {
        const m = 103 - Math.floor(i / 5) * 12 - pent[4 - (i % 5)];
        bell(ac, out, t + i * 0.07, mtof(m), { ratio: 3.5, index: 1.5, vol: V(o, 0.09), decay: 1.3, send: o.send });
      }
      noise(ac, out, t, { filter: 'highpass', f0: 8000, attack: 0.4, dur: 1.4, vol: V(o, 0.06), send: o.send });
      pad(ac, out, t, [62, 69, 74, 76], 1.1 * v, 1.2);
    } else if (o.type === 'rainbow') {
      [65, 67, 69, 70, 72, 74, 76, 77].forEach((m, i) => harp(ac, out, t + i * 0.08, m + 12, 0.65 * v, { decay: 1.0, send: o.send }));
      noise(ac, out, t, { filter: 'bandpass', f0: 3200, q: 0.7, attack: 0.5, hold: 0.6, dur: 1.6, vol: V(o, 0.1), lfo: { rate: 13, depth: 900 } });
      [77, 81, 84, 89].forEach((m) => steelPan(ac, out, t + 0.7, m, 0.7 * v, { send: o.send }));
    } else {
      [65, 69, 72, 76].forEach((m) => brass(ac, out, t, m, 0.75 * v, 0.9, { send: o.send }));
      [96, 93, 91, 88, 84, 81].forEach((m, i) => bell(ac, out, t + 0.2 + i * 0.06, mtof(m), { ratio: 2, index: 0.9, vol: V(o, 0.1), decay: 1.0, send: o.send }));
      cymbal(ac, out, t, 0.4 * v, 1.6);
    }
  },
  /** Confetti pops for the podium. */
  confetti(ac, out, t, o) {
    o = { ...o, vol: (o.vol ?? 1) * 1.6 };
    for (let i = 0; i < 7; i++) {
      const tt = t + i * rnd(0.07, 0.16);
      noise(ac, out, tt, { filter: 'bandpass', f0: rnd(1200, 2600), q: 1.5, dur: 0.06, attack: 0.001, vol: V(o, 0.3) });
      tone(ac, out, tt, { f0: rnd(500, 900), f1: 180, sweep: 0.04, dur: 0.07, attack: 0.001, vol: V(o, 0.15) });
    }
  },
};

// ------------------------------------------------------------------ loops (start/stop handles)

/** "Nee-naw" alarm beeps while a rival steals your plant. Auto-stops after `max` seconds. */
export function alarmLoop(ac, out, t, o = {}) {
  const max = o.max ?? 4;
  const x = ac.createOscillator();
  x.type = 'square';
  const y = ac.createOscillator();
  y.type = 'triangle';
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;
  const g = ac.createGain();
  const vol = V(o, 0.085);
  g.gain.setValueAtTime(0, t);
  for (let k = 0, tt = t; tt < t + max; k++, tt += 0.2) {
    const f = k & 1 ? 660 : 880;
    x.frequency.setValueAtTime(f, tt);
    y.frequency.setValueAtTime(f * 2, tt);
    g.gain.setTargetAtTime(vol, tt, 0.004);
    g.gain.setTargetAtTime(0, tt + 0.15, 0.012);
  }
  const yg = ac.createGain();
  yg.gain.value = 0.4;
  x.connect(lp);
  y.connect(yg);
  yg.connect(lp);
  lp.connect(g);
  g.connect(out);
  x.start(t);
  y.start(t);
  finish([x, y], [x, y, yg, lp, g], t + max + 0.1);
  let stopped = false;
  return {
    stop(at = ac.currentTime) {
      if (stopped) return;
      stopped = true;
      g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(0, at, 0.02);
      try {
        x.stop(at + 0.15);
        y.stop(at + 0.15);
      } catch {
        /* already stopped */
      }
    },
    endsAt: t + max,
  };
}

/** Rising tension tone while you hold "steal". set(progress 0..1) bends it upward. */
export function stealLoop(ac, out, t, o = {}) {
  const x = ac.createOscillator();
  x.type = 'triangle';
  x.frequency.setValueAtTime(260, t);
  const trem = ac.createOscillator();
  trem.frequency.value = 11;
  const tg = ac.createGain();
  tg.gain.value = 0.35;
  const g = ac.createGain();
  const vol = V(o, 0.13);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.08);
  const amp = ac.createGain();
  amp.gain.value = 0.65;
  trem.connect(tg);
  tg.connect(amp.gain);
  x.connect(amp);
  amp.connect(g);
  g.connect(out);
  x.start(t);
  trem.start(t);
  const max = 6;
  finish([x, trem], [x, trem, tg, amp, g], t + max);
  let stopped = false;
  return {
    set(p) {
      if (stopped) return;
      const now = ac.currentTime;
      x.frequency.setTargetAtTime(260 * Math.pow(2, clamp(p, 0, 1) * 1.6), now, 0.05);
      trem.frequency.setTargetAtTime(11 + p * 10, now, 0.05);
    },
    stop(at = ac.currentTime) {
      if (stopped) return;
      stopped = true;
      g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(0, at, 0.03);
      try {
        x.stop(at + 0.2);
        trem.stop(at + 0.2);
      } catch {
        /* already stopped */
      }
    },
    endsAt: t + max,
  };
}

// Minimum seconds between two plays of the same effect (per source class).
export const SFX_GAP = {
  click: 0.03, hover: 0.05, error: 0.15, whoosh: 0.05, hit: 0.06, jump: 0.09, coins: 0.12, grab: 0.06,
  plant: 0.08, sprout: 0.1, grown: 0.18, aggro: 0.3, chomp: 0.1, monsterBonk: 0.08, splash: 0.07, slip: 0.2,
  lockOn: 0.2, lockOff: 0.2, item: 0.06, purchase: 0.08, speedUp: 0.15, unlock: 0.15, event: 1, rebirth: 1,
  stolen: 0.5, yoink: 0.3, heist: 0.5, robbed: 0.5, saved: 0.4, dropped: 0.2, shopBell: 0.4, confetti: 0.3,
};
