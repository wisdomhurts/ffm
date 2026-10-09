// Binds the pure Game state to 3D objects and world labels every frame.
import * as THREE from 'three';
import { PLANT, RARITY, MUTATIONS, LOCK, PLANTERS, LOTS, BIOMES } from '../config.js';
import { createAvatar } from '../characters/avatar.js';
import { getFace } from '../characters/faces.js';
import { createMonster } from '../characters/monsters.js';
import { createPlantView, createSeedView, createCarriedPlantView, createPodView } from '../plants/plantMeshes.js';
import { createBanana, createBalloon } from '../fx/props.js';
import { fmt, SELL_SECONDS } from '../gameplay/game.js';
import { bus } from '../core/events.js';
import { createPetView } from '../pets/view.js';
import { createDropView } from '../pets/dropView.js';
import { EGG } from '../pets/catalog.js';
import { TREADMILL } from '../config.js';
import { beltRect } from '../gameplay/layout.js';
import { sizeOf, shownSize, sizeChip, heroRibbon, addTitanBeam } from './sizes.js';
import { SIZES } from '../config.js';
import { createBossBinding } from './bossView.js';
import { createBlobShadows } from '../fx/blobShadows.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function rarityTag(rarityId) {
  const r = RARITY[rarityId];
  return `<span class="rar rar-${r.id}">${r.name}</span>`;
}

export function mutationTag(mut) {
  const m = MUTATIONS[mut];
  return m.name ? `<span class="mut mut-${m.id}">${m.name}</span>` : '';
}

// pickPet scratch (no allocations per click or hover)
const PICK = { ray: new THREE.Raycaster(), ndc: new THREE.Vector2(), c: new THREE.Vector3(), d: new THREE.Vector3() };
const CHEERS = { backflip: 'Flip!', spin: 'Wheee!', jump: 'Boing!', dance: 'Dance!', roll: 'Roll!', loop: 'Loop!', barrel: 'Woosh!', spinrise: 'Wheee!', dive: 'Zoom!' };

export class GameView {
  constructor({ engine, game, world, labels, fx }) {
    this.engine = engine;
    this.game = game;
    this.world = world;
    this.labels = labels;
    this.fx = fx;
    this.root = new THREE.Group();
    this.root.name = 'game-view';
    engine.scene.add(this.root);
    this.avatars = [];
    this.carryKeys = [];
    this._avatarKey = [];
    this.plantViews = new Map(); // `${slot}:${index}` -> {key, view}
    this.podViews = [];
    this.groundViews = new Map();
    this.projViews = new Map();
    this.monsterViews = [];
    this.petViews = []; // per slot: [{id, view, mood}] for the pets following that player (team of up to 3)
    this.dropViews = new Map(); // egg drops: uid -> view
    this._baseKeys = []; // per garden: what setBase last drew
    this.unsub = [];
    this._build();
  }

  _build() {
    const g = this.game;
    g.players.forEach((p, i) => this._makeAvatar(i));
    g.pods.forEach((pod) => {
      const v = createPodView(pod.biome);
      v.object3d.position.set(pod.x, 0, pod.z);
      this.root.add(v.object3d);
      this.podViews.push({ view: v, key: null });
    });
    g.monsters.forEach((m) => {
      const v = createMonster(m.type);
      this.root.add(v.object3d);
      this.monsterViews.push(v);
      v.blobR = blobRadius(v.object3d);
    });
    this.bossView = createBossBinding(this); // Big Chomp, the world boss
    // soft contact shadows under players and monsters (one draw call; pets have their own)
    this.blobs = createBlobShadows(this.root, { strong: !this.engine.quality?.shadows });
    this.unsub.push(bus.on('face:changed', ({ id }) => {
      for (const p of this.game.players) if (p.faceKey === id) this._loadFace(p.slot);
    }));
    // a friend took over a garden, someone changed outfit, or this device's own slot changed
    this.unsub.push(bus.on('slot:changed', ({ slot }) => this._makeAvatar(slot)));
    this.unsub.push(bus.on('player:look', ({ player }) => this._makeAvatar(player.slot)));
    // base extras: the Guard Gnome swings its noodle, trampolines squash
    this.unsub.push(bus.on('guard:bonk', ({ garden }) => this.world.gardens?.[garden?.slot]?.guard?.swing?.()));
    this.unsub.push(bus.on('base:bounce', ({ garden, spot }) => this.world.gardens?.[garden?.slot]?.decor?.[spot]?.userData?.bounce?.()));
    // someone clicked a pet: everyone sees it do the trick
    this.unsub.push(bus.on('pet:trick', (e) => this._petTrick(e)));
  }

