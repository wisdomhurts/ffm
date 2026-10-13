#!/usr/bin/env python3
"""MATI's Campout - original audio generator.

Synthesises every sound effect, ambience loop, stinger and music track used by
the game from scratch (numpy only, no samples, no third-party audio): filtered
noise, envelopes, FM, Karplus-Strong plucked strings, modal synthesis for wood
and metal, granular crackle, source-filter voices for creatures and a
convolution reverb with a synthetic impulse response.

Output: assets/audio/<name>.ogg (Ogg Vorbis via ffmpeg/libvorbis) plus
assets/audio/manifest.json (lengths, channels, groups of variants, loop flags).
Loops and music are rendered circularly so they repeat seamlessly; every asset
is deterministic (seeded from its name) so re-running gives identical files.

Usage:
    python3 tools/gen_audio.py                 # everything
    python3 tools/gen_audio.py --only chop,music_day
    python3 tools/gen_audio.py --list
    python3 tools/gen_audio.py --spectrograms /tmp/specs   # PNG sanity check
    python3 tools/gen_audio.py --wav /tmp/wavs             # also write WAVs

Requires Python 3.9+, numpy, ffmpeg with libvorbis (PIL only for spectrograms).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import time
import wave

import numpy as np

SR = 44100
TAU = 2.0 * math.pi
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
OUT_DIR = os.path.join(PROJECT, "assets", "audio")

# Shared musical grid: every main music loop is 24 bars of 4/4 at 72 BPM
# (80.0 s) in D major / B minor, so layers stay beat-aligned when the game
# crossfades between them. The boss loop is 48 bars at 144 BPM (also 80.0 s).
TEMPO = 72.0
BEAT = 60.0 / TEMPO
BAR = 4.0 * BEAT
LOOP_BARS = 24
LOOP_SECONDS = LOOP_BARS * BAR


# =============================================================================
# Small helpers
# =============================================================================

def rng_for(name: str) -> np.random.Generator:
    h = hashlib.sha1(name.encode("utf-8")).hexdigest()
    return np.random.default_rng(int(h[:12], 16))


def ns(seconds: float) -> int:
    return max(int(round(seconds * SR)), 1)


def tvec(n: int) -> np.ndarray:
    return np.arange(n) / SR


def db(x: float) -> float:
    return 10.0 ** (x / 20.0)


def mtof(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69.0) / 12.0)


_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name: str) -> int:
    """'F#4' -> 66, 'Bb3' -> 58."""
    pc = _PC[name[0]]
    i = 1
    while i < len(name) and name[i] in "#b":
        pc += 1 if name[i] == "#" else -1
        i += 1
    octave = int(name[i:])
    return (octave + 1) * 12 + pc


def pad_to(x: np.ndarray, n: int) -> np.ndarray:
    if len(x) >= n:
        return x[:n]
    shape = (n - len(x),) + x.shape[1:]
    return np.concatenate([x, np.zeros(shape)])


def mix_at(dst: np.ndarray, src: np.ndarray, start: int, gain: float = 1.0, wrap: bool = False) -> None:
    """Add src into dst at sample index start (optionally wrapping around)."""
    n = len(dst)
    if wrap:
        start %= n
        pos = 0
        while pos < len(src):
            i = (start + pos) % n
            m = min(len(src) - pos, n - i)
            dst[i:i + m] += src[pos:pos + m] * gain
            pos += m
        return
    if start >= n:
        return
    a = max(start, 0)
    s0 = a - start
    m = min(len(src) - s0, n - a)
    if m > 0:
        dst[a:a + m] += src[s0:s0 + m] * gain


def pan_gains(p: float) -> tuple[float, float]:
    a = (np.clip(p, -1.0, 1.0) + 1.0) * 0.25 * math.pi
    return math.cos(a), math.sin(a)


def to_stereo(x: np.ndarray, p: float = 0.0) -> np.ndarray:
    if x.ndim == 2:
        return x
    l, r = pan_gains(p)
    return np.stack([x * l, x * r], axis=1)


def fade(x: np.ndarray, fin: float = 0.0, fout: float = 0.0) -> np.ndarray:
    x = x.copy()
    a = ns(fin) if fin > 0 else 0
    b = ns(fout) if fout > 0 else 0
    if a > 1:
        w = np.sin(np.linspace(0, math.pi / 2, a)) ** 2
        x[:a] = (x[:a].T * w).T
    if b > 1:
        w = np.cos(np.linspace(0, math.pi / 2, b)) ** 2
        x[-b:] = (x[-b:].T * w).T
    return x


def env_ad(n: int, attack: float, decay: float, curve: float = 1.0) -> np.ndarray:
    """Attack (linear-ish) then exponential decay with time constant `decay`."""
    t = tvec(n)
    a = max(attack, 1e-4)
    rise = np.clip(t / a, 0, 1) ** curve
    fall = np.exp(-np.maximum(t - a, 0) / max(decay, 1e-4))
    return rise * fall


def env_adsr(n: int, a: float, d: float, s: float, r: float, hold: float) -> np.ndarray:
    """ADSR with the release starting at `hold` seconds."""
    t = tvec(n)
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.where(t > hold, np.exp(-(t - hold) / max(r, 1e-4)), 1.0)
    return e * rel


def smooth_curve(points: list[tuple[float, float]], n: int) -> np.ndarray:
    """Piecewise-linear curve through (time_s, value) points, length n."""
    ts = np.array([p[0] for p in points])
    vs = np.array([p[1] for p in points])
    return np.interp(tvec(n), ts, vs)


def random_walk(n: int, rate_hz: float, rng: np.random.Generator, circular: bool = False) -> np.ndarray:
    """Smooth random curve in about [-1, 1] with features around rate_hz."""
    ctrl_sr = max(rate_hz * 8.0, 4.0)
    m = max(int(n / SR * ctrl_sr) + 4, 8)
    w = rng.standard_normal(m)
    W = np.fft.rfft(w)
    f = np.fft.rfftfreq(m, 1.0 / ctrl_sr)
    W *= 1.0 / (1.0 + (f / rate_hz) ** 4)
    W[0] = 0
    c = np.fft.irfft(W, m)
    c /= (np.max(np.abs(c)) + 1e-9)
    if circular:
        xs = np.arange(n) / n * m
        i0 = np.floor(xs).astype(int) % m
        fr = xs - np.floor(xs)
        return c[i0] * (1 - fr) + c[(i0 + 1) % m] * fr
    return np.interp(np.linspace(0, m - 4, n), np.arange(m), c)


# =============================================================================
# Filters (frequency-domain magnitude responses; zero phase)
# =============================================================================

def H_lp(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))


def H_hp(f, fc, order=2):
    f = np.maximum(f, 1e-3)
    return 1.0 / np.sqrt(1.0 + (fc / f) ** (2 * order))


def H_bp(f, fc, q):
    f = np.maximum(f, 1e-3)
    return 1.0 / np.sqrt(1.0 + (q * (f / fc - fc / f)) ** 2)


def H_peak(f, fc, q, gain_db):
    g = db(gain_db)
    return 1.0 + (g - 1.0) * H_bp(f, fc, q) ** 2


def H_shelf_hi(f, fc, gain_db):
    g = db(gain_db)
    s = 1.0 - H_lp(f, fc, 1) ** 2
    return 1.0 + (g - 1.0) * s


def H_shelf_lo(f, fc, gain_db):
    g = db(gain_db)
    return 1.0 + (g - 1.0) * H_lp(f, fc, 1) ** 2


def fft_eq(x: np.ndarray, fn, circular: bool = False, pad: float = 0.3) -> np.ndarray:
    """Static zero-phase EQ. fn(freqs) -> gain. Mono or (n, 2)."""
    if x.ndim == 2:
        return np.stack([fft_eq(x[:, c], fn, circular, pad) for c in range(x.shape[1])], axis=1)
    n = len(x)
    m = n if circular else n + ns(pad)
    X = np.fft.rfft(x, m)
    X *= fn(np.fft.rfftfreq(m, 1.0 / SR))
    return np.fft.irfft(X, m)[:n]


def lp(x, fc, order=2, circular=False):
    return fft_eq(x, lambda f: H_lp(f, fc, order), circular)


def hp(x, fc, order=2, circular=False):
    return fft_eq(x, lambda f: H_hp(f, fc, order), circular)


def bp(x, fc, q, circular=False):
    return fft_eq(x, lambda f: H_bp(f, fc, q), circular)


def stft_filter(x: np.ndarray, gain_fn, n_fft: int = 2048, hop: int = 512, circular: bool = False) -> np.ndarray:
    """Time-varying filter. gain_fn(t[:, None], f[None, :]) -> (frames, bins)."""
    if x.ndim == 2:
        return np.stack([stft_filter(x[:, c], gain_fn, n_fft, hop, circular) for c in range(x.shape[1])], axis=1)
    n = len(x)
    if circular:
        reps = int(math.ceil(n_fft / max(n, 1))) + 1
        big = np.tile(x, reps * 2 + 1)
        ext = big[reps * n - n_fft: reps * n + n + n_fft]
    else:
        ext = np.concatenate([np.zeros(n_fft), x, np.zeros(n_fft + hop)])
    total = len(ext)
    frames = 1 + (total - n_fft) // hop
    win = np.sqrt(0.5 - 0.5 * np.cos(TAU * np.arange(n_fft) / n_fft))
    freqs = np.fft.rfftfreq(n_fft, 1.0 / SR)
    out = np.zeros(total)
    chunk = 2048
    for c0 in range(0, frames, chunk):
        c1 = min(c0 + chunk, frames)
        starts = np.arange(c0, c1) * hop
        idx = starts[:, None] + np.arange(n_fft)[None, :]
        F = np.fft.rfft(ext[idx] * win, axis=1)
        times = (starts + n_fft / 2 - n_fft) / SR
        if circular:
            times = np.mod(times, n / SR)
        G = gain_fn(times[:, None], freqs[None, :])
        y = np.fft.irfft(F * G, n_fft, axis=1) * win
        for k in range(n_fft // hop):
            sel = y[k::n_fft // hop]
            st = starts[k::n_fft // hop]
            if len(sel) == 0:
                continue
            # frames in this group do not overlap -> contiguous add
            base = st[0]
            flat = sel.reshape(-1)
            seg = out[base: base + len(flat)]
            seg += flat[:len(seg)]
    out /= (n_fft / hop) / 2.0
    return out[n_fft: n_fft + n]


def formant_gain(t, f, formants):
    """Sum of resonance peaks. formants: list of (freq_fn(t), bw, amp)."""
    g = np.zeros(np.broadcast(t, f).shape)
    for fq, bw, amp in formants:
        fc = fq(t) if callable(fq) else fq
        g = g + amp / (1.0 + ((f - fc) / (bw * 0.5)) ** 2)
    return g


# =============================================================================
# Oscillators and noise
# =============================================================================

def white(n, rng):
    return rng.uniform(-1.0, 1.0, n)


def colored(n, rng, slope_db_oct=-3.0, circular=True):
    """Noise with a spectral slope (-3 = pink, -6 = brown)."""
    w = rng.standard_normal(n)
    W = np.fft.rfft(w)
    f = np.maximum(np.fft.rfftfreq(n, 1.0 / SR), 10.0)
    W *= (f / 1000.0) ** (slope_db_oct / 6.02)
    y = np.fft.irfft(W, n)
    return y / (np.max(np.abs(y)) + 1e-9)


def phase_of(freq, n):
    if np.isscalar(freq):
        return TAU * freq * tvec(n)
    return TAU * np.cumsum(freq) / SR


def sine(freq, n, phase0=0.0):
    return np.sin(phase_of(freq, n) + phase0)


_TABLES: dict = {}
TN = 4096


def table(harm_amps: tuple) -> np.ndarray:
    key = tuple(round(a, 5) for a in harm_amps)
    if key in _TABLES:
        return _TABLES[key]
    x = np.arange(TN) / TN
    tb = np.zeros(TN)
    for k, a in enumerate(harm_amps, start=1):
        if a != 0.0:
            tb += a * np.sin(TAU * k * x)
    tb /= (np.max(np.abs(tb)) + 1e-9)
    _TABLES[key] = tb
    return tb


def saw_amps(f0, cutoff=4000.0, max_h=60, order=1.0):
    k = np.arange(1, max_h + 1)
    a = (1.0 / k) * (1.0 / (1.0 + (k * f0 / cutoff) ** (2 * order)))
    a[k * f0 > 16000] = 0
    return tuple(a)


def square_amps(f0, cutoff=4000.0, max_h=60):
    k = np.arange(1, max_h + 1)
    a = np.where(k % 2 == 1, 1.0 / k, 0.0) / (1.0 + (k * f0 / cutoff) ** 2)
    a[k * f0 > 16000] = 0
    return tuple(a)


def wt_osc(tb, freq, n, phase0=0.0):
    ph = (phase_of(freq, n) / TAU + phase0) * TN
    i0 = np.floor(ph).astype(np.int64)
    fr = ph - i0
    i0 %= TN
    return tb[i0] * (1 - fr) + tb[(i0 + 1) % TN] * fr


def vibrato(f0, n, rate=5.2, depth=0.004, delay=0.25, rng=None, jitter=0.0):
    t = tvec(n)
    ramp = np.clip((t - delay) / 0.4, 0, 1)
    v = 1.0 + depth * ramp * np.sin(TAU * rate * t + (rng.uniform(0, TAU) if rng is not None else 0.0))
    if jitter > 0 and rng is not None:
        v *= 1.0 + jitter * random_walk(n, 3.0, rng)
    return f0 * v


def modal(freqs, amps, t60s, dur, rng=None, phase_rand=False):
    """Sum of exponentially decaying sines (modal synthesis)."""
    n = ns(dur)
    t = tvec(n)
    y = np.zeros(n)
    for f, a, d in zip(freqs, amps, t60s):
        if f >= SR * 0.45:
            continue
        ph = rng.uniform(0, TAU) if (rng is not None and phase_rand) else 0.0
        y += a * np.sin(TAU * f * t + ph) * np.exp(-6.91 * t / max(d, 1e-4))
    return y


def click(n_ms: float, rng, lo=2000.0, hi=12000.0):
    n = ns(n_ms / 1000.0)
    x = white(n, rng) * np.exp(-tvec(n) / (n_ms / 4000.0))
    return fft_eq(x, lambda f: H_hp(f, lo, 1) * H_lp(f, hi, 1), pad=0.01)


def grains(dur, rate, rng, make_grain, amp_fn=None, circular=False, start=0.0):
    """Poisson-scattered grains. make_grain(rng) -> mono array."""
    n = ns(dur)
    y = np.zeros(n)
    t = start
    while True:
        t += rng.exponential(1.0 / rate)
        if t >= dur:
            break
        g = make_grain(rng)
        a = amp_fn(t) if amp_fn is not None else 1.0
        mix_at(y, g, int(t * SR), a, wrap=circular)
    return y


# =============================================================================
# Reverb (convolution with a synthetic, frequency-dependent decaying IR)
# =============================================================================

_IR_CACHE: dict = {}


def make_ir(decay=1.8, predelay=0.015, damp=0.5, er=0.5, seed="ir", stereo=True):
    key = (decay, predelay, damp, er, seed, stereo)
    if key in _IR_CACHE:
        return _IR_CACHE[key]
    rng = rng_for("ir:" + seed)
    n = ns(predelay + decay * 1.15 + 0.05)
    t = tvec(n)
    chans = []
    for _ch in range(2 if stereo else 1):
        nz = rng.standard_normal(n)
        X = np.fft.rfft(nz)
        f = np.fft.rfftfreq(n, 1.0 / SR)
        out = np.zeros(n)
        bands = [(0, 350, 1.15), (350, 2000, 1.0), (2000, 6000, 0.75 - 0.35 * damp), (6000, SR / 2, 0.45 - 0.3 * damp)]
        for lo, hi, mult in bands:
            mask = H_hp(f, max(lo, 1.0), 4) if lo > 0 else np.ones_like(f)
            mask = mask * (H_lp(f, hi, 4) if hi < SR / 2 else 1.0)
            b = np.fft.irfft(X * mask, n)
            d = max(decay * mult, 0.05)
            out += b * np.exp(-6.91 * t / d)
        out *= np.clip(t / 0.03, 0, 1)
        p = ns(predelay)
        out = np.concatenate([np.zeros(p), out])[:n]
        # sparse early reflections
        for _k in range(10):
            ti = rng.uniform(0.004, 0.07)
            idx = ns(ti)
            if idx < n:
                out[idx] += rng.uniform(1.0, 3.0) * er * (1.0 - ti / 0.08) * (1 if rng.random() > 0.5 else -1)
        out /= math.sqrt(np.sum(out ** 2)) + 1e-9
        chans.append(out)
    ir = np.stack(chans, axis=1) if stereo else chans[0]
    _IR_CACHE[key] = ir
    return ir


def convolve(x: np.ndarray, h: np.ndarray, circular: bool = False) -> np.ndarray:
    n = len(x)
    if circular:
        m = n
        if len(h) > n:
            h = h[:n]
    else:
        m = 1 << int(math.ceil(math.log2(n + len(h))))
    y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(h, m), m)
    return y if not circular else y[:n]


def reverb(x: np.ndarray, mix: float = 0.25, decay: float = 1.6, predelay: float = 0.015,
           damp: float = 0.5, er: float = 0.5, seed: str = "room", circular: bool = False,
           width: float = 1.0, keep_dry: bool = True) -> np.ndarray:
    """Returns stereo (n_out, 2). Non-circular output includes the tail."""
    ir = make_ir(decay, predelay, damp, er, seed, True)
    if x.ndim == 1:
        src = [x, x]
    else:
        src = [x[:, 0], x[:, 1]]
    wl = convolve(src[0], ir[:, 0], circular)
    wr = convolve(src[1], ir[:, 1], circular)
    if width < 1.0:
        mid = 0.5 * (wl + wr)
        wl = mid + (wl - mid) * width
        wr = mid + (wr - mid) * width
    n_out = len(wl) if not circular else len(x)
    if not circular:
        n_out = len(x) + len(ir)
    wet = np.stack([wl[:n_out], wr[:n_out]], axis=1)
    if not keep_dry:
        return wet * mix
    dry = pad_to(to_stereo(x), n_out)
    return dry + wet * mix


def reverb_mono(x, mix=0.2, decay=1.0, predelay=0.01, damp=0.55, er=0.5, seed="mono"):
    """Mono reverb for one-shots (keeps them positional)."""
    ir = make_ir(decay, predelay, damp, er, seed, False)
    n_out = len(x) + len(ir)
    wet = convolve(x, ir)[:n_out]
    return pad_to(x, n_out) + wet * mix


# =============================================================================
# Dynamics, loudness and output
# =============================================================================

def _kweight(x, circular):
    return fft_eq(x, lambda f: H_hp(f, 60.0, 1) * H_shelf_hi(f, 1600.0, 4.0), circular, pad=0.05)


def loudness(x: np.ndarray, mode: str = "momentary", circular: bool = False) -> float:
    """Approximate LUFS. 'momentary' = loudest 400 ms; 'integrated' = gated mean."""
    chans = [x] if x.ndim == 1 else [x[:, c] for c in range(x.shape[1])]
    ms = None
    w = ns(0.4)
    for c in chans:
        k = _kweight(c, circular) ** 2
        if len(k) < w:
            k = pad_to(k, w)
        cs = np.concatenate([[0.0], np.cumsum(k)])
        m = (cs[w:] - cs[:-w]) / w
        ms = m if ms is None else ms + m
    if mode == "momentary":
        v = float(np.max(ms))
    else:
        lv = 10 * np.log10(ms + 1e-12) - 0.691
        gate = ms[lv > -70.0]
        if len(gate) == 0:
            return -70.0
        mean = float(np.mean(gate))
        rel = ms[(10 * np.log10(ms + 1e-12) - 0.691) > (10 * math.log10(mean + 1e-12) - 0.691 - 10.0)]
        v = float(np.mean(rel)) if len(rel) else mean
    return 10 * math.log10(v + 1e-12) - 0.691


def soft_limit(x: np.ndarray, ceiling_db: float = -1.0, knee: float = 0.75) -> np.ndarray:
    c = db(ceiling_db)
    t = knee * c
    a = np.abs(x)
    over = a > t
    y = x.copy()
    y[over] = np.sign(x[over]) * (t + (c - t) * np.tanh((a[over] - t) / (c - t)))
    return y


def compress(x: np.ndarray, threshold_db=-18.0, ratio=2.0, window=0.05, circular=False) -> np.ndarray:
    """Gentle feed-forward RMS compressor (smoothed, no lookahead artefacts)."""
    mono = x if x.ndim == 1 else np.mean(x, axis=1)
    w = ns(window)
    sq = mono ** 2
    if circular:
        sq = np.concatenate([sq[-w:], sq])
    else:
        sq = np.concatenate([np.zeros(w), sq])
    cs = np.cumsum(sq)
    rms = np.sqrt(np.maximum((cs[w:] - cs[:-w]) / w, 1e-12))
    lvl = 20 * np.log10(rms + 1e-9)
    over = np.maximum(lvl - threshold_db, 0.0)
    gain_db = -over * (1.0 - 1.0 / ratio)
    g = 10 ** (gain_db / 20.0)
    g = fft_eq(g - 1.0, lambda f: H_lp(f, 8.0, 1), circular, pad=0.1) + 1.0
    return x * (g if x.ndim == 1 else g[:, None])


def trim_tail(x: np.ndarray, thresh_db: float = -62.0, min_len: float = 0.03) -> np.ndarray:
    a = np.abs(x) if x.ndim == 1 else np.max(np.abs(x), axis=1)
    peak = np.max(a) + 1e-12
    idx = np.where(a > peak * db(thresh_db))[0]
    end = int(idx[-1]) + ns(0.01) if len(idx) else len(x)
    end = max(end, ns(min_len))
    y = x[:min(end, len(x))]
    return fade(y, 0.0, min(0.015, len(y) / SR * 0.2))


def remove_dc(x, circular=False):
    return fft_eq(x, lambda f: H_hp(f, 22.0, 2), circular, pad=0.05)


def finalize(x: np.ndarray, target: float, mode: str, circular: bool, ceiling: float = -1.0) -> np.ndarray:
    x = remove_dc(x, circular)
    lv = loudness(x, mode, circular)
    x = x * db(target - lv)
    x = soft_limit(x, ceiling)
    return x


def write_ogg(path: str, x: np.ndarray, quality: float) -> None:
    ch = 1 if x.ndim == 1 else x.shape[1]
    data = np.clip(x, -1.0, 1.0).astype("<f4").tobytes()
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(ch),
           "-i", "pipe:0", "-c:a", "libvorbis", "-q:a", str(quality), "-map_metadata", "-1",
           "-fflags", "+bitexact", "-flags:a", "+bitexact", path]
    p = subprocess.run(cmd, input=data, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError("ffmpeg failed for %s: %s" % (path, p.stderr.decode(errors="replace")))


def write_wav(path: str, x: np.ndarray) -> None:
    ch = 1 if x.ndim == 1 else x.shape[1]
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def write_spectrogram(path: str, x: np.ndarray, title: str = "") -> None:
    from PIL import Image, ImageDraw
    mono = x if x.ndim == 1 else np.mean(x, axis=1)
    n_fft, hop = 1024, 256
    if len(mono) < n_fft:
        mono = pad_to(mono, n_fft)
    frames = 1 + (len(mono) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(frames)[:, None]
    S = np.abs(np.fft.rfft(mono[idx] * np.hanning(n_fft), axis=1))
    S = 20 * np.log10(S + 1e-6)
    S = np.clip((S - (S.max() - 80)) / 80.0, 0, 1)
    # log-frequency axis 30 Hz .. 20 kHz, 256 rows
    f = np.fft.rfftfreq(n_fft, 1.0 / SR)
    rows = 256
    fl = np.geomspace(30, 20000, rows)
    bins = np.clip(np.searchsorted(f, fl), 0, len(f) - 1)
    img = S[:, bins].T[::-1]
    width = min(frames, 1600)
    cols = np.linspace(0, frames - 1, width).astype(int)
    img = img[:, cols]
    rgb = np.stack([img ** 0.7, img ** 1.6, 0.25 + 0.75 * img ** 3], axis=2)
    im = Image.fromarray((rgb * 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.text((4, 2), "%s  %.2fs" % (title, len(mono) / SR), fill=(255, 255, 255))
    im.save(path)


# =============================================================================
# Registry
# =============================================================================

REGISTRY: list = []


def asset(name, kind="sfx", variants=1, target=-18.0, quality=4, mode=None, reverb_room=None):
    """Register a generator. kind: sfx (one-shot), loop, music, sting."""
    def deco(fn):
        REGISTRY.append({
            "name": name, "kind": kind, "variants": variants, "fn": fn, "target": target,
            "quality": quality, "mode": mode or ("integrated" if kind in ("loop", "music") else "momentary"),
        })
        return fn
    return deco


# =============================================================================
# Instruments (musical)
# =============================================================================

def ks_pluck(freq, dur, rng, t60=2.5, bright=0.55, pick=0.2):
    """Karplus-Strong plucked string, block-vectorised, resampled to exact pitch."""
    n = ns(dur)
    N = max(int(SR / freq - 0.5), 2)
    f_act = SR / (N + 0.5)
    g = 10 ** (-3.0 * ((N + 0.5) / SR) / max(t60, 0.05))
    exc = rng.uniform(-1, 1, N)
    for _ in range(int(round((1.0 - bright) * 8))):
        exc = 0.5 * (exc + np.roll(exc, 1))
    exc = exc - 0.85 * np.roll(exc, max(1, int(pick * N)))
    exc -= exc.mean()
    exc /= np.max(np.abs(exc)) + 1e-9
    total = n + N + 4
    y = np.zeros(total)
    y[:N] = exc
    y[N] = g * 0.5 * y[0]
    s = N + 1
    while s < total:
        e = min(s + N, total)
        y[s:e] = g * 0.5 * (y[s - N:e - N] + y[s - N - 1:e - N - 1])
        s = e
    pos = np.arange(n) * (freq / f_act)
    return np.interp(pos, np.arange(total), y)


def guitar(freq, dur, rng, vel=1.0, bright=0.5, t60=None):
    if t60 is None:
        t60 = 3.4 if freq < 160 else (2.6 if freq < 330 else 1.8)
    x = ks_pluck(freq, dur, rng, t60=t60, bright=bright * (0.8 + 0.2 * vel), pick=rng.uniform(0.12, 0.24))
    return fade(x, 0.0015, min(0.12, dur * 0.3)) * vel


def bass_pizz(freq, dur, rng, vel=1.0):
    x = ks_pluck(freq, dur, rng, t60=1.5, bright=0.22, pick=0.32)
    x += 0.5 * np.sin(phase_of(freq, len(x))) * np.exp(-tvec(len(x)) / 0.45)
    return fade(x, 0.004, min(0.15, dur * 0.3)) * vel


def music_box(freq, dur, rng, vel=1.0, detune=0.0016):
    t60 = 2.9 * (440.0 / freq) ** 0.45
    parts = [(1.0, 1.0, t60), (1.0 + detune, 0.32, t60 * 0.9), (2.0, 0.05, t60 * 0.45),
             (5.93, 0.2, t60 * 0.15), (13.1, 0.04, 0.05)]
    y = modal([freq * r for r, _, _ in parts], [a for _, a, _ in parts], [d for _, _, d in parts], dur)
    y += pad_to(click(2.5, rng, 3000, 14000), len(y)) * 0.12
    return fade(y, 0.0008, 0.06) * vel


def marimba(freq, dur, rng, vel=1.0, bright=1.0):
    t60 = 1.5 * (300.0 / freq) ** 0.55
    y = modal([freq, freq * 3.98, freq * 9.9], [1.0, 0.26 * bright, 0.06 * bright],
              [t60, t60 * 0.28, t60 * 0.09], dur)
    m = lp(white(ns(0.008), rng), 2200) * np.exp(-tvec(ns(0.008)) / 0.002)
    y += pad_to(m, len(y)) * 0.3
    return fade(y, 0.001, 0.04) * vel


def glock(freq, dur, rng, vel=1.0):
    t60 = 2.0 * (1000.0 / freq) ** 0.4
    y = modal([freq, freq * 2.76, freq * 5.40, freq * 8.93], [1.0, 0.32, 0.12, 0.05],
              [t60, t60 * 0.45, t60 * 0.2, t60 * 0.08], dur)
    y += pad_to(click(1.5, rng, 4000, 15000), len(y)) * 0.08
    return fade(y, 0.0006, 0.05) * vel


def flute(freq, dur, rng, vel=1.0, breath=0.07):
    n = ns(dur + 0.3)
    f = vibrato(freq, n, rate=rng.uniform(4.6, 5.3), depth=0.0055, delay=0.32, rng=rng, jitter=0.0012)
    x = wt_osc(table((1.0, 0.3, 0.11, 0.04, 0.015)), f, n, rng.uniform())
    nz = white(n, rng)
    br = bp(nz, freq, 5.0) * 0.8 + bp(nz, freq * 2.0, 7.0) * 0.35 + hp(nz, 2500, 1) * 0.08
    env = env_adsr(n, 0.08, 0.35, 0.82, 0.13, dur)
    chiff = np.exp(-tvec(n) / 0.03) * hp(nz, 1500, 1) * 0.12
    return (x + br * breath * 4.0 + chiff) * env * vel


def pad_note(freq, dur, rng, bright=1500.0, attack=1.0, release=1.6, voices=4, detune_c=9.0, width=0.7):
    """Detuned wavetable saw pad. Returns stereo."""
    n = ns(dur + release * 3.0)
    tb = table(saw_amps(freq, cutoff=bright, max_h=48, order=1.5))
    out = np.zeros((n, 2))
    for v in range(voices):
        frac = (v - (voices - 1) / 2) / max((voices - 1) / 2, 1)
        cents = frac * detune_c + rng.normal(0, 1.2)
        fv = freq * 2 ** (cents / 1200.0) * (1.0 + 0.0012 * random_walk(n, 0.4, rng))
        out += to_stereo(wt_osc(tb, fv, n, rng.uniform()), frac * width)
    env = env_adsr(n, attack, 1.0, 1.0, release, dur)
    return out * (env / voices)[:, None]


def bowed(freq, dur, rng, vel=1.0, bright=2600.0, attack=0.16, release=0.35, vib=0.0035, ens=True):
    n = ns(dur + release * 3.0)
    f = vibrato(freq, n, rate=rng.uniform(4.8, 5.6), depth=vib, delay=0.22, rng=rng, jitter=0.0012)
    tb = table(saw_amps(freq, cutoff=bright, max_h=56, order=1.2))
    y = wt_osc(tb, f, n, rng.uniform())
    if ens:
        y = 0.65 * y + 0.35 * wt_osc(tb, f * 1.0028, n, rng.uniform())
    env = env_adsr(n, attack, 0.5, 0.86, release, dur)
    bow = hp(white(n, rng), 2500, 1) * 0.025
    return (y + bow) * env * vel


def brass(freq, dur, rng, vel=1.0, attack=0.05, release=0.22, swell=False):
    n = ns(dur + release * 3.0)
    t = tvec(n)
    dark = table(saw_amps(freq, 450.0 + 250 * vel, 48, 1.5))
    brite = table(saw_amps(freq, 1800.0 + 1600 * vel, 56, 1.2))
    f = freq * (1 - 0.01 * np.exp(-t / 0.05))
    f = vibrato(f, n, 5.0, 0.0018, 0.35, rng)
    out = np.zeros(n)
    for k, det in enumerate((1.0, 1.0035, 0.9968)):
        ph = rng.uniform()
        a = wt_osc(dark, f * det, n, ph)
        b = wt_osc(brite, f * det, n, ph)
        if swell:
            m = np.clip(t / max(dur * 0.8, 0.1), 0, 1) ** 1.5
        else:
            m = np.clip(t / (attack * 2.5), 0, 1) * (0.45 + 0.55 * np.exp(-t / 0.35))
        out += (a * (1 - m) + b * m) * (1.0 if k == 0 else 0.6)
    env = env_adsr(n, attack if not swell else dur * 0.7, 0.3, 0.8, release, dur)
    return out * env * vel / 2.2


def sub_bass(freq, dur, rng, vel=1.0, attack=0.02, release=0.3):
    n = ns(dur + release * 3)
    y = np.sin(phase_of(freq, n)) + 0.25 * np.sin(2 * phase_of(freq, n))
    return y * env_adsr(n, attack, 0.4, 0.8, release, dur) * vel


# --- percussion -----------------------------------------------------------------

def kick(rng, vel=1.0, f_hi=105.0, f_lo=46.0, dur=0.6):
    n = ns(dur)
    t = tvec(n)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / 0.035)
    y = np.sin(phase_of(f, n)) * np.exp(-t / 0.26)
    y += pad_to(click(2.0, rng, 1500, 7000), n) * 0.2
    return y * vel


def taiko(rng, f0=70.0, vel=1.0, dur=1.6, stick=0.5):
    n = ns(dur)
    t = tvec(n)
    bend = 1.0 + 0.09 * np.exp(-t / 0.05)
    y = np.zeros(n)
    for r, a, d in ((1.0, 1.0, 1.3), (1.59, 0.45, 0.6), (2.14, 0.32, 0.42), (2.3, 0.22, 0.32), (2.65, 0.14, 0.24)):
        y += a * np.sin(phase_of(f0 * r * bend, n)) * np.exp(-6.91 * t / d)
    s = lp(white(ns(0.04), rng), 1100) * np.exp(-tvec(ns(0.04)) / 0.008)
    y += pad_to(s, n) * stick
    return y * vel


def snare(rng, vel=1.0, dur=0.4):
    n = ns(dur)
    t = tvec(n)
    tone = (np.sin(TAU * 185 * t) * 0.7 + np.sin(TAU * 330 * t) * 0.3) * np.exp(-t / 0.05)
    nz = bp(white(n, rng), 4200, 0.7) * np.exp(-t / 0.11)
    return (tone * 0.6 + nz) * vel


def tom(rng, f0=110.0, vel=1.0, dur=0.8):
    return taiko(rng, f0, vel, dur, stick=0.35)


def hat(rng, vel=1.0, decay=0.035):
    n = ns(decay * 6)
    y = hp(white(n, rng), 7500, 2) * np.exp(-tvec(n) / decay)
    return y * vel


def shaker(rng, vel=1.0):
    n = ns(0.16)
    t = tvec(n)
    e = np.clip(t / 0.012, 0, 1) * np.exp(-np.maximum(t - 0.012, 0) / 0.04)
    return bp(white(n, rng), 6500, 1.1) * e * vel


def woodtick(rng, vel=1.0, f=1250.0):
    y = modal([f, f * 2.36, f * 4.1], [1.0, 0.4, 0.12], [0.05, 0.025, 0.012], 0.09)
    return (y + pad_to(click(1.0, rng, 2000, 9000), len(y)) * 0.2) * vel


def heartbeat(rng, vel=1.0):
    n = ns(0.75)
    t = tvec(n)
    lub = np.sin(phase_of(54 * (1 + 0.2 * np.exp(-t / 0.02)), n)) * env_ad(n, 0.008, 0.075)
    t2 = np.maximum(t - 0.29, 0)
    dub = np.sin(TAU * 47 * t2) * np.where(t > 0.29, np.clip(t2 / 0.008, 0, 1) * np.exp(-t2 / 0.06), 0) * 0.7
    thump = lp(white(n, rng), 300) * (env_ad(n, 0.005, 0.03) + 0.6 * np.where(t > 0.29, np.exp(-t2 / 0.025), 0))
    return (lub + dub + thump * 0.6) * vel


def reverse_swell(dur, rng, lo=250.0, hi=7000.0):
    n = ns(dur)
    x = white(n, rng)
    T = dur
    y = stft_filter(x, lambda t, f: H_lp(f, lo + (hi - lo) * np.clip(t / T, 0, 1) ** 2.5, 2) * H_hp(f, 120, 1))
    e = np.clip(tvec(n) / T, 0, 1) ** 3
    return fade(y * e, 0.0, 0.02)


# =============================================================================
# Arrangement helpers
# =============================================================================

VOICING = {
    "D": [50, 57, 62, 66, 69], "A/C#": [49, 57, 64, 69, 73], "A": [45, 52, 57, 61, 64],
    "Bm": [47, 54, 59, 62, 66], "G": [43, 50, 55, 59, 62], "Em": [40, 47, 52, 55, 59],
    "F#": [42, 49, 54, 58, 61], "C": [48, 55, 60, 64, 67], "Am": [45, 52, 57, 60, 64],
    "D/F#": [42, 57, 62, 66, 69], "F#m": [42, 49, 54, 57, 61],
}


def pad_voicing(ch: str, low: int = 55) -> list:
    """Close-voiced chord tones (one octave above `low`) for pads."""
    v = VOICING[ch]
    pcs = sorted({m % 12 for m in v})
    return sorted(low + (pc - low) % 12 for pc in pcs)


def parse_mel(bars: list, beats_per_bar: int = 4) -> list:
    """['F#4:1 A4:1 D5:2', ...] -> [(beat, dur_beats, midi)]."""
    ev = []
    for b, s in enumerate(bars):
        beat = b * beats_per_bar
        for tok in s.split():
            nm, d = tok.split(":")
            d = float(d)
            if nm != "r":
                ev.append((beat, d, note(nm)))
            beat += d
    return ev


class Mix:
    """Stereo stems on a circular (loop) or linear (sting) timeline."""

    def __init__(self, seconds: float, loop: bool = True, tail: float = 6.0):
        self.loop = loop
        self.L = ns(seconds)
        self.N = self.L if loop else self.L + ns(tail)
        self.stems: dict = {}

    def buf(self, stem: str) -> np.ndarray:
        if stem not in self.stems:
            self.stems[stem] = np.zeros((self.N, 2))
        return self.stems[stem]

    def add(self, stem: str, sig: np.ndarray, t: float, gain: float = 1.0, pan: float = 0.0) -> None:
        mix_at(self.buf(stem), to_stereo(sig, pan), int(round(t * SR)), gain, wrap=self.loop)

    def render(self, fx: dict, rev: dict | None = None) -> np.ndarray:
        out = np.zeros((self.N, 2))
        send = np.zeros((self.N, 2))
        for name, b in self.stems.items():
            o = fx.get(name, {})
            if o.get("eq") is not None:
                b = fft_eq(b, o["eq"], circular=self.loop)
                self.stems[name] = b
            g = self.stem_gain(name, o)
            out += b * g
            send += b * (g * o.get("send", 0.2))
        if rev is not None:
            wet = reverb(send, mix=1.0, circular=self.loop, keep_dry=False, **rev)
            out += pad_to(wet, self.N)
        return out

    def stem_gain(self, name: str, o: dict) -> float:
        """Explicit gain, or a gain that brings the stem to `lu` (approx. LUFS)."""
        if "lu" in o and name in self.stems:
            lv = loudness(self.stems[name], "integrated", self.loop)
            return db(o["lu"] - lv) if lv > -69.0 else 0.0
        return o.get("gain", 1.0)


def hum(rng, ms=7.0):
    return float(rng.normal(0, ms / 1000.0))


def GUITAR_EQ(f):
    return H_peak(f, 105, 1.4, 4.0) * H_peak(f, 230, 1.6, 2.5) * H_peak(f, 2600, 0.8, 1.5) * H_lp(f, 7500, 1) * H_hp(f, 70, 2)


def PAD_EQ(f):
    return H_hp(f, 110, 2) * H_lp(f, 5200, 1) * H_peak(f, 400, 0.8, -2.0)


def STRINGS_EQ(f):
    return H_peak(f, 300, 1.2, 2.5) * H_peak(f, 1100, 1.0, 1.5) * H_peak(f, 2900, 1.5, -2.5) * H_lp(f, 6500, 1) * H_hp(f, 45, 2)


# =============================================================================
# Sound-design building blocks
# =============================================================================

def layer(dur: float, *parts) -> np.ndarray:
    """Sum (signal, start_s, gain) parts into a mono buffer of `dur` seconds."""
    y = np.zeros(ns(dur))
    for sig, t0, g in parts:
        mix_at(y, sig, int(round(t0 * SR)), g)
    return y


def wood_knock(rng, f0=200.0, dur=0.35, bright=1.0, decay=1.0):
    ratios = [1.0, 2.32 + rng.uniform(-0.1, 0.1), 3.95 + rng.uniform(-0.15, 0.15), 5.6 + rng.uniform(-0.2, 0.2), 7.9]
    amps = [1.0, 0.6 * bright, 0.35 * bright, 0.18 * bright, 0.08 * bright]
    t60 = [0.16 * decay, 0.09 * decay, 0.06 * decay, 0.04 * decay, 0.025 * decay]
    return modal([f0 * r for r in ratios], amps, t60, dur)


def stone_knock(rng, f0=1600.0, dur=0.12):
    ratios = [1.0, 1.73 + rng.uniform(-0.05, 0.05), 2.61 + rng.uniform(-0.08, 0.08), 3.9, 5.2]
    y = modal([f0 * r for r in ratios], [1.0, 0.7, 0.45, 0.25, 0.12], [0.045, 0.035, 0.025, 0.018, 0.012], dur)
    return y + pad_to(click(1.2, rng, 2500, 14000), len(y)) * 0.5


def metal_ding(rng, f0=2000.0, dur=0.8, decay=1.0):
    return modal([f0, f0 * 2.41, f0 * 3.95, f0 * 5.6], [1.0, 0.42, 0.22, 0.09],
                 [0.7 * decay, 0.4 * decay, 0.22 * decay, 0.12 * decay], dur)


def noise_burst(rng, dur, lo, hi, attack=0.001, decay=0.02, order=2):
    n = ns(dur)
    x = fft_eq(white(n, rng), lambda f: H_hp(f, lo, order) * H_lp(f, hi, order), pad=0.02)
    return x * env_ad(n, attack, decay)


def crunch(rng, dur, rate, lo=1500.0, hi=7000.0, decay=0.03, attack=0.0):
    def g(r):
        n = ns(r.uniform(0.0006, 0.0028))
        return white(n, r) * np.exp(-tvec(n) / 0.0007)
    def a(t):
        rise = min(t / attack, 1.0) if attack > 0 else 1.0
        return rise * math.exp(-t / decay) * rng.uniform(0.15, 1.0)
    y = grains(dur, rate, rng, g, amp_fn=a)
    return fft_eq(y, lambda f: H_hp(f, lo, 2) * H_lp(f, hi, 1), pad=0.02)


def whoosh(rng, dur, f_lo=350.0, f_hi=1700.0, peak=0.45, q=1.3, shape=1.4):
    n = ns(dur)
    w = math.log(0.5) / math.log(max(min(peak, 0.95), 0.05))

    def bell(u):
        return np.sin(np.pi * np.clip(u, 0, 1) ** w)
    y = stft_filter(white(n, rng), lambda t, f: H_bp(f, f_lo * (f_hi / f_lo) ** bell(t / dur), q),
                    n_fft=1024, hop=256)
    return y * bell(tvec(n) / dur) ** shape


def rustle(rng, dur, rate=180.0, lo=2500.0, hi=9000.0, decay=None):
    def g(r):
        n = ns(r.uniform(0.002, 0.012))
        return white(n, r) * np.hanning(n)
    amp = (lambda t: math.exp(-t / decay) * rng.uniform(0.2, 1.0)) if decay else (lambda t: rng.uniform(0.2, 1.0))
    y = grains(dur, rate, rng, g, amp_fn=amp)
    return fft_eq(y, lambda f: H_hp(f, lo, 2) * H_lp(f, hi, 1), pad=0.02)


def bubble(rng, f0=None, dur=None):
    f0 = f0 or rng.uniform(450, 1400)
    dur = dur or rng.uniform(0.015, 0.05)
    n = ns(dur)
    t = tvec(n)
    f = f0 * (1 + 2.2 * t / dur)
    return np.sin(phase_of(f, n)) * np.exp(-t / (dur * 0.35)) * np.clip(t / 0.002, 0, 1)


def thud(rng, f_hi=90.0, f_lo=45.0, decay=0.12, dur=0.5, noise=0.5, lp_hz=400.0):
    n = ns(dur)
    t = tvec(n)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / 0.03)
    y = np.sin(phase_of(f, n)) * env_ad(n, 0.002, decay)
    y += lp(white(n, rng), lp_hz) * env_ad(n, 0.001, decay * 0.5) * noise
    return y


def creak(rng, dur, rate0, rate1, f0=330.0, env=None, friction=0.15):
    n = ns(dur)
    rate = np.linspace(rate0, rate1, n) * (1 + 0.25 * random_walk(n, 6.0, rng))
    ph = np.cumsum(rate) / SR
    idx = np.where(np.diff(np.floor(ph)) > 0)[0]
    imp = np.zeros(n)
    imp[idx] = rng.uniform(0.35, 1.0, len(idx))
    res = modal([f0, f0 * 2.09, f0 * 3.47, f0 * 5.8], [1.0, 0.7, 0.45, 0.2], [0.07, 0.05, 0.035, 0.02], 0.12)
    y = convolve(imp, res)[:n]
    y += bp(white(n, rng), f0 * 3, 2.0) * friction * np.convolve(imp, np.ones(ns(0.004)) / ns(0.004), "same")
    if env is not None:
        y *= env
    return y


def voice(rng, f0, dur, formants, breath=0.08, rough=0.0, rough_rate=30.0, harm_cut=3500.0,
          jitter=0.0, n_fft=1024):
    """Source-filter voice: saw-like source + noise through moving formants."""
    n = ns(dur)
    f0 = np.full(n, float(f0)) if np.isscalar(f0) else f0[:n]
    if jitter > 0:
        f0 = f0 * (1.0 + jitter * random_walk(n, 14.0, rng))
    src = wt_osc(table(saw_amps(float(np.mean(f0)), harm_cut, 90, 1.0)), f0, n)
    if rough > 0:
        rr = rough_rate * (1.0 + 0.3 * random_walk(n, 3.0, rng))
        src *= 1.0 + rough * np.sin(phase_of(rr, n))
    src = src + breath * white(n, rng) * 2.0
    return stft_filter(src, lambda t, f: formant_gain(t, f, formants), n_fft=n_fft, hop=n_fft // 4)


def lin(t, pts):
    """Vectorised piecewise-linear lookup of (time, value) points (for formant tracks)."""
    return np.interp(t, [p[0] for p in pts], [p[1] for p in pts])


def room(y, mix=0.12, decay=0.7, seed="forest_s"):
    return reverb_mono(y, mix, decay, 0.008, 0.6, 0.6, seed)


# =============================================================================
# One-shot sound effects
# =============================================================================

@asset("chop", variants=3, target=-14.0)
def sfx_chop(rng, v):
    f0 = rng.uniform(150, 200) * (1.0 + 0.09 * v)
    body = wood_knock(rng, f0, 0.45, 0.9, 1.1)
    thump = thud(rng, 120, 70, 0.045, 0.25, 0.4, 600)
    crack = noise_burst(rng, 0.05, 1800, 7500, 0.0004, 0.007)
    crunchy = crunch(rng, 0.14, 1100, 1300, 6000, 0.03)
    chips = grains(0.3, 22, rng, lambda r: wood_knock(r, r.uniform(900, 1900), 0.06, 0.6, 0.18),
                   amp_fn=lambda t: 0.22 * math.exp(-t / 0.08), start=0.012)
    y = layer(0.55, (body, 0, 0.9), (thump, 0, 0.7), (crack, 0, 0.6), (crunchy, 0.002, 0.55), (chips, 0.0, 1.0))
    y = fft_eq(y, lambda f: H_hp(f, 75, 2) * H_peak(f, 2500, 1.0, 2.0), pad=0.05)
    return room(y, 0.13, 0.8)


@asset("tree_fall", target=-12.0)
def sfx_tree_fall(rng, v):
    D = 4.6
    ce = smooth_curve([(0, 0), (0.5, 0.6), (1.1, 1.0), (1.5, 0.7), (1.9, 0.0)], ns(1.9))
    cr = creak(rng, 1.9, 18, 60, rng.uniform(260, 340), ce, 0.25)
    cr2 = creak(rng, 1.4, 30, 85, rng.uniform(480, 560), smooth_curve([(0, 0), (0.6, 0.5), (1.1, 0.6), (1.4, 0)], ns(1.4)), 0.2)
    snap = layer(0.4, (noise_burst(rng, 0.12, 900, 6000, 0.0005, 0.02), 0, 1.0),
                 (wood_knock(rng, 230, 0.3, 1.2, 1.0), 0, 0.8),
                 (crunch(rng, 0.25, 900, 800, 5000, 0.06), 0, 0.6))
    wh = whoosh(rng, 1.5, 180, 1300, 0.8, 0.9, 1.0)
    leaves = rustle(rng, 1.6, 400, 2500, 9000) * smooth_curve([(0, 0), (1.2, 0.8), (1.6, 1.0)], ns(1.6))
    boom = thud(rng, 70, 32, 0.55, 1.6, 0.9, 260)
    debris = grains(1.2, 45, rng, lambda r: wood_knock(r, r.uniform(180, 900), 0.12, 0.8, 0.5),
                    amp_fn=lambda t: 0.5 * math.exp(-t / 0.25))
    settle = rustle(rng, 1.8, 220, 2000, 8000, decay=0.6)
    crash = crunch(rng, 0.6, 700, 500, 5000, 0.18)
    impact = 2.95
    y = layer(D, (cr, 0, 0.55), (cr2, 0.35, 0.3), (snap, 1.65, 0.7), (wh, 1.55, 0.8), (leaves, 1.4, 0.35),
              (boom, impact, 1.25), (debris, impact, 0.8), (crash, impact, 0.6), (settle, impact + 0.05, 0.4))
    return reverb_mono(y, 0.22, 1.6, 0.012, 0.55, 0.5, "forest_l")


@asset("wood_pickup", variants=2, target=-20.0)
def sfx_wood_pickup(rng, v):
    a = wood_knock(rng, rng.uniform(560, 760), 0.15, 1.0, 0.45)
    b = wood_knock(rng, rng.uniform(700, 950), 0.15, 0.9, 0.4)
    r = rustle(rng, 0.12, 300, 2500, 8000, decay=0.05)
    return room(layer(0.3, (a, 0, 1.0), (b, 0.05 + 0.02 * v, 0.6), (r, 0, 0.2)), 0.08, 0.5)


@asset("stone_pickup", variants=2, target=-20.0)
def sfx_stone_pickup(rng, v):
    a = stone_knock(rng, rng.uniform(1300, 1700))
    b = stone_knock(rng, rng.uniform(1700, 2200))
    g = crunch(rng, 0.1, 700, 700, 4000, 0.03)
    return room(layer(0.3, (a, 0, 1.0), (b, 0.06 + 0.015 * v, 0.55), (g, 0.0, 0.35)), 0.08, 0.5)


@asset("pickup", target=-21.0)
def sfx_pickup(rng, v):
    n = ns(0.22)
    t = tvec(n)
    f = 420 * (820 / 420) ** np.clip(t / 0.08, 0, 1)
    b = (np.sin(phase_of(f, n)) + 0.15 * np.sin(2 * phase_of(f, n))) * env_ad(n, 0.004, 0.06)
    s = glock(mtof(note("A6")), 0.4, rng, 1.0)
    return room(layer(0.5, (b, 0, 1.0), (s, 0.055, 0.12)), 0.1, 0.6)


@asset("coin", target=-19.0)
def sfx_coin(rng, v):
    a = metal_ding(rng, mtof(note("B6")), 0.6, 0.8)
    b = metal_ding(rng, mtof(note("E7")), 0.7, 0.9)
    c = click(1.0, rng, 3000, 12000)
    return room(layer(0.8, (c, 0, 0.3), (a, 0, 0.7), (b, 0.075, 0.8)), 0.12, 0.6)


@asset("swing", variants=3, target=-21.0)
def sfx_swing(rng, v):
    d = rng.uniform(0.2, 0.3)
    w = whoosh(rng, d, rng.uniform(300, 420), rng.uniform(1500, 2100), rng.uniform(0.4, 0.55), 1.4, 1.3)
    w2 = whoosh(rng, d * 0.9, 900, 4000, 0.5, 2.0, 2.0) * 0.25
    return layer(d + 0.05, (w, 0, 1.0), (w2, 0.01, 1.0))


@asset("hit", variants=2, target=-16.0)
def sfx_hit(rng, v):
    k = wood_knock(rng, rng.uniform(250, 320), 0.3, 1.2, 0.6)
    t = thud(rng, 140, 90, 0.04, 0.2, 0.4, 900)
    c = noise_burst(rng, 0.03, 1000, 4500, 0.0004, 0.006)
    return room(layer(0.4, (k, 0, 0.8), (t, 0, 0.9), (c, 0, 0.5)), 0.1, 0.6)


@asset("hit_enemy", variants=2, target=-15.0)
def sfx_hit_enemy(rng, v):
    t = thud(rng, 110, 60, 0.07, 0.3, 0.6, 700)
    n = ns(0.25)
    poof = lp(white(n, rng), 1300) * env_ad(n, 0.012, 0.06)
    tick = modal([2500 + 300 * v, 4100], [1.0, 0.3], [0.03, 0.015], 0.05)
    return room(layer(0.4, (t, 0, 1.0), (poof, 0, 0.6), (tick, 0, 0.18)), 0.1, 0.6)


@asset("player_hurt", variants=2, target=-15.0)
def sfx_player_hurt(rng, v):
    d = 0.34
    n = ns(d)
    base = 225 if v == 0 else 195
    f0 = base * (1.0 - 0.28 * np.clip(tvec(n) / 0.25, 0, 1))
    fm = [(640, 160, 1.0), (1190, 200, 0.55), (2390, 260, 0.25), (3300, 300, 0.08)]
    oof = voice(rng, f0, d, fm, breath=0.18, jitter=0.01) * env_adsr(n, 0.015, 0.09, 0.4, 0.06, 0.16)
    t = thud(rng, 100, 70, 0.05, 0.2, 0.5, 700)
    return room(layer(0.45, (t, 0, 0.6), (oof, 0.01, 0.9)), 0.1, 0.5)


@asset("eat", target=-18.0)
def sfx_eat(rng, v):
    parts = []
    for i, t0 in enumerate((0.0, 0.24, 0.46)):
        g = 1.0 - 0.18 * i
        parts.append((crunch(rng, 0.11, 1400, 1300, 6500, 0.035), t0, 0.9 * g))
        parts.append((thud(rng, 170, 120, 0.03, 0.12, 0.3, 900), t0, 0.35 * g))
    n = ns(0.3)
    mmm = voice(rng, 205 * (1 - 0.05 * tvec(n) / 0.3), 0.3, [(260, 120, 1.0), (1000, 300, 0.12), (2200, 400, 0.05)], 0.05)
    parts.append((mmm * env_adsr(n, 0.05, 0.1, 0.6, 0.08, 0.2), 0.72, 0.18))
    return room(layer(1.1, *parts), 0.08, 0.5)


@asset("fire_whoosh", target=-16.0)
def sfx_fire_whoosh(rng, v):
    D = 1.8
    n = ns(D)
    knock = wood_knock(rng, 170, 0.25, 0.8, 0.8)
    roar = stft_filter(white(n, rng), lambda t, f: H_lp(f, 250 + 1500 * np.exp(-((t - 0.45) / 0.35) ** 2), 2) * H_hp(f, 60, 1))
    roar *= env_ad(n, 0.28, 0.5)
    crk = grains(1.4, 70, rng, lambda r: noise_burst(r, 0.004, 1500, 9000, 0.0002, 0.0008),
                 amp_fn=lambda t: math.exp(-t / 0.5) * rng.uniform(0.1, 1.0) ** 2)
    return room(layer(D, (knock, 0, 0.6), (roar, 0.02, 1.1), (crk, 0.08, 0.5)), 0.1, 0.7)


@asset("fire_ignite", target=-16.0)
def sfx_fire_ignite(rng, v):
    D = 2.0
    s_n = ns(0.16)
    strike = fft_eq(white(s_n, rng), lambda f: H_bp(f, 3800, 0.9), pad=0.02)
    strike *= (0.4 + 0.6 * np.abs(random_walk(s_n, 60.0, rng))) * env_ad(s_n, 0.01, 0.07)
    flare = hp(white(ns(0.6), rng), 2800, 2) * env_ad(ns(0.6), 0.01, 0.16)
    n = ns(1.2)
    whoomp = stft_filter(white(n, rng), lambda t, f: H_lp(f, 180 + 900 * np.exp(-((t - 0.25) / 0.25) ** 2), 2))
    whoomp *= env_ad(n, 0.18, 0.35)
    low = thud(rng, 85, 55, 0.18, 0.6, 0.0)
    crk = grains(1.3, 35, rng, lambda r: noise_burst(r, 0.004, 1500, 9000, 0.0002, 0.0008),
                 amp_fn=lambda t: min(t / 0.2, 1) * math.exp(-t / 0.7) * rng.uniform(0.1, 1.0) ** 2)
    return room(layer(D, (strike, 0, 0.7), (flare, 0.1, 0.35), (whoomp, 0.22, 1.0), (low, 0.25, 0.4), (crk, 0.45, 0.6)), 0.1, 0.7)


@asset("fire_out", target=-16.0)
def sfx_fire_out(rng, v):
    D = 2.4
    n = ns(2.1)
    hiss = stft_filter(white(n, rng), lambda t, f: H_bp(f, 6200 - 2800 * np.clip(t / 2.0, 0, 1), 1.2))
    hiss *= env_ad(n, 0.04, 0.55) * (0.6 + 0.4 * np.abs(random_walk(n, 22.0, rng)))
    fuff = lp(white(ns(0.4), rng), 500) * env_ad(ns(0.4), 0.02, 0.1)
    crk = grains(1.2, 9, rng, lambda r: noise_burst(r, 0.005, 1200, 8000, 0.0002, 0.001),
                 amp_fn=lambda t: math.exp(-t / 0.4) * rng.uniform(0.3, 1.0))
    sizzle = crunch(rng, 1.0, 600, 3000, 9000, 0.4) * 0.5
    return room(layer(D, (fuff, 0, 0.8), (hiss, 0.02, 0.9), (sizzle, 0.05, 0.4), (crk, 0.1, 0.5)), 0.12, 0.8)


# --- footsteps ------------------------------------------------------------------

@asset("footstep_grass", variants=4, target=-26.0)
def sfx_step_grass(rng, v):
    a = crunch(rng, 0.09, 1700, 2000, 7000, 0.028)
    b = crunch(rng, 0.07, 1100, 2400, 7500, 0.022)
    r = rustle(rng, 0.12, 260, 3000, 8000, decay=0.04)
    t = thud(rng, 130, 95, 0.025, 0.12, 0.3, 700)
    y = layer(0.2, (t, 0, 0.16), (a, 0.0, 0.8), (b, rng.uniform(0.03, 0.05), 0.5), (r, 0.005, 0.35))
    return fft_eq(y, lambda f: H_hp(f, 110, 2) * H_lp(f, 9000, 1), pad=0.05)


@asset("footstep_dirt", variants=4, target=-26.0)
def sfx_step_dirt(rng, v):
    t = thud(rng, 140, 100, 0.035, 0.15, 0.8, 1300)
    g = crunch(rng, 0.08, 700, 1000, 4500, 0.025)
    g2 = crunch(rng, 0.06, 500, 1200, 5000, 0.02)
    y = layer(0.2, (t, 0, 0.38), (g, 0, 0.6), (g2, rng.uniform(0.03, 0.05), 0.38))
    return fft_eq(y, lambda f: H_hp(f, 100, 2), pad=0.05)


@asset("footstep_stone", variants=4, target=-25.0)
def sfx_step_stone(rng, v):
    k = stone_knock(rng, rng.uniform(1100, 1700), 0.08)
    s = crunch(rng, 0.07, 1300, 2000, 9000, 0.025)
    t = thud(rng, 150, 110, 0.025, 0.1, 0.4, 900)
    y = layer(0.18, (t, 0, 0.25), (k, 0, 0.35), (s, 0.002, 0.6))
    return room(fft_eq(y, lambda f: H_hp(f, 120, 2), pad=0.05), 0.06, 0.4)


@asset("footstep_wood", variants=3, target=-25.0)
def sfx_step_wood(rng, v):
    k = wood_knock(rng, rng.uniform(130, 175), 0.25, 0.7, 0.8)
    board = modal([92 + 8 * v, 210], [1.0, 0.4], [0.12, 0.06], 0.2)
    c = click(1.5, rng, 1500, 7000)
    y = layer(0.28, (k, 0, 0.8), (board, 0, 0.4), (c, 0, 0.2))
    return room(fft_eq(y, lambda f: H_hp(f, 80, 2), pad=0.05), 0.08, 0.5)


@asset("footstep_water", variants=3, target=-25.0)
def sfx_step_water(rng, v):
    n = ns(0.22)
    sp = fft_eq(white(n, rng), lambda f: H_bp(f, 1800, 0.8), pad=0.02) * env_ad(n, 0.006, 0.06)
    sp *= 0.5 + 0.5 * np.abs(random_walk(n, 80.0, rng))
    slosh = lp(white(n, rng), 600) * env_ad(n, 0.01, 0.05)
    parts = [(sp, 0, 0.8), (slosh, 0, 0.6)]
    for _ in range(rng.integers(3, 6)):
        parts.append((bubble(rng), rng.uniform(0.02, 0.15), rng.uniform(0.08, 0.2)))
    return room(layer(0.3, *parts), 0.06, 0.4)


# --- interaction / UI -------------------------------------------------------------

@asset("chest_open", target=-16.0)
def sfx_chest_open(rng, v):
    latch = layer(0.1, (metal_ding(rng, 2300, 0.08, 0.06), 0, 0.5), (click(1.5, rng, 2000, 10000), 0, 0.6))
    ce = smooth_curve([(0, 0), (0.08, 1.0), (0.38, 0.6), (0.45, 0)], ns(0.45))
    cr = creak(rng, 0.45, 38, 20, 420, ce, 0.2)
    lid = wood_knock(rng, 180, 0.3, 0.8, 0.9)
    parts = [(latch, 0, 0.7), (cr, 0.06, 0.5), (lid, 0.5, 0.5)]
    for i, m in enumerate(("D6", "F#6", "A6", "D7")):
        parts.append((glock(mtof(note(m)), 1.0, rng), 0.55 + i * 0.07, 0.22 - 0.02 * i))
    return reverb_mono(layer(2.0, *parts), 0.18, 1.2, 0.01, 0.5, 0.5, "chest")


@asset("craft", target=-17.0)
def sfx_craft(rng, v):
    k1 = wood_knock(rng, 300, 0.2, 1.1, 0.5)
    k2 = wood_knock(rng, 340, 0.2, 1.1, 0.5)
    c1 = marimba(mtof(note("A5")), 0.6, rng)
    c2 = glock(mtof(note("D6")), 0.9, rng)
    c3 = marimba(mtof(note("D6")), 0.6, rng)
    return reverb_mono(layer(1.3, (k1, 0, 0.6), (k2, 0.13, 0.55), (c1, 0.3, 0.35), (c3, 0.42, 0.35), (c2, 0.42, 0.18)), 0.15, 1.0, 0.01, 0.5, 0.5, "craft")


@asset("upgrade", target=-15.0)
def sfx_upgrade(rng, v):
    parts = []
    for i, m in enumerate(("D5", "F#5", "A5", "D6")):
        parts.append((marimba(mtof(note(m)), 0.8, rng), i * 0.075, 0.4))
        parts.append((glock(mtof(note(m) + 12), 1.0, rng), i * 0.075, 0.12))
    parts.append((whoosh(rng, 0.45, 600, 5000, 0.85, 1.5, 1.5), 0.0, 0.25))
    parts.append((glock(mtof(note("A6")), 1.4, rng), 0.36, 0.15))
    return reverb_mono(layer(1.8, *parts), 0.2, 1.3, 0.01, 0.45, 0.5, "craft")


@asset("deny", target=-19.0)
def sfx_deny(rng, v):
    a = marimba(mtof(note("E4")), 0.25, rng, 1.0, 0.4)
    b = marimba(mtof(note("C4")), 0.3, rng, 1.0, 0.4)
    y = layer(0.45, (a, 0, 0.8), (b, 0.12, 0.8))
    return room(lp(y, 2500), 0.08, 0.4)


@asset("ui_click", target=-25.0)
def sfx_ui_click(rng, v):
    tk = woodtick(rng, 1.0, 1150)
    body = modal([310], [1.0], [0.03], 0.05)
    return layer(0.1, (tk, 0, 0.8), (body, 0, 0.35))


@asset("ui_hover", target=-31.0)
def sfx_ui_hover(rng, v):
    return layer(0.06, (modal([1900, 4300], [1.0, 0.2], [0.018, 0.008], 0.05), 0, 1.0))


@asset("ui_open", target=-21.0)
def sfx_ui_open(rng, v):
    a = marimba(mtof(note("D5")), 0.35, rng, 1.0, 0.7)
    b = marimba(mtof(note("A5")), 0.4, rng, 1.0, 0.7)
    w = whoosh(rng, 0.2, 800, 3500, 0.7, 1.2, 1.5)
    return room(layer(0.5, (a, 0, 0.7), (b, 0.06, 0.7), (w, 0, 0.12)), 0.08, 0.5)


@asset("ui_close", target=-22.0)
def sfx_ui_close(rng, v):
    a = marimba(mtof(note("A5")), 0.3, rng, 1.0, 0.6)
    b = marimba(mtof(note("D5")), 0.35, rng, 1.0, 0.6)
    w = whoosh(rng, 0.18, 3000, 800, 0.3, 1.2, 1.5)
    return room(layer(0.45, (a, 0, 0.6), (b, 0.055, 0.6), (w, 0, 0.1)), 0.08, 0.5)


# --- creatures ----------------------------------------------------------------------

@asset("stalker_hiss", variants=2, target=-15.0)
def sfx_stalker_hiss(rng, v):
    D = 1.5 + 0.2 * v
    n = ns(D)
    t = tvec(n)
    trem = 1.0 - 0.45 * (0.5 + 0.5 * np.sin(phase_of(11 + 3 * random_walk(n, 2.0, rng), n)))
    env = smooth_curve([(0, 0), (0.35, 1.0), (D * 0.7, 0.8), (D, 0)], n)
    nz = stft_filter(white(n, rng), lambda tt, f: formant_gain(tt, f, [(3400, 1800, 1.0), (6000, 2500, 0.7), (1700, 900, 0.3)]))
    f0 = (120 + 15 * v) * (1 + 0.05 * random_walk(n, 2.0, rng))
    rasp = voice(rng, f0, D, [(700, 300, 1.0), (1800, 500, 0.6), (3000, 700, 0.3)], breath=0.4, rough=0.6, rough_rate=34, jitter=0.03)
    y = (nz * 1.0 + rasp * 0.35) * trem * env
    return reverb_mono(y, 0.25, 1.4, 0.02, 0.6, 0.4, "night")


@asset("stalker_attack", target=-13.0)
def sfx_stalker_attack(rng, v):
    D = 0.9
    lunge = whoosh(rng, 0.35, 250, 1600, 0.7, 1.0, 1.2)
    n = ns(0.45)
    f0 = 165 * (1 + 0.15 * np.sin(np.pi * tvec(n) / 0.45))
    snarl = voice(rng, f0, 0.45, [(lambda tt: lin(tt, [(0, 500), (0.15, 850), (0.45, 600)]), 300, 1.0), (1500, 500, 0.6), (2800, 700, 0.3)],
                  breath=0.6, rough=0.9, rough_rate=42, jitter=0.06) * env_adsr(n, 0.02, 0.15, 0.6, 0.08, 0.3)
    swipe = whoosh(rng, 0.16, 1200, 6000, 0.4, 1.6, 2.0)
    return reverb_mono(layer(D, (lunge, 0, 0.7), (snarl, 0.12, 1.0), (swipe, 0.32, 0.6)), 0.15, 1.0, 0.01, 0.6, 0.4, "night")


VOWELS = {
    "a": (750, 1200, 2500), "e": (480, 1900, 2600), "i": (320, 2300, 3000),
    "o": (500, 900, 2400), "u": (350, 800, 2300),
}


@asset("watcher_whisper", variants=2, target=-17.0)
def sfx_watcher_whisper(rng, v):
    D = 2.4
    n = ns(D)
    y = np.zeros(n)
    t = 0.05
    while t < D - 0.25:
        syl = rng.uniform(0.09, 0.2)
        vow = VOWELS[rng.choice(list(VOWELS))]
        sn = ns(syl)
        fm = [(vow[0], 220, 1.0), (vow[1], 300, 0.7), (vow[2], 400, 0.35)]
        s = stft_filter(white(sn, rng), lambda tt, f: formant_gain(tt, f, fm), n_fft=512, hop=128)
        s *= np.sin(np.pi * np.clip(tvec(sn) / syl, 0, 1)) ** 1.5
        mix_at(y, s, ns(t), rng.uniform(0.5, 1.0))
        if rng.random() < 0.45:
            cn = ns(rng.uniform(0.05, 0.12))
            c = hp(white(cn, rng), rng.choice([3800, 5200]), 2) * np.hanning(cn)
            mix_at(y, c, ns(t + syl * 0.8), rng.uniform(0.3, 0.6))
        t += syl + rng.uniform(0.02, 0.12)
    slow = np.interp(np.arange(n) * 0.82, np.arange(n), y) * 0.45
    y = (y + slow) * smooth_curve([(0, 0.4), (0.4, 1.0), (D - 0.4, 0.9), (D, 0.0)], n)
    return reverb_mono(y, 0.45, 2.2, 0.03, 0.6, 0.3, "night")


@asset("wolf_growl", target=-15.0)
def sfx_wolf_growl(rng, v):
    D = 1.5
    n = ns(D)
    f0 = 92 * (1 + 0.12 * random_walk(n, 5.0, rng)) * (1 + 0.1 * np.sin(np.pi * tvec(n) / D))
    fm = [(lambda tt: lin(tt, [(0, 380), (0.5, 520), (1.5, 420)]), 220, 1.0), (950, 300, 0.7), (2300, 500, 0.3), (3400, 600, 0.12)]
    g = voice(rng, f0, D, fm, breath=0.3, rough=0.85, rough_rate=28, jitter=0.04)
    env = smooth_curve([(0, 0), (0.2, 0.9), (0.6, 0.7), (0.9, 1.0), (1.3, 0.6), (D, 0)], n)
    return reverb_mono(g * env, 0.15, 1.0, 0.01, 0.6, 0.4, "forest_s")


@asset("wolf_howl", variants=2, target=-13.0)
def sfx_wolf_howl(rng, v):
    D = 3.3 + 0.4 * v
    n = ns(D)
    base = 360 + 40 * v
    pts = [(0, base), (0.55, base * 1.65), (D * 0.62, base * 1.75), (D * 0.85, base * 1.45), (D, base * 1.15)]
    f0 = smooth_curve(pts, n)
    f0 = f0 * (1 + 0.012 * np.clip((tvec(n) - 0.7) / 0.5, 0, 1) * np.sin(TAU * 5.4 * tvec(n)))
    f1 = lambda tt: lin(tt, [(0, 320), (0.6, 650), (D * 0.6, 700), (D, 360)])
    f2 = lambda tt: lin(tt, [(0, 780), (0.6, 1150), (D * 0.6, 1200), (D, 800)])
    fm = [(f1, 260, 1.0), (f2, 350, 0.55), (2600, 500, 0.12)]
    src_cut = 2600.0
    h = voice(rng, f0, D, fm, breath=0.05, harm_cut=src_cut, jitter=0.004)
    pure = np.sin(phase_of(f0, n)) * 0.6
    env = smooth_curve([(0, 0), (0.35, 0.8), (1.0, 1.0), (D * 0.8, 0.85), (D, 0)], n)
    y = (h + pure) * env
    return reverb_mono(y, 0.5, 2.8, 0.04, 0.55, 0.3, "valley")


@asset("wolf_bark", variants=2, target=-14.0)
def sfx_wolf_bark(rng, v):
    D = 0.3
    n = ns(D)
    f0 = (520 + 50 * v) * (0.62 + 0.38 * np.exp(-tvec(n) / 0.06))
    b = voice(rng, f0, D, [(720, 260, 1.0), (1250, 350, 0.7), (2600, 500, 0.3)], breath=0.35, rough=0.4, rough_rate=60, jitter=0.03)
    b *= env_ad(n, 0.008, 0.07)
    nz = noise_burst(rng, 0.05, 500, 3000, 0.002, 0.015)
    return reverb_mono(layer(D, (b, 0, 1.0), (nz, 0, 0.4)), 0.25, 1.4, 0.02, 0.6, 0.4, "forest_s")


@asset("bunny_squeak", target=-20.0)
def sfx_bunny_squeak(rng, v):
    parts = []
    for i, t0 in enumerate((0.0, 0.13)):
        d = 0.07
        n = ns(d)
        tt = tvec(n)
        f = (2300 + 200 * i) * (1 + 0.25 * np.sin(np.pi * tt / d))
        s = (np.sin(phase_of(f, n)) + 0.15 * np.sin(2 * phase_of(f, n))) * np.sin(np.pi * tt / d) ** 2
        parts.append((s, t0, 1.0 - 0.3 * i))
    return room(layer(0.3, *parts), 0.08, 0.4)


@asset("boss_roar", target=-10.0)
def sfx_boss_roar(rng, v):
    D = 3.0
    n = ns(D)
    tt = tvec(n)
    env = smooth_curve([(0, 0), (0.25, 0.8), (0.6, 1.0), (2.1, 0.9), (D, 0)], n)
    f1 = lambda t: lin(t, [(0, 380), (0.5, 760), (2.0, 700), (D, 450)])
    fm = [(f1, 300, 1.0), (lambda t: lin(t, [(0, 900), (0.5, 1250), (D, 950)]), 400, 0.7), (2400, 600, 0.35), (3500, 800, 0.15)]
    y = np.zeros(n)
    for base, g, rr in ((52, 1.0, 26), (69, 0.8, 31), (93, 0.6, 37)):
        f0 = base * (1 + 0.08 * random_walk(n, 4.0, rng)) * (1 + 0.15 * np.sin(np.pi * np.clip(tt / D, 0, 1)))
        y += voice(rng, f0, D, fm, breath=0.35, rough=0.9, rough_rate=rr, jitter=0.05, n_fft=2048) * g
    roar_n = stft_filter(white(n, rng), lambda t, f: H_lp(f, 900 + 1400 * np.exp(-((t - 0.8) / 0.7) ** 2), 2) * H_hp(f, 80, 1))
    sub = np.sin(phase_of(36 * (1 + 0.1 * random_walk(n, 2.0, rng)), n))
    y = np.tanh((y * 0.6 + roar_n * 0.35 + sub * 0.4) * env * 1.6)
    y = fft_eq(y, lambda f: H_shelf_lo(f, 160, 7.0) * H_hp(f, 28, 2), pad=0.1)
    return reverb_mono(y, 0.35, 2.4, 0.03, 0.55, 0.4, "valley")


@asset("boss_sprint", target=-12.0)
def sfx_boss_sprint(rng, v):
    D = 2.2
    parts = []
    t = 0.0
    gap = 0.27
    i = 0
    while t < 1.75:
        parts.append((thud(rng, 75, 38, 0.16, 0.6, 1.0, 350), t, 0.9 + 0.1 * (i % 2)))
        parts.append((crunch(rng, 0.2, 500, 600, 4000, 0.05), t, 0.4))
        t += gap
        gap = max(0.17, gap * 0.93)
        i += 1
    rumble = lp(white(ns(D), rng), 140) * smooth_curve([(0, 0.2), (1.0, 1.0), (D, 0)], ns(D))
    parts.append((rumble, 0, 0.5))
    pant = voice(rng, 70.0, 1.2, [(600, 400, 1.0), (1500, 600, 0.5)], breath=1.0, rough=0.5, rough_rate=22, jitter=0.05)
    parts.append((pant * smooth_curve([(0, 0), (0.3, 1), (1.2, 0)], ns(1.2)), 0.6, 0.25))
    return reverb_mono(layer(D, *parts), 0.2, 1.6, 0.02, 0.6, 0.4, "valley")


@asset("boss_pant", target=-15.0)
def sfx_boss_pant(rng, v):
    D = 2.4
    parts = []
    t = 0.0
    for i in range(3):
        ex = 0.36
        n = ns(ex)
        e = voice(rng, 62.0 + 4 * i, ex, [(550, 450, 1.0), (1400, 700, 0.6), (2600, 900, 0.25)], breath=1.4, rough=0.6, rough_rate=24, jitter=0.06)
        e *= np.sin(np.pi * tvec(n) / ex) ** 1.2
        inh = ns(0.26)
        ih = stft_filter(white(inh, rng), lambda tt, f: formant_gain(tt, f, [(1800, 1200, 1.0), (3500, 1500, 0.5)]))
        ih *= np.sin(np.pi * tvec(inh) / 0.26) ** 2
        parts.append((e, t, 1.0))
        parts.append((ih, t + ex + 0.05, 0.35))
        t += ex + 0.38
    return reverb_mono(layer(D, *parts), 0.18, 1.2, 0.015, 0.6, 0.4, "night")


# --- weapons / tools ------------------------------------------------------------------

def _shot(rng, size=1.0, echoes=((0.19, 0.25),)):
    D = 2.2 + 0.6 * size
    crack = noise_burst(rng, 0.03, 800, 12000, 0.0002, 0.004 * size)
    body = lp(white(ns(0.12), rng), 900) * env_ad(ns(0.12), 0.0008, 0.025 * size)
    boom = thud(rng, 120, 55, 0.11 * size, 0.5, 0.3, 300)
    y = layer(0.6, (crack, 0, 1.0), (body, 0, 0.9), (boom, 0, 0.9 * size))
    y = soft_limit(y / (np.max(np.abs(y)) + 1e-9), -1.0)
    out = np.zeros(ns(D))
    mix_at(out, y, 0)
    for dt, g in echoes:
        mix_at(out, lp(y, 1600), ns(dt), g)
    return reverb_mono(out, 0.3, 1.8 * size, 0.02, 0.6, 0.5, "valley")


@asset("gunshot", target=-12.0)
def sfx_gunshot(rng, v):
    return _shot(rng, 0.9, ((0.21, 0.22),))


@asset("rifle_shot", target=-11.0)
def sfx_rifle_shot(rng, v):
    return _shot(rng, 1.3, ((0.26, 0.28), (0.58, 0.14)))


@asset("click_empty", target=-23.0)
def sfx_click_empty(rng, v):
    a = modal([3200, 5100, 7300], [1.0, 0.5, 0.2], [0.012, 0.008, 0.005], 0.03)
    return layer(0.12, (a, 0, 1.0), (a, 0.05, 0.5), (click(1.0, rng), 0, 0.3))


@asset("flashlight_on", target=-23.0)
def sfx_flashlight_on(rng, v):
    a = modal([2400, 4100], [1.0, 0.3], [0.012, 0.006], 0.03)
    b = modal([1300, 2900], [1.0, 0.4], [0.03, 0.015], 0.05)
    return layer(0.1, (a, 0, 0.7), (b, 0.012, 0.9), (click(0.8, rng), 0, 0.3))


@asset("flashlight_off", target=-24.0)
def sfx_flashlight_off(rng, v):
    a = modal([1900, 3600], [1.0, 0.3], [0.012, 0.006], 0.03)
    b = modal([1050, 2500], [1.0, 0.4], [0.03, 0.015], 0.05)
    return layer(0.1, (a, 0, 0.7), (b, 0.014, 0.9), (click(0.8, rng), 0, 0.3))


# --- world ---------------------------------------------------------------------------------

@asset("splash", target=-15.0)
def sfx_splash(rng, v):
    D = 1.4
    slap = noise_burst(rng, 0.06, 200, 3000, 0.001, 0.015)
    n = ns(0.6)
    body = fft_eq(white(n, rng), lambda f: H_bp(f, 1300, 0.6), pad=0.02) * env_ad(n, 0.01, 0.16)
    body *= 0.5 + 0.5 * np.abs(random_walk(n, 60.0, rng))
    low = lp(white(n, rng), 450) * env_ad(n, 0.01, 0.12)
    parts = [(slap, 0, 0.8), (body, 0.005, 0.9), (low, 0, 0.7)]
    for _ in range(14):
        parts.append((bubble(rng), rng.uniform(0.02, 0.4), rng.uniform(0.05, 0.18)))
    for _ in range(8):
        parts.append((bubble(rng, rng.uniform(1800, 3200), 0.02), rng.uniform(0.35, 1.1), rng.uniform(0.03, 0.08)))
    return room(layer(D, *parts), 0.12, 0.8)


@asset("thunder", variants=2, target=-12.0, quality=3)
def sfx_thunder(rng, v):
    D = 6.5 if v == 0 else 7.5
    n = ns(D)
    out = np.zeros((n, 2))
    for ch in range(2):
        r = rng_for("thunder%d%d" % (v, ch))
        rum = colored(n, r, -6.0)
        rolls = np.zeros(n)
        for _ in range(7):
            c = r.uniform(0.2, D * 0.75)
            w = r.uniform(0.3, 1.2)
            rolls += r.uniform(0.4, 1.0) * np.exp(-((tvec(n) - c) / w) ** 2)
        env = smooth_curve([(0, 0), (0.15 if v == 0 else 0.8, 1.0), (D * 0.5, 0.6), (D, 0)], n)
        y = lp(rum, 260 if v == 0 else 170, 2) * (0.5 + rolls) * env
        if v == 0:
            cr = crunch(r, 0.8, 2500, 300, 6000, 0.18) + pad_to(noise_burst(r, 0.5, 100, 5000, 0.002, 0.12), ns(0.8))
            y[:len(cr)] += cr * 0.6
        out[:, ch] = y
    return reverb(out, 0.3, 3.0, 0.03, 0.6, 0.3, "valley")


@asset("cook_sizzle", target=-19.0)
def sfx_cook_sizzle(rng, v):
    D = 1.6
    n = ns(D)
    s = crunch(rng, D, 3000, 3000, 10000, 0.6, attack=0.04)
    hiss = hp(white(n, rng), 4000, 2) * env_ad(n, 0.05, 0.5) * 0.2
    pops = grains(D, 5, rng, lambda r: noise_burst(r, 0.006, 900, 6000, 0.0003, 0.0015), amp_fn=lambda t: math.exp(-t / 0.7))
    return room(s + hiss + pops * 0.7, 0.06, 0.5)


@asset("death", target=-15.0)
def sfx_death(rng, v):
    D = 2.4
    n = ns(D)
    t = thud(rng, 85, 45, 0.18, 0.7, 0.8, 300)
    f = mtof(note("A4")) * (mtof(note("D4")) / mtof(note("A4"))) ** np.clip(tvec(n) / 1.4, 0, 1)
    tone = (np.sin(phase_of(f, n)) + 0.3 * np.sin(2 * phase_of(f, n)) + 0.1 * np.sin(3 * phase_of(f, n)))
    tone = lp(tone, 1800) * env_adsr(n, 0.08, 0.6, 0.5, 0.5, 1.4)
    w = whoosh(rng, 0.8, 1500, 300, 0.2, 1.0, 1.2)
    return reverb_mono(layer(D, (t, 0, 0.8), (w, 0, 0.3), (tone, 0.05, 0.5)), 0.3, 2.0, 0.02, 0.5, 0.4, "night")


@asset("tame", target=-16.0)
def sfx_tame(rng, v):
    n = ns(0.12)
    yip = voice(rng, 720 * (1 + 0.25 * np.sin(np.pi * tvec(n) / 0.12)), 0.12, [(900, 300, 1.0), (1700, 400, 0.6), (3000, 600, 0.2)], 0.15)
    yip *= np.sin(np.pi * tvec(n) / 0.12) ** 1.5
    parts = [(yip, 0, 0.6)]
    for i, m in enumerate(("D5", "F#5", "A5", "D6")):
        parts.append((marimba(mtof(note(m)), 0.7, rng), 0.18 + i * 0.09, 0.4))
        parts.append((glock(mtof(note(m) + 12), 1.0, rng), 0.18 + i * 0.09, 0.1))
    return reverb_mono(layer(1.6, *parts), 0.18, 1.2, 0.01, 0.5, 0.5, "craft")


@asset("trade", target=-17.0)
def sfx_trade(rng, v):
    parts = []
    t = 0.0
    for i in range(4):
        parts.append((metal_ding(rng, rng.uniform(1900, 3100), 0.4, 0.45), t, rng.uniform(0.35, 0.6)))
        t += rng.uniform(0.035, 0.07)
    parts.append((marimba(mtof(note("A5")), 0.6, rng), 0.3, 0.4))
    parts.append((marimba(mtof(note("D6")), 0.7, rng), 0.42, 0.45))
    parts.append((glock(mtof(note("D7")), 0.9, rng), 0.42, 0.08))
    return reverb_mono(layer(1.3, *parts), 0.15, 1.0, 0.01, 0.5, 0.5, "craft")


# --- ambience one-shots (birds, owls, twigs) ------------------------------------------------

def _chirp(f_start, f_end, dur, harm=0.08, fm_rate=0.0, fm_depth=0.0):
    n = ns(dur)
    t = tvec(n)
    f = f_start * (f_end / f_start) ** (t / dur)
    if fm_rate > 0:
        f = f * (1 + fm_depth * np.sin(TAU * fm_rate * t))
    ph = phase_of(f, n)
    return (np.sin(ph) + harm * np.sin(2 * ph)) * np.sin(np.pi * t / dur) ** 1.5


@asset("amb_bird", variants=6, target=-22.0)
def sfx_bird(rng, v):
    parts = []
    if v == 0:  # "fee-bee" whistle
        parts = [(_chirp(3950, 3850, 0.26), 0, 1.0), (_chirp(3350, 3200, 0.32), 0.33, 0.9)]
        if rng.random() < 0.7:
            parts += [(_chirp(3950, 3850, 0.24), 0.95, 0.8), (_chirp(3350, 3200, 0.3), 1.26, 0.7)]
    elif v == 1:  # trill
        t = 0.0
        for i in range(16):
            parts.append((_chirp(5200 - i * 40, 3800, 0.04), t, 0.6 + 0.4 * math.sin(math.pi * i / 16)))
            t += 1 / 17.0
    elif v == 2:  # robin-like phrases
        t = 0.0
        for i in range(7):
            a = rng.uniform(2200, 3600)
            b = a * rng.uniform(0.8, 1.25)
            d = rng.uniform(0.08, 0.16)
            parts.append((_chirp(a, b, d, 0.1, 42, 0.03), t, rng.uniform(0.6, 1.0)))
            t += d + rng.uniform(0.04, 0.09)
    elif v == 3:  # warbler buzzy rise
        t = 0.0
        for i in range(5):
            d = 0.12
            parts.append((_chirp(3800 + i * 220, 4300 + i * 220, d, 0.05, 110, 0.12), t, 0.7))
            t += d + 0.03
        parts.append((_chirp(6200, 5200, 0.12), t, 0.8))
    elif v == 4:  # soft dove coo
        for t0, a, b, d in ((0, 520, 610, 0.25), (0.32, 640, 590, 0.42), (0.85, 560, 520, 0.38)):
            n = ns(d)
            c = _chirp(a, b, d, 0.25) * 0.8 + white(n, rng) * 0.02
            parts.append((lp(c, 1500), t0, 1.0))
    else:  # sparrow chips
        t = 0.0
        for i in range(rng.integers(4, 7)):
            parts.append((_chirp(rng.uniform(4200, 6000), rng.uniform(3000, 4000), 0.035), t, rng.uniform(0.6, 1.0)))
            t += rng.uniform(0.08, 0.16)
    y = layer(2.0, *parts)
    return reverb_mono(trim_tail(y, -50), 0.25, 1.4, 0.02, 0.5, 0.3, "forest_l")


@asset("amb_owl", variants=2, target=-20.0)
def sfx_owl(rng, v):
    parts = []
    pattern = ((0, 0.42, 1.0), (0.75, 0.16, 0.7), (0.98, 0.16, 0.75), (1.25, 0.6, 0.9)) if v == 0 else ((0, 0.5, 1.0), (0.9, 0.7, 0.85))
    base = 330 if v == 0 else 360
    for t0, d, g in pattern:
        n = ns(d)
        tt = tvec(n)
        f = base * (1.04 - 0.08 * tt / d)
        h = (np.sin(phase_of(f, n)) + 0.18 * np.sin(2 * phase_of(f, n)) + 0.05 * np.sin(3 * phase_of(f, n)))
        br = bp(white(n, rng), base, 3.0) * 0.4
        e = np.clip(tt / 0.06, 0, 1) * np.clip((d - tt) / (d * 0.5), 0, 1) ** 1.2
        parts.append(((h + br) * e, t0, g))
    y = layer(2.4, *parts)
    return reverb_mono(y, 0.45, 2.6, 0.04, 0.6, 0.3, "valley")


@asset("amb_twig", variants=2, target=-18.0)
def sfx_twig(rng, v):
    snap = noise_burst(rng, 0.03, 1200, 7000, 0.0002, 0.004)
    k = wood_knock(rng, rng.uniform(1300, 1800), 0.06, 0.8, 0.12)
    parts = [(snap, 0, 1.0), (k, 0, 0.5)]
    for _ in range(rng.integers(2, 4)):
        parts.append((noise_burst(rng, 0.01, 1500, 6000, 0.0002, 0.002), rng.uniform(0.02, 0.09), rng.uniform(0.2, 0.5)))
    parts.append((rustle(rng, 0.3, 150, 2500, 8000, decay=0.1), 0.01, 0.3))
    return reverb_mono(layer(0.5, *parts), 0.3, 1.6, 0.02, 0.6, 0.4, "night")


@asset("amb_woodpecker", target=-20.0)
def sfx_woodpecker(rng, v):
    parts = []
    for i in range(15):
        parts.append((wood_knock(rng, 680 + rng.uniform(-20, 20), 0.05, 0.8, 0.12), i / 16.5, 1.0 - 0.035 * i))
    return reverb_mono(layer(1.2, *parts), 0.3, 1.8, 0.03, 0.5, 0.3, "forest_l")


# =============================================================================
# Loops (seamless: rendered on a circular timeline)
# =============================================================================

def unit(curve):
    """Map a [-1, 1] curve to [0, 1]."""
    return 0.5 + 0.5 * curve


def fire_crackle_grain(r):
    n = ns(r.uniform(0.0006, 0.004))
    g = white(n, r) * np.exp(-tvec(n) / r.uniform(0.0004, 0.0012))
    return fft_eq(g, lambda f: H_bp(f, r.uniform(1800, 6500), 0.9), pad=0.005)


@asset("campfire", kind="loop", target=-20.0)
def loop_campfire(rng, v):
    L = 20.0
    n = ns(L)
    roar = fft_eq(colored(n, rng, -4.5), lambda f: H_lp(f, 650, 2) * H_hp(f, 90, 1), circular=True)
    roar *= 0.62 + 0.38 * random_walk(n, 1.6, rng, circular=True)
    flame = fft_eq(white(n, rng), lambda f: H_bp(f, 1100, 0.7), circular=True)
    flame *= 0.5 + 0.5 * random_walk(n, 0.6, rng, circular=True)
    cluster = np.clip(unit(random_walk(n, 0.9, rng, circular=True)) ** 2.2 * 1.6, 0.05, 1.0)
    crk = grains(L, 46, rng, fire_crackle_grain, circular=True,
                 amp_fn=lambda t: cluster[min(int(t * SR), n - 1)] * min(rng.pareto(2.4) * 0.25, 1.0))

    def pop(r):
        return layer(0.12, (noise_burst(r, 0.012, 700, 8000, 0.0002, 0.0025), 0, 1.0),
                     (wood_knock(r, r.uniform(900, 2400), 0.08, 0.9, 0.14), 0, 0.45))
    pops = grains(L, 0.8, rng, pop, circular=True, amp_fn=lambda t: rng.uniform(0.3, 1.0))
    sap = fft_eq(white(n, rng), lambda f: H_bp(f, 5200, 2.0), circular=True)
    sap *= np.clip(random_walk(n, 0.25, rng, circular=True) * 2.0 - 0.9, 0, 1) ** 2
    return roar * 0.6 + flame * 0.12 + crk * 0.55 + pops * 0.5 + sap * 0.08


@asset("stream", kind="loop", target=-21.0)
def loop_stream(rng, v):
    L = 16.0
    n = ns(L)
    flow = fft_eq(colored(n, rng, -3.0), lambda f: H_bp(f, 520, 0.6) * H_lp(f, 2500, 1), circular=True)
    flow *= 0.7 + 0.3 * random_walk(n, 0.8, rng, circular=True)
    babble = fft_eq(white(n, rng), lambda f: H_bp(f, 1600, 1.2), circular=True)
    babble *= unit(random_walk(n, 9.0, rng, circular=True)) ** 3
    bub = grains(L, 85, rng, lambda r: bubble(r), circular=True, amp_fn=lambda t: rng.uniform(0.05, 0.6) ** 1.5)
    glug = grains(L, 7, rng, lambda r: bubble(r, r.uniform(160, 420), r.uniform(0.04, 0.09)), circular=True,
                  amp_fn=lambda t: rng.uniform(0.2, 0.7))
    trickle = fft_eq(grains(L, 300, rng, lambda r: white(ns(0.002), r) * np.hanning(ns(0.002)), circular=True,
                            amp_fn=lambda t: rng.uniform(0, 1) ** 2), lambda f: H_bp(f, 4500, 1.0), circular=True)
    return flow * 0.5 + babble * 0.18 + bub * 0.35 + glug * 0.25 + trickle * 0.15


@asset("rain", kind="loop", target=-21.0, quality=3)
def loop_rain(rng, v):
    L = 20.0
    n = ns(L)
    out = np.zeros((n, 2))

    def drop(r):
        if r.random() < 0.6:
            m = ns(r.uniform(0.0005, 0.002))
            return white(m, r) * np.exp(-tvec(m) / 0.0005)
        f = r.uniform(1500, 4800)
        m = ns(0.006)
        return np.sin(TAU * f * tvec(m)) * np.exp(-tvec(m) / 0.0015)
    for ch in range(2):
        r = rng_for("rain%d" % ch)
        patter = grains(L, 1900, r, drop, circular=True, amp_fn=lambda t: r.uniform(0.02, 1.0) ** 2)
        patter = fft_eq(patter, lambda f: H_hp(f, 500, 1) * H_lp(f, 3200, 2) * H_peak(f, 1800, 0.8, 2.0), circular=True)
        bed = fft_eq(colored(n, r, -3.0), lambda f: H_hp(f, 250, 1) * H_lp(f, 3800, 2), circular=True)
        bed *= 0.85 + 0.15 * random_walk(n, 0.3, r, circular=True)
        plops = grains(L, 9, r, lambda q: bubble(q, q.uniform(500, 1500), q.uniform(0.01, 0.03)), circular=True,
                       amp_fn=lambda t: r.uniform(0.1, 0.5))
        out[:, ch] = patter * 0.6 + bed * 0.22 + plops * 0.25
    return out


@asset("wind", kind="loop", target=-23.0, quality=3)
def loop_wind(rng, v):
    L = 30.0
    n = ns(L)
    gust = unit(random_walk(n, 0.11, rng, circular=True)) ** 1.4
    center = unit(random_walk(n, 0.06, rng, circular=True))
    whistle_f = unit(random_walk(n, 0.05, rng, circular=True))
    hop = 512
    times = None
    out = np.zeros((n, 2))
    for ch in range(2):
        r = rng_for("wind%d" % ch)
        src = colored(n, r, -4.0)

        def g(t, f, center=center, whistle_f=whistle_f):
            idx = np.clip((t * SR).astype(int), 0, n - 1)
            fc = 220 + 650 * center[idx]
            wf = 650 + 450 * whistle_f[idx]
            gs = gust[idx]
            return H_bp(f, fc, 0.6) + 0.35 * H_bp(f, wf, 14.0) * gs ** 2
        y = stft_filter(src, g, n_fft=2048, hop=hop, circular=True)
        y *= 0.35 + 0.65 * gust
        leaves = rustle(r, L, 260, 2500, 9000)
        leaves = pad_to(leaves, n) * (gust ** 2.5)
        out[:, ch] = y + leaves * 0.18
    return out


@asset("cooking", kind="loop", target=-21.0)
def loop_cooking(rng, v):
    L = 12.0
    n = ns(L)
    mod = 0.7 + 0.3 * random_walk(n, 2.5, rng, circular=True)
    siz = grains(L, 2600, rng, lambda r: white(ns(0.0012), r) * np.exp(-tvec(ns(0.0012)) / 0.0004), circular=True,
                 amp_fn=lambda t: mod[min(int(t * SR), n - 1)] * rng.uniform(0.05, 1.0) ** 2)
    siz = fft_eq(siz, lambda f: H_hp(f, 2600, 2) * H_lp(f, 11000, 1), circular=True)
    hiss = fft_eq(white(n, rng), lambda f: H_bp(f, 6000, 0.8), circular=True) * mod
    pops = grains(L, 3.0, rng, lambda r: noise_burst(r, 0.008, 900, 7000, 0.0002, 0.0018), circular=True,
                  amp_fn=lambda t: rng.uniform(0.3, 1.0))
    simmer = grains(L, 9, rng, lambda r: bubble(r, r.uniform(220, 520), r.uniform(0.03, 0.06)), circular=True,
                    amp_fn=lambda t: rng.uniform(0.2, 0.6))
    return siz * 0.6 + hiss * 0.06 + pops * 0.45 + simmer * 0.2


def _bird_call(rng, kind):
    return sfx_bird.__wrapped__(rng, kind) if hasattr(sfx_bird, "__wrapped__") else sfx_bird(rng, kind)


@asset("amb_day", kind="loop", target=-25.0, quality=3)
def loop_amb_day(rng, v):
    L = 48.0
    n = ns(L)
    out = np.zeros((n, 2))
    for ch in range(2):
        r = rng_for("dayleaf%d" % ch)
        leaf = fft_eq(colored(n, r, -2.0), lambda f: H_bp(f, 3800, 0.6), circular=True)
        leaf *= unit(random_walk(n, 0.08, r, circular=True)) ** 2 * 0.8 + 0.2
        air = fft_eq(colored(n, r, -5.0), lambda f: H_lp(f, 420, 2) * H_hp(f, 60, 1), circular=True)
        out[:, ch] = leaf * 0.05 + air * 0.25
    birds = np.zeros((n, 2))
    t = 0.3
    while t < L:
        kind = int(rng.choice([0, 1, 2, 3, 5, 0, 2, 4]))
        call = sfx_bird(rng_for("daybird%.3f" % t), kind)
        dist = rng.uniform(0.0, 1.0)
        call = lp(call, 9000 - 6000 * dist) * (0.55 - 0.4 * dist)
        mix_at(birds, to_stereo(call, rng.uniform(-0.9, 0.9)), ns(t), 1.0, wrap=True)
        t += rng.exponential(0.95)
    for _k in range(2):
        wp = lp(sfx_woodpecker(rng_for("daywp%d" % _k), 0), 3000) * 0.25
        mix_at(birds, to_stereo(wp, rng.uniform(-0.8, 0.8)), ns(rng.uniform(0, L)), 1.0, wrap=True)
    birds = reverb(birds, 0.35, 1.8, 0.03, 0.5, 0.3, "forest_amb", circular=True)
    return out + birds * 0.9


def cricket_voice(n, L, rng, f, chirp_period, pulses, pulse_rate, pulse_len=0.012, trill=False):
    f = round(f * L) / L
    env = np.zeros(n)
    win = np.hanning(ns(pulse_len))
    if trill:
        t = 0.0
        while t < L:
            mix_at(env, win, ns(t), 1.0, wrap=True)
            t += 1.0 / pulse_rate
        env *= 0.35 + 0.65 * unit(random_walk(n, 0.15, rng, circular=True))
    else:
        t = rng.uniform(0, chirp_period)
        while t < L:
            for k in range(pulses):
                mix_at(env, win * (1.0 - 0.12 * k), ns(t + k / pulse_rate), 1.0, wrap=True)
            t += chirp_period * rng.uniform(0.93, 1.07)
    ph = TAU * f * tvec(n)
    return env * (np.sin(ph) + 0.12 * np.sin(2 * ph + 0.7))


@asset("amb_night", kind="loop", target=-25.0, quality=3)
def loop_amb_night(rng, v):
    L = 40.0
    n = ns(L)
    out = np.zeros((n, 2))
    for ch in range(2):
        r = rng_for("nightair%d" % ch)
        air = fft_eq(colored(n, r, -5.5), lambda f: H_lp(f, 300, 2) * H_hp(f, 50, 1), circular=True)
        air *= 0.6 + 0.4 * random_walk(n, 0.07, r, circular=True)
        out[:, ch] = air * 0.3
    bugs = np.zeros((n, 2))
    specs = [
        (4650, 0.62, 3, 32, False, 1.0), (4300, 0.85, 4, 30, False, 0.8), (5050, 0.5, 2, 38, False, 0.6),
        (3900, 1.1, 3, 26, False, 0.5), (4800, 0.7, 3, 34, False, 0.45), (2650, 0, 0, 52, True, 0.35),
        (2950, 0, 0, 46, True, 0.25), (4450, 0.95, 4, 31, False, 0.35),
    ]
    for i, (f, per, pul, rate, trill, g) in enumerate(specs):
        r = rng_for("cricket%d" % i)
        c = cricket_voice(n, L, r, f * r.uniform(0.97, 1.03), per, pul, rate, trill=trill)
        dist = r.uniform(0.0, 0.8)
        c = lp(c, 9000 - 4500 * dist, 1, circular=True) * g * (1.0 - 0.6 * dist)
        mix_at(bugs, to_stereo(c, r.uniform(-0.85, 0.85)), 0, 1.0, wrap=True)
    for k, t0 in enumerate((7.0, 27.5)):
        owl = sfx_owl(rng_for("nightowl%d" % k), k % 2)
        owl = lp(owl, 2500) * 0.35
        mix_at(bugs, to_stereo(owl, -0.6 if k == 0 else 0.7), ns(t0), 1.0, wrap=True)
    bugs = reverb(bugs, 0.3, 2.2, 0.03, 0.55, 0.3, "night_amb", circular=True)
    return out + bugs


# =============================================================================
# Music: shared helpers
# =============================================================================

HALL = dict(decay=2.6, predelay=0.025, damp=0.45, er=0.35, seed="hall")
DARK_HALL = dict(decay=3.4, predelay=0.035, damp=0.6, er=0.3, seed="dark_hall")
ROOM_BOSS = dict(decay=1.6, predelay=0.015, damp=0.5, er=0.5, seed="boss_room")


def expand(prog: list, n: int = 2) -> list:
    return [c for c in prog for _ in range(n)]


def bass_root(ch: str, base: int = 36) -> int:
    """Chord root in the octave starting at `base` (C2 by default)."""
    return base + (VOICING[ch][0] % 12 - base % 12) % 12


def fingerpick(m, stem, prog, rng, pattern=(0, 2, 3, 4, 1, 3, 2, 3), step=0.5, vel=0.8, bright=0.5,
               bars=None, ring=2.4, beat_len=None, bar_len=None):
    beat_len = beat_len or BEAT
    bar_len = bar_len or BAR
    for b, ch in enumerate(prog):
        if bars is not None and b not in bars:
            continue
        v = VOICING[ch]
        for k, idx in enumerate(pattern):
            beat = k * step
            if beat >= 4.0:
                break
            acc = 1.0 if k == 0 else (0.86 if abs(beat - 2.0) < 1e-6 else 0.7)
            t = b * bar_len + beat * beat_len + hum(rng, 6)
            sig = guitar(mtof(v[idx]), ring, rng, vel * acc * rng.uniform(0.86, 1.0), bright)
            m.add(stem, sig, t, 1.0, -0.3 + 0.15 * idx)


def pad_chords(m, stem, prog, rng, low=55, bright=1400.0, attack=1.2, release=1.8, vel=1.0, bars=None,
               voices=4, bar_len=None, extra=()):
    bar_len = bar_len or BAR
    b = 0
    while b < len(prog):
        ch = prog[b]
        e = b
        while e + 1 < len(prog) and prog[e + 1] == ch:
            e += 1
        if bars is None or b in bars:
            dur = (e - b + 1) * bar_len
            notes = pad_voicing(ch, low) + [bass_root(ch) + x for x in extra]
            for mm in notes:
                m.add(stem, pad_note(mtof(mm), dur, rng, bright, attack, release, voices), b * bar_len, vel)
        b = e + 1


def play_mel(m, stem, events, inst, rng, octave=0, length=None, vel=0.85, bar_range=None, pan=0.0,
             beat_len=None, shift_beats=0.0, legato=1.0):
    beat_len = beat_len or BEAT
    for beat, dur, mid in events:
        bar = int(beat // 4)
        if bar_range is not None and not (bar_range[0] <= bar < bar_range[1]):
            continue
        t = (beat + shift_beats) * beat_len + hum(rng, 5)
        ln = length if length is not None else dur * beat_len * legato
        sig = inst(mtof(mid + 12 * octave), ln, rng, vel * rng.uniform(0.88, 1.0))
        m.add(stem, sig, t, 1.0, pan)


def master(y: np.ndarray, circular: bool = True) -> np.ndarray:
    return compress(y, -24.0, 1.5, 0.12, circular=circular)


def synth_bass(freq, dur, rng, vel=1.0):
    n = ns(dur + 0.25)
    tb = table(saw_amps(freq, 1100.0, 60, 1.4))
    y = wt_osc(tb, freq, n, rng.uniform()) * 0.8 + np.sin(phase_of(freq * 0.5, n)) * 0.55
    return y * env_adsr(n, 0.006, 0.18, 0.65, 0.06, dur) * vel


def glass(freq, dur, rng, vel=1.0):
    n = ns(dur)
    f = vibrato(freq, n, 4.4, 0.003, 0.5, rng)
    ph = phase_of(f, n)
    y = np.sin(ph) + 0.08 * np.sin(3 * ph) + 0.03 * np.sin(5 * ph)
    e = np.sin(np.pi * np.clip(tvec(n) / dur, 0, 1)) ** 2
    return y * e * vel


def glide_tone(f0, f1, dur, rng, vel=1.0, bright=2200.0):
    n = ns(dur)
    f = f0 * (f1 / f0) ** np.clip(tvec(n) / dur, 0, 1)
    f = vibrato(f, n, 5.0, 0.004, 0.2, rng)
    y = wt_osc(table(saw_amps((f0 + f1) * 0.5, bright, 50, 1.2)), f, n, rng.uniform())
    return y * env_adsr(n, 0.25, 0.6, 0.8, 0.6, dur * 0.7) * vel


def box_eerie(freq, dur, rng, vel=1.0):
    return music_box(freq, dur, rng, vel, detune=0.0045)


# =============================================================================
# Music: themes
# =============================================================================

PROG_TITLE = ["D", "A/C#", "Bm", "G", "D", "G", "A", "A", "Bm", "G", "D", "A", "Bm", "G", "Em", "A",
              "D", "A/C#", "Bm", "G", "Em", "A", "D", "D"]
MEL_TITLE = parse_mel([
    "F#4:1 A4:1 D5:1.5 C#5:0.5", "B4:1 A4:1 E4:2", "F#4:1 B4:1 A4:1 F#4:1", "G4:1.5 F#4:0.5 E4:2",
    "F#4:1 A4:1 D5:1.5 E5:0.5", "D5:1 B4:1 G4:2", "A4:1 B4:0.5 A4:0.5 G4:1 E4:1", "A4:3 r:1",
    "D5:1.5 C#5:0.5 B4:2", "B4:1 A4:1 G4:2", "F#4:1 G4:1 A4:1.5 D5:0.5", "C#5:3 r:1",
    "D5:1.5 C#5:0.5 B4:1 F#4:1", "G4:1 A4:1 B4:2", "E5:1 D5:1 B4:1 G4:1", "A4:3 r:1",
    "F#4:1 A4:1 D5:1.5 C#5:0.5", "B4:1 A4:1 E4:2", "F#4:1 B4:1 A4:1 F#4:1", "G4:1.5 F#4:0.5 E4:2",
    "G4:1 F#4:1 E4:1 G4:1", "F#4:1 E4:1 C#4:1 E4:1", "D4:4", "r:4",
])

PROG_DAY = expand(["D", "G", "Bm", "A", "D", "G", "Em", "A", "G", "D"]) + ["Em", "A", "D", "D"]
MEL_DAY = parse_mel([
    "r:1 A4:0.5 B4:0.5 A4:1 F#4:1", "D4:1 E4:1 F#4:2", "r:1 B4:0.5 C#5:0.5 D5:1 B4:1", "G4:2 A4:1 B4:1",
    "D5:1.5 C#5:0.5 B4:1 F#4:1", "A4:1 B4:1 F#4:2", "E4:1 F#4:1 A4:1 C#5:1", "B4:2 A4:2",
    "r:2 F#5:1 E5:1", "D5:1 A4:1 F#4:2", "G4:1 B4:1 D5:1 E5:1", "D5:2 B4:2",
    "E5:1.5 D5:0.5 B4:1 G4:1", "A4:1 B4:1 E4:2", "C#5:1 B4:1 A4:1 E4:1", "A4:4",
    "r:4", "r:4", "r:4", "r:4",
    "B4:1 A4:1 G4:1 E4:1", "F#4:1 E4:1 C#4:1 E4:1", "D4:4", "r:4",
])

PROG_DUSK = expand(["Bm", "G", "D", "A"] * 3)
MEL_DUSK = parse_mel([
    "F#4:2 B4:2", "A4:1 B4:1 D5:2", "C#5:2 B4:1 A4:1", "B4:3 r:1",
    "A4:2 F#4:1 A4:1", "B4:1 A4:1 F#4:2", "E4:2 F#4:1 G4:1", "E4:3 r:1",
    "D5:2 C#5:1 B4:1", "F#4:3 r:1", "G4:1 A4:1 B4:2", "D5:2 B4:2",
    "A4:2 B4:1 A4:1", "F#4:3 r:1", "G4:1 F#4:1 E4:2", "C#4:2 E4:2",
] + ["r:4"] * 8)

PROG_NIGHT = expand(["Bm", "G", "Em", "F#"] * 3)
MEL_NIGHT = parse_mel([
    "B4:1 D5:1 F#5:2", "E5:1 D5:1 C#5:1 D5:1", "B4:2 G4:2", "A4:1 B4:1 D5:2",
    "G5:1 F#5:1 E5:2", "D5:1 B4:1 G4:2", "A#4:2 C#5:2", "F#4:4",
    "F#5:1 E5:1 D5:1 B4:1", "D5:2 C#5:1 B4:1", "B4:1 D5:1 G5:2", "F#5:1 E5:1 D5:2",
    "E5:1 G5:1 B5:2", "A5:1 G5:1 E5:2", "F#5:1 E5:1 C#5:1 A#4:1", "B4:4",
    "r:2 F#5:2", "D5:4", "r:2 B4:2", "D5:4", "r:2 G5:2", "E5:4", "r:2 C#5:2", "A#4:2 F#4:2",
])
NIGHT_HIGH = {"Bm": "F#6", "G": "D6", "Em": "B5", "F#": "C#6"}


@asset("music_title", kind="music", target=-19.0)
def music_title(rng, v):
    m = Mix(LOOP_SECONDS)
    fingerpick(m, "gtr", PROG_TITLE, rng, vel=0.8, bright=0.45)
    pad_chords(m, "pad", PROG_TITLE, rng, low=57, bright=1200, attack=1.6, release=2.2, extra=(0,))
    for b, ch in enumerate(PROG_TITLE):
        if b >= 8:
            r = bass_root(ch)
            m.add("bass", bass_pizz(mtof(r), 2.0, rng, 0.9), b * BAR + hum(rng))
            m.add("bass", bass_pizz(mtof(r + 7), 1.5, rng, 0.6), b * BAR + 2 * BEAT + hum(rng))
    play_mel(m, "box", MEL_TITLE, music_box, rng, length=3.2, bar_range=(0, 8), pan=-0.15)
    play_mel(m, "lead", MEL_TITLE, flute, rng, bar_range=(8, 24), pan=0.1)
    play_mel(m, "box", MEL_TITLE, music_box, rng, octave=1, length=3.0, vel=0.45, bar_range=(16, 24), pan=-0.2)
    for b in range(8, 16):
        for k in range(8):
            m.add("perc", shaker(rng, 0.9 if k % 2 else 0.55), b * BAR + k * 0.5 * BEAT + hum(rng, 4), pan=0.35)
    fx = {"gtr": {"eq": GUITAR_EQ, "lu": -22.0, "send": 0.25},
          "pad": {"eq": lambda f: H_hp(f, 55, 2) * H_lp(f, 5200, 1) * H_peak(f, 400, 0.8, -2.0), "lu": -28.0, "send": 0.5},
          "bass": {"eq": lambda f: H_lp(f, 1200, 1), "lu": -26.0, "send": 0.08},
          "box": {"eq": lambda f: H_hp(f, 200, 1), "lu": -24.5, "send": 0.45},
          "lead": {"eq": lambda f: H_hp(f, 180, 1), "lu": -21.5, "send": 0.35},
          "perc": {"lu": -35.0, "send": 0.15}}
    return master(m.render(fx, HALL))


@asset("music_day", kind="music", target=-19.5)
def music_day(rng, v):
    m = Mix(LOOP_SECONDS)
    fingerpick(m, "gtr", PROG_DAY, rng, pattern=(0, 3, 2, 4, 1, 4, 2, 3), vel=0.8, bright=0.6)
    pad_chords(m, "pad", PROG_DAY, rng, low=57, bright=1500, attack=1.2, release=1.8, extra=(0,))
    play_mel(m, "lead", MEL_DAY, flute, rng, pan=0.12)
    for b, ch in enumerate(PROG_DAY):
        t0 = b * BAR
        tones = pad_voicing(ch, 67)
        if 16 <= b < 20:
            seq = (0, 1, 2, 1, 0, 1, 2, 1) if b % 2 == 0 else (0, 1, 2, 1, 2, 1, 0, 1)
            for k, i in enumerate(seq):
                m.add("mar", marimba(mtof(tones[i]), 1.0, rng, 0.85 if k % 2 == 0 else 0.6), t0 + k * 0.5 * BEAT + hum(rng, 4), pan=-0.25)
        elif b % 2 == 1:
            m.add("mar", marimba(mtof(tones[2]), 0.9, rng, 0.55), t0 + 3.0 * BEAT + hum(rng, 4), pan=-0.25)
            m.add("mar", marimba(mtof(tones[1]), 0.9, rng, 0.5), t0 + 3.5 * BEAT + hum(rng, 4), pan=-0.25)
        if b >= 4:
            r = bass_root(ch)
            m.add("bass", bass_pizz(mtof(r), 1.8, rng, 0.9), t0 + hum(rng))
            m.add("bass", bass_pizz(mtof(r + 7), 1.4, rng, 0.65), t0 + 2 * BEAT + hum(rng))
            for k in range(8):
                m.add("perc", shaker(rng, 0.85 if k % 2 else 0.5), t0 + k * 0.5 * BEAT + hum(rng, 4), pan=0.35)
        if b >= 8:
            m.add("drum", kick(rng, 0.8, 80, 50, 0.4), t0)
            m.add("drum", kick(rng, 0.55, 80, 50, 0.4), t0 + 2 * BEAT)
            if not 16 <= b < 20:
                m.add("drum", woodtick(rng, 0.5, 900), t0 + 1 * BEAT + hum(rng, 3), pan=-0.1)
                m.add("drum", woodtick(rng, 0.45, 900), t0 + 3 * BEAT + hum(rng, 3), pan=-0.1)
    fx = {"gtr": {"eq": GUITAR_EQ, "lu": -22.5, "send": 0.22},
          "pad": {"eq": lambda f: H_hp(f, 55, 2) * H_lp(f, 5200, 1) * H_peak(f, 400, 0.8, -2.0), "lu": -30.0, "send": 0.5},
          "lead": {"eq": lambda f: H_hp(f, 180, 1), "lu": -21.0, "send": 0.32},
          "mar": {"eq": lambda f: H_hp(f, 150, 1), "lu": -25.0, "send": 0.3},
          "bass": {"eq": lambda f: H_lp(f, 1200, 1), "lu": -27.0, "send": 0.06},
          "perc": {"lu": -33.5, "send": 0.15},
          "drum": {"eq": lambda f: H_lp(f, 5000, 1), "lu": -31.0, "send": 0.12}}
    return master(m.render(fx, HALL))


@asset("music_dusk", kind="music", target=-20.0)
def music_dusk(rng, v):
    m = Mix(LOOP_SECONDS)
    fingerpick(m, "gtr", PROG_DUSK, rng, pattern=(0, 2, 3, 4), step=1.0, vel=0.7, bright=0.4, ring=3.0)
    pad_chords(m, "pad", PROG_DUSK, rng, low=55, bright=1000, attack=2.0, release=2.4)
    play_mel(m, "cello", MEL_DUSK, lambda f, d, r, vv: bowed(f, d, r, vv, 2400, 0.22, 0.45, 0.0045), rng, octave=-1, pan=-0.1, legato=1.02)
    motif = [e for e in MEL_DUSK if e[0] < 8 or 32 <= e[0] < 40]
    play_mel(m, "box", motif, music_box, rng, octave=1, length=3.4, vel=0.6, shift_beats=64, pan=0.2)
    for b in range(0, 24, 2):
        ch = PROG_DUSK[b]
        m.add("low", bowed(mtof(bass_root(ch)), 2 * BAR - 0.3, rng, 0.8, 900, 0.5, 0.8, 0.002), b * BAR)
    fx = {"gtr": {"eq": GUITAR_EQ, "lu": -24.0, "send": 0.3},
          "pad": {"eq": PAD_EQ, "lu": -27.0, "send": 0.5},
          "cello": {"eq": STRINGS_EQ, "lu": -21.0, "send": 0.35},
          "box": {"eq": lambda f: H_hp(f, 200, 1), "lu": -26.0, "send": 0.5},
          "low": {"eq": lambda f: H_lp(f, 1500, 1) * H_hp(f, 40, 2), "lu": -29.0, "send": 0.2}}
    return master(m.render(fx, HALL))


@asset("music_night_warm", kind="music", target=-21.0)
def music_night_warm(rng, v):
    """Night by a strong fire: the lullaby, warm pad and soft guitar."""
    m = Mix(LOOP_SECONDS)
    play_mel(m, "box", MEL_NIGHT, music_box, rng, length=3.4, vel=0.8, pan=0.1)
    pad_chords(m, "pad", PROG_NIGHT, rng, low=54, bright=1100, attack=1.8, release=2.2)
    for b, ch in enumerate(PROG_NIGHT):
        vv = VOICING[ch]
        t0 = b * BAR
        m.add("gtr", guitar(mtof(vv[0]), 3.0, rng, 0.6, 0.38), t0 + hum(rng), pan=-0.3)
        for k, idx in enumerate((2, 3, 4)):
            m.add("gtr", guitar(mtof(vv[idx]), 2.6, rng, 0.42, 0.38), t0 + 0.03 * (k + 1) + hum(rng, 3), pan=-0.2 + 0.1 * k)
        for k, idx in enumerate((3, 4)):
            m.add("gtr", guitar(mtof(vv[idx]), 2.2, rng, 0.32, 0.36), t0 + 2 * BEAT + 0.03 * k + hum(rng, 3), pan=-0.1 + 0.1 * k)
        if b % 2 == 0:
            m.add("bass", bass_pizz(mtof(bass_root(ch)), 2.5, rng, 0.8), t0 + hum(rng))
    fx = {"box": {"eq": lambda f: H_hp(f, 200, 1), "lu": -22.0, "send": 0.5},
          "pad": {"eq": PAD_EQ, "lu": -27.0, "send": 0.5},
          "gtr": {"eq": GUITAR_EQ, "lu": -25.5, "send": 0.3},
          "bass": {"eq": lambda f: H_lp(f, 1000, 1), "lu": -29.0, "send": 0.1}}
    return master(m.render(fx, DARK_HALL))


@asset("music_night", kind="music", target=-22.0)
def music_night(rng, v):
    """Night away from the fire: sparse, cold and tense (same grid as night_warm)."""
    m = Mix(LOOP_SECONDS)
    for b in range(0, 24, 2):
        ch = PROG_NIGHT[b]
        r = bass_root(ch) - 12
        m.add("drone", pad_note(mtof(r), 2 * BAR, rng, 420, 1.5, 2.0, 3, 7.0), b * BAR)
        m.add("drone", pad_note(mtof(r + 7), 2 * BAR, rng, 380, 1.8, 2.0, 3, 9.0), b * BAR, 0.55)
        hn = note(NIGHT_HIGH[ch])
        hi = bowed(mtof(hn), 2 * BAR - 0.6, rng, 0.6, 3200, 1.4, 1.6, 0.0015, False)
        hi *= 0.75 + 0.25 * np.sin(TAU * 3.3 * tvec(len(hi)))
        if (b // 2) % 2 == 0:
            m.add("high", hi, b * BAR + 0.3, pan=0.35 if (b // 4) % 2 else -0.35)
    sparse = [e for e in MEL_NIGHT if int(e[0] // 4) in (0, 1, 8, 9, 16, 17)]
    play_mel(m, "box", sparse, box_eerie, rng, length=3.6, vel=0.7, pan=-0.15)
    for b in (0, 8, 16):
        m.add("boom", taiko(rng, 44, 1.0, 2.5, 0.15), b * BAR)
        m.add("swell", reverse_swell(2.4, rng, 200, 3500), b * BAR - 2.4)
    fx = {"drone": {"eq": lambda f: H_hp(f, 45, 2) * H_lp(f, 1600, 1), "lu": -26.0, "send": 0.4},
          "high": {"eq": lambda f: H_hp(f, 600, 1), "lu": -31.0, "send": 0.6},
          "box": {"eq": lambda f: H_hp(f, 200, 1), "lu": -25.0, "send": 0.65},
          "boom": {"eq": lambda f: H_lp(f, 400, 2), "lu": -29.0, "send": 0.3},
          "swell": {"lu": -34.0, "send": 0.4}}
    return master(m.render(fx, DARK_HALL))


@asset("music_danger", kind="music", target=-21.0)
def music_danger(rng, v):
    """Threat layer (pulsing low strings + drums); plays on top of night/dusk."""
    m = Mix(LOOP_SECONDS)
    offs = (0, 0, 12, 0, 0, 12, 7, 12)
    for b, ch in enumerate(PROG_NIGHT):
        r = bass_root(ch)
        t0 = b * BAR
        for k, o in enumerate(offs):
            vel = (1.0 if k % 2 == 0 else 0.72) * (0.86 + 0.14 * (b % 2))
            t = t0 + k * 0.5 * BEAT + hum(rng, 4)
            m.add("ost", bowed(mtof(r + o), 0.3, rng, vel, 1700, 0.012, 0.09, 0.0, True), t, pan=0.15)
            m.add("ost", bowed(mtof(r + o - 12), 0.3, rng, vel * 0.6, 1100, 0.015, 0.09, 0.0, True), t, pan=-0.15)
        for beat, g in ((0, 1.0), (1.5, 0.55), (2.0, 0.75), (3.0, 0.4), (3.5, 0.5)):
            m.add("taiko", taiko(rng, 66, g, 1.2, 0.5), t0 + beat * BEAT + hum(rng, 3))
        for k in range(16):
            m.add("tick", woodtick(rng, (1.0, 0.4, 0.6, 0.4)[k % 4], 1500), t0 + k * 0.25 * BEAT + hum(rng, 3), pan=0.4)
        if b >= 16 and b % 2 == 0:
            for nn in ("F#5", "G5"):
                s = bowed(mtof(note(nn)), 2 * BAR - 0.4, rng, 0.5, 3000, 0.8, 0.6, 0.0, True)
                s *= 0.6 + 0.4 * np.sin(TAU * 11.0 * tvec(len(s)))
                m.add("tens", s, t0, pan=-0.3 if nn == "G5" else 0.3)
        if b % 8 == 6:
            m.add("swell", brass(mtof(r - 12), 2 * BAR, rng, 0.8, swell=True), t0)
    fx = {"ost": {"eq": STRINGS_EQ, "lu": -22.0, "send": 0.25},
          "taiko": {"eq": lambda f: H_lp(f, 3000, 1), "lu": -24.0, "send": 0.25},
          "tick": {"eq": lambda f: H_hp(f, 400, 1), "lu": -34.0, "send": 0.15},
          "tens": {"eq": STRINGS_EQ, "lu": -31.0, "send": 0.4},
          "swell": {"eq": lambda f: H_lp(f, 2000, 1), "lu": -29.0, "send": 0.3}}
    return master(m.render(fx, DARK_HALL))


@asset("music_fire_out", kind="music", target=-21.0)
def music_fire_out(rng, v):
    """The fire is out: dark cluster drone, heartbeat, cold glassy tones."""
    m = Mix(LOOP_SECONDS)
    for b in (0, 8, 16):
        for mm, g in ((35, 1.0), (36, 0.7), (42, 0.45)):
            m.add("drone", pad_note(mtof(mm), 8 * BAR, rng, 380, 2.5, 3.0, 3, 6.0), b * BAR, g)
        m.add("boom", taiko(rng, 40, 1.0, 3.0, 0.1), b * BAR)
        m.add("wind", whoosh(rng, 6.0, 250, 700, 0.5, 0.8, 1.2), (b + 2) * BAR)
    for k in range(LOOP_BARS * 4):
        m.add("heart", heartbeat(rng, 1.0 if k % 2 == 0 else 0.8), k * BEAT + hum(rng, 3))
    for i, nn in enumerate(("F6", "F#6", "F6", "F#6")):
        m.add("glass", glass(mtof(note(nn)), 26.0, rng, 1.0), i * 20.0 + 3.0, pan=-0.4 if i % 2 else 0.4)
    for b in range(0, 24, 4):
        m.add("swell", reverse_swell(2.0, rng, 200, 4000), b * BAR - 2.0)
    fx = {"drone": {"eq": lambda f: H_hp(f, 30, 2) * H_lp(f, 1400, 1), "lu": -24.0, "send": 0.4},
          "heart": {"eq": lambda f: H_lp(f, 500, 2), "lu": -23.0, "send": 0.15},
          "glass": {"lu": -32.0, "send": 0.7},
          "boom": {"eq": lambda f: H_lp(f, 400, 2), "lu": -28.0, "send": 0.3},
          "wind": {"lu": -32.0, "send": 0.3},
          "swell": {"lu": -33.0, "send": 0.4}}
    return master(m.render(fx, DARK_HALL))


BOSS_TEMPO = 144.0
B_BEAT = 60.0 / BOSS_TEMPO
B_BAR = 4.0 * B_BEAT
SEC_A = expand(["Bm", "G", "Em", "F#"])
SEC_C = expand(["G", "A", "Bm", "F#"])
PROG_BOSS = SEC_A * 4 + SEC_C + SEC_A
MEL_BOSS = parse_mel([
    "B3:1.5 F#3:0.5 B3:1 D4:1", "F#4:3 E4:0.5 D4:0.5", "D4:1.5 B3:0.5 G3:1 B3:1", "D4:3 r:1",
    "E4:1.5 G4:0.5 F#4:1 E4:1", "B3:3 r:1", "A#3:1.5 C#4:0.5 F#4:1 E4:1", "C#4:2 A#3:2",
])


@asset("music_boss", kind="music", target=-17.0)
def music_boss(rng, v):
    m = Mix(LOOP_SECONDS)
    offs = (0, 0, 12, 0, 0, 12, 10, 7)
    for b, ch in enumerate(PROG_BOSS):
        t0 = b * B_BAR
        sec = b // 8
        breakdown = sec == 4
        r = bass_root(ch)
        for k, o in enumerate(offs):
            m.add("bass", synth_bass(mtof(r + o - 12), B_BEAT * 0.42, rng, 1.0 if k % 2 == 0 else 0.75), t0 + k * 0.5 * B_BEAT + hum(rng, 3))
        if not breakdown:
            m.add("kick", kick(rng, 1.0), t0)
            m.add("kick", kick(rng, 0.9), t0 + 2 * B_BEAT)
            if b % 2 == 1:
                m.add("kick", kick(rng, 0.7), t0 + 2.5 * B_BEAT)
            m.add("snare", snare(rng, 1.0), t0 + 1 * B_BEAT + hum(rng, 2))
            m.add("snare", snare(rng, 0.95), t0 + 3 * B_BEAT + hum(rng, 2))
            for k in range(8):
                m.add("hat", hat(rng, 0.9 if k % 2 else 0.5), t0 + k * 0.5 * B_BEAT + hum(rng, 3), pan=0.3)
        if b % 2 == 0 or breakdown:
            m.add("taiko", taiko(rng, 58, 1.0, 1.4, 0.6), t0)
        if breakdown:
            m.add("taiko", taiko(rng, 72, 0.7, 1.0, 0.6), t0 + 2 * B_BEAT)
        if b % 8 == 7:
            for k in range(8):
                m.add("tom", tom(rng, 150 - k * 8, 0.9, 0.6), t0 + (2 + k * 0.25) * B_BEAT, pan=0.5 - k * 0.13)
        if sec in (0, 2, 5):
            for mm in pad_voicing(ch, 50):
                m.add("stab", brass(mtof(mm), 0.3, rng, 0.95), t0 + hum(rng, 3))
                m.add("stab", brass(mtof(mm), 0.24, rng, 0.8), t0 + 1.5 * B_BEAT + hum(rng, 3))
        if breakdown and b % 2 == 0:
            for mm in pad_voicing(ch, 47):
                m.add("swell", brass(mtof(mm), 2 * B_BAR, rng, 0.9, swell=True), t0)
    for sec, octv in ((1, 0), (3, 0), (5, 0)):
        play_mel(m, "lead", MEL_BOSS, lambda f, d, r_, vv: brass(f, d, r_, vv, 0.04, 0.2), rng, beat_len=B_BEAT,
                 shift_beats=sec * 32, vel=1.0, legato=0.95)
        if sec == 5:
            play_mel(m, "lead", MEL_BOSS, lambda f, d, r_, vv: brass(f, d, r_, vv, 0.04, 0.2), rng, octave=-1,
                     beat_len=B_BEAT, shift_beats=sec * 32, vel=0.7, legato=0.95)
    pad_chords(m, "pad", PROG_BOSS, rng, low=47, bright=700, attack=0.6, release=1.0, bar_len=B_BAR)
    fx = {"bass": {"eq": lambda f: H_lp(f, 2500, 1), "lu": -21.0, "send": 0.05},
          "kick": {"lu": -22.0, "send": 0.05},
          "snare": {"lu": -23.5, "send": 0.2},
          "hat": {"lu": -31.0, "send": 0.08},
          "taiko": {"eq": lambda f: H_lp(f, 3000, 1), "lu": -22.0, "send": 0.25},
          "tom": {"lu": -25.0, "send": 0.2},
          "stab": {"eq": lambda f: H_hp(f, 120, 1), "lu": -22.0, "send": 0.2},
          "swell": {"eq": lambda f: H_hp(f, 90, 1), "lu": -22.5, "send": 0.3},
          "lead": {"eq": lambda f: H_hp(f, 150, 1) * H_peak(f, 1200, 1.0, 2.0), "lu": -19.5, "send": 0.25},
          "pad": {"eq": PAD_EQ, "lu": -30.0, "send": 0.3}}
    return master(m.render(fx, ROOM_BOSS))


# =============================================================================
# Stingers (one-shot musical cues)
# =============================================================================

def sting_mix(m, fx, rev=HALL):
    return master(m.render(fx, rev), circular=False)


@asset("night_sting", kind="sting", target=-16.0)
def sting_night(rng, v):
    m = Mix(5.0, loop=False, tail=4.0)
    m.add("fx", reverse_swell(1.2, rng, 200, 5000), 0.0)
    m.add("low", taiko(rng, 46, 1.0, 3.0, 0.3), 1.2)
    for mm in (35, 42, 50):
        m.add("pad", pad_note(mtof(mm), 2.5, rng, 600, 0.05, 2.0, 3), 1.2)
    for i, nm in enumerate(("B4", "D5", "F#5")):
        m.add("box", box_eerie(mtof(note(nm)), 3.5, rng, 0.8), 1.25 + i * 0.42, pan=-0.2 + 0.2 * i)
    m.add("high", bowed(mtof(note("C6")), 2.5, rng, 0.5, 3000, 1.0, 1.5, 0.002, False), 1.4, pan=0.3)
    fx = {"fx": {"lu": -24.0, "send": 0.3}, "low": {"eq": lambda f: H_lp(f, 600, 2), "lu": -18.0, "send": 0.3},
          "pad": {"eq": lambda f: H_lp(f, 1500, 1), "lu": -22.0, "send": 0.4},
          "box": {"lu": -19.0, "send": 0.6}, "high": {"lu": -28.0, "send": 0.6}}
    return sting_mix(m, fx, DARK_HALL)


@asset("dawn_chime", kind="sting", target=-17.0)
def sting_dawn(rng, v):
    m = Mix(5.5, loop=False, tail=4.0)
    for mm in pad_voicing("G", 55):
        m.add("pad", pad_note(mtof(mm), 1.6, rng, 1300, 0.6, 1.2), 0.0)
    for mm in pad_voicing("D", 57) + [50]:
        m.add("pad", pad_note(mtof(mm), 3.0, rng, 1500, 0.5, 2.0), 1.5)
    for i, nm in enumerate(("D5", "F#5", "A5", "D6", "F#6")):
        m.add("bell", glock(mtof(note(nm)), 2.5, rng, 0.8), 1.55 + i * 0.13, pan=-0.4 + 0.2 * i)
        m.add("bell", marimba(mtof(note(nm)), 1.5, rng, 0.6), 1.55 + i * 0.13, pan=-0.4 + 0.2 * i)
    m.add("lead", flute(mtof(note("A5")), 2.4, rng, 0.6), 1.9, pan=0.1)
    fx = {"pad": {"eq": PAD_EQ, "lu": -22.0, "send": 0.5}, "bell": {"lu": -19.0, "send": 0.5},
          "lead": {"lu": -22.0, "send": 0.5}}
    return sting_mix(m, fx)


@asset("level_up", kind="sting", target=-15.0)
def sting_level_up(rng, v):
    m = Mix(2.0, loop=False, tail=3.0)
    for i, nm in enumerate(("D5", "F#5", "A5", "D6")):
        m.add("arp", marimba(mtof(note(nm)), 1.0, rng, 0.9), i * 0.07, pan=-0.3 + 0.2 * i)
        m.add("arp", glock(mtof(note(nm) + 12), 1.5, rng, 0.35), i * 0.07, pan=-0.3 + 0.2 * i)
    for nm in ("D6", "F#6", "A6"):
        m.add("chord", glock(mtof(note(nm)), 2.4, rng, 0.6), 0.32)
    m.add("fx", whoosh(rng, 0.5, 500, 6000, 0.85, 1.4, 1.5), 0.0)
    pent = ("D6", "E6", "F#6", "A6", "B6", "D7", "E7")
    for k in range(7):
        m.add("spark", glock(mtof(note(pent[int(rng.integers(0, len(pent)))])), 1.2, rng, 0.5 * (1 - k / 8)),
              0.45 + k * 0.11 + hum(rng, 15), pan=float(rng.uniform(-0.7, 0.7)))
    fx = {"arp": {"lu": -17.0, "send": 0.3}, "chord": {"lu": -19.0, "send": 0.4},
          "fx": {"lu": -27.0, "send": 0.2}, "spark": {"lu": -24.0, "send": 0.5}}
    return sting_mix(m, fx)


@asset("sting_fire_out", kind="sting", target=-15.0)
def sting_fire_out(rng, v):
    m = Mix(4.5, loop=False, tail=4.0)
    m.add("low", taiko(rng, 42, 1.0, 3.0, 0.4), 0.0)
    m.add("low", sub_bass(mtof(35), 2.5, rng, 0.8, 0.01, 1.2), 0.0)
    for a, b in (("B4", "G4"), ("C5", "G#4"), ("F#4", "D4")):
        m.add("str", glide_tone(mtof(note(a)), mtof(note(b)), 3.2, rng, 0.8), 0.05, pan=float(rng.uniform(-0.5, 0.5)))
    for mm in (35, 36):
        m.add("pad", pad_note(mtof(mm), 3.0, rng, 450, 0.2, 1.8, 3), 0.0)
    m.add("wind", whoosh(rng, 3.0, 300, 900, 0.3, 0.8, 1.2), 0.2)
    fx = {"low": {"eq": lambda f: H_lp(f, 600, 2), "lu": -17.0, "send": 0.3},
          "str": {"eq": STRINGS_EQ, "lu": -20.0, "send": 0.5},
          "pad": {"eq": lambda f: H_lp(f, 1200, 1), "lu": -23.0, "send": 0.4},
          "wind": {"lu": -27.0, "send": 0.3}}
    return sting_mix(m, fx, DARK_HALL)


@asset("sting_gameover", kind="sting", target=-18.0)
def sting_gameover(rng, v):
    m = Mix(8.0, loop=False, tail=4.5)
    for t0, ch, d in ((0.0, "Bm", 2.6), (2.6, "G", 2.6), (5.2, "D", 3.2)):
        for mm in pad_voicing(ch, 55):
            m.add("pad", pad_note(mtof(mm), d, rng, 1000, 0.9, 2.0), t0)
        m.add("gtr", guitar(mtof(bass_root(ch)), 3.5, rng, 0.7, 0.35), t0)
    for beat, nm in ((0, "F#5"), (1, "E5"), (2, "D5"), (3, "B4"), (4.5, "A4"), (5.5, "B4"), (6.5, "D5")):
        m.add("box", music_box(mtof(note(nm)), 3.5, rng, 0.75), beat * BEAT)
    fx = {"pad": {"eq": PAD_EQ, "lu": -23.0, "send": 0.5}, "gtr": {"eq": GUITAR_EQ, "lu": -26.0, "send": 0.3},
          "box": {"lu": -20.0, "send": 0.55}}
    return sting_mix(m, fx)


# @@SECTIONS@@


# =============================================================================
# Driver
# =============================================================================

def asset_files(entry) -> list:
    if entry["variants"] == 1:
        return [entry["name"]]
    return ["%s_%d" % (entry["name"], i + 1) for i in range(entry["variants"])]


def build(entry, v: int) -> np.ndarray:
    kind = entry["kind"]
    circular = kind in ("loop", "music")
    x = entry["fn"](rng_for("%s:%d" % (entry["name"], v)), v)
    x = np.asarray(x, dtype=np.float64)
    if not circular:
        x = trim_tail(x)
        x = fade(x, 0.0003, 0.0)
    x = finalize(x, entry["target"], entry["mode"], circular)
    return x


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma-separated asset names (groups) to (re)build")
    ap.add_argument("--list", action="store_true", help="list asset groups and exit")
    ap.add_argument("--out", default=OUT_DIR)
    ap.add_argument("--spectrograms", default="", help="also write spectrogram PNGs to this directory")
    ap.add_argument("--wav", default="", help="also write 16-bit WAVs to this directory")
    args = ap.parse_args()

    if args.list:
        for e in REGISTRY:
            print("%-18s %-6s x%d" % (e["name"], e["kind"], e["variants"]))
        return 0
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    unknown = only - {e["name"] for e in REGISTRY}
    if unknown:
        print("unknown asset(s): %s" % ", ".join(sorted(unknown)))
        return 2
    os.makedirs(args.out, exist_ok=True)
    for d in (args.spectrograms, args.wav):
        if d:
            os.makedirs(d, exist_ok=True)
    man_path = os.path.join(args.out, "manifest.json")
    manifest = {"assets": {}, "groups": {}}
    if only and os.path.exists(man_path):
        with open(man_path) as fh:
            manifest = json.load(fh)
    t_all = time.time()
    for e in REGISTRY:
        if only and e["name"] not in only:
            continue
        files = asset_files(e)
        for v, fname in enumerate(files):
            t0 = time.time()
            x = build(e, v)
            path = os.path.join(args.out, fname + ".ogg")
            write_ogg(path, x, e["quality"])
            ch = 1 if x.ndim == 1 else x.shape[1]
            manifest["assets"][fname] = {
                "kind": e["kind"], "group": e["name"], "seconds": round(len(x) / SR, 4),
                "channels": ch, "loop": e["kind"] in ("loop", "music"),
            }
            if args.spectrograms:
                write_spectrogram(os.path.join(args.spectrograms, fname + ".png"), x, fname)
            if args.wav:
                write_wav(os.path.join(args.wav, fname + ".wav"), x)
            peak = 20 * math.log10(np.max(np.abs(x)) + 1e-12)
            print("%-22s %6.2fs ch%d peak %5.1f dB  %-10s %6.1f KB  (%.1fs)" % (
                fname, len(x) / SR, ch, peak, "%.1f LU" % loudness(x, e["mode"], e["kind"] in ("loop", "music")),
                os.path.getsize(path) / 1024.0, time.time() - t0))
            sys.stdout.flush()
        manifest["groups"][e["name"]] = files
    manifest["sample_rate"] = SR
    manifest["music_loop_seconds"] = round(LOOP_SECONDS, 4)
    manifest["tempo"] = TEMPO
    manifest["generator"] = "tools/gen_audio.py"
    if not only:
        keep = set(manifest["assets"].keys())
        for f in os.listdir(args.out):
            if f.endswith(".ogg") and f[:-4] not in keep:
                os.remove(os.path.join(args.out, f))
                imp = os.path.join(args.out, f + ".import")
                if os.path.exists(imp):
                    os.remove(imp)
                print("removed stale", f)
    manifest["assets"] = dict(sorted(manifest["assets"].items()))
    manifest["groups"] = dict(sorted(manifest["groups"].items()))
    with open(man_path, "w") as fh:
        json.dump(manifest, fh, indent=1, sort_keys=True)
        fh.write("\n")
    total = sum(os.path.getsize(os.path.join(args.out, f)) for f in os.listdir(args.out) if f.endswith(".ogg"))
    print("done in %.1fs; %d files, %.2f MB total" % (time.time() - t_all, len(manifest["assets"]), total / 1048576.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
