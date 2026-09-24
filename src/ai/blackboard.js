// State shared by all bots of one Game: chat rate limits, who is going for which pod / garden,
// fairness timers so the rivals share targets instead of dogpiling the human, and a read of the
// human's progress (deepest biome, net worth, rank) that the rubber band keys off.
import { CHAT, PLANT, RARITY, BIOMES, PLAYER, speedAt } from '../config.js';
import { bus } from '../core/events.js';

const boards = new WeakMap();

const CHAT_GLOBAL_GAP = 3; // seconds between any two bot lines
const CHAT_BOT_GAP = 10; // seconds between two lines of the same bot
const HUMAN_TICK = 0.25; // seconds between two reads of the human's progress

export function getBoard(game) {
  let b = boards.get(game);
  if (!b) {
    b = {
      chatAt: -99,
      chatBy: new Map(), // slot -> time of last line
      podClaims: new Map(), // podId -> {slot, eta}
      stealClaims: new Map(), // bot slot -> victim slot
      humanStealUntil: 0, // no bot steals from the human before this time
      lastStealOn: new Map(), // victim slot -> time a bot last started stealing from them
      // the human's progress (see updateHuman)
      human: null,
      practice: { state: 'idle', slot: -1, at: 0, retryAt: 0 },
    };
    boards.set(game, b);
  }
  return b;
}

/**
 * What the bots know about the human's progress, refreshed a few times per second.
 *   deep     deepest Seed Road biome the human has grabbed a seed in (0 = Sunny Field)
 *   net      human net worth; lead = best bot net worth / human net worth
 *   last     the human is in last place
 *   movedAt  last time the human moved (AFK detection)
 * Null in attract mode (no human).
 */
export function updateHuman(game) {
  const b = getBoard(game);
  const h = game.human;
  if (!h) return null;
  let s = b.human;
  if (!s) {
    s = b.human = { deep: resumeDepth(game, h), carrying: h.carrying, net: 0, lead: 1, last: false, rank: 1, at: -1, x: h.pos.x, z: h.pos.z, movedAt: game.time };
  }
  if (game.time - s.at < HUMAN_TICK) return s;
  s.at = game.time;
  const c = h.carrying;
  if (c && c !== s.carrying && c.kind === 'seed') {
    // where the human actually went to get it (a seed picked up off the ground counts where it lay)
    const bi = game.biomeAt(h.pos.z);
    if (bi > s.deep) s.deep = bi;
  }
  s.carrying = c;
  if (Math.hypot(h.pos.x - s.x, h.pos.z - s.z) > 1.5) {
    s.x = h.pos.x;
    s.z = h.pos.z;
    s.movedAt = game.time;
  }
  const nw = game.netWorth;
  s.net = nw.get(h) || 0;
  let best = 0, below = 0;
  for (const p of game.players) {
    if (p === h) continue;
    const v = nw.get(p) || 0;
    if (v > best) best = v;
    if (v > s.net) below++;
  }
  s.rank = below + 1;
  s.last = below === game.players.length - 1;
  s.lead = best / Math.max(1, s.net);
  return s;
}

// A resumed Endless save: the garden tells how deep the human has been (stolen treasures aside),
// capped by how deep their speed lets them farm safely. A fresh match starts in Sunny Field.
function resumeDepth(game, h) {
  let deep = 0;
  for (const pl of game.gardens[h.slot].planters) {
    if (pl.plant) deep = Math.max(deep, Math.min(BIOMES.length - 1, RARITY[PLANT[pl.plant.speciesId].rarity].tier));
  }
  if (!deep) return 0;
  // can they carry a seed out of that biome faster than its monster runs?
  const carry = speedAt(h.speedLevel, h.rebirths) * PLAYER.carrySeedMult;
  let reach = 0;
  for (let i = 1; i < BIOMES.length; i++) if (carry > BIOMES[i].monster.speed) reach = i;
  return Math.min(deep, Math.max(1, reach));
}

/**
 * Rate-limited chat. `urgent` lines (being robbed, a steal) may cut the global gap in half.
 * `lines` overrides the config lines for this category (used for AI-only categories).
 * Returns true when the line was said.
 */
export function trySay(game, p, category, vars, { urgent = false, chance = 1, rng = Math.random, lines = null } = {}) {
  const b = getBoard(game);
  const now = game.time;
  const gap = urgent ? CHAT_GLOBAL_GAP * 0.5 : CHAT_GLOBAL_GAP;
  if (now - b.chatAt < gap) return false;
  if (now - (b.chatBy.get(p.slot) ?? -99) < (urgent ? CHAT_BOT_GAP * 0.6 : CHAT_BOT_GAP)) return false;
  if (rng() > chance) return false;
  b.chatAt = now;
  b.chatBy.set(p.slot, now);
  if (lines && !CHAT[p.id]?.[category]) sayLine(game, p, lines, vars, rng);
  else game.say(p, category, vars);
  return true;
}

// Same substitutions as Game.say, for AI-only lines that are not in config CHAT.
function sayLine(game, p, lines, vars, rng) {
  if (!lines.length) return;
  let text = lines[Math.floor(rng() * lines.length) % lines.length];
  if (lines.length > 1 && text === p._lastLine) text = lines[Math.floor(rng() * lines.length) % lines.length];
  p._lastLine = text;
  const all = { ...vars, human: game.human && game.human !== p ? game.human.name : 'everyone' };
  for (const [k, v] of Object.entries(all)) text = text.replaceAll(`{${k}}`, v);
  bus.emit('chat', { player: p, text });
}

/** Claim a pod so other bots pick different ones. Keeps the claim with the fastest arrival. */
export function claimPod(game, slot, podId, eta) {
  const b = getBoard(game);
  const c = b.podClaims.get(podId);
  if (!c || c.slot === slot || c.until < game.time || eta < c.eta - 2) {
    for (const [id, cl] of b.podClaims) if (cl.slot === slot && id !== podId) b.podClaims.delete(id);
    b.podClaims.set(podId, { slot, eta, until: game.time + eta + 4 });
    return true;
  }
  return false;
}

export function podClaimedByOther(game, slot, podId, myEta) {
  const c = getBoard(game).podClaims.get(podId);
  return !!c && c.slot !== slot && c.until > game.time && c.eta <= myEta + 2;
}

export function releaseClaims(game, slot) {
  const b = getBoard(game);
  for (const [id, cl] of b.podClaims) if (cl.slot === slot) b.podClaims.delete(id);
  b.stealClaims.delete(slot);
}

/** How many other bots currently plan to steal from `victimSlot`. */
export function stealersOn(game, victimSlot, exceptSlot) {
  let n = 0;
  for (const [s, v] of getBoard(game).stealClaims) if (s !== exceptSlot && v === victimSlot) n++;
  return n;
}
