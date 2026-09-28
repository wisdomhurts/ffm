// Pet eggs: a smooth lathe egg with a painted pattern per egg type (garden spots, farm barn + cow spots,
// jungle zigzag, ocean waves, lava cracks, galaxy stars, frost flakes, candy frosting, cloud sun rays,
// rainbow bands), glowing crack lines revealed in three stages for the hatch, and the two shell halves that
// burst apart. Geometry and materials are cached and shared (stand in the plaza, hatch stage, icons).
//   createEgg(eggId) -> THREE.Group (1 unit tall, standing on y=0)
//   eggParts(eggId)  -> {whole, cracks, top, bottom, teeth, shardGeo, mat}   (for the hatch)
import * as THREE from 'three';
import { EGG } from './catalog.js';

const H = 1; // egg height (units)
const R = 0.39; // max radius
const SEAM = 0.54; // where the shell splits (fraction of the profile)

function profile(t0, t1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const th = Math.PI * (t0 + (t1 - t0) * (i / n));
    const r = Math.max(0.0005, R * Math.sin(th) * (1 + 0.13 * Math.cos(th)));
    pts.push(new THREE.Vector2(r, ((1 - Math.cos(th)) / 2) * H));
  }
  return pts;
}

const GEO = {};
function geo(kind) {
  if (GEO[kind]) return GEO[kind];
  let g;
  if (kind === 'whole') g = new THREE.LatheGeometry(profile(0, 1, 22), 28);
  else if (kind === 'bottom') g = new THREE.LatheGeometry(profile(0, SEAM, 12), 28);
  else if (kind === 'top') g = new THREE.LatheGeometry(profile(SEAM, 1, 11), 28);
  else if (kind === 'shard') g = new THREE.TetrahedronGeometry(0.07, 0);
  // lathe UVs run 0..1 over each piece: remap the halves onto the whole egg's texture
  if (kind === 'bottom' || kind === 'top') {
    const uv = g.attributes.uv;
    const [a, b] = kind === 'bottom' ? [0, SEAM] : [SEAM, 1];
    for (let i = 0; i < uv.count; i++) uv.setY(i, a + (b - a) * uv.getY(i));
  }
  g.userData.shared = true;
  GEO[kind] = g;
  return g;
}

// ------------------------------------------------------------------ painted patterns

