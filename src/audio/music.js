// Procedural island music: an original calypso/soca-flavoured tune in F major at 112 BPM.
// Steel pan lead, marimba arpeggios, off-beat strum, warm bass, shaker/clave/conga/kick/clap.
//
// Everything is scheduled ahead of time on the AudioContext clock (lookahead scheduler), and
// works on any BaseAudioContext, so the same code renders offline for analysis.
//
// Modes (arrangements): 'title' (mellow), 'play' (full, with loop variations), 'victory'
// (fanfare, then a celebration loop). Layers on top: chase (driving drums + tension bass) and
// sparkle (weather-event bells).
import {
  steelPan, marimba, bass, tensionBass, pluck, harp, pad, bell, brass,
  kick, clap, clave, conga, tom, cymbal, snare, mtof, noiseSource,
} from './synth.js';

export const BPM = 112;
export const STEP = 60 / BPM / 4; // one 16th note
const SWING = 0.12; // odd 16ths are late by this fraction of a 16th

// ------------------------------------------------------------------ notation

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToMidi(s) {
  const m = /^([A-G])(b|#)?(\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
}

/**
 * One bar = 16 whitespace-separated tokens (16th notes): a note name starts a note, '~' continues
 * it as a tremolo roll (steel-pan style), '-' holds it, '.' is silence.
 */
function parseBar(str) {
  const tok = str.trim().split(/\s+/);
  if (tok.length !== 16) throw new Error(`bar needs 16 steps, got ${tok.length}: ${str}`);
  const out = new Array(16).fill(null);
  for (let i = 0; i < 16; i++) {
    const t = tok[i];
    if (t === '.' || t === '~' || t === '-') continue;
    let len = 1;
    let roll = false;
    while (i + len < 16 && (tok[i + len] === '~' || tok[i + len] === '-')) {
      if (tok[i + len] === '~') roll = true;
      len++;
    }
    out[i] = { midi: noteToMidi(t), len, roll };
  }
  return out;
}

// smallest midi >= lo with pitch class pc
const place = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12);

