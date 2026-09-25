// High-score boards and how a profile's numbers map onto them (shared by the sync, the family board and
// the leaderboard UI). Server whitelist: supabase/migrations (sas_submit / sas_top).
import { CHARACTERS } from '../config.js';
import { load } from '../core/save.js';

export const BOARDS = [
  { id: 'networth', title: 'Richest Garden', short: 'Richest', unit: 'money', blurb: 'Biggest garden net worth ever' },
  { id: 'showdown', title: 'Showdown Best', short: 'Showdown', unit: 'money', blurb: 'Best net worth in a Family Showdown' },
  { id: 'steals', title: 'Master Thief', short: 'Thief', unit: 'count', noun: 'steals', blurb: 'Most plants stolen, all time' },
  { id: 'rebirths', title: 'Rebirths', short: 'Rebirths', unit: 'count', noun: 'rebirths', blurb: 'Most rebirths' },
];
export const BOARD = Object.fromEntries(BOARDS.map((b) => [b.id, b]));

const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/** Rebirths of this profile's own player in its solo Endless save and its online garden. */
function savedRebirths(profile) {
  let best = num(profile?.counters?.rebirths);
  best = Math.max(best, num(profile?.online?.player?.rebirths));
  const slot = CHARACTERS.findIndex((c) => c.id === profile?.base);
  const solo = profile?.id ? load('save:endless:' + profile.id, null) : null;
  if (solo && Array.isArray(solo.players) && slot >= 0) best = Math.max(best, num(solo.players[slot]?.rebirths));
  return best;
}

/**
 * The profile's score on every board: {networth, showdown, steals, rebirths}. When `app` is playing as
 * this profile, live rebirths count too (they only reach the save every few seconds).
 */
export function profileScores(profile, app = null) {
  if (!profile) return { networth: 0, showdown: 0, steals: 0, rebirths: 0 };
  let rebirths = savedRebirths(profile);
  const h = app?.human;
  if (h && h.profileId === profile.id && app.game && !app.game.match) rebirths = Math.max(rebirths, num(h.rebirths));
  return {
    networth: Math.floor(num(profile.best?.netWorth)),
    showdown: Math.floor(num(profile.best?.showdownBest)),
    steals: Math.floor(num(profile.counters?.steals)),
    rebirths: Math.floor(rebirths),
  };
}

/** A small public summary stored with a cloud save (shown when someone previews a code). */
export function profileSummary(profile, app = null) {
  const s = profileScores(profile, app);
  const solo = profile?.id ? load('save:endless:' + profile.id, null) : null;
  const slot = CHARACTERS.findIndex((c) => c.id === profile?.base);
  const me = solo?.players?.[slot];
  const plants = Array.isArray(solo?.gardens?.[slot]?.planters) ? solo.gardens[slot].planters.filter((p) => p?.plant).length : 0;
  return {
    netWorth: s.networth,
    showdownBest: s.showdown,
    steals: s.steals,
    rebirths: s.rebirths,
    stars: num(profile?.stars),
    badges: profile?.badges && typeof profile.badges === 'object' ? Object.keys(profile.badges).length : 0,
    pets: Array.isArray(profile?.pets?.owned) ? profile.pets.owned.length : 0,
    cash: Math.floor(num(me?.cash)),
    plants,
    garden: !!solo,
  };
}

/** True when a profile has anything worth protecting on this device. */
export function hasProgress(profile, app = null) {
  if (!profile) return false;
  const s = profileSummary(profile, app);
  return !!(s.garden || s.netWorth || s.showdownBest || s.steals || s.rebirths || s.stars || s.badges || s.pets || profile.online);
}
