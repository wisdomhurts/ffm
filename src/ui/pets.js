// Pets UI. OWNER: pets agent (docs/ONLINE.md).
//   attachPets(app)              once per page (idempotent): hatched pets -> profile + the hatch moment
//   buildPetShop(app, close)     the PET EGGS stand panel -> {el, title, dispose} (menus.openShop('pets'))
//   openPets(app)                "My Pets" inventory: equip, unequip, release (also from the title screen)
// Pets live on the active profile (profile.pets = {owned: [{uid, id, t}], equipped: uid|null}); main.js turns
// an equipped change into app.act('setPet', id) while playing.
import { bus } from '../core/events.js';
import { getProfile, updateProfile } from '../core/profiles.js';
import { PET, EGG, SHOP_EGGS, PET_CAPACITY, eggOdds, fmtPct, boostLines, petScore } from '../pets/catalog.js';
import { MAX_TEAM } from '../pets/effects.js';
import { petSlotsFor, BASE } from '../config.js';
import { playHatch } from '../pets/hatch.js';
import { thumb, cachedThumb, configureStudio, onStudioReady } from '../pets/studio.js';
import { injectPetStyles, RARITY_COLOR, BOOST_ICON, PAW_ICON, EGG_ICON, rarityName } from '../pets/style.js';
import { h, money, setText, uiSound } from './dom.js';
import { ICON } from './icons.js';

export { PAW_ICON as PET_ICON };

let attachedApp = null;
const fresh = new Set(); // uids hatched this session and not looked at yet (NEW badge)

const newUid = () => 'pt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const bump = (el, cls) => {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
};

function profileIdFor(app, player) {
  return player?.profileId && getProfile(player.profileId) ? player.profileId : app.profileId;
}
const ownedList = (prof) => (Array.isArray(prof?.pets?.owned) ? prof.pets.owned.filter((x) => PET[x.id]) : []);
/** The profile's equipped team (uids that still exist, max MAX_TEAM). */
const teamOf = (prof) => {
  const own = new Set(ownedList(prof).map((x) => x.uid));
  const t = Array.isArray(prof?.pets?.team) ? prof.pets.team : prof?.pets?.equipped ? [prof.pets.equipped] : [];
  return [...new Set(t)].filter((u) => own.has(u)).slice(0, MAX_TEAM);
};
/** Set the team (and keep `equipped` = the first member for older code and saves). */
function writeTeam(p, uids) {
  const own = new Set(p.pets.owned.map((x) => x.uid));
  p.pets.team = [...new Set(uids)].filter((u) => own.has(u)).slice(0, MAX_TEAM);
  p.pets.equipped = p.pets.team[0] || null;
}
/** How many pets count right now (base level in this game; the title screen shows all three). */
const slotsNow = (app) => (app.human ? petSlotsFor(app.human.baseLevel) : MAX_TEAM);

/** Listen for hatches of the local player (offline, or relayed from an online host). Safe to call often. */
export function attachPets(app) {
  if (attachedApp) return;
  attachedApp = app;
  injectPetStyles();
  // the pet studio follows the game's graphics quality, and repaints placeholders after a WebGL context loss
  configureStudio({ engine: app.engine });
  onStudioReady(retryThumbs);
  bus.on('pet:hatched', ({ player, egg, pet, free } = {}) => {
    if (!player || player !== app.human || !PET[pet]) return;
    const pid = profileIdFor(app, player);
    const before = getProfile(pid);
    if (!before) return;
    const isNew = !ownedList(before).some((x) => x.id === pet);
    const uid = newUid();
    let equipped = false;
    let released = null;
    // save first: the pet is theirs even if the hatch moment is skipped or the page closes
    updateProfile(pid, (p) => {
      // a full bag (egg drops are free, so it can happen): the weakest spare pet goes home to make room
      if (ownedList(p).length >= PET_CAPACITY) {
        const team = new Set(teamOf(p));
        const spare = ownedList(p).filter((x) => !team.has(x.uid)).sort((a, b) => petScore(a.id) - petScore(b.id) || (a.t || 0) - (b.t || 0))[0];
        if (spare) {
          released = spare.id;
          p.pets.owned = p.pets.owned.filter((x) => x.uid !== spare.uid);
        }
      }
      p.pets.owned.push({ uid, id: pet, t: Date.now() });
      const team = teamOf(p);
      if (team.length < Math.max(1, slotsNow(app))) {
        writeTeam(p, [...team, uid]);
        equipped = true;
      }
    });
    if (released) bus.emit('pets:released', { pet: released, reason: 'full', free: !!free });
    fresh.add(uid);
    playHatch(app, {
      petId: pet,
      eggId: egg,
      isNew,
      equipped,
      onEquip: () => updateProfile(pid, (p) => {
        if (p.pets.owned.some((x) => x.uid === uid)) writeTeam(p, [uid, ...teamOf(p).filter((u) => u !== uid)]);
      }),
    });
  });
}

