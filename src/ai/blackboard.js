// State shared by all bots of one Game: chat rate limits, who is going for which pod / garden,
// and fairness timers so the rivals share targets instead of dogpiling the human.
const boards = new WeakMap();

const CHAT_GLOBAL_GAP = 3; // seconds between any two bot lines
const CHAT_BOT_GAP = 10; // seconds between two lines of the same bot

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
    };
    boards.set(game, b);
  }
  return b;
}

/**
 * Rate-limited chat. `urgent` lines (being robbed, a steal) may cut the global gap in half.
 * Returns true when the line was said.
 */
export function trySay(game, p, category, vars, { urgent = false, chance = 1, rng = Math.random } = {}) {
  const b = getBoard(game);
  const now = game.time;
  const gap = urgent ? CHAT_GLOBAL_GAP * 0.5 : CHAT_GLOBAL_GAP;
  if (now - b.chatAt < gap) return false;
  if (now - (b.chatBy.get(p.slot) ?? -99) < (urgent ? CHAT_BOT_GAP * 0.6 : CHAT_BOT_GAP)) return false;
  if (rng() > chance) return false;
  b.chatAt = now;
  b.chatBy.set(p.slot, now);
  game.say(p, category, vars);
  return true;
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