  /**
   * The pet under a screen point (client pixels), own or anyone else's: {slot, k} or null. A ray against a
   * sphere round each visible pet, nearest hit first. `touch`: a fingertip, so the spheres are a bit bigger.
   */
  pickPet(x, y, touch = false) {
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    PICK.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    PICK.ray.setFromCamera(PICK.ndc, this.engine.camera);
    const ray = PICK.ray.ray;
    let best = null;
    let bestT = 160; // studs: further pets are specks
    for (let slot = 0; slot < this.petViews.length; slot++) {
      const recs = this.petViews[slot];
      if (!recs || !this.game.players[slot]?.present) continue;
      for (let k = 0; k < recs.length; k++) {
        const rec = recs[k];
        if (!rec || !rec.view.object3d.visible || !rec.view.center) continue;
        const c = rec.view.center(PICK.c);
        const t = PICK.d.subVectors(c, ray.origin).dot(ray.direction);
        if (t < 0.5 || t > bestT) continue;
        // far pets get a little extra so they stay clickable (a fingertip gets more)
        const rad = rec.view.radius * (touch ? 1.3 : 1) + t * (touch ? 0.03 : 0.01);
        if (ray.distanceSqToPoint(c) > rad * rad) continue;
        bestT = t;
        best = { slot, k };
      }
    }
    return best;
  }

  _petTrick({ owner, k, trick, player }) {
    const rec = this.petViews[owner]?.[k];
    if (!rec || !rec.view.object3d.visible || !rec.view.trick?.(trick)) return;
    const c = rec.view.center(PICK.c);
    const cam = this.engine.camera.position;
    const d = Math.hypot(c.x - cam.x, c.z - cam.z);
    if (d > 90 || !this.fx) return;
    const near = d < 40 ? 1 : 0.6;
    const at = { x: c.x, y: c.y + 0.4, z: c.z };
    this.fx.burst('sparkle', at, { count: 10, scale: 0.6, lod: near, colors: ['#fff6a8', '#ff9ed8', '#9ee8ff', '#ffffff'] });
    this.fx.burst('hearts', { x: c.x, y: c.y + 0.8, z: c.z }, { count: 3, scale: 0.55, lod: near });
    // a little cheer over the pet, for whoever clicked it and the pet's owner
    const me = this.game.human;
    if (me && (player === me || this.game.players[owner] === me)) {
      this.fx.floatText(CHEERS[trick] || 'Wheee!', { x: c.x, y: c.y + rec.view.radius + 1.6, z: c.z }, { style: 'comic', size: 's', duration: 1.1, rise: 1.6 });
    }
  }

  _makeAvatar(i) {
    const g = this.game;
    const p = g.players[i];
    const old = this.avatars[i];
    if (old) {
      if (this.xray && this.xraySlot === i) {
        this.xray.dispose();
        this.xray = null;
      }
      this.root.remove(old.object3d);
      old.dispose?.();
    }
    const look = p.look || p.char.look;
    const av = createAvatar({ ...p.char, look }, null, look.skin, look);
    av.object3d.position.set(p.pos.x, p.pos.y, p.pos.z);
    this.root.add(av.object3d);
    this.avatars[i] = av;
    this.carryKeys[i] = null;
    this._avatarKey[i] = p.faceKey + '|' + p.kind;
    if (p === g.human) {
      this.xray = addXray(av.object3d, p.char.color);
      this.xraySlot = i;
    }
    this._loadFace(i);
  }

