// A family member in the match: state only (no rendering). Driven by an Intent each tick.
import { PLAYER, speedAt, ITEMS, BASE, BOOST, TREADMILL } from '../config.js';
import { sanitizeBaseStyle, BOT_STYLES } from './basestyle.js';

/**
 * Intent: what a controller (human input or bot brain) wants this tick.
 * moveX/moveZ: desired world-space direction (length 0..1).
 * jump/bonk/useItem are edge-triggered (true only on the tick they are pressed).
 * interact and sell are held (true while the button is down).
 */
export function emptyIntent() {
  return { moveX: 0, moveZ: 0, jump: false, interact: false, sell: false, bonk: false, useItem: null, selectSlot: null, aimYaw: null, emote: null, say: null, boost: false };
}

const NO_MODS = Object.freeze({ income: 1, speed: 1, hold: 1, magnet: 0, bonkCd: 1, grow: 1 });

export class Player {
  constructor(slot, char, isHuman) {
    this.slot = slot;
    this.id = char.id; // the slot's family character (chat lines, namesake plant, bot personality)
    this.char = char;
    this.name = char.name;
    this.isHuman = isHuman; // the LOCAL human on this device
    // who is playing this slot: 'local' (this device), 'remote' (someone else online), 'bot' or 'empty' (nobody)
    this.kind = isHuman ? 'local' : 'bot';
    this.profileId = char.id;
    this.faceKey = char.id; // avatars/faces are looked up by this key (see characters/faces.js)
    this.pid = null; // network id when online
    this.look = char.look;
    this.pet = null; // the first active pet's species id (views, older code)
    this.pets = []; // equipped team: up to 3 species ids; only the first petSlotsFor(baseLevel) count
    this.petNames = []; // their nicknames, same order ('' = none)
    this.petMail = []; // pet trades for this player's device: [{tid, give: [uid], get: [{id, name}]}] until acked (Game.trade)
    this.mods = NO_MODS; // pet boosts (Game._refreshMods)
    this.baseLevel = 1; // BASE levels: survive rebirth
    this.baseStyle = sanitizeBaseStyle(isHuman ? null : BOT_STYLES[char.id]); // Base Studio picks
    this.boostLevel = 0; // Boost Lab level (0-10): survives rebirth
    this.boostUntil = 0;
    this.boostReadyAt = 0;
    this.treadmillTier = 0; // index into TREADMILL.tiers: survives rebirth
    this.pumpUntil = 0; // Pumped! (warm-up buff) until this time
    this.pumpMult = 1;
    this.trainT = 0; // seconds warmed up on a warm-up treadmill so far
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
    this.sell = { key: null, t: 0, hold: 0, label: '' }; // the Sell prompt (its own button: V / Sell / D-pad down)
    this.prevSell = false;
    this.intent = null;
    this.controller = null;
    this.lastHitBy = null;
    this.stats = { steals: 0, robbed: 0, planted: 0, bonks: 0, collected: 0, best: null, seeds: 0, eggs: 0 };
  }

  get stunned() {
    return this._now < this.stunUntil;
  }

  // Top ground speed right now (studs/s).
  maxSpeed(now, diffMult = 1) {
    let s = speedAt(this.speedLevel, this.rebirths);
    if (now < this.coilUntil) s *= 1.5;
    if (now < this.boostUntil) s *= BOOST.power(this.boostLevel);
    if (now < this.pumpUntil) s *= this.pumpMult;
    if (this.carrying?.kind === 'seed') s *= PLAYER.carrySeedMult;
    if (this.carrying?.kind === 'plant') s *= PLAYER.carryPlantMult;
    return s * this.mods.speed * (this.kind === 'bot' ? diffMult : 1);
  }

  /** Controlled by a person (this device or online), not a bot (or nobody). */
  get isPlayer() {
    return this.kind === 'local' || this.kind === 'remote';
  }

  /** In the world: someone (a person or a bot) plays this garden. 'empty' slots (an online room with fewer
   *  computer players) sit out of sight and out of the rules. */
  get present() {
    return this.kind !== 'empty';
  }

  /** 0..1 how recharged Boost is (1 = ready). */
  boostCharge(now) {
    const cd = BOOST.cooldown(this.boostLevel);
    return now >= this.boostReadyAt ? 1 : Math.max(0, 1 - (this.boostReadyAt - now) / cd);
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
      baseLevel: this.baseLevel,
      boostLevel: this.boostLevel,
      treadmillTier: this.treadmillTier,
      // a bot's team comes from egg drops; a person's team lives on their profile
      pets: this.kind === 'bot' ? this.pets : undefined,
    };
  }

  restore(s) {
    if (!s) return;
    const num = (v, d) => (Number.isFinite(v) && v >= 0 ? v : d);
    this.cash = num(s.cash, this.cash);
    this.speedLevel = Math.min(999, Math.floor(num(s.speedLevel, 0)));
    this.rebirths = Math.floor(num(s.rebirths, 0));
    this.upgradeSpend = num(s.upgradeSpend, 0);
    if (s.items && typeof s.items === 'object') for (const k of Object.keys(this.items)) this.items[k] = Math.floor(num(s.items[k], 0));
    if (s.stats && typeof s.stats === 'object') for (const k of Object.keys(this.stats)) if (k !== 'best') this.stats[k] = num(s.stats[k], 0);
    this.baseLevel = Math.max(1, Math.min(BASE.maxLevel, Math.floor(num(s.baseLevel, 1))));
    this.boostLevel = Math.min(BOOST.maxLevel, Math.floor(num(s.boostLevel, 0)));
    this.treadmillTier = Math.min(TREADMILL.tiers.length - 1, Math.floor(num(s.treadmillTier, 0)));
    if (this.kind === 'bot' && Array.isArray(s.pets)) this.pets = s.pets.filter((id) => typeof id === 'string').slice(0, 3);
  }
}
