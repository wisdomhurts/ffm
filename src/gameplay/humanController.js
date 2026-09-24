// Turns device input + camera orientation into an Intent for the human's Player.
import { emptyIntent } from './player.js';
import { ITEMS } from '../config.js';

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
    };
    this.frameEdges = e;
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
    it.moveX = fx * a.y + rx * a.x;
    it.moveZ = fz * a.y + rz * a.x;
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
      if (e.item === 'selected') it.useItem = p.selectedItem;
      else if (e.item != null) {
        it.useItem = e.item;
        it.selectSlot = e.item;
      }
      if (e.select) it.selectSlot = (p.selectedItem + e.select + ITEMS.length) % ITEMS.length;
      // consume edges after the first substep
      this.frameEdges = null;
    }
    return it;
  }
}