function parseChord(name) {
  const m = /^([A-G])(b|#)?(.*)$/.exec(name);
  const root = (PC[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0) + 12) % 12;
  const q = m[3];
  let iv = [0, 4, 7];
  if (q.startsWith('m') && !q.startsWith('maj')) iv = [0, 3, 7];
  if (q.includes('sus')) iv = [0, 5, 7];
  const pcs = iv.map((i) => (root + i) % 12);
  if (q.endsWith('7')) pcs.push((root + (q.includes('maj') ? 11 : 10)) % 12);
  const r = place(root, 50);
  const up = (lo) => pcs.map((pc) => place(pc, lo)).sort((a, b) => a - b);
  const sp = up(84);
  return {
    name,
    root,
    pcs,
    bass: place(root, 36),
    comp: [r, r + iv[1], r + iv[2], r + 12, r + 12 + iv[1], r + 12 + iv[2]],
    skank: up(65),
    pad: up(53),
    sparkle: [...sp, sp[0] + 12],
  };
}

const sec = (chords, lead, extra = {}) => ({
  chords: chords.split(' ').map(parseChord),
  lead: lead.map(parseBar),
  bars: lead.length,
  ...extra,
});

const REST = '. . . . . . . . . . . . . . . .';
const A_HEAD = [
  'C5 . . A4 . . C5 . F5 ~ ~ . E5 . F5 .',
  'G5 . F5 . E5 . D5 . C5 ~ ~ . A4 . . .',
  'D5 . . Bb4 . . D5 . F5 ~ ~ . G5 . F5 .',
  'E5 ~ ~ ~ D5 . C5 . G5 ~ ~ ~ ~ ~ . .',
  'F5 . . D5 . . F5 . A5 ~ ~ . G5 . F5 .',
  'G5 . F5 . D5 . Bb4 . D5 ~ ~ . C5 . . .',
];

export const SECTIONS = {
  intro: sec('F Bb C C7', [REST, REST, REST, '. . . . . . . . G4 . A4 . Bb4 . B4 .'], { intro: true }),
  A: sec('F F Bb C Dm Bb C7 F', [
    ...A_HEAD,
    'Bb4 . . C5 . . E5 . G5 ~ ~ . Bb5 . G5 .',
    'A5 ~ ~ ~ ~ ~ ~ ~ . . . . . . . .',
  ]),
  A2: sec('F F Bb C Dm Bb C F', [
    ...A_HEAD,
    'G5 . . E5 . . C5 . D5 . . . E5 . G5 .',
    'F5 ~ ~ ~ ~ ~ . . C5 . A4 . F4 . . .',
  ]),
  B: sec('Dm Bb F C Dm Bb Gm C', [
    '. . F5 . . . F5 . . . F5 . E5 . D5 .',
    '. . F5 . . . F5 . . . G5 . F5 . D5 .',
    '. . C5 . . . F5 . . . A5 ~ ~ ~ . .',
    'G5 ~ ~ ~ ~ ~ . . E5 . . . C5 . . .',
    '. . F5 . . . F5 . . . F5 . E5 . D5 .',
    '. . F5 . . . F5 . . . G5 . A5 . Bb5 .',
    'Bb5 ~ ~ ~ A5 . . . G5 . . . D5 . . .',
    'E5 ~ ~ ~ ~ ~ ~ ~ . . . . G4 . Bb4 .',
  ], { harm: true }),
  Br: sec('Bb C Am Dm Bb C Gm C7', [
    'D5 . . F5 . . Bb5 . . . A5 . . . F5 .',
    'E5 . . G5 . . C6 . . . Bb5 . . . G5 .',
    'E5 . . A5 . . C6 . . . A5 . . . E5 .',
    'F5 ~ ~ ~ ~ ~ ~ ~ D5 . . . A4 . . .',
    'D5 . . F5 . . Bb5 . . . A5 . . . F5 .',
    'E5 . . G5 . . C6 . . . D6 . . . C6 .',
    'Bb5 ~ ~ ~ A5 ~ ~ ~ G5 ~ ~ ~ F5 . . .',
    'E5 ~ ~ ~ ~ ~ ~ ~ . . . . G4 . Bb4 .',
  ], { bridge: true, harm: true }),
  fanfare: sec('F Bb C7 F', [
    'C5 . C5 . C5 . . . F5 - - - - - - -',
    'D5 - - . F5 - - . Bb5 - - - - - - -',
    'C6 - - - - - - - Bb5 . A5 . G5 . E5 .',
    'F5 - - - - - - - - - - - . . . .',
  ], { fanfare: true }),
};

export const ARRANGEMENTS = {
  title: { form: ['A', 'B', 'A2', 'Br'], loop: 0 },
  play: { form: ['intro', 'A', 'A2', 'B', 'A2', 'Br', 'B', 'A', 'A2'], loop: 1 },
  victory: { form: ['fanfare', 'A', 'A2', 'B', 'A2'], loop: 1 },
};

// Layer levels per arrangement (chase and sparkle are driven by setChase / setEvent).
const MIX = {
  title: { lead: 1, harm: 0.55, comp: 0.75, skank: 0, pad: 0.6, bass: 0.75, drums: 0, perc: 0.7, brass: 0 },
  play: { lead: 1, harm: 0.75, comp: 0.75, skank: 0.8, pad: 0.6, bass: 1, drums: 1, perc: 0.85, brass: 0 },
  victory: { lead: 1, harm: 0.75, comp: 0.75, skank: 0.85, pad: 0.6, bass: 1, drums: 1, perc: 0.9, brass: 1 },
};
// Fixed trims and effect sends per part.
const PARTS = {
  lead: { trim: 1.05, verb: 0.3, delay: 0.2 },
  harm: { trim: 0.75, verb: 0.3, pan: 0.3 },
  comp: { trim: 0.8, verb: 0.16, pan: -0.28 },
  skank: { trim: 0.9, verb: 0.12, lp: 3400, pan: 0.35 },
  pad: { trim: 0.9, verb: 0.35, lp: 1900 },
  bass: { trim: 0.8 },
  drums: { trim: 0.75, verb: 0.06 },
  perc: { trim: 0.9, verb: 0.12, pan: -0.2 },
  chase: { trim: 0.55, verb: 0.05 },
  sparkle: { trim: 0.8, verb: 0.55, delay: 0.3, pan: 0.2 },
  brass: { trim: 0.9, verb: 0.28 },
};

// Diatonic helper (F major) for the harmony line.
const SCALE = new Set([5, 7, 9, 10, 0, 2, 4]);
function diatonic(midi, steps) {
  if (!SCALE.has(midi % 12)) return midi + Math.sign(steps) * 3;
  let m = midi;
  let n = Math.abs(steps);
  const dir = Math.sign(steps);
  while (n > 0) {
    m += dir;
    if (SCALE.has(((m % 12) + 12) % 12)) n--;
  }
  return m;
}
function chordTonesBelow(midi, chord, count) {
  const out = [];
  for (let m = midi - 2; m > midi - 15 && out.length < count; m--) if (chord.pcs.includes(m % 12)) out.push(m);
  return out;
}
const PENTA = [5, 7, 9, 0, 2]; // F major pentatonic

const COMP = {
  play: [[0, 0, 0.85], [3, 2, 0.55], [6, 1, 0.65], [8, 3, 0.75], [11, 2, 0.55], [14, 4, 0.6]],
  busy: [[0, 0, 0.85], [2, 2, 0.45], [3, 1, 0.55], [6, 3, 0.65], [8, 0, 0.75], [10, 2, 0.45], [11, 1, 0.55], [14, 4, 0.6]],
  title: [[0, 0, 0.7], [2, 1, 0.45], [4, 2, 0.5], [6, 3, 0.45], [8, 4, 0.55], [10, 3, 0.4], [12, 2, 0.45], [14, 1, 0.4]],
  bridge: [0, 1, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 4, 3, 2, 1].map((idx, s) => [s, idx, s % 4 === 0 ? 0.55 : 0.36]),
};
const BASS = {
  play: [[0, 'R', 3, 1], [6, '5', 2, 0.72], [8, 'R', 3, 0.9], [11, '8', 1, 0.5], [12, '5', 2, 0.7], [14, 'A', 2, 0.75]],
  title: [[0, 'R', 6, 0.8], [8, '5', 5, 0.6], [14, 'A', 2, 0.5]],
  bridge: [[0, 'R', 7, 0.9], [10, '5', 2, 0.6], [12, '8', 2, 0.6], [14, 'A', 2, 0.6]],
  fanfare: [[0, 'R', 4, 1], [8, 'R', 4, 0.9]],
};
const SHAKE_PLAY = [0.5, 0.2, 0.85, 0.24, 0.5, 0.2, 0.85, 0.28, 0.5, 0.2, 0.85, 0.24, 0.5, 0.2, 0.85, 0.32];
const CONGA_PLAY = [[6, 'mid', 0.45, false], [7, 'mid', 0.4, false], [10, 'hi', 0.38, true], [14, 'lo', 0.55, false], [15, 'lo', 0.45, false]];
const CONGA_TITLE = [[6, 'mid', 0.35, false], [14, 'lo', 0.4, false]];
const CONGA_FILL = [[12, 'hi', 0.7, true], [13, 'hi', 0.55, false], [14, 'mid', 0.65, false], [15, 'lo', 0.7, false]];

const rnd = (a, b) => a + Math.random() * (b - a);
const human = () => 0.9 + Math.random() * 0.2;
const COMP_DECAY = { decay: 0.65 }; // arpeggios: shorter tails keep the groove crisp and the voice count low

export class MusicEngine {
  /** @param {BaseAudioContext} ac  @param {object} mixer from createMixer() */
  constructor(ac, mixer) {
    this.ac = ac;
    this.mixer = mixer;
    this.out = ac.createGain();
    this.out.gain.value = 1;
    this.out.connect(mixer.musicIn);
    // dotted-eighth echo for the lead and the sparkles
    this.delay = ac.createDelay(1.5);
    this.delay.delayTime.value = STEP * 3;
    const fb = ac.createGain();
    fb.gain.value = 0.3;
    const dlp = ac.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2600;
    this.delaySend = ac.createGain();
    const dOut = ac.createGain();
    dOut.gain.value = 0.35;
    this.delaySend.connect(this.delay);
    this.delay.connect(dlp);
    dlp.connect(fb);
    fb.connect(this.delay);
    dlp.connect(dOut);
    dOut.connect(this.out);
    this._fx = [this.delay, fb, dlp, this.delaySend, dOut];

    this.bus = {};
    this.layer = {};
    for (const [name, p] of Object.entries(PARTS)) {
      const input = ac.createGain();
      // equal-power panners drop a centred mono source by 3 dB: compensate
      input.gain.value = p.trim * (p.pan && ac.createStereoPanner ? Math.SQRT2 : 1);
      const layer = ac.createGain();
      layer.gain.value = 0;
      let node = input;
      if (p.lp) {
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = p.lp;
        input.connect(lp);
        node = lp;
        this._fx.push(lp);
      }
      if (p.pan && ac.createStereoPanner) {
        const sp = ac.createStereoPanner();
        sp.pan.value = p.pan;
        node.connect(sp);
        node = sp;
        this._fx.push(sp);
      }
      node.connect(layer);
      layer.connect(this.out);
      if (p.verb) {
        const s = ac.createGain();
        s.gain.value = p.verb;
        layer.connect(s);
        s.connect(mixer.musicVerbIn);
        this._fx.push(s);
      }
      if (p.delay) {
        const s = ac.createGain();
        s.gain.value = p.delay;
        layer.connect(s);
        s.connect(this.delaySend);
        this._fx.push(s);
      }
      this.bus[name] = input;
      this.layer[name] = layer;
      this._fx.push(input, layer);
    }
    // Shaker and hi-hat are one continuous noise source shaped by gain automation (no per-hit nodes).
    this.noise = noiseSource(ac, 0);
    const sbp = ac.createBiquadFilter();
    sbp.type = 'bandpass';
    sbp.frequency.value = 7200;
    sbp.Q.value = 0.8;
    this.shaker = ac.createGain();
    this.shaker.gain.value = 0;
    this.noise.connect(sbp);
    sbp.connect(this.shaker);
    this.shaker.connect(this.bus.perc);
    const hhp = ac.createBiquadFilter();
    hhp.type = 'highpass';
    hhp.frequency.value = 8500;
    this.hat = ac.createGain();
    this.hat.gain.value = 0;
    this.noise.connect(hhp);
    hhp.connect(this.hat);
    this.hat.connect(this.bus.chase);
    this._fx.push(this.noise, sbp, this.shaker, hhp, this.hat);

    this.mode = 'off';
    this.active = false;
    this.pending = null;
    this.secIdx = 0;
    this.bar = 0;
    this.step = 0;
    this.iter = 0;
    this.nextTime = 0;
    this.chaseOn = false;
    this.chaseLive = false; // still audible (fading)
    this.chaseOffAt = 0;
    this.eventType = null;
    this.eventOffAt = 0;
    this.sparkleOn = false;
    this.stopAt = 0;
    this.lite = false; // low-end devices: fewer voices per bar
    this.tr = 0; // semitones: every third loop of 'play' lifts the song a whole step
  }

  /** Current song position (for tests / debugging). */
  describe() {
    const arr = ARRANGEMENTS[this.mode];
    return {
      mode: this.mode, active: this.active, section: arr ? arr.form[this.secIdx] : null, bar: this.bar, step: this.step,
      iter: this.iter, chase: this.chaseOn, event: this.eventType,
    };
  }

  /** Switch arrangement. 'off' fades out. Changes land on the next beat (victory: next 16th). */
  setMode(mode, when = this.ac.currentTime) {
    const G = this.out.gain;
    if (!ARRANGEMENTS[mode]) {
      // 'off': fade out, keep playing under the fade, then go idle
      if (!this.active || this.stopAt) return;
      G.cancelScheduledValues(when);
      G.setTargetAtTime(0, when, 0.3);
      this.stopAt = when + 1.8;
      this.pending = null;
      return;
    }
    if (!this.active) {
      this._begin(mode, Math.max(when, this.ac.currentTime) + 0.06);
      return;
    }
    if (this.stopAt) {
      this.stopAt = 0;
      G.cancelScheduledValues(when);
      G.setTargetAtTime(1, when, 0.12);
    }
    this.pending = mode === this.mode ? null : mode;
  }

  _begin(mode, t) {
    this.mode = mode;
    this.active = true;
    this.pending = null;
    this.secIdx = 0;
    this.bar = 0;
    this.step = 0;
    this.iter = 0;
    this.nextTime = t;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(1, t);
    this._applyMix(t, 0.05);
  }

  _applyMix(t, tc = 0.2) {
    const mix = MIX[this.mode];
    for (const k in mix) this.layer[k].gain.setTargetAtTime(mix[k], t, tc);
    this._applySparkle(t);
    if (this.mode !== 'play' && this.chaseOn) this.setChase(false, t);
  }

  _applySparkle(t) {
    const on = this.mode === 'victory' || (!!this.eventType && this.mode === 'play');
    if (on === this.sparkleOn) return;
    this.sparkleOn = on;
    this.layer.sparkle.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.6 : 1.2);
    if (!on) this.eventOffAt = t + 6;
  }

  /** Intensity layer (driving drums + tension bass). Only used in the 'play' arrangement. */
  setChase(on, when = this.ac.currentTime) {
    on = !!on && this.mode === 'play';
    if (on === this.chaseOn) return;
    this.chaseOn = on;
    if (on) this.chaseLive = true;
    else this.chaseOffAt = when + 4;
    this.layer.chase.gain.setTargetAtTime(on ? 1 : 0, when, on ? 0.12 : 0.8);
    // lift the whole band a little while the chase is on
    this.layer.drums.gain.setTargetAtTime(on ? 1.1 : MIX[this.mode]?.drums ?? 1, when, 0.3);
  }

  /** Weather-event sparkle layer: 'golden' | 'diamond' | 'rainbow' | null. */
  setEvent(type, when = this.ac.currentTime) {
    type = type || null;
    if (type === this.eventType) return;
    this.eventType = type;
    if (type) this.lastEvent = type;
    this._applySparkle(when);
  }

  /** Schedule every 16th that starts before `until` (AudioContext time). */
  scheduleUntil(until) {
    if (!this.active) return;
    const now = this.ac.currentTime;
    if (this.stopAt && now >= this.stopAt) {
      this.active = false;
      this.stopAt = 0;
      this.mode = 'off';
      if (this.chaseOn) this.setChase(false, now);
      return;
    }
    if (this.nextTime < now - 0.08) {
      // we fell behind (throttled tab, long frame): skip ahead instead of bursting notes
      const skip = Math.ceil((now - this.nextTime) / STEP);
      for (let i = 0; i < skip; i++) this._advance();
      this.nextTime += skip * STEP;
    }
    if (this.chaseLive && !this.chaseOn && now > this.chaseOffAt) this.chaseLive = false;
    while (this.nextTime < until) {
      if (this.pending && (this.step % 4 === 0 || this.pending === 'victory')) {
        const m = this.pending;
        this.pending = null;
        this.mode = m;
        this.secIdx = 0;
        this.bar = 0;
        this.step = 0;
        this.iter = 0;
        this._applyMix(this.nextTime, 0.15);
      }
      this._step(this.nextTime);
      this._advance();
      this.nextTime += STEP;
    }
  }

  _advance() {
    const arr = ARRANGEMENTS[this.mode];
    if (!arr) return;
    this.step++;
    if (this.step < 16) return;
    this.step = 0;
    this.bar++;
    if (this.bar < SECTIONS[arr.form[this.secIdx]].bars) return;
    this.bar = 0;
    this.secIdx++;
    if (this.secIdx >= arr.form.length) {
      this.secIdx = arr.loop;
      this.iter++;
    }
  }

  _nextChord() {
    const arr = ARRANGEMENTS[this.mode];
    const s = SECTIONS[arr.form[this.secIdx]];
    if (this.bar + 1 < s.bars) return s.chords[this.bar + 1];
    const ni = this.secIdx + 1 >= arr.form.length ? arr.loop : this.secIdx + 1;
    return SECTIONS[arr.form[ni]].chords[0];
  }

  // ------------------------------------------------------------------ one 16th step

  _step(t0) {
    const arr = ARRANGEMENTS[this.mode];
    const name = arr.form[this.secIdx];
    const S = SECTIONS[name];
    const bar = this.bar;
    const s = this.step;
    const chord = S.chords[bar];
    const t = t0 + (s & 1 ? SWING * STEP : 0);
    const mode = this.mode;
    const title = mode === 'title';
    const lastBar = bar === S.bars - 1;
    const ac = this.ac;
    const B = this.bus;
    const tr = (this.tr = mode === 'play' && this.iter % 3 === 2 ? 2 : 0);

    // ---------------- lead
    const ev = S.lead[bar][s];
    if (ev) this._lead(t, ev, chord, name, S);

    // ---------------- comp (marimba arpeggios)
    if (!S.fanfare && !(S.intro && bar === 3 && s >= 8)) {
      const pat = title ? COMP.title : S.bridge ? COMP.bridge : name === 'B' || (this.iter & 1) ? COMP.busy : COMP.play;
      for (let i = 0; i < pat.length; i++) {
        if (pat[i][0] !== s) continue;
        marimba(ac, B.comp, t + rnd(-0.003, 0.003), chord.comp[pat[i][1]] + tr, pat[i][2] * human(), COMP_DECAY);
      }
    }

    // ---------------- off-beat strum
    if (!title && !S.fanfare && !(S.intro && bar < 2)) {
      const hits = S.bridge ? s === 6 || s === 14 : (s & 3) === 2;
      const notes = tr ? chord.skank.map((m) => m + tr) : chord.skank;
      if (hits) pluck(ac, B.skank, t, notes, (s === 2 || s === 10 ? 0.75 : 0.55) * human(), { strum: 0.007 });
      else if ((this.iter & 1) && !this.lite && !S.bridge && (s === 7 || s === 15)) pluck(ac, B.skank, t, notes, 0.3, { decay: 0.1 });
    }

    // ---------------- pad
    if (s === 0 && (title || S.bridge)) pad(ac, B.pad, t, tr ? chord.pad.map((m) => m + tr) : chord.pad, title ? 0.6 : 0.45, STEP * 16);

    // ---------------- bass
    if (!(S.intro && bar < 2)) {
      const pat = S.fanfare ? BASS.fanfare : title ? BASS.title : S.bridge ? BASS.bridge : BASS.play;
      for (let i = 0; i < pat.length; i++) {
        const [st, deg, len, v] = pat[i];
        if (st !== s) continue;
        if (S.fanfare && bar === 3 && st > 0) continue;
        const r = chord.bass;
        let m = r;
        if (deg === '5') m = r + 7;
        else if (deg === '8') m = r + 12;
        else if (deg === 'A') {
          const n = this._nextChord().bass;
          m = n === r ? r + 9 : n - 1;
        }
        const dur = (S.fanfare && bar === 3 ? 12 : len) * STEP * 0.92;
        bass(ac, B.bass, t, m + tr, v * human(), dur);
      }
    }

    // ---------------- drums (kick / clap / cymbal) and fills
    if (!title) this._drums(t, s, bar, S, name, lastBar);

    // ---------------- percussion (shaker, clave, congas)
    this._perc(t, s, bar, S, title, lastBar);

    // ---------------- chase layer
    if (this.chaseLive) this._chase(t, s, bar, chord);

    // ---------------- sparkle layer
    if (this.sparkleOn || t < this.eventOffAt) this._sparkle(t, s, bar, chord);

    // ---------------- celebration horn hits
    if (mode === 'victory' && !S.fanfare && ((bar === 0 && s === 0) || (lastBar && (s === 12 || s === 14)))) {
      for (const m of chord.skank) brass(ac, B.brass, t, m + tr, 0.55, STEP * (s === 0 ? 3 : 1.4));
    }
  }

  _lead(t, ev, chord, name, S) {
    const ac = this.ac;
    const B = this.bus;
    const mode = this.mode;
    if (S.fanfare) {
      const dur = ev.len * STEP * 0.95;
      brass(ac, B.brass, t, ev.midi, 0.9, dur);
      for (const m of chordTonesBelow(ev.midi, chord, 2)) brass(ac, B.brass, t, m, 0.6, dur);
      steelPan(ac, B.lead, t, ev.midi, 0.6);
      return;
    }
    const title = mode === 'title';
    const useMarimba = title && (name === 'A' || name === 'Br');
    const strongBeat = (this.step & 3) === 0;
    const vel = (title ? 0.7 : 0.86) * (strongBeat ? 1 : 0.9) * human();
    const tr = this.tr || 0;
    const midi = ev.midi + tr;
    const play = (tt, m, v, o) => (useMarimba ? marimba(ac, B.lead, tt, m, v * 1.25, o) : steelPan(ac, B.lead, tt, m, v, o));
    play(t, midi, vel, title ? { bright: 0.7 } : undefined);
    if (ev.roll) {
      // tremolo roll on held notes, the signature steel-pan sound
      const n = ev.len * 2;
      const rate = title || this.lite ? 2 : 1;
      for (let k = rate; k < n; k += rate) {
        play(t + k * STEP * 0.5 + rnd(-0.002, 0.002), midi, vel * rnd(0.34, 0.46), { decay: 0.35, cheap: true });
      }
    }
    // harmony a diatonic third below (B and bridge always; A sections from the 2nd loop on)
    const harm = !this.lite && (S.harm || (mode !== 'title' && this.iter >= 1 && name === 'A2') || mode === 'victory');
    if (harm && !(title && useMarimba)) {
      const hm = diatonic(ev.midi, -2) + tr;
      steelPan(ac, B.harm, t + 0.004, hm, vel * 0.8, { bright: 0.7, cheap: this.lite });
      if (ev.roll && !this.lite) for (let k = 2; k < ev.len * 2; k += 2) steelPan(ac, B.harm, t + k * STEP * 0.5, hm, vel * 0.32, { decay: 0.35, cheap: true });
    }
    // marimba doubling an octave down on odd loops
    if (mode === 'play' && !this.lite && (this.iter & 1) && (name === 'A' || name === 'A2')) marimba(ac, B.harm, t, midi - 12, vel * 0.7);
  }

  _drums(t, s, bar, S, name, lastBar) {
    const ac = this.ac;
    const D = this.bus.drums;
    if (S.fanfare) {
      if ((bar < 2 && (s === 0 || s === 8)) || (bar === 2 && s === 0)) tom(ac, D, t, 72, 0.9);
      if ((bar === 0 || bar === 2) && s === 0) cymbal(ac, D, t, 0.75, 2.2);
      if (bar === 3 && s >= 4) snare(ac, D, t, 0.2 + (s - 4) * 0.05);
      return;
    }
    if (S.intro) {
      if (bar === 3 && s >= 8) {
        if (s === 8 || s === 12) kick(ac, D, t, 0.7);
        if (s >= 12) snare(ac, D, t, 0.25 + (s - 12) * 0.1);
      }
      return;
    }
    if (bar === 0 && s === 0) cymbal(ac, D, t, 0.4);
    if (S.bridge) {
      if (s === 0) kick(ac, D, t, 0.8);
      if (s === 12 && bar & 1) clap(ac, D, t, 0.45);
      if (lastBar && (s === 8 || s === 12)) kick(ac, D, t, 0.75);
      return;
    }
    if (s === 0) kick(ac, D, t, 0.85);
    else if (s === 8) kick(ac, D, t, 0.72);
    else if (s === 10 && (name === 'B' || this.iter & 1)) kick(ac, D, t, 0.4);
    if ((s === 4 || s === 12) && !(lastBar && s === 12)) clap(ac, D, t, 0.55);
    if (lastBar && s >= 12) {
      if (s === 12 || s === 14) snare(ac, D, t, 0.45);
      if (s === 15) snare(ac, D, t, 0.6);
    }
  }

  _perc(t, s, bar, S, title, lastBar) {
    const ac = this.ac;
    const P = this.bus.perc;
    // shaker
    let sv = 0;
    if (title) sv = s & 1 ? 0 : (s & 3) === 2 ? 0.5 : 0.28;
    else if (!S.fanfare) sv = SHAKE_PLAY[s] * (S.intro && bar === 0 ? 0.6 : 1);
    if (sv) {
      const g = this.shaker.gain;
      g.setTargetAtTime(sv * 0.3 * human(), t, 0.003);
      g.setTargetAtTime(0, t + 0.012, (s & 3) === 2 ? 0.03 : 0.018);
    }
    if (S.fanfare) {
      if (bar === 3) for (const [st, w, v, sl] of CONGA_FILL) if (st === s) conga(ac, P, t, w, v, sl);
      return;
    }
    // son clave (3-2)
    if (!(S.intro && bar === 0)) {
      const three = (bar & 1) === 0;
      if (three ? s === 0 || s === 6 || s === 12 : s === 4 || s === 8) clave(ac, P, t, title ? 0.32 : 0.5);
    }
    // congas
    if (S.intro && bar < 2) return;
    const fill = lastBar && !title;
    const pat = fill ? CONGA_FILL : title ? CONGA_TITLE : CONGA_PLAY;
    for (let i = 0; i < pat.length; i++) {
      const [st, w, v, sl] = pat[i];
      if (st === s) conga(ac, P, t, w, v * human(), sl);
    }
    if (fill && s < 12) for (const [st, w, v, sl] of CONGA_PLAY) if (st === s) conga(ac, P, t, w, v, sl);
  }

  _chase(t, s, bar, chord) {
    const ac = this.ac;
    const C = this.bus.chase;
    if (s === 4 || s === 12) kick(ac, C, t, 0.8);
    if (s === 14 && bar & 1) kick(ac, C, t, 0.5);
    // hi-hat 16ths, open on the off-beat 8ths
    const open = (s & 3) === 2;
    const g = this.hat.gain;
    g.setTargetAtTime((open ? 0.2 : s & 1 ? 0.07 : 0.12) * human(), t, 0.002);
    g.setTargetAtTime(0, t + 0.008, open ? 0.05 : 0.015);
    // snare build every 4th bar, tom fill every 8th
    if ((bar & 3) === 3 && s >= 8) snare(ac, C, t, 0.2 + (s - 8) * 0.06);
    if ((bar & 7) === 7 && s >= 12) tom(ac, C, t, [210, 175, 145, 115][s - 12], 0.75);
    // tension bass: pumping 8ths with octave jumps
    if ((s & 1) === 0) {
      const m = chord.bass + (this.tr || 0) + ((s & 7) === 4 ? 12 : 0);
      if (this.lite) bass(ac, C, t, m, s === 0 ? 0.9 : 0.65, STEP * 1.1);
      else tensionBass(ac, C, t, m, s === 0 ? 0.95 : 0.7, STEP * 1.2);
    }
  }

  _sparkle(t, s, bar, chord) {
    const ac = this.ac;
    const K = this.bus.sparkle;
    const type = this.mode === 'victory' ? 'golden' : this.eventType || this.lastEvent || 'golden';
    const sp = chord.sparkle;
    const tr = this.tr || 0;
    if (type === 'golden') {
      if (s & 1) return;
      const idx = [0, 1, 2, 3, 4, 3, 2, 1][(s >> 1) & 7] % sp.length;
      bell(ac, K, t, mtof(sp[idx] + tr), { ratio: 2, index: 0.9, vol: (s & 3 ? 0.06 : 0.09) * human(), decay: 0.9 });
    } else if (type === 'diamond') {
      if (!(s === 3 || s === 7 || s === 10 || s === 13) || Math.random() < 0.3) return;
      const m = sp[(Math.random() * sp.length) | 0] + 12 + tr;
      bell(ac, K, t, mtof(m), { ratio: 3.5, index: 1.6, vol: 0.07 * human(), decay: 1.6 });
    } else {
      // rainbow: pentatonic harp runs on beats 3-4, up on even bars, down on odd bars
      if (s < 8) return;
      const k = bar & 1 ? 15 - s : s - 8;
      const base = 77 + 12 * Math.floor(k / 5);
      const pc = PENTA[k % 5];
      harp(ac, K, t, place(pc, base) + tr, 0.28 * human(), { decay: 0.7 });
    }
  }

  dispose() {
    try {
      this.noise.stop();
    } catch {
      /* already stopped */
    }
    for (const n of this._fx) n.disconnect();
    this.out.disconnect();
    this.active = false;
  }
}