const TW = 512, TH = 256;
function canvas() {
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  return c;
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
// draw with horizontal wrap-around (u = 0 and u = 1 are the same meridian: the egg's front)
function wrapDraw(g, x, fn) {
  for (const dx of [-TW, 0, TW]) fn(x + dx);
}
function vgrad(g, c1, c2) {
  const gr = g.createLinearGradient(0, 0, 0, TH);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fillRect(0, 0, TW, TH);
}

const PAINT = {
  garden(g, e, r) {
    vgrad(g, '#fffaf0', '#ffeec8');
    for (let i = 0; i < 16; i++) {
      const x = r() * TW, y = 36 + r() * (TH - 72), rad = 14 + r() * 20;
      wrapDraw(g, x, (xx) => {
        g.fillStyle = '#4fae3c';
        g.beginPath();
        g.ellipse(xx, y + 2, rad, rad * 1.25, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = i % 3 ? '#7bd35a' : '#9be26f';
        g.beginPath();
        g.ellipse(xx, y, rad * 0.86, rad * 1.1, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
    return null;
  },
  jungle(g, e, r) {
    vgrad(g, '#5fd66a', '#2a9443');
    // leafy blotches
    for (let i = 0; i < 22; i++) {
      const x = r() * TW, y = 20 + r() * (TH - 40), l = 22 + r() * 18, a = r() * Math.PI;
      wrapDraw(g, x, (xx) => {
        g.fillStyle = i % 2 ? 'rgba(20,110,50,0.55)' : 'rgba(170,240,120,0.45)';
        g.beginPath();
        g.ellipse(xx, y, l, l * 0.42, a, 0, Math.PI * 2);
        g.fill();
      });
    }
    // bold yellow zigzag band round the middle
    const y0 = TH * 0.44;
    g.lineJoin = 'round';
    for (const [w, c] of [[30, '#1e5a2a'], [20, '#ffd23f']]) {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      for (let i = 0; i <= 16; i++) g.lineTo((i / 16) * TW, y0 + (i % 2 ? -18 : 18));
      g.stroke();
    }
    return null;
  },
  volcano(g, e, r) {
    vgrad(g, '#4a2620', '#1e0e0c');
    // rocky speckles
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,140,90,0.08)';
      g.fillRect(r() * TW, r() * TH, 3 + r() * 6, 3 + r() * 6);
    }
    // glowing lava veins (drawn on the emissive map too)
    const glow = canvas();
    const gg = glow.getContext('2d');
    gg.fillStyle = '#000';
    gg.fillRect(0, 0, TW, TH);
    const veins = [];
    for (let i = 0; i < 9; i++) {
      let x = r() * TW, y = 20 + r() * (TH - 40);
      const pts = [[x, y]];
      for (let k = 0; k < 7; k++) {
        x += 18 + r() * 26;
        y += (r() - 0.5) * 42;
        pts.push([x, Math.max(14, Math.min(TH - 14, y))]);
      }
      veins.push(pts);
    }
    const stroke = (ctx, w, c) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.lineJoin = ctx.lineCap = 'round';
      for (const pts of veins) {
        for (const dx of [-TW, 0, TW]) {
          ctx.beginPath();
          pts.forEach(([x, y]) => ctx.lineTo(x + dx, y));
          ctx.stroke();
        }
      }
    };
    stroke(g, 11, '#ff5a1a');
    stroke(g, 4, '#ffd166');
    stroke(gg, 12, '#ff5a1a');
    stroke(gg, 5, '#ffe08a');
    return glow;
  },
  galaxy(g, e, r) {
    vgrad(g, '#3a2480', '#110b2e');
    const glow = canvas();
    const gg = glow.getContext('2d');
    gg.fillStyle = '#000';
    gg.fillRect(0, 0, TW, TH);
    // nebula clouds
    for (let i = 0; i < 10; i++) {
      const x = r() * TW, y = r() * TH, rad = 40 + r() * 70;
      const c = ['255,102,217', '110,160,255', '180,110,255'][i % 3];
      wrapDraw(g, x, (xx) => {
        for (const ctx of [g, gg]) {
          const gr = ctx.createRadialGradient(xx, y, 0, xx, y, rad);
          gr.addColorStop(0, `rgba(${c},${ctx === g ? 0.55 : 0.28})`);
          gr.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = gr;
          ctx.fillRect(xx - rad, y - rad, rad * 2, rad * 2);
        }
      });
    }
    // stars (+ a few four-point sparkles)
    for (let i = 0; i < 120; i++) {
      const x = r() * TW, y = 10 + r() * (TH - 20), s = r() < 0.12 ? 3.2 : 1 + r() * 1.4;
      for (const ctx of [g, gg]) {
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
        if (s > 3) {
          ctx.fillRect(x - s * 3, y - 0.8, s * 6, 1.6);
          ctx.fillRect(x - 0.8, y - s * 3, 1.6, s * 6);
        }
      }
    }
    return glow;
  },

  // ---- Farm: cream shell, cute cow spots on top, a red barn band with white X doors round the bottom
  farm(g, e, r) {
    vgrad(g, '#fffbf0', '#fff0d0');
    // cow spots (each a lumpy cluster of circles)
    for (let i = 0; i < 11; i++) {
      const x = (i / 11) * TW + (r() - 0.5) * 30, y = 52 + (i % 3) * 30 + r() * 14, s = 12 + r() * 11;
      const lumps = [];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + r();
        lumps.push([Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.5, s * (0.5 + r() * 0.3)]);
      }
      wrapDraw(g, x, (xx) => {
        g.fillStyle = '#3b2a25';
        g.beginPath();
        g.ellipse(xx, y, s, s * 0.85, 0, 0, Math.PI * 2);
        for (const [dx, dy, rr] of lumps) {
          g.moveTo(xx + dx + rr, y + dy);
          g.arc(xx + dx, y + dy, rr, 0, Math.PI * 2);
        }
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath();
        g.ellipse(xx - s * 0.3, y - s * 0.35, s * 0.35, s * 0.2, -0.4, 0, Math.PI * 2);
        g.fill();
      });
    }
    // a few pink hearts between the spots
    for (let i = 0; i < 5; i++) {
      const x = ((i + 0.5) / 5) * TW + 24, y = 70 + (i % 2) * 50, s = 7;
      wrapDraw(g, x, (xx) => {
        g.fillStyle = '#ff8fb1';
        g.beginPath();
        g.moveTo(xx, y + s * 1.1);
        g.bezierCurveTo(xx - s * 1.6, y, xx - s * 0.9, y - s * 1.1, xx, y - s * 0.35);
        g.bezierCurveTo(xx + s * 0.9, y - s * 1.1, xx + s * 1.6, y, xx, y + s * 1.1);
        g.fill();
      });
    }
    // red barn band: planks, white trim and a white X on every door panel
    const y0 = 146, y1 = 214;
    g.fillStyle = '#e0564a';
    g.fillRect(0, y0, TW, y1 - y0);
    g.fillStyle = '#c4443a';
    for (let x = 0; x < TW; x += 16) g.fillRect(x, y0, 3, y1 - y0);
    const P = 64;
    g.strokeStyle = '#fff8ee';
    g.lineCap = 'round';
    for (let x = 0; x < TW; x += P) {
      g.lineWidth = 5;
      g.strokeRect(x + 6, y0 + 8, P - 12, y1 - y0 - 16);
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x + 9, y0 + 11);
      g.lineTo(x + P - 9, y1 - 11);
      g.moveTo(x + P - 9, y0 + 11);
      g.lineTo(x + 9, y1 - 11);
      g.stroke();
    }
    g.fillStyle = '#fff8ee';
    g.fillRect(0, y0 - 6, TW, 8);
    g.fillRect(0, y1 - 2, TW, 8);
    // green grass tufts under the barn
    g.fillStyle = '#6cc24a';
    g.fillRect(0, y1 + 6, TW, TH - y1 - 6);
    g.fillStyle = '#86d65e';
    for (let x = 0; x < TW; x += 12) {
      g.beginPath();
      g.moveTo(x, y1 + 12);
      g.lineTo(x + 6, y1 + 3);
      g.lineTo(x + 12, y1 + 12);
      g.fill();
    }
    return null;
  },

  // ---- Ocean: light-to-deep blue waves with foamy crests, bubbles and a couple of starfish
  ocean(g, e, r) {
    vgrad(g, '#a8f2ff', '#58d3ff');
    const bands = [
      [62, '#62d4ff', 4, 0.3],
      [104, '#3cb2f2', 5, 1.7],
      [148, '#2a8ae0', 4, 2.9],
      [192, '#1f5fd0', 6, 0.8],
      [230, '#1a4aa8', 5, 2.2],
    ];
    const wave = (x, y0, k, ph) => y0 + Math.sin((x / TW) * Math.PI * 2 * k + ph) * 7;
    for (const [y0, col, k, ph] of bands) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, TH);
      for (let x = 0; x <= TW; x += 8) g.lineTo(x, wave(x, y0, k, ph));
      g.lineTo(TW, TH);
      g.closePath();
      g.fill();
      // foam crest + little foam bubbles along it
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 5;
      g.lineJoin = g.lineCap = 'round';
      g.beginPath();
      for (let x = 0; x <= TW; x += 8) g.lineTo(x, wave(x, y0, k, ph) + 1);
      g.stroke();
      g.fillStyle = '#ffffff';
      for (let x = 0; x < TW; x += 22) {
        const c = Math.sin((x / TW) * Math.PI * 2 * k + ph);
        if (c < 0.2) continue; // foam gathers on the troughs' shoulders
        g.beginPath();
        g.arc(x, wave(x, y0, k, ph) + 5, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    // bubbles
    for (let i = 0; i < 26; i++) {
      const x = r() * TW, y = 70 + r() * 150, s = 3 + r() * 7;
      wrapDraw(g, x, (xx) => {
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(xx, y, s, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(xx - s * 0.35, y - s * 0.35, s * 0.28, 0, Math.PI * 2);
        g.fill();
      });
    }
    // two starfish
    for (const [x, y, rot] of [[120, 205, 0.2], [380, 175, -0.3]]) {
      wrapDraw(g, x, (xx) => {
        g.fillStyle = '#ff8a6b';
        g.strokeStyle = '#d9573f';
        g.lineWidth = 2.5;
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = rot + (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 6 : 15;
          g.lineTo(xx + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#ffd0b8';
        g.beginPath();
        g.arc(xx, y, 2.4, 0, Math.PI * 2);
        g.fill();
      });
    }
    return null;
  },

  // ---- Frost: pale ice with a snowy cap, frosty cracks and snowflakes that glint
  frost(g, e, r) {
    vgrad(g, '#ffffff', '#9fdcff');
    const glow = canvas();
    const gg = glow.getContext('2d');
    gg.fillStyle = '#6a9cc0';
    gg.fillRect(0, 0, TW, TH);
    // soft icy facets
    for (let i = 0; i < 18; i++) {
      const x = r() * TW, y = 40 + r() * (TH - 60), s = 18 + r() * 26;
      const pts = [];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + r() * 0.8;
        pts.push([Math.cos(a) * s * (0.6 + r() * 0.5), Math.sin(a) * s * (0.6 + r() * 0.5)]);
      }
      wrapDraw(g, x, (xx) => {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.4)' : 'rgba(150,215,255,0.16)';
        g.beginPath();
        for (const [dx, dy] of pts) g.lineTo(xx + dx, y + dy);
        g.closePath();
        g.fill();
      });
    }
    // frosty cracks: jagged branching lines
    for (let i = 0; i < 7; i++) {
      let x = r() * TW, y = 70 + r() * 150;
      const pts = [[x, y]];
      for (let k = 0; k < 6; k++) {
        x += 8 + r() * 16;
        y += (r() - 0.5) * 30;
        pts.push([x, y]);
      }
      const br = pts.slice(1, -1).filter(() => r() < 0.6).map(([bx, by]) => [[bx, by], [bx + (r() - 0.5) * 18, by + (r() < 0.5 ? -1 : 1) * (10 + r() * 12)]]);
      for (const [w, c] of [[4, 'rgba(70,160,220,0.55)'], [1.6, '#ffffff']]) {
        g.strokeStyle = c;
        g.lineWidth = w;
        g.lineJoin = g.lineCap = 'round';
        for (const dx of [-TW, 0, TW]) {
          g.beginPath();
          pts.forEach(([px, py]) => g.lineTo(px + dx, py));
          g.stroke();
          for (const b of br) {
            g.beginPath();
            b.forEach(([px, py]) => g.lineTo(px + dx, py));
            g.stroke();
          }
        }
      }
    }
    // snowflakes (six arms with little side branches), drawn on the glow map too
    const flake = (ctx, x, y, s, col, w) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.26;
        const cx = Math.cos(a), cy = Math.sin(a);
        ctx.moveTo(x, y);
        ctx.lineTo(x + cx * s, y + cy * s);
        for (const f of [0.55]) {
          const bx = x + cx * s * f, by = y + cy * s * f;
          for (const sgn of [-1, 1]) {
            const b = a + sgn * 0.8;
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(b) * s * 0.36, by + Math.sin(b) * s * 0.36);
          }
        }
      }
      ctx.stroke();
    };
    for (let i = 0; i < 14; i++) {
      const x = (i / 14) * TW + (r() - 0.5) * 20, y = 62 + ((i * 53) % 150) + r() * 12, s = 9 + r() * 9;
      wrapDraw(g, x, (xx) => {
        flake(g, xx, y, s, '#4aa8e0', 5.5);
        flake(g, xx, y, s, '#ffffff', 2.6);
        flake(gg, xx, y, s, '#f0fbff', 3.5);
      });
    }
    // snowy cap with round drips
    g.fillStyle = '#ffffff';
    gg.fillStyle = 'rgba(200,235,255,0.6)';
    for (const ctx of [g, gg]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= TW; x += 4) ctx.lineTo(x, 34 + Math.sin((x / TW) * Math.PI * 12) * 5 + Math.sin((x / TW) * Math.PI * 4 + 1) * 4);
      ctx.lineTo(TW, 0);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 9; i++) {
      const x = ((i + 0.3) / 9) * TW, len = 8 + r() * 14;
      g.fillStyle = '#ffffff';
      wrapDraw(g, x, (xx) => {
        g.fillRect(xx - 5, 30, 10, len);
        g.beginPath();
        g.arc(xx, 30 + len, 5, 0, Math.PI * 2);
        g.fill();
      });
    }
    g.fillStyle = 'rgba(90,170,230,0.35)';
    g.fillRect(0, 0, TW, 3);
    return { glow, k: 0.6 };
  },

  // ---- Candy: pink frosting with sprinkles over a pastel candy-swirl bottom
  candy(g, e, r) {
    g.fillStyle = '#ffe3f1';
    g.fillRect(0, 0, TW, TH);
    // diagonal candy swirl stripes (the period divides the width so it wraps)
    const cols = ['#8fe3ff', '#ffffff', '#ff9ccd', '#ffffff'];
    const P = 32, slope = 0.9;
    for (let i = -Math.ceil((TH * slope) / P) - 2; i < TW / P + 2; i++) {
      const x = i * P;
      g.fillStyle = cols[((i % 4) + 4) % 4];
      g.beginPath();
      g.moveTo(x, TH);
      g.lineTo(x + P, TH);
      g.lineTo(x + P + TH * slope, 0);
      g.lineTo(x + TH * slope, 0);
      g.closePath();
      g.fill();
    }
    // frosting (top) with round drips, a darker rim underneath and a soft shine
    const drip = [];
    for (let i = 0; i < 12; i++) drip.push([((i + r() * 0.5) / 12) * TW, 6 + r() * 16, 10 + r() * 5]);
    const frost = (col, off) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, 0);
      for (let x = 0; x <= TW; x += 4) g.lineTo(x, 98 + off + Math.sin((x / TW) * Math.PI * 10) * 6);
      g.lineTo(TW, 0);
      g.closePath();
      g.fill();
      for (const [x, len, w] of drip) {
        wrapDraw(g, x, (xx) => {
          g.fillRect(xx - w, 96 + off, w * 2, len);
          g.beginPath();
          g.arc(xx, 96 + off + len, w, 0, Math.PI * 2);
          g.fill();
        });
      }
    };
    frost('#e0569a', 4);
    frost('#ff8cc6', 0);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, 10, TW, 10);
    // sprinkles
    const sp = ['#ff4f6d', '#ffd23f', '#4cd964', '#3db8ff', '#b36bff', '#ffffff'];
    for (let i = 0; i < 70; i++) {
      const x = r() * TW, y = 14 + r() * 80, a = r() * Math.PI, c = sp[i % sp.length];
      wrapDraw(g, x, (xx) => {
        g.save();
        g.translate(xx, y);
        g.rotate(a);
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(-6, -2.2);
        g.lineTo(6, -2.2);
        g.arc(6, 0, 2.2, -Math.PI / 2, Math.PI / 2);
        g.lineTo(-6, 2.2);
        g.arc(-6, 0, 2.2, Math.PI / 2, -Math.PI / 2);
        g.fill();
        g.restore();
      });
    }
    return null;
  },

  // ---- Cloud: warm white with golden sun rays from the top, a band of puffy clouds, softly glowing
  cloud(g, e, r) {
    vgrad(g, '#fffdf2', '#fff2c2');
    const glow = canvas();
    const gg = glow.getContext('2d');
    const gl = gg.createLinearGradient(0, 0, 0, TH);
    gl.addColorStop(0, '#c4b890');
    gl.addColorStop(1, '#aaa088');
    gg.fillStyle = gl;
    gg.fillRect(0, 0, TW, TH);
    // sun rays: wedges of constant width (sectors seen from above), fading towards the waist
    const N = 12, w = TW / N;
    for (const [ctx, a0] of [[g, 0.95], [gg, 1]]) {
      for (let i = 0; i < N; i++) {
        const x = i * w;
        const gr = ctx.createLinearGradient(0, 0, 0, 170);
        gr.addColorStop(0, ctx === g ? `rgba(255,176,0,${a0})` : `rgba(255,160,0,${a0})`);
        gr.addColorStop(0.75, `rgba(255,190,30,${a0 * 0.4})`);
        gr.addColorStop(1, 'rgba(255,215,80,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.2, 0);
        ctx.lineTo(x + w * 0.8, 0);
        ctx.lineTo(x + w * 0.62, 170);
        ctx.lineTo(x + w * 0.38, 170);
        ctx.closePath();
        ctx.fill();
      }
      // the sun itself sits on the top of the egg
      ctx.fillStyle = ctx === g ? '#ffd23f' : '#ffe27a';
      ctx.fillRect(0, 0, TW, 12);
    }
    // puffy clouds round the lower half (shadowed undersides), a few little ones higher up
    const cloud = (x, y, s) => {
      const puffs = [[-1.1, 0.2, 0.62], [-0.45, -0.25, 0.8], [0.35, -0.3, 0.9], [1.05, 0.15, 0.62], [0, 0.25, 0.75]];
      wrapDraw(g, x, (xx) => {
        for (const [col, dy] of [['#c6d2ff', 6], ['#ffffff', 0]]) {
          g.fillStyle = col;
          g.beginPath();
          for (const [px, py, pr] of puffs) {
            g.moveTo(xx + px * s + pr * s, y + py * s + dy);
            g.arc(xx + px * s, y + py * s + dy, pr * s, 0, Math.PI * 2);
          }
          g.fill();
        }
      });
      wrapDraw(gg, x, (xx) => {
        gg.fillStyle = '#fffaf0';
        gg.beginPath();
        for (const [px, py, pr] of puffs) {
          gg.moveTo(xx + px * s + pr * s, y + py * s);
          gg.arc(xx + px * s, y + py * s, pr * s, 0, Math.PI * 2);
        }
        gg.fill();
      });
    };
    for (let i = 0; i < 6; i++) cloud(((i + 0.5) / 6) * TW + (r() - 0.5) * 20, 168 + (i % 2) * 22, 20 + r() * 5);
    for (let i = 0; i < 4; i++) cloud(((i + 0.1) / 4) * TW, 118 + r() * 10, 11 + r() * 3);
    // tiny gold sparkles
    for (let i = 0; i < 26; i++) {
      const x = r() * TW, y = 30 + r() * 110, s = 2 + r() * 2.5;
      for (const ctx of [g, gg]) {
        ctx.fillStyle = '#ffc93a';
        ctx.fillRect(x - s * 2.2, y - 0.9, s * 4.4, 1.8);
        ctx.fillRect(x - 0.9, y - s * 2.2, 1.8, s * 4.4);
      }
    }
    return { glow, k: 0.6 };
  },

  // ---- Rainbow (egg drops only): wavy rainbow bands and sparkles, glowing like the galaxy egg
  rainbow(g, e, r) {
    const glow = canvas();
    const gg = glow.getContext('2d');
    const cols = ['#ff3b5c', '#ff8a1c', '#ffd21c', '#3fcf5a', '#1fb2ff', '#5a64ff', '#b44dff'];
    const bh = TH / cols.length;
    const edge = (x, i) => i * bh + Math.sin((x / TW) * Math.PI * 2 * 4 + i * 1.3) * 6;
    cols.forEach((c, i) => {
      for (const [ctx, alpha] of [[g, 1], [gg, 0.3]]) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, i === cols.length - 1 ? TH : edge(0, i + 1));
        for (let x = 0; x <= TW; x += 8) ctx.lineTo(x, i ? edge(x, i) : 0);
        for (let x = TW; x >= 0; x -= 8) ctx.lineTo(x, i === cols.length - 1 ? TH : edge(x, i + 1) + 1);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // a soft shine along the top of each band
      if (i) {
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 3;
        g.beginPath();
        for (let x = 0; x <= TW; x += 8) g.lineTo(x, edge(x, i) + 4);
        g.stroke();
      }
    });
    // sparkles: dots and four-point stars
    for (let i = 0; i < 60; i++) {
      const x = r() * TW, y = 12 + r() * (TH - 24), big = r() < 0.25, s = big ? 3 + r() * 2 : 1.3 + r();
      for (const ctx of [g, gg]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
        if (big) {
          ctx.beginPath();
          ctx.moveTo(x - s * 3.4, y);
          ctx.quadraticCurveTo(x, y, x, y - s * 3.4);
          ctx.quadraticCurveTo(x, y, x + s * 3.4, y);
          ctx.quadraticCurveTo(x, y, x, y + s * 3.4);
          ctx.quadraticCurveTo(x, y, x - s * 3.4, y);
          ctx.fill();
        }
      }
    }
    return { glow, k: 1.0 };
  },
};

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const MATS = {};
/** Shared material for an egg type (map + optional glowing emissive map). userData.glow: the egg has a
 *  painted glow of its own (lava, galaxy, frost, cloud, rainbow). */
