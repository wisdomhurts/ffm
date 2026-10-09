// Golden Gnome Hunt: the local player finds the tiny golden gnomes hidden around the island and up the Seed
// Road (spots: gameplay/layout.js GNOMES; art: world/gnomes.js; map: ui/gnomes.js). Client-only: each player
// finds their own, kept in profile.gnomes (ids); nothing goes over the network and no game rule changes.
// Rewards: the 'gnomes' badge (progress/catalog.js) at 3 / HUNT.hatAt / all, with stars; HUNT.hatAt unlocks
// the Gnome Hat and all of them the Golden Gnome Noodle (characters/cosmetics.js HATS / NOODLES unlock ids).
//
// createGnomeHunt(app, {now, interval}) -> { found(), check(), sync(), dispose() }
//   check() runs every HUNT.every s while playing. Within HUNT.reach studs of an unfound gnome (and at most
//   HUNT.up above your feet: hop onto the pot of gold) it is yours: saved in the profile, popped in the world,
//   a sparkle and 'GNOME 7/16!', bus 'gnome:found' {player, id, gnome, count, total}. Otherwise within
//   HUNT.hear studs of one: a giggle from where it hides, at most every HUNT.giggleEvery s.
import { bus } from '../core/events.js';
import { updateProfile } from '../core/profiles.js';
import { GNOMES } from '../gameplay/layout.js';
import { BIOMES } from '../config.js';
import { glyphSvg } from './art.js';

export const HUNT = { reach: 3.5, up: 4, down: 3, hear: 30, giggleEvery: 6, every: 0.25, hatAt: 6 };
export const GNOME = Object.assign(Object.create(null), Object.fromEntries(GNOMES.map((g) => [g.id, g])));

/** How many of the hunt's gnomes a profile has found (unknown ids from other builds don't count). */
export const gnomesFound = (profile) => (Array.isArray(profile?.gnomes) ? profile.gnomes.filter((id) => GNOME[id]).length : 0);
/** Where a gnome hides, for the map: 'The Island' or the biome's name. */
export const gnomeZone = (g) => (g.biome < 0 ? 'The Island' : BIOMES[g.biome]?.name || 'The Seed Road');

export function createGnomeHunt(app, { now = () => Date.now(), interval = HUNT.every * 1000 } = {}) {
  const offs = [];
  let lastGiggle = -Infinity;

  const foundIds = () => new Set(Array.isArray(app.profile?.gnomes) ? app.profile.gnomes : []);
  /** Show the active profile's unfound gnomes in the world. */
  function sync() {
    try {
      app.world?.gnomes?.setFound(foundIds());
    } catch (e) {
      console.warn('[gnomes] world sync failed', e);
    }
  }

  function check() {
    const h = app.human;
    const p = app.profile;
    if (!h || !p || app.state !== 'playing') return null;
    const have = foundIds();
    let near = null;
    let nearD = HUNT.hear * HUNT.hear;
    for (const g of GNOMES) {
      if (have.has(g.id)) continue;
      const dx = g.x - h.pos.x, dz = g.z - h.pos.z;
      const d2 = dx * dx + dz * dz;
      const up = g.y - (h.pos.y || 0);
      if (d2 <= HUNT.reach * HUNT.reach && up <= HUNT.up && up >= -HUNT.down) return collect(g, h, p);
      if (d2 < nearD) {
        nearD = d2;
        near = g;
      }
    }
    const t = now();
    if (near && t - lastGiggle >= HUNT.giggleEvery * 1000) {
      lastGiggle = t;
      app.audio?.play?.('gnomeGiggle', { x: near.x, z: near.z });
    }
    return null;
  }

  function collect(g, h, p) {
    updateProfile(p.id, (q) => {
      if (!q.gnomes.includes(g.id)) q.gnomes.push(g.id);
    });
    const count = gnomesFound(p);
    const total = GNOMES.length;
    try {
      app.world?.gnomes?.pop(g.id);
      app.fx?.burst?.('sparkle', { x: g.x, y: g.y + 1, z: g.z }, { color: '#ffd23f', count: 28, scale: 1.3 });
      if (count >= total) app.fx?.burst?.('confetti', { x: g.x, y: g.y + 1.5, z: g.z }, { count: 40 });
      app.fx?.floatText?.(`GNOME ${count}/${total}!`, { x: g.x, y: g.y + 3.4, z: g.z }, { style: 'gold', size: 'l', duration: 1.8 });
      app.audio?.play?.('gnomeFound', { important: true, all: count >= total });
      const alerts = app.hud?.alerts;
      if (alerts) {
        const sub = count >= total ? 'You found them all!' : count === HUNT.hatAt ? 'Gnome Hat unlocked! Try it on in the Wardrobe.' : `${total - count} more hiding. Open the Gnome Map for clues!`;
        alerts.show({ key: 'gnome', kind: 'gold', icon: glyphSvg('gnome'), duration: 4200, html: `<b>${g.name}</b> found! Golden Gnome ${count} of ${total}<small>${sub}</small>` });
        if (count >= total) alerts.announce?.({ title: 'ALL GNOMES FOUND!', sub: 'Gnome Hat and Golden Gnome Noodle are yours!', icon: glyphSvg('gnome'), ms: 3600 });
      }
    } catch (e) {
      console.warn('[gnomes] found effects failed', e);
    }
    bus.emit('gnome:found', { player: h, id: g.id, gnome: g, count, total });
    app.progress?.checkBadges?.();
    return g;
  }

  offs.push(bus.on('profile:active', sync));
  offs.push(bus.on('profile:changed', ({ profile }) => profile?.id === app.profile?.id && sync()));
  offs.push(bus.on('game:start', sync));
  const timer = interval > 0 && typeof setInterval === 'function' ? setInterval(check, interval) : 0;
  sync();

  return {
    /** The active profile's found gnome ids. */
    found: () => [...foundIds()].filter((id) => GNOME[id]),
    check,
    sync,
    dispose() {
      offs.forEach((f) => f());
      if (timer) clearInterval(timer);
    },
  };
}