/**
 * Render helper for tests and the sound lab: schedule `seconds` of music into an OfflineAudioContext.
 * opts: {mode, chase:boolean|number (seconds before chase starts), event, start (section index)}
 */
export function scheduleOffline(ac, mixer, seconds, opts = {}) {
  const eng = new MusicEngine(ac, mixer);
  eng.setMode(opts.mode || 'play', 0);
  if (opts.section != null) {
    eng.secIdx = opts.section;
    eng.bar = 0;
  }
  if (opts.iter != null) eng.iter = opts.iter;
  if (opts.lite) eng.lite = true;
  if (opts.event) eng.setEvent(opts.event, 0);
  if (opts.solo) for (const k in eng.bus) if (!opts.solo.includes(k)) eng.bus[k].gain.value = 0;
  const chaseAt = opts.chase === true ? 0 : typeof opts.chase === 'number' ? opts.chase : null;
  const chaseOff = opts.chaseOff ?? null;
  const step = 0.1;
  for (let t = 0; t < seconds; t += step) {
    if (chaseAt != null && t >= chaseAt && !eng.chaseOn && (chaseOff == null || t < chaseOff)) eng.setChase(true, t);
    if (chaseOff != null && t >= chaseOff && eng.chaseOn) eng.setChase(false, t);
    eng.scheduleUntil(Math.min(seconds, t + step));
  }
  return eng;
}
