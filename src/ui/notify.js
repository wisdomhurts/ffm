// Turns gameplay events that concern the local player into banners, toasts and reveals.
import { bus } from '../core/events.js';
import { PLANT, RARITY, MUTATIONS, ITEM, speedAt, REBIRTH } from '../config.js';
import { rarityColor } from '../view/gameView.js';
import { esc, money } from './dom.js';
import { who } from './alerts.js';
import { ICON, EVENT_ICON, ITEM_ICONS, NOODLE } from './icons.js';
import { isTouch } from './device.js';

export function wireNotifications(app, alerts) {
  const game = app.game;
  const me = app.human;
  const offs = [];
  const on = (name, fn) => offs.push(bus.on(name, fn));

  const pn = (speciesId, mutation) =>
    `<b class="pn" style="--rc:${rarityColor(PLANT[speciesId].rarity)}">${esc(game.plantName(speciesId, mutation))}</b>`;
  const plantTag = (plant) => pn(plant.speciesId, plant.mutation);
  const causeText = (cause, by, thief) => {
    const whom = thief === me ? 'you' : esc(thief.name);
    if (cause === 'bonk' && by) return `${by === me ? 'You' : esc(by.name)} bonked ${whom} with a pool noodle!`;
    if (cause === 'balloon') return 'SPLASH! A water balloon knocked it loose.';
    if (cause === 'banana') return 'Slipped on a banana peel!';
    if (cause === 'monster') return 'A road monster knocked it loose!';
    return '';
  };

  on('steal:start', ({ thief, victim, plant }) => {
    if (victim !== me) return;
    alerts.show({
      key: 'steal' + thief.slot, kind: 'danger', cls: 'urgent', face: thief.id, sticky: true,
      html: `${who(thief, true)} is stealing your ${plantTag(plant)}!<small>Run home and BONK them!</small>`,
    });
  });
  on('steal:cancel', ({ thief }) => alerts.remove('steal' + thief.slot));
  // The friendly "practice steal" on Chill: coach the kid through chasing and bonking. Catching the
  // practice thief shows ONE alert (the lesson), not a generic "you saved it" banner plus the lesson.
  let practiceThief = null; // the bot running the lesson (from 'start'/'carry' until it ends)
  let merged = null; // practice thief whose steal:foiled banner already carries the lesson
  const LESSON = "<small>That's how you protect your garden. Use LOCK when you leave, too.</small>";
  on('practice:steal', ({ stage, thief, victim, plant }) => {
    if (victim !== me) return;
    const key = isTouch() ? 'the noodle button' : 'F or click';
    if (stage === 'start' || stage === 'carry') practiceThief = thief;
    if (stage === 'carry') {
      alerts.remove('chase' + thief.slot); // the friendly coaching replaces the scary "grabbed your plant!"
      alerts.show({
        key: 'practice', kind: 'info', face: thief.id, duration: 7000,
        html: `Practice time! Chase ${who(thief, true)}<small>Get close and BONK them (${key}) to get your plant back.</small>`,
      });
      return;
    }
    if (stage !== 'caught' && stage !== 'escaped') return;
    alerts.remove('practice');
    practiceThief = null;
    if (stage === 'caught' && merged !== thief) {
      // bonked before they grabbed it (no steal:foiled): the lesson on its own
      alerts.show({ key: 'saved' + thief.slot, kind: 'good', face: thief.id, duration: 4200, html: `Great bonk!${plant ? ` You saved your ${plantTag(plant)}!` : ''}${LESSON}` });
    }
    merged = null;
  });
  on('steal:grabbed', ({ thief, victim, plant }) => {
    alerts.remove('steal' + thief.slot);
    if (victim === me) {
      alerts.show({
        key: 'chase' + thief.slot, kind: 'danger', cls: 'urgent', face: thief.id, duration: 6000,
        html: `${who(thief, true)} grabbed your ${plantTag(plant)}!<small>Bonk them before they get home!</small>`,
      });
    } else if (thief === me) {
      alerts.show({
        key: 'heist', kind: 'gold', face: victim.id, duration: 4200,
        html: `You grabbed ${who(victim)}'s ${plantTag(plant)}!<small>Run HOME before you get bonked!</small>`,
      });
    }
  });
  on('steal:success', ({ thief, victim, plant, soldFor }) => {
    alerts.remove('chase' + thief.slot);
    if (victim === me) {
      alerts.show({
        kind: 'danger', face: thief.id, duration: 4800,
        html: `${who(thief)} stole your ${plantTag(plant)}!<small>Steal it back, or LOCK your garden next time.</small>`,
      });
    } else if (thief === me) {
      alerts.remove('heist');
      alerts.show({
        kind: 'good', icon: ICON.crown, duration: 4200,
        html: `Heist complete! ${plantTag(plant)} is yours!${soldFor ? `<small>Garden full, so you sold it for ${money(soldFor)}.</small>` : '<small>It keeps paying in YOUR garden now.</small>'}`,
      });
    }
  });
  on('steal:foiled', ({ thief, victim, plant, by, cause }) => {
    alerts.remove('chase' + thief.slot);
    if (victim === me) {
      const practice = thief === practiceThief;
      if (practice) {
        alerts.remove('practice');
        merged = thief;
      }
      alerts.show({
        key: 'saved' + thief.slot, kind: 'good', face: (by || me).id, duration: practice ? 4200 : 3800,
        html: by === me
          ? `${practice ? 'Great bonk!' : 'BONK!'} You saved your ${plantTag(plant)}!${practice ? LESSON : ''}`
          : `Your ${plantTag(plant)} flew back home!<small>${causeText(cause, by, thief)}</small>`,
      });
    } else if (thief === me) {
      alerts.remove('heist');
      alerts.show({
        kind: 'warn', face: (by || victim).id, duration: 3800,
        html: `Foiled! ${plantTag(plant)} flew back to ${who(victim)}.<small>${causeText(cause, by, thief)}</small>`,
      });
    } else if (by === me) {
      alerts.toast(`Nice bonk! ${who(thief)} dropped ${who(victim)}'s plant.`, 'good');
    }
  });

  on('seed:grabbed', ({ player, speciesId, mutation, rarity }) => {
    if (player !== me) return;
    const r = RARITY[rarity];
    if (r.tier >= 2 || mutation !== 'normal') {
      alerts.reveal({
        rarity, rarityName: r.name, name: PLANT[speciesId].name, mutation, mutationName: MUTATIONS[mutation].name,
        sub: `Worth <b class="cash">${money(PLANT[speciesId].income * MUTATIONS[mutation].mult)}/s</b> once grown. Get it HOME!`,
      });
    } else {
      alerts.toast(`Got a ${pn(speciesId, mutation)}!<small>Bring it home to plant it.</small>`, 'good', { icon: ICON.sprout });
    }
  });
  on('monster:aggro', ({ monster, target }) => {
    if (target !== me) return;
    alerts.show({ key: 'monster', kind: 'warn', cls: 'shake', icon: ICON.target, duration: 2600, html: `A ${esc(monster.def.name)} is chasing you!<small>RUN home! More Speed outruns it. (Bonk monsters before you grab.)</small>` });
  });
  on('monster:caught', ({ monster, target }) => {
    if (target !== me) return;
    alerts.remove('monster');
    alerts.show({ kind: 'danger', icon: ICON.target, duration: 3600, html: `The ${esc(monster.def.name)} got you!<small>Your loot went back. More Speed helps you outrun it.</small>` });
  });
  on('garden:full', ({ player }) => {
    if (player !== me) return;
    alerts.show({ key: 'full', kind: 'warn', icon: ICON.sprout, duration: 3600, html: `Your garden is full!<small>Hold ${isTouch() ? 'Action' : 'E'} on a grown plant to sell it, or drop the seed.</small>` });
  });
  // pressing Bonk with full hands: the noodle is busy, so tell them to run (throttled)
  let blockedAt = -Infinity;
  on('bonk:blocked', ({ player }) => {
    if (player !== me) return;
    const now = performance.now();
    if (now - blockedAt < 2500) return;
    blockedAt = now;
    alerts.toast('Hands full! RUN!<small>You can\'t bonk while carrying.</small>', 'warn', { key: 'blocked', icon: NOODLE, duration: 1800 });
    try {
      app.audio?.play?.('error');
    } catch {
      /* sound is optional */
    }
  });
  on('purchase:fail', ({ player, cost }) => {
    if (player !== me) return;
    alerts.show({ key: 'cash', kind: 'warn', icon: ICON.coin, duration: 2400, html: `Need <b class="cash">${money(Math.max(1, cost - me.cash))}</b> more!` });
  });
  on('item:fail', ({ player, reason }) => {
    if (player !== me) return;
    alerts.show({ key: 'itemfail', kind: 'warn', duration: 2600, html: esc(reason || "Can't use that here.") });
  });
  on('item:empty', ({ player, item }) => {
    if (player !== me || !ITEM[item]) return;
    alerts.show({ key: 'itemempty', kind: 'info', icon: ITEM_ICONS[item], duration: 2600, html: `No ${esc(ITEM[item].name)}s left.<small>Buy more at the Gear Shop.</small>` });
  });
  // Stacking extends the timer (game.useItem adds the duration), so say the real time left.
  on('item:used', ({ player, item }) => {
    if (player !== me) return;
    const left = (until) => Math.max(1, Math.round(until - game.time));
    if (item === 'coil') {
      const extra = me.coilUntil - game.time > ITEM.coil.duration + 0.5;
      alerts.toast(`Speed Coil${extra ? ' stacked' : ''}! <b>+${Math.round((ITEM.coil.mult - 1) * 100)}% speed</b> for ${left(me.coilUntil)}s`, 'info', { key: 'coil', icon: ITEM_ICONS.coil });
    }
    if (item === 'cloak') {
      alerts.toast(`You are invisible for ${left(me.cloakUntil)}s!`, 'info', { key: 'cloak', icon: ITEM_ICONS.cloak });
    }
  });
  on('plant:watered', ({ player }) => {
    if (player === me) alerts.toast('Splash! Growing time cut in half.', 'info', { icon: ITEM_ICONS.bucket });
  });
  on('lock:on', ({ player, until }) => {
    if (player !== me) return;
    alerts.show({ key: 'lock', kind: 'good', icon: ICON.lock, duration: 3000, html: `Garden LOCKED for ${Math.round(until - game.time)}s!<small>Only you can get through the gate.</small>` });
  });
  on('lock:off', ({ player }) => {
    if (player === me) alerts.show({ key: 'lock', kind: 'info', icon: ICON.lock, duration: 3000, html: 'Your lock wore off.<small>The LOCK pad recharges in 60s.</small>' });
  });
  on('plant:grown', ({ plant, garden }) => {
    if (garden.owner !== me) return;
    alerts.toast(`${plantTag(plant)} is fully grown! <b class="cash">+${money(game.plantIncome(plant, me))}/s</b>`, 'good', { icon: ICON.sprout });
  });
  on('plant:planted', ({ player, plant }) => {
    if (player === me) alerts.toast(`Planted ${plantTag(plant)}!`, 'good', { icon: ICON.sprout });
  });
  on('plant:sold', ({ player, plant, value }) => {
    if (player === me) alerts.toast(`Sold ${plantTag(plant)} for <b class="cash">${money(value)}</b>`, 'good', { icon: ICON.coin });
  });
  on('plant:returned', ({ garden, refund }) => {
    if (garden.owner === me && refund) alerts.toast(`Garden full: your plant was refunded <b class="cash">${money(refund)}</b>`, 'info', { icon: ICON.coin });
  });
  on('planter:unlocked', ({ player }) => {
    if (player === me) alerts.show({ kind: 'good', icon: ICON.sprout, duration: 2600, html: 'New planter unlocked!<small>More room for more plants.</small>' });
  });
  on('speed:up', ({ player, level }) => {
    if (player !== me) return;
    alerts.show({ key: 'speed', kind: 'info', icon: ICON.bolt, duration: 2600, html: `Speed level ${level}! <b>${speedAt(level, me.rebirths)} studs/s</b>` });
  });
  on('rebirth', ({ player, rebirths }) => {
    if (player !== me) return;
    alerts.announce({ title: 'REBIRTH!', sub: `Star ${rebirths} earned · Income ×${REBIRTH.incomeMult(rebirths)}`, icon: ICON.crown, cls: 'an-rebirth', ms: 3600 });
  });
  on('player:hit', ({ target, by, cause, dropped }) => {
    if (target === me && by && by !== me && cause === 'bonk') {
      alerts.show({ key: 'hit', kind: 'warn', face: by.id, duration: 2200, html: `${who(by)} bonked you!${dropped?.kind === 'seed' ? '<small>You dropped your seed. Grab it quick!</small>' : ''}` });
    } else if (target === me && cause === 'banana') {
      alerts.show({ key: 'hit', kind: 'warn', icon: ITEM_ICONS.banana, duration: 2200, html: 'Whoops! Banana peel!' });
    } else if (by === me && target !== me && dropped?.kind === 'seed') {
      alerts.toast(`BONK! ${who(target)} dropped their seed!`, 'good');
    }
  });
  on('event:start', ({ event }) => {
    alerts.announce({ title: event.def.name.toUpperCase() + '!', sub: esc(event.def.desc), icon: EVENT_ICON[event.type], cls: 'an-ev ev-' + event.type, ms: 3400 });
  });
  on('event:end', ({ event }) => {
    alerts.toast(`${esc(event.def.name)} is over.`, 'info', { icon: EVENT_ICON[event.type] });
  });

  return () => offs.forEach((f) => f());
}
