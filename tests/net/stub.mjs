// A tiny stand-in for the browser App (src/main.js) so online rooms can run in Node:
// real Game, real bots, real session/transport, scripted input instead of a keyboard.
import { Game } from '../../src/gameplay/game.js';
import { emptyIntent } from '../../src/gameplay/player.js';
import { BotController } from '../../src/ai/bot.js';
import { getProfile, createProfile, updateProfile } from '../../src/core/profiles.js';
import { createOnline } from '../../src/net/session.js';
import { createTransport, MemoryHub } from '../../src/net/transport.js';

export { MemoryHub };

/** Scripted "gamepad": set moveX/moveZ/hold, press('jump'|'bonk'|..) for one-shot edges. */
export class Pad {
  constructor() {
    this.moveX = 0;
    this.moveZ = 0;
    this.hold = false;
    this.edges = {};
    this._queued = null;
  }
  press(k, v = true) {
    this.edges[k] = v;
  }
  queue(field, value) {
    (this._queued ||= {})[field] = value;
  }
  getIntent() {
    const it = emptyIntent();
    it.moveX = this.moveX;
    it.moveZ = this.moveZ;
    it.interact = this.hold;
    Object.assign(it, this.edges);
    this.edges = {};
    if (this._queued) {
      Object.assign(it, this._queued);
      this._queued = null;
    }
    return it;
  }
}

export class StubApp {
  constructor(name, { hub, profileId = null, base = 'dorian', pid = null } = {}) {
    this.label = name;
    const prof = profileId ? getProfile(profileId) : createProfile({ name, base });
    this.profileId = prof.id;
    this.game = null;
    this.human = null;
    this.humanCtrl = null;
    this.state = 'title';
    this.pad = new Pad();
    this.worlds = 0;
    this.transport = createTransport('memory', { hub });
    this.online = createOnline(this, { transport: this.transport, pid });
  }
  get profile() {
    return getProfile(this.profileId);
  }
  setProfileData(patch) {
    updateProfile(this.profileId, patch);
  }
  startOnline(opts) {
    const game = new Game({ mode: 'endless', difficulty: 'normal', ...opts });
    for (const p of game.players) {
      if (p.kind === 'local') p.controller = this.humanCtrl = this.pad;
      else if (p.kind === 'bot') p.controller = new BotController(p.char.personality, game.difficultyId);
    }
    this.game = game;
    this.human = game.human;
    this.state = 'playing';
    this.worlds++;
    return game;
  }
  quitToTitle() {
    this.online.leave();
    this.game = null;
    this.human = null;
    this.state = 'title';
  }
  // same routing as App.act in src/main.js
  act(name, ...args) {
    if (this.online?.isClient) return this.online.act(name, args);
    const g = this.game;
    const p = this.human;
    if (!g || !p) return false;
    switch (name) {
      case 'buyItem': return g.buyItem(p, args[0], args[1] ?? 1);
      case 'buySpeed': return g.buySpeed(p);
      case 'rebirth': return g.rebirth(p);
      case 'buyEgg': return g.buyEgg(p, args[0]);
      case 'setPet': g.setPet(p, args[0] ?? null); return true;
      case 'setLook': g.setLook(p, args[0]); return true;
      case 'gift': return g.giftPlant(p, g.players[args[0]], args[1]);
      case 'emote':
      case 'say':
        this.humanCtrl?.queue(name, args[0]);
        return true;
      case 'addCash':
        if (Number.isFinite(args[0]) && args[0] > 0) p.cash += Math.floor(args[0]);
        return true;
      default:
        return this.online?.act?.(name, args);
    }
  }
  frame(dt) {
    if (this.online.room) this.online.update(dt);
    else if (this.game && this.state === 'playing') this.game.update(dt);
  }
}