  _loadFace(i) {
    const p = this.game.players[i];
    const key = p.faceKey;
    getFace(key).then((f) => {
      if (this.disposed || this.game.players[i].faceKey !== key) return;
      this.avatars[i]?.setFace(f.face, f.skin);
      this.world.gardens?.[p.slot]?.setOwner?.({ ...p.char, name: p.name, vacant: !p.present }, p.present ? f.avatarUrl : null);
    });
  }

  update(dt, time, camera) {
    const g = this.game;
    const now = g.time;
    const L = this.labels;
    const human = g.human;
    // labels are sized by distance to the player (or the camera in attract mode)
    const focus = human ? human.pos : camera.position;
    if (this.blobs) {
      this.blobs.strong = !this.engine.renderer.shadowMap.enabled; // the engine may drop shadows on slow devices
      this.blobs.begin();
    }

    // players
    g.players.forEach((p, i) => {
      if (this._avatarKey[i] !== p.faceKey + '|' + p.kind) this._makeAvatar(i);
      const av = this.avatars[i];
      const o = av.object3d;
      // an empty garden (online, fewer computer players): nobody to draw
      o.visible = p.present;
      if (!p.present) {
        this._updatePet(i, p, dt, time, now, 0);
        return;
      }
      o.position.set(p.pos.x, p.pos.y, p.pos.z);
      o.rotation.y = p.yaw;
      const c = p.carrying;
      const key = c ? (c.kind === 'seed' ? `s:${c.speciesId}:${c.mutation}` : `p:${c.plant.uid}:${c.plant.mutation}:${sizeOf(c.plant)}`) : null;
      if (key !== this.carryKeys[i]) {
        this.carryKeys[i] = key;
        if (this.carryViews?.[i]) this.carryViews[i] = null;
        let view = null;
        if (c?.kind === 'seed') view = createSeedView(c.speciesId, c.mutation);
        else if (c?.kind === 'plant') view = createCarriedPlantView(c.plant.speciesId, c.plant.mutation, { size: sizeOf(c.plant) });
        (this.carryViews ||= [])[i] = view;
        // the pot on the local player's head draws after the x-ray so the head's outline never shows through it
        if (view && p === human) view.object3d.traverse((o) => { if (o.isMesh && !o.material.transparent) o.renderOrder += 31; });
        av.setCarry(view ? view.object3d : null);
      }
      this.carryViews?.[i]?.update(dt, time);
      const swingAge = now - p.swingStart;
      const invisible = p.invisible(now) ? (p === human ? 0.35 : 0.0) : 1;
      av.update(dt, {
        time,
        speed: Math.hypot(p.vel.x, p.vel.z),
        onGround: p.onGround,
        vy: p.vel.y,
        carrying: c ? c.kind : null,
        stunned: now < p.stunUntil,
        swing: swingAge < 0.35 ? swingAge / 0.35 : -1,
        celebrating: now < p.celebrateUntil,
        invisible,
        isLocal: p === human,
        coil: now < p.coilUntil || now < p.boostUntil,
        interacting: p.interact?.t > 0 ? p.interact.verb : p.sell?.t > 0 ? 'Sell' : null,
        emote: p.emote && now < p.emote.until ? p.emote.id : null,
        emoteT: p.emote ? now - (p.emote.since ?? now) : 0,
      });
      if (p === human && this.xray) this.xray.setVisible(invisible >= 1);
      this._blobUnder(p.pos.x, p.pos.y, p.pos.z, (p.look || p.char.look)?.build === 'kid' ? 1.45 : 1.7, invisible, camera, p.onGround);
      this._updatePet(i, p, dt, time, now, invisible);
      if (invisible > 0.05) {
        const tag = heroRibbon(p, now) + (p === human ? '' : `<div class="nt-name" style="--c:${p.char.color}">${esc(p.name)}${p.rebirths ? ` <span class="nt-rb">★${p.rebirths}</span>` : ''}</div>`);
        let carry = '';
        if (c && p !== human) {
          const sid = c.kind === 'seed' ? c.speciesId : c.plant.speciesId;
          const mut = c.kind === 'seed' ? c.mutation : c.plant.mutation;
          carry = `<div class="nt-carry">${c.kind === 'plant' ? 'STOLEN ' : ''}${mutationTag(mut)} <b style="color:${rarityColor(PLANT[sid].rarity)}">${esc(PLANT[sid].name)}</b></div>`;
        }
        const top = av.headTop.position.y * av.object3d.scale.y;
        const lift = c?.kind === 'plant' ? (SIZES[sizeOf(c.plant)].scale - 1) * 1.6 : 0; // a giant pot is taller
        if (tag || carry) L.set('pl' + i, { x: p.pos.x, y: p.pos.y + top + (c ? 3.9 + lift : 1.4), z: p.pos.z }, tag + carry, { cls: 'nametag' + (c?.kind === 'plant' ? ' thief' : ''), maxDist: 110 });
      }
    });

    this._updateDrops(dt, time, camera);
    this._updateBases(dt, time);

    // planters / plants: only the planter nearest the player gets the full card (others get a chip)
    let nearKey = null;
    let nearD = 12;
    for (const gd of g.gardens) {
      for (const pl of gd.planters) {
        if (!pl.plant) continue;
        const d = Math.hypot(pl.x - focus.x, pl.z - focus.z);
        if (d < nearD) {
          nearD = d;
          nearKey = gd.slot + ':' + pl.index;
        }
      }
    }
    g.gardens.forEach((gd) => {
      const signs = this.world.gardens?.[gd.slot];
      const lotsOwned = g.lotsOwned ? g.lotsOwned(gd) : 0;
      gd.planters.forEach((pl) => {
        const k = gd.slot + ':' + pl.index;
        signs?.planters?.[pl.index]?.setUnlocked(pl.unlocked);
        const plant = pl.plant;
        const size = plant ? shownSize(plant, now) : 'normal'; // Giant Harvests (normal through the drumroll)
        const key = plant ? plant.uid + ':' + plant.mutation + ':' + size : null;
        let rec = this.plantViews.get(k);
        if (!rec || rec.key !== key) {
          if (rec?.view) this.root.remove(rec.view.object3d);
          rec = { key, view: null };
          if (plant) {
            rec.view = createPlantView(plant.speciesId, plant.mutation, { size });
            rec.view.object3d.position.set(pl.x, 1.2, pl.z);
            if (SIZES[size].beam) addTitanBeam(rec.view, plant.mutation);
            this.root.add(rec.view.object3d);
          }
          this.plantViews.set(k, rec);
        }
        if (rec.view && Math.hypot(pl.x - camera.position.x, pl.z - camera.position.z) > 200) {
          rec.view.object3d.visible = false;
        } else if (rec.view) {
          const p01 = plant.growTotal > 0 ? 1 - plant.growLeft / plant.growTotal : 1;
          rec.view.setGrowth(Math.max(0, Math.min(1, p01)));
          rec.view.update(dt, time);
          rec.view.object3d.visible = true;
          // shake while being stolen
          rec.view.object3d.rotation.z = pl.stealer != null ? Math.sin(time * 40) * 0.08 : 0;
          const sp = PLANT[plant.speciesId];
          const grown = plant.growLeft <= 0;
          const inc = g.plantIncome(plant, gd.owner);
          const body = grown
            ? `<div class="pl-inc">$${fmt(inc)}/s</div>`
            : `<div class="pl-bar"><i style="width:${(p01 * 100).toFixed(0)}%"></i></div><div class="pl-time">${Math.ceil(plant.growLeft)}s</div>`;
          // Level of detail: full card close to the player, a compact income chip further away.
          const fd = Math.hypot(pl.x - focus.x, pl.z - focus.z);
          const labelY = 1.2 + Math.max(4.4, rec.view.topY || 0) + 1.0;
          const stealing = pl.stealer != null ? '<div class="pl-steal">BEING STOLEN!</div>' : '';
          if (k === nearKey || stealing) {
            L.set('pt' + k, { x: pl.x, y: labelY, z: pl.z },
              `${sizeChip(size)}${mutationTag(plant.mutation)}<div class="pl-name" style="color:${rarityColor(sp.rarity)}">${esc(sp.name)}</div>${rarityTag(sp.rarity)}${body}${stealing}`,
              { cls: 'plantlbl' + (grown ? ' grown' : ''), maxDist: 70 });
          } else if (fd < 46) {
            const chip = grown
              ? `${sizeChip(size)}<div class="pl-inc" style="--rc:${rarityColor(sp.rarity)}">$${fmt(inc)}/s</div>`
              : `<div class="pl-bar"><i style="width:${(p01 * 100).toFixed(0)}%"></i></div>`;
            L.set('pt' + k, { x: pl.x, y: labelY - 0.6, z: pl.z }, chip, { cls: 'plantlbl compact' + (grown ? ' grown' : ''), maxDist: 70 });
          }
        } else if (!pl.unlocked && gd.owner === human && pl.lot < 0) {
          L.set('pt' + k, { x: pl.x, y: 3, z: pl.z }, `<div class="pl-lock"><i class="ic-lock"></i> $${fmt(PLANTERS.unlockCost[pl.index])}</div>`, { cls: 'plantlbl locked', maxDist: 40 });
        } else if (!pl.unlocked && gd.owner === human && pl.index === PLANTERS.base + pl.lot * LOTS.planters + (LOTS.planters >> 1)) {
          // one sign per FOR SALE lot, over its middle planter: the next lot shows its price, later ones wait their turn
          const html = pl.lot === lotsOwned
            ? `<div class="pl-sale">FOR SALE</div><div class="pl-lock">+${LOTS.planters} planters <b>$${fmt(LOTS.cost[pl.lot])}</b></div>`
            : `<div class="pl-lock"><i class="ic-lock"></i> LOT ${pl.lot + 1}</div>`;
          L.set('pt' + k, { x: pl.x, y: 3.4, z: pl.z }, html, { cls: 'plantlbl locked lot' + (pl.lot === lotsOwned ? ' next' : ''), maxDist: 70 });
        }
      });
      // collect pad + lock pad labels
      const Lg = gd.L;
      const pile = Math.floor(gd.cashPile);
      const mineG = gd.owner === human;
      const padD = Math.hypot(Lg.collectPad.x - focus.x, Lg.collectPad.z - focus.z);
      const onPad = mineG && padD < Lg.collectPad.r + 0.5;
      if (!onPad && (mineG || !human || (pile > 0 && padD < 30))) {
        L.set('cp' + gd.slot, { x: Lg.collectPad.x, y: 1.8, z: Lg.collectPad.z }, `<div class="cp-amt">$${fmt(pile)}</div><div class="cp-lbl">COLLECT</div>`, { cls: 'padlbl collect' + (mineG ? ' mine' : ''), maxDist: 60 });
      }
      const locked = g.isLocked(gd);
      const ready = now >= gd.lockReadyAt;
      const lockTxt = locked ? `LOCKED ${Math.ceil(gd.lockedUntil - now)}s` : ready ? 'LOCK' : `LOCK ${Math.ceil(gd.lockReadyAt - now)}s`;
      // your own lock pad gets a label; rivals' gates show their countdown on the 3D gate post
      if (mineG) L.set('lk' + gd.slot, { x: Lg.lockPad.x, y: 1.6, z: Lg.lockPad.z }, `<div class="lk">${lockTxt}</div>`, { cls: 'padlbl lock' + (locked ? ' on' : ready ? ' ready' : ''), maxDist: 60 });
      signs?.setLocked?.(locked, locked ? gd.lockedUntil - now : 0);
      signs?.setCashPile?.(gd.cashPile);
    });

    // pods (small props: skip drawing/animating the far ones; special seeds have beams visible from afar)
    const cx = camera.position.x, cz = camera.position.z;
    g.pods.forEach((pod, i) => {
      const rec = this.podViews[i];
      const key = pod.seed ? pod.seed.speciesId + ':' + pod.seed.mutation : null;
      const cd = Math.hypot(pod.x - cx, pod.z - cz);
      const special = pod.seed && (pod.seed.mutation !== 'normal' || pod.seed.lucky || RARITY[PLANT[pod.seed.speciesId].rarity].tier >= 5);
      const visible = cd < (special ? 300 : 170);
      rec.view.object3d.visible = visible;
      if (rec.key !== key) {
        rec.key = key;
        rec.view.setSeed(pod.seed ? createSeedView(pod.seed.speciesId, pod.seed.mutation) : null);
      }
      if (!visible) return;
      rec.view.update(dt, time);
      if (pod.seed) {
        const sp = PLANT[pod.seed.speciesId];
        const fd = Math.hypot(pod.x - focus.x, pod.z - focus.z);
        const special = pod.seed.mutation !== 'normal' || pod.seed.lucky || RARITY[sp.rarity].tier >= 5;
        if (fd < 26 || (special && fd < 60)) {
          L.set('pod' + i, { x: pod.x, y: 4.2, z: pod.z }, `${mutationTag(pod.seed.mutation)}<div class="pd-name" style="color:${rarityColor(sp.rarity)}">${esc(sp.name)}</div>${rarityTag(sp.rarity)}`, { cls: 'podlbl' + (fd < 26 ? '' : ' compact'), maxDist: 70 });
        }
      }
    });

    // ground items
    const seen = new Set();
    for (const gi of g.ground) {
      seen.add(gi.uid);
      let v = this.groundViews.get(gi.uid);
      if (!v) {
        v = gi.kind === 'seed' ? createSeedView(gi.speciesId, gi.mutation) : { object3d: createBanana(), update() {} };
        this.root.add(v.object3d);
        this.groundViews.set(gi.uid, v);
      }
      v.object3d.position.set(gi.x, (gi.y || 0) + (gi.kind === 'seed' ? 1.1 + Math.sin(time * 3 + gi.uid) * 0.2 : 0), gi.z);
      v.update(dt, time);
      if (gi.kind === 'seed') {
        const left = gi.expiresAt - now;
        v.object3d.visible = left > 3 || Math.floor(time * 8) % 2 === 0;
        const gsp = PLANT[gi.speciesId];
        L.set('gi' + gi.uid, { x: gi.x, y: 3.2, z: gi.z }, `${mutationTag(gi.mutation)}<div class="pd-name" style="color:${rarityColor(gsp.rarity)}">${esc(gsp.name)}</div>${rarityTag(gsp.rarity)}<div class="pl-time">${Math.max(0, Math.ceil(left))}s</div>`, { cls: 'podlbl', maxDist: 50 });
      }
    }
    for (const [id, v] of this.groundViews) {
      if (!seen.has(id)) {
        this.root.remove(v.object3d);
        this.groundViews.delete(id);
      }
    }

    // projectiles
    const pseen = new Set();
    for (const b of g.projectiles) {
      pseen.add(b.uid);
      let o = this.projViews.get(b.uid);
      if (!o) {
        o = createBalloon();
        this.root.add(o);
        this.projViews.set(b.uid, o);
      }
      o.position.set(b.x, b.y, b.z);
      o.rotation.x += dt * 8;
    }
    for (const [id, o] of this.projViews) {
      if (!pseen.has(id)) {
        this.root.remove(o);
        this.projViews.delete(id);
      }
    }

    // monsters
    g.monsters.forEach((m, i) => {
      const v = this.monsterViews[i];
      v.object3d.visible = Math.hypot(m.x - camera.position.x, m.z - camera.position.z) < 260;
      if (!v.object3d.visible) return;
      v.object3d.position.set(m.x, m.y, m.z);
      v.object3d.rotation.y = m.yaw;
      v.update(dt, { time, speed: Math.hypot(m.vx, m.vz), state: now < m.stunUntil ? 'stunned' : m.state, attackAge: now - m.attackAt });
      this._blobUnder(m.x, m.y, m.z, v.blobR || 1.4, 1, camera, true);
      if (m.state === 'chase') L.set('mo' + i, { x: m.x, y: 7, z: m.z }, '<div class="mo-alert">!</div>', { cls: 'monlbl', maxDist: 80 });
    });
    this.bossView.update(dt, time, camera);
    this.blobs?.end();
  }

