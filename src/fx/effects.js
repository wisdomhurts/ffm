// Juice: pooled particle bursts, world-anchored popup text and continuous character effects.
// Contract: createEffects(engine, labelsContainer) -> {
//   burst(kind, pos, opts)   kind: 'coins'|'sparkle'|'poof'|'splash'|'stars'|'confetti'|'dust'|'leaves'|'rarity'|'hearts'
//                                  (+ 'dirt'|'impact'|'speedlines'|'whoosh'|'sparks'|'beams'|'ring'|'sad'|'cloak'|'electric'|'glint')
//                            opts: {color, count, scale, lod, ...kind extras (target, colors, yaw, rainbow, spanZ, spanY)}
//   floatText(text, pos, opts)  opts: {color, size:'s'|'m'|'l'|'xl', duration, style, key, follow}
//   update(dt, time)
//   attach(game)   subscribe to the game's bus events (re-attach / game:dispose unsubscribes and clears)
//   storm(pos, seconds, opts), clear(), dispose(), stats()
// }
// Everything draws in two instanced draw calls (see particles.js) plus a small pool of DOM popups.
import { bus } from '../core/events.js';
import { RARITY, MUTATIONS, PLANT, PLAYER } from '../config.js';
import { fmt } from '../gameplay/game.js';
import { SolidPool, SpritePool, SHAPE, CELL, MODE, CURVE, F } from './particles.js';
import { Floaters } from './floaters.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const rsign = () => (Math.random() < 0.5 ? -1 : 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const QUALITY = {
  low: { solids: 380, sprites: 320, mult: 0.5, cont: 0.45, dust: false },
  medium: { solids: 720, sprites: 600, mult: 0.8, cont: 0.75, dust: true },
  high: { solids: 820, sprites: 680, mult: 1, cont: 1, dust: true },
};

const GOLD = '#ffc21f';
const CONFETTI = ['#ff4f9a', '#ffd23f', '#4cd964', '#3d9bff', '#b36bff', '#ff8a3d', '#1ec8a5', '#ffffff'];
const RAINBOW = ['#ff4d6d', '#ff9f1a', '#ffe94d', '#4cd964', '#3dc9ff', '#6b7bff', '#c86bff'];
const LEAVES = ['#5bd15b', '#3fae4a', '#8be26b', '#2e9c46'];
const DIRT = ['#8a5a2b', '#6b4423', '#a5703a'];
const EVENT_COLORS = {
  golden: ['#ffd23f', '#ffb627', '#fff1a0', '#ff9f1a'],
  diamond: ['#7ee8ff', '#ffffff', '#b8f3ff', '#4fc3ff'],
  rainbow: RAINBOW,
};
const HIT_TEXT = { bonk: 'BONK!', balloon: 'SPLAT!', banana: 'SLIP!' };
const HIT_BURST = { bonk: '#ff3d2e', balloon: '#2f8bff', banana: '#ff9f1a' };

