// The egg hatch: a full-screen moment. The egg drops in, wobbles three times (cracks spreading, light
// leaking out in the pet's rarity colour), bursts, and the pet pops out spinning with rays, confetti,
// its name, rarity and boost. Tap to hurry it along. Hatches queue if several arrive at once.
//   playHatch(app, {petId, eggId, isNew, equipped, onEquip}) -> void
// The pet is already saved to the profile before this plays, so closing early never loses it.
import * as THREE from 'three';
import { PET, EGG, boostLines } from './catalog.js';
import { createPetModel } from './models.js';
import { eggParts, rimTeeth } from './eggs.js';
import { openStage } from './studio.js';
import { injectPetStyles, RARITY_COLOR, BOOST_ICON, PAW_ICON, rarityName } from './style.js';

const queue = [];
let current = null;

const reduced = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const play = (app, name, opts) => {
  try {
    app.audio?.play?.(name, opts);
  } catch {
    /* sound is optional */
  }
};
const TIER = { common: 0, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const easeOutBack = (t, c = 2.2) => 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export function playHatch(app, info) {
  queue.push(info);
  if (!current) next(app);
}

export const isHatching = () => !!current;

function next(app) {
  const info = queue.shift();
  if (!info) {
    current = null;
    return;
  }
  current = run(app, info, () => {
    current = null;
    next(app);
  });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// timeline (seconds)
const T_LAND = 0.42, T_W = [0.75, 1.35, 1.95], T_BURST = 2.55, T_INFO = 2.85, T_BTNS = 3.35;

function run(app, info, done) {
  injectPetStyles();
  const pet = PET[info.petId];
  const egg = EGG[info.eggId] || EGG.garden;
  const rarity = pet?.rarity || 'common';
  const color = RARITY_COLOR[rarity];
  const quick = reduced();

  // ---------------------------------------------------------------- DOM
  const wrap = el('div', `pet-hatch r-${rarity}`);
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', `Hatching a ${egg.name}`);
  wrap.tabIndex = -1;
  wrap.style.setProperty('--rc', color);
  const bg = el('div', 'ph-bg');
  const rays = el('div', 'ph-rays');
  const glow = el('div', 'ph-glow');
  const stageEl = el('div', 'ph-stage');
  const space = el('div', 'ph-space'); // the free area between the header and the info card: the star goes here
  const flash = el('div', 'ph-flash');
  const confetti = el('div', 'ph-confetti');
  const top = el('div', 'ph-top');
  const kicker = el('span', 'ph-kicker', egg.name);
  top.appendChild(kicker);
  const infoEl = el('div', 'ph-info');
  infoEl.setAttribute('aria-live', 'polite');
  const rar = el('div', 'ph-rarity', rarityName(rarity) + '!');
  const name = el('div', 'ph-name', pet?.name || 'Pet');
  const boosts = el('div', 'ph-boosts');
  for (const b of boostLines(pet)) {
    const chip = el('span', 'ph-boost');
    chip.innerHTML = `<i>${BOOST_ICON[b.kind] || ''}</i>`;
    chip.appendChild(el('span', '', b.text));
    boosts.appendChild(chip);
  }
  const blurb = el('div', 'ph-blurb', pet?.blurb || '');
  const badges = el('div', 'ph-badges');
  if (info.isNew) badges.appendChild(el('span', 'ph-new', 'NEW!'));
  const equippedTag = el('span', 'ph-eq', 'Equipped!');
  equippedTag.hidden = !info.equipped;
  badges.appendChild(equippedTag);
  const btns = el('div', 'ph-btns');
  const equipBtn = el('button', 'btn btn-blue btn-lg ph-equip', 'Equip');
  equipBtn.type = 'button';
  equipBtn.hidden = !!info.equipped || !info.onEquip;
  const okBtn = el('button', 'btn btn-green btn-lg ph-ok', 'Awesome!');
  okBtn.type = 'button';
  btns.append(equipBtn, okBtn);
  infoEl.append(rar, name, badges, boosts, blurb, btns);
  const hint = el('div', 'ph-hint', 'Tap to hatch faster!');
  wrap.append(bg, rays, glow, stageEl, top, space, infoEl, confetti, flash, hint);
  (app.root || document.body).appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  wrap.focus({ preventScroll: true });

  // ---------------------------------------------------------------- 3D stage
  const stage = openStage();
  let fallback = null;
  const P = eggParts(egg.id);
  const eggMat = P.mat.clone();
  // the rarity tease tints the painted pattern (emissive x map) so the egg keeps its look while it glows
  eggMat.emissive = new THREE.Color(color);
  eggMat.emissiveMap = P.mat.map;
  eggMat.emissiveIntensity = 0;
  // keep the painted glow of lava/galaxy eggs: they add their own emissive map on top of the tease
  if (P.mat.emissiveMap && P.mat.emissiveIntensity > 0.5) {
    eggMat.emissiveMap = P.mat.emissiveMap;
    eggMat.emissive = new THREE.Color('#ffffff');
    eggMat.emissiveIntensity = P.mat.emissiveIntensity;
  }
  const baseEmissive = eggMat.emissiveIntensity;
  const crackMat = P.crack.clone();
  crackMat.alphaTest = 0.99;
  const G = {};
  let petModel = null;
  if (stage) {
    const root = stage.root;
    const eggRoot = new THREE.Group();
    eggRoot.scale.setScalar(1.9);
    root.add(eggRoot);
    const whole = new THREE.Group();
    whole.add(new THREE.Mesh(P.whole, eggMat));
    const cr = new THREE.Mesh(P.whole, crackMat);
    cr.scale.setScalar(1.012);
    cr.position.y = -0.006;
    whole.add(cr);
    eggRoot.add(whole);
    const bottom = new THREE.Group();
    bottom.add(new THREE.Mesh(P.bottom, eggMat), new THREE.Mesh(rimTeeth(P.seamY, P.seamR), eggMat));
    const topHalf = new THREE.Group();
    const topMesh = new THREE.Mesh(P.top, eggMat);
    topMesh.position.y = -P.seamY;
    topHalf.position.y = P.seamY;
    topHalf.add(topMesh);
    bottom.visible = topHalf.visible = false;
    for (const m of [...bottom.children, topMesh]) m.material = eggMat;
    eggMat.side = THREE.DoubleSide;
    eggRoot.add(bottom, topHalf);
    const shards = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(P.shard, eggMat);
      s.visible = false;
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      s.userData.v = new THREE.Vector3(Math.sin(a) * (1.2 + Math.random()), 2.2 + Math.random() * 2.2, Math.cos(a) * (1.2 + Math.random()) + 0.6);
      s.userData.spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      s.scale.setScalar(1.3 + Math.random() * 1.4);
      eggRoot.add(s);
      shards.push(s);
    }
    // soft floor shadow under the egg
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x080c28, transparent: true, opacity: 0.28, depthWrite: false }));
    sh.position.y = 0.01;
    root.add(sh);
    // the pet, hidden inside the egg until the burst
    petModel = createPetModel(info.petId, { fx: false, shadow: true });
    const ph = Math.max(petModel.size.h, petModel.size.w * 0.9);
    const k = 1.85 / ph;
    petModel.root.scale.setScalar(0.001);
    petModel.root.userData.k = k;
    root.add(petModel.root);
    Object.assign(G, { root, eggRoot, whole, bottom, topHalf, shards, sh, cr });
  }

  // CSS stand-ins while the 3D stage can't draw (no WebGL, or its context was lost; it comes back on restore)
  let cssPet = null;
  const syncStage = () => {
    const lost = !stage || stage.lost;
    wrap.classList.toggle('lost', lost);
    if (stage && !lost && stage.canvas.parentNode !== stageEl) stageEl.appendChild(stage.canvas);
    if (!lost) return;
    if (!fallback) {
      fallback = el('div', `ph-cssegg egg-${egg.id}${burst ? ' pop' : ''}`);
      stageEl.appendChild(fallback);
    }
    if (burst && !cssPet) {
      fallback.classList.add('pop');
      // a big paw badge in the rarity colour stands in for the pet
      cssPet = el('div', 'ph-csspet');
      cssPet.innerHTML = PAW_ICON;
      stageEl.appendChild(cssPet);
    }
  };

  // Frame the egg/pet inside the free band (fits its height and width), and slide smoothly when the band
  // moves (the info card appearing beside it on landscape phones). The canvas only covers the area the egg,
  // its flying shell and the pet can reach (not the whole screen), to keep the stage light on phones.
  const cam = { u: 0, cx: 0, cy: 0, init: false };
  let rectKey = '';
  let styled = null;
  const resize = (dt = 1) => {
    const R = wrap.getBoundingClientRect();
    const B = space.getBoundingClientRect();
    const W = Math.max(16, R.width), H = Math.max(16, R.height);
    const bw = Math.max(80, B.width), bh = Math.max(80, B.height);
    const k = cam.init ? 1 - Math.exp(-6 * dt) : 1;
    cam.init = true;
    const u = Math.max(2.05 / (0.8 * bh), 2.9 / (0.94 * bw)); // world units per CSS pixel
    cam.u += (u - cam.u) * k;
    cam.cx += (B.left - R.left + B.width / 2 - cam.cx) * k;
    cam.cy += (B.top - R.top + B.height / 2 - cam.cy) * k;
    wrap.style.setProperty('--cx', cam.cx.toFixed(0) + 'px');
    wrap.style.setProperty('--cy', cam.cy.toFixed(0) + 'px');
    if (!stage) return;
    // reach around the subject (world units): 2.7 to each side, 2.5 up (the shell's lid flies), 1.7 down
    const x0 = Math.max(0, Math.floor(cam.cx - 2.7 / cam.u)), x1 = Math.min(W, Math.ceil(cam.cx + 2.7 / cam.u));
    const y0 = Math.max(0, Math.floor(cam.cy - 2.5 / cam.u)), y1 = Math.min(H, Math.ceil(cam.cy + 1.7 / cam.u));
    const cw = Math.max(16, x1 - x0), ch = Math.max(16, y1 - y0);
    const key = `${x0},${y0},${cw},${ch}`;
    if (key !== rectKey || stage.canvas !== styled) {
      rectKey = key;
      styled = stage.canvas; // a rebuilt studio brings a fresh canvas
      const cs = stage.canvas.style;
      cs.left = x0 + 'px';
      cs.top = y0 + 'px';
      cs.width = cw + 'px';
      cs.height = ch + 'px';
    }
    stage.setSize(cw, ch);
    const c = stage.camera;
    const d = (cam.u * ch) / (2 * Math.tan((c.fov * Math.PI) / 360));
    const pitch = 0.2;
    c.position.set(0, 1.0 + Math.sin(pitch) * d, Math.cos(pitch) * d);
    c.lookAt(0, 1.0, 0);
    // the subject sits at the band centre, which is off the canvas centre where the canvas was clipped
    c.setViewOffset(cw, ch, -(cam.cx - x0 - cw / 2), -(cam.cy - y0 - ch / 2), cw, ch);
  };
  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  // ---------------------------------------------------------------- timeline
  let t = quick ? T_BURST - 0.6 : 0;
  let last = performance.now();
  let raf = 0;
  let burst = false, infoShown = false, btnsShown = false;
  const fired = new Set();
  const once = (key, fn) => {
    if (fired.has(key)) return;
    fired.add(key);
    fn();
  };
  let closed = false;
  syncStage();

  // test/debug hook: jump the timeline (e.g. document.querySelector('.pet-hatch').__hatch.seek(2.9))
  wrap.__hatch = {
    seek: (x) => {
      t = x;
    },
    get t() {
      return t;
    },
  };

  const skip = () => {
    if (t < T_BURST - 0.12) t = T_BURST - 0.12;
    else if (t < T_BTNS) t = T_BTNS;
  };

  function doBurst() {
    burst = true;
    wrap.classList.add('burst');
    hint.hidden = true;
    play(app, 'whoosh', { vol: 0.9 });
    play(app, 'confetti');
    play(app, 'grab', { tier: TIER[rarity] ?? 0, mutation: rarity === 'mythic' ? 'rainbow' : rarity === 'legendary' ? 'gold' : 'normal' });
    if (rarity === 'legendary') setTimeout(() => play(app, 'event', { type: 'golden' }), 150);
    if (rarity === 'mythic') setTimeout(() => play(app, 'secret'), 120);
    if (rarity === 'epic') setTimeout(() => play(app, 'grown'), 120);
    if (!quick) spawnConfetti(confetti, rarity);
  }

  function frame(now) {
    if (closed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;

    // sounds + stage beats
    if (t >= T_LAND) once('land', () => play(app, 'plant'));
    T_W.forEach((tw, i) => {
      if (t >= tw) once('w' + i, () => {
        play(app, 'jump', { vol: 0.55 + i * 0.25 });
        crackMat.alphaTest = [0.9, 0.55, 0.2][i];
        wrap.classList.add('crack' + (i + 1));
        fallback?.classList.add('crack' + (i + 1));
      });
    });
    if (t >= T_BURST && !burst) doBurst();
    if (t >= T_INFO && !infoShown) {
      infoShown = true;
      wrap.classList.add('info');
    }
    if (t >= T_BTNS && !btnsShown) {
      btnsShown = true;
      wrap.classList.add('btns');
      (equipBtn.hidden ? okBtn : equipBtn).focus({ preventScroll: true });
    }

    syncStage();
    if (!stage) return;
    const { eggRoot, whole, bottom, topHalf, shards, sh } = G;
    if (!burst) {
      // drop in with a bounce
      const d = clamp01(t / T_LAND);
      eggRoot.position.y = (1 - d * d) * 2.6;
      let sq = 1;
      if (t > T_LAND && t < T_LAND + 0.25) sq = 1 - Math.sin(((t - T_LAND) / 0.25) * Math.PI) * 0.14;
      // wobbles: three bursts, each stronger
      let rz = 0, rx = 0;
      T_W.forEach((tw, i) => {
        const u = (t - tw) / 0.42;
        if (u > 0 && u < 1) {
          const amp = [0.16, 0.26, 0.38][i] * Math.sin(u * Math.PI);
          rz += Math.sin(u * Math.PI * 4) * amp;
          rx += Math.sin(u * Math.PI * 4 + 1) * amp * 0.35;
        }
      });
      // tremble right before the burst
      const pre = clamp01((t - (T_BURST - 0.3)) / 0.3);
      if (pre > 0) {
        rz += Math.sin(t * 90) * 0.05 * pre;
        sq *= 1 + pre * 0.08;
      }
      whole.rotation.set(rx, 0, rz);
      eggRoot.scale.set(1.9 / Math.sqrt(sq), 1.9 * sq, 1.9 / Math.sqrt(sq));
      // light leaking out: rarity glow ramps up from the first crack
      const g = clamp01((t - T_W[0]) / (T_BURST - T_W[0]));
      eggMat.emissiveIntensity = baseEmissive + g * g * (baseEmissive > 0.5 ? 0.7 : 0.55);
      sh.scale.setScalar(0.6 + 0.4 * clamp01(t / T_LAND));
    } else {
      const u = t - T_BURST;
      if (whole.visible) {
        whole.visible = false;
        bottom.visible = topHalf.visible = true;
        for (const s of shards) {
          s.visible = true;
          s.position.set((Math.random() - 0.5) * 0.3, P.seamY, (Math.random() - 0.5) * 0.3);
        }
        eggMat.emissiveIntensity = baseEmissive;
      }
      eggRoot.scale.setScalar(1.9);
      eggRoot.rotation.set(0, 0, 0);
      // top half flies up and away, bottom half sinks and shrinks
      topHalf.position.set(-u * 0.9, P.seamY + u * 3.2 - u * u * 3.4, u * 0.8);
      topHalf.rotation.set(u * 2.2, 0, u * 4);
      const fade = clamp01(1 - (u - 0.45) / 0.5);
      topHalf.scale.setScalar(Math.max(0.001, fade));
      bottom.scale.setScalar(Math.max(0.001, clamp01(1 - (u - 0.25) / 0.45)));
      bottom.position.y = -u * 0.25;
      for (const s of shards) {
        const v = s.userData.v;
        s.position.x += v.x * dt * 0.5;
        s.position.z += v.z * dt * 0.5;
        s.position.y += (v.y - 9 * u) * dt * 0.5;
        s.rotation.x += s.userData.spin.x * dt;
        s.rotation.y += s.userData.spin.y * dt;
        s.visible = u < 1.1;
      }
      sh.scale.setScalar(Math.max(0.001, 1 - u * 1.5));
      // the pet: pops out with overshoot, spins once, then hops happily on a slow turntable
      const pm = petModel;
      const k = pm.root.userData.k;
      const pop = clamp01(u / 0.55);
      const s = k * Math.max(0.001, easeOutBack(pop));
      pm.root.scale.setScalar(s);
      const hop = u > 0.8 ? Math.abs(Math.sin((u - 0.8) * 3.2)) * 0.28 * clamp01((u - 0.8) * 2) : 0;
      const baseY = pm.fly ? 0.35 + Math.sin(u * 2.4) * 0.08 : 0;
      pm.root.position.y = (1 - pop) * 0.6 + pop * (baseY + hop) + (pm.fly ? -pm.size.minY * k : 0);
      const spin = u < 0.9 ? (1 - Math.pow(1 - clamp01(u / 0.9), 3)) * Math.PI * 2 : Math.PI * 2;
      pm.root.rotation.y = spin + Math.sin(u * 0.9) * 0.45 * clamp01(u - 0.9);
      if (pm.headPivot) pm.headPivot.rotation.set(-0.05, Math.sin(u * 1.3) * 0.25, Math.sin(u * 0.8) * 0.12);
      for (const w of pm.wings) w.rotation.z = (pm.wingBase + Math.sin(u * pm.wingSpeed) * pm.wingAmp) * w.userData.side;
      if (pm.tailPivot) pm.tailPivot.rotation[pm.tailAxis] = Math.sin(u * 12) * 0.45;
      if (pm.shadow) pm.shadow.position.y = -pm.root.position.y / Math.max(0.001, s) + 0.02;
    }
    resize(dt);
    stage.render();
  }
  raf = requestAnimationFrame((n) => {
    last = n;
    frame(n);
  });

  // ---------------------------------------------------------------- input
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    wrap.classList.add('out');
    setTimeout(() => {
      wrap.remove();
      stage?.close();
      petModel?.dispose();
      eggMat.dispose();
      crackMat.dispose();
      G.sh?.geometry.dispose();
      G.sh?.material.dispose();
      done();
    }, quick ? 0 : 220);
  }
  function onKey(e) {
    if (closed) return;
    const k = e.key;
    if (k === 'Escape' || k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      e.stopPropagation();
      if (t < T_BTNS) {
        if (k === 'Escape') t = Math.max(t, T_BTNS); // Esc: straight to the reveal (a second Esc closes)
        else skip();
      } else if (k === 'Escape') close();
      else if (document.activeElement?.closest?.('.ph-btns')) document.activeElement.click();
      else close();
    } else if (k === 'Tab' && btnsShown) {
      // keep focus inside the dialog
      const f = [equipBtn, okBtn].filter((b) => !b.hidden);
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length]?.focus();
    }
  }
  window.addEventListener('keydown', onKey, true);
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    skip();
  });
  okBtn.addEventListener('click', () => {
    play(app, 'click');
    close();
  });
  equipBtn.addEventListener('click', () => {
    info.onEquip?.();
    play(app, 'unlock');
    equipBtn.hidden = true;
    equippedTag.hidden = false;
    okBtn.focus({ preventScroll: true });
  });
  return { close };
}

function spawnConfetti(host, rarity) {
  const n = { common: 26, rare: 38, epic: 50, legendary: 70, mythic: 90 }[rarity] || 30;
  const colors = rarity === 'mythic'
    ? ['#ff4d6d', '#ffb627', '#fff04d', '#4cd964', '#3dd6ff', '#6b7bff', '#c86bff']
    : [RARITY_COLOR[rarity], '#ffd23f', '#ff4f9a', '#3d9bff', '#4cd964', '#ffffff'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;background:${colors[i % colors.length]};--r:${(Math.random() * 720 - 360).toFixed(0)}deg;` +
      `--x:${(Math.random() * 140 - 70).toFixed(0)}px;animation-delay:${(Math.random() * 0.9).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.8).toFixed(2)}s;` +
      `width:${6 + Math.round(Math.random() * 6)}px;height:${10 + Math.round(Math.random() * 8)}px`;
    frag.appendChild(c);
  }
  host.appendChild(frag);
}
