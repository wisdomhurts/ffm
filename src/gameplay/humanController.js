// Turns device input + camera orientation into an Intent for the human's Player.
import { emptyIntent } from './player.js';
import { ITEMS } from '../config.js';

export class HumanController {
  constructor(input, cam) {
    this.input = input;
    this.cam = cam;
    this.frameEdges = null;
    this.game = null;
    this._interactTapFrames = 0;
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
    this._interactTapFrames = e.interactTap ? 2 : this._interactTapFrames;
  }

  getIntent(game, p) {
    const it = emptyIntent();
    if (!this.input.enabled) {
      // a menu took over: drop any E-tap in flight so it can't re-fire when the menu closes
      this._interactTapFrames = 0;
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
    it.interact = this.input.interactHeld() || this._interactTapFrames > 0;
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
      if (this._interactTapFrames > 0) this._interactTapFrames--;
    }
    return it;
  }
}