const shadeCache = new Map();
/** Darken (k < 1) or lighten (k > 1) a #rrggbb colour; cached. */
function shade(hex, k) {
  const key = hex + k;
  let s = shadeCache.get(key);
  if (!s) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.round(clamp(k < 1 ? c * k : c + (255 - c) * (k - 1), 0, 255));
    s = `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
    shadeCache.set(key, s);
  }
  return s;
}

function rarityColor(id) {
  return id === 'secret' ? '#ffffff' : RARITY[id]?.color || '#ffffff';
}

export function createEffects(engine, container) {
  const qid = engine.qualityId || 'high';
  const Q = QUALITY[qid] || QUALITY.high;
  const S = new SolidPool(engine.scene, Q.solids);
  const P = new SpritePool(engine.scene, Q.sprites);
  const floaters = new Floaters(container, engine.camera);
  const cam = engine.camera;

  let game = null;
  let primed = false;
  let subs = [];
  let clock = 0;
  let frame = 0;
  let burstsThisFrame = 0;
  let floatsThisFrame = 0;
  let lastHitFrame = -1;
  let lastHitCause = '';

  // per-slot trackers for continuous effects (fixed size, no allocations per frame)
  const track = [];
  for (let i = 0; i < 8; i++) track.push({ wasGround: true, minVy: 0, dustAcc: 0, coilAcc: 0, cloakAcc: 0, lootAcc: 0, cashSum: 0, cashLast: -9, cashCoinsAt: 0 });
  const storms = [];
  for (let i = 0; i < 4; i++) storms.push({ active: false, x: 0, y: 0, z: 0, follow: null, until: 0, rate: 0, acc: 0, colors: CONFETTI, radius: 14 });
  const tmp = { x: 0, y: 0, z: 0 };

  S.onArrive = (x, y, z) => {
    const i = P.add(CELL.sparkle, x, y, z, 0, 1.5, 0, 1.3, 0.3, '#fff3b0', 1);
    if (i >= 0) {
      P.curve[i] = CURVE.flash;
      P.rotV[i] = 4;
    }
  };

  const cnt = (n, m) => Math.max(1, Math.round(n * m));
  const camDist = (x, y, z) => {
    const c = cam.position;
    return Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2);
  };
  /** 0 = too far to bother, else a count multiplier that falls off with distance. */
  const lodAt = (x, y, z, maxD) => {
    const d = camDist(x, y, z);
    // the title screen's attract camera orbits far out: let bot effects reach it
    if (game && !game.human) maxD *= 1.45;
    if (d > maxD) return 0;
    return d < 30 ? 1 : Math.max(0.35, 1 - ((d - 30) / Math.max(1, maxD - 30)) * 0.65);
  };

  // ---------------------------------------------------------------- burst kinds
  // Each kind: (x, y, z, opts, scale, countMult)

  function glowFlash(x, y, z, size, color, life = 0.3, alpha = 0.9) {
    const i = P.add(CELL.glow, x, y, z, 0, 0, 0, size * 0.6, life, color, 1);
    if (i < 0) return;
    P.s1[i] = size;
    P.curve[i] = CURVE.flash;
    P.alpha[i] = alpha;
  }

  function groundRing(x, y, z, s0, s1, life, color, additive = 0.7, cell = CELL.ring, delay = 0, alpha = 1) {
    const i = P.add(cell, x, y, z, 0, 0, 0, s0, life, color, additive);
    if (i < 0) return;
    P.mode[i] = MODE.flat;
    P.s1[i] = s1;
    P.age[i] = -delay;
    P.alpha[i] = alpha;
    P.curve[i] = CURVE.linear;
  }

  const KINDS = {
    coins(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 10, m);
      const tgt = o.target || null;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU;
        const out = rand(2.5, 7.5) * sc;
        const i = S.add(SHAPE.coin, x + Math.cos(a) * 0.4, y, z + Math.sin(a) * 0.4, Math.cos(a) * out, rand(15, 25) * Math.sqrt(sc), Math.sin(a) * out,
          rand(1.0, 1.25) * sc, tgt ? 2.6 : rand(1.2, 1.6), GOLD);
        if (i < 0) break;
        S.grav[i] = 50;
        S.drag[i] = 0.4;
        S.setAxis(i, rand(-0.35, 0.35), 1, rand(-0.35, 0.35));
        S.spin[i] = rand(9, 16) * rsign();
        S.curve[i] = CURVE.hold;
        S.emis[i] = 0.14;
        S.age[i] = -k * 0.018;
        if (tgt) {
          S.flags[i] = F.home;
          S.target[i] = tgt;
          S.homeAt[i] = rand(0.34, 0.55);
          S.homeOff[i] = o.targetY ?? 3;
        } else {
          S.flags[i] = F.bounce;
          S.floor[i] = (o.floor ?? 0) + 0.35;
        }
      }
      for (let k = 0; k < (o.bills || 0); k++) {
        const a = Math.random() * TAU;
        const i = S.add(SHAPE.card, x, y + 0.5, z, Math.cos(a) * rand(2, 5), rand(14, 20), Math.sin(a) * rand(2, 5), rand(1.2, 1.45) * sc, rand(1.8, 2.4), '#35b653');
        if (i < 0) break;
        S.grav[i] = 30;
        S.drag[i] = 1.4;
        S.flags[i] = F.flutter;
        S.spin[i] = rand(5, 9) * rsign();
        S.curve[i] = CURVE.hold;
        S.emis[i] = 0.12;
      }
      glowFlash(x, y + 0.6, z, 4.5 * sc, '#ffe27a', 0.35, 0.8);
      for (let k = 0; k < cnt(4, m); k++) {
        const i = P.add(CELL.sparkle, x + rand(-1, 1), y + rand(0.5, 2), z + rand(-1, 1), rand(-2, 2), rand(3, 7), rand(-2, 2), rand(1.4, 2.2) * sc, rand(0.4, 0.7), '#fff3b0', 1);
        if (i < 0) break;
        P.flags[i] = F.twinkle;
        P.drag[i] = 2;
      }
    },

    sparkle(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 14, m);
      const col = o.color ?? '#fff1a8';
      const pal = o.colors;
      for (let k = 0; k < n; k++) {
        const u = rand(-1, 1), th = Math.random() * TAU, r = Math.sqrt(1 - u * u);
        const dx = r * Math.cos(th), dy = u, dz = r * Math.sin(th);
        const sp = rand(2.5, 8) * sc;
        const c = pal ? pal[k % pal.length] : k % 3 === 0 ? '#ffffff' : col;
        const white = c === '#ffffff';
        const i = P.add(k % 4 === 3 ? CELL.star : CELL.sparkle, x + dx * 0.4 * sc, y + dy * 0.4 * sc, z + dz * 0.4 * sc, dx * sp, dy * sp + 2, dz * sp,
          rand(1.9, 3.1) * sc, rand(0.6, 1.1), c, white ? 1 : 0.45);
        if (i < 0) break;
        P.drag[i] = 2.6;
        P.flags[i] = F.twinkle;
        P.rotV[i] = rand(-3, 3);
        P.s1[i] = P.s0[i] * 0.65;
      }
      glowFlash(x, y, z, 5 * sc, col, 0.35, 0.8);
    },

    poof(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 9, m);
      const col = o.color ?? '#ffffff';
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rand(-0.3, 0.3);
        const sp = rand(5, 9.5) * sc;
        const i = S.add(SHAPE.puff, x + Math.cos(a) * 0.5 * sc, y + rand(0, 0.6) * sc, z + Math.sin(a) * 0.5 * sc, Math.cos(a) * sp, rand(1.5, 4.5) * sc, Math.sin(a) * sp,
          rand(1.7, 2.5) * sc, rand(0.5, 0.75), col);
        if (i < 0) break;
        S.drag[i] = 5;
        S.curve[i] = CURVE.puff;
        S.emis[i] = o.emis ?? 0.4;
        S.spin[i] = rand(-2, 2);
      }
      for (let k = 0; k < cnt(2, m); k++) {
        const i = S.add(SHAPE.puff, x + rand(-0.4, 0.4), y + 0.5 * sc, z + rand(-0.4, 0.4), 0, rand(3, 5) * sc, 0, rand(2.4, 3.1) * sc, 0.7, col);
        if (i < 0) break;
        S.drag[i] = 3;
        S.curve[i] = CURVE.puff;
        S.emis[i] = o.emis ?? 0.4;
      }
      if (o.ring !== false) groundRing(x, Math.max(0.1, y - 0.3), z, 1.5 * sc, 8 * sc, 0.4, col, 0.2, CELL.shock, 0, 0.9);
    },

    splash(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 30, m);
      const floor = o.floor ?? 0.05;
      y = Math.max(y, floor + 0.2);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU;
        const out = rand(3, 13) * sc;
        const i = S.add(SHAPE.puff, x, y + 0.3, z, Math.cos(a) * out, rand(12, 26) * Math.sqrt(sc), Math.sin(a) * out, rand(0.6, 0.95) * sc, 1.6, k % 3 ? '#1f8fff' : '#8fdcff');
        if (i < 0) break;
        S.grav[i] = 64;
        S.flags[i] = F.align | F.floorKill;
        S.floor[i] = floor;
        S.sx[i] = 0.72;
        S.sz[i] = 0.72;
        S.emis[i] = 0.3;
        S.curve[i] = CURVE.hold;
      }
      // foam
      for (let k = 0; k < cnt(5, m); k++) {
        const a = Math.random() * TAU;
        const i = S.add(SHAPE.puff, x + Math.cos(a) * 1.2 * sc, floor + 0.3, z + Math.sin(a) * 1.2 * sc, Math.cos(a) * 4 * sc, rand(1, 3), Math.sin(a) * 4 * sc, rand(0.9, 1.3) * sc, 0.55, '#d9f1ff');
        if (i < 0) break;
        S.drag[i] = 4;
        S.curve[i] = CURVE.puff;
        S.emis[i] = 0.5;
      }
      for (let k = 0; k < cnt(8, m); k++) {
        const a = Math.random() * TAU;
        const i = P.add(CELL.dot, x, y + 0.5, z, Math.cos(a) * rand(4, 9) * sc, rand(10, 18), Math.sin(a) * rand(4, 9) * sc, rand(0.35, 0.55) * sc, rand(0.5, 0.8), '#d6f4ff', 0.5);
        if (i < 0) break;
        P.grav[i] = 55;
        P.floor[i] = floor;
      }
      groundRing(x, floor + 0.08, z, 2 * sc, 12 * sc, 0.6, '#4fb4ff', 0.1);
      groundRing(x, floor + 0.1, z, 1.5 * sc, 8 * sc, 0.55, '#ffffff', 0.2, CELL.shock, 0.1, 0.7);
      glowFlash(x, y + 0.5, z, 5 * sc, '#5cc0ff', 0.3, 0.6);
    },

    stars(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 7, m);
      const col = o.color ?? '#ffd21f';
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rand(-0.25, 0.25);
        const sp = rand(7, 12) * sc;
        const i = S.add(SHAPE.star, x, y, z, Math.cos(a) * sp, rand(6, 12) * sc, Math.sin(a) * sp, rand(1.3, 1.7) * sc, rand(0.65, 0.9), col);
        if (i < 0) break;
        S.grav[i] = 32;
        S.drag[i] = 1.6;
        S.spin[i] = rand(8, 14) * rsign();
        S.setAxis(i, rand(-0.4, 0.4), rand(-0.4, 0.4), 1);
        S.emis[i] = 0.45;
      }
      for (let k = 0; k < cnt(3, m); k++) {
        const i = P.add(CELL.sparkle, x + rand(-1, 1), y + rand(-0.5, 1), z + rand(-1, 1), 0, 2, 0, rand(1.6, 2.4) * sc, 0.4, '#fffbe0', 1);
        if (i < 0) break;
        P.flags[i] = F.twinkle;
        P.age[i] = -k * 0.07;
      }
    },

    confetti(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 40, m);
      const pal = o.colors || CONFETTI;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU;
        const out = rand(3, 14) * sc;
        const star = k % 6 === 5;
        const i = S.add(star ? SHAPE.star : SHAPE.card, x, y, z, Math.cos(a) * out, rand(16, 30) * Math.sqrt(sc), Math.sin(a) * out,
          (star ? rand(0.6, 0.8) : rand(0.8, 1.1)) * sc, rand(2.4, 3.6), pal[k % pal.length]);
        if (i < 0) break;
        S.grav[i] = 30;
        S.drag[i] = 1.4;
        S.flags[i] = F.flutter;
        S.spin[i] = rand(7, 15) * rsign();
        S.curve[i] = CURVE.hold;
        S.emis[i] = 0.18;
        if (!star) S.sy[i] = rand(0.45, 0.85);
      }
      glowFlash(x, y, z, 6 * sc, '#ffffff', 0.3, 0.6);
    },

    dust(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 6, m);
      const col = o.color ?? '#e6d6b4';
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rand(-0.3, 0.3);
        const sp = rand(3, 6.5) * sc;
        const i = S.add(SHAPE.puff, x + Math.cos(a) * 0.7, y + 0.3, z + Math.sin(a) * 0.7, Math.cos(a) * sp, rand(0.8, 2.4), Math.sin(a) * sp,
          rand(0.95, 1.35) * sc, rand(0.4, 0.62), col);
        if (i < 0) break;
        S.drag[i] = 5;
        S.curve[i] = CURVE.puff;
        S.emis[i] = 0.22;
      }
    },

    leaves(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 10, m);
      const pal = o.colors || LEAVES;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU;
        const out = rand(2, 6) * sc;
        const i = S.add(SHAPE.leaf, x, y + 0.4, z, Math.cos(a) * out, rand(8, 15) * Math.sqrt(sc), Math.sin(a) * out, rand(1.3, 1.7) * sc, rand(1.3, 1.9), pal[k % pal.length]);
        if (i < 0) break;
        S.grav[i] = 22;
        S.drag[i] = 1.5;
        S.flags[i] = F.flutter;
        S.spin[i] = rand(4, 9) * rsign();
        S.curve[i] = CURVE.hold;
        S.emis[i] = 0.12;
      }
    },

    dirt(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 9, m);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU;
        const out = rand(2.5, 7) * sc;
        const i = S.add(SHAPE.cube, x + rand(-0.5, 0.5), y + 0.3, z + rand(-0.5, 0.5), Math.cos(a) * out, rand(8, 14) * Math.sqrt(sc), Math.sin(a) * out,
          rand(0.42, 0.66) * sc, rand(0.7, 1.0), DIRT[k % DIRT.length]);
        if (i < 0) break;
        S.grav[i] = 48;
        S.spin[i] = rand(6, 12) * rsign();
        S.flags[i] = F.bounce;
        S.floor[i] = y - 0.1;
        S.curve[i] = CURVE.hold;
      }
      KINDS.poof(x, y, z, { color: '#d9b98a', count: 6, emis: 0.2, ring: false }, sc * 0.8, m);
    },

    rarity(x, y, z, o, sc, m) {
      const col = o.color ?? '#b36bff';
      const pal = o.rainbow ? RAINBOW : null;
      const beamCol = o.rainbow ? '#ffffff' : col;
      let i = P.add(CELL.beam, x, y, z, 0, 0, 0, 3.4 * sc, 1.8, beamCol, 1);
      if (i >= 0) {
        P.mode[i] = MODE.axial;
        P.asp[i] = 10;
        P.s1[i] = 2.2 * sc;
        P.flags[i] = F.grow;
        P.alpha[i] = 0.95;
      }
      i = P.add(CELL.beam, x, y, z, 0, 0, 0, 1.3 * sc, 1.5, '#ffffff', 1);
      if (i >= 0) {
        P.mode[i] = MODE.axial;
        P.asp[i] = 22;
        P.s1[i] = 0.6 * sc;
        P.flags[i] = F.grow;
      }
      if (pal) {
        for (let k = 0; k < 3; k++) {
          const j = P.add(CELL.beam, x, y, z, 0, 0, 0, 2.2 * sc, 1.6, pal[k * 2], 1);
          if (j < 0) break;
          P.mode[j] = MODE.axial;
          P.asp[j] = 12;
          P.flags[j] = F.grow;
          P.age[j] = -0.08 * k;
        }
      }
      groundRing(x, y + 0.15, z, 1 * sc, 11 * sc, 0.9, col, 0.8);
      groundRing(x, y + 0.2, z, 1 * sc, 8 * sc, 0.7, '#ffffff', 0.8, CELL.shock, 0.18);
      const n = cnt(18, m);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, r = rand(0.4, 1.8) * sc;
        const c = pal ? pal[k % pal.length] : k % 3 === 0 ? '#ffffff' : col;
        const j = P.add(k % 3 === 2 ? CELL.star : CELL.sparkle, x + Math.cos(a) * r, y + rand(0.2, 3), z + Math.sin(a) * r,
          Math.cos(a) * 1.5, rand(6, 18) * sc, Math.sin(a) * 1.5, rand(1.4, 2.4) * sc, rand(1.0, 1.6), c, c === '#ffffff' ? 1 : 0.5);
        if (j < 0) break;
        P.drag[j] = 0.9;
        P.flags[j] = F.twinkle;
        P.rotV[j] = rand(-2, 2);
        P.age[j] = -rand(0, 0.35);
      }
      for (let k = 0; k < cnt(5, m); k++) {
        const a = (k / 5) * TAU;
        const j = S.add(SHAPE.star, x, y + 1.5, z, Math.cos(a) * rand(4, 7) * sc, rand(16, 24) * sc, Math.sin(a) * rand(4, 7) * sc, rand(0.95, 1.25) * sc, rand(0.9, 1.2),
          pal ? pal[k % pal.length] : col);
        if (j < 0) break;
        S.grav[j] = 30;
        S.drag[j] = 1.2;
        S.spin[j] = rand(6, 10) * rsign();
        S.emis[j] = 0.6;
      }
      glowFlash(x, y + 2, z, 9 * sc, col, 0.4, 0.8);
    },

    hearts(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 6, m);
      for (let k = 0; k < n; k++) {
        const i = S.add(SHAPE.heart, x + rand(-1, 1) * sc, y + rand(-0.3, 0.5), z + rand(-1, 1) * sc, rand(-1.5, 1.5), rand(3, 6), rand(-1.5, 1.5),
          rand(1.3, 1.6) * sc, rand(1.2, 1.7), o.color ?? (k % 2 ? '#ff3d8b' : '#ff6fae'));
        if (i < 0) break;
        S.drag[i] = 1;
        S.grav[i] = -2;
        S.setAxis(i, 0, 1, 0);
        S.ang[i] = rand(-0.5, 0.5);
        S.spin[i] = rand(-2, 2);
        S.emis[i] = 0.35;
        S.age[i] = -k * 0.06;
      }
    },

    impact(x, y, z, o, sc, m) {
      let i = P.add(CELL.burst, x, y, z, 0, 0, 0, 2.4 * sc, 0.26, o.color ?? '#fff6b8', 0);
      if (i >= 0) {
        P.s1[i] = 6.4 * sc;
        P.curve[i] = CURVE.hold;
        P.rot[i] = rand(0, TAU);
        P.rotV[i] = rand(-2, 2);
      }
      i = P.add(CELL.shock, x, y, z, 0, 0, 0, 1.5 * sc, 0.3, '#ffffff', 0.6);
      if (i >= 0) P.s1[i] = 7.5 * sc;
      const n = cnt(8, m);
      for (let k = 0; k < n; k++) {
        const u = rand(-0.6, 0.8), th = (k / n) * TAU + rand(-0.2, 0.2), r = Math.sqrt(1 - u * u);
        const sp = rand(26, 40) * sc;
        const j = P.add(CELL.streak, x, y, z, r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp, rand(0.7, 0.9) * sc, rand(0.18, 0.26), k % 2 ? '#fff4b0' : '#ffffff', 1);
        if (j < 0) break;
        P.mode[j] = MODE.stretch;
        P.flags[j] = F.velDir;
        P.asp[j] = 5;
        P.drag[j] = 7;
      }
    },

    speedlines(x, y, z, o, sc, m) {
      const col = o.color ?? '#6ff3ff';
      const n = cnt(20, m);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rand(-0.1, 0.1);
        const sp = rand(22, 34) * sc;
        const i = P.add(CELL.streak, x + Math.cos(a) * 1.4, y + rand(0.4, 4.6), z + Math.sin(a) * 1.4, Math.cos(a) * sp, rand(-1, 3), Math.sin(a) * sp,
          rand(0.8, 1.1) * sc, rand(0.3, 0.42), k % 3 ? col : '#ffffff', k % 3 ? 0.6 : 1);
        if (i < 0) break;
        P.mode[i] = MODE.stretch;
        P.flags[i] = F.velDir;
        P.asp[i] = 6;
        P.drag[i] = 4;
      }
      for (let k = 0; k < cnt(8, m); k++) {
        const a = Math.random() * TAU;
        const i = P.add(CELL.streak, x + Math.cos(a) * 1.6, y + rand(0, 1), z + Math.sin(a) * 1.6, 0, rand(20, 30) * sc, 0, rand(0.7, 0.95) * sc, rand(0.35, 0.5), k % 2 ? col : '#ffffff', k % 2 ? 0.6 : 1);
        if (i < 0) break;
        P.mode[i] = MODE.stretch;
        P.flags[i] = F.velDir;
        P.asp[i] = 7;
        P.drag[i] = 3;
        P.age[i] = -rand(0, 0.12);
      }
      groundRing(x, y + 0.15, z, 1.5 * sc, 12 * sc, 0.45, col, 0.8);
      KINDS.sparkle(x, y + 2.5, z, { color: col, count: 8 }, sc, m);
    },

    whoosh(x, y, z, o, sc, m) {
      const yaw = o.yaw ?? 0;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = -fz, rz = fx; // the swinger's right
      const col = o.color ?? '#ffffff';
      // crescent in a plane tilted back towards the follow camera; its thick head leads a right-to-left sweep
      for (let layer = 0; layer < 2; layer++) {
        const i = P.add(CELL.swoosh, x + fx * 1.5, y + 2.9 + layer * 0.05, z + fz * 1.5, 0, 0, 0, (layer ? 6.6 : 7.6) * sc, 0.3, layer ? col : '#ffffff', layer ? 0.55 : 0.1);
        if (i < 0) break;
        P.mode[i] = MODE.flat;
        P.dx[i] = -fx * 0.55;
        P.dy[i] = 1;
        P.dz[i] = -fz * 0.55;
        P.rot[i] = -0.75;
        P.rotV[i] = 5.2;
        P.s1[i] = (layer ? 7.4 : 8.6) * sc;
        P.alpha[i] = layer ? 1 : 0.9;
      }
      const cx = x + fx * 0.8, cz = z + fz * 0.8, R = 2.8 * sc;
      for (let k = 0; k < cnt(5, m); k++) {
        const ph = Math.PI * (0.15 + 0.7 * (k / 4));
        const px = cx + (rx * Math.cos(ph) + fx * Math.sin(ph)) * R, pz = cz + (rz * Math.cos(ph) + fz * Math.sin(ph)) * R;
        const vx = (-rx * Math.sin(ph) + fx * Math.cos(ph)) * 26, vz = (-rz * Math.sin(ph) + fz * Math.cos(ph)) * 26;
        const i = P.add(CELL.streak, px, y + 2.6 + rand(-0.5, 0.8), pz, vx, 0, vz, rand(0.55, 0.75) * sc, rand(0.16, 0.24), '#ffffff', 1);
        if (i < 0) break;
        P.mode[i] = MODE.stretch;
        P.flags[i] = F.velDir;
        P.asp[i] = 5;
        P.drag[i] = 6;
        P.age[i] = -k * 0.025;
      }
    },

    sparks(x, y, z, o, sc, m) {
      const n = cnt(o.count ?? 18, m);
      const col = o.color ?? '#ff4040';
      const spanZ = o.spanZ ?? 0, spanX = o.spanX ?? 0, spanY = o.spanY ?? 0;
      for (let k = 0; k < n; k++) {
        const u = rand(-0.2, 1), th = Math.random() * TAU, r = Math.sqrt(1 - u * u);
        const sp = rand(8, 18) * sc;
        const i = P.add(CELL.streak, x + rand(-1, 1) * spanX, y + rand(0, spanY), z + rand(-1, 1) * spanZ, r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp,
          rand(0.55, 0.8) * sc, rand(0.35, 0.65), k % 3 ? col : o.hot ? '#ffe066' : '#ffd6a0', k % 3 ? (o.hot ? 0.1 : 0.35) : 1);
        if (i < 0) break;
        P.mode[i] = MODE.stretch;
        P.flags[i] = F.velDir;
        P.asp[i] = 4;
        P.grav[i] = 40;
        P.drag[i] = 1;
      }
      const flashes = Math.max(1, Math.round((spanY + spanZ) / 3));
      for (let k = 0; k < flashes; k++) glowFlash(x + rand(-1, 1) * spanX, y + rand(0, spanY), z + rand(-1, 1) * spanZ, 3.5 * sc, col, 0.3, 0.8);
    },

    beams(x, y, z, o, sc) {
      // two short-lived light pillars (e.g. at the ends of a gate)
      const sz = o.spanZ ?? 0, sx = o.spanX ?? 0;
      for (let k = -1; k <= 1; k += 2) {
        const i = P.add(CELL.beam, x + k * sx, y, z + k * sz, 0, 0, 0, 2.4 * sc, 0.7, o.color ?? '#ff3b3b', 0.6);
        if (i < 0) break;
        P.mode[i] = MODE.axial;
        P.asp[i] = 4.5;
        P.flags[i] = F.grow;
        P.s1[i] = 1.2 * sc;
      }
    },

    ring(x, y, z, o, sc) {
      groundRing(x, y + 0.12, z, (o.from ?? 1) * sc, (o.size ?? 8) * sc, o.life ?? 0.5, o.color ?? '#ffffff', o.additive ?? 0.7);
    },

    sad(x, y, z, o, sc, m) {
      KINDS.poof(x, y, z, { color: '#a3adc2', count: 7, emis: 0.1, ring: false }, sc * 0.85, m);
      for (let k = 0; k < cnt(5, m); k++) {
        const i = P.add(CELL.tear, x + rand(-0.8, 0.8), y + rand(0, 0.6), z + rand(-0.8, 0.8), rand(-1, 1), rand(1, 3), rand(-1, 1), rand(0.8, 1.1) * sc, rand(0.8, 1.1), '#4aa6ff', 0.1);
        if (i < 0) break;
        P.grav[i] = 14;
        P.age[i] = -k * 0.08;
      }
    },

    cloak(x, y, z, o, sc, m) {
      KINDS.poof(x, y, z, { color: '#cbb8ff', count: 8, emis: 0.45 }, sc, m);
      KINDS.sparkle(x, y + 0.5, z, { color: '#e8dcff', count: 12 }, sc, m);
    },

    electric(x, y, z, o, sc, m) {
      const col = o.color ?? '#7ff6ff';
      for (let k = 0; k < cnt(6, m); k++) {
        const a = Math.random() * TAU;
        const i = P.add(CELL.bolt, x + Math.cos(a) * 1.8, y + rand(0.8, 4), z + Math.sin(a) * 1.8, 0, 0, 0, rand(2, 2.8) * sc, rand(0.14, 0.22), k % 2 ? col : '#fff27a', 0.5);
        if (i < 0) break;
        P.rot[i] = rand(-0.6, 0.6);
        P.curve[i] = CURVE.hold;
        P.age[i] = -k * 0.05;
      }
      groundRing(x, y + 0.15, z, 1 * sc, 9 * sc, 0.45, col, 0.9);
      KINDS.sparks(x, y + 1, z, { color: col, count: 14, spanY: 3 }, sc, m);
    },

    glint(x, y, z, o, sc) {
      const i = P.add(CELL.sparkle, x, y, z, 0, 0, 0, 2 * sc, 0.4, o.color ?? '#ffffff', 1);
      if (i >= 0) {
        P.curve[i] = CURVE.flash;
        P.rotV[i] = 3;
      }
    },
  };

  // ---------------------------------------------------------------- public API

  function burst(kind, pos, opts = {}) {
    const fn = KINDS[kind];
    if (!fn || !pos) return;
    const m = Q.mult * (opts.lod ?? 1);
    fn(pos.x, pos.y ?? 0, pos.z, opts, opts.scale ?? 1, m);
  }

  function floatText(text, pos, opts = {}) {
    const o = opts.style ? opts : { ...opts, style: opts.color ? 'rarity' : 'info' };
    if (o.style === 'rarity' && o.color && !o.color2) o.color2 = o.color.startsWith('#') ? shade(o.color, 0.7) : o.color;
    return floaters.add(String(text), pos, o);
  }

  function storm(pos, seconds, opts = {}) {
    let s = storms.find((q) => !q.active) || storms[0];
    s.active = true;
    s.follow = opts.follow || null;
    s.x = pos.x;
    s.y = pos.y ?? 0;
    s.z = pos.z;
    s.until = clock + seconds;
    s.rate = (opts.rate ?? 60) * Q.mult;
    s.acc = 0;
    s.colors = opts.colors || CONFETTI;
    s.radius = opts.radius ?? 14;
    s.sparkle = !!opts.sparkle;
  }

  // ---------------------------------------------------------------- event mapping

  const H = () => game?.human || null;
  const allowBurst = () => burstsThisFrame++ < 16;
  const allowFloat = () => floatsThisFrame++ < 6;
  const at = (x, y, z) => {
    tmp.x = x;
    tmp.y = y;
    tmp.z = z;
    return tmp;
  };
  const shake = (amount) => bus.emit('camera:shake', { amount });
  const sizeFor = (involved, L) => (involved ? 'l' : L > 0.75 ? 'm' : 's');

  const handlers = {
    'cash:collected'({ player, amount, x, z }) {
      const isH = player === H();
      const L = lodAt(x, 1, z, isH ? 400 : 110);
      if (!L) return;
      const t = track[player.slot];
      const fresh = clock - t.cashLast > 1.2;
      if (fresh) t.cashSum = 0;
      t.cashSum += amount;
      t.cashLast = clock;
      if (clock >= t.cashCoinsAt && allowBurst()) {
        // a big fountain for a fresh collect, then a steady trickle while standing on the pad
        t.cashCoinsAt = clock + (fresh ? 0.22 : 0.3);
        const lg = Math.log10(amount + 1);
        const n = fresh ? (isH ? clamp(4 + lg * 3, 5, 16) : clamp(2 + lg * 1.5, 3, 7)) : isH ? 3 : 1;
        burst('coins', at(x, 0.4, z), { count: n, target: player.pos, targetY: 3.2, lod: L, bills: isH && amount >= 1000 ? 3 : 0 });
      }
      if ((isH || L > 0.55) && allowFloat()) {
        floatText('+$' + fmt(t.cashSum), at(0, 6.4, 0), { style: 'money', size: isH ? 'l' : 's', key: 'cash' + player.slot, follow: player.pos, duration: 1.4 });
      }
    },

    'seed:grabbed'({ player, mutation, rarity, pod }) {
      const px = pod ? pod.x : player.pos.x, pz = pod ? pod.z : player.pos.z;
      const isH = player === H();
      const L = lodAt(px, 2, pz, isH ? 400 : 100);
      if (!L || !allowBurst()) return;
      const r = RARITY[rarity] || RARITY.common;
      const mut = MUTATIONS[mutation] || MUTATIONS.normal;
      const col = rarityColor(rarity);
      const special = r.tier >= 3 || mut.id !== 'normal';
      const rainbow = rarity === 'secret' || mut.id === 'rainbow';
      burst('sparkle', at(px, 2.2, pz), { color: col, lod: L, count: special ? 16 : 10 });
      if (special) {
        const bc = r.tier >= 3 ? col : mut.color && mut.color !== 'rainbow' ? mut.color : '#ffffff';
        burst('rarity', at(px, 0, pz), { color: bc, rainbow, lod: L, scale: r.tier >= 5 ? 1.25 : 1 });
      }
      if (!special || !allowFloat()) return;
      if (!isH && (r.tier < 4 || L < 0.5)) return;
      const txt = r.tier >= 3 ? `${mut.name ? mut.name.toUpperCase() + ' ' : ''}${r.name.toUpperCase()}!` : `${mut.name.toUpperCase()}!`;
      const fcol = r.tier >= 3 ? col : mut.color !== 'rainbow' ? mut.color : '#ffffff';
      floatText(txt + (rarity === 'secret' ? '!' : ''), at(px, 5.2, pz), {
        style: 'rarity', color: fcol, size: isH ? (r.tier >= 5 ? 'xl' : 'l') : 's', rainbow, duration: isH ? 1.9 : 1.4, rise: 3,
      });
    },

    'seed:dropped'({ item }) {
      const L = lodAt(item.x, 1, item.z, 90);
      if (!L || !allowBurst()) return;
      burst('poof', at(item.x, 0.8, item.z), { count: 6, scale: 0.8, lod: L });
      burst('sparkle', at(item.x, 1.4, item.z), { color: rarityColor(PLANT[item.speciesId]?.rarity || 'common'), count: 6, lod: L });
    },

    'plant:planted'({ player, planter }) {
      const L = lodAt(planter.x, 1.2, planter.z, 110);
      if (!L || !allowBurst()) return;
      burst('dirt', at(planter.x, 1.2, planter.z), { lod: L });
      burst('leaves', at(planter.x, 1.4, planter.z), { lod: L });
      if (player === H() && allowFloat()) floatText('PLANTED!', at(planter.x, 4.5, planter.z), { style: 'good', size: 'm', duration: 1.1 });
    },

    'plant:grown'({ plant, planter, garden }) {
      const mine = garden.owner === H();
      const L = lodAt(planter.x, 3, planter.z, mine ? 160 : 90);
      if (!L || !allowBurst()) return;
      const col = rarityColor(PLANT[plant.speciesId]?.rarity || 'common');
      burst('sparkle', at(planter.x, 3.2, planter.z), { color: col, count: 16, scale: 1.2, lod: L });
      burst('ring', at(planter.x, 1.2, planter.z), { color: col, size: 6, lod: L });
      if (mine && allowFloat()) floatText('GROWN!', at(planter.x, 5.6, planter.z), { style: 'good', size: 's', duration: 1.1 });
    },

    'plant:sold'({ player, value, planter }) {
      const isH = player === H();
      const L = lodAt(planter.x, 2, planter.z, isH ? 400 : 100);
      if (!L || !allowBurst()) return;
      burst('coins', at(planter.x, 2, planter.z), { count: clamp(5 + Math.log10(value + 1) * 2, 6, 18), target: player.pos, targetY: 3.2, lod: L, bills: isH ? 2 : 0 });
      burst('poof', at(planter.x, 2, planter.z), { count: 5, scale: 0.8, lod: L, ring: false });
      if ((isH || L > 0.6) && allowFloat()) floatText('+$' + fmt(value), at(planter.x, 5.2, planter.z), { style: 'money', size: isH ? 'l' : 's', duration: 1.5 });
    },

    'steal:success'({ thief, victim, planter, soldFor }) {
      const h = H();
      if (planter) {
        const L = lodAt(planter.x, 1.5, planter.z, 100);
        if (L && allowBurst()) {
          burst('poof', at(planter.x, 1.6, planter.z), { lod: L });
          burst('sparkle', at(planter.x, 2.6, planter.z), { lod: L, count: 8 });
        }
      }
      if (thief === h) {
        burst('confetti', at(thief.pos.x, thief.pos.y + 4, thief.pos.z), { count: 45 });
        floatText('YOINK!', at(0, 7.2, 0), { style: 'gold', size: 'xl', follow: thief.pos, duration: 1.8, rise: 2 });
        if (soldFor) floatText('+$' + fmt(soldFor), at(0, 5.6, 0), { style: 'money', size: 'l', follow: thief.pos, duration: 1.8 });
        shake(0.25);
      } else if (victim === h) {
        burst('sad', at(h.pos.x, h.pos.y + 6.2, h.pos.z), {});
        floatText('ROBBED!', at(0, 7, 0), { style: 'bad', size: 'm', follow: h.pos, duration: 1.4 });
      } else {
        const L = lodAt(thief.pos.x, 4, thief.pos.z, 80);
        if (L > 0.5 && allowFloat()) floatText('STOLEN!', at(0, 7, 0), { style: 'bad', size: 's', follow: thief.pos, duration: 1.2 });
      }
    },

    'steal:foiled'({ thief, victim, by }) {
      const h = H();
      const involved = victim === h || by === h;
      const L = lodAt(thief.pos.x, 4, thief.pos.z, involved ? 400 : 80);
      if (!L || !allowBurst()) return;
      burst('sparkle', at(thief.pos.x, thief.pos.y + 6.5, thief.pos.z), { color: '#6dfbd8', count: 10, lod: L });
      if (thief === h && allowFloat()) {
        floatText('DROPPED IT!', at(thief.pos.x, thief.pos.y + 7.4, thief.pos.z), { style: 'bad', size: 'l', duration: 1.5 });
      } else if ((involved || L > 0.6) && allowFloat()) {
        floatText('GOT IT BACK!', at(thief.pos.x, thief.pos.y + 7.4, thief.pos.z), { style: 'good', size: involved ? 'l' : 's', duration: 1.5 });
      }
    },

    'plant:returned'({ planter, garden, refund }) {
      const mine = garden.owner === H();
      if (planter) {
        const L = lodAt(planter.x, 1.5, planter.z, mine ? 160 : 90);
        if (L && allowBurst()) {
          burst('poof', at(planter.x, 1.6, planter.z), { lod: L });
          burst('sparkle', at(planter.x, 2.8, planter.z), { color: '#6dfbd8', count: 8, lod: L });
          if (mine) burst('hearts', at(planter.x, 3, planter.z), { count: 4, lod: L });
        }
      }
      if (refund && mine && allowFloat()) {
        const o = garden.owner.pos;
        floatText('+$' + fmt(refund), at(0, 6.4, 0), { style: 'money', size: 'm', follow: o, duration: 1.4 });
      }
    },

    'player:hit'({ target, by, cause }) {
      const h = H();
      lastHitFrame = frame;
      lastHitCause = cause;
      const involved = target === h || by === h;
      if (target === h) shake(0.9);
      else if (by === h) shake(0.3);
      const { x, y, z } = target.pos;
      const L = lodAt(x, y + 3, z, involved ? 400 : 95);
      if (!L || !allowBurst()) return;
      burst('impact', at(x, y + 3.4, z), { lod: L, scale: involved ? 1.1 : 0.85, color: cause === 'balloon' ? '#86ccff' : '#fff6b8' });
      burst('stars', at(x, y + 5, z), { lod: L });
      if (cause === 'banana') burst('poof', at(x, y + 0.4, z), { color: '#fff1a0', count: 5, scale: 0.7, lod: L, ring: false });
      if (allowFloat()) {
        floatText(HIT_TEXT[cause] || 'BONK!', at(x, y + 7, z), {
          style: 'comic', size: target === h ? 'xl' : by === h ? 'l' : sizeFor(false, L), burst: HIT_BURST[cause] || HIT_BURST.bonk, duration: 1.05, rise: 1.8,
        });
      }
    },

    'bonk:swing'({ player }) {
      const { x, y, z } = player.pos;
      if (camDist(x, y, z) > 70 || (player.invisible(game.time) && player !== H()) || !allowBurst()) return;
      burst('whoosh', player.pos, { yaw: player.yaw, color: player.char?.color || '#ffffff', scale: 1 });
    },

    'balloon:splash'({ x, y, z, owner }) {
      const h = H();
      const L = lodAt(x, y, z, owner === h ? 400 : 110);
      if (!L || !allowBurst()) return;
      burst('splash', at(x, y, z), { lod: L });
      const hitNow = lastHitFrame === frame && lastHitCause === 'balloon';
      if (!hitNow && (owner === h || L > 0.7) && allowFloat()) floatText('SPLASH!', at(x, y + 3.2, z), { style: 'comic', size: owner === h ? 'l' : 'm', burst: '#2f8bff', duration: 1 });
      if (h && Math.hypot(h.pos.x - x, h.pos.z - z) < 10) shake(0.15);
    },

    'banana:slip'({ x, z }) {
      const L = lodAt(x, 0.5, z, 90);
      if (!L || !allowBurst()) return;
      burst('stars', at(x, 1, z), { color: '#ffe135', count: 5, scale: 0.8, lod: L });
    },

    'monster:caught'({ monster, target }) {
      const h = H();
      const involved = target === h;
      if (involved) shake(0.8);
      const { x, y, z } = target.pos;
      const L = lodAt(x, y + 3, z, involved ? 400 : 90);
      if (!L || !allowBurst()) return;
      burst('impact', at(x, y + 3, z), { lod: L, color: '#ffd0c0', scale: involved ? 1.2 : 0.9 });
      burst('poof', at(monster.x, 1, monster.z), { lod: L, count: 7, color: '#f4efe6' });
      burst('stars', at(x, y + 5, z), { lod: L, count: 5 });
      if ((involved || L > 0.7) && allowFloat()) {
        floatText(involved ? 'CAUGHT!' : 'CHOMP!', at(x, y + 6.5, z), { style: 'comic', size: involved ? 'xl' : 'm', burst: '#8a4bff', duration: 1.2 });
      }
    },

    'monster:bonked'({ monster, by }) {
      const h = H();
      const L = lodAt(monster.x, 4, monster.z, by === h ? 400 : 90);
      if (!L || !allowBurst()) return;
      burst('stars', at(monster.x, monster.y + 4.2, monster.z), { lod: L, count: 8 });
      burst('impact', at(monster.x, monster.y + 2.6, monster.z), { lod: L, scale: 0.9 });
      if (by === h) {
        shake(0.3);
        if (allowFloat()) floatText('BONK!', at(monster.x, monster.y + 6, monster.z), { style: 'comic', size: 'l', burst: '#ff3d2e', duration: 1 });
      }
    },

    'lock:on'({ player, garden }) {
      const g = garden.L.gate;
      const mine = player === H();
      const L = lodAt(g.x, 3, g.z, mine ? 400 : 110);
      if (!L || !allowBurst()) return;
      burst('sparks', at(g.x, 0.4, g.z), { color: '#ff2a2a', count: 40, spanZ: g.half, spanY: 5, lod: L, hot: true });
      burst('beams', at(g.x, 0, g.z), { color: '#ff3b3b', spanZ: g.half, lod: L });
      if (mine && allowFloat()) floatText('LOCKED!', at(g.x, 7.5, g.z), { style: 'good', size: 'l', duration: 1.5 });
    },

    'lock:off'({ garden }) {
      const g = garden.L.gate;
      const L = lodAt(g.x, 3, g.z, 70);
      if (!L || !allowBurst()) return;
      burst('sparks', at(g.x, 0.4, g.z), { color: '#ff9a9a', count: 10, spanZ: g.half, spanY: 3, lod: L, scale: 0.8 });
    },

    'speed:up'({ player }) {
      const isH = player === H();
      const L = lodAt(player.pos.x, 2, player.pos.z, isH ? 400 : 80);
      if (!L || !allowBurst()) return;
      burst('speedlines', player.pos, { lod: L });
      if ((isH || L > 0.6) && allowFloat()) {
        floatText(`+${PLAYER.speedPerLevel} SPEED!`, at(0, 6.8, 0), { style: 'speed', size: isH ? 'xl' : 's', follow: player.pos, duration: 1.6 });
      }
    },

    rebirth({ player }) {
      const isH = player === H();
      const L = lodAt(player.pos.x, 3, player.pos.z, isH ? 400 : 110);
      if (!L) return;
      burst('rarity', at(player.pos.x, player.pos.y, player.pos.z), { color: '#ffd23f', lod: L, scale: 1.3 });
      burst('confetti', at(player.pos.x, player.pos.y + 4, player.pos.z), { count: 60, lod: L });
      if (isH) {
        storm(player.pos, 3.5, { follow: player.pos, rate: 55 });
        floatText('REBIRTH!', at(0, 7.4, 0), { style: 'gold', size: 'xl', follow: player.pos, duration: 2.2 });
        shake(0.4);
      }
    },

    'match:end'({ ranking }) {
      const win = ranking?.[0]?.player;
      const h = H();
      const focus = h ? h.pos : win ? win.pos : engine.focus;
      storm(focus, 6, { follow: focus, rate: 70, radius: 16 });
      if (win) burst('confetti', at(win.pos.x, win.pos.y + 4, win.pos.z), { count: 70 });
    },

    purchase({ player, what }) {
      if (player !== H()) return;
      const { x, y, z } = player.pos;
      burst('coins', at(x, y + 4.5, z), { count: 5, scale: 0.7, floor: y });
      if (what === 'coil') burst('electric', player.pos, { scale: 0.7 });
    },

    'event:start'({ event }) {
      const pal = EVENT_COLORS[event?.type] || CONFETTI;
      const h = H();
      const f = h ? h.pos : engine.focus;
      // a ring of sparkles around the player (not on top of them) so they stay visible
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        burst('sparkle', at(f.x + Math.sin(a) * 4, f.y + 4, f.z + Math.cos(a) * 4), { colors: pal, count: 2, scale: 1.1 });
      }
      burst('confetti', at(f.x, f.y + 8, f.z), { colors: pal, count: 30 });
      storm(f, 2.5, { follow: h ? h.pos : null, colors: pal, rate: 40, sparkle: true });
    },

    'plant:watered'({ player, planter }) {
      const L = lodAt(planter.x, 2, planter.z, player === H() ? 400 : 80);
      if (!L || !allowBurst()) return;
      burst('splash', at(planter.x, 2.6, planter.z), { scale: 0.6, count: 16, floor: 1.2, lod: L });
      burst('sparkle', at(planter.x, 3, planter.z), { color: '#8fe3ff', count: 8, lod: L });
      if (player === H() && allowFloat()) floatText('GROW FASTER!', at(planter.x, 5.5, planter.z), { style: 'speed', size: 'm', duration: 1.3 });
    },

    'planter:unlocked'({ player, index }) {
      const pl = game.gardens[player.slot]?.planters[index];
      if (!pl) return;
      const L = lodAt(pl.x, 1.5, pl.z, player === H() ? 400 : 80);
      if (!L || !allowBurst()) return;
      burst('poof', at(pl.x, 1.4, pl.z), { lod: L });
      burst('sparkle', at(pl.x, 2.4, pl.z), { color: '#ffe36b', count: 14, lod: L });
      if (player === H() && allowFloat()) floatText('UNLOCKED!', at(pl.x, 5, pl.z), { style: 'gold', size: 'l', duration: 1.5 });
    },

    'item:used'({ player, item }) {
      const { x, y, z } = player.pos;
      const L = lodAt(x, y + 2, z, player === H() ? 400 : 80);
      if (!L || !allowBurst()) return;
      if (item === 'coil') burst('electric', player.pos, { lod: L });
      else if (item === 'cloak') burst('cloak', at(x, y + 2.4, z), { lod: L });
      else if (item === 'banana' || item === 'balloon') burst('glint', at(x, y + 4, z), { scale: 0.8 });
    },

    'pod:respawn'({ pod }) {
      if (camDist(pod.x, 2, pod.z) > 45 || !allowBurst()) return;
      burst('sparkle', at(pod.x, 2, pod.z), { count: 6, scale: 0.7, color: pod.seed ? rarityColor(PLANT[pod.seed.speciesId]?.rarity || 'common') : '#ffffff' });
    },

    'player:jump'({ player }) {
      if (player !== H() || !Q.dust) return;
      burst('dust', at(player.pos.x, player.pos.y, player.pos.z), { count: 4, scale: 0.7 });
    },
  };

  function detach() {
    for (const off of subs) off();
    subs = [];
    game = null;
    primed = false;
    clear();
  }

  function attach(g) {
    detach();
    game = g;
    for (const t of track) {
      t.wasGround = true;
      t.minVy = 0;
      t.cashSum = 0;
      t.cashLast = -9;
      t.cashCoinsAt = 0;
    }
    for (const name of Object.keys(handlers)) {
      const fn = handlers[name];
      subs.push(bus.on(name, (p) => {
        // ignore the burst of events from the title screen's synchronous head start
        if (!primed || !game || !p) return;
        fn(p);
      }));
    }
  }

  const offDispose = bus.on('game:dispose', ({ game: g } = {}) => {
    if (g && g === game) detach();
  });

  function clear() {
    S.clear();
    P.clear();
    floaters.clear();
    for (const s of storms) {
      s.active = false;
      s.follow = null;
    }
  }

  // ---------------------------------------------------------------- continuous effects

  function continuous(dt) {
    const g = game;
    if (!g || g.paused) return;
    const now = g.time;
    const h = g.human;
    const cm = Q.cont;
    for (let s = 0; s < g.players.length; s++) {
      const p = g.players[s];
      const t = track[s];
      const { x, y, z } = p.pos;
      const d = camDist(x, y + 2, z);
      const hidden = p.invisible(now) && p !== h;
      const near = d < 90;
      // landing dust
      if (!p.onGround) {
        if (p.vel.y < t.minVy) t.minVy = p.vel.y;
      } else if (!t.wasGround) {
        const impact = -t.minVy;
        if (near && !hidden && impact > 20) burst('dust', at(x, y, z), { count: impact > 50 ? 9 : 6, scale: impact > 50 ? 1.15 : 0.85, lod: d < 40 ? 1 : 0.6 });
        t.minVy = 0;
      }
      t.wasGround = p.onGround;
      if (!near) continue;
      const speed = Math.hypot(p.vel.x, p.vel.z);
      // running dust when fast
      if (Q.dust && p.onGround && speed > 21 && !hidden && d < 60) {
        t.dustAcc += dt * speed * 0.35 * cm;
        while (t.dustAcc >= 1) {
          t.dustAcc -= 1;
          const bx = -p.vel.x / speed, bz = -p.vel.z / speed;
          const i = S.add(SHAPE.puff, x + bx * 0.9 + rand(-0.5, 0.5), y + 0.3, z + bz * 0.9 + rand(-0.5, 0.5), bx * rand(1, 3), rand(1, 2.5), bz * rand(1, 3), rand(0.5, 0.8), rand(0.35, 0.5), '#e6d6b4');
          if (i < 0) break;
          S.drag[i] = 4;
          S.curve[i] = CURVE.puff;
          S.emis[i] = 0.22;
        }
      } else t.dustAcc = 0;
      // speed coil trail
      if (now < p.coilUntil && !hidden) {
        const bx = speed > 1 ? -p.vel.x / speed : -Math.sin(p.yaw), bz = speed > 1 ? -p.vel.z / speed : -Math.cos(p.yaw);
        t.coilAcc += dt * (speed > 4 ? 46 : 10) * cm;
        while (t.coilAcc >= 1) {
          t.coilAcc -= 1;
          const k = Math.random();
          const i = P.add(CELL.streak, x + bx * 1.1 + rand(-0.8, 0.8), y + rand(0.3, 4.8), z + bz * 1.1 + rand(-0.8, 0.8), bx * rand(5, 12), rand(-0.5, 0.5), bz * rand(5, 12),
            rand(0.6, 0.85), rand(0.24, 0.36), k < 0.55 ? '#45e8ff' : k < 0.8 ? '#ffffff' : '#ffe14d', k < 0.55 ? 0.45 : 1);
          if (i < 0) break;
          P.mode[i] = MODE.stretch;
          P.dx[i] = bx;
          P.dy[i] = 0;
          P.dz[i] = bz;
          P.asp[i] = speed > 4 ? 6 : 3;
          if (speed <= 4) {
            P.vy[i] = rand(4, 8);
            P.dy[i] = 1;
            P.dx[i] = 0;
            P.dz[i] = 0;
          }
          if (k > 0.8) {
            // a few electric sparkles kicked up at the feet
            const j = P.add(CELL.spark, x + rand(-0.6, 0.6), y + 0.3, z + rand(-0.6, 0.6), bx * 4 + rand(-2, 2), rand(3, 7), bz * 4 + rand(-2, 2), rand(0.7, 1), 0.35, '#9ff8ff', 1);
            if (j >= 0) P.grav[j] = 20;
          }
        }
      } else t.coilAcc = 0;
      // cloak shimmer
      if (p.invisible(now)) {
        t.cloakAcc += dt * (p === h ? 16 : 5) * cm;
        while (t.cloakAcc >= 1) {
          t.cloakAcc -= 1;
          const a = Math.random() * TAU;
          const i = P.add(CELL.sparkle, x + Math.cos(a) * rand(0.4, 1.3), y + rand(0.3, 5.2), z + Math.sin(a) * rand(0.4, 1.3), 0, rand(0.5, 1.5), 0,
            rand(0.5, 0.9), rand(0.4, 0.7), Math.random() < 0.5 ? '#e8dcff' : '#ffffff', 1);
          if (i < 0) break;
          P.flags[i] = F.twinkle;
          P.alpha[i] = p === h ? 0.9 : 0.45;
        }
      } else t.cloakAcc = 0;
      // sparkles around carried Legendary+ (or mutated) loot
      const c = p.carrying;
      if (c && !hidden) {
        const sid = c.kind === 'seed' ? c.speciesId : c.plant.speciesId;
        const mut = c.kind === 'seed' ? c.mutation : c.plant.mutation;
        const rid = PLANT[sid]?.rarity || 'common';
        const tier = RARITY[rid]?.tier || 0;
        if (tier >= 4 || mut !== 'normal') {
          const rb = rid === 'secret' || mut === 'rainbow';
          const col = tier >= 4 ? rarityColor(rid) : MUTATIONS[mut]?.color || '#ffffff';
          const hy = y + (c.kind === 'plant' ? 7.6 : 7);
          t.lootAcc += dt * (tier >= 5 ? 14 : 9) * cm;
          while (t.lootAcc >= 1) {
            t.lootAcc -= 1;
            const a = Math.random() * TAU, r = rand(0.6, 1.5);
            const i = P.add(Math.random() < 0.3 ? CELL.star : CELL.sparkle, x + Math.cos(a) * r, hy + rand(-0.8, 0.9), z + Math.sin(a) * r, 0, rand(1, 3), 0,
              rand(0.6, 1.1), rand(0.45, 0.8), rb ? RAINBOW[(Math.random() * RAINBOW.length) | 0] : Math.random() < 0.4 ? '#ffffff' : col === 'rainbow' ? '#ffffff' : col, 1);
            if (i < 0) break;
            P.flags[i] = F.twinkle;
            P.drag[i] = 1.5;
          }
        } else t.lootAcc = 0;
      }
    }
  }

  // Per-frame overlays (drawn once, not simulated): dizzy stars, coil ring, loot glow.
  // Must run after the pools' update() since those compact the live range and reset the immediates.
  function overlays() {
    const g = game;
    if (!g) return;
    const now = g.time;
    const h = g.human;
    for (let s = 0; s < g.players.length; s++) {
      const p = g.players[s];
      const { x, y, z } = p.pos;
      if (camDist(x, y + 2, z) > 90 || (p.invisible(now) && p !== h)) continue;
      if (now < p.stunUntil) {
        for (let k = 0; k < 3; k++) {
          const a = clock * 6.5 + (k * TAU) / 3;
          S.immediate(SHAPE.star, x + Math.cos(a) * 1.15, y + 5.9 + Math.sin(a * 2) * 0.12, z + Math.sin(a) * 1.15, 0.5, 0, 1, 0, -a, '#ffe14d', 0.5);
        }
      }
      if (now < p.coilUntil) {
        const pulse = 0.5 + 0.5 * Math.sin(clock * 12);
        P.immediate(CELL.ring, x, y + 0.15, z, 3.4 + pulse * 0.6, '#7ff6ff', 0.55 + pulse * 0.3, 1, MODE.flat, clock * 3);
      }
      const c = p.carrying;
      if (c) {
        const sid = c.kind === 'seed' ? c.speciesId : c.plant.speciesId;
        const mut = c.kind === 'seed' ? c.mutation : c.plant.mutation;
        const rid = PLANT[sid]?.rarity || 'common';
        const tier = RARITY[rid]?.tier || 0;
        if (tier >= 4 || mut !== 'normal') {
          const rb = rid === 'secret' || mut === 'rainbow';
          const mc = MUTATIONS[mut]?.color;
          const col = rb ? RAINBOW[((clock * 6) | 0) % RAINBOW.length] : tier >= 4 ? rarityColor(rid) : mc && mc !== 'rainbow' ? mc : '#ffffff';
          const pulse = 0.5 + 0.5 * Math.sin(clock * 5 + s);
          P.immediate(CELL.glow, x, y + (c.kind === 'plant' ? 7.6 : 7), z, 3.6 + pulse * 0.8, col, 0.28 + pulse * 0.12, 1);
        }
      }
    }
    for (const m of g.monsters) {
      if (now >= m.stunUntil || camDist(m.x, 4, m.z) > 80) continue;
      for (let k = 0; k < 3; k++) {
        const a = clock * 5.5 + (k * TAU) / 3;
        S.immediate(SHAPE.star, m.x + Math.cos(a) * 1.6, (m.y || 0) + 4.6, m.z + Math.sin(a) * 1.6, 0.6, 0, 1, 0, -a, '#ffe14d', 0.5);
      }
    }
  }

  function updateStorms(dt) {
    for (const s of storms) {
      if (!s.active) continue;
      if (clock >= s.until) {
        s.active = false;
        s.follow = null;
        continue;
      }
      const cx = s.follow ? s.follow.x : s.x, cy = s.follow ? s.follow.y : s.y, cz = s.follow ? s.follow.z : s.z;
      s.acc += s.rate * dt;
      while (s.acc >= 1) {
        s.acc -= 1;
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * s.radius;
        const px = cx + Math.cos(a) * r, py = cy + rand(9, 17), pz = cz + Math.sin(a) * r;
        if (s.sparkle && Math.random() < 0.4) {
          const i = P.add(CELL.sparkle, px, py - 4, pz, 0, rand(-6, -2), 0, rand(1.5, 2.3), rand(0.8, 1.4), s.colors[(Math.random() * s.colors.length) | 0], 0.6);
          if (i >= 0) P.flags[i] = F.twinkle;
          continue;
        }
        const star = Math.random() < 0.12;
        const i = S.add(star ? SHAPE.star : SHAPE.card, px, py, pz, rand(-2, 2), rand(-7, -3), rand(-2, 2), star ? 0.7 : rand(0.8, 1.05), rand(3.5, 5),
          s.colors[(Math.random() * s.colors.length) | 0]);
        if (i < 0) break;
        S.grav[i] = 8;
        S.drag[i] = 0.6;
        S.flags[i] = F.flutter;
        S.spin[i] = rand(6, 13) * rsign();
        S.curve[i] = CURVE.hold;
        S.emis[i] = 0.18;
        if (!star) S.sy[i] = rand(0.45, 0.85);
      }
    }
  }

  function update(dt, time) {
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    clock += dt;
    frame++;
    burstsThisFrame = 0;
    floatsThisFrame = 0;
    if (game) primed = true;
    cam.updateMatrixWorld();
    continuous(dt);
    updateStorms(dt);
    S.update(dt);
    P.update(dt);
    overlays();
    S.flush();
    P.flush();
    floaters.update(dt);
  }

  return {
    burst,
    floatText,
    update,
    attach,
    storm,
    clear,
    kinds: Object.keys(KINDS),
    stats() {
      return { solids: S.n, sprites: P.n, floaters: floaters.items.filter((f) => f.active).length, capSolids: S.cap, capSprites: P.cap };
    },
    dispose() {
      detach();
      offDispose();
      engine.scene.remove(S.mesh, P.mesh);
      S.mesh.geometry.dispose();
      P.mesh.geometry.dispose();
      S.material.dispose();
      P.material.uniforms.uMap.value.dispose();
      P.material.dispose();
      floaters.dispose();
    },
    _pools: { S, P },
  };
}
