// Pets UI. OWNER: pets agent (docs/ONLINE.md).
//   attachPets(app)              once per page (idempotent): hatched pets -> profile + the hatch moment
//   buildPetShop(app, close)     the PET EGGS stand panel -> {el, title, dispose} (menus.openShop('pets'))
//   openPets(app)                "My Pets" inventory: equip, unequip, release (also from the title screen)
// Pets live on the active profile (profile.pets = {owned: [{uid, id, t}], equipped: uid|null}); main.js turns
// an equipped change into app.act('setPet', id) while playing.
import { bus } from '../core/events.js';
import { getProfile, updateProfile } from '../core/profiles.js';
import { PET, EGGS, PET_CAPACITY, eggOdds, fmtPct, boostLines, petScore } from '../pets/catalog.js';
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

/** Listen for hatches of the local player (offline, or relayed from an online host). Safe to call often. */
export function attachPets(app) {
  if (attachedApp) return;
  attachedApp = app;
  injectPetStyles();
  // the pet studio follows the game's graphics quality, and repaints placeholders after a WebGL context loss
  configureStudio({ engine: app.engine });
  onStudioReady(retryThumbs);
  bus.on('pet:hatched', ({ player, egg, pet } = {}) => {
    if (!player || player !== app.human || !PET[pet]) return;
    const pid = profileIdFor(app, player);
    const before = getProfile(pid);
    if (!before) return;
    const isNew = !ownedList(before).some((x) => x.id === pet);
    const uid = newUid();
    let equipped = false;
    // save first: the pet is theirs even if the hatch moment is skipped or the page closes
    updateProfile(pid, (p) => {
      p.pets.owned.push({ uid, id: pet, t: Date.now() });
      if (!p.pets.equipped || !p.pets.owned.some((x) => x.uid === p.pets.equipped)) {
        p.pets.equipped = uid;
        equipped = true;
      }
    });
    fresh.add(uid);
    playHatch(app, {
      petId: pet,
      eggId: egg,
      isNew,
      equipped,
      onEquip: () => updateProfile(pid, (p) => {
        if (p.pets.owned.some((x) => x.uid === uid)) p.pets.equipped = uid;
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

  const cards = EGGS.map((egg, i) => {
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
    h('div', { class: 'ps-eggs' }, cards.map((c) => c.card)),
    h('p', { class: 'ps-note', text: `Pets are yours forever (even after a Rebirth). Bag space: ${PET_CAPACITY} pets.` }));

  let eqKey = null;
  function refresh() {
    const prof = getProfile(pid);
    const owned = ownedList(prof);
    const full = owned.length >= PET_CAPACITY;
    setText(cash, money(me?.cash || 0));
    // equipped pet summary
    const eq = owned.find((x) => x.uid === prof?.pets?.equipped);
    const key = (eq?.uid || '-') + ':' + owned.length;
    if (key !== eqKey) {
      eqKey = key;
      eqWrap.textContent = '';
      const pet = eq && PET[eq.id];
      if (pet) {
        eqWrap.append(thumbEl('pet', pet.id), h('span', { class: 'ps-eq-t' }, h('b', { text: pet.name }), h('small', { text: `${pet.boost} · ${owned.length}/${PET_CAPACITY} pets` })));
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
  const menus = app.menus;
  const pid = profileIdFor(app, app.human);
  const body = h('div', { class: 'pets-inv-body' });
  let sel = null;
  let confirming = false;

  const sorted = (prof) => {
    const eq = prof.pets.equipped;
    return ownedList(prof).slice().sort((a, b) => (b.uid === eq) - (a.uid === eq) || petScore(b.id) - petScore(a.id) || (b.t || 0) - (a.t || 0));
  };

  function equip(uid) {
    updateProfile(pid, (p) => {
      p.pets.equipped = uid && p.pets.owned.some((x) => x.uid === uid) ? uid : null;
    });
    uiSound(app, uid ? 'unlock' : 'click');
  }

  function release(uid) {
    fresh.delete(uid);
    updateProfile(pid, (p) => {
      p.pets.owned = p.pets.owned.filter((x) => x.uid !== uid);
      if (p.pets.equipped === uid) p.pets.equipped = null;
    });
    uiSound(app, 'click');
  }

  function render() {
    const prof = getProfile(pid);
    const list = sorted(prof);
    const eqUid = prof.pets.equipped;
    if (!list.some((x) => x.uid === sel)) sel = eqUid && list.some((x) => x.uid === eqUid) ? eqUid : list[0]?.uid || null;
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
        h('span', { text: 'Find the PET EGGS stand at the south-west corner of the plaza (next to the Gear Shop). Hatch an egg and your new buddy follows you around and helps!' })));
    } else {
      const cur = list.find((x) => x.uid === sel);
      const pet = PET[cur.id];
      const isEq = cur.uid === eqUid;
      const acts = h('div', { class: 'pi-acts' });
      if (confirming) {
        acts.append(h('div', { class: 'pi-confirm' },
          h('span', { text: `Release ${pet.name}? It hops back to the wild.` }),
          h('button', { class: 'btn btn-grey btn-sm', type: 'button', text: 'Keep', onclick: () => { confirming = false; uiSound(app, 'click'); render(); } }),
          h('button', { class: 'btn btn-red btn-sm', type: 'button', text: 'Release', onclick: () => { confirming = false; release(cur.uid); } })));
      } else {
        acts.append(
          isEq
            ? h('button', { class: 'btn btn-grey', type: 'button', onclick: () => equip(null) }, h('span', { text: 'Unequip' }))
            : h('button', { class: 'btn btn-green', type: 'button', 'data-autofocus': '', onclick: () => equip(cur.uid) }, h('span', { class: 'bi', html: ICON.check }), h('span', { text: 'Equip' })),
          h('button', { class: 'btn btn-red btn-sm', type: 'button', onclick: () => { confirming = true; uiSound(app, 'click'); render(); } }, h('span', { text: 'Release' })));
      }
      parts.push(h('div', { class: `pi-sel r-${pet.rarity}${isEq ? ' eq' : ''}`, style: `--rc:${RARITY_COLOR[pet.rarity]}` },
        thumbEl('pet', pet.id),
        h('div', { class: 'pi-info' },
          h('div', { class: 'pi-name' }, h('b', { text: pet.name }), rarityTag(pet.rarity), isEq ? h('span', { class: 'ph-eq', text: 'Equipped' }) : null),
          boostChips(pet),
          h('div', { class: 'pi-blurb', text: pet.blurb || '' })),
        acts));
      const best = list.reduce((a, x) => (!a || petScore(x.id) > petScore(a.id) ? x : a), null);
      const eqPet = list.find((x) => x.uid === eqUid);
      const bestIsEq = !best || (eqPet && petScore(eqPet.id) >= petScore(best.id));
      const bestUid = best?.uid;
      parts.push(h('div', { class: 'pi-tools' },
        h('span', { class: 'pi-hint', text: n >= PET_CAPACITY ? 'Your bag is full: release a pet to hatch more.' : 'Tap a pet to see it. One buddy follows you at a time.' }),
        bestIsEq ? null : h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => { sel = bestUid; equip(bestUid); } }, h('span', { class: 'bi', html: ICON.star }), h('span', { text: 'Equip Best' }))));
      parts.push(h('div', { class: 'pi-grid', role: 'list' }, list.map((x) => {
        const p = PET[x.id];
        const on = x.uid === eqUid;
        return h('button', {
          class: `pcard r-${p.rarity}${x.uid === sel ? ' sel' : ''}${fresh.has(x.uid) ? ' new' : ''}`, type: 'button', role: 'listitem',
          style: `--rc:${RARITY_COLOR[p.rarity]}`, 'aria-label': `${p.name}, ${rarityName(p.rarity)}${on ? ', equipped' : ''}`, 'aria-pressed': String(x.uid === sel),
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

