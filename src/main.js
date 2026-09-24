// App shell: boots the engine and world once, runs the title "attract mode", and starts/stops matches.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { createBanana, createBalloon } from './fx/props.js';
import { createPlantView, createSeedView, createCarriedPlantView } from './plants/plantMeshes.js';
import { Input } from './core/input.js';
import { FollowCamera, reducedMotion } from './core/camera.js';
import { bus } from './core/events.js';
import { settings } from './core/settings.js';
import { load, save, remove } from './core/save.js';
import { CHARACTERS, CHARACTER } from './config.js';
import { LAYOUT } from './gameplay/layout.js';
import { Game } from './gameplay/game.js';
import { HumanController } from './gameplay/humanController.js';
import { BotController } from './ai/bot.js';
import { buildWorld } from './world/world.js';
import { GameView } from './view/gameView.js';
import { Labels } from './view/labels.js';
import { createEffects } from './fx/effects.js';
import { audio } from './audio/audio.js';
import { injectStyles } from './ui/styles.js';
import { createHUD } from './ui/hud.js';
import { createMenus } from './ui/menus.js';
import { createTouchControls } from './ui/touch.js';

const SAVE_EVERY = 12;

// A hidden set of rarely-seen objects compiled up front (see _newGame).
function buildWarmupGroup() {
  const g = new THREE.Group();
  g.name = 'shader-warmup';
  g.add(createBanana(), createBalloon());
  for (const m of ['normal', 'gold', 'diamond', 'rainbow']) {
    g.add(createPlantView('starlotus', m).object3d);
    g.add(createSeedView('galaxyorchid', m).object3d);
  }
  g.add(createPlantView('dorianfruit', 'normal').object3d, createCarriedPlantView('lavalily', 'gold').object3d);
  g.traverse((o) => (o.frustumCulled = false));
  return g;
}

