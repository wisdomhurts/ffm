// A family member in the match: state only (no rendering). Driven by an Intent each tick.
import { PLAYER, speedAt, ITEMS } from '../config.js';

/**
 * Intent: what a controller (human input or bot brain) wants this tick.
 * moveX/moveZ: desired world-space direction (length 0..1).
 * jump/bonk/useItem are edge-triggered (true only on the tick they are pressed).
 * interact is held (true while the button is down).
 */
export function emptyIntent() {
  return { moveX: 0, moveZ: 0, jump: false, interact: false, bonk: false, useItem: null, selectSlot: null, aimYaw: null, emote: null };
}

export class Player {
  constructor(slot, char, isHuman) {
    this.slot = slot;
    this.id = char.id;
    this.char = char;
    this.name = char.name;
    this.isHuman = isHuman;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; // facing; 0 = +Z (north), increases counter-clockwise seen from above (atan2(x, z))
    this.onGround = true;
    this.cash = PLAYER.startCash;
    this.speedLevel = 0;
    this.rebirths = 0;
    this.upgradeSpend = 0; // cash spent on speed/planters (counts half towards net worth)
    this.items = Object.fromEntries(ITEMS.map((i) => [i.id, 0]));
    this.selectedItem = 0;
    /** null | {kind:'seed', speciesId, mutation, podId} | {kind:'plant', plant, fromSlot, fromIndex} */
    this.carrying = null;
    this.stunUntil = 0;
    this.invulnUntil = 0;
    this.bonkReadyAt = 0;
    this.swingStart = -10; // time a noodle swing started (for animation)
    this.coilUntil = 0;
    this.cloakUntil = 0;
    this.celebrateUntil = 0;
    this.interact = { key: null, t: 0, hold: 0, label: '' };
    this.prevInteract = false;
    this.intent = null;
    this.controller = null;
    this.lastHitBy = null;
    this.stats = { steals: 0, robbed: 0, planted: 0, bonks: 0, collected: 0, best: null, seeds: 0 };
  }

  get stunned() {
    return this._now < this.stunUntil;
  }

  // Top ground speed right now (studs/s).
  maxSpeed(now, diffMult = 1) {
    let s = speedAt(this.speedLevel, this.rebirths);
    if (now < this.coilUntil) s *= 1.5;
    if (this.carrying?.kind === 'seed') s *= PLAYER.carrySeedMult;
    if (this.carrying?.kind === 'plant') s *= PLAYER.carryPlantMult;
    return s * (this.isHuman ? 1 : diffMult);
  }

  invisible(now) {
    return now < this.cloakUntil;
  }

  serialize() {
    return {
      id: this.id,
      cash: this.cash,
      speedLevel: this.speedLevel,
      rebirths: this.rebirths,
      upgradeSpend: this.upgradeSpend,
      items: this.items,
      stats: this.stats,
    };
  }

  restore(s) {
    if (!s) return;
    this.cash = s.cash ?? this.cash;
    this.speedLevel = s.speedLevel ?? 0;
    this.rebirths = s.rebirths ?? 0;
    this.upgradeSpend = s.upgradeSpend ?? 0;
    Object.assign(this.items, s.items || {});
    Object.assign(this.stats, s.stats || {});
  }
}