export function eggMaterial(eggId) {
  const id = PAINT[eggId] ? eggId : 'garden';
  if (MATS[id]) return MATS[id];
  const c = canvas();
  const res = PAINT[id](c.getContext('2d'), EGG[id], rng(id.length * 7919 + 13));
  const glow = res?.glow || res;
  const map = tex(c);
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.38, metalness: 0 });
  if (glow) {
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveMap = tex(glow);
    m.emissiveIntensity = res.k ?? (id === 'volcano' ? 1.4 : 1.0);
    m.userData.glow = true;
  } else {
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveMap = map;
    m.emissiveIntensity = 0.08;
  }
  MATS[id] = m;
  return m;
}

// ------------------------------------------------------------------ cracks (three stages via alphaTest)

let crackMat = null;
/** Crack overlay: stage 1 shows at alphaTest 0.9, stages 1-2 at 0.55, all three at 0.2. */
export function crackMaterial() {
  if (crackMat) return crackMat;
  const c = canvas();
  const g = c.getContext('2d');
  const r = rng(4242);
  const seamY = (1 - SEAM) * TH;
  // a zigzag walk around the seam, split into three arcs spreading from the front (u = 0)
  const stages = [
    { a: 255, from: -0.1, to: 0.1 },
    { a: 170, from: -0.3, to: 0.3 },
    { a: 85, from: -0.5, to: 0.5 },
  ];
  // each stage is drawn opaque on its own canvas, then laid down at its stage alpha (no alpha build-up)
  const drawZig = (ctx, from, to) => {
    const pts = [];
    const n = Math.max(2, Math.round((to - from) * 40));
    for (let i = 0; i <= n; i++) pts.push([(from + (to - from) * (i / n)) * TW, seamY + (i % 2 ? -9 : 9) + (r() - 0.5) * 6]);
    const br = [];
    for (let i = 1; i < pts.length - 1; i += 3) {
      const [x, y] = pts[i];
      const up = r() < 0.5 ? -1 : 1;
      br.push([[x, y], [x + (r() - 0.5) * 20, y + up * (14 + r() * 16)], [x + (r() - 0.5) * 30, y + up * (28 + r() * 18)]]);
    }
    for (const [w, col] of [[9, '#3c1e0a'], [3.5, '#fff8c8']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineJoin = ctx.lineCap = 'round';
      for (const dx of [0, TW]) {
        ctx.beginPath();
        pts.forEach(([x, y]) => ctx.lineTo(x + dx, y));
        ctx.stroke();
        for (const b2 of br) {
          ctx.beginPath();
          b2.forEach(([x, y]) => ctx.lineTo(x + dx, y));
          ctx.stroke();
        }
      }
    }
  };
  stages.forEach((st, i) => {
    const sc = canvas();
    const sg = sc.getContext('2d');
    if (i === 0) drawZig(sg, st.from, st.to);
    else {
      drawZig(sg, st.from, stages[i - 1].from);
      drawZig(sg, stages[i - 1].to, st.to);
    }
    g.globalAlpha = st.a / 255;
    g.drawImage(sc, 0, 0);
  });
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  crackMat = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.99, transparent: false, toneMapped: false });
  return crackMat;
}