  /** Contact shadow on the ground under a character (shrinks and fades as it jumps). */
  _blobUnder(x, y, z, r, alpha, camera, onGround) {
    if (!this.blobs || alpha <= 0.05) return;
    const dx = x - camera.position.x, dz = z - camera.position.z;
    if (dx * dx + dz * dz > 140 * 140) return;
    const gy = onGround ? y : this.game.physics?.groundHeight?.(x, z, 0.5, y + 0.1) ?? 0;
    const h = Math.max(0, y - gy);
    this.blobs.add(x, gy, z, r * Math.max(0.55, 1 - h * 0.07), alpha * Math.max(0.2, 1 - h * 0.12));
  }

  _updatePet(i, p, dt, time, now, invisible) {
    const recs = (this.petViews[i] ||= []);
    const ids = this.game.activePets ? this.game.activePets(p) : p.pet ? [p.pet] : [];
    const side0 = i % 2 ? -1 : 1;
    for (let k = 0; k < 3; k++) {
      let rec = recs[k];
      const id = (p.present && ids[k]) || null;
      if ((rec?.id || null) !== id) {
        if (rec) {
          this.root.remove(rec.view.object3d);
          rec.view.dispose();
        }
        // team: one on each side, the third straight behind
        const opts = k === 0 ? { side: side0 } : k === 1 ? { side: -side0 } : { side: 0, back: 2.2 };
        rec = recs[k] = id ? { id, view: createPetView(id, opts), mood: { celebrating: false, stunned: false } } : null;
        if (rec) this.root.add(rec.view.object3d);
      }
      if (!rec) continue;
      rec.view.object3d.visible = invisible > 0.05;
      rec.mood.celebrating = now < p.celebrateUntil;
      rec.mood.stunned = now < p.stunUntil;
      rec.view.update(dt, p, time, rec.mood);
      // a nicknamed pet wears a small name tag (hidden with its owner's cloak)
      const nick = p.petNames?.[k];
      if (nick && invisible > 0.05) {
        const at = rec.view.object3d.position;
        const html = rec.tagFor === nick ? rec.tag : (rec.tag = `<div class="pt-tag" style="--c:${p.char.color}">${esc(nick)}</div>`);
        rec.tagFor = nick;
        this.labels.set('pt' + i + ':' + k, { x: at.x, y: at.y + rec.view.top + 0.55, z: at.z }, html, { cls: 'petlbl', maxDist: 48 });
      }
    }
  }

