// Procedural WebAudio music + sound effects (no audio files).
// Contract: export const audio = { unlock(), attach(game), setMusicMode(mode), play(name, opts), update(dt, ctx) }
//   unlock(): call from a user gesture; creates or resumes the AudioContext. Safe to call many times.
//   attach(game): subscribe to gameplay events on `bus`; detaches on 'game:dispose'.
//   setMusicMode('title'|'play'|'chase'|'event'|'victory'|'off')
//   play(name, opts): one-shot SFX ('click', 'hover', 'coins', ... see sfx.js). opts: {vol, x, z, ...recipe options}
//   update(dt, {game, human, state}): every frame; drives the chase/event layers, alarms and listener position.
// Extras: audio.ctx, audio.stats(), audio.music (MusicEngine), audio.supported, audio.setMuted(bool).
// Everything is a silent no-op before unlock, without WebAudio, and while the page is hidden.
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { RARITY } from '../config.js';
import { createMixer } from './mixer.js';
import { MusicEngine } from './music.js';
import { SFX, SFX_GAP, alarmLoop, stealLoop } from './sfx.js';
import { stats as voiceStats, sweepVoices } from './synth.js';

const W = typeof window !== 'undefined' ? window : null;
const AC = W ? W.AudioContext || W.webkitAudioContext : null;
const hidden = () => typeof document !== 'undefined' && document.hidden;
// old WebKit returns undefined instead of a promise from resume()/suspend()
const quiet = (p) => p && p.catch && p.catch(() => {});

export const MUSIC_TRIM = 0.5; // music sits under the SFX
export const SFX_TRIM = 1.0;
const LOOKAHEAD = 0.12;
const VOICE_CAP = 110; // above this, far-away bot sounds are dropped
const NEAR = 14; // studs: full volume inside this radius
const FAR = 95; // studs: silent beyond
const DUCK = { paused: 0.3, shop: 0.6 };

const perceptual = (v) => {
  v = Math.max(0, Math.min(1, +v || 0));
  return v * v;
};

class GameAudio {
  constructor() {
    this.supported = !!AC;
    this.ctx = null;
    this.mixer = null;
    this.music = null;
    this.game = null;
    this.subs = [];
    this.appState = 'boot';
    this.baseMode = 'off';
    this.forceChase = false;
    this.forceEvent = false;
    this.last = Object.create(null);
    this.alarm = null;
    this.stealing = null;
    this.dangerUntil = 0;
    this.listener = { x: 0, z: 0, rx: 1, rz: 0 };
    this._timer = null;
    this._camera = null;
    this._unlockAt = 0;
    this.muted = !!settings.muted;
    if (!W) return;
    bus.on('settings:changed', ({ key }) => {
      if (key === 'music' || key === 'sfx') this._applyLevels();
      if (key === 'music') this._syncMusic();
      if (key === 'muted') this.setMuted(!!settings.muted);
    });
    bus.on('app:state', ({ state }) => {
      this.appState = state;
      if (state === 'ended' && this.game?.human && this.game.over) this.setMusicMode('victory');
      this._applyLevels();
    });
    document.addEventListener('visibilitychange', () => this._onVisibility());
    // Any user gesture unlocks (first time) or resumes (iOS interruptions) the context.
    const gesture = () => {
      if (!this.ctx || this.ctx.state !== 'running') this.unlock();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) W.addEventListener(ev, gesture, { capture: true, passive: true });
  }

  // ------------------------------------------------------------------ lifecycle

  unlock() {
    if (!AC || hidden()) return false;
    try {
      if (!this.ctx) {
        try {
          this.ctx = new AC({ latencyHint: 'interactive' });
        } catch {
          this.ctx = new AC();
        }
        this._build();
      }
      if (this.ctx.state !== 'running') {
        quiet(this.ctx.resume());
        this._unlockAt = performance.now();
      }
      if (!this._primed) {
        // iOS: play one silent sample inside the gesture to fully unlock output
        this._primed = true;
        const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.start(0);
        s.onended = () => s.disconnect();
      }
      this._syncMusic();
      return true;
    } catch (e) {
      console.warn('[audio] unavailable', e);
      this.supported = false;
      return false;
    }
  }