// ------------------------------------------------------------------ public

/** A standing egg (1 unit tall). */
export function createEgg(eggId) {
  const g = new THREE.Group();
  g.name = 'egg:' + eggId;
  const m = new THREE.Mesh(geo('whole'), eggMaterial(eggId));
  g.add(m);
  g.userData.mesh = m;
  return g;
}

/** Everything the hatch sequence animates. */
export function eggParts(eggId) {
  return {
    whole: geo('whole'),
    top: geo('top'),
    bottom: geo('bottom'),
    shard: geo('shard'),
    seamY: (1 - Math.cos(Math.PI * SEAM)) / 2 * H,
    seamR: R * Math.sin(Math.PI * SEAM) * (1 + 0.13 * Math.cos(Math.PI * SEAM)),
    mat: eggMaterial(eggId),
    crack: crackMaterial(),
  };
}

/** Jagged "teeth" around the rim of the bottom half (baked into one geometry per egg type colour). */
export function rimTeeth(seamY, seamR) {
  const key = 'teeth';
  if (GEO[key]) return GEO[key];
  const parts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const t = new THREE.ConeGeometry(0.06, 0.1 + (i % 2) * 0.05, 3);
    t.translate(0, 0.05, 0);
    t.rotateY(a);
    t.translate(Math.sin(a) * seamR * 0.97, seamY, Math.cos(a) * seamR * 0.97);
    parts.push(t);
  }
  // merge by hand (tiny)
  const pos = [];
  const nor = [];
  const uv = [];
  for (const p0 of parts) {
    const p = p0.index ? p0.toNonIndexed() : p0;
    pos.push(...p.attributes.position.array);
    nor.push(...p.attributes.normal.array);
    const u = p.attributes.uv.array;
    for (let i = 0; i < u.length; i += 2) uv.push(u[i] * 0.05, SEAM);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.userData.shared = true;
  GEO[key] = g;
  return g;
}