  /** Egg drops: falling eggs under balloons, then waiting on the ground. */
  _updateDrops(dt, time, camera) {
    const g = this.game;
    const now = g.time;
    const L = this.labels;
    const seen = this._dropSeen || (this._dropSeen = new Set());
    seen.clear();
    for (const d of g.drops || []) {
      seen.add(d.uid);
      let v = this.dropViews.get(d.uid);
      if (!v) {
        v = createDropView(d.egg);
        v.object3d.position.set(d.x, 0, d.z);
        this.root.add(v.object3d);
        this.dropViews.set(d.uid, v);
      }
      const far = Math.hypot(d.x - camera.position.x, d.z - camera.position.z) > 420;
      v.object3d.visible = !far;
      if (far) continue;
      const landed = now >= d.landAt;
      const left = d.expiresAt - now;
      v.update(dt, time, { y: g.dropY ? g.dropY(d, now) : 0, landed, expiring: landed && left < 10 ? 1 - left / 10 : 0 });
      const me = g.human;
      if (landed && me && Math.hypot(d.x - me.pos.x, d.z - me.pos.z) < 45) {
        const egg = EGG[d.egg];
        L.set('dr' + d.uid, { x: d.x, y: 4.4, z: d.z }, `<div class="dr-name">${esc(egg?.name || 'Egg')}</div><div class="dr-sub">Touch to hatch!</div>`, { cls: 'droplbl' + (d.egg === 'rainbow' ? ' rainbow' : ''), maxDist: 60 });
      }
    }
    for (const [uid, v] of this.dropViews) {
      if (seen.has(uid)) continue;
      v.dispose();
      this.dropViews.delete(uid);
    }
  }