class App {
  constructor() {
    injectStyles();
    this.container = document.getElementById('app') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'app' });
    this.engine = new Engine(this.container);
    this.root = document.createElement('div');
    this.root.id = 'ui';
    this.container.appendChild(this.root);
    this.labels = new Labels(this.container, this.engine.camera);
    // keep labels under the UI layer
    this.container.insertBefore(this.labels.root, this.root);
    this.input = new Input(this.engine.renderer.domElement);
    this.world = buildWorld(this.engine, LAYOUT, this.engine.quality);
    this.fx = createEffects(this.engine, this.container);
    this.audio = audio;
    this.settings = settings;
    this.bus = bus;
    this.game = null;
    this.view = null;
    this.hud = null;
    this.human = null;
    this.state = 'boot';
    this.cam = null;
    this.menus = createMenus(this);
    this.touch = createTouchControls(this);
    this.engine.add((dt, t) => this.frame(dt, t));
    this._saveTimer = 0;
    window.addEventListener('pagehide', () => this.saveNow());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveNow();
        if (this.state === 'playing') this.pause();
      }
    });
    bus.on('shop:open', ({ player, shop }) => {
      if (player === this.human && this.state === 'playing') this.menus.openShop(shop);
    });
    // Graphics context lost (GPU reset): pause and tell the player instead of showing a white screen.
    bus.on('engine:contextlost', () => {
      if (this.state === 'playing') this.pause();
      this._showGfxNotice(true);
    });
    bus.on('engine:contextrestored', () => this._showGfxNotice(false));
    bus.on('player:hit', ({ target }) => {
      if (target === this.human && this.state === 'shop') this.resume();
    });
    bus.on('camera:shake', ({ amount = 0.5 } = {}) => this.cam?.addShake(amount));
    bus.on('match:end', ({ ranking }) => {
      if (!this.human) return;
      this.state = 'ended';
      bus.emit('app:state', { state: 'ended' });
      this.touch.setVisible(false);
      this.menus.showEnd(ranking);
      remove('save:showdown');
    });
  }

  _showGfxNotice(on) {
    clearTimeout(this._gfxTimer);
    if (!on) {
      this._gfxEl?.remove();
      this._gfxEl = null;
      return;
    }
    if (this._gfxEl) return;
    const el = document.createElement('div');
    el.className = 'gfx-notice panel';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:rgba(14,18,48,.82);color:#fff;font:700 20px/1.4 system-ui,sans-serif;text-align:center;padding:24px;z-index:9999;pointer-events:auto';
    el.innerHTML = '<div><div>Graphics paused. Restoring…</div><button type="button" hidden style="margin-top:16px;font:inherit;padding:10px 22px;border-radius:14px;border:3px solid #10163a;background:#3fd65a;color:#10163a;cursor:pointer">Tap to reload</button></div>';
    const btn = el.querySelector('button');
    btn.onclick = () => {
      this.saveNow();
      location.reload();
    };
    this._gfxTimer = setTimeout(() => (btn.hidden = false), 5000);
    this.container.appendChild(el);
    this._gfxEl = el;
  }

  start() {
    this.startAttract();
    this.menus.showTitle();
    this.engine.start();
    // expose for tests / debugging
    window.__app = this;
  }

  // ---------------------------------------------------------------- matches

  _newGame(opts) {
    this.disposeGame();
    const game = new Game({ ...opts, extraColliders: this.world.extraColliders || [] });
    this.game = game;
    this.cam = new FollowCamera(this.engine.camera, game.physics);
    for (const p of game.players) {
      p.controller = p.isHuman ? (this.humanCtrl = new HumanController(this.input, this.cam)) : new BotController(p.char.personality, game.difficultyId);
    }
    this.human = game.human;
    this.view = new GameView({ engine: this.engine, game, world: this.world, labels: this.labels, fx: this.fx });
    // Build every shader now (incl. far-away monsters and things that only appear later:
    // items, mutations, carried pots) so nothing hitches the first time it appears.
    try {
      const r = this.engine.renderer;
      const warm = this._warmGroup || (this._warmGroup = buildWarmupGroup());
      warm.position.set(0, -400, 0);
      this.engine.scene.add(warm);
      const done = () => this.engine.scene.remove(warm);
      if (r.compileAsync) r.compileAsync(this.engine.scene, this.engine.camera).then(done, done);
      else {
        r.compile(this.engine.scene, this.engine.camera);
        done();
      }
    } catch {
      /* optional warm-up */
    }
    this.fx.attach?.(game);
    this.audio.attach(game);
    return game;
  }

  startAttract() {
    this._newGame({ humanId: null, mode: 'endless', difficulty: 'normal' });
    // give the bots a head start so the title screen looks lively
    for (let i = 0; i < 40 * 4; i++) this.game.update(1 / 40);
    this._warmup = 40 * 16; // the rest of the head start is spread over the first title frames
    this.state = 'title';
    this.touch.setVisible(false);
    this.audio.setMusicMode('title');
    this._attractAngle = 0;
    bus.emit('app:state', { state: 'title' });
  }

  /** opts: {charId, mode:'endless'|'showdown', difficulty, fresh:boolean} */
  startGame({ charId, mode = 'endless', difficulty = settings.difficulty, fresh = false }) {
    const saveKey = `save:${mode}:${charId}`;
    const saved = !fresh && mode === 'endless' ? load(saveKey, null) : null;
    let game;
    try {
      game = this._newGame({ humanId: charId, mode, difficulty, save: saved });
    } catch (e) {
      console.warn('[save] unreadable save, starting fresh', e);
      game = this._newGame({ humanId: charId, mode, difficulty, save: null });
    }
    game.saveKey = mode === 'endless' ? saveKey : null;
    this.hud = createHUD(this);
    this.menus.hideAll();
    this.cam.snapBehind(this.human.yaw);
    this.cam.yaw = this.human.yaw;
    this.cam.playIntro(reducedMotion() ? 0.01 : 2.4);
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    this.touch.setVisible(true);
    this.audio.unlock();
    this.audio.setMusicMode('play');
    bus.emit('game:start', { game, human: this.human, resumed: !!saved });
    bus.emit('app:state', { state: 'playing' });
  }

  hasSave(charId) {
    return !!load(`save:endless:${charId}`, null);
  }

  saveNow() {
    const g = this.game;
    if (!g || !g.human || !g.saveKey || this.state === 'title') return;
    save(g.saveKey, g.serialize());
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.game.paused = true;
    this.input.reset();
    this.touch.setVisible(false);
    this.menus.showPause();
    bus.emit('app:state', { state: 'paused' });
  }

  resume() {
    if (this.state !== 'paused' && this.state !== 'shop') return;
    this.state = 'playing';
    this.game.paused = false;
    this.menus.hidePause();
    this.menus.closeShop();
    this.input.reset();
    if (this.humanCtrl) this.humanCtrl._tapHold = 0;
    this.touch.setVisible(true);
    bus.emit('app:state', { state: 'playing' });
  }

  quitToTitle() {
    this.saveNow();
    this.startAttract();
    this.menus.showTitle();
  }

  disposeGame() {
    if (!this.game) return;
    bus.emit('game:dispose', { game: this.game });
    this.hud?.dispose();
    this.hud = null;
    this.view?.dispose();
    this.view = null;
    this.labels.clear();
    this.game = null;
    this.human = null;
    this.humanCtrl = null;
  }

  // ---------------------------------------------------------------- frame

  frame(dt, t) {
    const g = this.game;
    if (!g) return;
    if (this.state === 'paused' || this.state === 'shop') {
      this.input.pollGamepad(); // Start works in menus too
      if (this.input.take('interactTap')) this.input.latched.pause = true; // B = back
    }
    if (this.input.take('pause')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused' || this.state === 'shop') this.resume();
    }
    if (this.state === 'playing' && this.humanCtrl) this.humanCtrl.beginFrame();
    if (this.state === 'playing' || this.state === 'title' || this.state === 'shop') g.update(dt);
    if (this.state === 'title' && this._warmup > 0) {
      for (let i = 0; i < 6 && this._warmup > 0; i++, this._warmup--) g.update(1 / 40);
    }
    // camera
    if (this.human && this.state !== 'title') {
      const p = this.human;
      const moving = Math.hypot(p.vel.x, p.vel.z) > 2;
      this.cam.update(dt, this.state === 'playing' ? this.input : null, p.pos, p.yaw, moving);
      this.engine.setFocus(p.pos.x, p.pos.y, p.pos.z);
    } else {
      // attract mode: slow orbit over the plaza and gardens
      this._attractAngle = (this._attractAngle || 0) + dt * 0.06;
      const a = this._attractAngle;
      const cam = this.engine.camera;
      cam.position.set(Math.sin(a) * 95, 48, Math.cos(a) * 95 - 5);
      cam.lookAt(0, 4, 10);
      this.engine.setFocus(0, 0, 0);
    }
    this.labels.begin();
    this.view?.update(dt, t, this.engine.camera);
    this.world.update(dt, { time: t, camera: this.engine.camera, focus: this.human ? this.human.pos : { x: 0, y: 0, z: 0 }, event: g.event, game: g });
    this.fx.update(dt, t);
    this.hud?.update(dt, t);
    this.touch.update(dt);
    this.audio.update(dt, { game: g, human: this.human, state: this.state });
    this.labels.end();
    if (this.state === 'playing' && g.saveKey) {
      this._saveTimer += dt;
      if (this._saveTimer > SAVE_EVERY) {
        this._saveTimer = 0;
        this.saveNow();
      }
    }
  }
}

function boot() {
  try {
    const app = new App();
    app.start();
  } catch (e) {
    console.error(e);
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;color:#fff;font:600 18px system-ui;background:#1b2440;text-align:center;padding:24px';
    el.textContent = 'Steal A Seed needs WebGL to run. Try another browser or device. (' + (e?.message || e) + ')';
    document.body.appendChild(el);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { CHARACTERS, CHARACTER };
