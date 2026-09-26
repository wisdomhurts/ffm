// A family member in the match: state only (no rendering). Driven by an Intent each tick.
import { PLAYER, speedAt, ITEMS } from '../config.js';

/**
 * Intent: what a controller (human input or bot brain) wants this tick.
 * moveX/moveZ: desired world-space direction (length 0..1).
 * jump/bonk/useItem are edge-triggered (true only on the tick they are pressed).
 * interact is held (true while the button is down).
 */
export function emptyIntent() {
  return { moveX: 0, moveZ: 0, jump: false, interact: false, bonk: false, useItem: null, selectSlot: null, aimYaw: null, emote: null, say: null };
}

const NO_MODS = Object.freeze({ income: 1, speed: 1, hold: 1, magnet: 0, bonkCd: 1 });

export class Player {
  constructor(slot, char, isHuman) {
    this.slot = slot;
    this.id = char.id; // the slot's family character (chat lines, namesake plant, bot personality)
    this.char = char;
    this.name = char.name;
    this.isHuman = isHuman; // the LOCAL human on this device
    // who is playing this slot: 'local' (this device), 'remote' (someone else online) or 'bot'
    this.kind = isHuman ? 'local' : 'bot';
    this.profileId = char.id;
    this.faceKey = char.id; // avatars/faces are looked up by this key (see characters/faces.js)
    this.pid = null; // network id when online
    this.look = char.look;
    this.pet = null; // equipped pet species id
    this.mods = NO_MODS; // pet boosts, set by Game.setPet
    this.emote = null; // {id, until}
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
    return s * this.mods.speed * (this.kind === 'bot' ? diffMult : 1);
  }

  /** Controlled by a person (this device or online), not a bot. */
  get isPlayer() {
    return this.kind !== 'bot';
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
    const num = (v, d) => (Number.isFinite(v) && v >= 0 ? v : d);
    this.cash = num(s.cash, this.cash);
    this.speedLevel = Math.min(25, Math.floor(num(s.speedLevel, 0)));
    this.rebirths = Math.floor(num(s.rebirths, 0));
    this.upgradeSpend = num(s.upgradeSpend, 0);
    if (s.items && typeof s.items === 'object') for (const k of Object.keys(this.items)) this.items[k] = Math.floor(num(s.items[k], 0));
    if (s.stats && typeof s.stats === 'object') for (const k of Object.keys(this.stats)) if (k !== 'best') this.stats[k] = num(s.stats[k], 0);
  }
}
