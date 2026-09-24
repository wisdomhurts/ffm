// Binds the pure Game state to 3D objects and world labels every frame.
import * as THREE from 'three';
import { PLANT, RARITY, MUTATIONS, LOCK, PLANTERS, BIOMES } from '../config.js';
import { createAvatar } from '../characters/avatar.js';
import { getFace } from '../characters/faces.js';
import { createMonster } from '../characters/monsters.js';
import { createPlantView, createSeedView, createCarriedPlantView, createPodView } from '../plants/plantMeshes.js';
import { createBanana, createBalloon } from '../fx/props.js';
import { fmt, SELL_SECONDS } from '../gameplay/game.js';
import { bus } from '../core/events.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function rarityTag(rarityId) {
  const r = RARITY[rarityId];
  return `<span class="rar rar-${r.id}">${r.name}</span>`;
}

export function mutationTag(mut) {
  const m = MUTATIONS[mut];
  return m.name ? `<span class="mut mut-${m.id}">${m.name}</span>` : '';
}

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
    this.plantViews = new Map(); // `${slot}:${index}` -> {key, view}
    this.podViews = [];
    this.groundViews = new Map();
    this.projViews = new Map();
    this.monsterViews = [];
    this.unsub = [];
    this._build();
  }

  _build() {
    const g = this.game;
    g.players.forEach((p, i) => {
      const av = createAvatar(p.char, null, p.char.look.skin);
      av.object3d.position.set(p.pos.x, p.pos.y, p.pos.z);
      this.root.add(av.object3d);
      this.avatars[i] = av;
      this.carryKeys[i] = null;
      getFace(p.id).then((f) => {
        if (this.disposed) return;
        av.setFace(f.face, f.skin);
        this.world.gardens?.[p.slot]?.setOwner?.(p.char, f.avatarUrl);
      });
    });
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
    });
    this.unsub.push(bus.on('face:changed', ({ id }) => {
      const p = this.game.players.find((x) => x.id === id);
      if (!p) return;
      getFace(id).then((f) => {
        this.avatars[p.slot].setFace(f.face, f.skin);
        this.world.gardens?.[p.slot]?.setOwner?.(p.char, f.avatarUrl);
      });
    }));
  }

  update(dt, time, camera) {
    const g = this.game;
    const now = g.time;
    const L = this.labels;
    const human = g.human;

    // players
    g.players.forEach((p, i) => {
      const av = this.avatars[i];
      const o = av.object3d;
      o.position.set(p.pos.x, p.pos.y, p.pos.z);
      o.rotation.y = p.yaw;
      const c = p.carrying;
      const key = c ? (c.kind === 'seed' ? `s:${c.speciesId}:${c.mutation}` : `p:${c.plant.uid}:${c.plant.mutation}`) : null;
      if (key !== this.carryKeys[i]) {
        this.carryKeys[i] = key;
        if (this.carryViews?.[i]) this.carryViews[i] = null;
        let view = null;
        if (c?.kind === 'seed') view = createSeedView(c.speciesId, c.mutation);
        else if (c?.kind === 'plant') view = createCarriedPlantView(c.plant.speciesId, c.plant.mutation);
        (this.carryViews ||= [])[i] = view;
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
        coil: now < p.coilUntil,
        interacting: p.interact?.t > 0 ? p.interact.verb : null,
      });
      if (invisible > 0.05) {
        const tag = p === human ? '' : `<div class="nt-name" style="--c:${p.char.color}">${esc(p.name)}${p.rebirths ? ` <span class="nt-rb">★${p.rebirths}</span>` : ''}</div>`;
        let carry = '';
        if (c) {
          const sid = c.kind === 'seed' ? c.speciesId : c.plant.speciesId;
          const mut = c.kind === 'seed' ? c.mutation : c.plant.mutation;
          carry = `<div class="nt-carry">${c.kind === 'plant' ? 'STOLEN ' : ''}${mutationTag(mut)} <b style="color:${rarityColor(PLANT[sid].rarity)}">${esc(PLANT[sid].name)}</b></div>`;
        }
        if (tag || carry) L.set('pl' + i, { x: p.pos.x, y: p.pos.y + (c ? 9.2 : 6.6), z: p.pos.z }, tag + carry, { cls: 'nametag' + (c?.kind === 'plant' ? ' thief' : ''), maxDist: 110 });
      }
    });

    // planters / plants
    g.gardens.forEach((gd) => {
      const signs = this.world.gardens?.[gd.slot];
      gd.planters.forEach((pl) => {
        const k = gd.slot + ':' + pl.index;
        signs?.planters?.[pl.index]?.setUnlocked(pl.unlocked);
        const plant = pl.plant;
        const key = plant ? plant.uid + ':' + plant.mutation : null;
        let rec = this.plantViews.get(k);
        if (!rec || rec.key !== key) {
          if (rec?.view) this.root.remove(rec.view.object3d);
          rec = { key, view: null };
          if (plant) {
            rec.view = createPlantView(plant.speciesId, plant.mutation);
            rec.view.object3d.position.set(pl.x, 1.2, pl.z);
            this.root.add(rec.view.object3d);
          }
          this.plantViews.set(k, rec);
        }
        if (rec.view) {
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
          L.set('pt' + k, { x: pl.x, y: 6.4, z: pl.z },
            `${mutationTag(plant.mutation)}<div class="pl-name" style="color:${rarityColor(sp.rarity)}">${esc(sp.name)}</div>${rarityTag(sp.rarity)}${body}${pl.stealer != null ? '<div class="pl-steal">BEING STOLEN!</div>' : ''}`,
            { cls: 'plantlbl' + (grown ? ' grown' : ''), maxDist: 55 });
        } else if (!pl.unlocked && gd.owner === human) {
          L.set('pt' + k, { x: pl.x, y: 3, z: pl.z }, `<div class="pl-lock"><i class="ic-lock"></i> $${fmt(PLANTERS.unlockCost[pl.index])}</div>`, { cls: 'plantlbl locked', maxDist: 40 });
        }
      });
      // collect pad + lock pad labels
      const Lg = gd.L;
      const pile = Math.floor(gd.cashPile);
      L.set('cp' + gd.slot, { x: Lg.collectPad.x, y: 3.2, z: Lg.collectPad.z }, `<div class="cp-amt">$${fmt(pile)}</div><div class="cp-lbl">COLLECT</div>`, { cls: 'padlbl collect' + (gd.owner === human ? ' mine' : ''), maxDist: 60 });
      const locked = g.isLocked(gd);
      const ready = now >= gd.lockReadyAt;
      const lockTxt = locked ? `LOCKED ${Math.ceil(gd.lockedUntil - now)}s` : ready ? 'LOCK' : `LOCK ${Math.ceil(gd.lockReadyAt - now)}s`;
      L.set('lk' + gd.slot, { x: Lg.lockPad.x, y: 3, z: Lg.lockPad.z }, `<div class="lk">${lockTxt}</div>`, { cls: 'padlbl lock' + (locked ? ' on' : ready ? ' ready' : ''), maxDist: 60 });
      signs?.setLocked?.(locked, locked ? gd.lockedUntil - now : 0);
      signs?.setCashPile?.(gd.cashPile);
    });

    // pods
    g.pods.forEach((pod, i) => {
      const rec = this.podViews[i];
      const key = pod.seed ? pod.seed.speciesId + ':' + pod.seed.mutation : null;
      if (rec.key !== key) {
        rec.key = key;
        rec.view.setSeed(pod.seed ? createSeedView(pod.seed.speciesId, pod.seed.mutation) : null);
      }
      rec.view.update(dt, time);
      if (pod.seed) {
        const sp = PLANT[pod.seed.speciesId];
        L.set('pod' + i, { x: pod.x, y: 4.2, z: pod.z }, `${mutationTag(pod.seed.mutation)}<div class="pd-name" style="color:${rarityColor(sp.rarity)}">${esc(sp.name)}</div>${rarityTag(sp.rarity)}`, { cls: 'podlbl', maxDist: 45 });
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
        L.set('gi' + gi.uid, { x: gi.x, y: 3.2, z: gi.z }, `<div class="pd-name" style="color:${rarityColor(PLANT[gi.speciesId].rarity)}">${esc(PLANT[gi.speciesId].name)}</div>`, { cls: 'podlbl', maxDist: 45 });
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
      v.object3d.position.set(m.x, m.y, m.z);
      v.object3d.rotation.y = m.yaw;
      v.update(dt, { time, speed: Math.hypot(m.vx, m.vz), state: now < m.stunUntil ? 'stunned' : m.state, attackAge: now - m.attackAt });
      if (m.state === 'chase') L.set('mo' + i, { x: m.x, y: 7, z: m.z }, '<div class="mo-alert">!</div>', { cls: 'monlbl', maxDist: 80 });
    });
  }

  dispose() {
    this.disposed = true;
    this.unsub.forEach((f) => f());
    this.engine.scene.remove(this.root);
    this.root.traverse((o) => {
      o.geometry?.dispose?.();
    });
    this.avatars.forEach((a) => a.dispose?.());
  }
}

export function rarityColor(id) {
  if (id === 'secret') return '#ffffff';
  return RARITY[id].color;
}
