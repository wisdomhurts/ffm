// Turns device input + camera orientation into an Intent for the human's Player.
import { emptyIntent } from './player.js';
import { ITEMS, GEARS } from '../config.js';
import { settings, setSetting } from '../core/settings.js';
import { bus } from '../core/events.js';

export class HumanController {
  constructor(input, cam) {
    this.input = input;
    this.cam = cam;
    this.frameEdges = null;
    this.game = null;
    this._tapHold = 0;
  }

  // Called once per rendered frame (before game.update) to latch edge actions for this frame.
  beginFrame() {
    const i = this.input;
    i.pollGamepad();
    const e = {
      jump: i.take('jump'),
      bonk: i.take('bonk'),
      item: i.take('item'),
      select: i.take('select'),
      interactTap: i.take('interactTap'),
      boost: i.take('boost'),
    };
    this.frameEdges = e;
    if (i.take('gear')) this.cycleGear();
    // a quick tap on E / the Action button counts as a short hold, long enough for 0.25 s grabs;
    // a new tap during that hold first reports a release so it registers as a fresh press
    if (e.interactTap) {
      // a fresh press always follows a release, so if we were still reporting "held" insert one
      this._tapRelease = !!this._lastInteract;
      this._tapHold = 0.35;
    }
  }

  getIntent(game, p, dt = 1 / 60) {
    const it = emptyIntent();
    if (!this.input.enabled) {
      // a menu took over: drop any E-tap in flight so it can't re-fire when the menu closes
      this._tapHold = 0;
      this.frameEdges = null;
      return it;
    }
    const a = this.input.axis();
    const yaw = this.cam.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    // speed gears: ask for part of your top speed (fine control when you're super fast)
    const g = (GEARS[this.gear] || GEARS[GEARS.length - 1]).mult;
    it.moveX = (fx * a.y + rx * a.x) * g;
    it.moveZ = (fz * a.y + rz * a.x) * g;
    // A tap on E / the action button counts as holding for a moment (instant actions fire on it).
    if (this._tapRelease) {
      this._tapRelease = false;
      it.interact = false;
    } else {
      it.interact = this.input.interactHeld() || this._tapHold > 0;
      this._tapHold = Math.max(0, (this._tapHold || 0) - dt);
    }
    this._lastInteract = it.interact;
    const e = this.frameEdges;
    if (e) {
      it.jump = !!e.jump;
      it.bonk = !!e.bonk;
      it.boost = !!e.boost;
      if (e.item === 'selected') it.useItem = p.selectedItem;
      else if (e.item != null) {
        it.useItem = e.item;
        it.selectSlot = e.item;
      }
      if (e.select) it.selectSlot = (p.selectedItem + e.select + ITEMS.length) % ITEMS.length;
      // consume edges after the first substep
      this.frameEdges = null;
    }
    // one-shot requests from the UI (emote wheel, quick chat): delivered with the next intent
    if (this._queued) {
      Object.assign(it, this._queued);
      this._queued = null;
    }
    return it;
  }

  /** Speed gear index into GEARS (0 slow .. 2 full). Saved in settings. */
  get gear() {
    return settings.speedGear ?? GEARS.length - 1;
  }

  cycleGear(to) {
    const n = Number.isInteger(to) ? to : (this.gear + 1) % GEARS.length;
    setSetting('speedGear', n);
    bus.emit('gear:changed', { gear: n, def: GEARS[n] });
  }

  /** Put a one-shot intent field (emote, say) into the next tick. */
  queue(field, value) {
    (this._queued ||= {})[field] = value;
  }
}
