// Sound lab: a sound board for listening, plus an offline-render API used by automated tests.
// Build: node build.mjs --entry src/audio/dev/lab.js --out <dir>
import { audio, MUSIC_TRIM, SFX_TRIM } from '../audio.js';
import { createMixer } from '../mixer.js';
import { scheduleOffline, BPM, STEP } from '../music.js';
import { SFX, alarmLoop, stealLoop } from '../sfx.js';
import * as synth from '../synth.js';
import { setSetting } from '../../core/settings.js';

// ------------------------------------------------------------------ offline rendering + analysis

function analyse(buf) {
  const ch = [];
  for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
  const n = buf.length;
  let peak = 0, sum = 0, clip = 0, zc = 0, first = -1, last = -1;
  const L = ch[0];
  for (let i = 0; i < n; i++) {
    for (const d of ch) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a >= 1) clip++;
      if (a > 0.001) {
        if (first < 0) first = i;
        last = i;
      }
      sum += d[i] * d[i];
    }
  }
  for (let i = Math.max(1, first); i <= last; i++) if ((L[i - 1] < 0) !== (L[i] < 0)) zc++;
  const rms = Math.sqrt(sum / (n * ch.length));
  // spectral centroid over a few 4096-sample windows of the loudest region (simple DFT via FFT)
  const { centroid, bands } = spectrum(L, buf.sampleRate);
  const { laeq, lamax } = aLoudness(ch, buf.sampleRate, first, last);
  return {
    seconds: +(n / buf.sampleRate).toFixed(3),
    peak: +peak.toFixed(4),
    rms: +rms.toFixed(4),
    peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1),
    rmsDb: +(20 * Math.log10(rms || 1e-9)).toFixed(1),
    clipped: clip,
    zcr: first < 0 ? 0 : +(zc / ((last - first + 1) / buf.sampleRate)).toFixed(1), // zero crossings per second while audible
    centroid: Math.round(centroid),
    bands, // share of spectral energy: <200 Hz, 200-2k, 2k-6k, >6k
    laeq, // A-weighted level over the audible region (dB, relative)
    lamax, // loudest ~93 ms A-weighted window (dB, relative): perceived loudness of short sounds
    audibleFrom: first < 0 ? null : +(first / buf.sampleRate).toFixed(3),
    audibleTo: last < 0 ? null : +(last / buf.sampleRate).toFixed(3),
  };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function aWeight(f) {
  const f2 = f * f;
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return ra * 1.2589; // +2 dB normalisation at 1 kHz
}