  _build() {
    const ac = this.ctx;
    this.mixer = createMixer(ac);
    this.music = new MusicEngine(ac, this.mixer);
    this.music.lite = W.__app?.engine?.qualityId === 'low';
    this.mixer.master.gain.value = this.muted ? 0 : 0.9;
    this._applyLevels(0.01);
    this._timer = setInterval(() => this._tick(), 25);
  }

  _tick() {
    const ac = this.ctx;
    if (ac && ac.state === 'running' && (this._sweepAt = (this._sweepAt || 0) + 1) % 20 === 0) sweepVoices(ac);
    if (!ac || ac.state !== 'running' || !this.music.active) return;
    this.music.scheduleUntil(ac.currentTime + LOOKAHEAD);
  }

  _onVisibility() {
    if (!this.ctx) return;
    if (hidden()) {
      this._stopLoops();
      if (this.ctx.state === 'running') quiet(this.ctx.suspend());
    } else {
      quiet(this.ctx.resume());
    }
  }

  /** Master mute (the UI's mute button). Also stops scheduling so a muted game costs no CPU. */
  setMuted(muted) {
    this.muted = !!muted;
    if (!this.mixer) return;
    this.mixer.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    if (this.muted) this._stopLoops();
    this._syncMusic();
  }

  _applyLevels(tc) {
    if (!this.mixer) return;
    const duck = DUCK[this.appState] ?? 1;
    this.mixer.setMusic(perceptual(settings.music) * MUSIC_TRIM * duck, this.appState === 'paused', tc);
    this.mixer.setSfx(perceptual(settings.sfx) * SFX_TRIM, tc);
  }

  // ------------------------------------------------------------------ music

  setMusicMode(mode) {
    switch (mode) {
      case 'chase':
        this.forceChase = true;
        if (this.baseMode !== 'play') this.baseMode = 'play';
        break;
      case 'event':
        this.forceEvent = true;
        if (this.baseMode !== 'play') this.baseMode = 'play';
        break;
      case 'title':
      case 'play':
      case 'victory':
      case 'off':
        this.baseMode = mode;
        this.forceChase = false;
        this.forceEvent = false;
        break;
      default:
        return;
    }
    this._syncMusic();
  }

  _syncMusic() {
    const m = this.music;
    if (!m || this.ctx.state === 'closed') return;
    // muted music costs nothing: stop scheduling entirely
    m.setMode(this.muted || perceptual(settings.music) < 1e-4 ? 'off' : this.baseMode);
    if (this.forceChase) m.setChase(true);
    if (this.forceEvent) m.setEvent(this.game?.event?.type || 'golden');
    this._tick();
  }

  // ------------------------------------------------------------------ sfx

  /**
   * Play a one-shot effect. opts.x/opts.z make it positional (distance attenuation + pan).
   * opts.important bypasses the voice cap (use for the local player's own actions).
   */
  play(name, opts = {}) {
    const ac = this.ctx;
    if (!ac || this.muted || hidden()) return;
    // allow the brief 'suspended' window right after an unlock (the very first UI click)
    if (ac.state !== 'running' && !(ac.state === 'suspended' && performance.now() - (this._unlockAt || -1e9) < 1000)) return;
    const fn = SFX[name];
    if (!fn) return;
    const now = ac.currentTime;
    const key = opts.important ? name + '!' : name;
    if (now - (this.last[key] ?? -9) < (SFX_GAP[name] ?? 0.03)) return;
    let vol = opts.vol ?? 1;
    let out = this.mixer.sfxIn;
    if (opts.x != null && opts.z != null) {
      const L = this.listener;
      const dx = opts.x - L.x;
      const dz = opts.z - L.z;
      const d = Math.hypot(dx, dz);
      if (d > NEAR) {
        const k = 1 - (d - NEAR) / (FAR - NEAR);
        vol *= k <= 0 ? 0 : k * k;
      }
      if (vol < 0.03) return;
      if (d > 3) out = this.mixer.panBus(((dx * L.rx + dz * L.rz) / d) * 0.9);
    }
    if (!opts.important && voiceStats.active > VOICE_CAP) return;
    this.last[key] = now;
    try {
      fn(ac, out, now + 0.01, { ...opts, vol, send: this.mixer.sfxVerbIn });
    } catch (e) {
      console.warn('[audio] sfx failed', name, e);
    }
  }