  /** Bases: level + Base Studio look, the Guard Gnome, the home treadmill and the Speed Shop belts. */
  _updateBases(dt, time) {
    const g = this.game;
    const W = this.world;
    g.gardens.forEach((gd, slot) => {
      const api = W.gardens?.[slot];
      if (!api) return;
      const o = gd.owner;
      const level = o.present ? o.baseLevel : 1;
      const look = gd.look;
      const key = look ? `${level}|${look.floor}|${look.fence}|${look.laser}|${look.decor.join(',')}|${o.treadmillTier}` : '';
      if (key && key !== this._baseKeys[slot]) {
        this._baseKeys[slot] = key;
        try {
          api.setBase?.({ level, style: look });
          api.setTreadmillTier?.(o.treadmillTier);
        } catch (e) {
          console.warn('[view] base restyle failed', e);
        }
      }
      api.guard?.update?.(dt, time, { alert: !!gd.guardAlert });
      if (api.treadmill) {
        const r = (this._homeBelts ||= [])[slot] || (this._homeBelts[slot] = beltRect(gd.L.treadmill));
        const running = g.players.some((p) => p.present && p.pos.x > r.minX && p.pos.x < r.maxX && p.pos.z > r.minZ && p.pos.z < r.maxZ && p.pos.y < TREADMILL.beltTop + 0.6);
        api.treadmill.update?.(dt, time, { running });
      }
    });
    const shop = W.speedShop;
    if (shop?.setBusy) {
      const rects = this._shopBelts || (this._shopBelts = g.layout.speedStations.map((st) => beltRect(st)));
      rects.forEach((r, i) => {
        const busy = g.players.some((p) => p.present && p.pos.x > r.minX && p.pos.x < r.maxX && p.pos.z > r.minZ && p.pos.z < r.maxZ && p.pos.y < TREADMILL.beltTop + 0.6);
        shop.setBusy(i, busy);
      });
    }
  }

