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
import { createPetView } from '../pets/view.js';

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
    this._avatarKey = [];
    this.plantViews = new Map(); // `${slot}:${index}` -> {key, view}
    this.podViews = [];
    this.groundViews = new Map();
    this.projViews = new Map();
    this.monsterViews = [];
    this.petViews = []; // per slot: {id, view, mood} for the pet following that player
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
    });
    this.unsub.push(bus.on('face:changed', ({ id }) => {
      for (const p of this.game.players) if (p.faceKey === id) this._loadFace(p.slot);
    }));
    // a friend took over a garden, someone changed outfit, or this device's own slot changed
    this.unsub.push(bus.on('slot:changed', ({ slot }) => this._makeAvatar(slot)));
    this.unsub.push(bus.on('player:look', ({ player }) => this._makeAvatar(player.slot)));
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
      this.world.gardens?.[p.slot]?.setOwner?.({ ...p.char, name: p.name }, f.avatarUrl);
    });
  }

  update(dt, time, camera) {
    const g = this.game;
    const now = g.time;
    const L = this.labels;
    const human = g.human;
    // labels are sized by distance to the player (or the camera in attract mode)
    const focus = human ? human.pos : camera.position;

    // players
    g.players.forEach((p, i) => {
      if (this._avatarKey[i] !== p.faceKey + '|' + p.kind) this._makeAvatar(i);
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
        coil: now < p.coilUntil,
        interacting: p.interact?.t > 0 ? p.interact.verb : null,
      });
      if (p === human && this.xray) this.xray.setVisible(invisible >= 1);
      this._updatePet(i, p, dt, time, now, invisible);
      if (invisible > 0.05) {
        const tag = p === human ? '' : `<div class="nt-name" style="--c:${p.char.color}">${esc(p.name)}${p.rebirths ? ` <span class="nt-rb">★${p.rebirths}</span>` : ''}</div>`;
        let carry = '';
        if (c && p !== human) {
          const sid = c.kind === 'seed' ? c.speciesId : c.plant.speciesId;
          const mut = c.kind === 'seed' ? c.mutation : c.plant.mutation;
          carry = `<div class="nt-carry">${c.kind === 'plant' ? 'STOLEN ' : ''}${mutationTag(mut)} <b style="color:${rarityColor(PLANT[sid].rarity)}">${esc(PLANT[sid].name)}</b></div>`;
        }
        const top = av.headTop.position.y * av.object3d.scale.y;
        if (tag || carry) L.set('pl' + i, { x: p.pos.x, y: p.pos.y + top + (c ? 3.9 : 1.4), z: p.pos.z }, tag + carry, { cls: 'nametag' + (c?.kind === 'plant' ? ' thief' : ''), maxDist: 110 });
      }
    });

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
              `${mutationTag(plant.mutation)}<div class="pl-name" style="color:${rarityColor(sp.rarity)}">${esc(sp.name)}</div>${rarityTag(sp.rarity)}${body}${stealing}`,
              { cls: 'plantlbl' + (grown ? ' grown' : ''), maxDist: 70 });
          } else if (fd < 46) {
            const chip = grown
              ? `<div class="pl-inc" style="--rc:${rarityColor(sp.rarity)}">$${fmt(inc)}/s</div>`
              : `<div class="pl-bar"><i style="width:${(p01 * 100).toFixed(0)}%"></i></div>`;
            L.set('pt' + k, { x: pl.x, y: labelY - 0.6, z: pl.z }, chip, { cls: 'plantlbl compact' + (grown ? ' grown' : ''), maxDist: 70 });
          }
        } else if (!pl.unlocked && gd.owner === human) {
          L.set('pt' + k, { x: pl.x, y: 3, z: pl.z }, `<div class="pl-lock"><i class="ic-lock"></i> $${fmt(PLANTERS.unlockCost[pl.index])}</div>`, { cls: 'plantlbl locked', maxDist: 40 });
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
      if (m.state === 'chase') L.set('mo' + i, { x: m.x, y: 7, z: m.z }, '<div class="mo-alert">!</div>', { cls: 'monlbl', maxDist: 80 });
    });
  }

  _updatePet(i, p, dt, time, now, invisible) {
    let rec = this.petViews[i];
    const id = p.pet || null;
    if ((rec?.id || null) !== id) {
      if (rec) {
        this.root.remove(rec.view.object3d);
        rec.view.dispose();
      }
      rec = this.petViews[i] = id ? { id, view: createPetView(id, { side: i % 2 ? -1 : 1 }), mood: { celebrating: false, stunned: false } } : null;
      if (rec) this.root.add(rec.view.object3d);
    }
    if (!rec) return;
    rec.view.object3d.visible = invisible > 0.05;
    rec.mood.celebrating = now < p.celebrateUntil;
    rec.mood.stunned = now < p.stunUntil;
    rec.view.update(dt, p, time, rec.mood);
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
    this.avatars.forEach((a) => a.dispose?.());
    this.monsterViews.forEach((m) => m.dispose?.());
    this.petViews.forEach((r) => r?.view.dispose());
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

export function rarityColor(id) {
  if (id === 'secret') return '#ffffff';
  return RARITY[id].color;
}