// ------------------------------------------------------------------ thumbnails (time-sliced, cached)

const pending = [];
let pumping = false;
function pump() {
  pumping = true;
  const t0 = performance.now();
  while (pending.length && performance.now() - t0 < 10) {
    const job = pending.shift();
    if (!job.img.isConnected) continue; // discarded before its turn (panel re-rendered)
    const url = thumb(job.kind, job.id, job.size);
    if (url) job.img.src = url;
    else job.img.closest('.pthumb')?.classList.add('nothumb');
  }
  if (pending.length) requestAnimationFrame(pump);
  else pumping = false;
}

function queueThumb(img, kind, id, size) {
  pending.push({ img, kind, id, size });
  if (!pumping) requestAnimationFrame(pump);
}

/** The studio is back (context restored or rebuilt): render the thumbnails that fell back to placeholders. */
function retryThumbs() {
  for (const wrap of document.querySelectorAll('.pthumb.nothumb[data-kind]')) {
    const img = wrap.querySelector('img');
    if (!img) continue;
    wrap.classList.remove('nothumb');
    queueThumb(img, wrap.dataset.kind, wrap.dataset.id, +wrap.dataset.size || 224);
  }
}

/** <span class="pthumb"><img></span> for a pet or an egg; the picture is rendered lazily. */
export function thumbEl(kind, id, cls = '') {
  const rarity = kind === 'pet' ? PET[id]?.rarity || 'common' : 'common';
  const img = h('img', { alt: '', draggable: 'false', decoding: 'async' });
  const size = 224;
  const wrap = h('span', { class: 'pthumb ' + cls, style: `--rc:${RARITY_COLOR[rarity]}`, dataset: { kind, id, size: String(size) } }, img);
  const url = cachedThumb(kind, id, size);
  if (url) img.src = url;
  else queueThumb(img, kind, id, size);
  img.addEventListener('error', () => wrap.classList.add('nothumb'));
  return wrap;
}

const boostChips = (pet) => h('div', { class: 'boost-list' }, boostLines(pet).map((b) => h('span', { class: 'boost' }, h('i', { html: BOOST_ICON[b.kind] || '' }), h('span', { text: b.text }))));
const rarityTag = (r) => h('span', { class: 'pr-tag r-' + r, style: `--rc:${RARITY_COLOR[r]}`, text: rarityName(r) });

// ------------------------------------------------------------------ egg shop (the PET EGGS stand)

/** The drop-only eggs (not for sale): what's inside and how to get one. */
function dropCard() {
  const egg = EGG.rainbow;
  if (!egg) return null;
  const rows = eggOdds(egg.id).map(({ pet, pct }) => h('li', { style: `--rc:${RARITY_COLOR[pet.rarity]}`, 'data-pet': pet.id, title: `${pet.name}: ${pet.boost}` },
    thumbEl('pet', pet.id), h('span', { class: 'n', text: pet.name }), h('b', { text: fmtPct(pct) })));
  return h('div', { class: 'egg-card drop-only', style: `--e1:${egg.colors[0]};--e2:${egg.colors[1]};--d:${SHOP_EGGS.length * 70}ms` },
    h('div', { class: 'ec-art' }, thumbEl('egg', egg.id), h('span', { class: 'ec-price', text: 'EGG DROPS ONLY' })),
    h('div', { class: 'ec-body' },
      h('h3', { class: 'ec-name', text: egg.name }),
      h('div', { class: 'ec-blurb', text: egg.blurb }),
      h('ul', { class: 'ec-odds', 'aria-label': `${egg.name} odds` }, rows)),
    h('div', { class: 'ec-foot' }, h('div', { class: 'ec-drop-tip', text: 'Look up! Rainbow Eggs float down on balloons (more during Egg Rain). Touch one first to hatch it free.' })));
}