  dispose() {
    this.disposed = true;
    this.unsub.forEach((f) => f());
    this.engine.scene.remove(this.root);
    // modules mark geometry they share across matches with userData.shared
    this.root.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared && !o.userData.xray) o.geometry.dispose();
    });
    this.xray?.dispose();
    this.blobs?.dispose();
    this.avatars.forEach((a) => a.dispose?.());
    this.monsterViews.forEach((m) => m.dispose?.());
    this.bossView.dispose();
    this.petViews.forEach((list) => list?.forEach((r) => r?.view.dispose()));
    this.dropViews.forEach((v) => v.dispose());
  }
}

// X-ray silhouette: when a fence or wall hides the local player's avatar, draw its hidden parts as a
// soft outline in their family colour. The body marks the stencil where it is visible; the silhouette
// draws only where the body lost the depth test (behind something) and marks the stencil too, so
// overlapping parts never stack into darker patches.
function addXray(root, color) {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35),
    // blended but kept in the opaque pass (not transparent) so it can draw before the carried pot
    transparent: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    opacity: 0.7,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    toneMapped: false,
    fog: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  const body = [];
  root.traverse((o) => {
    if (o.isMesh && o.material?.isMeshStandardMaterial) body.push(o);
  });
  const marked = new Set();
  const meshes = [];
  for (const m of body) {
    if (!marked.has(m.material)) {
      marked.add(m.material);
      m.material.stencilWrite = true;
      m.material.stencilRef = 1;
      m.material.stencilFunc = THREE.AlwaysStencilFunc;
      m.material.stencilZPass = THREE.ReplaceStencilOp;
    }
    const x = new THREE.Mesh(m.geometry, mat);
    x.userData.xray = true;
    x.renderOrder = 30;
    x.castShadow = x.receiveShadow = false;
    x.raycast = () => {};
    m.add(x);
    meshes.push(x);
  }
  let shown = true;
  return {
    setVisible(v) {
      if (v === shown) return;
      shown = v;
      for (const x of meshes) x.visible = v;
    },
    dispose() {
      mat.dispose();
    },
  };
}

// Ground footprint of a monster model (for its contact shadow).
function blobRadius(obj) {
  const b = new THREE.Box3().setFromObject(obj);
  if (b.isEmpty()) return 1.4;
  return Math.max(1.2, Math.min(3.6, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.55));
}

export function rarityColor(id) {
  if (id === 'secret') return '#ffffff';
  return RARITY[id].color;
}