  /** Voice/node bookkeeping for tests. */
  stats() {
    return { active: voiceStats.active, created: voiceStats.created, state: this.ctx?.state || 'none', music: this.music?.describe() };
  }

  // ------------------------------------------------------------------ game wiring

  attach(game) {
    this.detach();
    this.game = game;
    if (this.music) this.music.lite = W.__app?.engine?.qualityId === 'low';
    const on = (name, fn) => {
      this.subs.push(bus.on(name, (e) => {
        // gameplay sounds only for a live match with a human (not the title-screen attract mode)
        if (!this.ctx || this.game !== game || !game.human || this.appState === 'title') return;
        fn(e, game.human);
      }));
    };
    const at = (p) => (p ? { x: p.pos.x, z: p.pos.z } : {});
    const pos = (p, extra) => ({ x: p.pos.x, z: p.pos.z, vol: 0.75, ...extra });

    on('seed:grabbed', (e, H) => {
      const tier = RARITY[e.rarity]?.tier ?? 0;
      if (e.player === H) this.play('grab', { tier, mutation: e.mutation, important: true });
      else if (tier >= 4 || e.mutation !== 'normal') this.play('grab', pos(e.player, { tier: Math.min(tier, 5), mutation: 'normal', vol: 0.45 }));
    });
    on('seed:dropped', (e, H) => {
      if (e.player === H) this.play('dropped', { important: true });
    });
    on('plant:planted', (e, H) => {
      if (e.player === H) this.play('plant', { important: true });
      else this.play('plant', { x: e.planter.x, z: e.planter.z, vol: 0.5 });
    });
    on('plant:grown', (e, H) => {
      if (e.garden.owner === H) this.play('grown', { important: true });
    });
    on('plant:sold', (e, H) => {
      if (e.player === H) this.play('coins', { amount: e.value, important: true });
    });
    on('plant:returned', (e, H) => {
      if (e.garden.owner === H) this.play('sprout', { important: true, vol: 0.8 });
    });
    on('plant:watered', (e, H) => {
      if (e.player === H) setTimeout(() => this.play('grown', { important: true, vol: 0.7 }), 450);
    });
    on('planter:unlocked', (e, H) => {
      if (e.player === H) this.play('unlock', { important: true });
    });
    on('cash:collected', (e, H) => {
      if (e.player === H && e.amount >= 1) this.play('coins', { amount: e.amount, important: true });
    });
    on('garden:full', (e, H) => {
      if (e.player === H) this.play('error', { important: true });
    });

    // stealing
    on('steal:start', (e, H) => {
      if (e.victim === H) this._startAlarm();
    });
    on('steal:grabbed', (e, H) => {
      if (e.thief === H) this._stopStealing();
      if (e.victim === H) this.play('stolen', { important: true });
      else if (e.thief === H) this.play('yoink', { important: true });
      else this.play('whoosh', pos(e.thief));
    });
    on('steal:success', (e, H) => {
      if (e.thief === H) this.play('heist', { important: true });
      else if (e.victim === H) this.play('robbed', { important: true });
      else this.play('coins', pos(e.thief, { amount: 50, vol: 0.4 }));
    });
    on('steal:foiled', (e, H) => {
      if (e.victim === H || e.by === H) this.play('saved', { important: true });
      else if (e.thief === H) this.play('dropped', { important: true });
      else this.play('sprout', pos(e.thief, { vol: 0.4 }));
    });

    // combat and movement
    on('bonk:swing', (e, H) => {
      if (e.player === H) this.play('whoosh', { important: true });
      else this.play('whoosh', pos(e.player));
    });
    on('player:hit', (e, H) => {
      const mine = e.target === H || e.by === H;
      const o = { who: e.target.id, voice: true };
      if (mine) this.play('hit', { ...o, important: true });
      else this.play('hit', { ...o, ...at(e.target), vol: 0.8 });
    });
    on('player:jump', (e, H) => {
      if (e.player === H) this.play('jump', { important: true });
      else this.play('jump', pos(e.player, { vol: 0.4 }));
    });
    on('banana:slip', (e, H) => {
      const mine = e.target === H || e.owner === H;
      this.play('slip', mine ? { important: true } : { x: e.x, z: e.z, vol: 0.8 });
    });
    on('balloon:splash', (e, H) => {
      this.play('splash', e.owner === H ? { important: true, vol: 0.9 } : { x: e.x, z: e.z, vol: 0.85 });
    });
    on('item:used', (e, H) => {
      if (e.player === H) this.play('item', { item: e.item, important: true });
      else this.play('item', pos(e.player, { item: e.item }));
    });
    on('item:fail', (e, H) => {
      if (e.player === H) this.play('error', { important: true });
    });
    on('item:empty', (e, H) => {
      if (e.player === H) this.play('error', { important: true, vol: 0.7 });
    });

    // monsters
    on('monster:aggro', (e, H) => {
      const m = e.monster;
      if (e.target === H) this.play('aggro', { type: m.type, important: true, vol: 0.9 });
      else this.play('aggro', { type: m.type, x: m.x, z: m.z, vol: 0.6 });
    });
    on('monster:caught', (e, H) => {
      const m = e.monster;
      if (e.target === H) this.play('chomp', { important: true });
      else this.play('chomp', { x: m.x, z: m.z, vol: 0.7 });
    });
    on('monster:bonked', (e, H) => {
      const m = e.monster;
      if (e.by === H) this.play('monsterBonk', { important: true });
      else this.play('monsterBonk', { x: m.x, z: m.z, vol: 0.7 });
    });

    // garden, shops, progression
    on('lock:on', (e, H) => {
      const L = e.garden.L.gate;
      this.play('lockOn', e.player === H ? { important: true } : { x: L.x, z: L.z, vol: 0.6 });
    });
    on('lock:off', (e, H) => {
      const L = e.garden.L.gate;
      this.play('lockOff', e.player === H ? { important: true, vol: 0.8 } : { x: L.x, z: L.z, vol: 0.5 });
    });
    on('purchase', (e, H) => {
      if (e.player === H) this.play('purchase', { important: true });
    });
    on('purchase:fail', (e, H) => {
      if (e.player === H) this.play('error', { important: true });
    });
    on('speed:up', (e, H) => {
      if (e.player === H) this.play('speedUp', { important: true });
    });
    on('rebirth', (e, H) => {
      if (e.player === H) this.play('rebirth', { important: true });
      else this.play('rebirth', pos(e.player, { vol: 0.5 }));
    });
    on('shop:open', (e, H) => {
      if (e.player === H) this.play('shopBell', { important: true });
    });
    on('event:start', (e) => {
      this.play('event', { type: e.event.type, important: true });
      this.music?.setEvent(e.event.type);
    });
    on('event:end', () => {
      if (!this.forceEvent) this.music?.setEvent(null);
    });
    on('match:end', () => {
      this.play('confetti', { important: true, vol: 0.8 });
      this.setMusicMode('victory');
    });

    this.subs.push(bus.on('game:dispose', (e) => {
      if (e.game === game) this.detach();
    }));
  }