export function buildPetShop(app, close) {
  attachPets(app);
  injectPetStyles();
  const me = app.human;
  const pid = profileIdFor(app, me);
  const cash = h('span', { class: 'sh-cash-v' });
  const eqWrap = h('div', { class: 'ps-eq' });
  const openBtn = h('button', { class: 'btn btn-blue btn-sm', type: 'button' }, h('span', { class: 'bi', html: PAW_ICON }), h('span', { text: 'My Pets' }));
  openBtn.addEventListener('click', () => {
    uiSound(app, 'click');
    openPets(app);
  });

  const cards = SHOP_EGGS.map((egg, i) => {
    const odds = eggOdds(egg.id);
    const buy = h('button', { class: 'btn btn-green ec-buy', type: 'button', 'data-autofocus': i === 0 ? '' : null });
    const needTxt = h('span');
    const barI = h('i');
    const need = h('div', { class: 'ec-need' }, h('div', { class: 'bar' }, barI), needTxt);
    const rows = odds.map(({ pet, pct }) => h('li', { style: `--rc:${RARITY_COLOR[pet.rarity]}`, 'data-pet': pet.id, title: `${pet.name}: ${pet.boost}` },
      thumbEl('pet', pet.id), h('span', { class: 'n', text: pet.name }), h('b', { text: fmtPct(pct) })));
    const card = h('div', { class: 'egg-card', style: `--e1:${egg.colors[0]};--e2:${egg.colors[1]};--d:${i * 70}ms` },
      h('div', { class: 'ec-art' }, thumbEl('egg', egg.id), h('span', { class: 'ec-price', text: money(egg.price) })),
      h('div', { class: 'ec-body' },
        h('h3', { class: 'ec-name', text: egg.name }),
        h('div', { class: 'ec-blurb', text: egg.blurb }),
        h('ul', { class: 'ec-odds', 'aria-label': `${egg.name} odds` }, rows)),
      h('div', { class: 'ec-foot' }, buy, need));
    let lock = 0;
    buy.addEventListener('click', () => {
      const prof = getProfile(pid);
      if (ownedList(prof).length >= PET_CAPACITY) {
        uiSound(app, 'error');
        bump(buy, 'nope');
        return;
      }
      if (!me || me.cash < egg.price) {
        uiSound(app, 'error');
        bump(buy, 'nope');
        bump(need, 'nope');
        return;
      }
      if (performance.now() < lock) return;
      lock = performance.now() + 900;
      const r = app.act('buyEgg', egg.id);
      if (r === undefined) {
        // online: the host hatches it and the result comes back as pet:hatched
        buy.classList.add('wait');
        setTimeout(() => buy.classList.remove('wait'), 900);
      } else if (r) bump(card, 'bought');
      else bump(buy, 'nope');
      refresh();
    });
    return { egg, card, buy, need, needTxt, barI, rows };
  });

  const el = h('div', { class: 'shop-body pets-shop' },
    h('div', { class: 'shop-head' },
      h('span', { class: 'sh-ic', html: EGG_ICON }),
      h('div', { class: 'sh-titles' }, h('h2', { text: 'Pet Eggs' }), h('span', { class: 'sh-sub', text: 'Hatch a buddy who follows you and helps!' })),
      h('div', { class: 'sh-cash' }, h('span', { html: ICON.coin }), cash)),
    h('div', { class: 'ps-bar' }, eqWrap, openBtn),
    h('div', { class: 'ps-eggs' }, cards.map((c) => c.card), dropCard()),
    h('p', { class: 'ps-note', text: `Pets are yours forever (even after a Rebirth). Bag space: ${PET_CAPACITY} pets. Watch the sky: eggs float down on balloons, and the first to touch one hatches it for free!` }));

  let eqKey = null;
  function refresh() {
    const prof = getProfile(pid);
    const owned = ownedList(prof);
    const full = owned.length >= PET_CAPACITY;
    setText(cash, money(me?.cash || 0));
    // equipped pet summary (the team's leader)
    const eq = owned.find((x) => x.uid === teamOf(prof)[0]);
    const key = (eq?.uid || '-') + ':' + owned.length + ':' + teamOf(prof).length;
    if (key !== eqKey) {
      eqKey = key;
      eqWrap.textContent = '';
      const pet = eq && PET[eq.id];
      if (pet) {
        const more = teamOf(prof).length - 1;
        eqWrap.append(thumbEl('pet', pet.id), h('span', { class: 'ps-eq-t' }, h('b', { text: pet.name + (more > 0 ? ` +${more}` : '') }), h('small', { text: `${pet.boost} · ${owned.length}/${PET_CAPACITY} pets` })));
      } else {
        eqWrap.append(h('span', { class: 'pthumb', html: PAW_ICON, style: 'color:#ffb3d9;padding:6px' }),
          h('span', { class: 'ps-eq-t' }, h('b', { text: owned.length ? 'No pet equipped' : 'No pets yet!' }), h('small', { text: owned.length ? `${owned.length}/${PET_CAPACITY} pets · pick a buddy in My Pets` : 'Your first egg is waiting below' })));
      }
      const have = new Set(owned.map((x) => x.id));
      for (const c of cards) for (const li of c.rows) li.classList.toggle('own', have.has(li.dataset.pet));
    }
    for (const c of cards) {
      const price = c.egg.price;
      const poor = (me?.cash || 0) < price;
      c.buy.classList.toggle('poor', poor || full);
      const html = full ? '<span>Bag full!</span><small>Release a pet first</small>'
        : `<span>${poor ? 'Hatch' : 'Hatch!'}</span><small>${money(price)}</small>`;
      if (c.buy._h !== html) {
        c.buy._h = html;
        c.buy.innerHTML = html;
      }
      c.buy.setAttribute('aria-label', full ? 'Pet bag full' : `Hatch ${c.egg.name} for ${money(price)}`);
      c.need.hidden = !poor || full;
      if (poor) {
        const f = Math.max(0, Math.min(1, (me?.cash || 0) / price));
        c.barI.style.transform = `scaleX(${f.toFixed(3)})`;
        setText(c.needTxt, `Need ${money(price - (me?.cash || 0))} more`);
      }
    }
  }
  refresh();
  const timer = setInterval(refresh, 300);
  const offs = ['purchase', 'purchase:fail', 'cash:collected', 'profile:changed', 'pet:hatched'].map((n) => bus.on(n, refresh));
  return {
    el,
    title: 'Pet Eggs',
    dispose() {
      clearInterval(timer);
      offs.forEach((f) => f());
    },
  };
}

