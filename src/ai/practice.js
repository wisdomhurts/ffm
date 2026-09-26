// When is the human ready for the practice steal, and which plant does it take?
// Chill: once per match. Normal: once, and only if nobody has robbed the human by ~4 minutes.
// The human must be playing (not AFK), close to home (so the chase is fair) and have a plant to spare.
import { load } from '../core/save.js';
import { bus } from '../core/events.js';
import { gardenContains } from '../gameplay/layout.js';
import { getBoard } from './blackboard.js';
import { hyp } from './util.js';

const HOME_RANGE = 35; // studs from the garden centre
const AFK_AFTER = 20; // seconds without moving

let tutorialAt = -99;
let tutorialDone = false;

/** The tutorial checklist (ui/tutorial.js) is finished, or the human has clearly played it through. */
function finishedTutorial(game, h) {
  if (game.time - tutorialAt > 5 || game.time < tutorialAt) {
    tutorialAt = game.time;
    tutorialDone = !!load('tutorial:done', false);
  }
  return tutorialDone || (h.stats.steals > 0 && h.speedLevel > 0 && h.stats.collected > 0);
}

/**
 * Optional hook for the UI/tutorial: bus 'practice:steal' {stage, thief, victim, plant} with stage
 * 'start' (holding the steal), 'carry' (strolling home with it), 'caught' (bonked) or 'escaped' (got home).
 */
export function practiceEvent(stage, thief, victim, plant) {
  bus.emit('practice:steal', { stage, thief, victim, plant });
}

/** The human's lowest-value grown plant when a practice steal should start now, else null. */
export function practiceTarget(game, diff) {
  const cfg = diff.practice;
  const h = game.human;
  const b = getBoard(game);
  const hs = b.human;
  if (!cfg || !h || !hs) return null;
  const pr = b.practice;
  const now = game.time;
  if (pr.state !== 'idle' || now < cfg.after) return null;
  if (cfg.unrobbedOnly && (h.stats.robbed > 0 || (b.lastStealOn.get(h.slot) ?? -1) >= 0)) {
    pr.state = 'done'; // someone already taught this lesson the hard way
    return null;
  }
  if (now - hs.movedAt > AFK_AFTER || h.carrying?.kind === 'plant' || now < h.stunUntil) return null;
  const g = game.gardens[h.slot];
  if (game.isLocked(g) || now < b.humanStealUntil - 30) return null;
  const L = g.L;
  if (!gardenContains(L, h.pos.x, h.pos.z) && hyp(h.pos.x - L.center.x, h.pos.z - L.center.z) > HOME_RANGE) return null;
  let grown = 0, low = null, lowInc = Infinity;
  for (const pl of g.planters) {
    if (!pl.plant || pl.plant.growLeft > 0) continue;
    grown++;
    if (pl.stealer != null) continue;
    const inc = game.plantIncome(pl.plant, h);
    if (inc < lowInc) {
      lowInc = inc;
      low = pl;
    }
  }
  if (!low || !(grown >= 2 || finishedTutorial(game, h))) return null;
  return low;
}
