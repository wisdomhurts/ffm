// Giant Harvests and Family Hero moments (the app wires this once: attachGiants(app) in main.js).
//   A plant finishes Big / GIANT / TITAN ('plant:grown' {size}): a drumroll, the plant stays normal size for
//   REVEAL seconds (view/sizes.js), then pops up to its size with a "GIANT!" burst. Your own GIANT or TITAN nudges
//   the camera; a TITAN gets its light beam (view/gameView.js). A family bot nearby shouts WHOA ('plant:giant').
//   Someone saves someone else's plant ('steal:rescued'): confetti and HERO! over the hero (yours gets the HUD's
//   big HERO! moment, ui/hero.js), SNEAKY! over a busy thief, a fanfare, and the rescued bot says thank you.
// Bots only react where they think (offline, or the host of a room); every device shows the effects.
import { bus } from '../core/events.js';
import { SIZES, PLANT, RARITY } from '../config.js';
import { REVEAL, markReveal, injectSizeStyles } from '../view/sizes.js';
import { cheerGiant, thankHero } from '../ai/family.js';

const TEXT = { big: 'BIG!', giant: 'GIANT!', titan: 'TITAN!!' };
const COLORS = { big: ['#b8ff8a', '#ffffff', '#5ee07a'], giant: ['#ffe36b', '#ff9f1a', '#ffffff'], titan: ['#ff4d6d', '#ffe94d', '#4cd964', '#3dc9ff', '#b36bff', '#ffffff'] };

export function attachGiants(app) {
  injectSizeStyles();
  const pending = []; // reveals waiting for their drumroll: {at, game, planter, garden, plant, size}
  const at = { x: 0, y: 0, z: 0 };
  const P = (x, y, z) => {
    at.x = x;
    at.y = y;
    at.z = z;
    return at;
  };
  const near = (x, z, r) => {
    const c = app.engine?.camera?.position;
    return !c || Math.hypot(x - c.x, z - c.z) < r;
  };
  // only the bus traffic about the world on screen counts (tests and online rooms can run other games)
  const live = (garden) => !!app.game && app.game.gardens[garden?.slot] === garden;

  bus.on('plant:grown', ({ plant, planter, garden, size }) => {
    if (!size || size === 'normal' || !SIZES[size] || !live(garden) || !plant) return;
    const g = app.game;
    markReveal(plant.uid, g.time + REVEAL);
    pending.push({ at: g.time + REVEAL, game: g, planter, garden, plant, size });
    if (pending.length > 12) pending.shift();
    const mine = garden.owner === g.human;
    if (!g.human || app.state === 'title') return;
    if (mine) app.audio?.play('drumroll', { size, reveal: REVEAL, important: true });
    else if (size !== 'big' && near(planter.x, planter.z, 90)) app.audio?.play('drumroll', { size, reveal: REVEAL, x: planter.x, z: planter.z, vol: 0.6 });
  });

  bus.on('plant:giant', (e) => {
    if (!live(e.garden) || app.online?.isClient) return;
    cheerGiant(app.game, e);
  });

  bus.on('steal:rescued', (e) => {
    const g = app.game;
    if (!g || !e.hero || g.players[e.hero.slot] !== e.hero) return;
    if (!app.online?.isClient) thankHero(g, e);
    const me = g.human;
    const h = e.hero;
    const fx = app.fx;
    if (!fx || app.state === 'title') return;
    const mine = h === me;
    if (mine || near(h.pos.x, h.pos.z, 110)) {
      fx.burst('confetti', P(h.pos.x, h.pos.y + 5, h.pos.z), { count: mine ? 40 : 18, colors: ['#ffd23f', '#ffe36b', '#ffffff', '#ff9f1a'] });
      fx.burst('sparkle', P(h.pos.x, h.pos.y + 4, h.pos.z), { color: '#ffd23f', count: 14 });
      // your own rescue gets the big HERO! moment on the HUD (ui/hero.js) instead
      if (!mine) fx.floatText('HERO!', P(0, 8.2, 0), { style: 'gold', size: 'm', follow: h.pos, duration: 2, rise: 2 });
    }
    if (e.sneaky && e.thief && (mine || near(e.thief.pos.x, e.thief.pos.z, 90))) {
      fx.floatText('SNEAKY!', P(0, 7.6, 0), { style: 'comic', size: mine ? 'l' : 'm', burst: '#b36bff', follow: e.thief.pos, duration: 1.6 });
    }
    if (!me) return;
    if (mine) app.audio?.play('hero', { important: true });
    else if (e.victim === me) app.audio?.play('hero', { important: true, vol: 0.7 });
    else app.audio?.play('hero', { x: h.pos.x, z: h.pos.z, vol: 0.5 });
  });

  bus.on('game:dispose', () => (pending.length = 0));

  // the reveals: when a drumroll ends, the plant pops up to its size
  app.engine?.add?.(() => {
    if (!pending.length) return;
    const g = app.game;
    for (let i = pending.length - 1; i >= 0; i--) {
      const r = pending[i];
      if (r.game !== g) {
        pending.splice(i, 1);
        continue;
      }
      if (g.time < r.at) continue;
      pending.splice(i, 1);
      reveal(r, g);
    }
  });

  function reveal({ planter, garden, plant, size }, g) {
    const fx = app.fx;
    const mine = !!g.human && garden.owner === g.human;
    if (!fx || app.state === 'title' || (!mine && !near(planter.x, planter.z, size === 'titan' ? 300 : 120))) return;
    const colors = COLORS[size];
    const k = SIZES[size].scale;
    fx.burst('ring', P(planter.x, 1.3, planter.z), { color: colors[0], size: 6 * k });
    fx.burst('sparkle', P(planter.x, 3 * k, planter.z), { colors, count: size === 'big' ? 14 : 26, scale: k });
    if (size !== 'big') fx.burst('confetti', P(planter.x, 6 * k, planter.z), { colors, count: size === 'titan' ? 70 : 40 });
    const rarity = PLANT[plant.speciesId]?.rarity;
    fx.floatText(TEXT[size], P(planter.x, 7 + 3 * k, planter.z), {
      style: size === 'big' ? 'good' : size === 'giant' ? 'gold' : 'rarity', rainbow: size === 'titan', color: RARITY[rarity]?.color,
      size: mine ? (size === 'big' ? 'l' : 'xl') : 'm', duration: size === 'titan' ? 2.6 : 2, rise: 2.5,
    });
    if (mine && size !== 'big') bus.emit('camera:shake', { amount: size === 'titan' ? 0.7 : 0.4 });
  }
}