// ------------------------------------------------------------------ inventory

export function openPets(app) {
  attachPets(app);
  injectPetStyles();
  injectTeamCSS();
  const menus = app.menus;
  const pid = profileIdFor(app, app.human);
  const body = h('div', { class: 'pets-inv-body' });
  let sel = null;
  let confirming = false;

  const sorted = (prof) => {
    const team = teamOf(prof);
    const rank = (u) => (team.includes(u) ? team.indexOf(u) : 9);
    return ownedList(prof).slice().sort((a, b) => rank(a.uid) - rank(b.uid) || petScore(b.id) - petScore(a.id) || (b.t || 0) - (a.t || 0));
  };

  /** Put a pet on the team: a free slot, or instead of the weakest member when all three are taken. */
  function equip(uid) {
    updateProfile(pid, (p) => {
      if (!p.pets.owned.some((x) => x.uid === uid)) return;
      const team = teamOf(p).filter((u) => u !== uid);
      if (team.length >= MAX_TEAM) {
        const idOf = (u) => p.pets.owned.find((x) => x.uid === u)?.id;
        let weakest = team.length - 1;
        team.forEach((u, i) => {
          if (petScore(idOf(u)) < petScore(idOf(team[weakest]))) weakest = i;
        });
        team.splice(weakest, 1);
      }
      // the leader slot always counts: a new favourite goes first when only one slot is open
      writeTeam(p, slotsNow(app) <= team.length ? [uid, ...team] : [...team, uid]);
    });
    uiSound(app, 'unlock');
  }

  function unequip(uid) {
    updateProfile(pid, (p) => writeTeam(p, teamOf(p).filter((u) => u !== uid)));
    uiSound(app, 'click');
  }

  function equipBest() {
    updateProfile(pid, (p) => {
      const best = ownedList(p).slice().sort((a, b) => petScore(b.id) - petScore(a.id));
      writeTeam(p, best.slice(0, MAX_TEAM).map((x) => x.uid));
    });
    uiSound(app, 'unlock');
  }

  function release(uid) {
    fresh.delete(uid);
    updateProfile(pid, (p) => {
      p.pets.owned = p.pets.owned.filter((x) => x.uid !== uid);
      writeTeam(p, teamOf(p).filter((u) => u !== uid));
    });
    uiSound(app, 'click');
  }

  function teamRow(prof) {
    const team = teamOf(prof);
    const open = slotsNow(app);
    return h('div', { class: 'pi-team', role: 'list', 'aria-label': 'Your team' },
      Array.from({ length: MAX_TEAM }, (_, i) => {
        const x = ownedList(prof).find((y) => y.uid === team[i]);
        const pet = x && PET[x.id];
        const locked = i >= open;
        const need = BASE.petSlotsAt[i];
        return h('button', {
          class: `pt-slot${pet ? ' has r-' + pet.rarity : ''}${locked ? ' locked' : ''}`, type: 'button', role: 'listitem',
          style: pet ? `--rc:${RARITY_COLOR[pet.rarity]}` : '',
          title: locked ? `Opens at Base Lv ${need}${pet ? ' (resting until then)' : ''}` : pet ? pet.name : 'Empty slot',
          onclick: () => {
            if (!x) return;
            sel = x.uid;
            confirming = false;
            uiSound(app, 'click');
            render();
          },
        },
        pet ? thumbEl('pet', pet.id) : h('span', { class: 'pt-empty', html: PAW_ICON }),
        h('span', { class: 'pt-n', text: pet ? pet.name : locked ? `Base Lv ${need}` : 'Empty' }),
        locked ? h('span', { class: 'pt-lock', html: ICON.lock }) : null);
      }));
  }

  function render() {
    const prof = getProfile(pid);
    const list = sorted(prof);
    const team = teamOf(prof);
    if (!list.some((x) => x.uid === sel)) sel = team[0] && list.some((x) => x.uid === team[0]) ? team[0] : list[0]?.uid || null;
    if (sel) fresh.delete(sel);
    const n = list.length;
    const head = h('div', { class: 'pi-head' },
      h('span', { class: 'mh-ic', html: PAW_ICON }),
      h('h2', { text: 'My Pets' }),
      h('span', { class: 'pi-count' + (n >= PET_CAPACITY ? ' full' : ''), text: `${n}/${PET_CAPACITY}` }));
    const parts = [head];
    if (!n) {
      parts.push(h('div', { class: 'pi-empty' },
        thumbEl('egg', 'garden'),
        h('b', { text: 'No pets yet!' }),
        h('span', { text: 'Find the PET EGGS stand at the south-west corner of the plaza (next to the Gear Shop). Hatch an egg and your new buddy follows you around and helps! Eggs also float down from the sky: touch one first to hatch it free.' })));
    } else {
      parts.push(teamRow(prof));
      const cur = list.find((x) => x.uid === sel);
      const pet = PET[cur.id];
      const isEq = team.includes(cur.uid);
      const acts = h('div', { class: 'pi-acts' });
      if (confirming) {
        acts.append(h('div', { class: 'pi-confirm' },
          h('span', { text: `Release ${pet.name}? It hops back to the wild.` }),
          h('button', { class: 'btn btn-grey btn-sm', type: 'button', text: 'Keep', onclick: () => { confirming = false; uiSound(app, 'click'); render(); } }),
          h('button', { class: 'btn btn-red btn-sm', type: 'button', text: 'Release', onclick: () => { confirming = false; release(cur.uid); } })));
      } else {
        acts.append(
          isEq
            ? h('button', { class: 'btn btn-grey', type: 'button', onclick: () => unequip(cur.uid) }, h('span', { text: 'Unequip' }))
            : h('button', { class: 'btn btn-green', type: 'button', 'data-autofocus': '', onclick: () => equip(cur.uid) }, h('span', { class: 'bi', html: ICON.check }), h('span', { text: team.length >= MAX_TEAM ? 'Swap in' : 'Equip' })),
          h('button', { class: 'btn btn-red btn-sm', type: 'button', onclick: () => { confirming = true; uiSound(app, 'click'); render(); } }, h('span', { text: 'Release' })));
      }
      parts.push(h('div', { class: `pi-sel r-${pet.rarity}${isEq ? ' eq' : ''}`, style: `--rc:${RARITY_COLOR[pet.rarity]}` },
        thumbEl('pet', pet.id),
        h('div', { class: 'pi-info' },
          h('div', { class: 'pi-name' }, h('b', { text: pet.name }), rarityTag(pet.rarity), isEq ? h('span', { class: 'ph-eq', text: 'On team' }) : null),
          boostChips(pet),
          h('div', { class: 'pi-blurb', text: pet.blurb || '' })),
        acts));
      const bestIds = list.slice().sort((a, b) => petScore(b.id) - petScore(a.id)).slice(0, MAX_TEAM).map((x) => petScore(x.id));
      const teamIds = team.map((u) => petScore(list.find((x) => x.uid === u)?.id)).sort((a, b) => b - a);
      const bestIsEq = bestIds.length === teamIds.length && bestIds.every((v, i) => v === teamIds[i]);
      const open = slotsNow(app);
      parts.push(h('div', { class: 'pi-tools' },
        h('span', { class: 'pi-hint', text: n >= PET_CAPACITY ? 'Your bag is full: release a pet to hatch more.' : `Your team: up to ${MAX_TEAM} pets, their boosts add up. ${open < MAX_TEAM ? `Level up your base to open more slots (Lv ${BASE.petSlotsAt[open]}).` : ''}` }),
        bestIsEq ? null : h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: equipBest }, h('span', { class: 'bi', html: ICON.star }), h('span', { text: 'Equip Best' }))));
      parts.push(h('div', { class: 'pi-grid', role: 'list' }, list.map((x) => {
        const p = PET[x.id];
        const on = team.includes(x.uid);
        return h('button', {
          class: `pcard r-${p.rarity}${x.uid === sel ? ' sel' : ''}${fresh.has(x.uid) ? ' new' : ''}`, type: 'button', role: 'listitem',
          style: `--rc:${RARITY_COLOR[p.rarity]}`, 'aria-label': `${p.name}, ${rarityName(p.rarity)}${on ? ', on your team' : ''}`, 'aria-pressed': String(x.uid === sel),
          onclick: () => {
            sel = x.uid;
            confirming = false;
            uiSound(app, 'click');
            render();
          },
        }, thumbEl('pet', x.id), h('span', { class: 'pc-n', text: p.name }), h('span', { class: 'pc-r', text: rarityName(p.rarity) }), on ? h('span', { class: 'pc-eq', html: ICON.check }) : null);
      })));
    }
    parts.push(menus.doneRow(() => m.close()));
    body.replaceChildren(...parts);
  }

  const m = menus.openModal(body, { cls: 'pets-inv', label: 'My Pets' });
  render();
  const off = bus.on('profile:changed', ({ profile }) => {
    if (profile?.id === pid) render();
  });
  m.dispose = () => off();
  return m;
}

