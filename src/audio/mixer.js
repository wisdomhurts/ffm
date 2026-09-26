// Master mixing graph, shared by the live game and the offline renderer.
//
//   music parts ─► musicIn ─► duck (low-pass) ─► musicFader ─┐
//   music sends ─► musicVerbIn ─► musicVerbFader ─► reverb ───┤
//   sfx voices ─► pans[i] ─► sfxIn ─► sfxFader ───────────────┼─► master ─► glue comp ─► limiter ─► soft clip ─► out
//   sfx sends ─► sfxVerbIn ─► sfxVerbFader ─► reverb ─────────┘
import { kit } from './synth.js';

export const PAN_STEPS = [-0.75, -0.45, -0.2, 0, 0.2, 0.45, 0.75];

function impulse(ac, seconds, decay) {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.012);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let s = 0x51f15e + c * 977;
    let lp = 0;
    for (let i = pre; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const w = s / 2147483648 - 1;
      const x = (i - pre) / (len - pre);
      // darker as it decays: one-pole low-pass whose cutoff falls over time
      const a = 0.25 + 0.7 * x;
      lp = lp * a + w * (1 - a);
      d[i] = lp * Math.pow(1 - x, decay);
    }
  }
  return buf;
}

function softClipCurve() {
  const n = 2048;
  const c = new Float32Array(n);
  const knee = 0.72;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax < knee ? ax : knee + (0.985 - knee) * Math.tanh((ax - knee) / (0.985 - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/**
 * Build the graph on any BaseAudioContext. `dest` defaults to ac.destination.
 * Faders start at unity; the caller sets levels.
 */
export function createMixer(ac, dest = ac.destination) {
  kit(ac);
  const g = (v = 1) => {
    const n = ac.createGain();
    n.gain.value = v;
    return n;
  };
  const master = g(0.9);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.008;
  comp.release.value = 0.22;
  const lim = ac.createDynamicsCompressor();
  lim.threshold.value = -4;
  lim.knee.value = 1;
  lim.ratio.value = 20;
  lim.attack.value = 0.002;
  lim.release.value = 0.12;
  const clip = ac.createWaveShaper();
  clip.curve = softClipCurve();
  master.connect(comp);
  comp.connect(lim);
  lim.connect(clip);
  clip.connect(dest);

  const verb = ac.createConvolver();
  verb.buffer = impulse(ac, 1.7, 3.2);
  const verbOut = g(0.55);
  verb.connect(verbOut);
  verbOut.connect(master);

  const musicIn = g(1);
  const duck = ac.createBiquadFilter();
  duck.type = 'lowpass';
  duck.frequency.value = 20000;
  duck.Q.value = 0.5;
  const musicFader = g(1);
  musicIn.connect(duck);
  duck.connect(musicFader);
  musicFader.connect(master);
  const musicVerbIn = g(1);
  const musicVerbFader = g(1);
  musicVerbIn.connect(musicVerbFader);
  musicVerbFader.connect(verb);

  const sfxIn = g(1);
  const sfxFader = g(1);
  sfxIn.connect(sfxFader);
  sfxFader.connect(master);
  const sfxVerbIn = g(1);
  const sfxVerbFader = g(1);
  sfxVerbIn.connect(sfxVerbFader);
  sfxVerbFader.connect(verb);

  const pans = PAN_STEPS.map((p) => {
    if (p === 0 || !ac.createStereoPanner) return sfxIn;
    const sp = ac.createStereoPanner();
    sp.pan.value = p;
    sp.connect(sfxIn);
    return sp;
  });

  return {
    ac, master, comp, lim, clip, verb, musicIn, duck, musicFader, musicVerbIn, musicVerbFader,
    sfxIn, sfxFader, sfxVerbIn, sfxVerbFader, pans,
    /** Smoothly set the music level (0..1 linear gain) and the pause "muffle". */
    setMusic(level, muffled = false, tc = 0.25) {
      const t = ac.currentTime;
      musicFader.gain.setTargetAtTime(level, t, tc);
      musicVerbFader.gain.setTargetAtTime(level, t, tc);
      duck.frequency.setTargetAtTime(muffled ? 850 : 20000, t, muffled ? 0.12 : 0.3);
    },
    setSfx(level, tc = 0.08) {
      const t = ac.currentTime;
      sfxFader.gain.setTargetAtTime(level, t, tc);
      sfxVerbFader.gain.setTargetAtTime(level, t, tc);
    },
    panBus(pan) {
      let best = 3;
      let bd = 9;
      for (let i = 0; i < PAN_STEPS.length; i++) {
        const d = Math.abs(PAN_STEPS[i] - pan);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return pans[best];
    },
  };
}