  detach() {
    for (const off of this.subs) off();
    this.subs.length = 0;
    this._stopLoops();
    this.game = null;
    this.music?.setChase(false);
    if (!this.forceEvent) this.music?.setEvent(null);
  }

  _startAlarm() {
    const ac = this.ctx;
    if (!ac || ac.state !== 'running' || this.muted || hidden()) return;
    if (this.alarm && ac.currentTime < this.alarm.endsAt - 0.3) return;
    this.alarm?.stop(ac.currentTime + 0.01);
    this.alarm = alarmLoop(ac, this.mixer.sfxIn, ac.currentTime + 0.01, { max: 4 });
  }

  _stopAlarm() {
    if (!this.alarm) return;
    this.alarm.stop(this.ctx.currentTime);
    this.alarm = null;
  }

  _stopStealing() {
    if (!this.stealing) return;
    this.stealing.stop(this.ctx.currentTime);
    this.stealing = null;
  }

  _stopLoops() {
    if (!this.ctx) return;
    this._stopAlarm();
    this._stopStealing();
  }

  // ------------------------------------------------------------------ per frame

  update(dt, ctx) {
    const ac = this.ctx;
    if (!ac || ac.state !== 'running') return;
    this._tick();
    const game = ctx?.game;
    const H = ctx?.human;
    const state = ctx?.state;
    const playing = !!(game && H && game === this.game && (state === 'playing' || state === 'shop'));

    // listener: the human if any, else the camera; pan relative to the camera's right vector
    const cam = this._camera || (this._camera = W?.__app?.engine?.camera || null);
    if (cam) {
      const e = cam.matrixWorld.elements;
      const len = Math.hypot(e[0], e[2]) || 1;
      this.listener.rx = e[0] / len;
      this.listener.rz = e[2] / len;
    }
    if (H) {
      this.listener.x = H.pos.x;
      this.listener.z = H.pos.z;
    } else if (cam) {
      this.listener.x = cam.position.x;
      this.listener.z = cam.position.z;
    }

    if (!playing) {
      if (this.alarm || this.stealing) this._stopLoops();
      if (this.music?.chaseOn && !this.forceChase) this.music.setChase(false);
      return;
    }
    const now = ac.currentTime;

    // --- danger: carrying loot with a monster on you, sneaking a stolen plant home,
    //     or someone robbing your garden
    let danger = H.carrying?.kind === 'plant';
    let robbing = false;
    if (H.carrying && !danger) {
      for (const m of game.monsters) {
        if (m.target === H.slot) {
          danger = true;
          break;
        }
      }
    }
    const g = game.gardens[H.slot];
    for (const pl of g.planters) {
      if (pl.stealer != null && pl.stealer !== H.slot) {
        robbing = true;
        break;
      }
    }
    if (!danger) {
      for (const p of game.players) {
        if (p !== H && p.carrying?.kind === 'plant' && p.carrying.fromSlot === H.slot) {
          danger = true;
          break;
        }
      }
    }
    if (robbing || danger) this.dangerUntil = now + 2.2;
    const chase = this.forceChase || now < this.dangerUntil;
    if (chase !== this.music.chaseOn) this.music.setChase(chase);

    // --- alarm while a rival is mid-steal on your plant
    if (robbing) {
      if (!this.alarm || now > this.alarm.endsAt - 0.3) this._startAlarm();
    } else if (this.alarm) this._stopAlarm();

    // --- rising tension while you hold "steal"
    const it = H.interact;
    const stealingNow = it && it.verb === 'Steal' && it.t > 0 && !it.fired && it.hold > 0;
    if (stealingNow && !this.muted) {
      if (!this.stealing || now > this.stealing.endsAt - 0.2) {
        this.stealing?.stop(now + 0.01);
        this.stealing = stealLoop(ac, this.mixer.sfxIn, now + 0.01);
      }
      this.stealing.set(it.t / it.hold);
    } else if (this.stealing) this._stopStealing();

    // --- weather sparkle layer
    const evt = this.forceEvent ? game.event?.type || 'golden' : game.event?.type || null;
    if (evt !== this.music.eventType) this.music.setEvent(evt);
  }
}

export const audio = new GameAudio();