let teamCSS = false;
function injectTeamCSS() {
  if (teamCSS || typeof document === 'undefined') return;
  teamCSS = true;
  const el = document.createElement('style');
  el.id = 'sas-pet-team';
  el.textContent = `
.pi-team{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:2px 0 12px}
.pt-slot{position:relative;display:flex;align-items:center;gap:8px;padding:6px 10px 6px 6px;border-radius:16px;border:3px solid var(--ink);background:rgba(255,255,255,.07);color:#fff;cursor:pointer;min-width:0;box-shadow:0 3px 0 var(--ink)}
.pt-slot.has{background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 30%,transparent),rgba(10,15,40,.35))}
.pt-slot .pthumb{width:46px;height:46px;flex:none}
.pt-empty{width:46px;height:46px;display:grid;place-items:center;border-radius:50%;border:2.5px dashed rgba(255,255,255,.4);color:rgba(255,255,255,.4);padding:10px;flex:none}
.pt-n{font:800 13px/1.15 var(--fb);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-slot.locked{opacity:.75}
.pt-slot.locked .pthumb{filter:grayscale(.7) brightness(.8)}
.pt-lock{position:absolute;top:-8px;right:-6px;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;background:var(--ink);color:#ffcf6b;padding:4px}
.egg-card.drop-only{background:linear-gradient(135deg,rgba(255,92,138,.25),rgba(92,200,255,.25)),var(--panel)}
.egg-card.drop-only .ec-price{background:linear-gradient(90deg,#ff5c8a,#ffb627,#4cd964,#5cc8ff,#b36bff);color:#fff;text-shadow:var(--o1)}
.ec-drop-tip{font:800 12.5px/1.3 var(--fb);color:#fff;padding:4px 2px}
@media (max-width:600px){.pt-slot{flex-direction:column;padding:6px 4px;gap:3px}.pt-n{font-size:11.5px;text-align:center;white-space:normal}}
`;
  document.head.appendChild(el);
}
