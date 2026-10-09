// The family bots and the round 4 moments: calls for help (Help! Family Hero), thanking a hero, and a WHOA at a
// fresh GIANT or TITAN plant (Giant Harvests). The rules live in gameplay/game.js; this is how the bots react.
//   robberOf(game, victim)           who is robbing `victim` right now (at one of their planters, or running off
//                                    with one of their plants), or null
//   callForHelp(game, caller, rng)   a person said "Help!" while being robbed: each family bot decides by personality
//                                    (config HERO.help: range to the thief, chance) and the ones that go chase the
//                                    thief (brain.js HelpGoal). Returns [{bot, yes}] (social/botReact.js says the lines)
//   helpTarget(game, bot)            {thief, victim} this bot promised to help, while the thief is still at it, else null
//   owesHero(game, bot, victim)      a bot rescued by `victim` lately (HERO.owes s) leaves their garden alone
//   thankHero(game, e)               on 'steal:rescued': the rescued bot thanks its hero
//   cheerGiant(game, e)              on 'plant:giant': a bot near a fresh GIANT / TITAN plant shouts WHOA
// thankHero / cheerGiant run where the bots think (offline, or the host of a room: fx/giants.js wires them).
import { HERO, SIZES } from '../config.js';
import { getBoard, trySay } from './blackboard.js';

const hyp = (dx, dz) => Math.sqrt(dx * dx + dz * dz);

/** Is q robbing victim v right now (holding a steal at v's planter, or carrying v's plant)? */
export function isRobbing(game, q, v) {
  if (!q || !v || q === v) return false;
  if (q.carrying?.kind === 'plant') return q.carrying.fromSlot === v.slot;
  return game.gardens[v.slot].planters.some((pl) => pl.stealer === q.slot);
}

export function robberOf(game, victim) {
  for (const q of game.players) if (q.present && isRobbing(game, q, victim)) return q;
  return null;
}

export function callForHelp(game, caller, rng = game.rng) {
  const thief = caller ? robberOf(game, caller) : null;
  if (!thief) return [];
  const board = getBoard(game);
  const help = (board.help ||= new Map());
  const out = [];
  for (const b of game.players) {
    const ctrl = b.controller;
    if (b.kind !== 'bot' || !b.present || b === caller || b === thief || !ctrl) continue;
    const [range, chance] = HERO.help[ctrl.personality] || [60, 0.5];
    const yes = hyp(b.pos.x - thief.pos.x, b.pos.z - thief.pos.z) <= range && rng.next() < chance;
    if (yes) {
      help.set(b.slot, { victim: caller.slot, thief: thief.slot, until: game.time + HERO.helpFor });
      // think again right away (after a human-like beat), not at the next scheduled decision
      if (Number.isFinite(ctrl.nextDecideAt)) ctrl.nextDecideAt = Math.min(ctrl.nextDecideAt, game.time + (ctrl.diff?.reaction ?? 0.5) * 0.5);
    }
    out.push({ bot: b, yes });
  }
  return out;
}

export function helpTarget(game, bot) {
  const help = getBoard(game).help;
  const h = help?.get(bot.slot);
  if (!h) return null;
  const thief = game.players[h.thief], victim = game.players[h.victim];
  if (game.time > h.until || !isRobbing(game, thief, victim)) {
    help.delete(bot.slot);
    return null;
  }
  return { thief, victim };
}

export function owesHero(game, bot, victim) {
  const log = game.rescues;
  if (!log?.length) return false;
  for (const r of log) if (r.victim === bot.slot && r.hero === victim.slot && game.time - r.at < HERO.owes) return true;
  return false;
}

/** The rescued bot thanks its hero (skipping the chat cooldowns: a thank-you can't wait). */
export function thankHero(game, { hero, victim, plant } = {}) {
  if (!game || !hero || victim?.kind !== 'bot' || !victim.present) return false;
  const board = getBoard(game);
  const last = board.chatBy.get(victim.slot), lastAny = board.chatAt;
  board.chatBy.set(victim.slot, -99);
  board.chatAt = -99;
  const name = plant ? game.plantName(plant.speciesId, plant.mutation) : 'plant';
  const said = trySay(game, victim, 'thanks', { hero: hero.name, plant: name }, { urgent: true, rng: game.rng.next });
  if (!said) {
    if (last != null) board.chatBy.set(victim.slot, last);
    board.chatAt = lastAny;
  }
  return said;
}

/** A family bot near a fresh GIANT or TITAN plant (a TITAN's beam shows from anywhere) shouts WHOA. */
export function cheerGiant(game, { plant, planter } = {}) {
  if (!game || !plant || (plant.size !== 'giant' && plant.size !== 'titan') || !planter) return false;
  let bot = null, bd = plant.size === 'titan' ? Infinity : 70;
  for (const b of game.players) {
    if (b.kind !== 'bot' || !b.present) continue;
    const d = hyp(b.pos.x - planter.x, b.pos.z - planter.z);
    if (d < bd) {
      bd = d;
      bot = b;
    }
  }
  if (!bot) return false;
  const vars = { plant: game.plantName(plant.speciesId, plant.mutation), size: SIZES[plant.size].name };
  return trySay(game, bot, 'giant', vars, { urgent: true, chance: 0.9, rng: game.rng.next });
}