function aLoudness(ch, sr, first, last) {
  const N = 4096;
  if (first < 0) return { laeq: -120, lamax: -120 };
  const W = new Float64Array(N / 2);
  for (let k = 1; k < N / 2; k++) W[k] = aWeight((k * sr) / N) ** 2;
  let sum = 0, cnt = 0, max = 0;
  const end = Math.max(first + 1, last - N / 2);
  for (let off = Math.max(0, first - N / 4); off < end; off += N / 2) {
    let p = 0;
    for (const d of ch) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = (d[off + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      fft(re, im);
      for (let k = 1; k < N / 2; k++) p += (re[k] * re[k] + im[k] * im[k]) * W[k];
    }
    p = (p * 2) / (N * N * 0.375 * ch.length);
    sum += p;
    cnt++;
    if (p > max) max = p;
  }
  const db = (x) => +(10 * Math.log10(x || 1e-12)).toFixed(1);
  return { laeq: db(sum / Math.max(1, cnt)), lamax: db(max) };
}

function spectrum(d, sr) {
  const N = 4096;
  if (d.length < N) return { centroid: 0, bands: null };
  let num = 0, den = 0;
  const band = [0, 0, 0, 0];
  const hops = Math.min(24, Math.floor(d.length / N));
  const stride = Math.floor((d.length - N) / Math.max(1, hops - 1)) || N;
  for (let h = 0; h < hops; h++) {
    const off = h * stride;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = d[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const m = Math.hypot(re[k], im[k]);
      const f = (k * sr) / N;
      num += m * f;
      den += m;
      band[f < 200 ? 0 : f < 2000 ? 1 : f < 6000 ? 2 : 3] += m * m;
    }
  }
  const tot = band.reduce((a, b) => a + b, 0) || 1;
  return { centroid: den ? num / den : 0, bands: band.map((b) => +(b / tot).toFixed(3)) };
}

function toBase64Int16(buf) {
  const n = buf.length;
  const C = buf.numberOfChannels;
  const out = new Int16Array(n * C);
  const ch = [];
  for (let c = 0; c < C; c++) ch.push(buf.getChannelData(c));
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) out[i * C + c] = Math.max(-32768, Math.min(32767, Math.round(ch[c][i] * 32767)));
  const bytes = new Uint8Array(out.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Render something offline. build(ac, mixer, dest) schedules the audio; dest is the SFX input
 * (through the master chain) unless raw=true, in which case it goes straight to the output.
 */
async function render(seconds, build, { sr = 44100, raw = false, pcm = false, bare: ropts_bare = false, spec: ropts_spec = null, hop = 512, music = 0.6 * 0.6 * MUSIC_TRIM, sfx = 0.64 * SFX_TRIM } = {}) {
  const ac = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const mixer = createMixer(ac);
  mixer.musicFader.gain.value = music;
  mixer.musicVerbFader.gain.value = music;
  mixer.sfxFader.gain.value = sfx;
  mixer.sfxVerbFader.gain.value = sfx;
  const dest = raw ? ac.destination : mixer.sfxIn;
  build(ac, mixer, dest);
  const t0 = performance.now();
  const buf = await ac.startRendering();
  const renderMs = performance.now() - t0;
  if (ropts_bare) return { renderMs };
  const res = { stats: analyse(buf), sampleRate: sr, channels: 2, renderMs };
  if (ropts_spec) drawSpectrogram(buf, ropts_spec, { hop });
  if (pcm) res.pcm = toBase64Int16(buf);
  return res;
}

/** Draw a log-frequency spectrogram of the left channel into a new canvas (for visual checks). */
function drawSpectrogram(buf, title, { fmin = 40, fmax = 14000, hop = 512, height = 360 } = {}) {
  const N = 2048;
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const cols = Math.floor((d.length - N) / hop);
  const cv = document.createElement('canvas');
  cv.width = cols;
  cv.height = height + 22;
  cv.className = 'spec';
  const g = cv.getContext('2d');
  g.fillStyle = '#0b0f1e';
  g.fillRect(0, 0, cv.width, cv.height);
  const img = g.createImageData(cols, height);
  const lmin = Math.log(fmin), lmax = Math.log(fmax);
  const rowBin = new Float64Array(height);
  for (let y = 0; y < height; y++) rowBin[y] = (Math.exp(lmax - ((lmax - lmin) * y) / (height - 1)) * N) / sr;
  const re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(N / 2);
  for (let c = 0; c < cols; c++) {
    const off = c * hop;
    for (let i = 0; i < N; i++) {
      re[i] = d[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    for (let y = 0; y < height; y++) {
      const b = rowBin[y];
      const k = Math.min(N / 2 - 2, Math.floor(b));
      const m = mag[k] + (mag[k + 1] - mag[k]) * (b - k);
      const db = 20 * Math.log10(m + 1e-9);
      const v = Math.max(0, Math.min(1, (db + 30) / 70));
      const o = (y * cols + c) * 4;
      img.data[o] = 255 * Math.min(1, v * 1.8 - 0.3);
      img.data[o + 1] = 255 * Math.max(0, Math.min(1, v * 1.4 - 0.25));
      img.data[o + 2] = 255 * Math.min(1, 0.25 + v * 0.9 - Math.max(0, v - 0.7) * 2);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 22);
  g.fillStyle = '#fff';
  g.font = '600 14px system-ui';
  g.fillText(title, 6, 16);
  // bar lines every 16 steps, frequency guides
  g.fillStyle = '#ffffff55';
  const barSec = STEP * 16;
  for (let t = 0; t * sr / hop < cols; t += barSec) g.fillRect(Math.round((t * sr) / hop), 22, 1, 6);
  for (const f of [100, 1000, 10000]) {
    const y = 22 + ((lmax - Math.log(f)) / (lmax - lmin)) * (height - 1);
    g.fillRect(0, y, 14, 1);
    g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 16, y + 5);
  }
  document.body.appendChild(cv);
  return cv;
}

const lab = {
  BPM,
  STEP,
  sfxNames: Object.keys(SFX),
  voiceStats: () => ({ ...synth.stats }),
  /** opts: {mode, chase, chaseOff, event, section} */
  renderMusic(seconds, opts = {}, ropts = {}) {
    return render(seconds, (ac, mixer) => scheduleOffline(ac, mixer, seconds, opts), ropts);
  },
  renderSfx(name, opts = {}, seconds = 2.5, ropts = {}) {
    return render(seconds, (ac, mixer, dest) => SFX[name](ac, dest, 0.02, { ...opts, send: ropts.raw ? undefined : mixer.sfxVerbIn }), ropts);
  },
  /** Baseline: the mixer graph with one quiet oscillator (for CPU comparisons). */
  renderBaseline(seconds, ropts = {}) {
    return render(seconds, (ac, mixer) => {
      const o = ac.createOscillator();
      o.connect(mixer.musicIn);
      o.start(0);
    }, ropts);
  },
  renderLoop(kind, seconds = 2, ropts = {}) {
    return render(seconds, (ac, mixer, dest) => {
      const h = kind === 'alarm' ? alarmLoop(ac, dest, 0.02, { max: 4 }) : stealLoop(ac, dest, 0.02);
      if (h.set) h.set(0.5);
      h.stop(seconds - 0.3);
    }, ropts);
  },
  /** Isolated instrument notes for spectral sanity checks. */
  renderInstrument(name, seconds = 1.2, ropts = {}) {
    return render(seconds, (ac, mixer, dest) => {
      const t = 0.02;
      switch (name) {
        case 'steel': synth.steelPan(ac, dest, t, 72, 0.9); break;
        case 'marimba': synth.marimba(ac, dest, t, 60, 0.9); break;
        case 'bass': synth.bass(ac, dest, t, 41, 0.9, 0.8); break;
        case 'kick': synth.kick(ac, dest, t, 0.9); break;
        case 'clap': synth.clap(ac, dest, t, 0.8); break;
        case 'conga': synth.conga(ac, dest, t, 'mid', 0.8); break;
        case 'shaker': synth.noise(ac, dest, t, { filter: 'bandpass', f0: 7200, q: 0.8, dur: 0.08, vol: 0.3 }); break;
        case 'brass': synth.brass(ac, dest, t, 65, 0.9, 0.6); break;
        case 'bell': synth.bell(ac, dest, t, 1046.5, { vol: 0.3 }); break;
        default: throw new Error('unknown instrument ' + name);
      }
    }, { raw: true, ...ropts });
  },
  /** Sequence of SFX (name, opts) spaced out, for a listening reel. */
  renderReel(items, gap = 0.35, ropts = {}) {
    let total = 0.2;
    for (const it of items) total += (it.len || 1.2) + gap;
    return render(total, (ac, mixer, dest) => {
      let t = 0.1;
      for (const it of items) {
        SFX[it.name](ac, dest, t, { ...(it.opts || {}), send: mixer.sfxVerbIn });
        t += (it.len || 1.2) + gap;
      }
    }, ropts);
  },
};
window.__audioLab = lab;
window.__audio = audio;

// ------------------------------------------------------------------ sound board UI

const DEMOS = [
  ['UI', [['click'], ['hover'], ['error'], ['shopBell']]],
  ['Seeds', [['grab', { tier: 0 }, 'Common'], ['grab', { tier: 2 }, 'Rare'], ['grab', { tier: 4 }, 'Legendary'], ['grab', { tier: 5, mutation: 'gold' }, 'Mythic Gold'],
    ['grab', { tier: 3, mutation: 'diamond' }, 'Epic Diamond'], ['grab', { tier: 2, mutation: 'rainbow' }, 'Rare Rainbow'], ['grab', { tier: 6 }, 'SECRET']]],
  ['Garden', [['plant'], ['grown'], ['coins', { amount: 40 }, 'coins 40'], ['coins', { amount: 25000 }, 'coins 25K'], ['unlock'], ['lockOn'], ['lockOff'], ['dropped'], ['sprout']]],
  ['Stealing', [['stolen', {}, 'stolen (victim)'], ['yoink', {}, 'yoink (thief)'], ['heist', {}, 'heist (thief home)'], ['robbed', {}, 'robbed (victim)'], ['saved', {}, 'got it back!']]],
  ['Combat', [['whoosh'], ['hit', { who: 'dorian' }, 'hit Dorian'], ['hit', { who: 'esther' }, 'hit Esther'], ['hit', { who: 'maddie' }, 'hit Mati'], ['hit', { who: 'micah' }, 'hit Micah'],
    ['jump'], ['slip'], ['splash']]],
  ['Items', [['item', { item: 'banana' }, 'banana'], ['item', { item: 'balloon' }, 'balloon'], ['item', { item: 'coil' }, 'coil'], ['item', { item: 'cloak' }, 'cloak'], ['item', { item: 'bucket' }, 'bucket']]],
  ['Monsters', [['aggro', { type: 'stump' }, 'Grumpy Stump'], ['aggro', { type: 'crab' }, 'Cactus Crab'], ['aggro', { type: 'snapper' }, 'Swamp Snapper'],
    ['aggro', { type: 'lavasprout' }, 'Lava Sprout'], ['aggro', { type: 'lurker' }, 'Star Lurker'], ['chomp'], ['monsterBonk']]],
  ['Shops', [['purchase'], ['speedUp'], ['rebirth']]],
  ['Events', [['event', { type: 'golden' }, 'Golden Hour'], ['event', { type: 'diamond' }, 'Diamond Night'], ['event', { type: 'rainbow' }, 'Rainbow Rain'], ['confetti']]],
];

function ui() {
  const css = `
  html,body{height:auto!important;overflow:auto!important}
  body{margin:0;background:#1b2440;color:#fff;font:15px/1.4 system-ui,sans-serif}
  main{max-width:980px;margin:0 auto;padding:20px 16px 60px}
  h1{font-size:26px;margin:0 0 4px} p{color:#b9c3e6;margin:0 0 16px}
  section{background:#26315a;border-radius:14px;padding:12px 14px;margin:10px 0}
  h2{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#ffd23f;margin:0 0 8px}
  button{font:600 14px system-ui;border:0;border-radius:10px;padding:9px 13px;margin:3px;background:#3d9bff;color:#fff;cursor:pointer;box-shadow:0 3px 0 #1d5fae}
  button:active{transform:translateY(2px);box-shadow:0 1px 0 #1d5fae}
  button.on{background:#ff4f9a;box-shadow:0 3px 0 #a3245d}
  label{margin-right:16px} #st{font:12px ui-monospace,monospace;color:#9fe0c0;white-space:pre}`;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
  const main = document.createElement('main');
  main.innerHTML = '<h1>Steal A Seed! Sound Lab</h1><p>Every sound is synthesized live with WebAudio. Click anything to start audio.</p>';
  document.body.appendChild(main);
  const add = (title) => {
    const s = document.createElement('section');
    s.innerHTML = `<h2>${title}</h2>`;
    main.appendChild(s);
    return s;
  };
  const btn = (parent, label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      audio.unlock();
      fn(b);
    };
    parent.appendChild(b);
    return b;
  };
  const m = add('Music');
  const modeBtns = [];
  for (const mode of ['title', 'play', 'victory', 'off']) {
    modeBtns.push(btn(m, mode, (b) => {
      audio.setMusicMode(mode);
      modeBtns.forEach((x) => x.classList.toggle('on', x === b));
    }));
  }
  btn(m, 'chase layer', (b) => {
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    audio.music?.setChase(on);
  });
  for (const ev of ['golden', 'diamond', 'rainbow']) {
    btn(m, 'event: ' + ev, (b) => {
      const on = !b.classList.contains('on');
      m.querySelectorAll('button[data-ev]').forEach((x) => x.classList.remove('on'));
      b.classList.toggle('on', on);
      audio.music?.setEvent(on ? ev : null);
      if (on) audio.play('event', { type: ev });
    }).dataset.ev = ev;
  }
  const vol = document.createElement('div');
  vol.innerHTML = '<label>music <input id="mv" type="range" min="0" max="1" step="0.05" value="0.6"></label><label>sfx <input id="sv" type="range" min="0" max="1" step="0.05" value="0.8"></label>';
  m.appendChild(vol);
  vol.querySelector('#mv').oninput = (e) => setSetting('music', +e.target.value);
  vol.querySelector('#sv').oninput = (e) => setSetting('sfx', +e.target.value);
  for (const [title, list] of DEMOS) {
    const s = add(title);
    for (const [name, opts, label] of list) btn(s, label || name, () => audio.play(name, { ...(opts || {}), important: true }));
  }
  const loops = add('Loops');
  let alarm = null;
  btn(loops, 'steal alarm', () => {
    const ac = audio.ctx;
    if (alarm) {
      alarm.stop();
      alarm = null;
    } else alarm = alarmLoop(ac, audio.mixer.sfxIn, ac.currentTime + 0.01, { max: 4 });
  });
  const st = document.createElement('div');
  st.id = 'st';
  main.appendChild(st);
  setInterval(() => {
    st.textContent = JSON.stringify(audio.stats());
  }, 500);
}

ui();
